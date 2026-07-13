import { afterEach, describe, expect, it } from "vitest";
import { ensurePromiseTry, ensureUint8ArrayEncoding } from "./typstPolyfills";

type PromiseTry = (
  callback: (...args: unknown[]) => unknown,
  ...args: unknown[]
) => Promise<unknown>;

const promiseConstructor = Promise as PromiseConstructor & { try?: PromiseTry };
const originalDescriptor = Object.getOwnPropertyDescriptor(Promise, "try");
const originalFromBase64Descriptor = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
const originalToBase64Descriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
const originalToHexDescriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toHex");

describe("runtime polyfills", () => {
  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Promise, "try", originalDescriptor);
    } else {
      delete promiseConstructor.try;
    }

    restoreProperty(Uint8Array, "fromBase64", originalFromBase64Descriptor);
    restoreProperty(Uint8Array.prototype, "toBase64", originalToBase64Descriptor);
    restoreProperty(Uint8Array.prototype, "toHex", originalToHexDescriptor);
  });

  it("polyfills Promise.try with argument forwarding and rejection handling", async () => {
    delete promiseConstructor.try;
    ensurePromiseTry();
    const promiseTry = Reflect.get(Promise, "try") as PromiseTry;

    await expect(promiseTry((left: unknown, right: unknown) => Number(left) + Number(right), 2, 3))
      .resolves.toBe(5);
    await expect(
      promiseTry(() => {
        throw new Error("callback failed");
      })
    ).rejects.toThrow("callback failed");
  });

  it("polyfills the typed-array encodings used by PDF.js", () => {
    Reflect.deleteProperty(Uint8Array, "fromBase64");
    Reflect.deleteProperty(Uint8Array.prototype, "toBase64");
    Reflect.deleteProperty(Uint8Array.prototype, "toHex");

    ensureUint8ArrayEncoding();

    const fromBase64 = Reflect.get(Uint8Array, "fromBase64") as (value: string) => Uint8Array;
    const bytes = fromBase64("AP+A");
    const toBase64 = Reflect.get(Uint8Array.prototype, "toBase64") as (
      this: Uint8Array
    ) => string;
    const toHex = Reflect.get(Uint8Array.prototype, "toHex") as (
      this: Uint8Array
    ) => string;

    expect([...bytes]).toEqual([0, 255, 128]);
    expect(toBase64.call(bytes)).toBe("AP+A");
    expect(toHex.call(bytes)).toBe("00ff80");
  });
});

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}
