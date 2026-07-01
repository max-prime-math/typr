import type {
  AppSnapshot,
  DiagramAsset,
  FileFolder,
  GraphAsset,
  TypstDocumentFile,
  TypstProject
} from "../app/appState";
import { createDefaultDiagram, createDefaultGraph } from "../app/appState";
import { getGraphFilePath } from "../graph/graphFiles";
import { createPrefixedId } from "../utils/randomId";
import { buildProjectWorkspaceEntries, normalizeWorkspacePath } from "../workspace/workspaceTree";

export const PROJECT_STORAGE_VERSION = 1;
export const PROJECT_FILESYSTEM_VERSION = 1;
export const DEFAULT_PROJECT_ROOT_PATH = "/";
export const DEFAULT_PROJECT_GITIGNORE_PATH = ".gitignore";
export const DEFAULT_PROJECT_GITIGNORE_CONTENT = String.raw`## Core latex/pdflatex auxiliary files:
*.aux
*.lof
*.log
*.lot
*.fls
*.out
*.toc
*.fmt
*.fot
*.cb
*.cb2
.*.lb

## Intermediate documents:
*.dvi
*.xdv
*-converted-to.*
# these rules might exclude image files for figures etc.
# *.ps
# *.eps
# *.pdf

## Generated if empty string is given at "Please type another file name for output:"
.pdf

## Bibliography auxiliary files (bibtex/biblatex/biber):
*.bbl
*.bbl-SAVE-ERROR
*.bcf
*.bcf-SAVE-ERROR
*.blg
*-blx.aux
*-blx.bib
*.run.xml
## Build tool auxiliary files:
*.fdb_latexmk
*.synctex
*.synctex(busy)
*.synctex.gz
*.synctex.gz(busy)
*.pdfsync
*.rubbercache
rubber.cache

## Build tool directories for auxiliary files
# latexrun
latex.out/

## Auxiliary and intermediate files from other packages:
# algorithms
*.alg
*.loa

# achemso
acs-*.bib

# amsthm
*.thm

# attachfile2
*.atfi

# beamer
*.nav
*.pre
*.snm
*.vrb

# changes
*.soc
*.loc

# comment
*.cut

# context
*.tuc
*.tui
*.tuo

# cprotect
*.cpt
# elsarticle (documentclass of Elsevier journals)
*.spl

# endnotes
*.ent

# fixme
*.lox

# feynmf/feynmp
*.mf
*.mp
*.t[1-9]
*.t[1-9][0-9]
*.tfm

#(r)(e)ledmac/(r)(e)ledpar
*.end
*.?end
*.[1-9]
*.[1-9][0-9]
*.[1-9][0-9][0-9]
*.[1-9]R
*.[1-9][0-9]R
*.[1-9][0-9][0-9]R
*.eledsec[1-9]
*.eledsec[1-9]R
*.eledsec[1-9][0-9]
*.eledsec[1-9][0-9]R
*.eledsec[1-9][0-9][0-9]
*.eledsec[1-9][0-9][0-9]R

# glossaries
*.acn
*.acr
*.glg
*.glg-abr
*.glo
*.glo-abr
*.gls
*.gls-abr
*.glsdefs
*.lzo
*.lzs
*.slg
*.slo
*.sls
# uncomment this for glossaries-extra (will ignore makeindex's style files!)
# *.ist

# gnuplot
*.gnuplot
*.table

# gnuplottex
*-gnuplottex-*

# gregoriotex
*.gaux
*.glog
*.gtex

# htlatex
*.4ct
*.4tc
*.idv
*.lg
*.trc
*.xref

# hypdoc
*.hd

# hyperref
*.brf

# knitr
*-concordance.tex
# TODO Uncomment the next line if you use knitr and want to ignore its generated tikz files
# *.tikz
*-tikzDictionary

# latexindent will create succesive backup files by default
#*.bak*

# listings
*.lol

# luatexja-ruby
*.ltjruby

# makeidx
*.idx
*.ilg
*.ind

# minitoc
*.maf
*.mlf
*.mlt
*.mtc[0-9]*
*.slf[0-9]*
*.slt[0-9]*
*.stc[0-9]*

# minted
_minted*
*.data.minted
*.pyg

# morewrites
*.mw

# newpax
*.newpax

# nomencl
*.nlg
*.nlo
*.nls

# pax
*.pax

# pdfpcnotes
*.pdfpc

# sagetex
*.sagetex.sage
*.sagetex.py
*.sagetex.scmd

# scrwfile
*.wrt

# spelling
*.spell.bad
*.spell.txt

# svg
svg-inkscape/

# sympy
*.sout
*.sympy
sympy-plots-for-*.tex/

# pdfcomment
*.upa
*.upb

# pythontex
*.pytxcode
pythontex-files-*/

# tcolorbox
*.listing

# thmtools
*.loe

# TikZ & PGF
*.dpth
*.md5
*.auxlock

# titletoc
*.ptc

# todonotes
*.tdo

# vhistory
*.hst
*.ver

# easy-todo
*.lod

# xcolor
*.xcp

# xmpincl
*.xmpi

# xindy
*.xdy

# xypic precompiled matrices and outlines
*.xyc
*.xyd

# endfloat
*.ttt
*.fff

# Latexian
TSWLatexianTemp*

## Editors:
# WinEdt
*.bak
*.sav

# latexindent.pl
*.bak[0-9]*

# Texpad
.texpadtmp

# LyX
*.lyx~

# Kile
*.backup

# gummi
.*.swp

# KBibTeX
*~[0-9]*

# TeXnicCenter
*.tps

# auto folder when using emacs and auctex
./auto/*
*.el

# expex forward references with \gathertags
*-tags.tex

# standalone packages
*.sta

# Makeindex log files
*.lpz

# xwatermark package
*.xwm

# REVTeX puts footnotes in the bibliography by default, unless the nofootinbib
# option is specified. Footnotes are the stored in a file with suffix Notes.bib.
# Uncomment the next line to have this generated file ignored.
#*Notes.bib
`;
const DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID = "project-gitignore";
export const GENERATED_LATEX_PDF_SOURCE_ID = "latex-preview-pdf";

export type ProjectFileContent = string | Uint8Array;
export type ProjectFilesystemEntryKind = "file" | "folder";

export interface ProjectFilesystemEntryBase {
  path: string;
  kind: ProjectFilesystemEntryKind;
  id: string;
  updatedAt: string;
  source: ProjectFilesystemEntrySource;
}

export interface ProjectFilesystemFileEntry extends ProjectFilesystemEntryBase {
  kind: "file";
  content: ProjectFileContent;
}

export interface ProjectFilesystemFolderEntry extends ProjectFilesystemEntryBase {
  kind: "folder";
}

export type ProjectFilesystemEntry =
  | ProjectFilesystemFileEntry
  | ProjectFilesystemFolderEntry;

export type ProjectFilesystemEntrySource =
  | { kind: "document"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "diagram"; id: string }
  | { kind: "graph"; id: string }
  | { kind: "virtual"; id: string };

export interface ProjectFilesystemTree {
  version: typeof PROJECT_FILESYSTEM_VERSION;
  entries: Record<string, ProjectFilesystemEntry>;
  updatedAt: string;
}

export interface ProjectRepoMetadata {
  // Tokens and credentials remain in the existing sync configuration paths.
  backend: "browser-git";
  status: "not-initialized" | "ready" | "needs-recovery";
  headRef: string | null;
  defaultBranch: string | null;
  initializedAt?: string | null;
  recoveryMessage?: string | null;
  remotes: Array<{
    name: string;
    url: string;
  }>;
}

export interface ProjectSelectionState {
  activeFilePath: string | null;
  openFilePaths: string[];
}

export interface ProjectEditorState {
  previewPath: string | null;
}

export interface ProjectLegacyRecovery {
  migratedAt: string;
  snapshotVersion: number | null;
  project: TypstProject;
}

export interface TyprProjectRepository {
  id: string;
  displayName: string;
  rootPath: string;
  storageRoot: string;
  filesystem: ProjectFilesystemTree;
  git: ProjectRepoMetadata;
  selection: ProjectSelectionState;
  editor: ProjectEditorState;
  legacyRecovery: ProjectLegacyRecovery;
  createdAt: string;
  updatedAt: string;
}

export interface TyprProjectStorageState {
  version: typeof PROJECT_STORAGE_VERSION;
  selectedProjectId: string | null;
  projects: TyprProjectRepository[];
  migration: {
    migratedAt: string;
    source: "legacy-snapshot" | "project-storage";
    legacySnapshotRetained: boolean;
  };
}

// Phase 2 git backends should use this filesystem contract instead of reading
// legacy AppSnapshot.project arrays. The concrete app store can provide these
// operations over IndexedDB, OPFS, or a future worker-backed repository.
export interface ProjectStorageApi {
  listFiles(project: TyprProjectRepository): ProjectFilesystemFileEntry[];
  readFileBytes(project: TyprProjectRepository, path: string): Uint8Array | null;
  writeFileBytes(
    project: TyprProjectRepository,
    path: string,
    bytes: Uint8Array
  ): TyprProjectRepository;
  deletePath(project: TyprProjectRepository, path: string): TyprProjectRepository;
  renamePath(
    project: TyprProjectRepository,
    fromPath: string,
    toPath: string
  ): TyprProjectRepository;
  subscribe(
    projectId: string,
    listener: (project: TyprProjectRepository) => void
  ): () => void;
  getProjectRoot(project: TyprProjectRepository): string;
}

export function createProjectStorageFromSnapshot(
  snapshot: AppSnapshot,
  existingStorage?: TyprProjectStorageState | null
): TyprProjectStorageState {
  const now = new Date().toISOString();
  const projectId = snapshot.project.id || createId("project");
  const existingProject = existingStorage?.projects.find((project) => project.id === projectId);
  const repository = createRepositoryFromLegacyProject(snapshot, existingProject);

  return {
    version: PROJECT_STORAGE_VERSION,
    selectedProjectId: projectId,
    projects: [
      ...(existingStorage?.projects.filter((project) => project.id !== projectId) ?? []),
      repository
    ],
    migration: existingStorage?.migration ?? {
      migratedAt: now,
      source: "legacy-snapshot",
      legacySnapshotRetained: true
    }
  };
}

export function syncProjectStorageFromSnapshot(
  snapshot: AppSnapshot,
  existingStorage: TyprProjectStorageState,
  previousSnapshot: AppSnapshot
): TyprProjectStorageState {
  if (snapshot.project === previousSnapshot.project) {
    return existingStorage;
  }

  const targetedDocument = findTargetedDocumentContentChange(snapshot, previousSnapshot);

  if (targetedDocument) {
    return updateSelectedProjectRepository(existingStorage, (project) => {
      const activeFilePath = normalizeProjectPath(targetedDocument.next.name);
      const openFilePaths = Array.from(
        new Set([
          ...(project.selection?.openFilePaths ?? []).map(normalizeProjectPath).filter(Boolean),
          activeFilePath
        ])
      );

      return {
        ...writeProjectFile(
          project,
          targetedDocument.next.name,
          targetedDocument.next.content,
          { kind: "document", id: targetedDocument.next.id }
        ),
        selection: {
          activeFilePath,
          openFilePaths
        }
      };
    });
  }

  const targetedGraph = findTargetedGraphContentChange(snapshot, previousSnapshot);

  if (targetedGraph) {
    return updateSelectedProjectRepository(existingStorage, (project) =>
      writeProjectFile(
        project,
        getGraphFilePath(targetedGraph.next.name),
        new Uint8Array(targetedGraph.next.content),
        { kind: "graph", id: targetedGraph.next.id }
      )
    );
  }

  const activeFilePath = findSelectionOnlyActiveFilePath(snapshot, previousSnapshot);

  if (activeFilePath) {
    return updateSelectedProjectRepository(existingStorage, (project) => ({
      ...project,
      selection: {
        ...project.selection,
        activeFilePath
      }
    }));
  }

  return createProjectStorageFromSnapshot(snapshot, existingStorage);
}

export function normalizeProjectStorageState(
  storage: TyprProjectStorageState | null | undefined,
  fallbackSnapshot: AppSnapshot
): TyprProjectStorageState {
  if (!storage || storage.version !== PROJECT_STORAGE_VERSION || !Array.isArray(storage.projects)) {
    return createProjectStorageFromSnapshot(fallbackSnapshot);
  }

  const normalizedProjects = storage.projects.map(normalizeRepository);
  const selectedProjectId =
    normalizedProjects.find((project) => project.id === storage.selectedProjectId)?.id ??
    normalizedProjects[0]?.id ??
    null;

  if (normalizedProjects.length === 0) {
    return createProjectStorageFromSnapshot(fallbackSnapshot);
  }

  return {
    version: PROJECT_STORAGE_VERSION,
    selectedProjectId,
    projects: normalizedProjects,
    migration: {
      migratedAt: storage.migration?.migratedAt ?? new Date().toISOString(),
      source: storage.migration?.source ?? "project-storage",
      legacySnapshotRetained: storage.migration?.legacySnapshotRetained ?? true
    }
  };
}

export function getSelectedProjectRepository(
  storage: TyprProjectStorageState
): TyprProjectRepository | null {
  return (
    storage.projects.find((project) => project.id === storage.selectedProjectId) ??
    storage.projects[0] ??
    null
  );
}

export function updateSelectedProjectRepository(
  storage: TyprProjectStorageState,
  updater: (project: TyprProjectRepository) => TyprProjectRepository
): TyprProjectStorageState {
  const selectedProject = getSelectedProjectRepository(storage);

  if (!selectedProject) {
    return storage;
  }

  const nextProject = updater(selectedProject);

  return {
    ...storage,
    selectedProjectId: nextProject.id,
    projects: storage.projects.map((project) =>
      project.id === selectedProject.id ? nextProject : project
    )
  };
}

export function createEmptyProjectRepository(options: {
  displayName: string;
  defaultFileName?: string | null;
  defaultContent?: string;
}): TyprProjectRepository {
  const now = new Date().toISOString();
  const projectId = createId("project");
  const defaultFileName = options.defaultFileName == null
    ? null
    : normalizeProjectPath(options.defaultFileName);
  const fileId = defaultFileName ? createId("file") : null;
  const documentId = defaultFileName ? createId("doc") : null;
  const entries = {
    ...(defaultFileName
      ? {
          [DEFAULT_PROJECT_GITIGNORE_PATH]: {
            id: createId("file"),
            kind: "file" as const,
            path: DEFAULT_PROJECT_GITIGNORE_PATH,
            content: DEFAULT_PROJECT_GITIGNORE_CONTENT,
            source: {
              kind: "document" as const,
              id: DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID
            },
            updatedAt: now
          }
        }
      : {}),
    ...(defaultFileName && fileId && documentId
      ? {
          [defaultFileName]: {
            id: fileId,
            kind: "file" as const,
            path: defaultFileName,
            content: options.defaultContent ?? "",
            source: { kind: "document" as const, id: documentId },
            updatedAt: now
          }
        }
      : {})
  };
  const documents = defaultFileName && documentId
    ? [
        {
          id: DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID,
          name: DEFAULT_PROJECT_GITIGNORE_PATH,
          content: DEFAULT_PROJECT_GITIGNORE_CONTENT,
          updatedAt: now
        },
        {
          id: documentId,
          name: defaultFileName,
          content: options.defaultContent ?? "",
          updatedAt: now
        }
      ]
    : [];

  return {
    id: projectId,
    displayName: options.displayName.trim() || "Untitled project",
    rootPath: DEFAULT_PROJECT_ROOT_PATH,
    storageRoot: getProjectStorageRoot(projectId),
    filesystem: {
      version: PROJECT_FILESYSTEM_VERSION,
      entries,
      updatedAt: now
    },
    git: {
      backend: "browser-git",
      status: "not-initialized",
      headRef: null,
      defaultBranch: null,
      remotes: []
    },
    selection: {
      activeFilePath: defaultFileName,
      openFilePaths: defaultFileName ? [defaultFileName] : []
    },
    editor: {
      previewPath: null
    },
    legacyRecovery: {
      migratedAt: now,
      snapshotVersion: null,
      project: {
        id: projectId,
        name: options.displayName.trim() || "Untitled project",
        documents,
        folders: [],
        trash: [],
        figures: [],
        graphs: [],
        activeDocumentId: documentId ?? "",
        diagram: createDefaultDiagram(),
        graph: createDefaultGraph(),
        createdAt: now,
        updatedAt: now
      }
    },
    createdAt: now,
    updatedAt: now
  };
}

export function addProjectRepository(
  storage: TyprProjectStorageState,
  project: TyprProjectRepository
): TyprProjectStorageState {
  return {
    ...storage,
    selectedProjectId: project.id,
    projects: [
      ...storage.projects.filter((existingProject) => existingProject.id !== project.id),
      project
    ]
  };
}

export function removeProjectRepository(
  storage: TyprProjectStorageState,
  projectId: string,
  fallbackProject?: TyprProjectRepository
): TyprProjectStorageState {
  const remainingProjects = storage.projects.filter((project) => project.id !== projectId);
  const projects =
    remainingProjects.length > 0
      ? remainingProjects
      : fallbackProject
        ? [fallbackProject]
        : [];
  const selectedProjectId =
    projects.find((project) => project.id === storage.selectedProjectId)?.id ??
    projects[0]?.id ??
    null;

  return {
    ...storage,
    selectedProjectId,
    projects
  };
}

export function projectRepositoryToLegacyProject(
  project: TyprProjectRepository,
  previousProject: TypstProject
): TypstProject {
  const entries = Object.values(project.filesystem.entries);
  const documents: TypstDocumentFile[] = [];
  const folders: FileFolder[] = [];
  const figuresById = new Map((previousProject.figures ?? []).map((figure) => [figure.id, figure]));
  const graphsById = new Map((previousProject.graphs ?? []).map((graph) => [graph.id, graph]));
  const previousDocumentsById = new Map(previousProject.documents.map((document) => [document.id, document]));
  const previousDocumentsByPath = new Map(
    previousProject.documents.map((document) => [normalizeProjectPath(document.name), document])
  );
  const previousFoldersById = new Map((previousProject.folders ?? []).map((folder) => [folder.id, folder]));
  const previousFoldersByPath = new Map(
    (previousProject.folders ?? []).map((folder) => [normalizeProjectPath(folder.name), folder])
  );

  for (const entry of entries) {
    if (
      entry.source.kind === "diagram" ||
      entry.source.kind === "graph" ||
      entry.source.kind === "virtual"
    ) {
      continue;
    }

    if (entry.kind === "file") {
      const previous =
        previousDocumentsById.get(entry.source.id) ?? previousDocumentsByPath.get(entry.path);
      documents.push({
        id: entry.source.kind === "document" ? entry.source.id : previous?.id ?? createId("doc"),
        name: entry.path,
        content: entry.content,
        updatedAt: entry.updatedAt
      });
      continue;
    }

    const previous = previousFoldersById.get(entry.source.id) ?? previousFoldersByPath.get(entry.path);
    folders.push({
      id: entry.source.kind === "folder" ? entry.source.id : previous?.id ?? createId("folder"),
      name: entry.path,
      updatedAt: entry.updatedAt
    });
  }

  const figures = entries
    .filter((entry) => entry.source.kind === "diagram")
    .map((entry) => figuresById.get(entry.source.id))
    .filter((figure): figure is DiagramAsset => Boolean(figure));
  const graphs = entries
    .filter((entry) => entry.source.kind === "graph")
    .map((entry) => graphsById.get(entry.source.id))
    .filter((graph): graph is GraphAsset => Boolean(graph));
  const activeDocument =
    documents.find((document) => normalizeProjectPath(document.name) === project.selection.activeFilePath) ??
    documents.find((document) => document.id === previousProject.activeDocumentId) ??
    documents[0];

  return {
    ...previousProject,
    id: project.id,
    name: project.displayName,
    documents: documents.sort((left, right) => left.name.localeCompare(right.name)),
    folders: folders.sort((left, right) => left.name.localeCompare(right.name)),
    figures,
    graphs,
    activeDocumentId: activeDocument?.id ?? previousProject.activeDocumentId,
    updatedAt: project.updatedAt
  };
}

export function listProjectFiles(project: TyprProjectRepository): ProjectFilesystemFileEntry[] {
  return Object.values(project.filesystem.entries)
    .filter((entry): entry is ProjectFilesystemFileEntry => entry.kind === "file")
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function listProjectEntries(project: TyprProjectRepository): ProjectFilesystemEntry[] {
  return Object.values(project.filesystem.entries).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

export function readProjectFileBytes(
  project: TyprProjectRepository,
  path: string
): Uint8Array | null {
  const normalizedPath = normalizeProjectPath(path);
  const entry = project.filesystem.entries[normalizedPath];

  if (!entry || entry.kind !== "file") {
    return null;
  }

  return typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
}

export function writeProjectFile(
  project: TyprProjectRepository,
  path: string,
  content: ProjectFileContent,
  source?: ProjectFilesystemEntrySource
): TyprProjectRepository {
  const normalizedPath = assertSafeProjectPath(path);
  const now = new Date().toISOString();
  const previous = project.filesystem.entries[normalizedPath];
  const nextEntries = {
    ...project.filesystem.entries,
    [normalizedPath]: {
      id: previous?.id ?? createId("file"),
      kind: "file",
      path: normalizedPath,
      content,
      source: source ?? previous?.source ?? { kind: "document", id: previous?.id ?? createId("doc") },
      updatedAt: now
    } satisfies ProjectFilesystemFileEntry
  };

  return withEntries(project, nextEntries, now);
}

export function writeProjectFileBytes(
  project: TyprProjectRepository,
  path: string,
  bytes: Uint8Array
): TyprProjectRepository {
  return writeProjectFile(project, path, bytes);
}

export function ensureProjectFolder(
  project: TyprProjectRepository,
  path: string,
  source?: ProjectFilesystemEntrySource
): TyprProjectRepository {
  const normalizedPath = assertSafeProjectPath(path);
  const now = new Date().toISOString();
  const previous = project.filesystem.entries[normalizedPath];

  if (previous?.kind === "folder") {
    return project;
  }

  return withEntries(
    project,
    {
      ...project.filesystem.entries,
      [normalizedPath]: {
        id: previous?.id ?? createId("folder"),
        kind: "folder",
        path: normalizedPath,
        source: source ?? previous?.source ?? { kind: "folder", id: previous?.id ?? createId("folder") },
        updatedAt: now
      } satisfies ProjectFilesystemFolderEntry
    },
    now
  );
}

export function deleteProjectPath(
  project: TyprProjectRepository,
  path: string
): TyprProjectRepository {
  const normalizedPath = assertSafeProjectPath(path);
  const now = new Date().toISOString();
  const nextEntries = { ...project.filesystem.entries };

  for (const entryPath of Object.keys(nextEntries)) {
    if (entryPath === normalizedPath || entryPath.startsWith(`${normalizedPath}/`)) {
      delete nextEntries[entryPath];
    }
  }

  return withEntries(project, nextEntries, now);
}

export function renameProjectPath(
  project: TyprProjectRepository,
  fromPath: string,
  toPath: string
): TyprProjectRepository {
  const normalizedFromPath = assertSafeProjectPath(fromPath);
  const normalizedToPath = assertSafeProjectPath(toPath);
  const now = new Date().toISOString();
  const nextEntries = { ...project.filesystem.entries };

  for (const entryPath of Object.keys(project.filesystem.entries)) {
    if (entryPath !== normalizedFromPath && !entryPath.startsWith(`${normalizedFromPath}/`)) {
      continue;
    }

    const entry = project.filesystem.entries[entryPath];
    delete nextEntries[entryPath];
    const nextPath =
      entryPath === normalizedFromPath
        ? normalizedToPath
        : `${normalizedToPath}${entryPath.slice(normalizedFromPath.length)}`;
    nextEntries[nextPath] = {
      ...entry,
      path: nextPath,
      updatedAt: now
    };
  }

  return withEntries(project, nextEntries, now);
}

export function getProjectRoot(project: TyprProjectRepository): string {
  return project.rootPath;
}

export function assertSafeProjectPath(path: string): string {
  if (path.includes("\0")) {
    throw new Error("Project paths cannot contain NUL bytes.");
  }

  const normalizedPath = normalizeProjectPath(path);

  if (!normalizedPath) {
    throw new Error("Project path cannot be empty.");
  }

  if (isReservedGitPath(normalizedPath)) {
    throw new Error("Direct access to .git internals is reserved for Typr git storage.");
  }

  return normalizedPath;
}

export function normalizeProjectPath(path: string): string {
  if (path.includes("\0")) {
    throw new Error("Project paths cannot contain NUL bytes.");
  }

  const trimmed = path.replace(/\\/g, "/").trim();
  if (/^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error("Project paths must be relative to the project root.");
  }

  const withoutRoot = trimmed.replace(/^\/+/, "");
  const segments = withoutRoot.split("/");
  const normalizedSegments: string[] = [];

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      throw new Error("Project paths cannot escape the project root.");
    }
    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

export function isReservedGitPath(path: string): boolean {
  const normalizedPath = normalizeWorkspacePath(path);
  return normalizedPath === ".git" || normalizedPath.startsWith(".git/");
}

export function getProjectStorageRoot(projectId: string): string {
  return `projects/${projectId}`;
}

function createRepositoryFromLegacyProject(
  snapshot: AppSnapshot,
  existingProject?: TyprProjectRepository
): TyprProjectRepository {
  const now = new Date().toISOString();
  const entries: Record<string, ProjectFilesystemEntry> = {};

  for (const entry of buildProjectWorkspaceEntries(snapshot)) {
    const path = normalizeProjectPath(entry.path);
    if (!path) {
      continue;
    }

    entries[path] =
      entry.kind === "file"
        ? {
            id: `${entry.source.kind}:${entry.source.id}`,
            path,
            kind: "file",
            content: entry.content ?? "",
            source: toProjectEntrySource(entry.source),
            updatedAt: getLegacyEntryUpdatedAt(snapshot.project, entry.source) ?? now
          }
        : {
            id: `${entry.source.kind}:${entry.source.id}`,
            path,
            kind: "folder",
            source: toProjectEntrySource(entry.source),
            updatedAt: getLegacyEntryUpdatedAt(snapshot.project, entry.source) ?? now
        };
  }

  for (const existingEntry of Object.values(existingProject?.filesystem.entries ?? {})) {
    if (existingEntry.source.kind !== "virtual") {
      continue;
    }

    const path = normalizeProjectPath(existingEntry.path);

    if (!path || entries[path]) {
      continue;
    }

    entries[path] = {
      ...existingEntry,
      path
    };
  }

  const existingGitignore = entries[DEFAULT_PROJECT_GITIGNORE_PATH];
  if (existingGitignore?.kind === "file") {
    entries[DEFAULT_PROJECT_GITIGNORE_PATH] = {
      ...existingGitignore,
      source: normalizeProjectGitignoreSource(existingGitignore)
    };
  } else {
    entries[DEFAULT_PROJECT_GITIGNORE_PATH] = {
      id: createId("file"),
      path: DEFAULT_PROJECT_GITIGNORE_PATH,
      kind: "file",
      content: DEFAULT_PROJECT_GITIGNORE_CONTENT,
      source: {
        kind: "document",
        id: DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID
      },
      updatedAt: now
    };
  }

  const activeDocument = snapshot.project.documents.find(
    (document) => document.id === snapshot.project.activeDocumentId
  );
  const activeFilePath = activeDocument ? normalizeProjectPath(activeDocument.name) : null;
  const storedOpenFilePaths = existingProject
    ? existingProject.selection.openFilePaths.map(normalizeProjectPath)
    : activeFilePath
      ? [activeFilePath]
      : [];
  const openFilePaths = Array.from(
    new Set(storedOpenFilePaths)
  ).filter((path): path is string => {
    if (!path) {
      return false;
    }

    return entries[path]?.kind === "file";
  });
  const projectId = snapshot.project.id || createId("project");

  return {
    id: projectId,
    displayName: snapshot.project.name,
    rootPath: DEFAULT_PROJECT_ROOT_PATH,
    storageRoot: getProjectStorageRoot(projectId),
    filesystem: {
      version: PROJECT_FILESYSTEM_VERSION,
      entries,
      updatedAt: snapshot.project.updatedAt ?? now
    },
    git: existingProject?.git ?? {
      backend: "browser-git",
      status: "not-initialized",
      headRef: null,
      defaultBranch: null,
      remotes: []
    },
    selection: {
      activeFilePath,
      openFilePaths
    },
    editor: existingProject?.editor ?? {
      previewPath: null
    },
    legacyRecovery: {
      migratedAt: existingProject?.legacyRecovery.migratedAt ?? now,
      snapshotVersion: snapshot.version ?? null,
      project: snapshot.project
    },
    createdAt: snapshot.project.createdAt ?? now,
    updatedAt: snapshot.project.updatedAt ?? now
  };
}

function normalizeRepository(project: TyprProjectRepository): TyprProjectRepository {
  const now = new Date().toISOString();
  const entries: Record<string, ProjectFilesystemEntry> = {};

  for (const entry of Object.values(project.filesystem?.entries ?? {})) {
    try {
      const path = normalizeProjectPath(entry.path);
      if (!path) {
        continue;
      }
      const source =
        path === DEFAULT_PROJECT_GITIGNORE_PATH
          ? normalizeProjectGitignoreSource(entry)
          : entry.source;
      entries[path] = {
        ...entry,
        path,
        id: entry.id ?? createId(entry.kind),
        source,
        updatedAt: entry.updatedAt ?? now
      };
    } catch {
      // Skip invalid persisted paths; legacyRecovery still keeps the previous project.
    }
  }

  const normalizedGitignore = entries[DEFAULT_PROJECT_GITIGNORE_PATH];
  if (normalizedGitignore?.kind === "file") {
    entries[DEFAULT_PROJECT_GITIGNORE_PATH] = {
      ...normalizedGitignore,
      source: normalizeProjectGitignoreSource(normalizedGitignore)
    };
  } else {
    entries[DEFAULT_PROJECT_GITIGNORE_PATH] = {
      id: createId("file"),
      path: DEFAULT_PROJECT_GITIGNORE_PATH,
      kind: "file",
      content: DEFAULT_PROJECT_GITIGNORE_CONTENT,
      source: {
        kind: "document",
        id: DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID
      },
      updatedAt: now
    };
  }

  return {
    ...project,
    rootPath: project.rootPath || DEFAULT_PROJECT_ROOT_PATH,
    storageRoot: project.storageRoot || getProjectStorageRoot(project.id),
    filesystem: {
      version: PROJECT_FILESYSTEM_VERSION,
      entries,
      updatedAt: project.filesystem?.updatedAt ?? project.updatedAt ?? now
    },
    git: normalizeRepoMetadata(project.git),
    selection: {
      activeFilePath: project.selection?.activeFilePath
        ? normalizeProjectPath(project.selection.activeFilePath)
        : null,
      openFilePaths: Array.isArray(project.selection?.openFilePaths)
        ? project.selection.openFilePaths.map(normalizeProjectPath)
        : []
    },
    editor: {
      previewPath: project.editor?.previewPath ?? null
    },
    legacyRecovery: project.legacyRecovery,
    updatedAt: project.updatedAt ?? now
  };
}

function normalizeRepoMetadata(
  metadata: Partial<ProjectRepoMetadata> | null | undefined
): ProjectRepoMetadata {
  const backend = "browser-git";
  const status =
    metadata?.status === "ready" || metadata?.status === "needs-recovery"
      ? metadata.status
      : "not-initialized";

  return {
    backend,
    status,
    headRef: metadata?.headRef ?? null,
    defaultBranch: metadata?.defaultBranch ?? null,
    initializedAt: metadata?.initializedAt ?? null,
    recoveryMessage: metadata?.recoveryMessage ?? null,
    remotes: Array.isArray(metadata?.remotes) ? metadata.remotes : []
  };
}

function findTargetedDocumentContentChange(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot
): { next: TypstDocumentFile } | null {
  if (
    snapshot.project.id !== previousSnapshot.project.id ||
    snapshot.project.documents.length !== previousSnapshot.project.documents.length ||
    snapshot.project.folders !== previousSnapshot.project.folders ||
    snapshot.project.figures !== previousSnapshot.project.figures ||
    snapshot.project.graphs !== previousSnapshot.project.graphs ||
    snapshot.project.trash !== previousSnapshot.project.trash ||
    snapshot.project.name !== previousSnapshot.project.name
  ) {
    return null;
  }

  let changedDocument: TypstDocumentFile | null = null;

  for (const nextDocument of snapshot.project.documents) {
    const previousDocument = previousSnapshot.project.documents.find(
      (document) => document.id === nextDocument.id
    );

    if (!previousDocument || previousDocument.name !== nextDocument.name) {
      return null;
    }

    if (
      previousDocument.content !== nextDocument.content ||
      previousDocument.updatedAt !== nextDocument.updatedAt
    ) {
      if (changedDocument) {
        return null;
      }
      changedDocument = nextDocument;
    }
  }

  return changedDocument ? { next: changedDocument } : null;
}

function findTargetedGraphContentChange(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot
): { next: GraphAsset } | null {
  if (
    snapshot.project.id !== previousSnapshot.project.id ||
    snapshot.project.documents !== previousSnapshot.project.documents ||
    snapshot.project.folders !== previousSnapshot.project.folders ||
    snapshot.project.figures !== previousSnapshot.project.figures ||
    snapshot.project.trash !== previousSnapshot.project.trash ||
    snapshot.project.name !== previousSnapshot.project.name ||
    snapshot.project.graphs.length !== previousSnapshot.project.graphs.length
  ) {
    return null;
  }

  let changedGraph: GraphAsset | null = null;

  for (const nextGraph of snapshot.project.graphs) {
    const previousGraph = previousSnapshot.project.graphs.find((graph) => graph.id === nextGraph.id);

    if (!previousGraph || previousGraph.name !== nextGraph.name) {
      return null;
    }

    if (previousGraph.content !== nextGraph.content || previousGraph.updatedAt !== nextGraph.updatedAt) {
      if (changedGraph) {
        return null;
      }
      changedGraph = nextGraph;
    }
  }

  return changedGraph ? { next: changedGraph } : null;
}

function findSelectionOnlyActiveFilePath(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot
): string | null {
  if (
    snapshot.project.id !== previousSnapshot.project.id ||
    snapshot.project.activeDocumentId === previousSnapshot.project.activeDocumentId ||
    snapshot.project.name !== previousSnapshot.project.name ||
    snapshot.project.updatedAt !== previousSnapshot.project.updatedAt ||
    snapshot.project.createdAt !== previousSnapshot.project.createdAt ||
    snapshot.project.documents !== previousSnapshot.project.documents ||
    snapshot.project.folders !== previousSnapshot.project.folders ||
    snapshot.project.figures !== previousSnapshot.project.figures ||
    snapshot.project.graphs !== previousSnapshot.project.graphs ||
    snapshot.project.trash !== previousSnapshot.project.trash
  ) {
    return null;
  }

  const activeDocument = snapshot.project.documents.find(
    (document) => document.id === snapshot.project.activeDocumentId
  );

  return activeDocument ? normalizeProjectPath(activeDocument.name) : null;
}

function getLegacyEntryUpdatedAt(
  project: TypstProject,
  source: { kind: string; id: string }
): string | null {
  if (source.kind === "document") {
    return project.documents.find((document) => document.id === source.id)?.updatedAt ?? null;
  }

  if (source.kind === "folder") {
    return project.folders.find((folder) => folder.id === source.id)?.updatedAt ?? null;
  }

  if (source.kind === "diagram") {
    return project.figures.find((figure) => figure.id === source.id)?.updatedAt ?? null;
  }

  if (source.kind === "graph") {
    return project.graphs.find((graph) => graph.id === source.id)?.updatedAt ?? null;
  }

  return null;
}

function toProjectEntrySource(source: {
  kind: string;
  id: string;
}): ProjectFilesystemEntrySource {
  if (
    source.kind === "document" ||
    source.kind === "folder" ||
    source.kind === "diagram" ||
    source.kind === "graph"
  ) {
    return {
      kind: source.kind,
      id: source.id
    };
  }

  return {
    kind: "virtual",
    id: source.id
  };
}

function normalizeProjectGitignoreSource(
  entry: Pick<ProjectFilesystemEntry, "source">
): ProjectFilesystemEntrySource {
  if (entry.source.kind === "document") {
    return entry.source;
  }

  return {
    kind: "document",
    id: DEFAULT_PROJECT_GITIGNORE_DOCUMENT_ID
  };
}

function withEntries(
  project: TyprProjectRepository,
  entries: Record<string, ProjectFilesystemEntry>,
  updatedAt: string
): TyprProjectRepository {
  return {
    ...project,
    filesystem: {
      ...project.filesystem,
      entries,
      updatedAt
    },
    updatedAt
  };
}

function createId(prefix: string): string {
  return createPrefixedId(prefix);
}
