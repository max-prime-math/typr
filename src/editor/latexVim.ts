import {
  ensureSyntaxTree,
  foldAll,
  foldCode,
  syntaxTree,
  toggleFold,
  unfoldAll,
  unfoldCode
} from "@codemirror/language";
import { Facet, type ChangeSpec, type EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { latexLanguage } from "codemirror-lang-latex";
import {
  Vim,
  type CodeMirrorV,
  type MotionArgs,
  type Pos
} from "@replit/codemirror-vim";
import type { SyntaxNode, Tree } from "@lezer/common";
import type { VimLatexPreferences } from "../app/appState";

export type VimLatexStructuralKind = "command" | "environment" | "math";
export type VimLatexTextObjectKind = VimLatexStructuralKind | "section" | "item";
export type VimLatexMotionKind = "section" | "environment" | "math";

export interface VimLatexCallbacks {
  onContextHelp?: (query: string) => void;
  onNavigateDiagnostic?: (direction: -1 | 1) => void;
  onOpenFile?: (reference: string) => void;
}

export interface VimLatexConfiguration {
  callbacks?: VimLatexCallbacks;
  preferences: VimLatexPreferences;
}

export interface VimLatexRange {
  from: number;
  to: number;
}

const DISABLED_PREFERENCES: VimLatexPreferences = {
  enabled: false,
  textObjects: false,
  motions: false,
  structuralEditing: false,
  completion: false,
  projectNavigation: false,
  diagnosticNavigation: false,
  folding: false,
  packageIntelligence: false
};

export const vimLatexConfiguration = Facet.define<
  VimLatexConfiguration,
  VimLatexConfiguration
>({
  combine(values) {
    return values.at(-1) ?? { preferences: DISABLED_PREFERENCES };
  }
});

export function createVimLatexExtension(
  preferences: VimLatexPreferences,
  callbacks?: VimLatexCallbacks
): Extension {
  return [
    vimLatexConfiguration.of({ callbacks, preferences }),
    ViewPlugin.define(() => {
      retainVimLatexMappings();
      return { destroy: releaseVimLatexMappings };
    })
  ];
}

const SECTION_NODE_NAMES = new Set([
  "Book",
  "Part",
  "Chapter",
  "Section",
  "SubSection",
  "SubSubSection",
  "Paragraph",
  "SubParagraph"
]);
const MATH_NODE_NAMES = new Set([
  "DollarMath",
  "DisplayMath",
  "ParenMath",
  "BracketMath"
]);
const ARGUMENT_NODE_NAMES = new Set([
  "TextArgument",
  "LongArg",
  "ShortArg",
  "MathArgument",
  "SectioningArgument",
  "NonEmptyGroup",
  "Group"
]);

function isOutermostMathNode(node: SyntaxNode): boolean {
  if (!MATH_NODE_NAMES.has(node.name)) {
    return false;
  }
  for (let current = node.parent; current; current = current.parent) {
    if (MATH_NODE_NAMES.has(current.name)) {
      return false;
    }
  }
  return true;
}

function isEnvironmentNode(node: SyntaxNode): boolean {
  return (
    node.name === "Environment" ||
    node.name === "KnownEnvironment" ||
    (node.name.endsWith("Environment") && node.name !== "BeginEnv" && node.name !== "EndEnv")
  );
}

function getTree(state: EditorState, through: number): Tree {
  return ensureSyntaxTree(state, Math.min(state.doc.length, through), 25) ?? syntaxTree(state);
}

function ancestors(node: SyntaxNode | null): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let current = node; current; current = current.parent) {
    result.push(current);
  }
  return result;
}

function findAncestor(
  state: EditorState,
  position: number,
  predicate: (node: SyntaxNode) => boolean,
  options: { outermost?: boolean } = {}
): SyntaxNode | null {
  const tree = getTree(state, position);
  const matches = ancestors(tree.resolveInner(position, -1)).filter(predicate);
  return options.outermost ? matches.at(-1) ?? null : matches[0] ?? null;
}

function childNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) {
      return child;
    }
  }
  return null;
}

function descendants(node: SyntaxNode, predicate: (node: SyntaxNode) => boolean): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  const cursor = node.cursor();
  cursor.iterate((current) => {
    if (current.from !== node.from || current.to !== node.to || current.name !== node.name) {
      const candidate = current.node;
      if (predicate(candidate)) {
        result.push(candidate);
      }
    }
  });
  return dedupeNodes(result);
}

function dedupeNodes(nodes: SyntaxNode[]): SyntaxNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = `${node.name}:${node.from}:${node.to}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isSameNode(left: SyntaxNode | null, right: SyntaxNode): boolean {
  return Boolean(
    left &&
    left.name === right.name &&
    left.from === right.from &&
    left.to === right.to
  );
}

function closestAncestorNamed(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let current = node.parent; current; current = current.parent) {
    if (current.name === name) {
      return current;
    }
  }
  return null;
}

function closestCommandAncestor(node: SyntaxNode): SyntaxNode | null {
  for (let current = node.parent; current; current = current.parent) {
    if (current.name === "Command" || current.name === "SectioningCommand") {
      return current;
    }
  }
  return null;
}

function enclosedByBraces(state: EditorState, node: SyntaxNode): VimLatexRange | null {
  const text = state.doc.sliceString(node.from, node.to);
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  return open >= 0 && close > open
    ? { from: node.from + open + 1, to: node.from + close }
    : null;
}

function findCommandNode(state: EditorState, position: number): SyntaxNode | null {
  return findAncestor(
    state,
    position,
    (node) => node.name === "Command" || node.name === "SectioningCommand"
  );
}

function findCommandArgument(
  state: EditorState,
  command: SyntaxNode,
  position: number
): VimLatexRange | null {
  const candidates = descendants(
    command,
    (node) =>
      ARGUMENT_NODE_NAMES.has(node.name) &&
      enclosedByBraces(state, node) !== null &&
      isSameNode(closestCommandAncestor(node), command)
  ).sort((left, right) => {
    const leftContains = left.from <= position && position <= left.to ? 0 : 1;
    const rightContains = right.from <= position && position <= right.to ? 0 : 1;
    if (leftContains !== rightContains) {
      return leftContains - rightContains;
    }
    if (leftContains === 0) {
      return left.to - left.from - (right.to - right.from);
    }
    return left.from - right.from || left.to - right.to;
  });
  return candidates.length > 0 ? enclosedByBraces(state, candidates[0]) : null;
}

function findEnvironmentNode(state: EditorState, position: number): SyntaxNode | null {
  const matches = ancestors(getTree(state, position).resolveInner(position, -1)).filter(isEnvironmentNode);
  if (matches.length > 0) {
    // Known environments have a wrapper and a specialized node with identical
    // bounds. Prefer the specialized/innermost node.
    return matches[0];
  }
  return null;
}

function findEnvironmentInner(node: SyntaxNode): VimLatexRange | null {
  const begin = descendants(node, (candidate) => candidate.name === "BeginEnv")[0];
  const end = descendants(node, (candidate) => candidate.name === "EndEnv").at(-1);
  return begin && end && begin.to <= end.from ? { from: begin.to, to: end.from } : null;
}

function findMathNode(state: EditorState, position: number): SyntaxNode | null {
  const matches = ancestors(getTree(state, position).resolveInner(position, -1)).filter((node) =>
    MATH_NODE_NAMES.has(node.name)
  );
  if (matches.length > 0) {
    return matches.at(-1) ?? null;
  }
  const environment = findEnvironmentNode(state, position);
  return environment && /Equation|Math/.test(environment.name) ? environment : null;
}

function mathInnerRange(
  state: EditorState,
  node: VimLatexRange,
  environmentNode?: SyntaxNode
): VimLatexRange | null {
  if (environmentNode) {
    return findEnvironmentInner(environmentNode);
  }
  const text = state.doc.sliceString(node.from, node.to);
  if (text.startsWith("$$") && text.endsWith("$$") && text.length >= 4) {
    return { from: node.from + 2, to: node.to - 2 };
  }
  if (text.startsWith("$") && text.endsWith("$") && text.length >= 2) {
    return { from: node.from + 1, to: node.to - 1 };
  }
  if (
    ((text.startsWith("\\(") && text.endsWith("\\)")) ||
      (text.startsWith("\\[") && text.endsWith("\\]"))) &&
    text.length >= 4
  ) {
    return { from: node.from + 2, to: node.to - 2 };
  }
  return null;
}

function findSectionNode(state: EditorState, position: number): SyntaxNode | null {
  return findAncestor(state, position, (node) => SECTION_NODE_NAMES.has(node.name));
}

function findItemRange(state: EditorState, position: number, inner: boolean): VimLatexRange | null {
  const list = findAncestor(state, position, (node) => node.name === "ListEnvironment");
  if (!list) {
    return null;
  }
  const content = descendants(list, (node) => node.name === "Content")[0];
  const end = descendants(list, (node) => node.name === "EndEnv").at(-1)?.from ?? list.to;
  const items = descendants(
    list,
    (node) =>
      node.name === "Item" &&
      isSameNode(closestAncestorNamed(node, "ListEnvironment"), list)
  ).sort((a, b) => a.from - b.from);
  let index = -1;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const itemEnd = items[itemIndex + 1]?.from ?? end;
    if (items[itemIndex].from <= position && position < itemEnd) {
      index = itemIndex;
      break;
    }
  }
  if (index < 0 || !content) {
    return null;
  }
  return {
    from: inner ? items[index].to : items[index].from,
    to: items[index + 1]?.from ?? end
  };
}

export function findVimLatexTextObject(
  state: EditorState,
  position: number,
  kind: VimLatexTextObjectKind,
  inner: boolean
): VimLatexRange | null {
  if (kind === "command") {
    const command = findCommandNode(state, position);
    if (!command) return null;
    return inner ? findCommandArgument(state, command, position) : { from: command.from, to: command.to };
  }
  if (kind === "environment") {
    const environment = findEnvironmentNode(state, position);
    if (environment) {
      return inner ? findEnvironmentInner(environment) : { from: environment.from, to: environment.to };
    }
    const fallback = findFallbackEnvironment(state.doc.toString(), position);
    return fallback
      ? inner
        ? { from: fallback.innerFrom, to: fallback.innerTo }
        : { from: fallback.from, to: fallback.to }
      : null;
  }
  if (kind === "math") {
    const math = findMathNode(state, position);
    if (math) {
      return inner
        ? mathInnerRange(state, math, isEnvironmentNode(math) ? math : undefined)
        : { from: math.from, to: math.to };
    }
    const fallback = findFallbackMath(state.doc.toString(), position);
    if (!fallback) return null;
    return inner ? mathInnerRange(state, fallback) : fallback;
  }
  if (kind === "section") {
    const section = findSectionNode(state, position);
    if (!section) return null;
    const content = childNamed(section, "Content");
    return inner && content ? { from: content.from, to: content.to } : { from: section.from, to: section.to };
  }
  return findItemRange(state, position, inner);
}

function collectNodes(state: EditorState, predicate: (node: SyntaxNode) => boolean): SyntaxNode[] {
  const tree = getTree(state, state.doc.length);
  const nodes: SyntaxNode[] = [];
  tree.iterate({
    enter(node) {
      if (predicate(node.node)) {
        nodes.push(node.node);
      }
    }
  });
  return dedupeNodes(nodes);
}

function structuralPositions(state: EditorState, kind: VimLatexMotionKind): number[] {
  let positions: number[];
  if (kind === "section") {
    positions = collectNodes(state, (node) => SECTION_NODE_NAMES.has(node.name)).map((node) => node.from);
    positions.push(...fallbackSectionPositions(state.doc.toString()));
  } else if (kind === "environment") {
    positions = collectNodes(state, isEnvironmentNode).map((node) => node.from);
    positions.push(...fallbackEnvironmentPositions(state.doc.toString()));
  } else {
    positions = collectNodes(state, isOutermostMathNode).map((node) => node.from);
    positions.push(...fallbackMathPositions(state.doc.toString()));
  }
  return [...new Set(positions)].sort((left, right) => left - right);
}

export function findVimLatexMotionTarget(
  state: EditorState,
  position: number,
  kind: VimLatexMotionKind,
  direction: -1 | 1,
  count = 1
): number | null {
  const positions = structuralPositions(state, kind);
  const candidates = direction > 0
    ? positions.filter((candidate) => candidate > position)
    : positions.filter((candidate) => candidate < position).reverse();
  return candidates[Math.max(1, count) - 1] ?? null;
}

interface FallbackEnvironmentRange extends VimLatexRange {
  begin: VimLatexRange;
  beginName: VimLatexRange;
  end: VimLatexRange;
  endName: VimLatexRange;
  innerFrom: number;
  innerTo: number;
}

function findFallbackEnvironment(source: string, position: number): FallbackEnvironmentRange | null {
  const tokenPattern = /\\(begin|end)\s*\{([^{}]+)\}/g;
  const stack: Array<{
    from: number;
    name: string;
    nameFrom: number;
    nameTo: number;
    to: number;
  }> = [];
  const ranges: FallbackEnvironmentRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source))) {
    const nameOffset = match[0].indexOf(match[2]);
    const nameFrom = match.index + nameOffset;
    const nameTo = nameFrom + match[2].length;
    if (match[1] === "begin") {
      stack.push({ from: match.index, name: match[2], nameFrom, nameTo, to: tokenPattern.lastIndex });
      continue;
    }
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].name !== match[2]) continue;
      const begin = stack.splice(index, 1)[0];
      if (begin.from <= position && position <= tokenPattern.lastIndex) {
        ranges.push({
          begin: { from: begin.from, to: begin.to },
          beginName: { from: begin.nameFrom, to: begin.nameTo },
          end: { from: match.index, to: tokenPattern.lastIndex },
          endName: { from: nameFrom, to: nameTo },
          from: begin.from,
          innerFrom: begin.to,
          innerTo: match.index,
          to: tokenPattern.lastIndex
        });
      }
      break;
    }
  }
  return ranges.sort((a, b) => a.to - a.from - (b.to - b.from))[0] ?? null;
}

function findFallbackMath(source: string, position: number): VimLatexRange | null {
  const ranges: VimLatexRange[] = [];
  for (const [open, close] of [["\\[", "\\]"], ["\\(", "\\)"]] as const) {
    let start = source.indexOf(open);
    while (start >= 0) {
      const end = source.indexOf(close, start + open.length);
      if (end < 0) break;
      if (start <= position && position <= end + close.length) {
        ranges.push({ from: start, to: end + close.length });
      }
      start = source.indexOf(open, end + close.length);
    }
  }
  const dollarPattern = /(?<!\\)(\$\$|\$)/g;
  let opening: { delimiter: string; from: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = dollarPattern.exec(source))) {
    if (!opening) {
      opening = { delimiter: match[1], from: match.index };
    } else if (opening.delimiter === match[1]) {
      const range = { from: opening.from, to: dollarPattern.lastIndex };
      if (range.from <= position && position <= range.to) ranges.push(range);
      opening = null;
    }
  }
  const range = ranges.sort((a, b) => a.to - a.from - (b.to - b.from))[0];
  return range ?? null;
}

function fallbackSectionPositions(source: string): number[] {
  return [...source.matchAll(/\\(?:book|part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{/g)]
    .map((match) => match.index);
}

function fallbackEnvironmentPositions(source: string): number[] {
  return [...source.matchAll(/\\begin\s*\{[^{}]+\}/g)].map((match) => match.index);
}

function fallbackMathPositions(source: string): number[] {
  const positions = [...source.matchAll(/\\[([]/g)].map((match) => match.index);
  const dollarPattern = /(?<!\\)(\$\$|\$)/g;
  let opening: { delimiter: string; from: number } | null = null;
  let match: RegExpExecArray | null;

  while ((match = dollarPattern.exec(source))) {
    if (!opening) {
      opening = { delimiter: match[1], from: match.index };
      continue;
    }
    if (opening.delimiter === match[1]) {
      positions.push(opening.from);
      opening = null;
    }
  }

  return positions;
}

function configurationFor(cm: CodeMirrorV): VimLatexConfiguration {
  return cm.cm6.state.facet(vimLatexConfiguration);
}

function featureEnabled(cm: CodeMirrorV, feature: keyof VimLatexPreferences): boolean {
  const { preferences } = configurationFor(cm);
  const position = cm.cm6.state.selection.main.head;
  return Boolean(
    preferences.enabled &&
    preferences[feature] &&
    latexLanguage.isActiveAt(cm.cm6.state, Math.min(position, cm.cm6.state.doc.length))
  );
}

function toPos(cm: CodeMirrorV, offset: number): Pos {
  return cm.posFromIndex(offset);
}

function defineTextObject(keys: string, kind: VimLatexTextObjectKind, inner: boolean): void {
  const name = `typrLatexTextObject${kind}${inner ? "Inner" : "Around"}`;
  Vim.defineMotion(name, (cm, head, motionArgs) => {
    if (!featureEnabled(cm, "textObjects")) return null;
    const range = findVimLatexTextObject(cm.cm6.state, cm.indexFromPos(head), kind, inner);
    if (!range || range.from >= range.to) return null;
    if (kind === "section") motionArgs.linewise = true;
    return [toPos(cm, range.from), toPos(cm, range.to)];
  });
  Vim.mapCommand(keys, "motion", name, { textObjectInner: inner }, {});
}

function defineStructuralSelectionMotion(keys: string, kind: VimLatexStructuralKind): void {
  const name = `typrLatexStructuralSelection${kind}`;
  Vim.defineMotion(name, (cm, head) => {
    if (!featureEnabled(cm, "structuralEditing")) return null;
    const range = findVimLatexTextObject(cm.cm6.state, cm.indexFromPos(head), kind, false);
    return range ? [toPos(cm, range.from), toPos(cm, range.to)] : null;
  });
  Vim.mapCommand(keys, "motion", name, {}, {});
}

function defineStructuralMotion(keys: string, kind: VimLatexMotionKind, direction: -1 | 1): void {
  const name = `typrLatexMotion${kind}${direction > 0 ? "Next" : "Previous"}`;
  Vim.defineMotion(name, (cm, head, motionArgs: MotionArgs) => {
    if (!featureEnabled(cm, "motions")) return null;
    const target = findVimLatexMotionTarget(
      cm.cm6.state,
      cm.indexFromPos(head),
      kind,
      direction,
      motionArgs.repeat
    );
    return target === null ? null : toPos(cm, target);
  });
  Vim.mapCommand(keys, "motion", name, { forward: direction > 0, toJumplist: true }, {});
}

function environmentBoundaryNodes(node: SyntaxNode): { begin: SyntaxNode; end: SyntaxNode } | null {
  const begin = descendants(node, (candidate) => candidate.name === "BeginEnv")[0];
  const end = descendants(node, (candidate) => candidate.name === "EndEnv").at(-1);
  return begin && end ? { begin, end } : null;
}

function commandControlSequence(command: SyntaxNode): SyntaxNode | null {
  return descendants(command, (node) => node.name.endsWith("CtrlSeq") || node.name === "CtrlSeq")[0] ?? null;
}

function environmentNameNodes(environment: SyntaxNode): SyntaxNode[] {
  const boundaries = environmentBoundaryNodes(environment);
  if (!boundaries) {
    return [];
  }
  return [boundaries.begin, boundaries.end].flatMap((boundary) =>
    descendants(
      boundary,
      (node) => node.name.endsWith("EnvName") || node.name === "EnvName"
    )
  );
}

function structuralChanges(
  state: EditorState,
  position: number,
  kind: VimLatexStructuralKind,
  operation: "delete" | "toggle"
): ChangeSpec[] {
  if (kind === "command") {
    const command = findCommandNode(state, position);
    if (!command) return [];
    if (operation === "delete") {
      const inner = findCommandArgument(state, command, position);
      return inner
        ? [{ from: command.from, to: command.to, insert: state.doc.sliceString(inner.from, inner.to) }]
        : [];
    }
    const control = commandControlSequence(command);
    if (!control) return [];
    const hasStar = state.doc.sliceString(control.to, control.to + 1) === "*";
    return [hasStar ? { from: control.to, to: control.to + 1 } : { from: control.to, insert: "*" }];
  }

  const node = kind === "environment" ? findEnvironmentNode(state, position) : findMathNode(state, position);
  if (!node && kind === "environment") {
    const fallback = findFallbackEnvironment(state.doc.toString(), position);
    if (!fallback) return [];
    if (operation === "delete") {
      return [
        { from: fallback.begin.from, to: fallback.begin.to },
        { from: fallback.end.from, to: fallback.end.to }
      ];
    }
    return [fallback.beginName, fallback.endName].map((nameRange) => {
      const name = state.doc.sliceString(nameRange.from, nameRange.to);
      return name.endsWith("*")
        ? { from: nameRange.to - 1, to: nameRange.to }
        : { from: nameRange.to, insert: "*" };
    });
  }
  const fallbackMath = !node && kind === "math"
    ? findFallbackMath(state.doc.toString(), position)
    : null;
  if (!node && !fallbackMath) return [];
  if (kind === "environment" || (node !== null && isEnvironmentNode(node))) {
    if (!node) return [];
    const boundaries = environmentBoundaryNodes(node);
    if (!boundaries) return [];
    if (operation === "delete") {
      return [
        { from: boundaries.begin.from, to: boundaries.begin.to },
        { from: boundaries.end.from, to: boundaries.end.to }
      ];
    }
    return environmentNameNodes(node).map((nameNode) => {
      const name = state.doc.sliceString(nameNode.from, nameNode.to);
      return name.endsWith("*")
        ? { from: nameNode.to - 1, to: nameNode.to }
        : { from: nameNode.to, insert: "*" };
    });
  }

  const mathRange = node ?? fallbackMath;
  if (!mathRange) return [];
  const text = state.doc.sliceString(mathRange.from, mathRange.to);
  if (operation === "delete") {
    const inner = mathInnerRange(state, mathRange);
    if (!inner) return [];
    return [
      { from: mathRange.from, to: inner.from },
      { from: inner.to, to: mathRange.to }
    ];
  }
  if (text.startsWith("$$") && text.endsWith("$$")) {
    return [
      { from: mathRange.from, to: mathRange.from + 2, insert: "$" },
      { from: mathRange.to - 2, to: mathRange.to, insert: "$" }
    ];
  }
  if (text.startsWith("$") && text.endsWith("$")) {
    return [
      { from: mathRange.from, to: mathRange.from + 1, insert: "$$" },
      { from: mathRange.to - 1, to: mathRange.to, insert: "$$" }
    ];
  }
  if (text.startsWith("\\(") && text.endsWith("\\)")) {
    return [
      { from: mathRange.from, to: mathRange.from + 2, insert: "\\[" },
      { from: mathRange.to - 2, to: mathRange.to, insert: "\\]" }
    ];
  }
  if (text.startsWith("\\[") && text.endsWith("\\]")) {
    return [
      { from: mathRange.from, to: mathRange.from + 2, insert: "\\(" },
      { from: mathRange.to - 2, to: mathRange.to, insert: "\\)" }
    ];
  }
  return [];
}

export function getVimLatexStructuralChanges(
  state: EditorState,
  position: number,
  kind: VimLatexStructuralKind,
  operation: "delete" | "toggle"
): ChangeSpec[] {
  return structuralChanges(state, position, kind, operation);
}

function defineToggleAction(keys: string, kind: VimLatexStructuralKind): void {
  const name = `typrLatexToggle${kind}`;
  Vim.defineAction(name, (cm) => {
    if (!featureEnabled(cm, "structuralEditing")) return;
    const changes = structuralChanges(
      cm.cm6.state,
      cm.cm6.state.selection.main.head,
      kind,
      "toggle"
    );
    if (changes.length > 0) cm.cm6.dispatch({ changes, userEvent: "input" });
  });
  Vim.mapCommand(keys, "action", name, {}, { context: "normal", isEdit: true });
}

function defineViewAction(
  keys: string,
  name: string,
  feature: keyof VimLatexPreferences,
  command: (view: CodeMirrorV["cm6"]) => boolean
): void {
  Vim.defineAction(name, (cm) => {
    if (featureEnabled(cm, feature)) command(cm.cm6);
  });
  Vim.mapCommand(keys, "action", name, {}, { context: "normal" });
}

function referenceAt(state: EditorState, position: number): string | null {
  const argument = findAncestor(
    state,
    position,
    (node) => /(?:Input|Include|Subfile|FilePath|Graphics).*Argument/.test(node.name)
  );
  if (argument) {
    const parsed = state.doc
      .sliceString(argument.from, argument.to)
      .replace(/^[\s{]+|[\s}]+$/g, "");
    if (parsed) return parsed;
  }

  const source = state.doc.toString();
  const referencePattern = /\\(?:includegraphics|includesvg|addbibresource|bibliography|subfile|include|input)\s*(?:\[[^\]]*\]\s*)?(?:\{([^{}]+)\}|([^\s%{}]+))/g;
  let match: RegExpExecArray | null;
  while ((match = referencePattern.exec(source))) {
    if (match.index <= position && position <= referencePattern.lastIndex) {
      const bracedReference = match[1];
      if (bracedReference !== undefined) {
        const contentFrom = match.index + match[0].indexOf(bracedReference);
        const relativePosition = Math.max(
          0,
          Math.min(bracedReference.length, position - contentFrom)
        );
        const previousComma = bracedReference.lastIndexOf(",", Math.max(0, relativePosition - 1));
        const nextComma = bracedReference.indexOf(",", relativePosition);
        return bracedReference
          .slice(previousComma + 1, nextComma < 0 ? bracedReference.length : nextComma)
          .trim() || null;
      }
      return (match[2] ?? "").trim() || null;
    }
  }
  return null;
}

export function findVimLatexReference(state: EditorState, position: number): string | null {
  return referenceAt(state, position);
}

function helpQueryAt(state: EditorState, position: number): string | null {
  const node = findAncestor(
    state,
    position,
    (candidate) =>
      candidate.name.endsWith("CtrlSeq") ||
      candidate.name === "CtrlSeq" ||
      candidate.name.endsWith("EnvName") ||
      candidate.name === "EnvName"
  );
  return node ? state.doc.sliceString(node.from, node.to) : null;
}

const VIM_LATEX_REGISTRY_KEY = "__typrVimLatexRegistry" as const;
const VIM_LATEX_MAPPINGS = [
  ...["ic", "ac", "ie", "ae", "i$", "a$", "iP", "aP", "im", "am", "[[", "]]", "[m", "]m", "[n", "]n", "sc", "se", "s$"].map((keys) => ({ keys })),
  ...["tsc", "tse", "ts$", "gsc", "gse", "gs$", "zc", "zo", "za", "zM", "zR", "[q", "]q", "gf", "K"].map((keys) => ({ keys, context: "normal" }))
] as const;

interface VimLatexRegistry {
  activeViews: number;
  registered: boolean;
}

function vimLatexRegistry(): VimLatexRegistry {
  const vimWithRegistry = Vim as typeof Vim & {
    [VIM_LATEX_REGISTRY_KEY]?: VimLatexRegistry;
  };
  return vimWithRegistry[VIM_LATEX_REGISTRY_KEY] ??= {
    activeViews: 0,
    registered: false
  };
}

function retainVimLatexMappings(): void {
  const registry = vimLatexRegistry();
  registry.activeViews += 1;
  registerVimLatexCommands();
}

function releaseVimLatexMappings(): void {
  const registry = vimLatexRegistry();
  registry.activeViews = Math.max(0, registry.activeViews - 1);
  if (registry.activeViews > 0 || !registry.registered) return;

  const unmap = Vim.unmap as (keys: string, context?: string) => unknown;
  for (const mapping of VIM_LATEX_MAPPINGS) {
    unmap(mapping.keys, "context" in mapping ? mapping.context : undefined);
  }
  registry.registered = false;
}

export function registerVimLatexCommands(): void {
  const registry = vimLatexRegistry();
  if (registry.registered) return;
  registry.registered = true;

  for (const [keys, kind, inner] of [
    ["ic", "command", true], ["ac", "command", false],
    ["ie", "environment", true], ["ae", "environment", false],
    ["i$", "math", true], ["a$", "math", false],
    ["iP", "section", true], ["aP", "section", false],
    ["im", "item", true], ["am", "item", false]
  ] as const) {
    defineTextObject(keys, kind, inner);
  }

  defineStructuralMotion("[[", "section", -1);
  defineStructuralMotion("]]", "section", 1);
  defineStructuralMotion("[m", "environment", -1);
  defineStructuralMotion("]m", "environment", 1);
  defineStructuralMotion("[n", "math", -1);
  defineStructuralMotion("]n", "math", 1);

  // These operator-pending motions make dsc/dse/ds$ work with Vim's normal
  // delete operator, and also compose with c/y and registers/counts.
  defineStructuralSelectionMotion("sc", "command");
  defineStructuralSelectionMotion("se", "environment");
  defineStructuralSelectionMotion("s$", "math");

  // `t` is already Vim's till-character prefix in codemirror-vim. Register
  // the requested spellings, plus conflict-free `gs*` aliases that remain
  // usable with this Vim engine's eager two-key matcher.
  defineToggleAction("tsc", "command");
  defineToggleAction("tse", "environment");
  defineToggleAction("ts$", "math");
  defineToggleAction("gsc", "command");
  defineToggleAction("gse", "environment");
  defineToggleAction("gs$", "math");

  defineViewAction("zc", "typrLatexFoldClose", "folding", foldCode);
  defineViewAction("zo", "typrLatexFoldOpen", "folding", unfoldCode);
  defineViewAction("za", "typrLatexFoldToggle", "folding", toggleFold);
  defineViewAction("zM", "typrLatexFoldAll", "folding", foldAll);
  defineViewAction("zR", "typrLatexUnfoldAll", "folding", unfoldAll);

  for (const [keys, direction] of [["[q", -1], ["]q", 1]] as const) {
    const name = direction > 0 ? "typrLatexDiagnosticNext" : "typrLatexDiagnosticPrevious";
    Vim.defineAction(name, (cm) => {
      if (!featureEnabled(cm, "diagnosticNavigation")) return;
      configurationFor(cm).callbacks?.onNavigateDiagnostic?.(direction);
    });
    Vim.mapCommand(keys, "action", name, {}, { context: "normal" });
  }

  Vim.defineAction("typrLatexOpenFile", (cm) => {
    if (!featureEnabled(cm, "projectNavigation")) return;
    const reference = referenceAt(cm.cm6.state, cm.cm6.state.selection.main.head);
    if (reference) configurationFor(cm).callbacks?.onOpenFile?.(reference);
  });
  Vim.mapCommand("gf", "action", "typrLatexOpenFile", {}, { context: "normal" });

  Vim.defineAction("typrLatexContextHelp", (cm) => {
    if (!featureEnabled(cm, "packageIntelligence")) return;
    const query = helpQueryAt(cm.cm6.state, cm.cm6.state.selection.main.head);
    if (query) configurationFor(cm).callbacks?.onContextHelp?.(query);
  });
  Vim.mapCommand("K", "action", "typrLatexContextHelp", {}, { context: "normal" });
}
