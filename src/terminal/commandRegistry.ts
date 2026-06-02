import { defineCommand, type Command } from "just-bash";
import type { GitCommandAdapter, TerminalCommandResult, TypstCommandAdapter } from "./types";

function formatResult(result: TerminalCommandResult) {
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  };
}

export function createTerminalCommands(options: {
  typst: TypstCommandAdapter;
  git: GitCommandAdapter;
}): Command[] {
  return [
    defineCommand("help", async () => ({
      stdout: [
        "Browser Shell commands",
        "Filesystem: pwd cd ls tree cat less head tail wc mkdir touch rm cp mv",
        "Search/text: grep rg find sort uniq sed",
        "Typst: typst compile|watch|query|fonts|--version",
        "Project helpers: build clean export sync doctor help",
        "Git: git status add reset commit branch switch log remote fetch push pull sync merge --abort merge --continue",
        "Limitations: figure assets are read-only, rebase is unavailable in Browser Shell"
      ].join("\n") + "\n",
      stderr: "",
      exitCode: 0
    })),
    defineCommand("less", async (args, ctx) => {
      if (args.length === 0) {
        return {
          stdout: ctx.stdin,
          stderr: "",
          exitCode: 0
        };
      }

      const chunks = await Promise.all(
        args.map(async (path) => {
          const resolvedPath = ctx.fs.resolvePath(ctx.cwd, path);
          const content = await ctx.fs.readFile(resolvedPath, "utf8");
          return `${resolvedPath}\n${content}`;
        })
      );

      return {
        stdout: `${chunks.join("\n\n")}\n`,
        stderr: "",
        exitCode: 0
      };
    }),
    defineCommand("typst", async (args) => {
      const [subcommand, ...rest] = args;
      if (!subcommand || subcommand === "help") {
        return {
          stdout:
            "typst commands: compile, watch, query, fonts, --version\n",
          stderr: "",
          exitCode: 0
        };
      }
      if (subcommand === "compile") {
        return formatResult(await options.typst.compile(rest));
      }
      if (subcommand === "watch") {
        return formatResult(await options.typst.watch(rest));
      }
      if (subcommand === "query") {
        return formatResult(await options.typst.query(rest));
      }
      if (subcommand === "fonts") {
        return formatResult(await options.typst.fonts(rest));
      }
      if (subcommand === "--version" || subcommand === "version") {
        return formatResult(await options.typst.version(rest));
      }
      return {
        stdout: "",
        stderr: `typst: unsupported subcommand '${subcommand}' in Browser Shell.\n`,
        exitCode: 1
      };
    }),
    defineCommand("build", async () => formatResult(await options.typst.build())),
    defineCommand("clean", async () => formatResult(await options.typst.clean())),
    defineCommand("export", async () => formatResult(await options.typst.export())),
    defineCommand("sync", async () => formatResult(await options.typst.sync())),
    defineCommand("doctor", async () => formatResult(await options.typst.doctor())),
    defineCommand("git", async (args) => formatResult(await options.git.run(args)))
  ];
}
