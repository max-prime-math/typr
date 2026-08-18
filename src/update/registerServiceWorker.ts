import type { Workbox } from "workbox-window";
import { TYPR_BUILD_INFO } from "./buildInfo";
import type {
  RegisterServiceWorker,
  ServiceWorkerRegistrationCallbacks
} from "./updateManager";

export function getVersionedServiceWorkerUrl(baseUrl: string, buildSha: string): string {
  const serviceWorkerUrl = new URL("sw.js", baseUrl);
  serviceWorkerUrl.searchParams.set("build", buildSha);
  return serviceWorkerUrl.href;
}

export function shouldReloadAfterServiceWorkerUpdate(
  controllerScriptUrl: string | null,
  currentBuildSha: string
): boolean {
  if (!controllerScriptUrl) {
    return true;
  }

  try {
    return new URL(controllerScriptUrl).searchParams.get("build") === currentBuildSha;
  } catch {
    return true;
  }
}

/**
 * GitHub Pages serves sw.js with a long CDN cache lifetime. Giving each build a
 * distinct script URL ensures the browser fetches the worker that matches the
 * currently loaded application shell.
 */
export const registerVersionedServiceWorker: RegisterServiceWorker = (
  callbacks: ServiceWorkerRegistrationCallbacks
) => {
  let workbox: Workbox | null = null;
  let registrationRequest: Promise<void> | null = null;

  const updateServiceWorker = async (): Promise<void> => {
    await registrationRequest;
    workbox?.messageSkipWaiting();
  };

  if (!("serviceWorker" in navigator)) {
    callbacks.onRegisterError(new Error("Service workers are unavailable."));
    return updateServiceWorker;
  }

  registrationRequest = import("workbox-window")
    .then(({ Workbox }) => {
      const serviceWorkerUrl = getVersionedServiceWorkerUrl(
        document.baseURI,
        TYPR_BUILD_INFO.buildSha
      );
      workbox = new Workbox(serviceWorkerUrl);

      let refreshPrompted = false;
      const showRefreshPrompt = () => {
        if (refreshPrompted) {
          return;
        }

        refreshPrompted = true;
        // A deployed worker is first discovered by the old application, using
        // its old build-stamped URL. After that worker activates, the new page
        // registers the identical script under its new build-stamped URL. The
        // second activation does not need another page reload because this page
        // is already running the target build.
        const reloadAfterUpdate = shouldReloadAfterServiceWorkerUpdate(
          navigator.serviceWorker.controller?.scriptURL ?? null,
          TYPR_BUILD_INFO.buildSha
        );
        workbox?.addEventListener("controlling", (event) => {
          if (event.isUpdate && reloadAfterUpdate) {
            window.location.reload();
          }
        });
        callbacks.onNeedRefresh();
      };

      workbox.addEventListener("installed", (event) => {
        if (!event.isUpdate && !refreshPrompted) {
          callbacks.onOfflineReady();
        }
      });
      workbox.addEventListener("waiting", showRefreshPrompt);

      return workbox.register({ immediate: callbacks.immediate }).then((registration) => {
        callbacks.onRegisteredSW(serviceWorkerUrl, registration);
      });
    })
    .catch((error) => {
      callbacks.onRegisterError(error);
    });

  return updateServiceWorker;
};
