export type CompilerEngine = "mock" | "typst-ts" | "busytex";
export type CompilerMode = "worker" | "main-thread" | "mock";
export type CompilerPhase =
  | "idle"
  | "worker-starting"
  | "loading-typst"
  | "loading-latex"
  | "loading-packages"
  | "loading-fonts"
  | "compiling"
  | "rendering"
  | "fallback-main-thread"
  | "ready"
  | "error";

export interface CompilerStatus {
  phase: CompilerPhase;
  mode: CompilerMode;
  label: string;
  detail?: string;
  progress?: {
    current: number;
    total: number;
    label?: string;
  };
}

export interface CompileDiagnostic {
  message: string;
  severity: "error" | "warning";
  path?: string;
  range?: string;
  packageName?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface CompileOutput {
  kind: "svg" | "html" | "pdf" | "placeholder";
  content: string;
  artifactData?: Uint8Array;
  sourceMapData?: Uint8Array;
}

export interface CompileTiming {
  label: string;
  durationMs: number;
}

export interface CompileMetadata {
  timings?: CompileTiming[];
  synctexFiles?: Array<{ path: string; size: number }>;
  fileSync?: {
    changedFiles: number;
    deletedFiles: number;
    cachedFiles: number;
    compileFiles: number;
  };
  dirty?: {
    status: "initial" | "changed" | "unchanged";
    requiresFullCompile: boolean;
    reason: string;
    changedFiles: number;
    deletedFiles: number;
    categories: Array<{
      category: string;
      count: number;
    }>;
    samplePaths: string[];
  };
  strategy?: {
    requestedMode: string;
    effectiveMode: string;
    driver?: string;
    previewKind: string;
    activeFilePath: string;
    mainFilePath: string;
    reason: string;
    fallbackUsed?: boolean;
  };
}

export interface CompileAssetFile {
  path: string;
  content: Uint8Array;
}

export interface CompileDocumentOptions {
  mainFilePath?: string;
}

export interface CompileSuccess {
  ok: true;
  engine: CompilerEngine;
  diagnostics: CompileDiagnostic[];
  output: CompileOutput;
  metadata?: CompileMetadata;
}

export interface CompileFailure {
  ok: false;
  engine: CompilerEngine;
  errors: CompileDiagnostic[];
  output?: CompileOutput;
  metadata?: CompileMetadata;
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface TypstCompilerOptions {
  onStatusChange?: (status: CompilerStatus) => void;
}

export interface TypstCompiler {
  compileDocument(
    source: string,
    assets?: CompileAssetFile[],
    options?: CompileDocumentOptions
  ): Promise<CompileResult>;
  dispose(): void;
}
