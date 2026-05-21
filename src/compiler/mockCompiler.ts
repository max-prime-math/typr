import type { CompileAssetFile, CompileResult, TypstCompiler } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripPreviewThemePrelude(source: string): string {
  return source.replace(/^#set text\(fill: rgb\(".*?"\)\)\n/, "");
}

export function createMockCompiler(): TypstCompiler {
  return {
    async compileDocument(
      source: string,
      _assets: CompileAssetFile[] = []
    ): Promise<CompileResult> {
      if (source.includes("typr: error")) {
        return {
          ok: false,
          engine: "mock",
          errors: [
            {
              message:
                "Mock compiler error triggered by the marker `typr: error`.",
              severity: "error"
            }
          ]
        };
      }

      const escapedSource = escapeHtml(stripPreviewThemePrelude(source));

      return {
        ok: true,
        engine: "mock",
        diagnostics: [
          {
            message:
              "Preview is using the mock compiler. Wire Typst WASM in src/compiler/typstCompiler.ts for real rendering.",
            severity: "warning"
          }
        ],
        output: {
          kind: "placeholder",
          content: `
            <article class="preview-placeholder">
              <header class="preview-placeholder__header">
                <span class="preview-placeholder__badge">Mock preview</span>
                <h3>Typst compilation adapter is connected</h3>
              </header>
              <p>
                This placeholder keeps the app functional before bundling the real
                Typst WebAssembly compiler.
              </p>
              <pre>${escapedSource}</pre>
            </article>
          `
        }
      };
    },
    dispose(): void {
      // No-op: the mock compiler does not own external resources.
    }
  };
}
