import type {
  AppSnapshot,
  DiagramAsset,
  GraphAsset,
  WorkspaceTrashEntry
} from "../app/appState";
import type { TyprProjectRepository } from "../project/projectState";
import { getDiagramFilePath } from "../diagram/diagramFiles";
import { serializeDiagramSvg } from "../diagram/DiagramEditor";
import { getGraphFilePath } from "../graph/graphFiles";

export type WorkspaceNodeKind = "file" | "folder";
export type WorkspaceFileBadge =
  | "typ"
  | "tex"
  | "md"
  | "img"
  | "pdf"
  | "json"
  | "yaml"
  | "csv"
  | "config"
  | "git"
  | "info"
  | "bib"
  | "code"
  | "txt"
  | "archive"
  | "bin"
  | "dir"
  | "empty";

export interface WorkspaceFlatEntry {
  path: string;
  kind: WorkspaceNodeKind;
  content?: string | Uint8Array;
  source: WorkspaceSource;
}

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  kind: WorkspaceNodeKind;
  source: WorkspaceSource;
  content?: string | Uint8Array;
  children: WorkspaceTreeNode[];
}

export type WorkspaceSource =
  | { kind: "document"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "diagram"; id: string }
  | { kind: "graph"; id: string }
  | { kind: "trash-item"; id: string; entryKind: WorkspaceTrashEntry["kind"] }
  | { kind: "system-folder"; id: "figures" };

const TEXT_FILE_EXTENSIONS = new Set([
  "typ",
  "tex",
  "ltx",
  "latex",
  "sty",
  "cls",
  "bib",
  "markdown",
  "txt",
  "md",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv"
]);
const TEXT_FILE_NAMES = new Set([".gitignore"]);
const README_FILE_NAMES = new Set([
  "readme",
  "readme.md",
  "readme.markdown",
  "readme.txt"
]);
const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
const TEX_FILE_EXTENSIONS = new Set(["tex", "ltx", "latex", "sty", "cls"]);
const MARKDOWN_FILE_EXTENSIONS = new Set(["md", "markdown"]);
const JSON_FILE_EXTENSIONS = new Set(["json", "jsonc"]);
const YAML_FILE_EXTENSIONS = new Set(["yaml", "yml"]);
const CSV_FILE_EXTENSIONS = new Set(["csv", "tsv"]);
const CONFIG_FILE_EXTENSIONS = new Set(["toml", "ini", "env", "lock"]);
const ARCHIVE_FILE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "gz",
  "rar",
  "tar",
  "tgz",
  "xz",
  "zip"
]);
const CONFIG_FILE_NAMES = new Set([
  ".editorconfig",
  ".env",
  ".gitignore",
  ".npmrc",
  "dockerfile",
  "makefile",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.ts"
]);
const CODE_FILE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "tsx",
  "ts",
  "xml"
]);

export function normalizeWorkspacePath(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function buildProjectWorkspaceEntries(snapshot: AppSnapshot): WorkspaceFlatEntry[] {
  const entries = new Map<string, WorkspaceFlatEntry>();
  const addEntry = (entry: WorkspaceFlatEntry) => {
    const normalizedPath = normalizeWorkspacePath(entry.path);

    if (!normalizedPath) {
      return;
    }

    entries.set(normalizedPath, {
      ...entry,
      path: normalizedPath
    });
  };

  for (const document of snapshot.project.documents) {
    addEntry({
      path: document.name,
      kind: "file",
      content: document.content,
      source: {
        kind: "document",
        id: document.id
      }
    });
  }

  for (const folder of snapshot.project.folders ?? []) {
    addEntry({
      path: folder.name,
      kind: "folder",
      source: {
        kind: "folder",
        id: folder.id
      }
    });
  }

  const savedFigures = snapshot.project.figures ?? [];
  const savedGraphs = snapshot.project.graphs ?? [];

  if (savedFigures.length > 0 || savedGraphs.length > 0) {
    addEntry({
      path: "figures",
      kind: "folder",
      source: {
        kind: "system-folder",
        id: "figures"
      }
    });
  }

  for (const figure of savedFigures) {
    addEntry(createDiagramWorkspaceEntry(figure));
  }

  for (const graph of savedGraphs) {
    addEntry(createGraphWorkspaceEntry(graph));
  }

  return [...entries.values()];
}

export function buildProjectWorkspaceEntriesFromProject(
  project: TyprProjectRepository
): WorkspaceFlatEntry[] {
  return Object.values(project.filesystem.entries)
    .map((entry): WorkspaceFlatEntry => ({
      path: entry.path,
      kind: entry.kind,
      content: entry.kind === "file" ? entry.content : undefined,
      source: toWorkspaceSource(entry.source)
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function buildTrashWorkspaceEntries(trashEntries: WorkspaceTrashEntry[]): WorkspaceFlatEntry[] {
  return trashEntries.map(createTrashWorkspaceEntry);
}

export function buildWorkspaceTree(entries: WorkspaceFlatEntry[]): WorkspaceTreeNode[] {
  const root = new Map<string, MutableWorkspaceNode>();

  for (const entry of entries) {
    const normalizedPath = normalizeWorkspacePath(entry.path);

    if (!normalizedPath) {
      continue;
    }

    const segments = normalizedPath.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      const existing = currentLevel.get(segment);
      const nextKind: WorkspaceNodeKind = isLeaf ? entry.kind : "folder";
      const node =
        existing ??
        ({
          path: currentPath,
          name: segment,
          kind: nextKind,
          source: isLeaf
            ? entry.source
            : {
                kind: "folder",
                id: `virtual:${currentPath}`
              },
          children: new Map<string, MutableWorkspaceNode>()
        } satisfies MutableWorkspaceNode);

        node.kind = nextKind === "folder" ? "folder" : node.kind;
        if (isLeaf) {
          node.source = entry.source;
          node.content = entry.content;
        }
        currentLevel.set(segment, node);
        currentLevel = node.children;
      }
  }

  return sortWorkspaceNodes(convertWorkspaceNodes(root));
}

export function findWorkspaceNodeByPath(
  nodes: WorkspaceTreeNode[],
  path: string
): WorkspaceTreeNode | null {
  const normalizedPath = normalizeWorkspacePath(path);

  for (const node of nodes) {
    if (node.path === normalizedPath) {
      return node;
    }

    const nested = findWorkspaceNodeByPath(node.children, normalizedPath);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function flattenVisibleWorkspaceNodes(
  nodes: WorkspaceTreeNode[],
  collapsedPaths: Record<string, boolean>
): WorkspaceTreeNode[] {
  const result: WorkspaceTreeNode[] = [];

  for (const node of nodes) {
    result.push(node);

    if (node.kind === "folder" && !(collapsedPaths[node.path] ?? false)) {
      result.push(...flattenVisibleWorkspaceNodes(node.children, collapsedPaths));
    }
  }

  return result;
}

export function canEditWorkspaceFile(path: string): boolean {
  return isTextWorkspaceFile(path);
}

export function canRenameWorkspaceNode(node: WorkspaceTreeNode): boolean {
  return (
    node.source.kind === "document" ||
    (node.source.kind === "folder" && !node.source.id.startsWith("virtual:")) ||
    node.source.kind === "diagram" ||
    node.source.kind === "graph"
  );
}

export function canDeleteWorkspaceNode(node: WorkspaceTreeNode): boolean {
  return (
    node.source.kind === "document" ||
    (node.source.kind === "folder" && !node.source.id.startsWith("virtual:")) ||
    node.source.kind === "diagram" ||
    node.source.kind === "graph" ||
    node.source.kind === "trash-item"
  );
}

export function canMoveWorkspaceNode(node: WorkspaceTreeNode): boolean {
  return (
    node.source.kind === "document" ||
    (node.source.kind === "folder" && !node.source.id.startsWith("virtual:")) ||
    node.source.kind === "diagram" ||
    node.source.kind === "graph"
  );
}

export function isTextWorkspaceFile(path: string): boolean {
  const fileName = normalizeWorkspacePath(path).split("/").at(-1)?.toLowerCase() ?? "";
  if (TEXT_FILE_NAMES.has(fileName)) {
    return true;
  }

  const extension = getWorkspacePathExtension(path);
  return extension !== null && TEXT_FILE_EXTENSIONS.has(extension);
}

export function getWorkspaceNodeBadge(node: WorkspaceTreeNode): WorkspaceFileBadge {
  if (node.kind === "folder") {
    return node.children.length === 0 ? "empty" : "dir";
  }

  const fileName = normalizeWorkspacePath(node.path).split("/").at(-1)?.toLowerCase() ?? "";
  const extension = getWorkspacePathExtension(node.path);

  if (fileName === ".gitignore") {
    return "git";
  }

  if (README_FILE_NAMES.has(fileName)) {
    return "info";
  }

  if (CONFIG_FILE_NAMES.has(fileName)) {
    return "config";
  }

  if (extension === "typ") {
    return "typ";
  }

  if (extension !== null && TEX_FILE_EXTENSIONS.has(extension)) {
    return "tex";
  }

  if (extension === "bib") {
    return "bib";
  }

  if (extension !== null && MARKDOWN_FILE_EXTENSIONS.has(extension)) {
    return "md";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  if (extension !== null && IMAGE_FILE_EXTENSIONS.has(extension)) {
    return "img";
  }

  if (extension !== null && JSON_FILE_EXTENSIONS.has(extension)) {
    return "json";
  }

  if (extension !== null && YAML_FILE_EXTENSIONS.has(extension)) {
    return "yaml";
  }

  if (extension !== null && CSV_FILE_EXTENSIONS.has(extension)) {
    return "csv";
  }

  if (extension !== null && CONFIG_FILE_EXTENSIONS.has(extension)) {
    return "config";
  }

  if (extension !== null && CODE_FILE_EXTENSIONS.has(extension)) {
    return "code";
  }

  if (extension !== null && ARCHIVE_FILE_EXTENSIONS.has(extension)) {
    return "archive";
  }

  if (extension !== null && TEXT_FILE_EXTENSIONS.has(extension)) {
    return "txt";
  }

  return "bin";
}

export function getWorkspacePathExtension(path: string): string | null {
  const fileName = normalizeWorkspacePath(path).split("/").at(-1) ?? "";
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) : null;
  return extension?.toLowerCase() ?? null;
}

interface MutableWorkspaceNode {
  path: string;
  name: string;
  kind: WorkspaceNodeKind;
  source: WorkspaceSource;
  content?: string | Uint8Array;
  children: Map<string, MutableWorkspaceNode>;
}

function createDiagramWorkspaceEntry(figure: DiagramAsset): WorkspaceFlatEntry {
  return {
    path: getDiagramFilePath(figure.name),
    kind: "file",
    content: serializeDiagramSvg(figure),
    source: {
      kind: "diagram",
      id: figure.id
    }
  };
}

function createGraphWorkspaceEntry(graph: GraphAsset): WorkspaceFlatEntry {
  return {
    path: getGraphFilePath(graph.name),
    kind: "file",
    content: new Uint8Array(graph.content),
    source: {
      kind: "graph",
      id: graph.id
    }
  };
}

function createTrashWorkspaceEntry(entry: WorkspaceTrashEntry): WorkspaceFlatEntry {
  const path = normalizeWorkspacePath(entry.originalPath);

  if (entry.kind === "document") {
    return {
      path,
      kind: "file",
      content: entry.document.content,
      source: {
        kind: "trash-item",
        id: entry.id,
        entryKind: entry.kind
      }
    };
  }

  if (entry.kind === "folder") {
    return {
      path,
      kind: "folder",
      source: {
        kind: "trash-item",
        id: entry.id,
        entryKind: entry.kind
      }
    };
  }

  if (entry.kind === "diagram") {
    return {
      path,
      kind: "file",
      content: serializeDiagramSvg(entry.diagram),
      source: {
        kind: "trash-item",
        id: entry.id,
        entryKind: entry.kind
      }
    };
  }

  return {
    path,
    kind: "file",
    content: new Uint8Array(entry.graph.content),
    source: {
      kind: "trash-item",
      id: entry.id,
      entryKind: entry.kind
    }
  };
}

function convertWorkspaceNodes(
  entries: Map<string, MutableWorkspaceNode>
): WorkspaceTreeNode[] {
  return [...entries.values()].map((entry) => ({
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    source: entry.source,
    children: convertWorkspaceNodes(entry.children)
  }));
}

function sortWorkspaceNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortWorkspaceNodes(node.children)
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });
}

function toWorkspaceSource(
  source: TyprProjectRepository["filesystem"]["entries"][string]["source"]
): WorkspaceSource {
  if (source.kind === "virtual") {
    if (source.id === "figures") {
      return {
        kind: "system-folder",
        id: "figures"
      };
    }

    return {
      kind: "folder",
      id: `virtual:${source.id}`
    };
  }

  return source;
}
