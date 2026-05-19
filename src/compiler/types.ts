export type CompilerEngine = "mock" | "typst-ts";
export type CompilerMode = "worker" | "main-thread" | "mock";
export type CompilerPhase =
  | "idle"
  | "worker-starting"
  | "loading-typst"
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
  kind: "svg" | "html" | "placeholder";
  content: string;
  artifactData?: Uint8Array;
}

export interface CompileSuccess {
  ok: true;
  engine: CompilerEngine;
  diagnostics: CompileDiagnostic[];
  output: CompileOutput;
}

export interface CompileFailure {
  ok: false;
  engine: CompilerEngine;
  errors: CompileDiagnostic[];
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface TypstCompilerOptions {
  onStatusChange?: (status: CompilerStatus) => void;
}

export interface TypstCompiler {
  compileDocument(source: string): Promise<CompileResult>;
  dispose(): void;
}
