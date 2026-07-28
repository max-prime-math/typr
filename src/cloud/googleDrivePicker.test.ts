import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadGooglePicker,
  resetGooglePickerLoaderForTests,
  showGoogleDriveFolderPicker,
  type GooglePickerNamespace
} from "./googleDrivePicker";

describe("Google Drive folder Picker", () => {
  afterEach(() => {
    resetGooglePickerLoaderForTests();
    vi.restoreAllMocks();
  });

  it("loads the Google Picker script and library only once", async () => {
    const picker = createPickerNamespace().picker;
    const listeners = new Map<string, () => void>();
    const script = {
      addEventListener: (name: string, callback: () => void) => {
        listeners.set(name, callback);
      }
    };
    const targetWindow = {
      gapi: {
        load: vi.fn(
          (
            _library: string,
            options: { callback: () => void }
          ) => {
            targetWindow.google = { picker };
            options.callback();
          }
        )
      },
      google: undefined as { picker: GooglePickerNamespace } | undefined
    };
    const append = vi.fn(() => listeners.get("load")?.());
    const targetDocument = {
      createElement: () => script,
      head: { append },
      querySelector: () => null
    };

    const first = loadGooglePicker(
      targetWindow as unknown as Window,
      targetDocument as unknown as Document
    );
    const second = loadGooglePicker(
      targetWindow as unknown as Window,
      targetDocument as unknown as Document
    );

    await expect(first).resolves.toBe(picker);
    await expect(second).resolves.toBe(picker);
    expect(append).toHaveBeenCalledOnce();
    expect(targetWindow.gapi.load).toHaveBeenCalledOnce();
  });

  it("surfaces a Picker script load failure", async () => {
    const listeners = new Map<string, () => void>();
    const targetDocument = {
      createElement: () => ({
        addEventListener: (name: string, callback: () => void) => {
          listeners.set(name, callback);
        }
      }),
      head: {
        append: () => listeners.get("error")?.()
      },
      querySelector: () => null
    };

    await expect(
      loadGooglePicker(
        {} as Window,
        targetDocument as unknown as Document
      )
    ).rejects.toThrow("Google Picker script failed to load");
  });

  it("configures a folder-only list view and returns the selected folder", async () => {
    const mock = createPickerNamespace({
      action: "picked",
      documents: [
        {
          id: "parent-1",
          mimeType: "application/vnd.google-apps.folder",
          name: "Course work",
          url: "https://drive.google.com/drive/folders/parent-1"
        }
      ]
    });

    await expect(
      showGoogleDriveFolderPicker({
        accessToken: "token",
        appId: "320318238451",
        developerKey: "api-key",
        origin: "https://typr.ca",
        picker: mock.picker
      })
    ).resolves.toEqual({
      kind: "picked",
      folder: {
        id: "parent-1",
        mimeType: "application/vnd.google-apps.folder",
        name: "Course work",
        url: "https://drive.google.com/drive/folders/parent-1"
      }
    });

    expect(mock.view.setIncludeFolders).toHaveBeenCalledWith(true);
    expect(mock.view.setSelectFolderEnabled).toHaveBeenCalledWith(true);
    expect(mock.view.setMimeTypes).toHaveBeenCalledWith(
      "application/vnd.google-apps.folder"
    );
    expect(mock.view.setMode).toHaveBeenCalledWith("list");
    expect(mock.builder.setOAuthToken).toHaveBeenCalledWith("token");
    expect(mock.builder.setDeveloperKey).toHaveBeenCalledWith("api-key");
    expect(mock.builder.setAppId).toHaveBeenCalledWith("320318238451");
  });

  it("handles cancellation and invalid selections explicitly", async () => {
    const cancelled = createPickerNamespace({ action: "cancel" });
    await expect(
      showGoogleDriveFolderPicker({
        accessToken: "token",
        appId: "320318238451",
        developerKey: "api-key",
        origin: "https://typr.ca",
        picker: cancelled.picker
      })
    ).resolves.toEqual({ kind: "cancelled" });

    const invalid = createPickerNamespace({
      action: "picked",
      documents: [
        {
          id: "file-1",
          mimeType: "text/plain",
          name: "not-a-folder"
        }
      ]
    });
    await expect(
      showGoogleDriveFolderPicker({
        accessToken: "token",
        appId: "320318238451",
        developerKey: "api-key",
        origin: "https://typr.ca",
        picker: invalid.picker
      })
    ).rejects.toThrow("invalid folder selection");

    const authFailure = createPickerNamespace({
      action: "auth-failed",
      error: { message: "Access token rejected" }
    });
    await expect(
      showGoogleDriveFolderPicker({
        accessToken: "token",
        appId: "320318238451",
        developerKey: "api-key",
        origin: "https://typr.ca",
        picker: authFailure.picker
      })
    ).rejects.toThrow("Access token rejected");
  });
});

function createPickerNamespace(response?: Record<string, unknown>) {
  const view = {
    setIncludeFolders: vi.fn(function () {
      return view;
    }),
    setMimeTypes: vi.fn(function () {
      return view;
    }),
    setMode: vi.fn(function () {
      return view;
    }),
    setSelectFolderEnabled: vi.fn(function () {
      return view;
    })
  };
  let callback: ((data: Record<string, unknown>) => void) | null = null;
  const builder = {
    addView: vi.fn(function () {
      return builder;
    }),
    build: vi.fn(() => ({
      setVisible: vi.fn(() => {
        if (response) {
          callback?.(response);
        }
      })
    })),
    setAppId: vi.fn(function () {
      return builder;
    }),
    setCallback: vi.fn(function (
      nextCallback: (data: Record<string, unknown>) => void
    ) {
      callback = nextCallback;
      return builder;
    }),
    setDeveloperKey: vi.fn(function () {
      return builder;
    }),
    setOAuthToken: vi.fn(function () {
      return builder;
    }),
    setOrigin: vi.fn(function () {
      return builder;
    })
  };
  const picker: GooglePickerNamespace = {
    Action: { CANCEL: "cancel", LOADED: "loaded", PICKED: "picked" },
    DocsView: class {
      constructor() {
        return view;
      }
    } as unknown as GooglePickerNamespace["DocsView"],
    DocsViewMode: { LIST: "list" },
    Document: {
      ID: "id",
      MIME_TYPE: "mimeType",
      NAME: "name",
      URL: "url"
    },
    PickerBuilder: class {
      constructor() {
        return builder;
      }
    } as unknown as GooglePickerNamespace["PickerBuilder"],
    Response: { ACTION: "action", DOCUMENTS: "documents" },
    ViewId: { DOCS: "docs" }
  };
  return { builder, picker, view };
}
