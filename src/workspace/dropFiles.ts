export interface WorkspaceDroppedFile {
  file: File;
  path: string;
}

export interface WorkspaceDropContents {
  directories: string[];
  files: WorkspaceDroppedFile[];
}

interface LegacyFileEntry {
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  isDirectory: false;
  isFile: true;
  name: string;
}

interface LegacyDirectoryEntry {
  createReader: () => {
    readEntries: (
      success: (entries: LegacyFileSystemEntry[]) => void,
      failure?: (error: DOMException) => void
    ) => void;
  };
  isDirectory: true;
  isFile: false;
  name: string;
}

type LegacyFileSystemEntry = LegacyFileEntry | LegacyDirectoryEntry;

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => LegacyFileSystemEntry | null;
};

function joinDropPath(parentPath: string | null, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function readFileEntry(entry: LegacyFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(entry: LegacyDirectoryEntry): Promise<LegacyFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: LegacyFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<LegacyFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return entries;
    }

    entries.push(...batch);
  }
}

async function collectEntry(
  entry: LegacyFileSystemEntry,
  parentPath: string | null,
  contents: WorkspaceDropContents
): Promise<void> {
  const path = joinDropPath(parentPath, entry.name);

  if (entry.isFile) {
    contents.files.push({ file: await readFileEntry(entry), path });
    return;
  }

  contents.directories.push(path);
  const children = await readDirectoryEntries(entry);
  await Promise.all(children.map((child) => collectEntry(child, path, contents)));
}

export async function collectWorkspaceDropContents(
  dataTransfer: DataTransfer
): Promise<WorkspaceDropContents> {
  const entries: LegacyFileSystemEntry[] = [];

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") {
      continue;
    }

    const entry = (item as WebkitDataTransferItem).webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry as unknown as LegacyFileSystemEntry);
    }
  }

  if (entries.length === 0) {
    return {
      directories: [],
      files: Array.from(dataTransfer.files).map((file) => ({ file, path: file.name }))
    };
  }

  const contents: WorkspaceDropContents = { directories: [], files: [] };
  await Promise.all(entries.map((entry) => collectEntry(entry, null, contents)));

  return {
    directories: [...new Set(contents.directories)].sort((left, right) =>
      left.localeCompare(right)
    ),
    files: contents.files.sort((left, right) => left.path.localeCompare(right.path))
  };
}
