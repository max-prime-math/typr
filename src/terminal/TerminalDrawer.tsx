import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  createBrowserBackend,
  createCloudContainerBackendPlaceholder,
  createLocalAgentBackendPlaceholder
} from "./browserBackend";
import { createRandomId } from "../utils/randomId";
import { buildProjectWorkspaceEntriesFromProject } from "../workspace/workspaceTree";
import type { TerminalBackend, TerminalProjectRuntime } from "./types";

const DEFAULT_RATIO = 0.35;
const MIN_HEIGHT = 160;
const PROMPT_SYMBOL = "❯";
const COMMAND_CANDIDATES = [
  "pwd",
  "cd",
  "ls",
  "tree",
  "cat",
  "less",
  "head",
  "tail",
  "wc",
  "mkdir",
  "touch",
  "rm",
  "cp",
  "mv",
  "grep",
  "rg",
  "find",
  "sort",
  "uniq",
  "sed",
  "echo",
  "clear",
  "history",
  "typst",
  "build",
  "clean",
  "export",
  "sync",
  "doctor",
  "help",
  "git"
] as const;

interface TerminalDrawerProps {
  isOpen: boolean;
  runtime: TerminalProjectRuntime;
  onClose: () => void;
}

interface TerminalEntry {
  id: string;
  text: string;
  tone: "command" | "stdout" | "stderr" | "system";
}

interface HighlightToken {
  text: string;
  tone:
    | "command"
    | "option"
    | "string"
    | "path"
    | "number"
    | "operator"
    | "plain";
}

export function TerminalDrawer({ isOpen, runtime, onClose }: TerminalDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const browserBackend = useMemo(() => createBrowserBackend(runtime), [runtime]);
  const localBackend = useMemo(() => createLocalAgentBackendPlaceholder(), []);
  const cloudBackend = useMemo(() => createCloudContainerBackendPlaceholder(), []);
  const initializedRef = useRef(false);

  useEffect(() => {
    return () => {
      browserBackend.dispose();
      localBackend.dispose();
      cloudBackend.dispose();
    };
  }, [browserBackend, cloudBackend, localBackend]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      setEntries([
        {
          id: createRandomId(),
          tone: "system",
          text: `Browser Shell ready in ${browserBackend.getCwd()}`
        }
      ]);
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [browserBackend, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const pane = containerRef.current?.parentElement;
    if (!pane || height !== null) {
      return;
    }

    setHeight(Math.max(MIN_HEIGHT, Math.round(pane.clientHeight * DEFAULT_RATIO)));
  }, [height, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [entries, isOpen]);

  function focusInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  async function submitCommand() {
    const command = inputValue.trim();

    if (!command || isRunning) {
      return;
    }

    setEntries((current) => [
      ...current,
      {
        id: createRandomId(),
        tone: "command",
        text: `${PROMPT_SYMBOL} ${command}`
      }
    ]);
    setHistory((current) => [...current, command]);
    setHistoryIndex(null);
    setInputValue("");
    setIsRunning(true);

    try {
      const result = await browserBackend.execute(command);
      setEntries((current) => {
        if (
          command === "clear" &&
          result.stderr.trim().length === 0 &&
          (result.stdout === "\u001b[2J\u001b[H" || result.stdout.trim().length === 0)
        ) {
          return [];
        }

        const next = [...current];

        if (result.stdout.trim().length > 0) {
          next.push({
            id: createRandomId(),
            tone: "stdout",
            text: result.stdout.replace(/\n$/, "")
          });
        }

        if (result.stderr.trim().length > 0) {
          next.push({
            id: createRandomId(),
            tone: "stderr",
            text: result.stderr.replace(/\n$/, "")
          });
        }

        return next;
      });
    } finally {
      setIsRunning(false);
      focusInput();
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const project = runtime.getProjectRepository();
      const completion = completeShellInput(
        inputValue,
        project ? buildProjectWorkspaceEntriesFromProject(project).map((entry) => entry.path) : []
      );
      if (completion !== null) {
        setInputValue(completion);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void submitCommand();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      inputRef.current?.blur();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }

      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputValue(history[nextIndex] ?? "");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }

      if (historyIndex === null) {
        return;
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInputValue("");
        return;
      }

      setHistoryIndex(nextIndex);
      setInputValue(history[nextIndex] ?? "");
    }
  }

  const backends: TerminalBackend[] = [browserBackend, localBackend, cloudBackend];
  const highlightedInput = highlightShellInput(inputValue);

  return (
    <div
      className={`terminal-drawer ${isOpen ? "terminal-drawer--open" : ""}`}
      onMouseDown={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        if (
          target === inputRef.current ||
          target.closest("button") ||
          target.closest(".terminal-drawer__resize-handle")
        ) {
          return;
        }

        event.preventDefault();
        focusInput();
      }}
      ref={containerRef}
      style={height === null ? undefined : { height: `${height}px` }}
    >
      <button
        aria-label="Resize terminal"
        className="terminal-drawer__resize-handle"
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
          const pane = containerRef.current?.parentElement;
          if (!pane) {
            return;
          }

          const startY = event.clientY;
          const startHeight = containerRef.current?.getBoundingClientRect().height ?? MIN_HEIGHT;
          const handlePointerMove = (moveEvent: PointerEvent) => {
            const nextHeight = Math.max(
              MIN_HEIGHT,
              Math.min(pane.clientHeight - 72, startHeight + (startY - moveEvent.clientY))
            );
            setHeight(nextHeight);
          };
          const handlePointerUp = () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
          };
          window.addEventListener("pointermove", handlePointerMove);
          window.addEventListener("pointerup", handlePointerUp);
        }}
        type="button"
      />
      <div className="terminal-drawer__toolbar">
        <span className="terminal-drawer__status">
          {backends.map((backend) => backend.status.label).join(" · ")}
        </span>
        <button className="pane__button pane__button--compact" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className="terminal-drawer__body">
        <div className="terminal-drawer__scroll" ref={scrollRef}>
          {entries.map((entry) => (
            <div
              className={`terminal-drawer__line terminal-drawer__line--${entry.tone}`}
              key={entry.id}
            >
              {entry.text.split("\n").map((line, index) => (
                <div key={`${entry.id}:${index}`}>{line || "\u00a0"}</div>
              ))}
            </div>
          ))}
          <label className="terminal-drawer__prompt">
            <span className="terminal-drawer__prompt-prefix">
              {PROMPT_SYMBOL}
            </span>
            <span className="terminal-drawer__input-shell">
              <span aria-hidden="true" className="terminal-drawer__input-highlight">
                {highlightedInput.length > 0 ? (
                  highlightedInput.map((token, index) => (
                    <span
                      className={`terminal-drawer__token terminal-drawer__token--${token.tone}`}
                      key={`${token.tone}:${index}:${token.text}`}
                    >
                      {token.text}
                    </span>
                  ))
                ) : (
                  <span className="terminal-drawer__token terminal-drawer__token--plain">
                    {"\u00a0"}
                  </span>
                )}
              </span>
              <input
                aria-label="Terminal command input"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                className="terminal-drawer__input"
                onBlur={() => {
                  if (!isOpen) {
                    return;
                  }

                  window.setTimeout(() => {
                    const activeElement = document.activeElement;
                    if (
                      activeElement instanceof HTMLElement &&
                      containerRef.current?.contains(activeElement)
                    ) {
                      return;
                    }
                  }, 0);
                }}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                ref={inputRef}
                spellCheck={false}
                type="text"
                value={inputValue}
              />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function completeShellInput(input: string, workspacePaths: string[]): string | null {
  const trailingWhitespace = /\s$/.test(input);
  const segments = input.match(/\S+|\s+/g) ?? [];
  const tokenIndexes = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => !/^\s+$/.test(segment));

  if (tokenIndexes.length === 0) {
    return null;
  }

  const activeToken = trailingWhitespace ? "" : (tokenIndexes[tokenIndexes.length - 1]?.segment ?? "");
  const activeSegmentIndex = trailingWhitespace ? null : (tokenIndexes[tokenIndexes.length - 1]?.index ?? null);

  if (tokenIndexes.length === 1 && !trailingWhitespace) {
    const matches = COMMAND_CANDIDATES.filter((candidate) => candidate.startsWith(activeToken));
    if (matches.length === 0) {
      return null;
    }
    const completion = finishCompletion(activeToken, matches, false);
    return activeSegmentIndex === null ? completion : replaceSegment(input, activeSegmentIndex, completion);
  }

  const matches = getPathCompletionMatches(activeToken, workspacePaths);
  if (matches.length === 0) {
    return null;
  }

  const completion = finishCompletion(activeToken, matches, true);
  if (activeSegmentIndex === null) {
    return `${input}${completion}`;
  }

  return replaceSegment(input, activeSegmentIndex, completion);
}

function highlightShellInput(value: string): HighlightToken[] {
  if (!value) {
    return [];
  }

  return value.match(/"[^"]*"|'[^']*'|\s+|&&|\|\||[|<>]|\B-\w+|\/?[\w./~-]+|./g)?.map((part, index) => {
    if (/^\s+$/.test(part)) {
      return { text: part.replace(/ /g, "\u00a0"), tone: "plain" } satisfies HighlightToken;
    }
    if (/^"[^"]*"|'[^']*'$/.test(part)) {
      return { text: part, tone: "string" } satisfies HighlightToken;
    }
    if (/^&&$|^\|\|$|^[|<>]$/.test(part)) {
      return { text: part, tone: "operator" } satisfies HighlightToken;
    }
    if (/^-\w+/.test(part)) {
      return { text: part, tone: "option" } satisfies HighlightToken;
    }
    if (/^\d+$/.test(part)) {
      return { text: part, tone: "number" } satisfies HighlightToken;
    }
    if (index === 0) {
      return { text: part, tone: "command" } satisfies HighlightToken;
    }
    if (part.includes("/") || part.startsWith(".") || part.startsWith("~")) {
      return { text: part, tone: "path" } satisfies HighlightToken;
    }
    return { text: part, tone: "plain" } satisfies HighlightToken;
  }) ?? [{ text: value, tone: "plain" }];
}

function getPathCompletionMatches(token: string, workspacePaths: string[]): string[] {
  const normalizedToken = token.replace(/^\/project\//, "");
  return workspacePaths.filter((path) => path.startsWith(normalizedToken)).sort();
}

function finishCompletion(token: string, matches: readonly string[], appendSlashForPath: boolean): string {
  const commonPrefix = longestCommonPrefix(matches);
  let result = commonPrefix.length > token.length ? commonPrefix : (matches[0] ?? token);

  if (appendSlashForPath && !result.endsWith("/")) {
    const exact = matches.find((path) => path === result) ?? matches[0] ?? "";
    const hasChildren = matches.some((path) => path !== exact && path.startsWith(`${exact}/`));
    if (hasChildren) {
      result = `${result}/`;
    }
  }

  return result;
}

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) {
    return "";
  }

  let prefix = values[0] ?? "";
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  return prefix;
}

function replaceSegment(input: string, segmentIndex: number, replacement: string): string {
  const segments = input.match(/\S+|\s+/g) ?? [];
  segments[segmentIndex] = replacement;
  return segments.join("");
}
