export type ControlledValueResolution = "acknowledge" | "defer" | "apply";

/**
 * CodeMirror applies local input synchronously, while React may acknowledge the
 * resulting controlled value later. An older acknowledgement must not replace
 * a newer local document that is still waiting to commit.
 */
export function resolveControlledValue(
  currentValue: string,
  nextValue: string,
  hasPendingLocalValue: boolean
): ControlledValueResolution {
  if (nextValue === currentValue) {
    return "acknowledge";
  }

  return hasPendingLocalValue ? "defer" : "apply";
}

export interface MinimalTextChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Keeping unchanged prefixes and suffixes out of an external transaction lets
 * CodeMirror map the cursor and selections across the actual edit.
 */
export function getMinimalTextChange(
  currentValue: string,
  nextValue: string
): MinimalTextChange | null {
  if (currentValue === nextValue) {
    return null;
  }

  const sharedLength = Math.min(currentValue.length, nextValue.length);
  let prefixLength = 0;
  while (
    prefixLength < sharedLength &&
    currentValue.charCodeAt(prefixLength) === nextValue.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sharedLength - prefixLength &&
    currentValue.charCodeAt(currentValue.length - suffixLength - 1) ===
      nextValue.charCodeAt(nextValue.length - suffixLength - 1)
  ) {
    suffixLength += 1;
  }

  return {
    from: prefixLength,
    to: currentValue.length - suffixLength,
    insert: nextValue.slice(prefixLength, nextValue.length - suffixLength)
  };
}
