import type { ReactNode } from "react";

interface DiagramActionBarProps {
  children?: ReactNode;
  insertDisabled?: boolean;
  onInsert: () => void;
  onNew: () => void;
  onSave: () => void;
}

export function DiagramActionBar({
  children,
  insertDisabled = false,
  onInsert,
  onNew,
  onSave
}: DiagramActionBarProps) {
  return (
    <div className="diagram-action-bar">
      <button onClick={onNew} type="button">New</button>
      <button onClick={onSave} type="button">Save</button>
      <button disabled={insertDisabled} onClick={onInsert} type="button">
        Insert
      </button>
      {children}
    </div>
  );
}
