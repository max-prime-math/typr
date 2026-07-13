import type { SourceLanguage } from "../compiler/sourceFileTypes";
import type { CompileDiagnostic, CompileMetadata, CompilerEngine } from "../compiler/types";
import { normalizeWorkspacePath } from "../workspace/workspaceTree";

export const BUILD_LOG_STORAGE_KEY = "typr.build-log.v1";

export type BuildLogTrigger = "manual" | "auto" | "preview" | "export" | "agent" | "rerun";
export type BuildLogFilter = "all" | "errors" | "warnings" | "current-file" | "latex";

export interface BuildLogEntry {
  id: string;
  sourcePath: string;
  language: SourceLanguage;
  engine: CompilerEngine;
  ok: boolean;
  startedAt: string;
  durationMs: number;
  diagnostics: CompileDiagnostic[];
  metadata?: CompileMetadata;
  trigger: BuildLogTrigger;
  compileMode: "quick" | "full" | "none";
  cached: boolean;
  outputChanged: boolean;
  rawLog?: string;
  packageDetails: string[];
  shellEscapeUnavailable: boolean;
}

export function createBuildLogStorageKey(projectKey: string): string {
  return `${BUILD_LOG_STORAGE_KEY}:${projectKey}`;
}

export function readStoredBuildLogEntries(
  storage: Pick<Storage, "getItem"> | undefined,
  storageKey: string
): BuildLogEntry[] {
  if (!storage) return [];
  try {
    const stored = storage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter(isBuildLogEntry).map(normalizeBuildLogEntry).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function persistBuildLogEntries(
  storage: Pick<Storage, "setItem"> | undefined,
  storageKey: string,
  entries: BuildLogEntry[]
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(entries.slice(0, 20)));
  } catch {
    // Build logs are useful but non-critical; ignore quota/private-mode failures.
  }
}

function normalizeBuildLogEntry(entry: BuildLogEntry): BuildLogEntry {
  return {
    ...entry,
    diagnostics: entry.diagnostics ?? [],
    trigger: entry.trigger ?? "manual",
    compileMode: entry.compileMode ?? (entry.language === "latex" ? "quick" : "none"),
    cached: entry.cached ?? false,
    outputChanged: entry.outputChanged ?? false,
    rawLog: entry.rawLog,
    packageDetails: entry.packageDetails ?? [],
    shellEscapeUnavailable: entry.shellEscapeUnavailable ?? false
  };
}

function isBuildLogEntry(value: unknown): value is BuildLogEntry {
  const entry = value as Partial<BuildLogEntry> | null;
  return Boolean(entry && typeof entry.id === "string" && typeof entry.sourcePath === "string" &&
    typeof entry.language === "string" && typeof entry.engine === "string" &&
    typeof entry.ok === "boolean" && typeof entry.startedAt === "string" &&
    typeof entry.durationMs === "number" && Array.isArray(entry.diagnostics));
}

export function filterBuildLogEntries(
  entries: BuildLogEntry[],
  filter: BuildLogFilter,
  currentPath: string,
  searchQuery: string
): BuildLogEntry[] {
  const normalizedCurrentPath = normalizeWorkspacePath(currentPath);
  const query = searchQuery.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter === "errors" && entry.ok && !entry.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return false;
    if (filter === "warnings" && !entry.diagnostics.some((diagnostic) => diagnostic.severity === "warning")) return false;
    if (filter === "current-file" && normalizeWorkspacePath(entry.sourcePath) !== normalizedCurrentPath) return false;
    if (filter === "latex" && entry.language !== "latex") return false;
    return !query || formatBuildLogEntryText(entry).toLowerCase().includes(query);
  });
}

export function formatBuildLogEntryText(entry: BuildLogEntry): string {
  const diagnostics = entry.diagnostics.map((diagnostic) =>
    `${diagnostic.severity} ${formatDiagnosticRange(diagnostic) ?? ""} ${diagnostic.message}`
  ).join("\n");
  const packages = entry.packageDetails.length > 0 ? `\nPackages:\n${entry.packageDetails.join("\n")}` : "";
  const rawLog = entry.rawLog ? `\nRaw log:\n${entry.rawLog}` : "";
  return [
    `${entry.ok ? "OK" : "ERROR"} ${entry.sourcePath}`,
    `Started: ${new Date(entry.startedAt).toLocaleString()}`,
    `Language: ${formatSourceLanguageLabel(entry.language)}`,
    `Engine: ${entry.engine}`,
    `Trigger: ${entry.trigger}`,
    `Compile mode: ${entry.compileMode}`,
    `Duration: ${formatDurationMs(entry.durationMs)}`,
    `Cached: ${entry.cached ? "yes" : "no"}`,
    `Output changed: ${entry.outputChanged ? "yes" : "no"}`,
    `Shell escape unavailable: ${entry.shellEscapeUnavailable ? "yes" : "no"}`,
    `Diagnostics: ${entry.diagnostics.length}`,
    diagnostics, packages, rawLog
  ].filter(Boolean).join("\n");
}

export function formatBuildLogEntriesText(entries: BuildLogEntry[]): string {
  return entries.map(formatBuildLogEntryText).join("\n\n---\n\n");
}

export function extractBuildLogPackageDetails(log: string): string[] {
  return log.split(/\r?\n/).map((line) => line.trim()).filter((line) =>
    /^(TeX packages|TeX packages local|TeX packages unresolved|Data packages used|Because of unresolved TeX packages)/i.test(line)
  ).slice(0, 12);
}

export function hasShellEscapeConstraint(log: string): boolean {
  return /shell escape|write18|minted|biber|makeglossaries|external tool/i.test(log);
}

export function getPreviousBuildLogEntry(entries: BuildLogEntry[], index: number): BuildLogEntry | null {
  return entries.slice(index + 1).find((entry) => entry.sourcePath === entries[index]?.sourcePath) ?? null;
}

export function dedupeRepeatedWarnings(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  const seenWarnings = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    if (diagnostic.severity !== "warning") return true;
    const key = `${diagnostic.path ?? ""}:${diagnostic.message}`;
    if (seenWarnings.has(key)) return false;
    seenWarnings.add(key);
    return true;
  });
}

export function groupDiagnosticsByFile(diagnostics: CompileDiagnostic[]): Array<{ file: string; diagnostics: CompileDiagnostic[] }> {
  const groups = new Map<string, CompileDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = diagnostic.path || "Current file";
    groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
  }
  return [...groups.entries()].map(([file, diagnostics]) => ({ file, diagnostics }));
}

export function formatDurationMs(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${Math.max(0, durationMs).toFixed(0)}ms`;
}

export function formatSourceLanguageLabel(language: SourceLanguage): string {
  return language === "typst"
    ? "Typst"
    : language === "latex"
      ? "LaTeX"
      : language === "markdown"
        ? "Markdown"
        : "Text";
}

export function formatDiagnosticRange(
  diagnostic: Pick<CompileDiagnostic, "line" | "column" | "endLine" | "endColumn" | "range">
): string | undefined {
  if (diagnostic.line && diagnostic.column) {
    const start = `${diagnostic.line}:${diagnostic.column}`;

    if (diagnostic.endLine && diagnostic.endColumn) {
      if (diagnostic.endLine === diagnostic.line && diagnostic.endColumn === diagnostic.column) {
        return start;
      }

      return `${start}-${diagnostic.endLine}:${diagnostic.endColumn}`;
    }

    return start;
  }

  return diagnostic.range;
}
