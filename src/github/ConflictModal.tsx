import { useState } from "react";
import type { ConflictResolution, DocumentConflict } from "./conflict";

interface ConflictModalProps {
  conflicts: DocumentConflict[];
  addedRemotely: Array<{ name: string }>;
  onClose: () => void;
  onResolve: (resolutions: ConflictResolution[]) => void;
}

export function ConflictModal({
  conflicts,
  addedRemotely,
  onClose,
  onResolve
}: ConflictModalProps) {
  const [resolutions, setResolutions] = useState<Map<string, "local" | "remote" | "delete">>(
    () => new Map()
  );

  const getChoice = (id: string): "local" | "remote" | "delete" | undefined => {
    return resolutions.get(id);
  };

  const setChoice = (id: string, choice: "local" | "remote" | "delete") => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(id, choice);
      return next;
    });
  };

  const allResolved = conflicts.every((c) => resolutions.has(c.id));

  const handleApply = () => {
    const resolutionArray: ConflictResolution[] = [];
    for (const [docName, choice] of resolutions) {
      resolutionArray.push({ documentName: docName, choice });
    }
    onResolve(resolutionArray);
  };

  const handleResolveAllLocal = () => {
    const next = new Map(resolutions);
    for (const c of conflicts) {
      next.set(c.id, "local");
    }
    setResolutions(next);
  };

  const handleResolveAllRemote = () => {
    const next = new Map(resolutions);
    for (const c of conflicts) {
      next.set(c.id, "remote");
    }
    setResolutions(next);
  };

  function formatTime(iso: string): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  function contentPreview(content: string | Uint8Array, maxLength = 200): string {
    const text = typeof content === "string" ? content : `[binary data: ${content.byteLength} bytes]`;
    const trimmed = text.trim();
    if (trimmed.length === 0) return "(empty)";
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.slice(0, maxLength) + "…";
  }

  return (
    <div className="sheet-backdrop conflict-backdrop" onClick={onClose} role="presentation">
      <section
        className="conflict-modal"
        onClick={(event) => event.stopPropagation()}
        aria-label="Resolve sync conflicts"
      >
        <div className="conflict-modal__header">
          <div>
            <h2>Sync conflicts</h2>
            <p className="conflict-modal__copy">
              {conflicts.length} document{conflicts.length !== 1 ? "s" : ""} changed on both sides.
              {addedRemotely.length > 0 &&
                ` ${addedRemotely.length} new document${addedRemotely.length !== 1 ? "s" : ""} will be added.`}
            </p>
          </div>
          <button className="pane__button" onClick={onClose} type="button">
            Cancel
          </button>
        </div>

        <div className="conflict-modal__body">
          {conflicts.map((conflict) => {
            const choice = getChoice(conflict.id);
            return (
              <div key={conflict.id} className="conflict-item">
                <div className="conflict-item__header">
                  <span className="conflict-item__name">{conflict.name}</span>
                  {choice && (
                    <span
                      className={`conflict-badge conflict-badge--${choice === "local" ? "local" : choice === "remote" ? "remote" : "delete"}`}
                    >
                      {choice === "local" ? "Keep local" : choice === "remote" ? "Use remote" : "Delete"}
                    </span>
                  )}
                </div>

                <div className="conflict-item__versions">
                  <div className="conflict-version">
                    <div className="conflict-version__label">
                      Local · {formatTime(conflict.localUpdatedAt)}
                    </div>
                    <pre className="conflict-version__preview">
                      {contentPreview(conflict.localContent)}
                    </pre>
                  </div>
                  <div className="conflict-version">
                    <div className="conflict-version__label">
                      Remote · {formatTime(conflict.remoteUpdatedAt)}
                    </div>
                    <pre className="conflict-version__preview">
                      {contentPreview(conflict.remoteContent)}
                    </pre>
                  </div>
                </div>

                <div className="conflict-item__actions">
                  <button
                    className={`conflict-choice ${choice === "local" ? "conflict-choice--active" : ""}`}
                    onClick={() => setChoice(conflict.id, "local")}
                    type="button"
                  >
                    Keep local
                  </button>
                  <button
                    className={`conflict-choice ${choice === "remote" ? "conflict-choice--active" : ""}`}
                    onClick={() => setChoice(conflict.id, "remote")}
                    type="button"
                  >
                    Use remote
                  </button>
                  <button
                    className={`conflict-choice conflict-choice--delete ${choice === "delete" ? "conflict-choice--active" : ""}`}
                    onClick={() => setChoice(conflict.id, "delete")}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="conflict-modal__footer">
          <div className="conflict-modal__bulk">
            <button
              className="pane__button pane__button--compact"
              onClick={handleResolveAllLocal}
              type="button"
            >
              Keep all local
            </button>
            <button
              className="pane__button pane__button--compact"
              onClick={handleResolveAllRemote}
              type="button"
            >
              Use all remote
            </button>
          </div>
          <button
            className="pane__button conflict-modal__apply"
            disabled={!allResolved}
            onClick={handleApply}
            type="button"
          >
            Apply {resolutions.size}/{conflicts.length} resolved
          </button>
        </div>
      </section>
    </div>
  );
}
