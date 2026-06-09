import initMitexWasm from "mitex-wasm/mitex_wasm_bg.wasm?init";
import * as mitexBindings from "mitex-wasm/mitex_wasm_bg.js";

export type MitexConversionMode = "math" | "text";

const EMPTY_SPEC = new Uint8Array();

let mitexInitPromise: Promise<void> | null = null;

export async function convertLatexToTypst(
  source: string,
  mode: MitexConversionMode
): Promise<string> {
  await ensureMitexInitialized();

  return mode === "math"
    ? formatMathOutput(mitexBindings.convert_math(source, EMPTY_SPEC))
    : mitexBindings.convert_text(source, EMPTY_SPEC).trim();
}

async function ensureMitexInitialized(): Promise<void> {
  if (!mitexInitPromise) {
    mitexInitPromise = initMitexWasm({
      "./mitex_wasm_bg.js": mitexBindings
    }).then((instance) => {
      mitexBindings.__wbg_set_wasm(instance.exports);
    });
  }

  return mitexInitPromise;
}

function formatMathOutput(converted: string): string {
  const trimmed = converted.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.includes("\n")
    ? `$\n${trimmed}\n$`
    : `$${trimmed}$`;
}
