export interface TypstUniversePackageEntry {
  namespace: "preview";
  name: string;
  description: string;
  version: string;
  keywords: string[];
}

interface TypstPackageIndexEntry {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
}

const PACKAGE_INDEX_URL = "https://packages.typst.org/preview/index.json";

let packageIndexPromise: Promise<TypstUniversePackageEntry[]> | null = null;
let latestVersionByPackage = new Map<string, string>();

export async function searchTypstUniversePackages(
  query: string
): Promise<TypstUniversePackageEntry[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const packages = await getTypstPackageIndex();

  return packages
    .map((entry) => ({
      entry,
      score: scorePackageMatch(entry, normalizedQuery)
    }))
    .filter((candidate) => candidate.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.entry.name.localeCompare(right.entry.name);
    })
    .map((candidate) => candidate.entry);
}

export async function getLatestTypstUniversePackageVersion(name: string): Promise<string> {
  await getTypstPackageIndex();
  const version = latestVersionByPackage.get(name);

  if (!version) {
    throw new Error(`No published versions found for @preview/${name}.`);
  }

  return version;
}

async function getTypstPackageIndex(): Promise<TypstUniversePackageEntry[]> {
  if (!packageIndexPromise) {
    packageIndexPromise = fetch(PACKAGE_INDEX_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Package index request failed: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as TypstPackageIndexEntry[];
      })
      .then((entries) => {
        const latestByName = new Map<string, TypstUniversePackageEntry>();
        latestVersionByPackage = new Map<string, string>();

        for (const entry of entries) {
          const existing = latestByName.get(entry.name);

          if (!existing || compareVersionsDescending(entry.version, existing.version) < 0) {
            const nextEntry = {
              namespace: "preview" as const,
              name: entry.name,
              description: entry.description ?? "",
              version: entry.version,
              keywords: entry.keywords ?? []
            };

            latestByName.set(entry.name, nextEntry);
            latestVersionByPackage.set(entry.name, entry.version);
          }
        }

        return [...latestByName.values()].sort((left, right) => left.name.localeCompare(right.name));
      });
  }

  return packageIndexPromise;
}

function compareVersionsDescending(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return right.localeCompare(left);
}

function scorePackageMatch(entry: TypstUniversePackageEntry, query: string): number {
  const name = entry.name.toLowerCase();
  const description = entry.description.toLowerCase();
  const keywordMatches = entry.keywords.filter((keyword) => keyword.toLowerCase().includes(query));

  if (name === query) {
    return 1000;
  }

  if (name.startsWith(query)) {
    return 900 - name.length;
  }

  if (name.includes(`-${query}`) || name.includes(`${query}-`)) {
    return 820 - name.length;
  }

  if (name.includes(query)) {
    return 700 - name.indexOf(query) - name.length / 100;
  }

  if (keywordMatches.length > 0) {
    return 500 + keywordMatches.length;
  }

  if (description.includes(query)) {
    return 300 - description.indexOf(query) / 1000;
  }

  return Number.NEGATIVE_INFINITY;
}
