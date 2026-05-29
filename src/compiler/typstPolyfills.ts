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
