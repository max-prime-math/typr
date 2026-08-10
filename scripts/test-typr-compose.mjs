#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const lock = JSON.parse(await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8"));
const fullImage = process.env.TYPR_FULL_IMAGE || "typr:stage4-full";
const liteImage = process.env.TYPR_LITE_IMAGE || "typr:stage4-lite";
const assetsValue = process.env.TYPR_COMPILER_ASSETS_DIR?.trim();
const configOnly = process.argv.includes("--config-only");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
    env: { ...process.env, ...options.env }
  });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`${command} ${args.join(" ")} timed out.`);
  }
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  }
  return result;
}

function composeFiles(localAssets = false) {
  return localAssets
    ? ["-f", "compose.yaml", "-f", "compose.local-assets.yaml"]
    : ["-f", "compose.yaml"];
}

function readComposeConfig({ image, localAssets = false }) {
  const env = { TYPR_IMAGE: image };
  if (localAssets) env.TYPR_COMPILER_ASSETS_DIR = assetsValue || "/tmp/typr-compiler-assets-contract";
  const result = run("docker", ["compose", ...composeFiles(localAssets), "config", "--format", "json"], { env });
  return JSON.parse(result.stdout);
}

function assertBaseConfig(config, image) {
  const service = config.services.typr;
  assert.equal(service.image, image);
  assert.equal(service.user, "101:101");
  assert.equal(service.read_only, true);
  assert.deepEqual(service.cap_drop, ["ALL"]);
  assert.deepEqual(service.security_opt, ["no-new-privileges:true"]);
  assert.ok(service.tmpfs.includes("/tmp:rw,nosuid,nodev,noexec,size=33554432"));
  assert.equal(service.pids_limit, 64);
  assert.equal(service.mem_limit, "268435456");
  assert.equal(service.memswap_limit, "268435456");
  assert.equal(service.cpus, 1);
  assert.equal(service.stop_grace_period, "10s");
  assert.deepEqual(service.ports, [{
    mode: "ingress",
    host_ip: "127.0.0.1",
    target: 8080,
    published: "8080",
    protocol: "tcp"
  }]);
  assert.equal(service.build, undefined);
}

const fullConfig = readComposeConfig({ image: fullImage });
assertBaseConfig(fullConfig, fullImage);
assert.equal(fullConfig.services.typr.volumes, undefined, "Typr must not receive a project or appdata volume");

const liteConfig = readComposeConfig({ image: liteImage });
assertBaseConfig(liteConfig, liteImage);
assert.equal(liteConfig.services.typr.environment, undefined, "The image must retain its own safe compiler-mode default");
assert.equal(liteConfig.services.typr.volumes, undefined);

const localConfig = readComposeConfig({ image: liteImage, localAssets: true });
assertBaseConfig(localConfig, liteImage);
assert.equal(localConfig.services.typr.environment.TYPR_COMPILER_ASSETS_MODE, "local");
assert.deepEqual(localConfig.services.typr.volumes, [{
  type: "bind",
  source: assetsValue || "/tmp/typr-compiler-assets-contract",
  target: "/compiler-assets",
  read_only: true,
  bind: { create_host_path: false }
}]);

const missingAssets = run("docker", [
  "compose", ...composeFiles(true), "config", "--quiet"
], {
  allowFailure: true,
  env: { TYPR_COMPILER_ASSETS_DIR: "" }
});
assert.notEqual(missingAssets.status, 0, "local-assets Compose must reject an unset host directory");

if (configOnly) {
  console.log("Typr Compose configuration validation passed.");
  process.exit(0);
}

if (!assetsValue) {
  throw new Error("TYPR_COMPILER_ASSETS_DIR is required for the full Compose smoke matrix.");
}

function assertRuntime(containerId, { localAssets }) {
  const inspected = JSON.parse(run("docker", ["inspect", containerId]).stdout)[0];
  assert.equal(inspected.Config.User, "101:101");
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(inspected.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(inspected.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(inspected.HostConfig.PidsLimit, 64);
  assert.equal(inspected.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(inspected.HostConfig.MemorySwap, 256 * 1024 * 1024);
  assert.equal(inspected.HostConfig.NanoCpus, 1_000_000_000);
  assert.equal(inspected.NetworkSettings.Ports["8080/tcp"][0].HostIp, "127.0.0.1");
  const compilerMount = inspected.Mounts.find((mount) => mount.Destination === "/compiler-assets");
  if (localAssets) {
    assert.ok(compilerMount, "lite/local Compose did not mount compiler assets");
    assert.equal(compilerMount.RW, false);
    assert.equal(path.resolve(compilerMount.Source), path.resolve(assetsValue));
  } else {
    assert.equal(compilerMount, undefined);
  }
}

function smokeVariant({ label, image, localAssets = false }) {
  const projectName = `typr-compose-${label}-${process.pid}-${Date.now()}`.toLowerCase();
  const files = composeFiles(localAssets);
  const env = {
    TYPR_IMAGE: image,
    TYPR_PORT: "0"
  };
  if (localAssets) env.TYPR_COMPILER_ASSETS_DIR = assetsValue;
  const baseArgs = ["compose", "--project-name", projectName, ...files];
  try {
    run("docker", [...baseArgs, "up", "-d", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "120"], {
      env,
      timeout: 180_000
    });
    const containerId = run("docker", [...baseArgs, "ps", "-q", "typr"], { env }).stdout.trim();
    assert.ok(containerId, `${label} Compose service has no container ID`);
    assertRuntime(containerId, { localAssets });
    const checks = [
      "set -eu",
      "test \"$(wget -q -O - http://127.0.0.1:8080/healthz)\" = ok",
      "wget -q -O /tmp/release.json http://127.0.0.1:8080/release.json",
      "grep -q '\"commit\"' /tmp/release.json",
      `wget -q -O /tmp/compiler-manifest.json http://127.0.0.1:8080/compiler-assets/${lock.releaseId}/manifest.json`,
      "cmp /tmp/compiler-manifest.json /etc/typr/compiler-assets-manifest.json"
    ].join("\n");
    run("docker", [...baseArgs, "exec", "-T", "typr", "sh", "-c", checks], {
      env,
      timeout: 180_000
    });
  } finally {
    run("docker", [...baseArgs, "down", "--remove-orphans", "--volumes", "--timeout", "10"], {
      allowFailure: true,
      env,
      timeout: 60_000
    });
  }
}

smokeVariant({ label: "full", image: fullImage });
smokeVariant({ label: "lite-r2", image: liteImage });
smokeVariant({ label: "lite-local", image: liteImage, localAssets: true });

console.log("Typr Compose validation passed for full, lite/R2, and lite/local.");
