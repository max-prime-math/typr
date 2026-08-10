const BUSYTEX_ASSET_PATH = "core/busytex";

interface BusyTexBasePathOptions {
  externalAssetBaseUrl?: string;
  selfHostedAssetBaseUrl?: string;
  dev: boolean;
  moduleUrl: string;
}

export function resolveBusyTexBasePath({
  externalAssetBaseUrl,
  selfHostedAssetBaseUrl,
  dev,
  moduleUrl
}: BusyTexBasePathOptions): string {
  if (selfHostedAssetBaseUrl) {
    return `${selfHostedAssetBaseUrl.replace(/\/+$/, "")}/${BUSYTEX_ASSET_PATH}`;
  }
  const externalBaseUrl = externalAssetBaseUrl?.trim().replace(/\/+$/, "");

  if (externalBaseUrl) {
    return `${externalBaseUrl}/${BUSYTEX_ASSET_PATH}`;
  }

  if (dev) {
    return `/${BUSYTEX_ASSET_PATH}`;
  }

  return new URL(`../${BUSYTEX_ASSET_PATH}`, moduleUrl).toString();
}

export function getBusyTexBasePath(): string {
  return resolveBusyTexBasePath({
    selfHostedAssetBaseUrl: __TYPR_SELF_HOSTED__
      ? `/compiler-assets/${__TYPR_COMPILER_ASSET_RELEASE_ID__}`
      : undefined,
    externalAssetBaseUrl: import.meta.env.VITE_TYPR_COMPILER_ASSET_BASE_URL,
    dev: import.meta.env.DEV,
    moduleUrl: import.meta.url
  });
}
