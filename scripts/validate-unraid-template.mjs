#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const templatePath = path.join(projectRoot, "unraid", "typr.xml");
const profilePath = path.join(projectRoot, "ca_profile.xml");
const submissionReady = process.argv.includes("--submission-ready");

function parseXml(filePath) {
  const source = [
    "import json, sys, xml.etree.ElementTree as ET",
    "root = ET.parse(sys.argv[1]).getroot()",
    "print(json.dumps({'tag': root.tag, 'attributes': root.attrib, 'children': [{'tag': child.tag, 'attributes': child.attrib, 'text': child.text or ''} for child in root]}))"
  ].join("; ");
  const result = spawnSync("python3", ["-c", source, filePath], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`XML parsing failed for ${filePath}:\n${result.stdout}${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function one(document, tag) {
  const matches = document.children.filter((child) => child.tag === tag);
  assert.equal(matches.length, 1, `expected one <${tag}>`);
  return matches[0];
}

const template = parseXml(templatePath);
assert.equal(template.tag, "Container");
assert.equal(template.attributes.version, "2");
assert.equal(one(template, "Name").text, "Typr");
assert.equal(one(template, "Repository").text, "ghcr.io/max-prime-math/typr:latest");
assert.equal(one(template, "Network").text, "bridge");
assert.equal(one(template, "Privileged").text, "false");
assert.equal(one(template, "Category").text, "Tools:Utilities");
assert.equal(one(template, "TemplateURL").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/unraid/typr.xml");
assert.match(one(template, "Overview").text, /browser storage/i);
assert.match(one(template, "Description").text, /never expose.+public Internet/i);
assert.match(one(template, "Description").text, /not a network security boundary/i);
assert.match(one(template, "Requires").text, /Never expose.+public Internet/i);
assert.match(one(template, "Requires").text, /scheme, host, and port/i);

const requiredExtraParams = new Set([
  "--restart=unless-stopped",
  "--user=101:101",
  "--read-only",
  "--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=33554432",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges:true",
  "--pids-limit=64",
  "--memory=256m",
  "--memory-swap=256m",
  "--cpus=1"
]);
const actualExtraParams = new Set(one(template, "ExtraParams").text.trim().split(/\s+/));
assert.deepEqual(actualExtraParams, requiredExtraParams);

const configs = template.children.filter((child) => child.tag === "Config");
assert.equal(configs.length, 3);
const port = configs.find((config) => config.attributes.Target === "8080");
assert.ok(port);
assert.equal(port.attributes.Type, "Port");
assert.equal(port.attributes.Mode, "tcp");
assert.equal(port.text, "8080");
const mode = configs.find((config) => config.attributes.Target === "TYPR_COMPILER_ASSETS_MODE");
assert.ok(mode);
assert.equal(mode.attributes.Type, "Variable");
assert.equal(mode.text, "local");
const compilerPath = configs.find((config) => config.attributes.Target === "/compiler-assets");
assert.ok(compilerPath);
assert.equal(compilerPath.attributes.Type, "Path");
assert.equal(compilerPath.attributes.Mode, "ro");
assert.equal(compilerPath.attributes.Required, "false");
assert.equal(compilerPath.text, "");

const templateSource = await readFile(templatePath, "utf8");
assert.doesNotMatch(templateSource, /docker\.sock|<Privileged>true<\/Privileged>|<Network>host<\/Network>/i);

const profile = parseXml(profilePath);
assert.equal(profile.tag, "CommunityApplications");
assert.ok(one(profile, "Profile").text.trim().length > 40);
assert.equal(one(profile, "WebPage").text, "https://github.com/max-prime-math/typr");
assert.equal(one(profile, "Icon").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/public/icons/icon-512.png");

if (submissionReady) {
  const support = one(template, "Support").text;
  const forums = profile.children.filter((child) => child.tag === "Forum");
  assert.equal(support, "https://github.com/max-prime-math/typr/issues");
  assert.ok(forums.length <= 1, "ca_profile.xml may contain at most one optional <Forum> support link");
  if (forums.length === 1) assert.equal(forums[0].text, support);
}

console.log(`Typr Unraid template and Community Applications profile validation passed${submissionReady ? " for submission" : " (submission support gate not requested)"}.`);
