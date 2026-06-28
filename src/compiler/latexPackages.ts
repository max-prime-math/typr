import { listProjectFiles, type TyprProjectRepository } from "../project/projectState";
import { getSourceLanguage, normalizeCompilerPath } from "./sourceFileTypes";

export type LatexPackageBundleId = "texlive-basic" | "texlive-recommended" | "texlive-extra";

export interface LatexPackageBundleDefinition {
  id: LatexPackageBundleId;
  label: string;
  description: string;
  defaultLoaded: boolean;
}

export interface LatexPackageBundleCacheEntry extends LatexPackageBundleDefinition {
  cached: boolean;
  packageCount: number;
  sizeBytes: number;
}

export interface LatexPackageCatalog {
  packages: Map<string, LatexPackageBundleId>;
  bundlePackageCounts: Record<LatexPackageBundleId, number>;
}

export interface LatexPackageResolution {
  name: string;
  bundleId: LatexPackageBundleId | null;
}

const BUSYTEX_CACHE_NAME = "typr-busytex-assets";

export const LATEX_PACKAGE_BUNDLES: LatexPackageBundleDefinition[] = [
  {
    id: "texlive-basic",
    label: "Basic",
    description: "Core LaTeX packages loaded by default.",
    defaultLoaded: true
  },
  {
    id: "texlive-recommended",
    label: "Recommended",
    description: "Common document, math, graphics, and bibliography packages.",
    defaultLoaded: false
  },
  {
    id: "texlive-extra",
    label: "Extra",
    description: "Large TeX Live package bundle for specialized documents.",
    defaultLoaded: false
  }
];

const BUNDLE_ORDER = LATEX_PACKAGE_BUNDLES.map((bundle) => bundle.id);
const packageCatalogPromise: { current: Promise<LatexPackageCatalog> | null } = { current: null };

export async function getLatexPackageCatalog(): Promise<LatexPackageCatalog> {
  packageCatalogPromise.current ??= loadLatexPackageCatalog();
  return packageCatalogPromise.current;
}

export async function getLatexPackageBundleCacheSummary(): Promise<LatexPackageBundleCacheEntry[]> {
  const catalog = await getLatexPackageCatalog();

  return Promise.all(
    LATEX_PACKAGE_BUNDLES.map(async (bundle) => ({
      ...bundle,
      cached: bundle.defaultLoaded || (await isLatexPackageBundleCached(bundle.id)),
      packageCount: catalog.bundlePackageCounts[bundle.id],
      sizeBytes: await getLatexPackageBundleSize(bundle.id)
    }))
  );
}

export async function cacheLatexPackageBundle(bundleId: LatexPackageBundleId): Promise<void> {
  const cache = await openBusyTexCache();

  for (const url of getLatexPackageBundleAssetUrls(bundleId)) {
    const response = await fetch(url, { cache: "reload" });

    if (!response.ok) {
      throw new Error(`Unable to cache ${url}: ${response.status} ${response.statusText}`);
    }

    await cache.put(url, response);
  }
}

export async function removeLatexPackageBundleFromCache(bundleId: LatexPackageBundleId): Promise<void> {
  const cache = await openBusyTexCache();
  await Promise.all(getLatexPackageBundleAssetUrls(bundleId).map((url) => cache.delete(url)));
}

export async function clearLatexPackageBundleCache(): Promise<void> {
  const cache = await openBusyTexCache();
  await Promise.all(
    LATEX_PACKAGE_BUNDLES
      .filter((bundle) => !bundle.defaultLoaded)
      .flatMap((bundle) => getLatexPackageBundleAssetUrls(bundle.id))
      .map((url) => cache.delete(url))
  );
}

export function extractLatexPackageNamesFromProject(project: TyprProjectRepository): string[] {
  const packageNames = new Set<string>();

  for (const file of listProjectFiles(project)) {
    if (getSourceLanguage(file.path) !== "latex" || typeof file.content !== "string") {
      continue;
    }

    for (const packageName of extractLatexPackageNames(file.content)) {
      packageNames.add(packageName);
    }
  }

  return [...packageNames].sort((left, right) => left.localeCompare(right));
}

export function extractLatexPackageNames(source: string): string[] {
  const packageNames = new Set<string>();
  const text = stripLatexComments(source);
  const packagePattern = /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = packagePattern.exec(text))) {
    for (const rawName of (match[1] ?? "").split(",")) {
      const packageName = normalizeLatexPackageName(rawName);

      if (packageName) {
        packageNames.add(packageName);
      }
    }
  }

  return [...packageNames].sort((left, right) => left.localeCompare(right));
}

export function resolveLatexPackages(
  packageNames: string[],
  catalog: LatexPackageCatalog
): LatexPackageResolution[] {
  return packageNames.map((name) => ({
    name,
    bundleId: catalog.packages.get(name.toLowerCase()) ?? null
  }));
}

export function searchLatexPackageCatalog(
  catalog: LatexPackageCatalog,
  query: string,
  limit = 12
): LatexPackageResolution[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return [...catalog.packages.entries()]
    .filter(([name]) => name.includes(normalizedQuery))
    .slice(0, limit)
    .map(([name, bundleId]) => ({ name, bundleId }));
}

export function formatLatexPackageBundleLabel(bundleId: LatexPackageBundleId): string {
  return LATEX_PACKAGE_BUNDLES.find((bundle) => bundle.id === bundleId)?.label ?? bundleId;
}

export function getBusyTexBasePath(): string {
  const normalizedPath = "core/busytex";

  if (import.meta.env.DEV) {
    return `/${normalizedPath}`;
  }

  const bundleBase = import.meta.url.slice(0, import.meta.url.lastIndexOf("/") + 1);
  return `${bundleBase}../${normalizedPath}`;
}

async function loadLatexPackageCatalog(): Promise<LatexPackageCatalog> {
  const packages = new Map<string, LatexPackageBundleId>();
  const bundlePackageCounts = {
    "texlive-basic": 0,
    "texlive-recommended": 0,
    "texlive-extra": 0
  } satisfies Record<LatexPackageBundleId, number>;

  for (const bundleId of BUNDLE_ORDER) {
    const packageNames = await loadLatexPackageNamesForBundle(bundleId);
    bundlePackageCounts[bundleId] = packageNames.length;

    for (const packageName of packageNames) {
      packages.set(packageName, packages.get(packageName) ?? bundleId);
    }
  }

  return {
    packages,
    bundlePackageCounts
  };
}

async function loadLatexPackageNamesForBundle(bundleId: LatexPackageBundleId): Promise<string[]> {
  const response = await fetch(`${getBusyTexBasePath()}/${bundleId}.js.providespackage.txt`);

  if (!response.ok) {
    throw new Error(`Unable to load LaTeX package index for ${bundleId}.`);
  }

  const packageNames = new Set<string>();
  const text = await response.text();
  const providesPattern = /\\ProvidesPackage\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = providesPattern.exec(text))) {
    const packageName = normalizeLatexPackageName(match[1] ?? "");

    if (packageName) {
      packageNames.add(packageName.toLowerCase());
    }
  }

  return [...packageNames].sort((left, right) => left.localeCompare(right));
}

async function isLatexPackageBundleCached(bundleId: LatexPackageBundleId): Promise<boolean> {
  if (typeof caches === "undefined") {
    return false;
  }

  const cache = await openBusyTexCache();
  const matches = await Promise.all(
    getLatexPackageBundleAssetUrls(bundleId).map((url) => cache.match(url))
  );
  return matches.every(Boolean);
}

async function getLatexPackageBundleSize(bundleId: LatexPackageBundleId): Promise<number> {
  const sizes = await Promise.all(
    getLatexPackageBundleAssetUrls(bundleId).map(async (url) => {
      try {
        const response = await fetch(url, { method: "HEAD", cache: "no-store" });
        const contentLength = response.headers.get("content-length");
        return contentLength ? Number(contentLength) : 0;
      } catch {
        return 0;
      }
    })
  );

  return sizes.reduce((total, size) => total + (Number.isFinite(size) ? size : 0), 0);
}

async function openBusyTexCache(): Promise<Cache> {
  if (typeof caches === "undefined") {
    throw new Error("Browser cache storage is unavailable.");
  }

  return caches.open(BUSYTEX_CACHE_NAME);
}

function getLatexPackageBundleAssetUrls(bundleId: LatexPackageBundleId): string[] {
  const basePath = getBusyTexBasePath();
  return [
    `${basePath}/${bundleId}.js`,
    `${basePath}/${bundleId}.data`,
    `${basePath}/${bundleId}.js.providespackage.txt`
  ];
}

function stripLatexComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let escaped = false;

      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];

        if (character === "\\" && !escaped) {
          escaped = true;
          continue;
        }

        if (character === "%" && !escaped) {
          return line.slice(0, index);
        }

        escaped = false;
      }

      return line;
    })
    .join("\n");
}

function normalizeLatexPackageName(value: string): string | null {
  const packageName = normalizeCompilerPath(value).split("/").at(-1)?.replace(/\.sty$/i, "").trim();
  return packageName && /^[A-Za-z0-9_.-]+$/.test(packageName) ? packageName : null;
}
