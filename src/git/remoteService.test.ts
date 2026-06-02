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

async function gitObjectSha(type: "blob" | "commit" | "tree", content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`${type} ${body.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + body.byteLength);
  payload.set(header, 0);
  payload.set(body, header.byteLength);
  return sha1Hex(payload);
}

function decodeBase64Text(content: string): string {
  return atob(content.replace(/\n/g, ""));
}

describe("remoteGitService", () => {
  it("loads authenticated GitHub account owners from a token", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/user")) {
          return jsonResponse({ login: "max" });
        }
        if (url.includes("/user/orgs")) {
          return jsonResponse([{ login: "team" }]);
        }
        return jsonResponse({ message: `unexpected request ${url}` }, 500);
      }
    });

    const result = await service.inspectToken(() => "token");

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.user.login).toBe("max");
    expect(result.ok && result.value.owners.map((owner) => owner.login)).toEqual(["max", "team"]);
  });

  it("lists repositories scoped to the selected owner", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/user/repos")) {
          return jsonResponse([
            {
              name: "algebra",
              full_name: "max/algebra",
              private: true,
              default_branch: "main",
              owner: { login: "max" }
            },
            {
              name: "geometry",
              full_name: "team/geometry",
              private: false,
              default_branch: "trunk",
              owner: { login: "team" }
            }
          ]);
        }
        return jsonResponse({ message: `unexpected request ${url}` }, 500);
      }
    });

    const result = await service.listRepositories("team", () => "token");

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([
      {
        name: "geometry",
        fullName: "team/geometry",
        owner: "team",
        private: false,
        defaultBranch: "trunk"
      }
    ]);
  });

  it("lists branches for the selected repository", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/repos/owner/repo/branches")) {
          return jsonResponse([
            { name: "main", commit: { sha: "a".repeat(40) } },
            { name: "draft", commit: { sha: "b".repeat(40) } }
          ]);
        }
        return jsonResponse({ message: `unexpected request ${url}` }, 500);
      }
    });

    const result = await service.listBranches({ owner: "owner", repo: "repo" }, () => "token");

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.map((branch) => branch.name)).toEqual(["draft", "main"]);
  });

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

  it("uses an existing accessible repository when creating from the current project", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) {
          return jsonResponse({});
        }
        return jsonResponse({ message: "create should not be called" }, 500);
      }
    });

    const result = await service.createRepository(
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token",
      { private: true }
    );

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/using existing owner\/repo/i);
  });

  it("imports unsigned commits whose original timezone was normalized by GitHub metadata", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const emptyTreeSha = await gitObjectSha("tree", "");
    const remoteObject = [
      `tree ${emptyTreeSha}`,
      "author A <a@example.com> 1710000000 -0600",
      "committer A <a@example.com> 1710000000 -0600",
      "",
      "timezone commit",
      ""
    ].join("\n");
    const remoteSha = await gitObjectSha("commit", remoteObject);
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
            message: "timezone commit",
            tree: { sha: emptyTreeSha },
            parents: [],
            author: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            committer: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            verification: { payload: null, signature: null }
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
    const ref = await backend.getRef(init.value, "refs/remotes/origin/main");
    expect(ref.ok && ref.value).toBe(remoteSha);
  });

  it("imports unsigned commits whose message has no trailing newline", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    const emptyTreeSha = await gitObjectSha("tree", "");
    const remoteObject = [
      `tree ${emptyTreeSha}`,
      "author A <a@example.com> 1710000000 +0000",
      "committer A <a@example.com> 1710000000 +0000",
      "",
      "Initial commit"
    ].join("\n");
    const remoteSha = await gitObjectSha("commit", remoteObject);
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
            message: "Initial commit",
            tree: { sha: emptyTreeSha },
            parents: [],
            author: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            committer: { name: "A", email: "a@example.com", date: "2024-03-09T16:00:00Z" },
            verification: { payload: null, signature: null }
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
    const ref = await backend.getRef(init.value, "refs/remotes/origin/main");
    expect(ref.ok && ref.value).toBe(remoteSha);
  });

  it("aligns local refs to the commit sha GitHub creates during push", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    const commit = await backend.commit(project, { message: "initial commit" });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    const details = await backend.readCommitDetails(project, commit.value.sha);
    expect(details.ok).toBe(true);
    if (!details.ok) return;

    let createdRemoteSha = "";
    let createdCommitResponse: unknown = null;
    const blobs = new Map<string, string>();
    const trees = new Map<string, Array<{ path: string; mode: string; type: "blob"; sha: string; size: number }>>();
    const service = createRemoteGitService({
      repoBackend: backend,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/repos/owner/repo")) {
          return jsonResponse({});
        }
        if (url.includes("/git/ref/heads/main")) {
          return jsonResponse({ message: "Reference does not exist" }, 404);
        }
        if (url.endsWith("/git/blobs") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { content: string };
          const content = decodeBase64Text(body.content);
          const sha = await gitObjectSha("blob", content);
          blobs.set(sha, body.content);
          return jsonResponse({ sha });
        }
        if (url.endsWith("/git/trees") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            tree: Array<{ path: string; mode: string; type: "blob"; sha: string }>;
          };
          trees.set(details.value.treeSha, body.tree.map((entry) => ({
            ...entry,
            size: decodeBase64Text(blobs.get(entry.sha) ?? "").length
          })));
          return jsonResponse({ sha: details.value.treeSha });
        }
        if (url.endsWith("/git/commits") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as {
            message: string;
            tree: string;
            parents: string[];
            author: { name: string; email: string; date: string };
            committer: { name: string; email: string; date: string };
          };
          const authorTimestamp = Math.floor(new Date(body.author.date).getTime() / 1000);
          const committerTimestamp = Math.floor(new Date(body.committer.date).getTime() / 1000);
          const remoteObject = [
            `tree ${body.tree}`,
            ...body.parents.map((parent) => `parent ${parent}`),
            `author ${body.author.name} <${body.author.email}> ${authorTimestamp} +0000`,
            `committer ${body.committer.name} <${body.committer.email}> ${committerTimestamp} +0000`,
            "",
            body.message,
            ""
          ].join("\n");
          createdRemoteSha = await gitObjectSha("commit", remoteObject);
          createdCommitResponse = {
            sha: createdRemoteSha,
            message: body.message,
            tree: { sha: body.tree },
            parents: body.parents.map((sha) => ({ sha })),
            author: { ...body.author, date: new Date(authorTimestamp * 1000).toISOString() },
            committer: { ...body.committer, date: new Date(committerTimestamp * 1000).toISOString() },
            verification: { payload: null, signature: null }
          };
          expect(createdRemoteSha).not.toBe(commit.value.sha);
          return jsonResponse({ sha: createdRemoteSha });
        }
        if (url.endsWith("/git/refs") && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { sha: string };
          expect(body.sha).toBe(createdRemoteSha);
          return jsonResponse({ object: { sha: body.sha } }, 201);
        }
        if (createdRemoteSha && url.includes(`/git/commits/${createdRemoteSha}`)) {
          return jsonResponse(createdCommitResponse);
        }
        if (url.includes(`/git/trees/${details.value.treeSha}`)) {
          return jsonResponse({ sha: details.value.treeSha, tree: trees.get(details.value.treeSha) ?? [] });
        }
        const blobSha = [...blobs.keys()].find((sha) => url.includes(`/git/blobs/${sha}`));
        if (blobSha) {
          return jsonResponse({ sha: blobSha, content: blobs.get(blobSha), encoding: "base64" });
        }
        return jsonResponse({ message: `unexpected request ${url}` }, 500);
      }
    });

    const result = await service.push(
      project,
      { owner: "owner", repo: "repo", branch: "main", remoteName: "origin" },
      () => "token"
    );

    expect(result.ok).toBe(true);
    const localRef = await backend.getRef(project, "refs/heads/main");
    const remoteRef = await backend.getRef(project, "refs/remotes/origin/main");
    expect(localRef.ok && localRef.value).toBe(createdRemoteSha);
    expect(remoteRef.ok && remoteRef.value).toBe(createdRemoteSha);
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
