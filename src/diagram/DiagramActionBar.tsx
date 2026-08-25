import type { ReactNode } from "react";

interface DiagramActionBarProps {
  children?: ReactNode;
  insertDisabled?: boolean;
  onDuplicate?: () => void;
  onInsert: () => void;
  onNew: () => void;
  onSave: () => void;
}

export function DiagramActionBar({
  children,
  insertDisabled = false,
  onDuplicate,
  onInsert,
  onNew,
  onSave
}: DiagramActionBarProps) {
  return (
    <div
      className={`diagram-action-bar${onDuplicate ? " diagram-action-bar--with-duplicate" : ""}`}
    >
      <button onClick={onNew} type="button">New</button>
      {onDuplicate ? (
        <button onClick={onDuplicate} type="button">Duplicate</button>
      ) : null}
      <button onClick={onSave} type="button">Save</button>
      <button disabled={insertDisabled} onClick={onInsert} type="button">
        Insert
      </button>
      {children}
    </div>
  );
}
