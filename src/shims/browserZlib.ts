export const constants = {
  Z_BEST_COMPRESSION: 9,
  Z_BEST_SPEED: 1,
  Z_DEFAULT_COMPRESSION: -1
} as const;

function unsupported(name: string): never {
  throw new Error(`${name} is unavailable in the browser shell runtime.`);
}

export function gunzipSync(): never {
  return unsupported("gunzipSync");
}

export function gzipSync(): never {
  return unsupported("gzipSync");
}
