type SvgEditEditor = {
  init: () => Promise<void> | void;
  setConfig: (config: Record<string, unknown>) => void;
  loadSvgString: (svg: string, options?: { noAlert?: boolean }) => void;
  updateCanvas?: (center?: boolean) => void;
  svgCanvas?: {
    bind?: (eventName: string, callback: (...args: unknown[]) => void) => void;
    getSvgString?: () => string;
  };
};

type SvgEditEditorConstructor = new (host: HTMLElement) => SvgEditEditor;

interface SvgEditAttachmentCallbacks {
  onError: (message: string | null) => void;
  onReady: (host: HTMLElement) => void;
  onSvgChange: (svg: string) => void;
}

interface SvgEditAttachment extends SvgEditAttachmentCallbacks {
  id: symbol;
}

interface PendingSvg {
  diagramId: string;
  force: boolean;
  svg: string;
}

const SVG_EDIT_PARKING_ID = "typr-svgedit-parking";
const SVG_EDIT_RUNTIME_CLASS = "diagram-editor__svgedit-runtime";

function formatSvgEditError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getSvgEditParkingHost(): HTMLElement {
  const existing = document.getElementById(SVG_EDIT_PARKING_ID);
  if (existing) {
    return existing;
  }

  const parkingHost = document.createElement("div");
  parkingHost.id = SVG_EDIT_PARKING_ID;
  parkingHost.setAttribute("aria-hidden", "true");
  Object.assign(parkingHost.style, {
    height: "800px",
    left: "-10000px",
    overflow: "hidden",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    visibility: "hidden",
    width: "1280px"
  });
  document.body.append(parkingHost);
  return parkingHost;
}

class SvgEditLifecycle {
  private attachment: SvgEditAttachment | null = null;
  private editor: SvgEditEditor | null = null;
  private initialization: Promise<void> | null = null;
  private lastError: string | null = null;
  private loadedDiagramId: string | null = null;
  private loadedSvg: string | null = null;
  private loading = false;
  private pendingSvg: PendingSvg | null = null;
  private readyTimers = new Set<number>();
  private runtimeHost: HTMLDivElement | null = null;
  private syncTimer: number | null = null;
  private viewportTimers = new Set<number>();

  attach(target: HTMLElement, callbacks: SvgEditAttachmentCallbacks): symbol {
    const attachment: SvgEditAttachment = {
      ...callbacks,
      id: Symbol("svg-edit-attachment")
    };

    this.attachment = attachment;
    target.append(this.getRuntimeHost());
    callbacks.onError(this.lastError);

    if (this.editor) {
      this.flushPendingSvg();
      this.scheduleViewportReset(attachment);
      this.notifyReady(attachment);
    } else {
      void this.ensureInitialized();
    }

    return attachment.id;
  }

  detach(attachmentId: symbol): void {
    if (this.attachment?.id !== attachmentId) {
      return;
    }

    this.attachment = null;
    this.clearOwnedTimers();

    const runtimeHost = this.runtimeHost;
    if (runtimeHost) {
      getSvgEditParkingHost().append(runtimeHost);
    }
  }

  getCurrentSvg(fallback: string): string {
    const svg = this.editor?.svgCanvas?.getSvgString?.();
    return typeof svg === "string" && svg.trim() ? svg : fallback;
  }

  load(diagramId: string, svg: string, options: { force?: boolean } = {}): void {
    this.pendingSvg = {
      diagramId,
      force: options.force === true,
      svg
    };

    if (this.editor) {
      this.flushPendingSvg();
    } else if (this.attachment) {
      void this.ensureInitialized();
    }
  }

  private clearOwnedTimers(): void {
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    this.readyTimers.forEach((timer) => window.clearTimeout(timer));
    this.readyTimers.clear();
    this.viewportTimers.forEach((timer) => window.clearTimeout(timer));
    this.viewportTimers.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.editor || this.initialization) {
      return this.initialization ?? Promise.resolve();
    }

    this.initialization = this.initialize().catch((error: unknown) => {
      this.lastError = formatSvgEditError(error, "SVG-Edit failed to load.");
      this.attachment?.onError(this.lastError);
    });

    return this.initialization;
  }

  private async initialize(): Promise<void> {
    const { default: Editor } = await import("svgedit") as {
      default: SvgEditEditorConstructor;
    };
    const runtimeHost = this.getRuntimeHost();
    const svgEditor = new Editor(runtimeHost);
    const canvasName = this.pendingSvg?.diagramId ?? "diagram";

    svgEditor.setConfig({
      allowInitialUserOverride: false,
      canvasName: `typr-${canvasName}`,
      dimensions: [640, 480],
      imgPath: "/svgedit/images",
      initTool: "select",
      no_save_warning: true,
      noDefaultExtensions: true,
      noStorageOnLoad: true,
      preventAllURLConfig: true,
      preventURLContentLoading: true,
      selectNew: false,
      showRulers: false,
      extensions: [],
      userExtensions: []
    });
    await svgEditor.init();

    this.editor = svgEditor;
    svgEditor.svgCanvas?.bind?.("changed", this.scheduleSync);
    svgEditor.svgCanvas?.bind?.("afterClear", this.scheduleSync);
    this.lastError = null;
    this.attachment?.onError(null);
    this.flushPendingSvg();

    if (this.attachment) {
      this.scheduleViewportReset(this.attachment);
      this.notifyReady(this.attachment);
    }
  }

  private flushPendingSvg(): void {
    const attachment = this.attachment;
    const editor = this.editor;
    const pendingSvg = this.pendingSvg;
    const runtimeHost = this.runtimeHost;

    if (!attachment || !editor || !pendingSvg || !runtimeHost?.isConnected) {
      return;
    }

    if (
      !pendingSvg.force &&
      this.loadedDiagramId === pendingSvg.diagramId &&
      this.loadedSvg === pendingSvg.svg
    ) {
      return;
    }

    try {
      this.loading = true;
      editor.loadSvgString(pendingSvg.svg, { noAlert: true });
      this.loadedDiagramId = pendingSvg.diagramId;
      this.pendingSvg = {
        ...pendingSvg,
        force: false
      };
      this.loadedSvg = pendingSvg.svg;
      this.lastError = null;
      attachment.onError(null);
      this.scheduleViewportReset(attachment);
    } catch (error) {
      this.lastError = formatSvgEditError(error, "Unable to load diagram SVG.");
      attachment.onError(this.lastError);
    } finally {
      this.loading = false;
    }
  }

  private getRuntimeHost(): HTMLDivElement {
    if (!this.runtimeHost) {
      this.runtimeHost = document.createElement("div");
      this.runtimeHost.className = SVG_EDIT_RUNTIME_CLASS;
    }

    return this.runtimeHost;
  }

  private scheduleViewportReset(attachment: SvgEditAttachment): void {
    this.viewportTimers.forEach((timer) => window.clearTimeout(timer));
    this.viewportTimers.clear();

    [0, 100, 500].forEach((delay) => {
      const timer = window.setTimeout(() => {
        this.viewportTimers.delete(timer);

        if (this.attachment?.id !== attachment.id || !this.runtimeHost?.isConnected) {
          return;
        }

        const workarea = this.runtimeHost.querySelector<HTMLElement>("#workarea");
        if (!workarea || workarea.clientWidth === 0 || workarea.clientHeight === 0) {
          return;
        }

        this.editor?.updateCanvas?.(true);
      }, delay);
      this.viewportTimers.add(timer);
    });
  }

  private notifyReady(attachment: SvgEditAttachment): void {
    const runtimeHost = this.runtimeHost;
    if (!runtimeHost || this.attachment?.id !== attachment.id) {
      return;
    }

    this.readyTimers.forEach((timer) => window.clearTimeout(timer));
    this.readyTimers.clear();
    attachment.onReady(runtimeHost);

    [0, 500].forEach((delay) => {
      const timer = window.setTimeout(() => {
        this.readyTimers.delete(timer);
        if (this.attachment?.id === attachment.id && runtimeHost.isConnected) {
          attachment.onReady(runtimeHost);
        }
      }, delay);
      this.readyTimers.add(timer);
    });
  }

  private scheduleSync = (): void => {
    if (this.loading || !this.attachment) {
      return;
    }

    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
    }

    const attachmentId = this.attachment.id;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      const attachment = this.attachment;
      if (!attachment || attachment.id !== attachmentId || this.loading) {
        return;
      }

      const svg = this.editor?.svgCanvas?.getSvgString?.();
      if (typeof svg === "string" && svg.trim()) {
        this.loadedSvg = svg;
        if (this.loadedDiagramId) {
          this.pendingSvg = {
            diagramId: this.loadedDiagramId,
            force: false,
            svg
          };
        }
        attachment.onSvgChange(svg);
      }
    }, 250);
  };
}

export const svgEditLifecycle = new SvgEditLifecycle();
