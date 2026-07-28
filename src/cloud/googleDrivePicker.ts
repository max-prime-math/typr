const GOOGLE_API_SCRIPT_URL = "https://apis.google.com/js/api.js";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const PICKER_LOAD_TIMEOUT_MS = 15_000;

type PickerData = Record<string, unknown>;

interface GooglePickerDocsView {
  setIncludeFolders(included: boolean): GooglePickerDocsView;
  setMimeTypes(mimeTypes: string): GooglePickerDocsView;
  setMode(mode: unknown): GooglePickerDocsView;
  setSelectFolderEnabled(enabled: boolean): GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView(view: GooglePickerDocsView): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
  setAppId(appId: string): GooglePickerBuilder;
  setCallback(callback: (data: PickerData) => void): GooglePickerBuilder;
  setDeveloperKey(developerKey: string): GooglePickerBuilder;
  setOAuthToken(oauthToken: string): GooglePickerBuilder;
  setOrigin(origin: string): GooglePickerBuilder;
}

export interface GooglePickerNamespace {
  Action: {
    CANCEL: unknown;
    LOADED?: unknown;
    PICKED: unknown;
  };
  DocsView: new (viewId: unknown) => GooglePickerDocsView;
  DocsViewMode: {
    LIST: unknown;
  };
  Document: {
    ID: string;
    MIME_TYPE: string;
    NAME: string;
    URL: string;
  };
  PickerBuilder: new () => GooglePickerBuilder;
  Response: {
    ACTION: string;
    DOCUMENTS: string;
  };
  ViewId: {
    DOCS: unknown;
  };
}

interface GoogleApiWindow extends Window {
  gapi?: {
    load(
      library: string,
      options:
        | (() => void)
        | {
            callback: () => void;
            onerror: () => void;
            timeout: number;
            ontimeout: () => void;
          }
    ): void;
  };
  google?: {
    picker?: GooglePickerNamespace;
  };
}

export interface GoogleDrivePickedFolder {
  id: string;
  mimeType: typeof DRIVE_FOLDER_MIME_TYPE;
  name: string;
  url: string | null;
}

export type GoogleDrivePickerResult =
  | { kind: "cancelled" }
  | { folder: GoogleDrivePickedFolder; kind: "picked" };

let pickerLoader: Promise<GooglePickerNamespace> | null = null;

export function loadGooglePicker(
  targetWindow: GoogleApiWindow = window,
  targetDocument: Document = document
): Promise<GooglePickerNamespace> {
  const existing = targetWindow.google?.picker;
  if (existing) {
    return Promise.resolve(existing);
  }
  if (pickerLoader) {
    return pickerLoader;
  }

  pickerLoader = new Promise<GooglePickerNamespace>((resolve, reject) => {
    const scriptTimeout = globalThis.setTimeout(() => {
      reject(new Error("Google Picker script took too long to load."));
    }, PICKER_LOAD_TIMEOUT_MS);
    const clearScriptTimeout = () => {
      globalThis.clearTimeout(scriptTimeout);
    };
    const finishPickerLoad = () => {
      clearScriptTimeout();
      const gapi = targetWindow.gapi;
      if (!gapi?.load) {
        reject(
          new Error("Google Picker loader did not initialize correctly.")
        );
        return;
      }
      gapi.load("picker", {
        callback: () => {
          const picker = targetWindow.google?.picker;
          if (picker) {
            resolve(picker);
          } else {
            reject(
              new Error("Google Picker library did not become available.")
            );
          }
        },
        onerror: () =>
          reject(new Error("Google Picker library failed to load.")),
        timeout: PICKER_LOAD_TIMEOUT_MS,
        ontimeout: () =>
          reject(new Error("Google Picker library took too long to load."))
      });
    };

    const existingScript = targetDocument.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_API_SCRIPT_URL}"]`
    );
    if (existingScript) {
      if (targetWindow.gapi?.load) {
        finishPickerLoad();
      } else {
        existingScript.addEventListener("load", finishPickerLoad, {
          once: true
        });
        existingScript.addEventListener(
          "error",
          () => {
            clearScriptTimeout();
            reject(new Error("Google Picker script failed to load."));
          },
          { once: true }
        );
      }
      return;
    }

    const script = targetDocument.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = GOOGLE_API_SCRIPT_URL;
    script.addEventListener("load", finishPickerLoad, { once: true });
    script.addEventListener(
      "error",
      () => {
        clearScriptTimeout();
        reject(new Error("Google Picker script failed to load."));
      },
      { once: true }
    );
    targetDocument.head.append(script);
  }).catch((error) => {
    pickerLoader = null;
    throw error;
  });

  return pickerLoader;
}

export async function showGoogleDriveFolderPicker(options: {
  accessToken: string;
  appId: string;
  developerKey: string;
  origin?: string;
  picker?: GooglePickerNamespace;
}): Promise<GoogleDrivePickerResult> {
  if (!options.developerKey.trim()) {
    throw new Error("Google Picker API key is not configured.");
  }
  if (!/^\d+$/.test(options.appId.trim())) {
    throw new Error(
      "Google Cloud project number for Picker is not configured correctly."
    );
  }

  const picker = options.picker ?? (await loadGooglePicker());
  const view = new picker.DocsView(picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes(DRIVE_FOLDER_MIME_TYPE)
    .setMode(picker.DocsViewMode.LIST);

  return new Promise<GoogleDrivePickerResult>((resolve, reject) => {
    const callback = (data: PickerData) => {
      const action = data[picker.Response.ACTION];
      if (action === picker.Action.CANCEL) {
        resolve({ kind: "cancelled" });
        return;
      }
      if (
        picker.Action.LOADED !== undefined &&
        action === picker.Action.LOADED
      ) {
        return;
      }
      if (action !== picker.Action.PICKED) {
        const pickerError = readPickerError(data);
        reject(
          new Error(
            pickerError
              ? `Google Picker failed: ${pickerError}`
              : "Google Picker returned an invalid response."
          )
        );
        return;
      }

      const documents = data[picker.Response.DOCUMENTS];
      const document =
        Array.isArray(documents) && documents.length === 1
          ? (documents[0] as Record<string, unknown>)
          : null;
      const id = readDocumentString(document, picker.Document.ID);
      const name = readDocumentString(document, picker.Document.NAME);
      const mimeType = readDocumentString(
        document,
        picker.Document.MIME_TYPE
      );
      const url = readDocumentString(document, picker.Document.URL);
      if (!id || !name || mimeType !== DRIVE_FOLDER_MIME_TYPE) {
        reject(
          new Error(
            "Google Picker returned an invalid folder selection. Try choosing the destination again."
          )
        );
        return;
      }
      resolve({
        folder: {
          id,
          mimeType: DRIVE_FOLDER_MIME_TYPE,
          name,
          url
        },
        kind: "picked"
      });
    };

    try {
      const builtPicker = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(options.accessToken)
        .setDeveloperKey(options.developerKey)
        .setAppId(options.appId)
        .setOrigin(options.origin ?? window.location.origin)
        .setCallback(callback)
        .build();
      builtPicker.setVisible(true);
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : new Error("Google Picker could not be opened.")
      );
    }
  });
}

export function resetGooglePickerLoaderForTests(): void {
  pickerLoader = null;
}

function readDocumentString(
  document: Record<string, unknown> | null,
  key: string
): string | null {
  const value = document?.[key];
  return typeof value === "string" && value ? value : null;
}

function readPickerError(data: PickerData): string | null {
  const error = data.error;
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return null;
}
