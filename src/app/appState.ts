export type ThemeMode = "light" | "dark";

export interface TypstDocumentFile {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface TypstProject {
  id: string;
  name: string;
  documents: TypstDocumentFile[];
  activeDocumentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppPreferences {
  theme: ThemeMode;
  vimMode: boolean;
}

export interface AppSnapshot {
  version: 1;
  project: TypstProject;
  preferences: AppPreferences;
}

export const DEFAULT_DOCUMENT_NAME = "main.typ";

export const DEFAULT_DOCUMENT_CONTENT = `#set page(margin: 1.2in)
#set text(font: "New Computer Modern", size: 11pt)

= wrytr

A local-first, browser-based Typst editor for iPad and desktop.

- Edit the source on the left
- Watch the preview pipeline update on the right
- Toggle dark mode or Vim bindings from the toolbar

== Next steps

Start writing your document here.
`;

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createDefaultSnapshot(): AppSnapshot {
  const now = new Date().toISOString();
  const document: TypstDocumentFile = {
    id: createId("doc"),
    name: DEFAULT_DOCUMENT_NAME,
    content: DEFAULT_DOCUMENT_CONTENT,
    updatedAt: now
  };

  return {
    version: 1,
    project: {
      id: createId("project"),
      name: "My Typst Project",
      documents: [document],
      activeDocumentId: document.id,
      createdAt: now,
      updatedAt: now
    },
    preferences: {
      theme: "light",
      vimMode: false
    }
  };
}

export function getActiveDocument(project: TypstProject): TypstDocumentFile {
  return (
    project.documents.find((document) => document.id === project.activeDocumentId) ??
    project.documents[0]
  );
}

export function updateActiveDocument(
  snapshot: AppSnapshot,
  content: string
): AppSnapshot {
  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      updatedAt: now,
      documents: snapshot.project.documents.map((document) =>
        document.id === snapshot.project.activeDocumentId
          ? { ...document, content, updatedAt: now }
          : document
      )
    }
  };
}

export function updateThemePreference(
  snapshot: AppSnapshot,
  theme: ThemeMode
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      theme
    }
  };
}

export function updateVimPreference(
  snapshot: AppSnapshot,
  vimMode: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      vimMode
    }
  };
}
