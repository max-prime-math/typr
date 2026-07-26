import { useSyncExternalStore } from "react";
import { TYPR_BUILD_INFO } from "./buildInfo";

export const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000;
export const UPDATE_CHECK_THROTTLE_MS = 60 * 1000;

export interface ReleaseMetadata {
  version: string;
  build?: string;
  breaking: boolean;
  backupRecommended: boolean;
  notes: string[];
}

export type UpdatePhase =
  | "disabled"
  | "registering"
  | "current"
  | "checking"
  | "ready"
  | "activating";

export type ServiceWorkerStatus =
  | "development"
  | "registering"
  | "active"
  | "installed"
  | "unavailable";

export interface UpdateManagerState {
  phase: UpdatePhase;
  serviceWorkerStatus: ServiceWorkerStatus;
  attentionRequired: boolean;
  release: ReleaseMetadata | null;
}

export interface RestartSafety {
  safe: boolean;
  prepare?: () => Promise<void>;
}

export interface ServiceWorkerRegistrationCallbacks {
  immediate: boolean;
  onNeedRefresh: () => void;
  onOfflineReady: () => void;
  onRegisteredSW: (
    serviceWorkerUrl: string,
    registration: ServiceWorkerRegistration | undefined
  ) => void;
  onRegisterError: (error: unknown) => void;
}

export type RegisterServiceWorker = (
  callbacks: ServiceWorkerRegistrationCallbacks
) => (reloadPage?: boolean) => Promise<void>;

export interface UpdateManagerRuntime {
  addDocumentListener(type: string, listener: EventListener): void;
  addWindowListener(type: string, listener: EventListener): void;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getBaseUrl(): string;
  getVisibilityState(): DocumentVisibilityState;
  hasServiceWorkerController(): boolean;
  isOnline(): boolean;
  isProduction(): boolean;
  isServiceWorkerSupported(): boolean;
  now(): number;
  setInterval(callback: () => void, delay: number): number;
}

function createBrowserRuntime(): UpdateManagerRuntime {
  return {
    addDocumentListener(type, listener) {
      document.addEventListener(type, listener);
    },
    addWindowListener(type, listener) {
      window.addEventListener(type, listener);
    },
    fetch(input, init) {
      return window.fetch(input, init);
    },
    getBaseUrl() {
      return document.baseURI;
    },
    getVisibilityState() {
      return document.visibilityState;
    },
    hasServiceWorkerController() {
      return Boolean(navigator.serviceWorker.controller);
    },
    isOnline() {
      return navigator.onLine;
    },
    isProduction() {
      return import.meta.env.PROD;
    },
    isServiceWorkerSupported() {
      return "serviceWorker" in navigator;
    },
    now() {
      return Date.now();
    },
    setInterval(callback, delay) {
      return window.setInterval(callback, delay);
    }
  };
}

export function parseReleaseMetadata(value: unknown): ReleaseMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<Record<keyof ReleaseMetadata, unknown>>;
  if (typeof candidate.version !== "string" || !candidate.version.trim()) {
    return null;
  }

  return {
    version: candidate.version.trim(),
    build: typeof candidate.build === "string" ? candidate.build.trim() : undefined,
    breaking: candidate.breaking === true,
    backupRecommended: candidate.backupRecommended === true,
    notes: Array.isArray(candidate.notes)
      ? candidate.notes.filter(
          (note): note is string => typeof note === "string" && note.trim().length > 0
        )
      : []
  };
}

export class UpdateManager {
  private readonly runtime: UpdateManagerRuntime;
  private readonly listeners = new Set<() => void>();
  private state: UpdateManagerState;
  private registration: ServiceWorkerRegistration | null = null;
  private updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private restartSafety: RestartSafety = { safe: false };
  private initialized = false;
  private waiting = false;
  private hiddenSinceLastCheck = false;
  private lastCheckAt = Number.NEGATIVE_INFINITY;
  private checkRequest: Promise<void> | null = null;
  private activationRequest: Promise<boolean> | null = null;

  constructor(runtime: UpdateManagerRuntime = createBrowserRuntime()) {
    this.runtime = runtime;
    const production = runtime.isProduction();
    this.state = {
      phase: production ? "registering" : "disabled",
      serviceWorkerStatus: production ? "registering" : "development",
      attentionRequired: false,
      release: null
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): UpdateManagerState => this.state;

  initialize(register: RegisterServiceWorker, onOfflineReady: () => void): void {
    if (this.initialized || !this.runtime.isProduction()) {
      return;
    }
    this.initialized = true;

    if (!this.runtime.isServiceWorkerSupported()) {
      this.setState({
        phase: "current",
        serviceWorkerStatus: "unavailable"
      });
      return;
    }

    this.updateServiceWorker = register({
      immediate: true,
      onNeedRefresh: () => {
        this.handleUpdateReady();
      },
      onOfflineReady,
      onRegisteredSW: (_serviceWorkerUrl, registration) => {
        this.registration = registration ?? null;

        if (this.waiting) {
          this.setState({
            phase: "ready",
            attentionRequired: !this.restartSafety.safe
          });
          if (this.restartSafety.safe) {
            void this.activateUpdate();
          }
          return;
        }

        this.setState({
          phase: "current",
          serviceWorkerStatus:
            registration?.active || this.runtime.hasServiceWorkerController()
              ? "active"
              : "installed"
        });

        if (registration?.waiting) {
          this.handleUpdateReady();
          return;
        }

        void this.checkForUpdates();
      },
      onRegisterError: () => {
        this.setState({
          phase: "current",
          serviceWorkerStatus: "unavailable"
        });
      }
    });

    this.runtime.setInterval(() => {
      void this.checkForUpdates();
    }, UPDATE_POLL_INTERVAL_MS);

    this.runtime.addWindowListener("online", () => {
      void this.checkForUpdates();
    });
    this.runtime.addDocumentListener("visibilitychange", () => {
      if (this.runtime.getVisibilityState() === "hidden") {
        this.hiddenSinceLastCheck = true;
        return;
      }

      if (this.runtime.getVisibilityState() === "visible" && this.hiddenSinceLastCheck) {
        this.hiddenSinceLastCheck = false;
        void this.checkForUpdates();
      }
    });
  }

  setRestartSafety(restartSafety: RestartSafety): void {
    this.restartSafety = restartSafety;

    if (!this.waiting) {
      return;
    }

    if (restartSafety.safe) {
      this.setState({ attentionRequired: false });
      void this.activateUpdate();
    } else {
      this.setState({
        phase: "ready",
        attentionRequired: true
      });
    }
  }

  checkForUpdates(force = false): Promise<void> {
    if (
      this.waiting ||
      !this.registration ||
      !this.runtime.isOnline() ||
      this.checkRequest
    ) {
      return this.checkRequest ?? Promise.resolve();
    }

    const now = this.runtime.now();
    if (!force && now - this.lastCheckAt < UPDATE_CHECK_THROTTLE_MS) {
      return Promise.resolve();
    }

    this.lastCheckAt = now;
    const previousPhase = this.state.phase === "registering" ? "current" : this.state.phase;
    this.setState({ phase: "checking" });

    const request = this.registration
      .update()
      .catch(() => undefined)
      .then(() => {
        if (!this.waiting && this.state.phase === "checking") {
          this.setState({ phase: previousPhase === "ready" ? "ready" : "current" });
        }
      })
      .finally(() => {
        if (this.checkRequest === request) {
          this.checkRequest = null;
        }
      });

    this.checkRequest = request;
    return request;
  }

  activateUpdate(manual = false): Promise<boolean> {
    if (this.activationRequest) {
      return this.activationRequest;
    }
    if (!this.waiting || !this.updateServiceWorker) {
      return Promise.resolve(false);
    }

    const request = (async () => {
      this.setState({
        phase: "activating",
        attentionRequired: false
      });

      try {
        await this.restartSafety.prepare?.();

        if (!manual && !this.restartSafety.safe) {
          this.setState({
            phase: "ready",
            attentionRequired: true
          });
          return false;
        }

        await this.updateServiceWorker?.(true);
        return true;
      } catch {
        this.setState({
          phase: "ready",
          attentionRequired: true
        });
        return false;
      }
    })().finally(() => {
      if (this.activationRequest === request) {
        this.activationRequest = null;
      }
    });

    this.activationRequest = request;
    return request;
  }

  private handleUpdateReady(): void {
    if (this.waiting) {
      return;
    }

    this.waiting = true;
    this.setState({
      phase: "ready",
      attentionRequired: !this.restartSafety.safe
    });
    void this.loadReleaseMetadata();

    if (this.restartSafety.safe) {
      void this.activateUpdate();
    }
  }

  private async loadReleaseMetadata(): Promise<void> {
    try {
      const url = new URL("release.json", this.runtime.getBaseUrl());
      url.searchParams.set("build", TYPR_BUILD_INFO.buildSha);
      const response = await this.runtime.fetch(url, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const release = parseReleaseMetadata(await response.json());
      if (release && this.waiting) {
        this.setState({ release });
      }
    } catch {
      // Release notes are optional; the downloaded update remains installable.
    }
  }

  private setState(patch: Partial<UpdateManagerState>): void {
    const nextState = { ...this.state, ...patch };
    if (
      nextState.phase === this.state.phase &&
      nextState.serviceWorkerStatus === this.state.serviceWorkerStatus &&
      nextState.attentionRequired === this.state.attentionRequired &&
      nextState.release === this.state.release
    ) {
      return;
    }

    this.state = nextState;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const updateManager = new UpdateManager();

export function useUpdateManagerState(): UpdateManagerState {
  return useSyncExternalStore(
    updateManager.subscribe,
    updateManager.getSnapshot,
    updateManager.getSnapshot
  );
}
