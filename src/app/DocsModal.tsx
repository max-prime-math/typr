import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { renderMarkdownHtml } from "../markdown/markdownParser";

import indexSource from "../../docs/index.md?raw";
import workspaceSource from "@typr/user-guide-workspace?raw";
import editingPreviewSource from "../../docs/user-guide/editing-preview.md?raw";
import keyboardShortcutsSource from "../../docs/user-guide/keyboard-shortcuts.md?raw";
import workspaceToolsSource from "../../docs/user-guide/workspace-tools.md?raw";
import diagramsSource from "../../docs/user-guide/diagrams.md?raw";
import gitSyncSource from "../../docs/user-guide/git-sync.md?raw";
import packagesShellSource from "../../docs/user-guide/packages-shell.md?raw";
import settingsSource from "@typr/user-guide-settings?raw";
import releaseChannelsSource from "../../docs/release-channels.md?raw";
import selfHostingSource from "../../docs/self-hosting.md?raw";

interface DocsPanelProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface DocsModalProps {
  onClose: () => void;
}

interface DocsPage {
  id: string;
  title: string;
  source: string;
  path: string;
}

interface DocsSection {
  title?: string;
  pages: DocsPage[];
}

interface StoredDocsModalState {
  pageId: string;
  scrollByPage: Partial<Record<string, number>>;
}

const DOCS_MODAL_STORAGE_KEY = "typr.docs-modal.v1";

const DOCS_SECTIONS: DocsSection[] = [
  {
    pages: [
      { id: "index", title: "Introduction", path: "index.md", source: indexSource },
      { id: "user-guide/workspace", title: "Workspace and Projects", path: "user-guide/workspace.md", source: workspaceSource },
      { id: "user-guide/editing-preview", title: "Editing and Preview", path: "user-guide/editing-preview.md", source: editingPreviewSource },
      { id: "user-guide/keyboard-shortcuts", title: "Keyboard Shortcuts", path: "user-guide/keyboard-shortcuts.md", source: keyboardShortcutsSource },
      { id: "user-guide/workspace-tools", title: "Workspace Tools", path: "user-guide/workspace-tools.md", source: workspaceToolsSource },
      { id: "user-guide/diagrams", title: "Diagrams", path: "user-guide/diagrams.md", source: diagramsSource },
      { id: "user-guide/git-sync", title: "GitHub Sync", path: "user-guide/git-sync.md", source: gitSyncSource },
      { id: "user-guide/settings", title: "Settings", path: "user-guide/settings.md", source: settingsSource },
      { id: "user-guide/packages-shell", title: "Packages and Browser Shell", path: "user-guide/packages-shell.md", source: packagesShellSource }
    ]
  },
  {
    title: "Deployment",
    pages: [
      { id: "self-hosting", title: "Self-host Typr", path: "self-hosting.md", source: selfHostingSource },
      { id: "release-channels", title: "Release Channels", path: "release-channels.md", source: releaseChannelsSource }
    ]
  }
];

const DOCS_PAGES = DOCS_SECTIONS.flatMap((section) => section.pages);
const DOCS_PAGE_BY_ID = new Map(DOCS_PAGES.map((page) => [page.id, page]));
const DOCS_PAGE_BY_PATH = new Map(DOCS_PAGES.map((page) => [page.path.replace(/\.md$/, ""), page]));

function normalizeDocsScrollPositions(value: unknown): StoredDocsModalState["scrollByPage"] {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([pageId, scrollTop]) => DOCS_PAGE_BY_ID.has(pageId) && typeof scrollTop === "number" && Number.isFinite(scrollTop))
      .map(([pageId, scrollTop]) => [pageId, Math.max(0, scrollTop)])
  );
}

function readStoredDocsModalState(): StoredDocsModalState {
  if (typeof window === "undefined") return { pageId: "index", scrollByPage: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DOCS_MODAL_STORAGE_KEY) ?? "null") as Partial<StoredDocsModalState> | null;
    return {
      pageId: typeof parsed?.pageId === "string" && DOCS_PAGE_BY_ID.has(parsed.pageId) ? parsed.pageId : "index",
      scrollByPage: normalizeDocsScrollPositions(parsed?.scrollByPage)
    };
  } catch {
    return { pageId: "index", scrollByPage: {} };
  }
}

function writeStoredDocsModalState(pageId: string, scrollByPage: StoredDocsModalState["scrollByPage"]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCS_MODAL_STORAGE_KEY, JSON.stringify({ pageId, scrollByPage }));
  } catch {
    // Ignore storage failures so private browsing or full storage never blocks docs.
  }
}

function stripFrontmatter(source: string): string {
  return source.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getSearchSnippet(source: string, query: string): string {
  const cleanSource = stripFrontmatter(source)
    .replace(/[#*_`>[\]()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedSource = cleanSource.toLowerCase();
  const index = normalizedSource.indexOf(query.toLowerCase());
  if (index < 0) return cleanSource.slice(0, 120);
  const start = Math.max(0, index - 44);
  const end = Math.min(cleanSource.length, index + query.length + 76);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < cleanSource.length ? "..." : "";
  return prefix + cleanSource.slice(start, end).trim() + suffix;
}

function normalizeDocsHref(href: string, currentPath: string): DocsPage | null {
  const pathPart = href.split("#")[0];
  if (!pathPart || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(pathPart)) return null;
  const currentDirectory = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
  const rawSegments = (currentDirectory ? currentDirectory + "/" : "") + pathPart.replace(/\.md$/, "");
  const segments: string[] = [];
  for (const segment of rawSegments.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return DOCS_PAGE_BY_PATH.get(segments.join("/") || "index") ?? null;
}

export function DocsPanel({ embedded = false, onClose }: DocsPanelProps) {
  const [storedDocsState] = useState(readStoredDocsModalState);
  const [activePageId, setActivePageId] = useState(storedDocsState.pageId);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const activePageIdRef = useRef(activePageId);
  const scrollByPageRef = useRef<StoredDocsModalState["scrollByPage"]>(storedDocsState.scrollByPage);
  const activePage = DOCS_PAGE_BY_ID.get(activePageId) ?? DOCS_PAGES[0];
  const html = useMemo(() => renderMarkdownHtml(stripFrontmatter(activePage.source), "docs"), [activePage]);
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const visibleDocsSections = useMemo(() => {
    if (!normalizedSearchQuery) return DOCS_SECTIONS.map((section) => ({
      ...section,
      pages: section.pages.map((page) => ({ page, snippet: "" }))
    }));

    return DOCS_SECTIONS
      .map((section) => ({
        ...section,
        pages: section.pages
          .filter((page) => normalizeSearchText(page.title + " " + stripFrontmatter(page.source)).includes(normalizedSearchQuery))
          .map((page) => ({ page, snippet: getSearchSnippet(page.source, searchQuery.trim()) }))
      }))
      .filter((section) => section.pages.length > 0);
  }, [normalizedSearchQuery, searchQuery]);
  const searchResultCount = visibleDocsSections.reduce((count, section) => count + section.pages.length, 0);

  const saveCurrentScrollPosition = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const pageId = activePageIdRef.current;
    scrollByPageRef.current = {
      ...scrollByPageRef.current,
      [pageId]: content.scrollTop
    };
    writeStoredDocsModalState(pageId, scrollByPageRef.current);
  }, []);

  const handlePageSelect = useCallback(
    (pageId: string) => {
      saveCurrentScrollPosition();
      setActivePageId(pageId);
      setIsMobileTocOpen(false);
    },
    [saveCurrentScrollPosition]
  );

  const handleClose = useCallback(() => {
    saveCurrentScrollPosition();
    onClose?.();
  }, [onClose, saveCurrentScrollPosition]);

  useEffect(() => {
    activePageIdRef.current = activePage.id;
    writeStoredDocsModalState(activePage.id, scrollByPageRef.current);
    const frame = window.requestAnimationFrame(() => {
      if (!contentRef.current) return;
      contentRef.current.scrollTop = scrollByPageRef.current[activePage.id] ?? 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePage.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!embedded && event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [embedded, handleClose]);

  const handleContentClick = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    const docsPage = normalizeDocsHref(link.getAttribute("href") ?? "", activePage.path);
    if (!docsPage) return;
    event.preventDefault();
    handlePageSelect(docsPage.id);
  };

  return (
      <section
        aria-label="Typr documentation"
        aria-modal={embedded ? undefined : true}
        className={`docs-modal ${embedded ? "docs-modal--embedded" : ""} ${isMobileTocOpen ? "docs-modal--mobile-toc-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
        role={embedded ? undefined : "dialog"}
      >
        <header className="docs-modal__header modal-control-header">
          <div>
            <h2>Typr Documentation</h2>
          </div>
          {onClose ? <button className="modal-close-button pane__button" onClick={handleClose} type="button">Close</button> : null}
        </header>
        <div className="docs-modal__body">
          <button
            aria-expanded={isMobileTocOpen}
            className="docs-modal__mobile-toc-toggle"
            onClick={() => setIsMobileTocOpen((current) => !current)}
            type="button"
          >
            <span>{activePage.title}</span>
            <span aria-hidden="true" className="docs-modal__mobile-toc-chevron" />
          </button>
          <nav className="docs-modal__nav" aria-label="Documentation pages">
            <div className="docs-modal__search">
              <div className="modal-search-field">
                <input
                  aria-label="Search documentation"
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search docs"
                  type="search"
                  value={searchQuery}
                />
                {searchQuery ? (
                  <button
                    aria-label="Clear documentation search"
                    className="modal-search-field__clear"
                    onClick={() => setSearchQuery("")}
                    type="button"
                  >
                    <span aria-hidden="true" className="package-search-clear__icon" />
                  </button>
                ) : null}
              </div>
              {searchQuery.trim() ? (
                <span className="docs-modal__search-count">{searchResultCount} result{searchResultCount === 1 ? "" : "s"}</span>
              ) : null}
            </div>
            {visibleDocsSections.length > 0 ? visibleDocsSections.map((section) => (
              <section className="docs-modal__nav-section" key={section.title ?? "pages"}>
                {section.title ? <h3>{section.title}</h3> : null}
                {section.pages.map(({ page, snippet }) => (
                  <button
                    aria-current={activePage.id === page.id ? "page" : undefined}
                    className={"docs-modal__nav-item " + (activePage.id === page.id ? "docs-modal__nav-item--active" : "")}
                    key={page.id}
                    onClick={() => handlePageSelect(page.id)}
                    type="button"
                  >
                    <span className="docs-modal__nav-title">{page.title}</span>
                    {snippet ? <span className="docs-modal__nav-snippet">{snippet}</span> : null}
                  </button>
                ))}
              </section>
            )) : <div className="docs-modal__search-empty">No matching docs.</div>}
          </nav>
          <article
            className="docs-modal__content preview-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={handleContentClick}
            onScroll={saveCurrentScrollPosition}
            ref={contentRef}
          />
        </div>
      </section>
  );
}

export function DocsModal({ onClose }: DocsModalProps) {
  return (
    <div className="docs-modal-backdrop" onClick={onClose} role="presentation">
      <DocsPanel onClose={onClose} />
    </div>
  );
}
