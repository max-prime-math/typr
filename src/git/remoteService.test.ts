import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  writeProjectFile
} from "../project/projectState";
import { createMemoryGitFileStorage, createRepoBackend } from "./repoBackend";
import { createRemoteGitService } from "./remoteService";

function createProject() {
  const storage = createProjectStorageFromSnapshot(createDefaultSnapshot());
  const project = getSelectedProjectRepository(storage);
  if (!project) {
    throw new Error("Expected default project.");
  }
  return project;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function gitObjectSha(type: "commit" | "tree", content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`${type} ${body.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + body.byteLength);
  payload.set(header, 0);
  payload.set(body, header.byteLength);
  return sha1Hex(payload);
}

describe("remoteGitService", () => {
  it("does not fetch or overwrite when pulling with a dirty working tree", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      }
    });
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    const commit = await backend.commit(project, { message: "initial commit" });
    expect(commit.ok).toBe(true);

    project = writeProjectFile(project, "main.typ", "dirty\n");
    const result = await service.pull(
      project,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/commit or reset local changes/i);
    const status = await backend.status(project);
    expect(status.ok && status.value.entries[0]?.worktree).toBe("modified");
  });

  it("leaves remote tracking refs unchanged when fetch fails mid-operation", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const remoteSha = "a".repeat(40);
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) {
          return jsonResponse({});
        }
        if (url.includes("/git/ref/heads/main")) {
          return jsonResponse({ object: { sha: remoteSha } });
        }
        return jsonResponse({ message: "remote commit unavailable" }, 500);
      }
    });
    let localProject = createProject();
    const init = await backend.initRepository(localProject);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    localProject = init.value;

    const result = await service.fetch(
      localProject,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(false);
    const ref = await backend.getRef(localProject, "refs/remotes/origin/main");
    expect(ref.ok && ref.value).toBe(null);
  });

  it("reports missing repositories before treating the branch as missing", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async () => jsonResponse({ message: "Not Found" }, 404)
    });
    const init = await backend.initRepository(createProject());
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const result = await service.fetch(
      init.value,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/repository owner\/repo was not found/i);
  });

  it("explains that empty GitHub repositories need initialization before browser push", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) {
          return jsonResponse({});
        }
        return jsonResponse({ message: "Git Repository is empty." }, 409);
      }
    });
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    await backend.commit(project, { message: "initial commit" });

    const result = await service.push(
      project,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/initialize it on github first/i);
  });

  it("imports signed commits when GitHub provides signature payload metadata", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const emptyTreeSha = await gitObjectSha("tree", "");
    const payload = [
      `tree ${emptyTreeSha}`,
      "author A <a@example.com> 1710000000 +0000",
      "committer A <a@example.com> 1710000000 +0000",
      "",
      "signed commit",
      ""
    ].join("\n");
    const signature = [
      "-----BEGIN PGP SIGNATURE-----",
      "",
      "abc",
      "-----END PGP SIGNATURE-----"
    ].join("\n");
    const signedObject = [
      `tree ${emptyTreeSha}`,
      "author A <a@example.com> 1710000000 +0000",
      "committer A <a@example.com> 1710000000 +0000",
      "gpgsig -----BEGIN PGP SIGNATURE-----",
      " ",
      " abc",
      " -----END PGP SIGNATURE-----",
      "",
      "signed commit",
      ""
    ].join("\n");
    const remoteSha = await gitObjectSha("commit", signedObject);
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) {
          return jsonResponse({});
        }
        if (url.includes("/git/ref/heads/main")) {
          return jsonResponse({ object: { sha: remoteSha } });
        }
        if (url.includes(`/git/commits/${remoteSha}`)) {
          return jsonResponse({
            sha: remoteSha,
            message: "signed commit",
            tree: { sha: emptyTreeSha },
            parents: [],
            author: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            committer: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            verification: { payload, signature }
          });
        }
        if (url.includes(`/git/trees/${emptyTreeSha}`)) {
          return jsonResponse({ sha: emptyTreeSha, tree: [] });
        }
        return jsonResponse({ message: "unexpected request" }, 500);
      }
    });
    const init = await backend.initRepository(createProject());
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const result = await service.fetch(
      init.value,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(true);
    const hasObject = await backend.hasObject(init.value, remoteSha);
    expect(hasObject.ok && hasObject.value).toBe(true);
    const ref = await backend.getRef(init.value, "refs/remotes/origin/main");
    expect(ref.ok && ref.value).toBe(remoteSha);
  });

  it("leaves local commits and working tree intact when push authentication fails", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async () => jsonResponse({ message: "Bad credentials" }, 401)
    });
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    const commit = await backend.commit(project, { message: "initial commit" });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;

    const before = await backend.status(project);
    const result = await service.push(
      project,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "bad-token"
    );
    const after = await backend.status(project);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/bad credentials/i);
    expect(before.ok && before.value.headSha).toBe(commit.value.sha);
    expect(after.ok && after.value.headSha).toBe(commit.value.sha);
    expect(after.ok && after.value.entries).toEqual([]);
  });
});
