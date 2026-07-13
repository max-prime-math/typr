import { Bash } from "just-bash";
import type { BashExecResult } from "just-bash";
import { createUnavailableBackend } from "./backends";
import { createTerminalCommands } from "./commandRegistry";
import { createProjectFsAdapter } from "./projectFilesystemAdapter";
import type { TerminalBackend, TerminalProjectRuntime, TerminalCommandResult } from "./types";

const PROJECT_ROOT = "/project";

export function createBrowserBackend(runtime: TerminalProjectRuntime): TerminalBackend {
  const bash = new Bash({
    fs: createProjectFsAdapter({
      getProject: runtime.getProjectRepository,
      updateProject: runtime.updateProjectRepository
    }),
    cwd: PROJECT_ROOT,
    customCommands: createTerminalCommands({
      typst: createTypstAdapter(runtime),
      latex: createLatexAdapter(runtime),
      git: createGitAdapter(runtime)
    })
  });

  let cwd = PROJECT_ROOT;

  return {
    status: {
      id: "browser",
      label: "Browser Shell",
      detail: "Virtual project filesystem",
      available: true
    },
    async execute(command) {
      if (command.trim() === "help") {
        return {
          stdout: [
            "Browser Shell commands",
            "Filesystem: pwd cd ls tree cat less head tail wc mkdir touch rm cp mv",
            "Search/text: grep rg find sort uniq sed",
            "Typst: typst compile|watch|query|fonts|--version",
            "LaTeX: latex compile [--quick|--full]|--version",
            "Project helpers: build clean export sync doctor help",
            "Git: git status add reset commit branch switch log remote fetch push pull sync merge --abort merge --continue"
          ].join("\n") + "\n",
          stderr: "",
          exitCode: 0,
          cwd
        };
      }
      const result = await bash.exec(command, { cwd });
      cwd = normalizeCwd(result, cwd);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd
      };
    },
    getCwd() {
      return cwd;
    },
    dispose() {}
  };
}

export function createLocalAgentBackendPlaceholder() {
  return createUnavailableBackend(
    {
      id: "local-agent",
      label: "Local Agent unavailable",
      detail: "Companion process not connected",
      available: false
    },
    "TODO: add an opt-in localhost transport that is scoped to the selected project root."
  );
}

export function createCloudContainerBackendPlaceholder() {
  return createUnavailableBackend(
    {
      id: "cloud-container",
      label: "Cloud Shell unavailable",
      detail: "No container session configured",
      available: false
    },
    "TODO: add a remote container backend with authenticated session negotiation."
  );
}

function createTypstAdapter(runtime: TerminalProjectRuntime) {
  return {
    async compile(args: string[]): Promise<TerminalCommandResult> {
      const target = args[0] ?? "active document";
      const result = await runtime.compileProjectFile(args[0]);
      if (result.engine !== "typst-ts" && result.engine !== "mock") {
        return {
          stdout: "",
          stderr: `${target} is not a Typst file. Use latex compile for LaTeX sources.\n`,
          exitCode: 1
        };
      }
      return result.ok
        ? {
            stdout: `Compiled ${target} successfully.\n`,
            stderr: "",
            exitCode: 0
          }
        : {
            stdout: "",
            stderr: `${formatCompileErrors(result)}\n`,
            exitCode: 1
          };
    },
    async watch(): Promise<TerminalCommandResult> {
      return {
        stdout: "",
        stderr: "typst watch is unavailable in Browser Shell. Use live preview in the editor instead.\n",
        exitCode: 1
      };
    },
    async query(): Promise<TerminalCommandResult> {
      return {
        stdout: "",
        stderr: "typst query is not wired in this build.\n",
        exitCode: 1
      };
    },
    async fonts(): Promise<TerminalCommandResult> {
      return {
        stdout: "Browser-managed Typst fonts are available through the bundled runtime.\n",
        stderr: "",
        exitCode: 0
      };
    },
    async version(): Promise<TerminalCommandResult> {
      return {
        stdout: "typst-ts (browser runtime)\n",
        stderr: "",
        exitCode: 0
      };
    },
    async build(): Promise<TerminalCommandResult> {
      const result = await runtime.compileProjectFile();
      return result.ok
        ? {
            stdout: "Built active document successfully.\n",
            stderr: "",
            exitCode: 0
          }
        : {
            stdout: "",
            stderr: `${formatCompileErrors(result)}\n`,
            exitCode: 1
          };
    },
    async clean(): Promise<TerminalCommandResult> {
      const fs = runtime.getSnapshot();
      void fs;
      runtime.updateSnapshot((snapshot) => snapshot);
      return {
        stdout: "Removed generated Browser Shell build artifacts.\n",
        stderr: "",
        exitCode: 0
      };
    },
    async export(): Promise<TerminalCommandResult> {
      const result = await runtime.exportActiveDocument();
      return result.ok
        ? {
            stdout: `Exported ${result.fileName}.\n`,
            stderr: "",
            exitCode: 0
          }
        : {
            stdout: "",
            stderr: `${result.message}\n`,
            exitCode: 1
          };
    },
    async sync(): Promise<TerminalCommandResult> {
      const result = await runtime.syncProject();
      return result.ok
        ? { stdout: `${result.message}\n`, stderr: "", exitCode: 0 }
        : { stdout: "", stderr: `${result.message}\n`, exitCode: 1 };
    },
    async doctor(): Promise<TerminalCommandResult> {
      const snapshot = runtime.getSnapshot();
      const compileResult = runtime.getCompileResult();
      const compilerStatus = runtime.getCompilerStatus();
      const activeDocument =
        snapshot.project.documents.find((document) => document.id === snapshot.project.activeDocumentId) ??
        snapshot.project.documents[0];
      return {
        stdout: [
          "Typr Browser Shell doctor",
          `backend: browser`,
          `root: ${PROJECT_ROOT}`,
          `project: ${snapshot.project.name}`,
          `main file: ${activeDocument?.name ?? "unavailable"}`,
          `typst: available`,
          `git: local repo with GitHub Git Database remote adapter`,
          `network: ${runtime.getIsOnline() ? "online" : "offline"}`,
          `compiler: ${compilerStatus.label}`,
          `last compile: ${
            compileResult ? (compileResult.ok ? "ok" : "error") : "not run"
          }`,
          "limitations: no host shell, no external git transport in Browser Shell, no typst watch/query transport"
        ].join("\n") + "\n",
        stderr: "",
        exitCode: 0
      };
    }
  };
}

function createLatexAdapter(runtime: TerminalProjectRuntime) {
  return {
    async compile(args: string[]): Promise<TerminalCommandResult> {
      const mode = args.includes("--quick") ? "quick" : "full";
      const targetPath = args.find((arg) => !arg.startsWith("--"));
      const target = targetPath ?? "active document";
      const result = await runtime.compileProjectFile(targetPath, { latexMode: mode });
      if (result.engine !== "busytex") {
        return {
          stdout: "",
          stderr: `${target} is not a LaTeX file. Use typst compile for Typst sources.\n`,
          exitCode: 1
        };
      }
      return result.ok
        ? {
            stdout: `Compiled ${target} successfully (${mode} mode).\n`,
            stderr: "",
            exitCode: 0
          }
        : {
            stdout: "",
            stderr: `${formatCompileErrors(result)}\n`,
            exitCode: 1
          };
    },
    async version(): Promise<TerminalCommandResult> {
      return {
        stdout: "BusyTeX (browser runtime)\n",
        stderr: "",
        exitCode: 0
      };
    }
  };
}

function createGitAdapter(runtime: TerminalProjectRuntime) {
  return {
    async run(args: string[]): Promise<TerminalCommandResult> {
      return runtime.runGitCommand(args);
    }
  };
}

function normalizeCwd(result: BashExecResult, fallbackCwd: string): string {
  const pwd = result.env.PWD?.trim();
  return pwd && pwd.startsWith("/") ? pwd : fallbackCwd;
}

function formatCompileErrors(result: Extract<TerminalCommandResult | Awaited<ReturnType<TerminalProjectRuntime["compileActiveDocument"]>>, { ok?: false }>) {
  if ("errors" in result && Array.isArray(result.errors)) {
    return result.errors.map((error) => error.message).join("\n");
  }
  return "Compile failed.";
}
