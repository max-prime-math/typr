import {
  getSyncTreeSignatures,
  type LocalFolderSyncEntry,
  type LocalFolderSyncTree
} from "../workspace/localFolderSync";
import type { CloudProjectRemote } from "./cloudSync";

const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const BINARY_MIME_TYPE = "application/octet-stream";

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  appProperties?: Record<string, string>;
  modifiedTime?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
}

interface GoogleDriveFileList {
  files?: GoogleDriveFile[];
  nextPageToken?: string;
}

interface GoogleDriveTreeMetadata {
  entries: Map<string, GoogleDriveFile>;
}

type GoogleDriveFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const defaultGoogleDriveFetch: GoogleDriveFetch = (input, init) =>
  fetch(input, init);

export interface GoogleDriveProjectFolder {
  id: string;
  name: string;
  parents: string[];
  webViewLink: string;
}

export interface GoogleDriveFolderMetadata {
  id: string;
  name: string;
  parents: string[];
  webViewLink: string;
}

export class GoogleDriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GoogleDriveApiError";
  }
}

export class GoogleDriveProjectRemote implements CloudProjectRemote {
  readonly providerId = "google-drive" as const;
  private readonly metadataByRootId = new Map<
    string,
    GoogleDriveTreeMetadata
  >();

  constructor(
    private readonly accessToken: string,
    private readonly request: GoogleDriveFetch = defaultGoogleDriveFetch
  ) {}

  async getFolderMetadata(folderId: string): Promise<GoogleDriveFolderMetadata> {
    const folder = await this.getFile(folderId);
    if (folder.mimeType !== DRIVE_FOLDER_MIME_TYPE || folder.trashed) {
      throw new Error(
        "The selected Google Drive destination is not an available folder."
      );
    }
    return toFolderMetadata(folder);
  }

  async findOrCreateManagedProjectFolder(options: {
    parentId: string;
    projectId: string;
    projectName: string;
  }): Promise<GoogleDriveProjectFolder> {
    const query = [
      `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
      "trashed = false",
      `'${escapeDriveQueryValue(options.parentId)}' in parents`,
      `appProperties has { key='typrKind' and value='project' }`,
      `appProperties has { key='typrProjectId' and value='${escapeDriveQueryValue(
        options.projectId
      )}' }`,
      `appProperties has { key='typrSchema' and value='2' }`
    ].join(" and ");
    const existing = await this.listFiles({
      orderBy: "modifiedTime desc",
      q: query
    });
    const matchingFolder = existing[0];
    if (matchingFolder) {
      return toProjectFolder(matchingFolder, options.parentId);
    }

    const folder = await this.createMetadata({
      name: options.projectName.trim() || "Untitled project",
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [options.parentId],
      appProperties: {
        typrKind: "project",
        typrProjectId: options.projectId,
        typrSchema: "2"
      }
    });
    return toProjectFolder(folder, options.parentId);
  }

  async verifyManagedProjectFolder(options: {
    folderId: string;
    parentId: string;
    projectId: string;
  }): Promise<GoogleDriveProjectFolder> {
    const folder = await this.getFile(options.folderId);
    if (
      folder.mimeType !== DRIVE_FOLDER_MIME_TYPE ||
      folder.trashed ||
      !folder.parents?.includes(options.parentId) ||
      folder.appProperties?.typrKind !== "project" ||
      folder.appProperties?.typrProjectId !== options.projectId ||
      folder.appProperties?.typrSchema !== "2"
    ) {
      throw new Error(
        "Typr refused to sync because the Drive folder is not the managed folder selected for this project."
      );
    }
    return toProjectFolder(folder, options.parentId);
  }

  async readTree(remoteRootId: string): Promise<LocalFolderSyncTree> {
    const tree: LocalFolderSyncTree = new Map();
    const entries = new Map<string, GoogleDriveFile>();
    const pendingFolders: Array<{ id: string; path: string }> = [
      { id: remoteRootId, path: "" }
    ];

    while (pendingFolders.length > 0) {
      const folder = pendingFolders.shift() as {
        id: string;
        path: string;
      };
      const children = await this.listFiles({
        q: `'${escapeDriveQueryValue(folder.id)}' in parents and trashed = false`,
        orderBy: "folder,name"
      });

      for (const child of children) {
        if (!isSafeRemoteName(child.name)) {
          throw new Error(
            `Google Drive item “${child.name}” has a name Typr cannot map to a project path.`
          );
        }
        const path = folder.path
          ? `${folder.path}/${child.name}`
          : child.name;
        if (!isSafeRemotePath(path)) {
          continue;
        }
        if (entries.has(path)) {
          throw new Error(
            `Google Drive contains more than one item at “${path}”. Rename or remove the duplicate before syncing.`
          );
        }

        entries.set(path, child);
        const modifiedAt = Date.parse(child.modifiedTime ?? "") || 0;
        if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) {
          tree.set(path, {
            kind: "folder",
            path,
            modifiedAt
          });
          pendingFolders.push({ id: child.id, path });
          continue;
        }
        if (child.mimeType.startsWith("application/vnd.google-apps.")) {
          throw new Error(
            `Google-native file “${path}” cannot be synchronized as a project file.`
          );
        }

        tree.set(path, {
          kind: "file",
          path,
          bytes: await this.downloadFile(child.id),
          modifiedAt
        });
      }
    }

    this.metadataByRootId.set(remoteRootId, { entries });
    return tree;
  }

  async writeTree(
    remoteRootId: string,
    currentTree: LocalFolderSyncTree,
    desiredTree: LocalFolderSyncTree
  ): Promise<void> {
    const metadata = this.metadataByRootId.get(remoteRootId);
    if (!metadata) {
      throw new Error("Google Drive must be read before it can be updated.");
    }

    const currentSignatures = getSyncTreeSignatures(currentTree);
    const desiredSignatures = getSyncTreeSignatures(desiredTree);
    const remoteEntries = new Map(metadata.entries);

    for (const path of [...currentTree.keys()].sort(byDescendingPathDepth)) {
      const currentEntry = currentTree.get(path);
      const desiredEntry = desiredTree.get(path);
      if (desiredEntry && desiredEntry.kind === currentEntry?.kind) {
        continue;
      }

      const remoteFile = remoteEntries.get(path);
      if (remoteFile) {
        await this.trashFile(remoteFile.id);
        remoteEntries.delete(path);
      }
    }

    for (const [path, desiredEntry] of [...desiredTree.entries()].sort(
      byAscendingPathDepth
    )) {
      let remoteFile = remoteEntries.get(path);
      if (remoteFile && getDriveEntryKind(remoteFile) !== desiredEntry.kind) {
        await this.trashFile(remoteFile.id);
        remoteEntries.delete(path);
        remoteFile = undefined;
      }

      if (!remoteFile) {
        const parentId = getRemoteParentId(path, remoteRootId, remoteEntries);
        const name = getBaseName(path);
        const created =
          desiredEntry.kind === "folder"
            ? await this.createMetadata({
                name,
                mimeType: DRIVE_FOLDER_MIME_TYPE,
                parents: [parentId],
                appProperties: {
                  typrKind: "entry",
                  typrRootId: remoteRootId,
                  typrSchema: "2"
                }
              })
            : await this.createFile({
                name,
                parentId,
                bytes: desiredEntry.bytes ?? new Uint8Array(),
                rootId: remoteRootId
              });
        remoteEntries.set(path, created);
        continue;
      }

      if (
        desiredEntry.kind === "file" &&
        currentSignatures[path] !== desiredSignatures[path]
      ) {
        await this.updateFileContent(
          remoteFile.id,
          desiredEntry.bytes ?? new Uint8Array()
        );
      }
    }

    this.metadataByRootId.set(remoteRootId, { entries: remoteEntries });
  }

  private async listFiles(options: {
    q: string;
    orderBy?: string;
  }): Promise<GoogleDriveFile[]> {
    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${DRIVE_API_ROOT}/files`);
      url.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,modifiedTime,parents,trashed,webViewLink,appProperties)"
      );
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("spaces", "drive");
      url.searchParams.set("q", options.q);
      if (options.orderBy) {
        url.searchParams.set("orderBy", options.orderBy);
      }
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await this.authorizedFetch(url);
      const page = (await response.json()) as GoogleDriveFileList;
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    return files;
  }

  private async getFile(fileId: string): Promise<GoogleDriveFile> {
    const url = new URL(
      `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}`
    );
    url.searchParams.set(
      "fields",
      "id,name,mimeType,modifiedTime,parents,trashed,webViewLink,appProperties"
    );
    const response = await this.authorizedFetch(url);
    return (await response.json()) as GoogleDriveFile;
  }

  private async downloadFile(fileId: string): Promise<Uint8Array> {
    const url = new URL(
      `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}`
    );
    url.searchParams.set("alt", "media");
    const response = await this.authorizedFetch(url);
    return new Uint8Array(await response.arrayBuffer());
  }

  private async createMetadata(metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties?: Record<string, string>;
  }): Promise<GoogleDriveFile> {
    const url = new URL(`${DRIVE_API_ROOT}/files`);
    url.searchParams.set(
      "fields",
      "id,name,mimeType,modifiedTime,parents,trashed,webViewLink,appProperties"
    );
    const response = await this.authorizedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(metadata)
    });
    return (await response.json()) as GoogleDriveFile;
  }

  private async createFile(options: {
    name: string;
    parentId: string;
    bytes: Uint8Array;
    rootId: string;
  }): Promise<GoogleDriveFile> {
    const boundary = `typr-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: options.name,
      mimeType: BINARY_MIME_TYPE,
      parents: [options.parentId],
      appProperties: {
        typrKind: "entry",
        typrRootId: options.rootId,
        typrSchema: "2"
      }
    });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      metadata,
      `\r\n--${boundary}\r\nContent-Type: ${BINARY_MIME_TYPE}\r\n\r\n`,
      toArrayBuffer(options.bytes),
      `\r\n--${boundary}--`
    ]);
    const url = new URL(`${DRIVE_UPLOAD_ROOT}/files`);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set(
      "fields",
      "id,name,mimeType,modifiedTime,parents,trashed,webViewLink,appProperties"
    );
    const response = await this.authorizedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    });
    return (await response.json()) as GoogleDriveFile;
  }

  private async updateFileContent(
    fileId: string,
    bytes: Uint8Array
  ): Promise<void> {
    const url = new URL(
      `${DRIVE_UPLOAD_ROOT}/files/${encodeURIComponent(fileId)}`
    );
    url.searchParams.set("uploadType", "media");
    await this.authorizedFetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": BINARY_MIME_TYPE
      },
      body: toArrayBuffer(bytes)
    });
  }

  private async trashFile(fileId: string): Promise<void> {
    await this.authorizedFetch(
      `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ trashed: true })
      }
    );
  }

  private async authorizedFetch(
    input: string | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    const response = await this.request(input, {
      ...init,
      headers
    });
    if (response.ok) {
      return response;
    }

    let message = `Google Drive request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (payload.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // Use the status-based message when Drive did not return JSON.
    }
    throw new GoogleDriveApiError(message, response.status);
  }
}

function getRemoteParentId(
  path: string,
  rootId: string,
  entries: ReadonlyMap<string, GoogleDriveFile>
): string {
  const parentPath = path.split("/").slice(0, -1).join("/");
  if (!parentPath) {
    return rootId;
  }
  const parent = entries.get(parentPath);
  if (!parent || parent.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
    throw new Error(`Google Drive parent folder “${parentPath}” is missing.`);
  }
  return parent.id;
}

function toFolderMetadata(
  folder: GoogleDriveFile
): GoogleDriveFolderMetadata {
  return {
    id: folder.id,
    name: folder.name,
    parents: folder.parents ?? [],
    webViewLink: getFolderWebViewLink(folder)
  };
}

function toProjectFolder(
  folder: GoogleDriveFile,
  parentId: string
): GoogleDriveProjectFolder {
  return {
    ...toFolderMetadata(folder),
    parents: folder.parents?.includes(parentId)
      ? folder.parents
      : [parentId]
  };
}

function getFolderWebViewLink(folder: GoogleDriveFile): string {
  if (folder.webViewLink) {
    try {
      const url = new URL(folder.webViewLink);
      if (url.protocol === "https:" && url.hostname === "drive.google.com") {
        return url.href;
      }
    } catch {
      // Fall back to Drive's stable folder URL.
    }
  }
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`;
}

function getDriveEntryKind(file: GoogleDriveFile): LocalFolderSyncEntry["kind"] {
  return file.mimeType === DRIVE_FOLDER_MIME_TYPE ? "folder" : "file";
}

function getBaseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function isSafeRemotePath(path: string): boolean {
  const segments = path.split("/");
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.endsWith("/") &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\")
    )
  );
}

function isSafeRemoteName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function byDescendingPathDepth(left: string, right: string): number {
  return (
    right.split("/").length - left.split("/").length ||
    right.localeCompare(left)
  );
}

function byAscendingPathDepth(
  [leftPath, leftEntry]: [string, LocalFolderSyncEntry],
  [rightPath, rightEntry]: [string, LocalFolderSyncEntry]
): number {
  return (
    leftPath.split("/").length - rightPath.split("/").length ||
    (leftEntry.kind === rightEntry.kind
      ? leftPath.localeCompare(rightPath)
      : leftEntry.kind === "folder"
        ? -1
        : 1)
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
