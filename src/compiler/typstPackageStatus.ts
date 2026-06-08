import type { CompilerMode, CompilerStatus } from "./types";
import {
  formatTypstPackageReference,
  type TypstPackageReference
} from "./typstPackages";
import type { TypstPackageLoadStatus } from "./typstPackageRegistry";

type TrackedPackageState = TypstPackageLoadStatus["state"] | "pending";

export function createTypstPackageStatusReporter(
  mode: CompilerMode,
  references: TypstPackageReference[],
  emitStatus: (status: CompilerStatus) => void
): {
  emitInitial(): void;
  handle(status: TypstPackageLoadStatus): void;
} {
  const trackedStates = new Map<string, TrackedPackageState>(
    references.map((reference) => [reference.key, "pending"])
  );
  let failedReference: TypstPackageReference | null = null;
  let latestDetail: string | null = null;

  function emitSummary(): void {
    const counts = {
      cached: 0,
      downloading: 0,
      failed: 0,
      pending: 0
    };

    for (const state of trackedStates.values()) {
      counts[state] += 1;
    }

    if (failedReference) {
      emitStatus({
        phase: "error",
        mode,
        label: "Failed Typst package download",
        detail: `Failed: ${formatTypstPackageReference(failedReference)}`
      });
      return;
    }

    const completedCount = counts.cached + counts.failed;
    const totalCount = trackedStates.size;
    const detailParts = [
      latestDetail,
      totalCount > 0 ? `${completedCount}/${totalCount} ready` : null,
      counts.cached > 0 ? `${counts.cached} cached` : null,
      counts.downloading > 0 ? `${counts.downloading} downloading` : null,
      counts.pending > 0 ? `${counts.pending} pending` : null
    ].filter((part): part is string => part !== null);

    emitStatus({
      phase: "loading-packages",
      mode,
      label:
        counts.downloading > 0
          ? "Downloading Typst packages"
          : counts.pending > 0
            ? "Loading Typst packages"
            : "Using cached Typst packages",
      detail: detailParts.join(", "),
      progress:
        totalCount > 0
          ? {
              current: completedCount,
              total: totalCount
            }
          : undefined
    });
  }

  return {
    emitInitial(): void {
      emitSummary();
    },
    handle(status: TypstPackageLoadStatus): void {
      trackedStates.set(status.reference.key, status.state);
      latestDetail = status.detail;
      if (status.state === "failed") {
        failedReference = status.reference;
      }
      emitSummary();
    }
  };
}
