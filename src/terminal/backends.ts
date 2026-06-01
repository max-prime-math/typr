import type { TerminalBackend, TerminalBackendStatus } from "./types";

export interface DeferredTerminalBackend extends TerminalBackend {
  readonly todo: string;
}

export function createUnavailableBackend(
  status: TerminalBackendStatus,
  todo: string
): DeferredTerminalBackend {
  return {
    status,
    todo,
    async execute() {
      return {
        stdout: "",
        stderr: `${status.label} is unavailable in this build.\n${todo}\n`,
        exitCode: 1,
        cwd: "/project"
      };
    },
    getCwd() {
      return "/project";
    },
    dispose() {
      // TODO: connect Local Agent / Cloud Container transport here.
    }
  };
}
