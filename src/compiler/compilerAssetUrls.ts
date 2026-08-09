const BUSYTEX_ASSET_PATH = "core/busytex";

interface BusyTexBasePathOptions {
  externalAssetBaseUrl?: string;
  dev: boolean;
  moduleUrl: string;
}

export function resolveBusyTexBasePath({
  externalAssetBaseUrl,
  dev,
  moduleUrl
}: BusyTexBasePathOptions): string {
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
    externalAssetBaseUrl: import.meta.env.VITE_TYPR_COMPILER_ASSET_BASE_URL,
    dev: import.meta.env.DEV,
    moduleUrl: import.meta.url
  });
}
