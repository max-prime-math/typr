export function ensureTypstQueueMicrotask(): void {
  const scope = globalThis as typeof globalThis & {
    queueMicrotask?: (callback: VoidFunction) => void;
  };

  if (typeof scope.queueMicrotask === "function") {
    return;
  }

  scope.queueMicrotask = (callback: VoidFunction): void => {
    Promise.resolve()
      .then(callback)
      .catch((error) => {
        globalThis.setTimeout(() => {
          throw error;
        }, 0);
      });
  };
}

export function ensureMapGetOrInsertComputed(): void {
  const mapPrototype = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
  };

  if (typeof mapPrototype.getOrInsertComputed === "function") {
    return;
  }

  Object.defineProperty(mapPrototype, "getOrInsertComputed", {
    configurable: true,
    writable: true,
    value(this: Map<unknown, unknown>, key: unknown, callback: (key: unknown) => unknown): unknown {
      if (this.has(key)) {
        return this.get(key);
      }

      const value = callback(key);
      this.set(key, value);
      return value;
    }
  });
}

export function ensurePromiseTry(): void {
  const promiseConstructor = Promise as PromiseConstructor & {
    try?: (
      callback: (...args: unknown[]) => unknown,
      ...args: unknown[]
    ) => Promise<unknown>;
  };

  if (typeof promiseConstructor.try === "function") {
    return;
  }

  Object.defineProperty(promiseConstructor, "try", {
    configurable: true,
    writable: true,
    value(callback: (...args: unknown[]) => unknown, ...args: unknown[]): Promise<unknown> {
      return new Promise((resolve) => resolve(callback(...args)));
    }
  });
}

export function ensureUint8ArrayEncoding(): void {
  const constructor = Uint8Array as Uint8ArrayConstructor & {
    fromBase64?: (value: string) => Uint8Array;
  };
  const prototype = Uint8Array.prototype as Uint8Array & {
    toBase64?: () => string;
    toHex?: () => string;
  };

  if (typeof constructor.fromBase64 !== "function") {
    Object.defineProperty(constructor, "fromBase64", {
      configurable: true,
      writable: true,
      value(value: string): Uint8Array {
        const binary = globalThis.atob(value);
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        return bytes;
      }
    });
  }

  if (typeof prototype.toBase64 !== "function") {
    Object.defineProperty(prototype, "toBase64", {
      configurable: true,
      writable: true,
      value(this: Uint8Array): string {
        let binary = "";
        const chunkSize = 0x8000;

        for (let index = 0; index < this.length; index += chunkSize) {
          binary += String.fromCharCode(...this.subarray(index, index + chunkSize));
        }

        return globalThis.btoa(binary);
      }
    });
  }

  if (typeof prototype.toHex !== "function") {
    Object.defineProperty(prototype, "toHex", {
      configurable: true,
      writable: true,
      value(this: Uint8Array): string {
        let hex = "";

        for (const byte of this) {
          hex += byte.toString(16).padStart(2, "0");
        }

        return hex;
      }
    });
  }
}

export function ensureRuntimePolyfills(): void {
  ensureTypstQueueMicrotask();
  ensureMapGetOrInsertComputed();
  ensurePromiseTry();
  ensureUint8ArrayEncoding();
}

ensureRuntimePolyfills();
