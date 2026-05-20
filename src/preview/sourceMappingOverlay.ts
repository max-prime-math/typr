export interface SourceMappingOverlay {
  dispose(): void;
  resolveSourceLocation(target: EventTarget | null): string | null;
}

export async function renderSourceMappingOverlay(
  container: HTMLElement,
  _artifactData: Uint8Array
): Promise<SourceMappingOverlay> {
  container.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "preview-source-mapping-overlay";
  overlay.setAttribute("aria-hidden", "true");
  container.appendChild(overlay);

  return {
    dispose() {
      overlay.remove();
    },
    resolveSourceLocation(target: EventTarget | null) {
      if (!(target instanceof Element)) {
        return null;
      }

      const source = target.closest("[data-source-location]") as
        | HTMLElement
        | null;
      return source?.dataset.sourceLocation ?? null;
    }
  };
}
