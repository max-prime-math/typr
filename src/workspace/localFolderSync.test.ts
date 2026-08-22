import { describe, expect, it } from "vitest";
import { createEmptyProjectRepository, writeProjectFile } from "../project/projectState";
import {
  applySyncTreeToProject,
  createProjectSyncTree,
  getLocalFolderDirectoryFingerprint,
  LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT,
  readLocalFolderDirectory,
  resolveSyncTrees,
  resolveSyncTreesStrict,
  shouldSyncLocalFolderGitFile,
  updateProjectGitMetadataFromTree,
  writeLocalFolderDirectory,
  type LocalFolderSyncEntry,
  type LocalFolderSyncTree
} from "./localFolderSync";

function file(
  path: string,
  content: string,
  modifiedAt = 0
): LocalFolderSyncEntry {
  return {
    kind: "file",
    path,
    bytes: new TextEncoder().encode(content),
    modifiedAt
  };
}

function tree(...entries: LocalFolderSyncEntry[]): LocalFolderSyncTree {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function text(entry: LocalFolderSyncEntry | undefined): string | null {
  return entry?.bytes ? new TextDecoder().decode(entry.bytes) : null;
}

class MemoryFileHandle {
  readonly kind = "file" as const;
  modifiedAt = 1;

  constructor(
    readonly name: string,
    private content: Uint8Array
  ) {}

  async getFile(): Promise<File> {
    const content = this.content;
    return {
      lastModified: this.modifiedAt,
      size: content.byteLength,
      arrayBuffer: async () =>
        content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength
        )
    } as File;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (value: FileSystemWriteChunkType) => {
        if (!(value instanceof ArrayBuffer)) {
          throw new Error("Memory test filesystem only accepts ArrayBuffer writes.");
        }
        this.content = new Uint8Array(value);
        this.modifiedAt += 1;
      },
      close: async () => undefined,
      abort: async () => undefined
    } as FileSystemWritableFileStream;
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory" as const;
  private readonly children = new Map<
    string,
    MemoryDirectoryHandle | MemoryFileHandle
  >();

  constructor(readonly name: string) {}

  async *entries(): AsyncIterable<
    [string, MemoryDirectoryHandle | MemoryFileHandle]
  > {
    yield* this.children.entries();
  }

  async getDirectoryHandle(
    name: string,
    options: FileSystemGetDirectoryOptions = {}
  ): Promise<FileSystemDirectoryHandle> {
    const current = this.children.get(name);
    if (current instanceof MemoryDirectoryHandle) {
      return current as unknown as FileSystemDirectoryHandle;
    }
    if (current || !options.create) {
      throw new DOMException("Directory not found.", "NotFoundError");
    }
    const directory = new MemoryDirectoryHandle(name);
    this.children.set(name, directory);
    return directory as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(
    name: string,
    options: FileSystemGetFileOptions = {}
  ): Promise<FileSystemFileHandle> {
    const current = this.children.get(name);
    if (current instanceof MemoryFileHandle) {
      return current as unknown as FileSystemFileHandle;
    }
    if (current || !options.create) {
      throw new DOMException("File not found.", "NotFoundError");
    }
    const fileHandle = new MemoryFileHandle(name, new Uint8Array());
    this.children.set(name, fileHandle);
    return fileHandle as unknown as FileSystemFileHandle;
  }

  async removeEntry(
    name: string,
    options: FileSystemRemoveOptions = {}
  ): Promise<void> {
    const current = this.children.get(name);
    if (!current) {
      throw new DOMException("Entry not found.", "NotFoundError");
    }
    if (
      current instanceof MemoryDirectoryHandle &&
      !options.recursive &&
      current.children.size > 0
    ) {
      throw new DOMException("Directory is not empty.", "InvalidModificationError");
    }
    this.children.delete(name);
  }

  async seedFile(path: string, content: string): Promise<void> {
    const segments = path.split("/");
    const name = segments.pop() as string;
    let parent: MemoryDirectoryHandle = this;
    for (const segment of segments) {
      parent = (await parent.getDirectoryHandle(segment, {
        create: true
      })) as unknown as MemoryDirectoryHandle;
    }
    parent.children.set(
      name,
      new MemoryFileHandle(name, new TextEncoder().encode(content))
    );
  }
}

describe("local folder sync reconciliation", () => {
  it("leaves oversized Git storage files on disk instead of mirroring them into browser memory", () => {
    expect(shouldSyncLocalFolderGitFile(LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT)).toBe(true);
    expect(shouldSyncLocalFolderGitFile(LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT + 1)).toBe(false);
  });

  it("merges both sides on first link and lets the folder win same-path conflicts", () => {
    const largeBinary = file("large.pdf", "binary");
    const result = resolveSyncTrees({
      baseline: {},
      browser: tree(
        file("browser.typ", "browser only"),
        file("shared.typ", "browser")
      ),
      local: tree(
        file("folder.typ", "folder only"),
        largeBinary,
        file("shared.typ", "folder")
      )
    });

    expect([...result.desired.keys()].sort()).toEqual([
      "browser.typ",
      "folder.typ",
      "large.pdf",
      "shared.typ"
    ]);
    expect(text(result.desired.get("shared.typ"))).toBe("folder");
    expect(result.desired.get("large.pdf")?.bytes).toBe(largeBinary.bytes);
  });

  it("propagates a one-sided browser edit and a one-sided folder deletion", () => {
    const baselineTree = tree(
      file("edited.typ", "old"),
      file("deleted.typ", "old")
    );
    const baseline = resolveSyncTrees({
      baseline: {},
      browser: baselineTree,
      local: baselineTree
    }).signatures;
    const result = resolveSyncTrees({
      baseline,
      browser: tree(
        file("edited.typ", "new"),
        file("deleted.typ", "old")
      ),
      local: tree(file("edited.typ", "old"))
    });

    expect(text(result.desired.get("edited.typ"))).toBe("new");
    expect(result.desired.has("deleted.typ")).toBe(false);
  });

  it("keeps an edit when it races a deletion", () => {
    const original = tree(file("main.typ", "old"));
    const baseline = resolveSyncTrees({
      baseline: {},
      browser: original,
      local: original
    }).signatures;

    const result = resolveSyncTrees({
      baseline,
      browser: tree(),
      local: tree(file("main.typ", "edited", 10))
    });

    expect(text(result.desired.get("main.typ"))).toBe("edited");
  });

  it("reports a same-path two-sided edit instead of trusting unrelated clocks", () => {
    const original = tree(file("main.typ", "old"));
    const baseline = resolveSyncTrees({ baseline: {}, browser: original, local: original }).signatures;

    const result = resolveSyncTreesStrict({
      baseline,
      browser: tree(file("main.typ", "browser edit", 10_000)),
      local: tree(file("main.typ", "workspace edit", 1))
    });

    expect(result).toEqual({ ok: false, conflicts: ["main.typ"] });
  });

  it("keeps first-link workspace-wins behavior explicit in strict mode", () => {
    const result = resolveSyncTreesStrict({
      baseline: {},
      browser: tree(file("shared.typ", "browser"), file("browser.typ", "browser only")),
      local: tree(file("shared.typ", "workspace"), file("workspace.typ", "workspace only"))
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(text(result.desired.get("shared.typ"))).toBe("workspace");
    expect([...result.desired.keys()].sort()).toEqual(["browser.typ", "shared.typ", "workspace.typ"]);
  });

  it("reports structural file-folder conflicts even on first link", () => {
    const result = resolveSyncTreesStrict({
      baseline: {},
      browser: tree(file("chapter/main.typ", "browser")),
      local: tree(file("chapter", "workspace file"))
    });

    expect(result).toEqual({ ok: false, conflicts: ["chapter"] });
  });

  it("does not overwrite an editor change made while folder I/O was in flight", () => {
    let project = createEmptyProjectRepository({
      displayName: "Concurrent",
      defaultFileName: "main.typ",
      defaultContent: "started"
    });
    const startedTree = createProjectSyncTree(project);
    const desired = new Map(startedTree);
    desired.set("main.typ", file("main.typ", "folder edit", 20));
    project = writeProjectFile(project, "main.typ", "new editor edit");

    const synced = applySyncTreeToProject(project, startedTree, desired);
    const main = synced.filesystem.entries["main.typ"];

    expect(main?.kind).toBe("file");
    expect(main?.kind === "file" ? main.content : null).toBe("new editor edit");
  });

  it("does not remove a folder around a concurrently edited child", () => {
    let project = createEmptyProjectRepository({
      displayName: "Concurrent folder",
      defaultFileName: "chapter/main.typ",
      defaultContent: "started"
    });
    project = writeProjectFile(project, "chapter/notes.txt", "notes");
    const startedTree = createProjectSyncTree(project);
    const desired = new Map(startedTree);
    desired.delete("chapter");
    desired.delete("chapter/main.typ");
    desired.delete("chapter/notes.txt");
    project = writeProjectFile(project, "chapter/main.typ", "new editor edit");

    const synced = applySyncTreeToProject(project, startedTree, desired);
    const main = synced.filesystem.entries["chapter/main.typ"];

    expect(main?.kind === "file" ? main.content : null).toBe("new editor edit");
    expect(createProjectSyncTree(synced).get("chapter")?.kind).toBe("folder");
  });

  it("reads and writes the worktree and hidden git tree separately", async () => {
    const root = new MemoryDirectoryHandle("linked-project");
    await root.seedFile("main.typ", "local");
    await root.seedFile("assets/notes.txt", "notes");
    await root.seedFile(".git/HEAD", "ref: refs/heads/main\n");
    const handle = root as unknown as FileSystemDirectoryHandle;
    const initialFingerprint = await getLocalFolderDirectoryFingerprint(handle);
    const initial = await readLocalFolderDirectory(handle);

    expect(text(initial.worktree.get("main.typ"))).toBe("local");
    expect(text(initial.worktree.get("assets/notes.txt"))).toBe("notes");
    expect(initial.worktree.has(".git/HEAD")).toBe(false);
    expect(text(initial.git.get("HEAD"))).toBe("ref: refs/heads/main\n");

    const desiredWorktree = tree(
      file("main.typ", "browser"),
      file("new/readme.md", "new")
    );
    const desiredGit = tree(
      file("HEAD", "ref: refs/heads/feature\n"),
      file("config", "[core]\n")
    );
    await writeLocalFolderDirectory(
      handle,
      initial,
      desiredWorktree,
      desiredGit
    );
    const updated = await readLocalFolderDirectory(handle);
    const updatedFingerprint = await getLocalFolderDirectoryFingerprint(handle);

    expect(updatedFingerprint).not.toBe(initialFingerprint);
    expect([...updated.worktree.keys()].sort()).toEqual([
      "main.typ",
      "new",
      "new/readme.md"
    ]);
    expect(text(updated.worktree.get("main.typ"))).toBe("browser");
    expect(text(updated.git.get("HEAD"))).toBe("ref: refs/heads/feature\n");
    expect(text(updated.git.get("config"))).toBe("[core]\n");
  });

  it("updates project git metadata from a synchronized HEAD", () => {
    const project = createEmptyProjectRepository({
      displayName: "Git project",
      defaultFileName: null
    });
    const updated = updateProjectGitMetadataFromTree(
      project,
      tree(file("HEAD", "ref: refs/heads/feature/local\n"))
    );

    expect(updated.git.status).toBe("ready");
    expect(updated.git.headRef).toBe("refs/heads/feature/local");
    expect(updated.git.defaultBranch).toBe("feature/local");
    expect(updated.git.initializedAt).toBeTruthy();
  });
});
