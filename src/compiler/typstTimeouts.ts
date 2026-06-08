export const TYPST_INIT_TIMEOUT_MS = 45000;
export const TYPST_FIRST_COMPILE_TIMEOUT_MS = 75000;
export const TYPST_COMPILE_TIMEOUT_MS = 30000;
export const TYPST_WORKER_REQUEST_TIMEOUT_MS = 90000;

export const TYPST_INIT_TIMEOUT_MESSAGE =
  "Timed out initializing Typst. WASM or font assets may be blocked.";

export const TYPST_COMPILE_TIMEOUT_MESSAGE =
  "Timed out compiling Typst. Font asset loading may be blocked or very slow.";
