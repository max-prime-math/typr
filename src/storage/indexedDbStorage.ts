import { openDB } from "idb";
import type { AppSnapshot } from "../app/appState";

const DATABASE_NAME = "wrytr";
const DATABASE_VERSION = 1;
const STORE_NAME = "app";
const SNAPSHOT_KEY = "snapshot";

async function getDatabase() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    }
  });
}

export async function loadSnapshot(): Promise<AppSnapshot | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, SNAPSHOT_KEY)) ?? null;
}

export async function saveSnapshot(snapshot: AppSnapshot): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, snapshot, SNAPSHOT_KEY);
}
