#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const image = process.env.TYPR_SELF_HOSTED_IMAGE || "typr:stage4-lite";
const mountedAssets = process.env.TYPR_COMPILER_ASSETS_DIR?.trim();
const name = `typr-self-hosted-e2e-${process.pid}-${Date.now()}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  }
  return result;
}

function waitForHealthy() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const state = JSON.parse(run("docker", ["inspect", name, "--format", "{{json .State}}"])
      .stdout.trim());
    if (state.Status === "exited" || state.Status === "dead") {
      throw new Error(`Container exited during startup (${state.ExitCode}):\n${run("docker", ["logs", name], { allowFailure: true }).stdout}`);
    }
    if (state.Health?.Status === "healthy") return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("Self-hosted E2E container did not become healthy.");
}

try {
  const args = [
    "run", "-d", "--name", name, "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=32m",
    "--pids-limit", "64", "--memory", "256m", "--cpus", "1",
    "-p", "127.0.0.1::8080"
  ];
  if (mountedAssets) {
    args.push(
      "--env", "TYPR_COMPILER_ASSETS_MODE=local",
      "--volume", `${path.resolve(mountedAssets)}:/compiler-assets:ro`
    );
  }
  args.push(image);
  run("docker", args);
  waitForHealthy();
  const binding = run("docker", ["port", name, "8080/tcp"]).stdout.trim();
  const port = binding.slice(binding.lastIndexOf(":") + 1);
  if (!/^\d+$/.test(port)) throw new Error(`Could not resolve published container port from ${binding}.`);
  const result = run(path.join(projectRoot, "node_modules", ".bin", "playwright"), [
    "test", "--config=playwright.self-hosted.config.ts"
  ], {
    allowFailure: true,
    env: { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}/` },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const accessLog = run("docker", ["logs", name]).stdout;
    if (!/\/compiler-assets\/[^ ]+\/typst\/typst_ts_web_compiler_bg\.wasm/.test(accessLog)) {
      throw new Error("Successful browser compile did not request the pinned Typst compiler from the container.");
    }
  }
} finally {
  run("docker", ["rm", "-f", name], { allowFailure: true });
}
