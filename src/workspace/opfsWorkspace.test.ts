import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyProjectRepository,
  ensureProjectFolder,
  writeProjectFile
} from "../project/projectState";
import { removeProjectFromOpfs, syncProjectToOpfs } from "./opfsWorkspace";

const encoder = new TextEncoder();

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : value;
}

class FakeOpfsFile {
  readonly kind = "file";
  createWritableCalls = 0;
  abortCalls = 0;
  failWriteAfterBytes: number | null = null;
  private bytes: Uint8Array;

  constructor(readonly name: string, content: string | Uint8Array) {
    this.bytes = toBytes(content);
  }

  async getFile(): Promise<Blob> {
    const buffer = this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength
    ) as ArrayBuffer;
    return new Blob([buffer]);
  }

  async createWritable() {
    this.createWritableCalls += 1;
    let staged = new Uint8Array();

    return {
      write: async (content: string | ArrayBuffer) => {
        const next = typeof content === "string"
          ? encoder.encode(content)
          : new Uint8Array(content);

        if (this.failWriteAfterBytes !== null) {
          staged = next.slice(0, this.failWriteAfterBytes);
          throw new Error(`partial write failed for ${this.name}`);
        }

        staged = next.slice();
      },
      close: async () => {
        this.bytes = staged;
      },
      abort: async () => {
        this.abortCalls += 1;
        staged = new Uint8Array();
      }
    };
  }

  text(): string {
    return new TextDecoder().decode(this.bytes);
  }
}

class FakeOpfsDirectory {
  readonly kind = "directory";
  readonly children = new Map<string, FakeOpfsDirectory | FakeOpfsFile>();

  constructor(readonly name: string) {}

  directory(name: string): FakeOpfsDirectory {
    const existing = this.children.get(name);
    if (existing instanceof FakeOpfsDirectory) {
      return existing;
    }
    if (existing) {
      throw new Error(`${name} is already a file`);
    }

    const directory = new FakeOpfsDirectory(name);
    this.children.set(name, directory);
    return directory;
  }

  file(name: string, content: string | Uint8Array): FakeOpfsFile {
    const file = new FakeOpfsFile(name, content);
    this.children.set(name, file);
    return file;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.children.get(name);
    if (existing instanceof FakeOpfsDirectory) {
      return existing;
    }
    if (existing || !options?.create) {
      throw Object.assign(new Error(`directory not found: ${name}`), {
        name: existing ? "TypeMismatchError" : "NotFoundError"
      });
    }
    return this.directory(name);
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.children.get(name);
    if (existing instanceof FakeOpfsFile) {
      return existing;
    }
    if (existing || !options?.create) {
      throw Object.assign(new Error(`file not found: ${name}`), {
        name: existing ? "TypeMismatchError" : "NotFoundError"
      });
    }
    return this.file(name, new Uint8Array());
  }

  async removeEntry(name: string, options?: { recursive?: boolean }) {
    const existing = this.children.get(name);
    if (!existing) {
      throw Object.assign(new Error(`entry not found: ${name}`), { name: "NotFoundError" });
    }
    if (
      existing instanceof FakeOpfsDirectory &&
      existing.children.size > 0 &&
      !options?.recursive
    ) {
      throw Object.assign(new Error(`directory is not empty: ${name}`), {
        name: "InvalidModificationError"
      });
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterable<[string, FakeOpfsDirectory | FakeOpfsFile]> {
    yield* this.children.entries();
  }
}

function installFakeOpfs(projectId: string) {
  const opfsRoot = new FakeOpfsDirectory("opfs");
  const projectsRoot = opfsRoot.directory("workspace-v1").directory("projects");
  const worktree = projectsRoot.directory(projectId).directory("worktree");

  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: vi.fn(async () => opfsRoot)
    }
  });

  return { opfsRoot, projectsRoot, worktree };
}

function installOpfs(removeEntry: ReturnType<typeof vi.fn>) {
  const projectsRoot = {
    removeEntry
  };
  const workspaceRoot = {
    getDirectoryHandle: vi.fn(async () => projectsRoot)
  };
  const opfsRoot = {
    getDirectoryHandle: vi.fn(async () => workspaceRoot)
  };

  vi.stubGlobal("navigator", {
    storage: {
      getDirectory: vi.fn(async () => opfsRoot)
    }
  });

  return { opfsRoot, projectsRoot, workspaceRoot };
}

describe("OPFS project deletion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the project directory recursively", async () => {
    const removeEntry = vi.fn(async () => {});
    installOpfs(removeEntry);

    await removeProjectFromOpfs("project-a");

    expect(removeEntry).toHaveBeenCalledWith("project-a", { recursive: true });
  });

  it("treats an already absent project directory as deleted", async () => {
    const missing = Object.assign(new Error("missing"), { name: "NotFoundError" });
    const removeEntry = vi.fn(async () => {
      throw missing;
    });
    installOpfs(removeEntry);

    await expect(removeProjectFromOpfs("project-a")).resolves.toBeUndefined();
  });

  it("surfaces interrupted cleanup so its durable tombstone can be retried", async () => {
    const interrupted = Object.assign(new Error("interrupted"), { name: "AbortError" });
    const removeEntry = vi.fn(async () => {
      throw interrupted;
    });
    installOpfs(removeEntry);

    await expect(removeProjectFromOpfs("project-a")).rejects.toBe(interrupted);
  });
});

describe("OPFS project synchronization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("incrementally mirrors files and prunes only stale worktree entries", async () => {
    let project = createEmptyProjectRepository({
      displayName: "Mirror test",
      defaultFileName: null
    });
    project = writeProjectFile(project, "unchanged.typ", "same");
    project = writeProjectFile(project, "renamed/new-name.typ", "renamed");
    project = writeProjectFile(project, "nested/keep.bin", new Uint8Array([1, 2, 3]));
    project = writeProjectFile(project, "changed.typ", "new");
    project = ensureProjectFolder(project, "empty/current");

    const { opfsRoot, projectsRoot, worktree } = installFakeOpfs(project.id);
    const unchanged = worktree.file("unchanged.typ", "same");
    const changed = worktree.file("changed.typ", "old");
    worktree.file("old-name.typ", "renamed");
    worktree.file("deleted.typ", "stale");
    const nested = worktree.directory("nested");
    const unchangedBinary = nested.file("keep.bin", new Uint8Array([1, 2, 3]));
    nested.file("deleted.bin", new Uint8Array([9]));
    worktree.directory("obsolete").directory("deep").file("deleted.typ", "stale");
    opfsRoot.directory("unrelated-root").file("keep.txt", "untouched");
    projectsRoot.directory("other-project").directory("worktree").file("keep.typ", "other");

    await syncProjectToOpfs(project);

    expect(unchanged.createWritableCalls).toBe(0);
    expect(unchangedBinary.createWritableCalls).toBe(0);
    expect(changed.createWritableCalls).toBe(1);
    expect(changed.text()).toBe("new");
    expect(worktree.children.has("old-name.typ")).toBe(false);
    expect(worktree.children.has("deleted.typ")).toBe(false);
    expect(nested.children.has("deleted.bin")).toBe(false);
    expect(worktree.children.has("obsolete")).toBe(false);
    expect(worktree.directory("renamed").children.get("new-name.typ")).toBeInstanceOf(FakeOpfsFile);
    expect(worktree.directory("empty").children.get("current")).toBeInstanceOf(FakeOpfsDirectory);
    expect(opfsRoot.directory("unrelated-root").children.has("keep.txt")).toBe(true);
    expect(projectsRoot.directory("other-project").children.has("worktree")).toBe(true);
  });

  it("aborts a partial file write and does not prune after a write-phase failure", async () => {
    let project = createEmptyProjectRepository({
      displayName: "Interrupted mirror",
      defaultFileName: null
    });
    project = writeProjectFile(project, "a-committed.typ", "new first file");
    project = writeProjectFile(project, "z-failed.typ", "new failed file");

    const { worktree } = installFakeOpfs(project.id);
    const committed = worktree.file("a-committed.typ", "old first file");
    const failed = worktree.file("z-failed.typ", "old failed file");
    failed.failWriteAfterBytes = 4;
    worktree.file("stale.typ", "preserve until a complete sync");

    await expect(syncProjectToOpfs(project)).rejects.toThrow(
      "partial write failed for z-failed.typ"
    );

    expect(committed.text()).toBe("new first file");
    expect(failed.text()).toBe("old failed file");
    expect(failed.abortCalls).toBe(1);
    expect(worktree.children.has("stale.typ")).toBe(true);
  });
});
