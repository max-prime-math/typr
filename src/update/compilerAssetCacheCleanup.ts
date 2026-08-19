const COMPILER_CACHE_SUFFIXES = ["-compiler-assets", "-busytex-assets"];

export function findObsoleteCompilerAssetCaches(
  cacheNames: string[],
  deploymentChannel: string,
  releaseId: string
): string[] {
  const prefix = `typr-${deploymentChannel}-`;
  const current = new Set(COMPILER_CACHE_SUFFIXES.map((suffix) => `${prefix}${releaseId}${suffix}`));
  return cacheNames.filter((cacheName) =>
    cacheName.startsWith(prefix) &&
    COMPILER_CACHE_SUFFIXES.some((suffix) => cacheName.endsWith(suffix)) &&
    !current.has(cacheName)
  );
}

export async function cleanupObsoleteCompilerAssetCaches(
  cacheStorage: Pick<CacheStorage, "delete" | "keys">,
  deploymentChannel: string,
  releaseId: string
): Promise<string[]> {
  const obsolete = findObsoleteCompilerAssetCaches(
    await cacheStorage.keys(),
    deploymentChannel,
    releaseId
  );
  await Promise.all(obsolete.map((cacheName) => cacheStorage.delete(cacheName)));
  return obsolete;
}
