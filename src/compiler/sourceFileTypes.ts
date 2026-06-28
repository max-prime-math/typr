import { normalizeWorkspacePath } from "../workspace/workspaceTree";

export type SourceLanguage = "typst" | "latex" | "markdown" | "text";

const TYPST_EXTENSIONS = new Set(["typ", "typst"]);
const LATEX_MAIN_EXTENSIONS = new Set(["tex", "ltx", "latex"]);
const LATEX_SUPPORT_EXTENSIONS = new Set(["sty", "cls", "bib"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

export function getSourceLanguage(path: string | null | undefined): SourceLanguage {
  const extension = getPathExtension(path);

  if (extension && TYPST_EXTENSIONS.has(extension)) {
    return "typst";
  }

  if (extension && (LATEX_MAIN_EXTENSIONS.has(extension) || LATEX_SUPPORT_EXTENSIONS.has(extension))) {
    return "latex";
  }

  if (extension && MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }

  return "text";
}

export function isCompilableSourceFile(path: string | null | undefined): boolean {
  const extension = getPathExtension(path);
  return Boolean(extension && (TYPST_EXTENSIONS.has(extension) || LATEX_MAIN_EXTENSIONS.has(extension)));
}

export function isTypstSourceFile(path: string | null | undefined): boolean {
  const extension = getPathExtension(path);
  return Boolean(extension && TYPST_EXTENSIONS.has(extension));
}

export function isLatexMainSourceFile(path: string | null | undefined): boolean {
  const extension = getPathExtension(path);
  return Boolean(extension && LATEX_MAIN_EXTENSIONS.has(extension));
}

export function normalizeCompilerPath(path: string): string {
  return normalizeWorkspacePath(path.replace(/^\/?project\/?/, ""));
}

function getPathExtension(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const fileName = normalizeWorkspacePath(path).split("/").at(-1) ?? "";
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) : null;
  return extension?.toLowerCase() ?? null;
}
