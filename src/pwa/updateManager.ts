import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

type UpdateStatus = "idle" | "checking" | "available" | "updating" | "error";

export interface PwaUpdateSnapshot {
  status: UpdateStatus;
  message: string;
}

const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;
let initialized = false;
let snapshot: PwaUpdateSnapshot = {
  status: "idle",
  message: "Typr checks for updates automatically while you are online."
};

function publish(nextSnapshot: PwaUpdateSnapshot) {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

export function initializePwaUpdates() {
  if (initialized || !import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  initialized = true;
  applyUpdate = registerSW({
    immediate: true,
    onRegisteredSW(_serviceWorkerUrl, serviceWorkerRegistration) {
      registration = serviceWorkerRegistration;
    },
    onNeedRefresh() {
      publish({
        status: "available",
        message: "A new version of Typr is ready. Restart the app to install it."
      });
    },
    onRegisterError(error) {
      console.error("Typr could not register its service worker.", error);
      publish({
        status: "error",
        message: "Typr could not check for updates. Try again when you are online."
      });
    }
  });
}

export async function checkForPwaUpdate() {
  if (!("serviceWorker" in navigator)) {
    publish({
      status: "error",
      message: "Updates are not available in this browser."
    });
    return;
  }

  publish({ status: "checking", message: "Checking for a new version..." });

  try {
    registration ??= await navigator.serviceWorker.getRegistration();
    await registration?.update();

    if (registration?.waiting) {
      publish({
        status: "available",
        message: "A new version of Typr is ready. Restart the app to install it."
      });
      return;
    }

    publish({ status: "idle", message: "Typr is up to date." });
  } catch (error) {
    console.error("Typr could not check for updates.", error);
    publish({
      status: "error",
      message: "Typr could not check for updates. Try again when you are online."
    });
  }
}

export async function restartToApplyPwaUpdate() {
  if (!applyUpdate) {
    await checkForPwaUpdate();
    return;
  }

  publish({ status: "updating", message: "Installing the update..." });

  try {
    await applyUpdate(true);
  } catch (error) {
    console.error("Typr could not apply the update.", error);
    publish({
      status: "error",
      message: "Typr could not install the update. Try again."
    });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function usePwaUpdateSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
