/// <reference lib="webworker" />

import { Dialect, LocalLinter } from "harper.js";
import { binary } from "harper.js/binary";
import type {
  HarperWorkerLint,
  HarperWorkerRequest,
  HarperWorkerResponse
} from "./harperDiagnostics.protocol";

declare const self: DedicatedWorkerGlobalScope;

let linterPromise: Promise<LocalLinter> | null = null;
let requestQueue = Promise.resolve();

function getLinter(): Promise<LocalLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new LocalLinter({
        binary,
        dialect: Dialect.American
      });
      await linter.setup();
      return linter;
    })();
  }

  return linterPromise;
}

function serializeLint(
  lint: Awaited<ReturnType<LocalLinter["lint"]>>[number]
): HarperWorkerLint {
  const span = lint.span();
  const suggestions = lint.suggestions();

  try {
    return {
      kind: lint.lint_kind_pretty(),
      message: lint.message(),
      start: span.start,
      end: span.end,
      suggestions: suggestions.map((suggestion) => suggestion.get_replacement_text())
    };
  } finally {
    span.free();
    for (const suggestion of suggestions) {
      suggestion.free();
    }
    lint.free();
  }
}

async function handleRequest(request: HarperWorkerRequest): Promise<void> {
  let response: HarperWorkerResponse;

  try {
    const linter = await getLinter();
    const lints = await linter.lint(request.text, {
      language: request.language,
      dedup: true
    });
    response = {
      id: request.id,
      ok: true,
      lints: lints.map(serializeLint)
    };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Harper diagnostics failed."
    };
  }

  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<HarperWorkerRequest>) => {
  requestQueue = requestQueue.then(() => handleRequest(event.data));
});
