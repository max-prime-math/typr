import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
  type StreamParser
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

interface TypstState {
  inBlockComment: boolean;
  inMath: boolean;
  headingLine: boolean;
}

const TYPST_KEYWORDS = new Set([
  "let",
  "set",
  "show",
  "if",
  "else",
  "for",
  "while",
  "break",
  "continue",
  "return",
  "import",
  "include",
  "context",
  "eval",
  "where",
  "as",
  "in"
]);

const typstHighlightStyle = HighlightStyle.define([
  {
    tag: tags.comment,
    color: "var(--text-muted)",
    fontStyle: "italic"
  },
  {
    tag: tags.keyword,
    color: "var(--accent)",
    fontWeight: "700"
  },
  {
    tag: tags.string,
    color: "var(--danger)"
  },
  {
    tag: tags.number,
    color: "var(--warning)"
  },
  {
    tag: tags.atom,
    color: "var(--accent)"
  },
  {
    tag: tags.heading,
    color: "var(--accent)",
    fontWeight: "700"
  },
  {
    tag: tags.strong,
    fontWeight: "700"
  },
  {
    tag: tags.emphasis,
    fontStyle: "italic"
  },
  {
    tag: tags.meta,
    color: "var(--accent)",
    fontWeight: "700"
  },
  {
    tag: tags.operator,
    color: "var(--text-muted)"
  },
  {
    tag: tags.punctuation,
    color: "var(--text-muted)"
  },
  {
    tag: tags.special(tags.atom),
    color: "var(--accent-strong)"
  }
]);

const typstStreamParser: StreamParser<TypstState> = {
  name: "typst",
  startState() {
    return {
      inBlockComment: false,
      inMath: false,
      headingLine: false
    };
  },
  token(stream, state) {
    if (stream.sol()) {
      state.headingLine = false;
    }

    if (state.inBlockComment) {
      if (stream.skipTo("*/")) {
        stream.next();
        stream.next();
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }

    if (state.headingLine) {
      stream.skipToEnd();
      return "heading";
    }

    if (stream.eatSpace()) {
      return null;
    }

    if (stream.sol()) {
      if (stream.match(/={1,6}\s+/)) {
        state.headingLine = true;
        return "headingMarker";
      }

      if (stream.match(/[-+*]\s+/)) {
        return "listMarker";
      }
    }

    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.match("/*")) {
      state.inBlockComment = true;
      if (stream.skipTo("*/")) {
        stream.next();
        stream.next();
        state.inBlockComment = false;
      } else {
        stream.skipToEnd();
      }
      return "comment";
    }

    if (stream.peek() === "$") {
      stream.next();
      state.inMath = !state.inMath;
      return "mathDelimiter";
    }

    if (state.inMath) {
      if (stream.peek() === "$") {
        stream.next();
        state.inMath = false;
        return "mathDelimiter";
      }

      stream.eatWhile((character) => character !== "$");
      return "math";
    }

    if (stream.peek() === "\"" || stream.peek() === "'") {
      const quote = stream.next();
      let escaped = false;

      while (!stream.eol()) {
        const next = stream.next();

        if (next === quote && !escaped) {
          break;
        }

        escaped = next === "\\" && !escaped;
        if (next !== "\\") {
          escaped = false;
        }
      }

      return "string";
    }

    if (stream.peek() === "#") {
      stream.next();

      if (stream.match(/sym\.[A-Za-z0-9_.-]+/)) {
        return "symbol";
      }

      if (stream.match(/[A-Za-z_][A-Za-z0-9_-]*/)) {
        const word = stream.current().slice(1);
        return TYPST_KEYWORDS.has(word) ? "keyword" : "keyword";
      }

      return "operator";
    }

    if (/[0-9]/.test(stream.peek() ?? "")) {
      stream.eatWhile(/[0-9_.]/);
      return "number";
    }

    if (/[A-Za-z_]/.test(stream.peek() ?? "")) {
      stream.eatWhile(/[A-Za-z0-9_/-]/);
      return null;
    }

    stream.next();

    if (/[=:+\-*/<>!?|&.,;()[\]{}]/.test(stream.current())) {
      return "operator";
    }

    return null;
  },
  blankLine(state) {
    state.headingLine = false;
  },
  copyState(state) {
    return {
      inBlockComment: state.inBlockComment,
      inMath: state.inMath,
      headingLine: state.headingLine
    };
  },
  mergeTokens: true,
  tokenTable: {
    headingMarker: [tags.heading, tags.strong],
    heading: tags.heading,
    listMarker: [tags.meta, tags.strong],
    mathDelimiter: tags.operator,
    math: [tags.special(tags.atom), tags.atom],
    symbol: tags.atom
  }
};

export function typstLanguage(): Extension {
  return [StreamLanguage.define(typstStreamParser), syntaxHighlighting(typstHighlightStyle)];
}
