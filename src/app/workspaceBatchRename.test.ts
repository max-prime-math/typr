import { describe, expect, it } from "vitest";
import {
  createWorkspaceBatchRenameDraft,
  parseWorkspaceBatchRenameDraft
} from "./workspaceBatchRename";

describe("workspace batch rename", () => {
  it("keeps one filename per line", () => {
    expect(createWorkspaceBatchRenameDraft(["intro.typ", "appendix.typ"])).toBe(
      "intro.typ\nappendix.typ"
    );
  });

  it("accepts a final newline while preserving the expected number of names", () => {
    expect(parseWorkspaceBatchRenameDraft("one.typ\ntwo.typ\n", 2)).toEqual({
      error: null,
      names: ["one.typ", "two.typ"]
    });
  });

  it("rejects missing names and path changes", () => {
    expect(parseWorkspaceBatchRenameDraft("one.typ", 2).error).toContain("exactly 2");
    expect(parseWorkspaceBatchRenameDraft("folder/one.typ\ntwo.typ", 2).error).toContain(
      "filenames only"
    );
  });
});
