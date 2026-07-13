import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererModule = vi.hoisted(() => ({
  createTypstRenderer: vi.fn()
}));

vi.mock("@myriaddreamin/typst.ts/renderer", () => rendererModule);
vi.mock("@myriaddreamin/typst-ts-renderer/wasm?url", () => ({
  default: "/mock-typst-renderer.wasm"
}));
type RendererInit = (options: {
  getModule: () => string;
}) => Promise<void>;
type RendererSession = {
  getSourceLoc(path: Uint32Array): string | undefined;
  free?(): void;
};
type RendererRunWithSession = (
  options: {
    format: "vector";
    artifactContent: Uint8Array;
  },
  work: (session: RendererSession) => Promise<unknown>
) => Promise<unknown>;

describe("shared Typst renderer consumers", () => {
  beforeEach(() => {
    rendererModule.createTypstRenderer.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes one renderer for concurrent preview and source-map rendering", async () => {
    const driver = createRendererDriver();
    rendererModule.createTypstRenderer.mockReturnValue(driver);
    const { renderTypstArtifactToCanvas, renderSourceMappingOverlay } =
      await importRendererConsumers();

    const [, overlay] = await Promise.all([
      renderTypstArtifactToCanvas(createContainer(), new Uint8Array([1])),
      renderSourceMappingOverlay(createContainer(), new Uint8Array([2]))
    ]);

    expect(rendererModule.createTypstRenderer).toHaveBeenCalledTimes(1);
    expect(driver.init).toHaveBeenCalledTimes(1);
    expect(driver.init).toHaveBeenCalledWith({
      getModule: expect.any(Function)
    });
    expect(driver.init.mock.calls[0]?.[0].getModule()).toBe(
      "/mock-typst-renderer.wasm"
    );

    overlay.dispose();
  });

  it("shares initialization failures and retries once for both consumers", async () => {
    const initializationError = new Error("WASM initialization failed");
    const init = vi
      .fn<RendererInit>()
      .mockRejectedValueOnce(initializationError)
      .mockResolvedValue(undefined);
    rendererModule.createTypstRenderer.mockImplementation(() =>
      createRendererDriver(init)
    );
    const { renderTypstArtifactToCanvas, renderSourceMappingOverlay } =
      await importRendererConsumers();

    const firstAttempt = await Promise.allSettled([
      renderTypstArtifactToCanvas(createContainer(), new Uint8Array([1])),
      renderSourceMappingOverlay(createContainer(), new Uint8Array([2]))
    ]);

    expect(firstAttempt.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected"
    ]);
    expect(rendererModule.createTypstRenderer).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    const retry = await Promise.allSettled([
      renderTypstArtifactToCanvas(createContainer(), new Uint8Array([3])),
      renderSourceMappingOverlay(createContainer(), new Uint8Array([4]))
    ]);

    expect(retry.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled"
    ]);
    expect(rendererModule.createTypstRenderer).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledTimes(2);

    const overlay = retry[1];
    if (overlay.status === "fulfilled") {
      overlay.value.dispose();
    }
  });

  it("releases a source-map session exactly once", async () => {
    const session = {
      getSourceLoc: vi.fn(),
      free: vi.fn()
    };
    const driver = createRendererDriver();
    driver.createModule.mockResolvedValue(session);
    rendererModule.createTypstRenderer.mockReturnValue(driver);
    const { renderSourceMappingOverlay } = await import(
      "./sourceMappingOverlay"
    );

    const overlay = await renderSourceMappingOverlay(
      createContainer(),
      new Uint8Array([1])
    );
    overlay.dispose();
    overlay.dispose();

    await vi.waitFor(() => {
      expect(session.free).toHaveBeenCalledTimes(1);
    });
  });

  it("releases a source-map session when rendering fails", async () => {
    const renderingError = new Error("canvas render failed");
    const session = {
      getSourceLoc: vi.fn(),
      free: vi.fn()
    };
    const driver = createRendererDriver();
    driver.createModule.mockResolvedValue(session);
    driver.renderToCanvas.mockRejectedValueOnce(renderingError);
    rendererModule.createTypstRenderer.mockReturnValue(driver);
    const { renderSourceMappingOverlay } = await import(
      "./sourceMappingOverlay"
    );

    await expect(
      renderSourceMappingOverlay(createContainer(), new Uint8Array([1]))
    ).rejects.toBe(renderingError);
    await vi.waitFor(() => {
      expect(session.free).toHaveBeenCalledTimes(1);
    });
  });
});

function createRendererDriver(
  init = vi.fn<RendererInit>(async () => undefined)
) {
  const createModule = vi.fn<
    (artifactContent: Uint8Array) => Promise<RendererSession>
  >(async () => ({
    getSourceLoc: vi.fn(),
    free: vi.fn()
  }));

  return {
    init,
    createModule,
    runWithSession: vi.fn<RendererRunWithSession>(
      async (options, work) => {
        const session = await createModule(options.artifactContent);

        try {
          return await work(session);
        } finally {
          session.free?.();
        }
      }
    ),
    renderToCanvas: vi.fn(async () => undefined)
  };
}

function createContainer(): HTMLElement {
  return {
    innerHTML: "existing preview",
    clientWidth: 600,
    querySelectorAll: vi.fn(() => [])
  } as unknown as HTMLElement;
}

async function importRendererConsumers() {
  const [{ renderTypstArtifactToCanvas }, { renderSourceMappingOverlay }] =
    await Promise.all([
      import("./typstCanvasRenderer"),
      import("./sourceMappingOverlay")
    ]);

  return { renderTypstArtifactToCanvas, renderSourceMappingOverlay };
}
