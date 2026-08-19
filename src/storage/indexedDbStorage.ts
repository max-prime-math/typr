import { openDB } from "idb";
import type { AppSnapshot } from "../app/appState";
import type {
  CloudProjectBindingRecord,
  CloudStorageProviderId
} from "../cloud/cloudSync";
import type { GitWorkspaceState } from "../git/gitState";
import type { ProjectDeletionTombstone } from "../project/projectDeletion";
import type { TyprProjectStorageState } from "../project/projectState";
import type { ThemeDefinition } from "../theme/themes";
import type { LocalFolderSyncMode } from "../workspace/localFolderSyncPolicy";
import {
  normalizeSnippetCollections,
  type SnippetCollections
} from "../snippets/snippets";

const DATABASE_NAME = "typr";
const DATABASE_VERSION = 2;
const STORE_NAME = "app";
const GIT_FILE_STORE_NAME = "git-files";
const SNAPSHOT_KEY = "snapshot";
const PROJECT_STORAGE_KEY = "project-storage";
const PROJECT_STORAGE_METADATA_KEY = "project-storage-metadata";
const PROJECT_DELETION_TOMBSTONE_PREFIX = "project-deletion-tombstone:";
const LOCAL_FOLDER_BINDING_PREFIX = "local-folder-binding:";
const CLOUD_PROJECT_BINDING_PREFIX = "cloud-project-binding:";
const GITHUB_CONFIG_KEY = "github-config";
const GIT_WORKSPACE_KEY = "git-workspace";
const GIT_CREDENTIALS_KEY = "git-credentials";
const CUSTOM_THEMES_KEY = "custom-themes";
const CUSTOM_SNIPPETS_KEY = "custom-snippets";
const COMPANION_BASE_URL_KEY = "companion-base-url";
const COMPANION_API_KEY_KEY = "companion-api-key";

export interface LegacyGitHubRemoteConfig {
  owner: string;
  repo: string;
  branch: string;
  directory: string;
  token: string;
}

export interface LocalFolderBindingRecord {
  version: 1;
  projectId: string;
  directoryHandle: FileSystemDirectoryHandle;
  directoryName: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  directoryFingerprint?: string | null;
  syncMode?: LocalFolderSyncMode;
  syncIntervalMinutes?: number;
  worktreeSignatures: Record<string, string>;
  gitSignatures: Record<string, string>;
}

async function getDatabase() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      if (!database.objectStoreNames.contains(GIT_FILE_STORE_NAME)) {
        database.createObjectStore(GIT_FILE_STORE_NAME);
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

export async function loadCompanionBaseUrlSetting(): Promise<string | null> {
  const database = await getDatabase();
  const value = await database.get(STORE_NAME, COMPANION_BASE_URL_KEY);
  return typeof value === "string" ? value : null;
}

export async function saveCompanionBaseUrlSetting(baseUrl: string): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, baseUrl, COMPANION_BASE_URL_KEY);
}

export async function loadCompanionApiKeySetting(): Promise<string | null> {
  const database = await getDatabase();
  const value = await database.get(STORE_NAME, COMPANION_API_KEY_KEY);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function saveCompanionApiKeySetting(apiKey: string): Promise<void> {
  const database = await getDatabase();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await database.delete(STORE_NAME, COMPANION_API_KEY_KEY);
    return;
  }
  await database.put(STORE_NAME, trimmed, COMPANION_API_KEY_KEY);
}

export async function loadProjectStorage(): Promise<TyprProjectStorageState | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, PROJECT_STORAGE_KEY)) ?? null;
}

export async function saveProjectStorage(storage: TyprProjectStorageState): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await Promise.all([
    transaction.store.put(storage, PROJECT_STORAGE_KEY),
    transaction.store.put(createProjectStorageMetadata(storage), PROJECT_STORAGE_METADATA_KEY),
    transaction.done
  ]);
}

export async function commitCompanionWorkspaceSync(options: {
  projectStorage: TyprProjectStorageState;
  snapshot: AppSnapshot;
  binding: CloudProjectBindingRecord;
}): Promise<void> {
  if (options.binding.providerId !== "typr-companion" ||
      !options.projectStorage.projects.some((project) => project.id === options.binding.projectId)) {
    throw new Error("A Companion workspace commit requires a matching project and binding.");
  }
  const database = await getDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  await Promise.all([
    transaction.store.put(options.projectStorage, PROJECT_STORAGE_KEY),
    transaction.store.put(createProjectStorageMetadata(options.projectStorage), PROJECT_STORAGE_METADATA_KEY),
    transaction.store.put(options.snapshot, SNAPSHOT_KEY),
    transaction.store.put(
      options.binding,
      getCloudProjectBindingKey(options.binding.providerId, options.binding.projectId)
    ),
    transaction.done
  ]);
}

function createProjectStorageMetadata(storage: TyprProjectStorageState) {
  return {
    version: storage.version,
    selectedProjectId: storage.selectedProjectId,
    projectCount: storage.projects.length,
    savedAt: new Date().toISOString(),
    legacySnapshotRetained: storage.migration.legacySnapshotRetained
  };
}

export async function loadLocalFolderBinding(
  projectId: string
): Promise<LocalFolderBindingRecord | null> {
  const database = await getDatabase();
  return (
    (await database.get(STORE_NAME, getLocalFolderBindingKey(projectId))) ?? null
  );
}

export async function saveLocalFolderBinding(
  binding: LocalFolderBindingRecord
): Promise<void> {
  const database = await getDatabase();
  await database.put(
    STORE_NAME,
    binding,
    getLocalFolderBindingKey(binding.projectId)
  );
}

export async function deleteLocalFolderBinding(projectId: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(STORE_NAME, getLocalFolderBindingKey(projectId));
}

export async function loadCloudProjectBinding(
  providerId: CloudStorageProviderId,
  projectId: string
): Promise<CloudProjectBindingRecord | null> {
  const database = await getDatabase();
  return (
    (await database.get(
      STORE_NAME,
      getCloudProjectBindingKey(providerId, projectId)
    )) ?? null
  );
}

export async function saveCloudProjectBinding(
  binding: CloudProjectBindingRecord
): Promise<void> {
  const database = await getDatabase();
  await database.put(
    STORE_NAME,
    binding,
    getCloudProjectBindingKey(binding.providerId, binding.projectId)
  );
}

export async function deleteCloudProjectBinding(
  providerId: CloudStorageProviderId,
  projectId: string
): Promise<void> {
  const database = await getDatabase();
  await database.delete(
    STORE_NAME,
    getCloudProjectBindingKey(providerId, projectId)
  );
}

export async function deleteCloudProjectBindings(
  projectId: string
): Promise<void> {
  const database = await getDatabase();
  const projectKeySuffix = `:${encodeURIComponent(projectId)}`;
  const keys = (await database.getAllKeys(STORE_NAME)).filter(
    (key): key is string =>
      typeof key === "string" &&
      key.startsWith(CLOUD_PROJECT_BINDING_PREFIX) &&
      key.endsWith(projectKeySuffix)
  );
  await Promise.all(
    keys.map((key) => database.delete(STORE_NAME, key))
  );
}

export async function saveProjectDeletionTombstone(
  projectId: string
): Promise<ProjectDeletionTombstone> {
  const database = await getDatabase();
  const tombstone = {
    projectId,
    createdAt: new Date().toISOString()
  };
  await database.put(
    STORE_NAME,
    tombstone,
    getProjectDeletionTombstoneKey(projectId)
  );
  return tombstone;
}

export async function loadProjectDeletionTombstones(): Promise<ProjectDeletionTombstone[]> {
  const database = await getDatabase();
  const keys = (await database.getAllKeys(STORE_NAME))
    .filter((key): key is string =>
      typeof key === "string" && key.startsWith(PROJECT_DELETION_TOMBSTONE_PREFIX)
    )
    .sort((left, right) => left.localeCompare(right));
  const storedTombstones = await Promise.all(
    keys.map((key) => database.get(STORE_NAME, key))
  );

  return storedTombstones.filter(isProjectDeletionTombstone);
}

export async function deleteProjectDeletionTombstone(projectId: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(STORE_NAME, getProjectDeletionTombstoneKey(projectId));
}

export async function loadGitHubConfig(): Promise<LegacyGitHubRemoteConfig | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, GITHUB_CONFIG_KEY)) ?? null;
}

export async function saveGitHubConfig(config: LegacyGitHubRemoteConfig): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, config, GITHUB_CONFIG_KEY);
}

export async function loadGitWorkspace(): Promise<GitWorkspaceState | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, GIT_WORKSPACE_KEY)) ?? null;
}

export async function saveGitWorkspace(workspace: GitWorkspaceState): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, workspace, GIT_WORKSPACE_KEY);
}

export async function loadGitCredentials(): Promise<Record<string, string> | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, GIT_CREDENTIALS_KEY)) ?? null;
}

export async function saveGitCredentials(credentials: Record<string, string>): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, credentials, GIT_CREDENTIALS_KEY);
}

export async function readProjectGitFile(
  projectId: string,
  path: string
): Promise<Uint8Array | null> {
  const database = await getDatabase();
  return (await database.get(GIT_FILE_STORE_NAME, getProjectGitFileKey(projectId, path))) ?? null;
}

export async function writeProjectGitFile(
  projectId: string,
  path: string,
  content: Uint8Array
): Promise<void> {
  const database = await getDatabase();
  await database.put(GIT_FILE_STORE_NAME, content, getProjectGitFileKey(projectId, path));
}

export async function deleteProjectGitFile(projectId: string, path: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(GIT_FILE_STORE_NAME, getProjectGitFileKey(projectId, path));
}

export async function deleteProjectGitFiles(projectId: string): Promise<void> {
  const database = await getDatabase();
  const projectPrefix = getProjectGitFileKey(projectId, "");
  const keys = await database.getAllKeys(GIT_FILE_STORE_NAME);
  const projectKeys = keys.filter((key): key is string =>
    typeof key === "string" && key.startsWith(projectPrefix)
  );

  await Promise.all(projectKeys.map((key) => database.delete(GIT_FILE_STORE_NAME, key)));
}

export async function listProjectGitFiles(projectId: string, prefix = ""): Promise<string[]> {
  const database = await getDatabase();
  const keyPrefix = getProjectGitFileKey(projectId, prefix);
  const projectPrefix = getProjectGitFileKey(projectId, "");
  const keys = await database.getAllKeys(GIT_FILE_STORE_NAME);

  return keys
    .filter((key): key is string => typeof key === "string")
    .filter((key) => key.startsWith(keyPrefix))
    .map((key) => key.slice(projectPrefix.length))
    .sort((left, right) => left.localeCompare(right));
}

function getProjectGitFileKey(projectId: string, path: string): string {
  return `${projectId}/${normalizeGitFilePath(path)}`;
}

function normalizeGitFilePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function getProjectDeletionTombstoneKey(projectId: string): string {
  return `${PROJECT_DELETION_TOMBSTONE_PREFIX}${encodeURIComponent(projectId)}`;
}

function getLocalFolderBindingKey(projectId: string): string {
  return `${LOCAL_FOLDER_BINDING_PREFIX}${encodeURIComponent(projectId)}`;
}

function getCloudProjectBindingKey(
  providerId: CloudStorageProviderId,
  projectId: string
): string {
  return `${CLOUD_PROJECT_BINDING_PREFIX}${encodeURIComponent(
    providerId
  )}:${encodeURIComponent(projectId)}`;
}

function isProjectDeletionTombstone(value: unknown): value is ProjectDeletionTombstone {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tombstone = value as Partial<ProjectDeletionTombstone>;
  return (
    typeof tombstone.projectId === "string" &&
    tombstone.projectId.trim().length > 0 &&
    typeof tombstone.createdAt === "string"
  );
}

export async function loadCustomThemes(): Promise<ThemeDefinition[] | null> {
  const database = await getDatabase();
  return (await database.get(STORE_NAME, CUSTOM_THEMES_KEY)) ?? null;
}

export async function saveCustomThemes(themes: ThemeDefinition[]): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, themes, CUSTOM_THEMES_KEY);
}

export async function loadCustomSnippets(): Promise<SnippetCollections | null> {
  const database = await getDatabase();
  const storedSnippets = await database.get(STORE_NAME, CUSTOM_SNIPPETS_KEY);
  return storedSnippets === undefined ? null : normalizeSnippetCollections(storedSnippets);
}

export async function saveCustomSnippets(snippets: SnippetCollections): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, snippets, CUSTOM_SNIPPETS_KEY);
}
