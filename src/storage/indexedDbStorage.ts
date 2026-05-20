import { openDB } from "idb";
import type { AppSnapshot } from "../app/appState";
import type { GitHubRemoteConfig } from "../github/githubSync";
import type { ThemeDefinition } from "../theme/themes";
import type { TypstSnippet } from "../snippets/snippets";

const DATABASE_NAME = "wrytr";
const DATABASE_VERSION = 1;
const STORE_NAME = "app";
const SNAPSHOT_KEY = "snapshot";
const GITHUB_CONFIG_KEY = "github-config";
const CUSTOM_THEMES_KEY = "custom-themes";
const CUSTOM_SNIPPETS_KEY = "custom-snippets";

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

export async function loadGitHubConfig(): Promise<GitHubRemoteConfig | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, GITHUB_CONFIG_KEY)) ?? null;
}

export async function saveGitHubConfig(config: GitHubRemoteConfig): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, config, GITHUB_CONFIG_KEY);
}

export async function loadCustomThemes(): Promise<ThemeDefinition[] | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, CUSTOM_THEMES_KEY)) ?? null;
}

export async function saveCustomThemes(themes: ThemeDefinition[]): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, themes, CUSTOM_THEMES_KEY);
}

export async function loadCustomSnippets(): Promise<TypstSnippet[] | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, CUSTOM_SNIPPETS_KEY)) ?? null;
}

export async function saveCustomSnippets(snippets: TypstSnippet[]): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, snippets, CUSTOM_SNIPPETS_KEY);
}
