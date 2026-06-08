/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TYPR_AUTH_USERS_SHA256?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "mitex-wasm/mitex_wasm_bg.js" {
  export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
  export function convert_math(input: string, spec: Uint8Array): string;
  export function convert_text(input: string, spec: Uint8Array): string;
}

declare module "mitex-wasm/mitex_wasm_bg.wasm?init" {
  const init: () => Promise<WebAssembly.Instance>;
  export default init;
}
