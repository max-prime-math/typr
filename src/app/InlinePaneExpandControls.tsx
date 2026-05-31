interface InlinePaneExpandControlsProps {
  onExpandLeft?: () => void;
  onExpandRight?: () => void;
  collapseLabel: string;
  expandLabel: string;
}

export function InlinePaneExpandControls({
  onExpandLeft,
  onExpandRight,
  collapseLabel,
  expandLabel
}: InlinePaneExpandControlsProps) {
  if (!onExpandLeft && !onExpandRight) {
    return null;
  }

  return (
    <div className="inline-pane-expand-controls">
      {onExpandLeft ? (
        <button
          aria-label={collapseLabel}
          className="pane__button pane__button--compact inline-pane-expand-controls__button"
          onClick={onExpandLeft}
          type="button"
        >
          <span
            aria-hidden="true"
            className="inline-pane-expand-controls__icon inline-pane-expand-controls__icon--left"
          />
        </button>
      ) : null}
      {onExpandRight ? (
        <button
          aria-label={expandLabel}
          className="pane__button pane__button--compact inline-pane-expand-controls__button"
          onClick={onExpandRight}
          type="button"
        >
          <span
            aria-hidden="true"
            className="inline-pane-expand-controls__icon inline-pane-expand-controls__icon--right"
          />
        </button>
      ) : null}
    </div>
  );
}
