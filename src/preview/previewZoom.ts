const MIN_PREVIEW_ZOOM_PERCENT = 25;
const MAX_PREVIEW_ZOOM_PERCENT = 500;

export interface ContinuousPreviewZoomState {
  mode: "fit-width" | "fit-height" | "fit-page" | "percent";
  percent: number;
}

export function zoomPreviewByWheel(
  zoom: ContinuousPreviewZoomState,
  deltaY: number,
  deltaMode = 0
): ContinuousPreviewZoomState {
  const currentPercent = zoom.mode === "percent" ? zoom.percent : 100;
  const pixelDelta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 240 : 1);
  const nextPercent = Math.max(
    MIN_PREVIEW_ZOOM_PERCENT,
    Math.min(
      MAX_PREVIEW_ZOOM_PERCENT,
      Math.round(currentPercent * Math.exp(-pixelDelta * 0.0018) * 10) / 10
    )
  );

  return {
    mode: "percent",
    percent: nextPercent
  };
}
