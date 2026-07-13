/** Compares every byte in two views. This is content equality, not constant-time security. */
export function areBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left === right) {
    return true;
  }

  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/** Compares optional byte content while keeping an absent value distinct from empty bytes. */
export function areOptionalBytesEqual(
  left: Uint8Array | undefined,
  right: Uint8Array | undefined
): boolean {
  if (left === right) {
    return true;
  }

  return Boolean(left && right && areBytesEqual(left, right));
}

/** Encodes all bytes as two lowercase hexadecimal digits each. */
export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
