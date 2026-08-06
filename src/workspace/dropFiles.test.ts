import { describe, expect, it } from "vitest";
import { collectWorkspaceDropContents } from "./dropFiles";

interface MockFileEntry {
  isDirectory: false;
  isFile: true;
  name: string;
  file: (resolve: (file: File) => void) => void;
}

interface MockDirectoryEntry {
  isDirectory: true;
  isFile: false;
  name: string;
  createReader: () => {
    readEntries: (resolve: (entries: MockEntry[]) => void) => void;
  };
}

type MockEntry = MockFileEntry | MockDirectoryEntry;

function fileEntry(name: string): MockFileEntry {
  return {
    isDirectory: false as const,
    isFile: true as const,
    name,
    file: (resolve: (file: File) => void) => resolve({ name } as File)
  };
}

function directoryEntry(name: string, children: MockEntry[]): MockDirectoryEntry {
  let hasReadEntries = false;

  return {
    isDirectory: true as const,
    isFile: false as const,
    name,
    createReader: () => ({
      readEntries: (resolve: (entries: MockEntry[]) => void) => {
        resolve(hasReadEntries ? [] : children);
        hasReadEntries = true;
      }
    })
  };
}

describe("workspace folder drops", () => {
  it("collects nested files and empty directories with relative paths", async () => {
    const droppedFolder = directoryEntry("project", [
      fileEntry("main.typ"),
      directoryEntry("chapters", [fileEntry("intro.typ")]),
      directoryEntry("empty", [])
    ]);
    const dataTransfer = {
      files: [],
      items: [
        {
          kind: "file",
          webkitGetAsEntry: () => droppedFolder
        }
      ]
    } as unknown as DataTransfer;

    await expect(collectWorkspaceDropContents(dataTransfer)).resolves.toEqual({
      directories: ["project", "project/chapters", "project/empty"],
      files: [
        { file: { name: "intro.typ" }, path: "project/chapters/intro.typ" },
        { file: { name: "main.typ" }, path: "project/main.typ" }
      ]
    });
  });
});
