import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TYPR_BUILD_INFO } from "./buildInfo";
import {
  getChannelDestination,
  getTyprChannelOption,
  isInstalledPwa,
  isTyprChannelOrigin,
  TYPR_CHANNELS,
  type TyprChannel
} from "./channelSwitch";
import { transferWorkspaceToChannel } from "./channelTransfer";
import {
  updateManager,
  useUpdateManagerState,
  type UpdateManagerState
} from "./updateManager";

const TYPR_LINKS = [
  {
    label: "GitHub repository",
    href: "https://github.com/max-prime-math/typr"
  },
  {
    label: "Issue tracker",
    href: "https://github.com/max-prime-math/typr/issues"
  }
] as const;

function getServiceWorkerLabel(state: UpdateManagerState): string {
  if (state.phase === "disabled") {
    return "Development build";
  }
  if (state.serviceWorkerStatus === "unavailable") {
    return "Unavailable";
  }
  if (state.phase === "registering") {
    return "Registering";
  }
  if (state.phase === "checking") {
    return "Checking for updates";
  }
  if (state.phase === "ready") {
    return "Update ready";
  }
  if (state.phase === "activating") {
    return "Installing update";
  }
  if (state.serviceWorkerStatus === "installed") {
    return "Installed";
  }
  return "Active · up to date";
}

export function ApplicationInfoButton({
  mobile = false,
  active = false,
  onOpen,
  onBeforeChannelSwitch
}: {
  mobile?: boolean;
  active?: boolean;
  onOpen?: () => void;
  onBeforeChannelSwitch?: () => Promise<void>;
}) {
  const state = useUpdateManagerState();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const updateReady = state.phase === "ready";

  return (
    <div
      className={`application-info ${mobile ? "application-info--mobile" : ""}`}
      ref={containerRef}
    >
      <button
        aria-expanded={mobile ? active : isOpen}
        aria-haspopup={mobile ? undefined : "dialog"}
        aria-label="Application info"
        className={`activity-bar__button application-info__trigger ${mobile && active ? "activity-bar__button--active" : ""}`}
        onClick={() => {
          if (mobile && onOpen) {
            onOpen();
            return;
          }
          setIsOpen((open) => !open);
        }}
        title="Application info"
        type="button"
      >
        <span aria-hidden="true" className="activity-icon activity-icon--info" />
        {state.attentionRequired ? (
          <span
            aria-hidden="true"
            className="application-info__update-badge"
            data-testid="application-update-badge"
          />
        ) : null}
        <span className="visually-hidden">Application info</span>
      </button>

      {isOpen ? (mobile ? (
        <section
          aria-label="Typr application information"
          className="application-info__popover"
          ref={popoverRef}
          role="dialog"
        >
          <header className="application-info__header">
            <div>
              <h2>About {TYPR_BUILD_INFO.name}</h2>
            </div>
            <button
              aria-label="Close application info"
              className="application-info__close"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Close
            </button>
          </header>

          <section className="application-info__section" aria-labelledby="application-build-heading">
            <h3 id="application-build-heading">Build details</h3>
            <dl className="application-info__details">
              <div>
                <dt>Version</dt>
                <dd>{TYPR_BUILD_INFO.version}</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>{TYPR_BUILD_INFO.buildSha}</dd>
              </div>
              <div>
                <dt>Channel</dt>
                <dd>
                  <ChannelSelector onBeforeSwitch={onBeforeChannelSwitch} />
                </dd>
              </div>
              <div>
                <dt>Service worker</dt>
                <dd>{getServiceWorkerLabel(state)}</dd>
              </div>
            </dl>
          </section>

          <section className="application-info__section" aria-labelledby="application-links-heading">
            <h3 id="application-links-heading">Links</h3>
            <nav className="application-info__links" aria-label="Typr links">
              {TYPR_LINKS.map((link) => (
                <a href={link.href} key={link.href} rel="noreferrer" target="_blank">
                  {link.label}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          </section>

          <section className="application-info__section" aria-labelledby="application-updates-heading">
            <h3 id="application-updates-heading">Updates</h3>

            {state.phase === "checking" ? (
              <div className="application-info__checking" role="status">
                <span aria-hidden="true" className="application-info__spinner" />
                <span>Checking...</span>
              </div>
            ) : updateReady ? (
              <div className="application-info__update">
                <p>
                  <strong>
                    {state.release?.version
                      ? `Typr ${state.release.version} is ready.`
                      : "A Typr update is ready."}
                  </strong>
                </p>
                {state.release?.notes.length ? (
                  <ul>
                    {state.release.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
                {state.release?.breaking || state.release?.backupRecommended ? (
                  <div className="application-info__warning">
                    <span
                      aria-hidden="true"
                      className="application-info__warning-icon"
                    />
                    <p>
                      {state.release.breaking
                        ? "This update contains changes that may affect existing projects."
                        : ""}
                      {state.release.backupRecommended
                        ? " Please make a backup of your projects before updating."
                        : ""}
                    </p>
                  </div>
                ) : null}
                <div className="application-info__actions">
                  <button
                    className="pane__button pane__button--compact"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    Later
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__button--success"
                    onClick={() => {
                      void updateManager.activateUpdate(true);
                    }}
                    type="button"
                  >
                    Update
                  </button>
                </div>
              </div>
            ) : state.phase === "activating" ? (
              <div className="application-info__checking" role="status">
                <span aria-hidden="true" className="application-info__spinner" />
                <span>Installing update...</span>
              </div>
            ) : state.phase === "disabled" ? (
              <p className="application-info__muted">Update checks run in installed production builds.</p>
            ) : (
              <div className="application-info__current">
                <p>Typr is up to date.</p>
                <button
                  className="pane__button pane__button--compact"
                  disabled={state.serviceWorkerStatus === "unavailable"}
                  onClick={() => {
                    void updateManager.checkForUpdates(true);
                  }}
                  type="button"
                >
                  Check for updates
                </button>
              </div>
            )}
          </section>
        </section>
      ) : createPortal(
        <>
          <div aria-hidden="true" className="application-info__backdrop" />
          <section
            aria-label="Typr application information"
            className="application-info__popover"
            ref={popoverRef}
            role="dialog"
          >
            <header className="application-info__header">
              <div>
                <h2>About {TYPR_BUILD_INFO.name}</h2>
              </div>
              <button
                aria-label="Close application info"
                className="application-info__close"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Close
              </button>
            </header>

            <ApplicationInfoContents
              state={state}
              updateReady={updateReady}
              onBeforeChannelSwitch={onBeforeChannelSwitch}
              onClose={() => setIsOpen(false)}
            />
          </section>
        </>,
        document.body
      )) : null}
    </div>
  );
}

export function ApplicationInfoPanel({
  onClose,
  onBeforeChannelSwitch
}: {
  onClose: () => void;
  onBeforeChannelSwitch?: () => Promise<void>;
}) {
  const state = useUpdateManagerState();
  return <div className="application-info__panel">
    <ApplicationInfoContents
      state={state}
      updateReady={state.phase === "ready"}
      onBeforeChannelSwitch={onBeforeChannelSwitch}
      onClose={onClose}
    />
  </div>;
}

function ApplicationInfoContents({
  state,
  updateReady,
  onClose,
  onBeforeChannelSwitch
}: {
  state: UpdateManagerState;
  updateReady: boolean;
  onClose: () => void;
  onBeforeChannelSwitch?: () => Promise<void>;
}) {
  return <>
    <section className="application-info__section" aria-labelledby="application-build-heading">
      <h3 id="application-build-heading">Build details</h3>
      <dl className="application-info__details">
        <div><dt>Version</dt><dd>{TYPR_BUILD_INFO.version}</dd></div>
        <div><dt>Build</dt><dd>{TYPR_BUILD_INFO.buildSha}</dd></div>
        <div><dt>Channel</dt><dd><ChannelSelector onBeforeSwitch={onBeforeChannelSwitch} /></dd></div>
        <div><dt>Service worker</dt><dd>{getServiceWorkerLabel(state)}</dd></div>
      </dl>
    </section>
    <section className="application-info__section" aria-labelledby="application-links-heading">
      <h3 id="application-links-heading">Links</h3>
      <nav className="application-info__links" aria-label="Typr links">
        {TYPR_LINKS.map((link) => <a href={link.href} key={link.href} rel="noreferrer" target="_blank">{link.label}<span aria-hidden="true">↗</span></a>)}
      </nav>
    </section>
    <section className="application-info__section" aria-labelledby="application-updates-heading">
      <h3 id="application-updates-heading">Updates</h3>
      {state.phase === "checking" ? <div className="application-info__checking" role="status"><span aria-hidden="true" className="application-info__spinner" /><span>Checking...</span></div>
        : updateReady ? <div className="application-info__update">
          <p><strong>{state.release?.version ? `Typr ${state.release.version} is ready.` : "A Typr update is ready."}</strong></p>
          {state.release?.notes.length ? <ul>{state.release.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
          {state.release?.breaking || state.release?.backupRecommended ? <div className="application-info__warning"><span aria-hidden="true" className="application-info__warning-icon" /><p>{state.release.breaking ? "This update contains changes that may affect existing projects." : ""}{state.release.backupRecommended ? " Please make a backup of your projects before updating." : ""}</p></div> : null}
          <div className="application-info__actions"><button className="pane__button pane__button--compact" onClick={onClose} type="button">Later</button><button className="pane__button pane__button--compact pane__button--success" onClick={() => { void updateManager.activateUpdate(true); }} type="button">Update</button></div>
        </div>
        : state.phase === "activating" ? <div className="application-info__checking" role="status"><span aria-hidden="true" className="application-info__spinner" /><span>Installing update...</span></div>
        : state.phase === "disabled" ? <p className="application-info__muted">Update checks run in installed production builds.</p>
        : <div className="application-info__current"><p>Typr is up to date.</p><button className="pane__button pane__button--compact" disabled={state.serviceWorkerStatus === "unavailable"} onClick={() => { void updateManager.checkForUpdates(true); }} type="button">Check for updates</button></div>}
    </section>
  </>;
}

function ChannelSelector({
  onBeforeSwitch
}: {
  onBeforeSwitch?: () => Promise<void>;
}) {
  const currentChannel = TYPR_BUILD_INFO.channel;
  const [switchingTo, setSwitchingTo] = useState<TyprChannel | null>(null);

  if (__TYPR_SELF_HOSTED__) {
    return getTyprChannelOption(currentChannel).shortLabel;
  }

  const handleChange = async (channel: TyprChannel) => {
    if (channel === currentChannel || switchingTo) {
      return;
    }

    setSwitchingTo(channel);
    const destination = getChannelDestination(channel);

    try {
      await onBeforeSwitch?.();

      if (isInstalledPwa() && isTyprChannelOrigin(window.location.origin)) {
        try {
          await transferWorkspaceToChannel(new URL(destination).origin);
        } catch (error) {
          console.warn(
            "Typr could not carry this workspace to the selected channel; switching without it.",
            error
          );
        }
      }

      window.location.assign(destination);
    } catch (error) {
      console.error("Typr could not save the workspace before switching channels.", error);
      setSwitchingTo(null);
    }
  };

  return (
    <span className="application-info__channel-control">
      <select
        aria-label="Release channel"
        className="application-info__channel-select"
        disabled={switchingTo !== null}
        onChange={(event) => {
          void handleChange(event.target.value as TyprChannel);
        }}
        title={
          isInstalledPwa()
            ? "Switch channel and carry this workspace when possible"
            : "Open this Typr channel"
        }
        value={switchingTo ?? currentChannel}
      >
        {TYPR_CHANNELS.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.shortLabel}
          </option>
        ))}
      </select>
      {switchingTo ? <span className="visually-hidden" role="status">Switching to {getTyprChannelOption(switchingTo).label}.</span> : null}
    </span>
  );
}
