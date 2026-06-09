export type LatexFallbackMode = "math" | "text";

const GREEK_SYMBOLS: Record<string, string> = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  epsilon: "epsilon",
  varepsilon: "epsilon.alt",
  zeta: "zeta",
  eta: "eta",
  theta: "theta",
  vartheta: "theta.alt",
  iota: "iota",
  kappa: "kappa",
  lambda: "lambda",
  mu: "mu",
  nu: "nu",
  xi: "xi",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  tau: "tau",
  phi: "phi",
  varphi: "phi.alt",
  chi: "chi",
  psi: "psi",
  omega: "omega",
  Gamma: "Gamma",
  Delta: "Delta",
  Theta: "Theta",
  Lambda: "Lambda",
  Xi: "Xi",
  Pi: "Pi",
  Sigma: "Sigma",
  Phi: "Phi",
  Psi: "Psi",
  Omega: "Omega"
};

const MATH_SYMBOLS: Record<string, string> = {
  cdot: "dot",
  times: "times",
  div: "/",
  le: "<=",
  leq: "<=",
  ge: ">=",
  geq: ">=",
  neq: "!=",
  ne: "!=",
  approx: "approx",
  infty: "infinity",
  pm: "plus.minus",
  mp: "minus.plus",
  to: "->",
  rightarrow: "->",
  leftarrow: "<-",
  mapsto: "|->"
};

const MATH_FUNCTIONS = new Set([
  "arccos",
  "arcsin",
  "arctan",
  "cos",
  "cosh",
  "cot",
  "coth",
  "csc",
  "deg",
  "det",
  "dim",
  "exp",
  "gcd",
  "hom",
  "inf",
  "ker",
  "lg",
  "lim",
  "liminf",
  "limsup",
  "ln",
  "log",
  "max",
  "min",
  "Pr",
  "sec",
  "sin",
  "sinh",
  "sup",
  "tan",
  "tanh"
]);

export function convertLatexFallback(
  source: string,
  mode: LatexFallbackMode
): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }

  return mode === "math"
    ? formatMath(convertLatexMath(trimmed))
    : convertLatexText(trimmed);
}

function convertLatexText(source: string): string {
  let output = source;

  output = output.replace(/\\section\{([^{}]*)\}/g, (_match, title: string) => `= ${title}`);
  output = output.replace(/\\subsection\{([^{}]*)\}/g, (_match, title: string) => `== ${title}`);
  output = output.replace(/\\subsubsection\{([^{}]*)\}/g, (_match, title: string) => `=== ${title}`);
  output = output.replace(/\\(?:textbf|mathbf)\{([^{}]*)\}/g, (_match, body: string) => `*${body}*`);
  output = output.replace(/\\(?:emph|textit)\{([^{}]*)\}/g, (_match, body: string) => `_${body}_`);
  output = output.replace(/\\\[((?:.|\n)*?)\\\]/g, (_match, body: string) =>
    formatMath(convertLatexMath(body))
  );
  output = output.replace(/\\\(((?:.|\n)*?)\\\)/g, (_match, body: string) =>
    formatMath(convertLatexMath(body))
  );
  output = output.replace(/\$([^$]+)\$/g, (_match, body: string) =>
    formatMath(convertLatexMath(body))
  );
  output = output.replace(/\\\\/g, "\n");

  return output.trim();
}

function convertLatexMath(source: string): string {
  let output = stripMathDelimiters(source);

  output = replaceTwoGroupCommand(output, "frac", (numerator, denominator) =>
    `frac(${convertLatexMath(numerator)}, ${convertLatexMath(denominator)})`
  );
  output = replaceOneGroupCommand(output, "sqrt", (body) =>
    `sqrt(${convertLatexMath(body)})`
  );
  output = replaceOneGroupCommand(output, "overline", (body) =>
    `overline(${convertLatexMath(body)})`
  );
  output = replaceOneGroupCommand(output, "hat", (body) =>
    `hat(${convertLatexMath(body)})`
  );
  output = replaceOneGroupCommand(output, "vec", (body) =>
    `arrow(${convertLatexMath(body)})`
  );

  output = output.replace(/\\left/g, "");
  output = output.replace(/\\right/g, "");
  output = output.replace(/\\,/g, " ");
  output = output.replace(/\\([A-Za-z]+)/g, (_match, command: string) => {
    if (GREEK_SYMBOLS[command]) {
      return GREEK_SYMBOLS[command];
    }

    if (MATH_SYMBOLS[command]) {
      return MATH_SYMBOLS[command];
    }

    if (MATH_FUNCTIONS.has(command)) {
      return command;
    }

    return command;
  });
  output = output.replace(/\^\{([^{}]+)\}/g, (_match, body: string) => `^(${body})`);
  output = output.replace(/_\{([^{}]+)\}/g, (_match, body: string) => `_(${body})`);
  output = output.replace(/\{([^{}]+)\}/g, "($1)");
  output = output.replace(/\s+/g, " ");

  return output.trim();
}

function stripMathDelimiters(source: string): string {
  let output = source.trim();

  if (output.startsWith("\\[") && output.endsWith("\\]")) {
    output = output.slice(2, -2);
  } else if (output.startsWith("\\(") && output.endsWith("\\)")) {
    output = output.slice(2, -2);
  } else if (output.startsWith("$$") && output.endsWith("$$")) {
    output = output.slice(2, -2);
  } else if (output.startsWith("$") && output.endsWith("$")) {
    output = output.slice(1, -1);
  }

  return output.trim();
}

function formatMath(source: string): string {
  const trimmed = source.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.includes("\n")
    ? `$\n${trimmed}\n$`
    : `$${trimmed}$`;
}

function replaceOneGroupCommand(
  source: string,
  command: string,
  format: (body: string) => string
): string {
  return replaceCommandGroups(source, command, 1, ([body]) => format(body ?? ""));
}

function replaceTwoGroupCommand(
  source: string,
  command: string,
  format: (first: string, second: string) => string
): string {
  return replaceCommandGroups(source, command, 2, ([first, second]) =>
    format(first ?? "", second ?? "")
  );
}

function replaceCommandGroups(
  source: string,
  command: string,
  groupCount: number,
  format: (groups: string[]) => string
): string {
  const marker = `\\${command}`;
  let output = "";
  let index = 0;

  while (index < source.length) {
    const markerIndex = source.indexOf(marker, index);
    if (markerIndex === -1) {
      output += source.slice(index);
      break;
    }

    output += source.slice(index, markerIndex);
    let cursor = markerIndex + marker.length;
    const groups: string[] = [];

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      cursor = skipWhitespace(source, cursor);
      const parsedGroup = parseBraceGroup(source, cursor);
      if (!parsedGroup) {
        groups.length = 0;
        break;
      }

      groups.push(parsedGroup.body);
      cursor = parsedGroup.end;
    }

    if (groups.length !== groupCount) {
      output += marker;
      index = markerIndex + marker.length;
      continue;
    }

    output += format(groups);
    index = cursor;
  }

  return output;
}

function skipWhitespace(source: string, index: number): number {
  let cursor = index;

  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }

  return cursor;
}

function parseBraceGroup(
  source: string,
  start: number
): { body: string; end: number } | null {
  if (source[start] !== "{") {
    return null;
  }

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(start + 1, index),
          end: index + 1
        };
      }
    }
  }

  return null;
}
