import { openDB, type IDBPDatabase } from "idb";
import { isTyprChannelOrigin } from "./channelSwitch";

const DATABASE_NAME = "typr";
const DATABASE_VERSION = 2;
const APP_STORE_NAME = "app";
const GIT_FILE_STORE_NAME = "git-files";
const TRANSFER_VERSION = 1;
const TRANSFER_READY_TYPE = "typr:channel-transfer-ready";
const TRANSFER_DATA_TYPE = "typr:channel-transfer-data";
const TRANSFER_COMPLETE_TYPE = "typr:channel-transfer-complete";
const TRANSFER_ERROR_TYPE = "typr:channel-transfer-error";
const DEFAULT_TRANSFER_TIMEOUT_MS = 12_000;

const PRIVATE_APP_KEYS = new Set([
  "git-credentials",
  "github-config"
]);
const PRIVATE_APP_KEY_PREFIXES = ["local-folder-binding:"];
const PRIVATE_LOCAL_STORAGE_KEY_PREFIXES = [
  "typr.google-drive.oauth-",
  "typr.typst-preview-cache.",
  "typr.build-log."
];

export interface ChannelTransferRecord {
  key: IDBValidKey;
  value: unknown;
}

export interface ChannelTransferPayload {
  version: typeof TRANSFER_VERSION;
  appRecords: ChannelTransferRecord[];
  gitFileRecords: ChannelTransferRecord[];
  localStorageRecords: Array<[string, string]>;
}

interface ChannelTransferMessage {
  type: string;
  sessionId: string;
  payload?: ChannelTransferPayload;
  message?: string;
}

function isTransferableAppKey(key: IDBValidKey): boolean {
  if (typeof key !== "string") {
    return false;
  }

  return (
    !PRIVATE_APP_KEYS.has(key) &&
    !PRIVATE_APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function isTransferableLocalStorageKey(key: string): boolean {
  return (
    key.startsWith("typr.") &&
    !PRIVATE_LOCAL_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

async function openTyprDatabase(): Promise<IDBPDatabase> {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(APP_STORE_NAME)) {
        database.createObjectStore(APP_STORE_NAME);
      }
      if (!database.objectStoreNames.contains(GIT_FILE_STORE_NAME)) {
        database.createObjectStore(GIT_FILE_STORE_NAME);
      }
    }
  });
}

async function readStoreRecords(
  database: IDBPDatabase,
  storeName: typeof APP_STORE_NAME | typeof GIT_FILE_STORE_NAME,
  include: (key: IDBValidKey) => boolean = () => true
): Promise<ChannelTransferRecord[]> {
  const transaction = database.transaction(storeName, "readonly");
  const keys = await transaction.store.getAllKeys();
  const records = await Promise.all(
    keys.filter(include).map(async (key) => ({
      key,
      value: await transaction.store.get(key)
    }))
  );
  await transaction.done;
  return records;
}

export async function createChannelTransferPayload(
  storage: Storage = window.localStorage
): Promise<ChannelTransferPayload> {
  const database = await openTyprDatabase();

  try {
    const [appRecords, gitFileRecords] = await Promise.all([
      readStoreRecords(database, APP_STORE_NAME, isTransferableAppKey),
      readStoreRecords(database, GIT_FILE_STORE_NAME)
    ]);
    const localStorageRecords: Array<[string, string]> = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !isTransferableLocalStorageKey(key)) {
        continue;
      }

      const value = storage.getItem(key);
      if (value !== null) {
        localStorageRecords.push([key, value]);
      }
    }

    return {
      version: TRANSFER_VERSION,
      appRecords,
      gitFileRecords,
      localStorageRecords
    };
  } finally {
    database.close();
  }
}

async function replaceStoreRecords(
  database: IDBPDatabase,
  storeName: typeof APP_STORE_NAME | typeof GIT_FILE_STORE_NAME,
  records: readonly ChannelTransferRecord[],
  shouldReplace: (key: IDBValidKey) => boolean = () => true
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  const existingKeys = await transaction.store.getAllKeys();

  await Promise.all([
    ...existingKeys
      .filter(shouldReplace)
      .map((key) => transaction.store.delete(key)),
    ...records
      .filter((record) => shouldReplace(record.key))
      .map((record) => transaction.store.put(record.value, record.key))
  ]);
  await transaction.done;
}

export async function applyChannelTransferPayload(
  payload: ChannelTransferPayload,
  storage: Storage = window.localStorage
): Promise<void> {
  if (payload.version !== TRANSFER_VERSION) {
    throw new Error("This workspace transfer was created by an unsupported Typr version.");
  }

  const database = await openTyprDatabase();

  try {
    await replaceStoreRecords(database, APP_STORE_NAME, payload.appRecords, isTransferableAppKey);
    await replaceStoreRecords(database, GIT_FILE_STORE_NAME, payload.gitFileRecords);
  } finally {
    database.close();
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isTransferableLocalStorageKey(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
  payload.localStorageRecords.forEach(([key, value]) => {
    if (isTransferableLocalStorageKey(key)) {
      storage.setItem(key, value);
    }
  });
}

function createSessionId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isChannelTransferMessage(value: unknown): value is ChannelTransferMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string" &&
    "sessionId" in value &&
    typeof value.sessionId === "string"
  );
}

export async function transferWorkspaceToChannel(
  destinationOrigin: string,
  options: {
    document?: Document;
    timeoutMs?: number;
    window?: Window;
  } = {}
): Promise<void> {
  const sourceWindow = options.window ?? window;
  const sourceDocument = options.document ?? document;

  if (!isTyprChannelOrigin(destinationOrigin)) {
    throw new Error("Typr can only transfer a workspace to a known release channel.");
  }

  const payload = await createChannelTransferPayload(sourceWindow.localStorage);
  const sessionId = createSessionId();
  const transferUrl = new URL("/channel-transfer.html", destinationOrigin);
  transferUrl.hash = new URLSearchParams({
    sessionId,
    sourceOrigin: sourceWindow.location.origin
  }).toString();

  const frame = sourceDocument.createElement("iframe");
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.title = "Transferring Typr workspace";
  frame.src = transferUrl.href;
  sourceDocument.body.append(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = sourceWindow.setTimeout(() => {
        cleanup();
        reject(new Error("The destination channel did not accept the workspace in time."));
      }, options.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS);

      const cleanup = () => {
        sourceWindow.clearTimeout(timeout);
        sourceWindow.removeEventListener("message", handleMessage);
      };

      const handleMessage = (event: MessageEvent) => {
        if (
          event.origin !== destinationOrigin ||
          event.source !== frame.contentWindow ||
          !isChannelTransferMessage(event.data) ||
          event.data.sessionId !== sessionId
        ) {
          return;
        }

        if (event.data.type === TRANSFER_READY_TYPE) {
          frame.contentWindow?.postMessage(
            {
              type: TRANSFER_DATA_TYPE,
              sessionId,
              payload
            } satisfies ChannelTransferMessage,
            destinationOrigin
          );
          return;
        }

        if (event.data.type === TRANSFER_COMPLETE_TYPE) {
          cleanup();
          resolve();
          return;
        }

        if (event.data.type === TRANSFER_ERROR_TYPE) {
          cleanup();
          reject(new Error(event.data.message || "The destination channel rejected the workspace."));
        }
      };

      sourceWindow.addEventListener("message", handleMessage);
    });
  } finally {
    frame.remove();
  }
}

export function startChannelTransferReceiver(
  receiverWindow: Window = window
): void {
  const parameters = new URLSearchParams(receiverWindow.location.hash.slice(1));
  const sessionId = parameters.get("sessionId") ?? "";
  const sourceOrigin = parameters.get("sourceOrigin") ?? "";

  if (!sessionId || !isTyprChannelOrigin(sourceOrigin) || receiverWindow.parent === receiverWindow) {
    return;
  }

  const handleMessage = (event: MessageEvent) => {
    if (
      event.origin !== sourceOrigin ||
      event.source !== receiverWindow.parent ||
      !isChannelTransferMessage(event.data) ||
      event.data.type !== TRANSFER_DATA_TYPE ||
      event.data.sessionId !== sessionId ||
      !event.data.payload
    ) {
      return;
    }

    receiverWindow.removeEventListener("message", handleMessage);
    void applyChannelTransferPayload(event.data.payload, receiverWindow.localStorage)
      .then(() => {
        receiverWindow.parent.postMessage(
          { type: TRANSFER_COMPLETE_TYPE, sessionId } satisfies ChannelTransferMessage,
          sourceOrigin
        );
      })
      .catch((error) => {
        receiverWindow.parent.postMessage(
          {
            type: TRANSFER_ERROR_TYPE,
            sessionId,
            message: error instanceof Error ? error.message : "Unable to save the transferred workspace."
          } satisfies ChannelTransferMessage,
          sourceOrigin
        );
      });
  };

  receiverWindow.addEventListener("message", handleMessage);
  receiverWindow.parent.postMessage(
    { type: TRANSFER_READY_TYPE, sessionId } satisfies ChannelTransferMessage,
    sourceOrigin
  );
}
