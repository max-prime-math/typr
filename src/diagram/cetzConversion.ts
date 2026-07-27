import type { TylaxCheckSummary } from "./tylaxTypes";

const SUPPORTED_TOP_LEVEL_COMMANDS = new Set([
  "clip",
  "coordinate",
  "draw",
  "fill",
  "filldraw",
  "foreach",
  "node",
  "path"
]);
const CETZ_DRAW_COMMAND_PATTERN =
  /^\s*(?:arc|bezier|circle|content|ellipse|grid|line|rect)\s*\(/gm;

export interface CetzConversionAssessment {
  blockers: string[];
  sourceCommands: string[];
  warnings: string[];
}

export function assessCetzConversion(
  source: string,
  cetz: string,
  diagnostics: TylaxCheckSummary
): CetzConversionAssessment {
  const sourceCommands = collectTopLevelTikzCommands(source);
  const unsupportedCommands = sourceCommands.filter(
    (command) => !SUPPORTED_TOP_LEVEL_COMMANDS.has(command)
  );
  const blockers: string[] = [];

  if (!hasSingleTikzPicture(source)) {
    blockers.push("The source must contain exactly one tikzpicture environment.");
  }
  if (diagnostics.has_errors || diagnostics.errors.length > 0) {
    blockers.push(...diagnostics.errors);
  }
  if (unsupportedCommands.length > 0) {
    blockers.push(
      `Unsupported top-level TikZ command${unsupportedCommands.length === 1 ? "" : "s"}: ` +
      unsupportedCommands.map((command) => `\\${command}`).join(", ")
    );
  }
  if (!cetz.trim() || !cetz.includes("#canvas")) {
    blockers.push("Tylax did not produce a CeTZ canvas.");
  }

  const visibleSourceCommands = sourceCommands.filter(
    (command) => command !== "coordinate"
  );
  const renderedCommandCount = [...cetz.matchAll(CETZ_DRAW_COMMAND_PATTERN)].length;
  if (visibleSourceCommands.length > 0 && renderedCommandCount === 0) {
    blockers.push("Tylax produced no renderable CeTZ drawing commands.");
  }

  return {
    blockers: deduplicate(blockers),
    sourceCommands,
    warnings: deduplicate([...diagnostics.warnings, ...diagnostics.infos])
  };
}

export function buildCetzValidationSource(cetz: string): string {
  return [
    "#set page(width: auto, height: auto, margin: 0pt, fill: none)",
    cetz.trim(),
    ""
  ].join("\n");
}

export function collectTopLevelTikzCommands(source: string): string[] {
  const body = extractTikzPictureBody(stripLatexComments(source));
  if (body === null) {
    return [];
  }

  const commands: string[] = [];
  let braceDepth = 0;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "{") {
      braceDepth += 1;
      continue;
    }
    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (character !== "\\" || braceDepth !== 0) {
      continue;
    }

    const commandMatch = /^\\([a-zA-Z@]+)/.exec(body.slice(index));
    if (!commandMatch) {
      continue;
    }

    commands.push(commandMatch[1].toLowerCase());
    index += commandMatch[0].length - 1;
  }

  return commands;
}

function hasSingleTikzPicture(source: string): boolean {
  const commentlessSource = stripLatexComments(source);
  return (
    countMatches(commentlessSource, /\\begin\s*\{tikzpicture}/g) === 1 &&
    countMatches(commentlessSource, /\\end\s*\{tikzpicture}/g) === 1
  );
}

function extractTikzPictureBody(source: string): string | null {
  const beginMatch = /\\begin\s*\{tikzpicture}/.exec(source);
  const endPattern = /\\end\s*\{tikzpicture}/g;
  let endMatch: RegExpExecArray | null = null;

  for (const match of source.matchAll(endPattern)) {
    endMatch = match;
  }

  if (!beginMatch || beginMatch.index == null || !endMatch?.index) {
    return null;
  }

  const bodyStart = beginMatch.index + beginMatch[0].length;
  return source.slice(bodyStart, endMatch.index);
}

function stripLatexComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") {
          continue;
        }

        let slashCount = 0;
        for (
          let slashIndex = index - 1;
          slashIndex >= 0 && line[slashIndex] === "\\";
          slashIndex -= 1
        ) {
          slashCount += 1;
        }

        if (slashCount % 2 === 0) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
