export function createWorkspaceBatchRenameDraft(names: readonly string[]): string {
  return names.join("\n");
}

export function parseWorkspaceBatchRenameDraft(
  draft: string,
  expectedCount: number
): { error: string | null; names: string[] } {
  const names = draft.replace(/\r\n?/g, "\n").split("\n");

  if (names.at(-1) === "") {
    names.pop();
  }

  if (names.length !== expectedCount) {
    return {
      error: `Keep exactly ${expectedCount} filename${expectedCount === 1 ? "" : "s"}, one per line.`,
      names: []
    };
  }

  if (names.some((name) => !name.trim())) {
    return { error: "Filenames cannot be blank.", names: [] };
  }

  if (names.some((name) => name.includes("/") || name.includes("\\"))) {
    return { error: "Use filenames only; folders cannot be changed here.", names: [] };
  }

  return { error: null, names: names.map((name) => name.trim()) };
}
