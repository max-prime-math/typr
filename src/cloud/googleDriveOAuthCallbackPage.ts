import { captureGoogleDriveOAuthCallback } from "./googleDriveIdentity";

const status = document.getElementById("google-drive-callback-status");
const callbackWindow = window as Window & {
  __TYPR_GOOGLE_DRIVE_OAUTH_HASH__?: string;
};

try {
  const { result, returnUri } = captureGoogleDriveOAuthCallback({
    hash: callbackWindow.__TYPR_GOOGLE_DRIVE_OAUTH_HASH__ ?? ""
  });
  delete callbackWindow.__TYPR_GOOGLE_DRIVE_OAUTH_HASH__;
  if (status) {
    status.textContent = result.error
      ? "Google authorization returned an error. Returning to Typr…"
      : "Google authorization succeeded. Returning to Typr…";
  }
  const destination = new URL(returnUri);
  destination.searchParams.set("google-drive-return", "1");
  window.location.replace(destination.href);
} catch {
  delete callbackWindow.__TYPR_GOOGLE_DRIVE_OAUTH_HASH__;
  if (status) {
    status.textContent =
      "Typr could not process the Google authorization response. Return to Typr and try again.";
  }
}
