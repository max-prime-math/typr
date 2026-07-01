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

export function ensureRuntimePolyfills(): void {
  ensureTypstQueueMicrotask();
  ensureMapGetOrInsertComputed();
}

ensureRuntimePolyfills();
