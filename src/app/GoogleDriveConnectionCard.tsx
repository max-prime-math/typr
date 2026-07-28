import {
  createGoogleDriveProjectState,
  type GoogleDriveProjectState
} from "../cloud/googleDriveConnectionState";
import type { CloudSyncMode } from "../cloud/cloudSync";
import type { GoogleDriveNotice } from "./useGoogleDriveSync";

interface GoogleDriveSyncController {
  changeLocation(projectId: string): Promise<void>;
  chooseLocation(projectId: string): Promise<void>;
  configured: boolean;
  configurationMessage: string;
  connect(projectId: string): Promise<void>;
  disconnect(projectId: string): Promise<void>;
  setSyncPolicy(
    projectId: string,
    policy: { intervalMinutes?: number; mode: CloudSyncMode }
  ): Promise<void>;
  syncNow(projectId: string): Promise<void>;
}

export function GoogleDriveConnectionCard(props: {
  className?: string;
  controller: GoogleDriveSyncController;
  projectId: string;
  projectName: string;
  state?: GoogleDriveProjectState;
}) {
  const { controller, projectId, projectName } = props;
  const state =
    props.state ??
    createGoogleDriveProjectState(controller.configured);
  const connected = Boolean(
    state.selectedParentName &&
      state.projectFolderName &&
      state.projectFolderWebViewLink &&
      !state.migrationRequired
  );
  const busy =
    state.status === "authorizing" ||
    state.status === "choosing-location" ||
    state.status === "creating-project-folder" ||
    state.status === "syncing";
  const needsPicker = state.status === "authorization-returned";
  const reconnect =
    connected && state.status === "authorization-needed";
  const failed = state.status === "error";

  return (
    <section
      className={`google-drive-card ${props.className ?? ""}`.trim()}
      data-google-drive-status={state.status}
    >
      <div className="google-drive-card__header">
        <div>
          <strong>Google Drive</strong>
          <small>{projectName}</small>
        </div>
        <span
          className={`project-manager__connection-badge ${
            connected
              ? "project-manager__connection-badge--connected"
              : failed || state.migrationRequired
                ? "project-manager__connection-badge--error"
                : ""
          }`}
        >
          {getGoogleDriveStatusLabel(state, connected)}
        </span>
      </div>

      {connected ? (
        <dl className="google-drive-card__details">
          <div>
            <dt>Selected destination</dt>
            <dd>{state.selectedParentName}</dd>
          </div>
          <div>
            <dt>Managed project folder</dt>
            <dd>{state.projectFolderName}</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>{formatLastSync(state.lastSyncedAt)}</dd>
          </div>
          <div>
            <dt>Sync mode</dt>
            <dd>
              {formatSyncMode(
                state.syncMode,
                state.syncIntervalMinutes
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="google-drive-card__guide">
          {state.migrationRequired
            ? state.message
            : controller.configured
              ? "Typr will authorize Google with drive.file, ask you to choose a parent destination, then create a managed project folder inside it."
              : controller.configurationMessage}
        </p>
      )}

      {!state.migrationRequired &&
      (failed ||
        state.status === "authorization-needed" ||
        state.status === "authorization-returned" ||
        busy) ? (
        <p
          className={`sync-connection-notice ${
            failed
              ? "sync-connection-notice--error"
              : "sync-connection-notice--info"
          }`}
          role={failed ? "alert" : "status"}
        >
          <strong>
            {failed
              ? "Google Drive connection failed"
              : getGoogleDriveStatusLabel(state, connected)}
          </strong>
          <span>{state.message}</span>
        </p>
      ) : connected ? (
        <p className="google-drive-card__status">{state.message}</p>
      ) : null}

      <div className="google-drive-card__actions">
        {needsPicker ? (
          <button
            className="pane__button"
            onClick={() => {
              void controller.chooseLocation(projectId);
            }}
            type="button"
          >
            Choose Drive location
          </button>
        ) : connected ? (
          <>
            <a
              className="pane__button"
              href={state.projectFolderWebViewLink ?? undefined}
              rel="noreferrer"
              target="_blank"
            >
              Open in Google Drive
            </a>
            <button
              className="pane__button"
              disabled={busy}
              onClick={() => {
                void controller.changeLocation(projectId);
              }}
              type="button"
            >
              Change location
            </button>
            <button
              className="pane__button"
              disabled={busy}
              onClick={() => {
                void controller.syncNow(projectId);
              }}
              type="button"
            >
              {state.status === "syncing"
                ? "Syncing…"
                : reconnect
                  ? "Reconnect"
                  : "Sync now"}
            </button>
            <button
              className="pane__button"
              disabled={busy}
              onClick={() => {
                void controller.disconnect(projectId);
              }}
              type="button"
            >
              Unlink
            </button>
          </>
        ) : (
          <>
            <button
              className="pane__button"
              disabled={!controller.configured || busy}
              onClick={() => {
                void controller.connect(projectId);
              }}
              type="button"
            >
              {state.status === "authorizing"
                ? "Authorizing…"
                : state.migrationRequired
                  ? "Reconnect and choose location"
                  : "Connect Google Drive"}
            </button>
            {state.migrationRequired ? (
              <button
                className="pane__button"
                disabled={busy}
                onClick={() => {
                  void controller.disconnect(projectId);
                }}
                type="button"
              >
                Unlink
              </button>
            ) : null}
          </>
        )}
      </div>

      {connected ? (
        <small className="google-drive-card__safety">
          Unlinking or changing location leaves the current Drive folder and
          its contents unchanged.
        </small>
      ) : null}
    </section>
  );
}

export function GoogleDriveGlobalNotice(props: {
  dismiss(): void;
  notice: GoogleDriveNotice;
}) {
  return (
    <div
      className={`google-drive-global-notice google-drive-global-notice--${props.notice.tone}`}
      role={props.notice.tone === "error" ? "alert" : "status"}
    >
      <div>
        <strong>{props.notice.title}</strong>
        <span>{props.notice.message}</span>
      </div>
      <button
        aria-label="Dismiss Google Drive message"
        onClick={props.dismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function getGoogleDriveStatusLabel(
  state: GoogleDriveProjectState,
  connected: boolean
): string {
  switch (state.status) {
    case "authorizing":
      return "Authorizing…";
    case "authorization-returned":
      return "Choose location";
    case "choosing-location":
      return "Choosing location…";
    case "creating-project-folder":
      return "Preparing folder…";
    case "syncing":
      return "Syncing…";
    case "synced":
      return "Connected";
    case "authorization-needed":
      return state.migrationRequired
        ? "Location required"
        : connected
          ? "Reconnect"
          : "Authorization needed";
    case "error":
      return "Connection failed";
    case "unconfigured":
      return "Unavailable";
    case "disconnected":
      return "Not connected";
  }
}

function formatLastSync(value: string | null): string {
  if (!value) {
    return "Not yet synced";
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(timestamp)
    : "Unknown";
}

function formatSyncMode(
  mode: CloudSyncMode,
  intervalMinutes: number
): string {
  switch (mode) {
    case "manual":
      return "Manual";
    case "compile":
      return "On compile";
    case "constant":
      return "Constant";
    case "interval":
      return `Every ${intervalMinutes} ${
        intervalMinutes === 1 ? "minute" : "minutes"
      }`;
  }
}
