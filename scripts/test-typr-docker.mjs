#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const lock = JSON.parse(await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8"));
const liteImage = process.env.TYPR_LITE_IMAGE || "typr:stage4-lite";
const fullImage = process.env.TYPR_FULL_IMAGE || "typr:stage4-full";
const mountedAssetsValue = process.env.TYPR_COMPILER_ASSETS_DIR?.trim();
if (!mountedAssetsValue) {
  throw new Error("TYPR_COMPILER_ASSETS_DIR is required; the Docker gate always validates lite/local mode.");
}
const mountedAssets = path.resolve(mountedAssetsValue);
const skipR2 = process.env.TYPR_SKIP_R2 === "1";
const runId = `${process.pid}-${Date.now()}`;
const containers = new Set();

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
    ...options
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    throw new Error(`docker ${args.join(" ")} timed out.`);
  }
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  }
  return result;
}

function hardenedRunArgs(name, network = "none") {
  return [
    "run", "-d", "--name", name,
    "--network", network,
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
    "--pids-limit", "64",
    "--memory", "256m",
    "--cpus", "1"
  ];
}

function waitForHealthy(name) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = docker(["inspect", name, "--format", "{{json .State}}"]);
    const parsed = JSON.parse(state.stdout.trim());
    if (parsed.Status === "exited" || parsed.Status === "dead") {
      throw new Error(`${name} exited during startup (${parsed.ExitCode}):\n${docker(["logs", name], { allowFailure: true }).stdout}`);
    }
    if (parsed.Health?.Status === "healthy") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error(`${name} did not become healthy:\n${docker(["logs", name], { allowFailure: true }).stdout}`);
}

function assertImageMetadata(image, variant) {
  const inspected = JSON.parse(docker(["image", "inspect", image]).stdout)[0];
  assert.equal(inspected.Config.User, "101:101");
  assert.ok(inspected.Config.Env.includes(`TYPR_IMAGE_VARIANT=${variant}`));
  docker([
    "run", "--rm", "--network", "none", "--entrypoint", "sh", image,
    "-c", "grep -q '^worker_processes 1;$' /etc/nginx/nginx.conf"
  ]);
  if (variant === "lite") {
    assert.ok(inspected.Size < 200 * 1024 * 1024, `lite image is unexpectedly large: ${inspected.Size}`);
  }
}

function assertSharedAppFiles() {
  const command = "find /usr/share/nginx/html -type f | LC_ALL=C sort | while read -r file; do sha256sum \"$file\"; done";
  const fullApp = docker([
    "run", "--rm", "--network", "none", "--entrypoint", "sh", fullImage, "-c", command
  ]).stdout;
  const liteApp = docker([
    "run", "--rm", "--network", "none", "--entrypoint", "sh", liteImage, "-c", command
  ]).stdout;
  assert.equal(liteApp, fullApp, "full and lite images do not contain byte-identical app files");
  docker([
    "run", "--rm", "--network", "none", "--entrypoint", "sh", liteImage,
    "-c", "test ! -e /compiler-assets"
  ]);
}

function assertReleaseMetadata(name) {
  const releaseMetadata = JSON.parse(docker([
    "exec", name, "cat", "/usr/share/nginx/html/release.json"
  ]).stdout);
  assert.notEqual(releaseMetadata.build, "unknown");
  assert.match(releaseMetadata.commit, /^[a-f0-9]{7,64}$/);
  if (process.env.TYPR_EXPECTED_BUILD_SHA) {
    assert.equal(releaseMetadata.commit, process.env.TYPR_EXPECTED_BUILD_SHA);
  }
  if (process.env.TYPR_EXPECTED_CHANNEL) {
    assert.equal(releaseMetadata.channel, process.env.TYPR_EXPECTED_CHANNEL);
  }
}

function assertBaseRuntime(name) {
  const command = [
    "set -eu",
    "test \"$(id -u)\" = 101",
    "test \"$(awk '/CapBnd/ { print $2 }' /proc/1/status)\" = 0000000000000000",
    "wget -q -O /tmp/index.html http://127.0.0.1:8080/",
    "grep -q '<div id=\"root\"></div>' /tmp/index.html",
    "wget -q -O /tmp/health http://127.0.0.1:8080/healthz",
    "grep -qx ok /tmp/health",
    "app_asset=$(sed -En 's#.*src=\"(/assets/[^\"]*\\.js)\".*#\\1#p' /tmp/index.html | head -n 1)",
    "test -n \"$app_asset\"",
    "wget -S -O /dev/null \"http://127.0.0.1:8080$app_asset\" 2>/tmp/app-asset.headers",
    "grep -qi 'Cache-Control: public, max-age=31536000, immutable' /tmp/app-asset.headers",
    "printf 'GET /assets/missing-deadbeef.js HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' | nc 127.0.0.1 8080 > /tmp/app-404.response",
    "grep -q 'HTTP/1.1 404' /tmp/app-404.response",
    "grep -qi 'Cache-Control: no-store' /tmp/app-404.response",
    "if wget -q -O /dev/null http://127.0.0.1:8080/google-drive-oauth-callback.html; then exit 1; fi"
  ].join("\n");
  docker(["exec", name, "sh", "-c", command]);
  assertReleaseMetadata(name);
}

function assertLocalCompilerRuntime(name) {
  const releaseId = lock.releaseId;
  const command = [
    "set -eu",
    `wget -q -O /tmp/manifest.json http://127.0.0.1:8080/compiler-assets/${releaseId}/manifest.json`,
    "cmp /tmp/manifest.json /compiler-assets/manifest.json",
    `wget -S -O /dev/null http://127.0.0.1:8080/compiler-assets/${releaseId}/core/busytex/busytex_pipeline.js 2>/tmp/js.headers`,
    "grep -qi 'Content-Type: application/javascript' /tmp/js.headers",
    "grep -qi 'Cache-Control: public, max-age=31536000, immutable' /tmp/js.headers",
    `printf 'GET /compiler-assets/${releaseId}/typst/typst_ts_web_compiler_bg.wasm HTTP/1.1\\r\\nHost: localhost\\r\\nRange: bytes=0-31\\r\\nConnection: close\\r\\n\\r\\n' | nc 127.0.0.1 8080 > /tmp/wasm.response`,
    "grep -a -q 'HTTP/1.1 206' /tmp/wasm.response",
    "grep -a -qi 'Content-Type: application/wasm' /tmp/wasm.response",
    "grep -a -qi 'Content-Length: 32' /tmp/wasm.response",
    `printf 'GET /compiler-assets/${releaseId}/missing.wasm HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' | nc 127.0.0.1 8080 > /tmp/compiler-404.response`,
    "grep -q 'HTTP/1.1 404' /tmp/compiler-404.response",
    "grep -qi 'Cache-Control: no-store' /tmp/compiler-404.response"
  ].join("\n");
  docker(["exec", name, "sh", "-c", command]);
}

function assertR2CompilerRuntime(name) {
  const releaseId = lock.releaseId;
  const command = [
    "set -eu",
    `wget -q -O /tmp/manifest.json http://127.0.0.1:8080/compiler-assets/${releaseId}/manifest.json`,
    "cmp /tmp/manifest.json /etc/typr/compiler-assets-manifest.json",
    `(printf 'GET /compiler-assets/${releaseId}/core/busytex/busytex_pipeline.js HTTP/1.1\\r\\nHost: localhost\\r\\nRange: bytes=0-31\\r\\nConnection: close\\r\\n\\r\\n'; sleep 8) | timeout 12 nc 127.0.0.1 8080 > /tmp/js.response`,
    "grep -a -q 'HTTP/1.1 206' /tmp/js.response",
    "grep -a -qi 'Content-Length: 32' /tmp/js.response",
    "grep -a -qi 'Content-Type: application/javascript' /tmp/js.response",
    "grep -a -qi 'Cache-Control: public, max-age=31536000, immutable' /tmp/js.response",
    `(printf 'GET /compiler-assets/${releaseId}/typst/typst_ts_web_compiler_bg.wasm HTTP/1.1\\r\\nHost: localhost\\r\\nRange: bytes=0-31\\r\\nConnection: close\\r\\n\\r\\n'; sleep 8) | timeout 12 nc 127.0.0.1 8080 > /tmp/wasm.response`,
    "grep -a -q 'HTTP/1.1 206' /tmp/wasm.response",
    "grep -a -qi 'Content-Type: application/wasm' /tmp/wasm.response",
    `printf 'GET /compiler-assets/${releaseId}/missing.wasm HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' | nc 127.0.0.1 8080 > /tmp/compiler-404.response`,
    "grep -q 'HTTP/1.1 404' /tmp/compiler-404.response",
    "grep -qi 'Cache-Control: no-store' /tmp/compiler-404.response"
  ].join("\n");
  docker(["exec", name, "sh", "-c", command], { timeout: 60_000 });
}

function assertOfflineR2DegradesSafely(name) {
  const releaseId = lock.releaseId;
  const command = [
    "set -eu",
    `(printf 'GET /compiler-assets/${releaseId}/manifest.json HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n'; sleep 8) | timeout 12 nc 127.0.0.1 8080 > /tmp/r2-failure.response`,
    "grep -Eq 'HTTP/1.1 (502|504)' /tmp/r2-failure.response",
    "grep -qi 'Cache-Control: no-store' /tmp/r2-failure.response",
    "wget -q -O /dev/null http://127.0.0.1:8080/healthz"
  ].join("\n");
  docker(["exec", name, "sh", "-c", command], { timeout: 20_000 });
}

async function expectInvalidMount({ fixture, mounts = [], pattern, label }) {
  const name = `typr-invalid-${label}-${runId}`;
  containers.add(name);
  const result = docker([
    "run", "--name", name, "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
    "--env", "TYPR_COMPILER_ASSETS_MODE=local",
    "--volume", `${fixture}:/compiler-assets:ro`,
    ...mounts,
    liteImage
  ], { allowFailure: true, timeout: 15_000 });
  assert.notEqual(result.status, 0, `${label} compiler mount unexpectedly started`);
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, pattern, `${label} failure was not explicit: ${output}`);
}

async function assertMalformedMountsFail() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "typr-invalid-compiler-assets-"));
  try {
    const symlinkFixture = path.join(fixtureRoot, "symlink");
    await mkdir(symlinkFixture);
    await symlink("/etc/passwd", path.join(symlinkFixture, "manifest.json"));
    await expectInvalidMount({ fixture: symlinkFixture, pattern: /symlink|special file/i, label: "symlink" });

    const fifoFixture = path.join(fixtureRoot, "fifo");
    await mkdir(fifoFixture);
    const fifoResult = spawnSync("mkfifo", [path.join(fifoFixture, "manifest.json")], { encoding: "utf8" });
    if (fifoResult.status !== 0) throw new Error(`mkfifo failed: ${fifoResult.stderr}`);
    await expectInvalidMount({ fixture: fifoFixture, pattern: /symlink|special file/i, label: "fifo" });

    const incompleteFixture = path.join(fixtureRoot, "incomplete");
    await mkdir(incompleteFixture);
    await copyFile(path.join(projectRoot, "compiler-assets.lock.json"), path.join(incompleteFixture, "manifest.json"));
    await writeFile(path.join(incompleteFixture, "unexpected.txt"), "unexpected\n");
    await chmod(incompleteFixture, 0o755);
    await expectInvalidMount({ fixture: incompleteFixture, pattern: /missing or unexpected files/i, label: "incomplete" });

    const corruptFile = path.join(fixtureRoot, "corrupt-pipeline.js");
    await writeFile(corruptFile, "corrupt\n");
    await expectInvalidMount({
      fixture: mountedAssets,
      mounts: ["--mount", `type=bind,src=${corruptFile},dst=/compiler-assets/core/busytex/busytex_pipeline.js,readonly`],
      pattern: /size validation|checksum validation/i,
      label: "corrupt"
    });

    const writableOverlay = path.join(fixtureRoot, "writable-busytex.js");
    await copyFile(path.join(mountedAssets, "core", "busytex", "busytex.js"), writableOverlay);
    await expectInvalidMount({
      fixture: mountedAssets,
      mounts: ["--mount", `type=bind,src=${writableOverlay},dst=/compiler-assets/core/busytex/busytex.js`],
      pattern: /nested mounts must be read-only/i,
      label: "nested-rw"
    });

    const rwName = `typr-invalid-rw-${runId}`;
    containers.add(rwName);
    const rwResult = docker([
      "run", "--name", rwName, "--network", "none", "--read-only", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
      "--env", "TYPR_COMPILER_ASSETS_MODE=local", "--volume", `${mountedAssets}:/compiler-assets:rw`, liteImage
    ], { allowFailure: true, timeout: 15_000 });
    assert.notEqual(rwResult.status, 0, "read-write compiler mount unexpectedly started");
    assert.match(`${rwResult.stdout}${rwResult.stderr}`, /read-only/i);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function main() {
  assertImageMetadata(liteImage, "lite");
  assertImageMetadata(fullImage, "full");
  assertSharedAppFiles();

  const fullName = `typr-full-${runId}`;
  docker([...hardenedRunArgs(fullName), fullImage]);
  containers.add(fullName);
  waitForHealthy(fullName);
  assertBaseRuntime(fullName);
  assertLocalCompilerRuntime(fullName);

  const liteLocalName = `typr-lite-local-${runId}`;
  docker([
    ...hardenedRunArgs(liteLocalName),
    "--env", "TYPR_COMPILER_ASSETS_MODE=local",
    "--volume", `${mountedAssets}:/compiler-assets:ro`,
    liteImage
  ]);
  containers.add(liteLocalName);
  waitForHealthy(liteLocalName);
  assertBaseRuntime(liteLocalName);
  assertLocalCompilerRuntime(liteLocalName);

  const liteOfflineName = `typr-lite-r2-offline-${runId}`;
  docker([...hardenedRunArgs(liteOfflineName), liteImage]);
  containers.add(liteOfflineName);
  waitForHealthy(liteOfflineName);
  assertBaseRuntime(liteOfflineName);
  assertOfflineR2DegradesSafely(liteOfflineName);

  if (skipR2) {
    console.warn("TYPR_SKIP_R2=1: live immutable R2 verification was explicitly skipped; this is not a release-complete gate.");
  } else {
    const liteR2Name = `typr-lite-r2-${runId}`;
    docker([...hardenedRunArgs(liteR2Name, "bridge"), liteImage]);
    containers.add(liteR2Name);
    waitForHealthy(liteR2Name);
    assertBaseRuntime(liteR2Name);
    assertR2CompilerRuntime(liteR2Name);
  }

  await assertMalformedMountsFail();
  console.log(`Typr Docker validation passed for full, lite/local, and lite/R2${skipR2 ? " (offline only)" : ""}.`);
}

try {
  await main();
} finally {
  for (const name of containers) docker(["rm", "-f", name], { allowFailure: true });
}
