export function isFirefoxBrowser(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): boolean {
  return /(?:Firefox|FxiOS)\//.test(userAgent);
}

export function isMobileBrowser(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
}

export function shouldUseLowMemoryCompilerMode(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
): boolean {
  return isFirefoxBrowser(userAgent) || isMobileBrowser(userAgent);
}
