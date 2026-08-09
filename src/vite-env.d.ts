/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_PICKER_API_KEY?: string;
  readonly VITE_GOOGLE_CLOUD_PROJECT_NUMBER?: string;
  readonly VITE_TYPR_AUTH_USERS_SHA256?: string;
  readonly VITE_TYPR_COMPANION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __TYPR_APP_VERSION__: string;
declare const __TYPR_BUILD_SHA__: string;
declare const __TYPR_DEPLOYMENT_CHANNEL__: "development" | "beta" | "stable";
declare const __TYPR_DEPLOYMENT_LABEL__: string;

declare module "mitex-wasm/mitex_wasm_bg.js" {
  export function __wbg_set_wasm(wasm: WebAssembly.Exports): void;
  export function convert_math(input: string, spec: Uint8Array): string;
  export function convert_text(input: string, spec: Uint8Array): string;
}

declare module "mitex-wasm/mitex_wasm_bg.wasm?init" {
  const init: (
    imports?: WebAssembly.Imports
  ) => Promise<WebAssembly.Instance>;
  export default init;
}
