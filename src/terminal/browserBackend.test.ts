import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, type AppSnapshot } from "../app/appState";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  updateSelectedProjectRepository,
  type TyprProjectStorageState
} from "../project/projectState";
import { createBrowserBackend } from "./browserBackend";
import type { TerminalProjectRuntime } from "./types";

function createRuntime(snapshot: AppSnapshot): TerminalProjectRuntime {
  let currentSnapshot = snapshot;
  let projectStorage: TyprProjectStorageState = createProjectStorageFromSnapshot(snapshot);

  return {
    getSnapshot: () => currentSnapshot,
    updateSnapshot: (updater) => {
      currentSnapshot = updater(currentSnapshot);
    },
    getProjectRepository: () => getSelectedProjectRepository(projectStorage),
    updateProjectRepository: (updater) => {
      projectStorage = updateSelectedProjectRepository(projectStorage, updater);
    },
    getCompileResult: () => null,
    getCompilerStatus: () => ({
      phase: "ready",
      mode: "worker",
      label: "Ready"
    }),
    getIsOnline: () => true,
    async compileProjectFile() {
      return {
        ok: true,
        engine: "typst-ts",
        diagnostics: [],
        output: {
          kind: "placeholder",
          content: "ok"
        }
      };
    },
    async compileActiveDocument() {
      return {
        ok: true,
        engine: "typst-ts",
        diagnostics: [],
        output: {
          kind: "placeholder",
          content: "ok"
        }
      };
    },
    async exportActiveDocument() {
      return {
        ok: true,
        fileName: "main.pdf"
      };
    },
    async syncProject() {
      return {
        ok: true,
        message: "synced"
      };
    },
    async runGitCommand(args) {
      if (args[0] === "push") {
        return {
          stdout: "pushed\n",
          stderr: "",
          exitCode: 0
        };
      }
      return {
        stdout: "status\n",
        stderr: "",
        exitCode: 0
      };
    }
  };
}

describe("BrowserBackend", () => {
  it("starts in the project root", async () => {
    const backend = createBrowserBackend(createRuntime(createDefaultSnapshot()));
    const result = await backend.execute("pwd");
    expect(result.stdout.trim()).toBe("/project");
  });

  it("supports cd, pwd, ls, and file creation", async () => {
    const backend = createBrowserBackend(createRuntime(createDefaultSnapshot()));
    await backend.execute("mkdir notes");
    await backend.execute("cd notes");
    await backend.execute("touch draft.typ");
    const pwdResult = await backend.execute("pwd");
    const lsResult = await backend.execute("ls");

    expect(pwdResult.stdout.trim()).toBe("/project/notes");
    expect(lsResult.stdout).toContain("draft.typ");
  });

  it("help lists the project helper commands", async () => {
    const backend = createBrowserBackend(createRuntime(createDefaultSnapshot()));
    const result = await backend.execute("help");
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("typst");
  });

  it("delegates git commands to the runtime bridge", async () => {
    const backend = createBrowserBackend(createRuntime(createDefaultSnapshot()));
    const result = await backend.execute("git push");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pushed");
  });

  it("rejects reserved git internals and path escapes", async () => {
    const backend = createBrowserBackend(createRuntime(createDefaultSnapshot()));
    const gitResult = await backend.execute("touch .git/config");
    const escapeResult = await backend.execute("touch ../escape.typ");

    expect(gitResult.exitCode).not.toBe(0);
    expect(gitResult.stderr).toContain(".git");
    expect(escapeResult.exitCode).not.toBe(0);
  });
});
