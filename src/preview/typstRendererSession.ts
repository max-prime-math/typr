import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";

interface TypstRendererModule {
  createTypstRenderer(): TypstRendererDriver;
}

export interface TypstRendererDriver {
  init(options: { getModule: () => string }): Promise<void>;
  runWithSession<T>(
    options: {
      format: "vector";
      artifactContent: Uint8Array;
    },
    work: (session: TypstRenderSession) => Promise<T>
  ): Promise<T>;
  renderToCanvas(options: TypstCanvasRenderOptions): Promise<void>;
}

export interface TypstRenderSession {
  getSourceLoc(path: Uint32Array): string | undefined;
}

type TypstCanvasRenderOptions = {
  container: HTMLElement;
  pixelPerPt?: number;
  backgroundColor?: string;
  dataSelection?: {
    body?: boolean;
    semantics?: boolean;
  };
} & (
  | {
      artifactContent: Uint8Array;
      format: "vector";
    }
  | {
      renderSession: TypstRenderSession;
    }
);

export interface TypstRendererSession {
  renderer: TypstRendererDriver;
  session: TypstRenderSession;
  dispose(): void;
}

let rendererPromise: Promise<TypstRendererDriver> | null = null;

/**
 * Returns the renderer shared by all preview consumers for this module lifetime.
 * Concurrent callers share one initialization attempt; a failed attempt is
 * evicted so the next caller can retry from a fresh renderer instance.
 */
export function getTypstRenderer(): Promise<TypstRendererDriver> {
  if (!rendererPromise) {
    const initialization = initializeRenderer();
    const sharedInitialization = initialization.catch((error: unknown) => {
      if (rendererPromise === sharedInitialization) {
        rendererPromise = null;
      }

      throw error;
    });
    rendererPromise = sharedInitialization;
  }

  return rendererPromise;
}

/**
 * Leases a session owned by one artifact render. The renderer keeps the session
 * alive until dispose is called, then its runWithSession boundary releases the
 * underlying WASM state. Disposal is safe to repeat.
 */
export async function createTypstRendererSession(
  artifactContent: Uint8Array
): Promise<TypstRendererSession> {
  const renderer = await getTypstRenderer();
  let sessionStarted = false;
  let releaseSession!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  let resolveSession!: (session: TypstRendererSession) => void;
  let rejectSession!: (error: unknown) => void;
  const sessionReady = new Promise<TypstRendererSession>((resolve, reject) => {
    resolveSession = resolve;
    rejectSession = reject;
  });

  const lifetime = renderer.runWithSession(
    {
      format: "vector",
      artifactContent
    },
    async (session) => {
      sessionStarted = true;
      let disposed = false;

      resolveSession({
        renderer,
        session,
        dispose() {
          if (disposed) {
            return;
          }

          disposed = true;
          releaseSession();
        }
      });
      await released;
    }
  );

  void lifetime.then(
    () => {
      if (!sessionStarted) {
        rejectSession(new Error("Typst renderer did not create a render session."));
      }
    },
    (error: unknown) => {
      if (!sessionStarted) {
        rejectSession(error);
      }
    }
  );

  return sessionReady;
}

async function initializeRenderer(): Promise<TypstRendererDriver> {
  const module = (await import(
    "@myriaddreamin/typst.ts/renderer"
  )) as unknown as TypstRendererModule;
  const renderer = module.createTypstRenderer();
  await renderer.init({
    getModule: () => typstRendererWasmUrl
  });
  return renderer;
}
