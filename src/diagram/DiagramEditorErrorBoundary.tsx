import { Component, type ReactNode } from "react";

export class DiagramEditorErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="diagram-editor diagram-editor--error">
          <div className="diagram-editor__header">
            <div>
              <strong>Sketch</strong>
              <p>The diagram canvas failed to load.</p>
            </div>
          </div>
          <div className="sidebar-card">
            <p className="sidebar-card__copy">
              The rest of the app is still available. Reloading should restore the panel.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
