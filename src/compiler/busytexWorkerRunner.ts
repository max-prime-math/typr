import type { CompileResult, FileInput, LogEntry } from "texlyre-busytex";
import type { CompileMetadata } from "./types";

export interface BusyTexWorkerRunnerConfig {
  busytexBasePath: string;
  preloadDataPackages: string[];
  catalogDataPackages: string[];
  compileTimeoutMs?: number;
  initializationTimeoutMs?: number;
}

interface BusyTexWorkerFile {
  path: string;
  contents: string | Uint8Array;
}

interface BusyTexWorkerStats {
  changedFiles: number;
  deletedFiles: number;
  cachedFiles: number;
  compileFiles: number;
  syncMs: number;
  texMs: number;
}

interface BusyTexWorkerMessage {
  initialized?: unknown;
  exception?: string;
  print?: string;
  pdf?: Uint8Array | null;
  synctex?: Uint8Array;
  synctex_files?: Array<{ path: string; size: number }>;
  log?: string;
  logs?: LogEntry[];
  exit_code?: number;
  typr_stats?: BusyTexWorkerStats;
}

const DEFAULT_INITIALIZATION_TIMEOUT_MS = 120_000;
const DEFAULT_COMPILE_TIMEOUT_MS = 10 * 60_000;
const MAX_RECENT_MESSAGES = 30;
const REQUIRED_BUSY_TEX_RUNTIME_FILES = ["busytex_pipeline.js", "busytex.js", "busytex.wasm"];

export type BusyTexCompileResultWithMetadata = CompileResult & {
  metadata?: CompileMetadata;
  synctexFiles?: Array<{ path: string; size: number }>;
};

export class BusyTexWorkerRunner {
  private worker: Worker | null = null;
  private initialized = false;
  private recentMessages: string[] = [];
  private fileSignatures = new Map<string, string>();
  private activeCompile: {
    timeout: number;
    reject: (error: Error) => void;
  } | null = null;

  constructor(private readonly config: BusyTexWorkerRunnerConfig) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await assertBusyTexAssetsAvailable(this.config);

    const workerPath = getTyprBusyTexWorkerPath();
    const worker = new Worker(workerPath);
    this.worker = worker;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.terminate();
        reject(new Error("Timed out while initializing BusyTeX."));
      }, this.config.initializationTimeoutMs ?? DEFAULT_INITIALIZATION_TIMEOUT_MS);

      worker.onmessage = ({ data }: MessageEvent<BusyTexWorkerMessage>) => {
        if (data.print) {
          this.rememberMessage(data.print);
          return;
        }

        if (data.initialized) {
          window.clearTimeout(timeout);
          this.initialized = true;
          resolve();
          return;
        }

        if (data.exception) {
          window.clearTimeout(timeout);
          this.terminate();
          reject(new Error(data.exception));
        }
      };

      worker.onerror = (error) => {
        window.clearTimeout(timeout);
        this.terminate();
        reject(new Error(`BusyTeX worker error: ${error.message}`));
      };

      worker.postMessage({
        busytex_pipeline_js: `${this.config.busytexBasePath}/busytex_pipeline.js`,
        busytex_js: `${this.config.busytexBasePath}/busytex.js`,
        busytex_wasm: `${this.config.busytexBasePath}/busytex.wasm`,
        preload_data_packages_js: this.config.preloadDataPackages,
        data_packages_js: this.config.catalogDataPackages,
        texmf_local: [],
        preload: true
      });
    });
  }

  async compile(
    files: FileInput[],
    mainTexPath: string,
    bibtex: boolean | null,
    makeindex: boolean | null,
    rerun: boolean | null,
    verbose: "silent" | "info" | "debug",
    driver: "xetex_bibtex8_dvipdfmx" | "pdftex_bibtex8" | "luahbtex_bibtex8" | "luatex_bibtex8",
    dataPackagesJs: string[] | null,
    remoteEndpoint: string
  ): Promise<BusyTexCompileResultWithMetadata> {
    if (!this.worker || !this.initialized) {
      throw new Error("BusyTeX is not initialized.");
    }

    const worker = this.worker;
    const filePatch = this.createProjectFilePatch(files);
    this.recentMessages = [];

    return new Promise<BusyTexCompileResultWithMetadata>((resolve, reject) => {
      const timeoutMs = this.config.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
      const timeout = window.setTimeout(() => {
        const recentMessages = this.recentMessages.length
          ? `\n\nRecent BusyTeX messages:\n${this.recentMessages.join("\n")}`
          : "";
        this.terminate(
          `LaTeX compilation timed out after ${formatDuration(timeoutMs)}. The BusyTeX worker was stopped.${recentMessages}`
        );
      }, timeoutMs);
      const activeCompile = {
        timeout,
        reject: (error: Error) => {
          cleanup();
          reject(error);
        }
      };
      const cleanup = () => {
        window.clearTimeout(timeout);

        if (this.activeCompile === activeCompile) {
          this.activeCompile = null;
        }
      };
      this.activeCompile = activeCompile;

      worker.onmessage = ({ data }: MessageEvent<BusyTexWorkerMessage>) => {
        if (data.print) {
          this.rememberMessage(data.print);
          return;
        }

        if (data.pdf !== undefined) {
          this.rememberMessage(`SyncTeX bytes: ${data.synctex?.length ?? 0}`);
          cleanup();
          resolve({
            success: data.exit_code === 0,
            pdf: data.pdf ?? undefined,
            synctex: data.synctex,
            log: data.log ?? "",
            exitCode: data.exit_code ?? 1,
            logs: data.logs ?? [],
            synctexFiles: data.synctex_files ?? [],
            metadata: createCompileMetadata(data.typr_stats)
          });
          return;
        }

        if (data.exception) {
          cleanup();
          this.fileSignatures.clear();
          reject(new Error(data.exception));
        }
      };

      worker.onerror = (error) => {
        cleanup();
        this.fileSignatures.clear();
        reject(new Error(`BusyTeX worker error: ${error.message}`));
      };

      worker.postMessage({
        compile_project: true,
        changed_files: filePatch.changedFiles,
        deleted_paths: filePatch.deletedPaths,
        main_tex_path: mainTexPath,
        bibtex,
        makeindex,
        rerun,
        verbose,
        driver,
        data_packages_js: dataPackagesJs,
        remote_endpoint: remoteEndpoint
      });
    });
  }

  terminate(reason = "BusyTeX worker was stopped."): void {
    const activeCompile = this.activeCompile;
    this.activeCompile = null;

    if (activeCompile) {
      window.clearTimeout(activeCompile.timeout);
      activeCompile.reject(new Error(reason));
    }

    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
    this.recentMessages = [];
    this.fileSignatures.clear();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private rememberMessage(message: string): void {
    this.recentMessages.push(message);

    if (this.recentMessages.length > MAX_RECENT_MESSAGES) {
      this.recentMessages.shift();
    }
  }

  private createProjectFilePatch(files: FileInput[]): {
    changedFiles: BusyTexWorkerFile[];
    deletedPaths: string[];
  } {
    const nextSignatures = new Map<string, string>();
    const changedFiles: BusyTexWorkerFile[] = [];

    for (const file of files) {
      const signature = getFileContentSignature(file.content);
      nextSignatures.set(file.path, signature);

      if (this.fileSignatures.get(file.path) !== signature) {
        changedFiles.push({ path: file.path, contents: file.content });
      }
    }

    const deletedPaths = [...this.fileSignatures.keys()].filter((path) => !nextSignatures.has(path));
    this.fileSignatures = nextSignatures;

    return { changedFiles, deletedPaths };
  }
}

function getTyprBusyTexWorkerPath(): string {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return `${baseUrl.replace(/\/?$/, "/")}typr-busytex-worker.js`;
}

async function assertBusyTexAssetsAvailable(config: BusyTexWorkerRunnerConfig): Promise<void> {
  const urls = [
    ...REQUIRED_BUSY_TEX_RUNTIME_FILES.map((fileName) => `${config.busytexBasePath}/${fileName}`),
    ...config.preloadDataPackages,
    ...config.catalogDataPackages
  ];
  const failures = (await Promise.all([...new Set(urls)].map(checkBusyTexAsset))).filter(
    (failure): failure is string => Boolean(failure)
  );

  if (failures.length === 0) {
    return;
  }

  throw new Error(
    [
      "BusyTeX assets are missing or unavailable.",
      "Required assets must be present under public/core/busytex.",
      "Run npm run busytex:assets, then restart the dev server or rebuild the app.",
      "",
      "Unavailable assets:",
      ...failures.map((failure) => `- ${failure}`)
    ].join("\n")
  );
}

async function checkBusyTexAsset(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });

    if (response.ok) {
      return null;
    }

    return `${url} (HTTP ${response.status})`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `${url} (${reason})`;
  }
}

function createCompileMetadata(stats: BusyTexWorkerStats | undefined): CompileMetadata | undefined {
  if (!stats) {
    return undefined;
  }

  return {
    timings: [
      { label: "Worker file sync", durationMs: stats.syncMs },
      { label: "BusyTeX execution", durationMs: stats.texMs }
    ],
    fileSync: {
      changedFiles: stats.changedFiles,
      deletedFiles: stats.deletedFiles,
      cachedFiles: stats.cachedFiles,
      compileFiles: stats.compileFiles
    }
  };
}

function getFileContentSignature(content: string | Uint8Array): string {
  if (typeof content === "string") {
    return `text:${content.length}:${hashString(content)}`;
  }

  return `bytes:${content.byteLength}:${hashBytes(content)}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}

function hashBytes(value: Uint8Array): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.byteLength; index += 1) {
    hash ^= value[index];
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} minutes ${seconds} seconds`;
  }

  if (minutes > 0) {
    return `${minutes} minutes`;
  }

  return `${seconds} seconds`;
}
