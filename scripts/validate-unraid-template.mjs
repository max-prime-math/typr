#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const templatePath = path.join(projectRoot, "templates", "typr.xml");
const companionTemplatePath = path.join(projectRoot, "templates", "typr-server.xml");
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
assert.equal(one(template, "TemplateURL").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/templates/typr.xml");
assert.equal(one(template, "Icon").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/public/icons/icon-512.png");
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

const companion = parseXml(companionTemplatePath);
assert.equal(companion.tag, "Container");
assert.equal(companion.attributes.version, "2");
assert.equal(one(companion, "Name").text, "Typr-Server");
assert.equal(one(companion, "Repository").text, "ghcr.io/max-prime-math/typr-server:latest");
assert.equal(one(companion, "Network").text, "bridge");
assert.equal(one(companion, "Privileged").text, "false");
assert.equal(one(companion, "Category").text, "Tools:Utilities");
assert.equal(one(companion, "TemplateURL").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/templates/typr-server.xml");
assert.equal(one(companion, "Icon").text, "https://raw.githubusercontent.com/max-prime-math/typr/main/public/icons/icon-512.png");
assert.match(one(companion, "Overview").text, /Stateless by default/i);
assert.match(one(companion, "Description").text, /never be exposed.+public Internet/i);
assert.match(one(companion, "Description").text, /stateless fallback/i);
assert.match(one(companion, "Requires").text, /Never expose.+public Internet/i);
assert.match(one(companion, "Requires").text, /Landlock/i);

const companionRequiredExtraParams = new Set([
  "--restart=unless-stopped",
  "--user=1000:1000",
  "--read-only",
  "--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=536870912",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges:true",
  "--pids-limit=256",
  "--memory=2g",
  "--memory-swap=2g",
  "--cpus=2"
]);
const companionExtraParams = new Set(one(companion, "ExtraParams").text.trim().split(/\s+/));
assert.deepEqual(companionExtraParams, companionRequiredExtraParams);

const companionConfigs = companion.children.filter((child) => child.tag === "Config");
assert.equal(companionConfigs.length, 6);
const companionConfigByTarget = new Map(companionConfigs.map((config) => [config.attributes.Target, config]));
assert.equal(companionConfigByTarget.get("8484")?.attributes.Mode, "tcp");
assert.equal(companionConfigByTarget.get("8484")?.text, "8484");
assert.match(companionConfigByTarget.get("TYPR_COMPANION_ALLOWED_ORIGINS")?.attributes.Description || "", /CORS is not authentication/i);
assert.equal(companionConfigByTarget.get("TYPR_COMPANION_ALLOW_UNSANDBOXED_STATELESS")?.text, "1");
assert.match(companionConfigByTarget.get("TYPR_COMPANION_ALLOW_UNSANDBOXED_STATELESS")?.attributes.Description || "", /no host workspace is mounted/i);
assert.equal(companionConfigByTarget.get("/workspace")?.attributes.Mode, "rw");
assert.equal(companionConfigByTarget.get("/workspace")?.attributes.Required, "false");
assert.equal(companionConfigByTarget.get("/workspace")?.text, "");
assert.equal(companionConfigByTarget.get("TYPR_COMPANION_WORKSPACE_ROOT")?.text, "");
assert.equal(companionConfigByTarget.get("TYPR_COMPANION_WORKSPACE_ID")?.text, "unraid-workspace");

const companionTemplateSource = await readFile(companionTemplatePath, "utf8");
assert.doesNotMatch(companionTemplateSource, /docker\.sock|<Privileged>true<\/Privileged>|<Network>host<\/Network>/i);

const profile = parseXml(profilePath);
assert.equal(profile.tag, "CommunityApplications");
assert.ok(one(profile, "Profile").text.trim().length > 40);
assert.match(one(profile, "Profile").text, /max\.prime/i);
assert.equal(one(profile, "WebPage").text, "https://github.com/max-prime-math");
assert.equal(one(profile, "Icon").text, "https://avatars.githubusercontent.com/u/2055716?v=4");

if (submissionReady) {
  const support = one(template, "Support").text;
  const companionSupport = one(companion, "Support").text;
  const forums = profile.children.filter((child) => child.tag === "Forum");
  assert.equal(support, "https://forums.unraid.net/topic/200226-support-typr-typr-server/");
  assert.equal(companionSupport, support);
  assert.ok(forums.length <= 1, "ca_profile.xml may contain at most one optional <Forum> support link");
  if (forums.length === 1) assert.equal(forums[0].text, support);
}

console.log(`Typr and Typr Server Unraid templates and Community Applications profile validation passed${submissionReady ? " for submission" : " (submission support gate not requested)"}.`);
