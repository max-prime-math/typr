import { describe, expect, it } from "vitest";
import { completeShellInput } from "./TerminalDrawer";

describe("completeShellInput", () => {
  it("completes command names", () => {
    expect(completeShellInput("gr", ["main.typ"])).toBe("grep");
  });

  it("completes unique file paths", () => {
    expect(
      completeShellInput("cat ma", ["main.typ", "notes/todo.typ"])
    ).toBe("cat main.typ");
  });

  it("adds a trailing slash for folder completions", () => {
    expect(
      completeShellInput("cd no", ["notes", "notes/todo.typ", "main.typ"])
    ).toBe("cd notes/");
  });
});
