import { describe, expect, it } from "vitest";
import { typstStreamParser } from "./typstLanguage";

class TestStream {
  pos = 0;
  private readonly start = 0;

  constructor(private readonly source: string) {}

  sol(): boolean {
    return this.pos === 0;
  }

  eol(): boolean {
    return this.pos >= this.source.length;
  }

  peek(): string | undefined {
    return this.source[this.pos];
  }

  next(): string {
    return this.source[this.pos++] ?? "";
  }

  eatSpace(): boolean {
    const start = this.pos;
    while (/\s/.test(this.source[this.pos] ?? "")) {
      this.pos += 1;
    }
    return this.pos > start;
  }

  eatWhile(match: RegExp | ((character: string) => boolean)): boolean {
    const start = this.pos;
    while (!this.eol()) {
      const character = this.source[this.pos];
      const matched = typeof match === "function" ? match(character) : match.test(character);
      if (!matched) {
        break;
      }
      this.pos += 1;
    }
    return this.pos > start;
  }

  match(pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      if (!this.source.startsWith(pattern, this.pos)) {
        return false;
      }
      this.pos += pattern.length;
      return true;
    }

    const match = this.source.slice(this.pos).match(pattern);
    if (!match || match.index !== 0) {
      return false;
    }
    this.pos += match[0].length;
    return true;
  }

  skipToEnd(): void {
    this.pos = this.source.length;
  }

  skipTo(search: string): boolean {
    const index = this.source.indexOf(search, this.pos);
    if (index === -1) {
      return false;
    }
    this.pos = index;
    return true;
  }

  current(): string {
    return this.source.slice(this.start, this.pos);
  }
}

function collectTokenStyles(source: string): Array<string | null> {
  const state = typstStreamParser.startState?.(2) ?? { inBlockComment: false, inMath: false, headingLine: false };
  const stream = new TestStream(source);
  const styles: Array<string | null> = [];

  while (!stream.eol()) {
    const before = stream.pos;
    styles.push(typstStreamParser.token(stream as never, state));

    if (stream.pos === before) {
      throw new Error("Tokenizer did not advance.");
    }
  }

  return styles;
}

describe("Typst language tokenizer", () => {
  it("does not treat apostrophes in prose as string delimiters", () => {
    expect(collectTokenStyles("It's fine")).not.toContain("string");
  });

  it("still highlights double-quoted strings", () => {
    expect(collectTokenStyles("#let value = \"fine\"")).toContain("string");
  });
});
