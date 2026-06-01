import type { AppSnapshot } from "../app/appState";
import type { CompileResult, CompilerStatus } from "../compiler/types";
import type { TyprProjectRepository } from "../project/projectState";

export type TerminalBackendId = "browser" | "local-agent" | "cloud-container";

export interface TerminalBackendStatus {
  id: TerminalBackendId;
  label: string;
  detail: string;
  available: boolean;
}

export interface TerminalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
}

export interface TerminalBackend {
  readonly status: TerminalBackendStatus;
  execute(command: string): Promise<TerminalCommandResult>;
  getCwd(): string;
  dispose(): void;
}

export interface TerminalProjectRuntime {
  getSnapshot(): AppSnapshot;
  updateSnapshot(updater: (snapshot: AppSnapshot) => AppSnapshot): void;
  getProjectRepository(): TyprProjectRepository | null;
  updateProjectRepository(updater: (project: TyprProjectRepository) => TyprProjectRepository): void;
  getCompileResult(): CompileResult | null;
  getCompilerStatus(): CompilerStatus;
  getIsOnline(): boolean;
  compileActiveDocument(): Promise<CompileResult>;
  exportActiveDocument(): Promise<{ ok: true; fileName: string } | { ok: false; message: string }>;
  syncProject(): Promise<{ ok: true; message: string } | { ok: false; message: string }>;
  runGitCommand(args: string[]): Promise<TerminalCommandResult>;
}

export interface TypstCommandAdapter {
  compile(args: string[]): Promise<TerminalCommandResult>;
  watch(args: string[]): Promise<TerminalCommandResult>;
  query(args: string[]): Promise<TerminalCommandResult>;
  fonts(args: string[]): Promise<TerminalCommandResult>;
  version(args: string[]): Promise<TerminalCommandResult>;
  build(): Promise<TerminalCommandResult>;
  clean(): Promise<TerminalCommandResult>;
  export(): Promise<TerminalCommandResult>;
  sync(): Promise<TerminalCommandResult>;
  doctor(): Promise<TerminalCommandResult>;
}

export interface GitCommandAdapter {
  run(args: string[]): Promise<TerminalCommandResult>;
}
