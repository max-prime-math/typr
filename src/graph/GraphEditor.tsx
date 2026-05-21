import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type {
  GraphAsset,
  GraphStyle,
  GraphRenderMode,
  GraphViewport
} from "../app/appState";
import { getDefaultGraphSource } from "../app/appState";
import {
  getGraphFilePath,
  normalizeGraphFileNameForContentType
} from "./graphFiles";
import { loadDesmosCalculator, type DesmosGraphingCalculator } from "./desmos";
import {
  capturePlotlyDataUri,
  decoratePngBytes,
  decoratePngDataUri,
  renderGnuplotSvg,
  renderPlotlyFigure,
  svgTextToPngBytes
} from "./graphRuntime";

interface GraphEditorProps {
  graph: GraphAsset;
  apiKey: string;
  paperView?: boolean;
  isExpanded?: boolean;
  onExpand?: () => void;
  onSave: (graph: GraphAsset) => void;
  onNew: (graph: GraphAsset) => void;
  onInsertIntoDocument: (graph: GraphAsset) => void;
  onRename: (name: string) => void;
  onDownloadGraph: (graph: GraphAsset) => void;
  onRenderModeChange: (mode: GraphRenderMode) => void;
  onProviderChange: (provider: GraphAsset["provider"]) => void;
}

const GRAPH_SCREENSHOT_WIDTH = 1400;
const GRAPH_SCREENSHOT_HEIGHT = 900;

export function GraphEditor({
  graph,
  apiKey,
  paperView = false,
  isExpanded = false,
  onExpand,
  onSave,
  onNew,
  onInsertIntoDocument,
  onRename,
  onDownloadGraph,
  onRenderModeChange,
  onProviderChange
}: GraphEditorProps) {
  const desmosContainerRef = useRef<HTMLDivElement | null>(null);
  const plotlyContainerRef = useRef<HTMLDivElement | null>(null);
  const gnuplotContainerRef = useRef<HTMLDivElement | null>(null);
  const desmosRef = useRef<DesmosGraphingCalculator | null>(null);
  const fileNameDraftRef = useRef(graph.name);
  const sourceDraftRef = useRef(graph.source);
  const [fileNameDraft, setFileNameDraft] = useState(graph.name);
  const [sourceDraft, setSourceDraft] = useState(graph.source);
  const [plotlyEquation, setPlotlyEquation] = useState("y = x^2");
  const [plotlyDomainStart, setPlotlyDomainStart] = useState(-10);
  const [plotlyDomainEnd, setPlotlyDomainEnd] = useState(10);
  const [plotlySamples, setPlotlySamples] = useState(200);
  const [graphStyle, setGraphStyle] = useState<GraphStyle>(graph.style);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    graph.provider === "desmos" && apiKey.trim() ? "idle" : "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(
    graph.provider === "desmos" && !apiKey.trim()
      ? "Enter a Desmos API key in settings to load the graph editor."
      : null
  );

  const graphPath = useMemo(
    () => getGraphFilePath(normalizeGraphFileNameForContentType(fileNameDraft, graph.contentType)),
    [fileNameDraft, graph.contentType]
  );

  const providerLabel = useMemo(() => {
    if (graph.provider === "plotly") {
      return "Plotly";
    }

    if (graph.provider === "gnuplot") {
      return "gnuplot";
    }

    return "Desmos";
  }, [graph.provider]);

  useEffect(() => {
    setFileNameDraft(graph.name);
    fileNameDraftRef.current = graph.name;
  }, [graph.name]);

  useEffect(() => {
    setSourceDraft(graph.source);
    sourceDraftRef.current = graph.source;
  }, [graph.source]);

  useEffect(() => {
    setGraphStyle(graph.style);
  }, [graph.style]);

  useEffect(() => {
    if (graph.provider !== "plotly") {
      return;
    }

    const parsed = parsePlotlyFunctionSource(sourceDraft);
    if (!parsed) {
      return;
    }

    setPlotlyEquation(parsed.equation);
    setPlotlyDomainStart(parsed.domainStart);
    setPlotlyDomainEnd(parsed.domainEnd);
    setPlotlySamples(parsed.samples);
  }, [graph.provider, sourceDraft]);

  useEffect(() => {
    return () => {
      desmosRef.current?.destroy();
      desmosRef.current = null;
    };
  }, []);

  useEffect(() => {
    const provider = graph.provider;

    desmosRef.current?.destroy();
    desmosRef.current = null;
    setLoadError(null);

    if (provider === "desmos") {
      if (!apiKey.trim()) {
        setLoadState("error");
        setLoadError("Enter a Desmos API key in settings to load the graph editor.");
        return;
      }

      let cancelled = false;
      setLoadState("loading");

      void loadDesmosCalculator(apiKey)
        .then(() => {
          if (cancelled || !desmosContainerRef.current || !window.Desmos) {
            return;
          }

          const calculator = window.Desmos.GraphingCalculator(desmosContainerRef.current, {
            autosize: true,
            border: false,
            expressions: true,
            keypad: true,
            settingsMenu: true,
            zoomButtons: true
          });
          desmosRef.current = calculator;
          applyGraphState(calculator, graph.state);

          if (!cancelled) {
            setLoadState("ready");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "Failed to load Desmos.");
        });

      return () => {
        cancelled = true;
      };
    }

    if (provider === "plotly") {
      let cancelled = false;
      setLoadState("loading");

    void renderPlotlyFigure(plotlyContainerRef.current ?? createDetachedDiv(), sourceDraft, graphStyle)
      .then(() => {
        if (!cancelled) {
          setLoadState("ready");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "Failed to load Plotly.");
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setLoadState("loading");

    void renderGnuplotSvg(sourceDraft, graphStyle)
      .then((svg) => {
        if (cancelled) {
          return;
        }

        if (gnuplotContainerRef.current) {
          gnuplotContainerRef.current.innerHTML = svg;
        }
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "Failed to render gnuplot.");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, graph.provider, graph.id, graphStyle, sourceDraft]);

  useEffect(() => {
    if (graph.provider === "desmos") {
      const calculator = desmosRef.current;
      if (!calculator) {
        return;
      }

      applyGraphState(calculator, graph.state);
      return;
    }

    if (graph.provider === "plotly") {
      const container = plotlyContainerRef.current;
      if (!container) {
        return;
      }

      let cancelled = false;
      void renderPlotlyFigure(container, sourceDraft, graphStyle)
        .then(() => {
          if (!cancelled) {
            setLoadState("ready");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "Failed to render Plotly.");
        });

      return () => {
        cancelled = true;
      };
    }

    const container = gnuplotContainerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
      void renderGnuplotSvg(sourceDraft, graphStyle)
      .then((svg) => {
        if (cancelled) {
          return;
        }

        container.innerHTML = svg;
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "Failed to render gnuplot.");
      });

    return () => {
      cancelled = true;
    };
  }, [graph.provider, graph.state, graphStyle, sourceDraft]);

  function commitFileName() {
    const normalized = normalizeGraphFileNameForContentType(fileNameDraft, graph.contentType);
    setFileNameDraft(normalized);

    if (normalized !== graph.name) {
      onRename(normalized);
    }
  }

  function commitPlotlyHelper(next: {
    equation?: string;
    domainStart?: number;
    domainEnd?: number;
    samples?: number;
  }) {
    const equation = next.equation ?? plotlyEquation;
    const domainStart = next.domainStart ?? plotlyDomainStart;
    const domainEnd = next.domainEnd ?? plotlyDomainEnd;
    const samples = next.samples ?? plotlySamples;
    const source = buildPlotlyFunctionSource({
      equation,
      domainStart,
      domainEnd,
      samples
    });

    setPlotlyEquation(equation);
    setPlotlyDomainStart(domainStart);
    setPlotlyDomainEnd(domainEnd);
    setPlotlySamples(samples);
    sourceDraftRef.current = source;
    setSourceDraft(source);
  }

  function updateGraphStyle(next: Partial<GraphStyle>) {
    setGraphStyle((current) => ({ ...current, ...next }));
  }

  async function captureGraphAsset(): Promise<GraphAsset | null> {
    try {
      if (graph.provider === "desmos") {
        const calculator = desmosRef.current;
        if (!calculator) {
          return null;
        }

        const state = JSON.stringify(calculator.getState());
        const expressions = JSON.stringify(calculator.getExpressions());
        const viewport = extractViewport(calculator.graphpaperBounds);
        const screenshot = calculator.screenshot({
          width: GRAPH_SCREENSHOT_WIDTH,
          height: GRAPH_SCREENSHOT_HEIGHT,
          targetPixelRatio: 2
        });

        return {
          ...graph,
          name: normalizeGraphFileNameForContentType(fileNameDraftRef.current || graph.name, "png"),
          source: "",
          style: graphStyle,
          state,
          expressions,
          viewport,
          contentType: "png",
          content: dataUriToBytes(screenshot),
          updatedAt: new Date().toISOString()
        };
      }

      if (graph.provider === "plotly") {
        const container = plotlyContainerRef.current;
        if (!container) {
          return null;
        }

        await renderPlotlyFigure(container, sourceDraftRef.current, graphStyle);
        const format = graph.renderMode === "png" ? "png" : "svg";
        const dataUri = await capturePlotlyDataUri(
          container,
          format,
          GRAPH_SCREENSHOT_WIDTH,
          GRAPH_SCREENSHOT_HEIGHT
        );
        const decoratedDataUri =
          format === "png" ? await decoratePngDataUri(dataUri, graphStyle) : dataUri;

        return {
          ...graph,
          name: normalizeGraphFileNameForContentType(
            fileNameDraftRef.current || graph.name,
            format
          ),
          source: sourceDraftRef.current,
          style: graphStyle,
          state: "",
          expressions: "[]",
          viewport: null,
          contentType: format,
          content: dataUriToBytes(decoratedDataUri),
          updatedAt: new Date().toISOString()
        };
      }

      const svg = await renderGnuplotSvg(sourceDraftRef.current, graphStyle);
      const contentType = graph.renderMode === "png" ? "png" : "svg";
      const pngBytes = contentType === "png" ? await svgTextToPngBytes(svg) : new Uint8Array();
      const content =
        contentType === "png" ? await decoratePngBytes(pngBytes, graphStyle) : new TextEncoder().encode(svg);
      return {
        ...graph,
        name: normalizeGraphFileNameForContentType(fileNameDraftRef.current || graph.name, contentType),
        source: sourceDraftRef.current,
        style: graphStyle,
        state: "",
        expressions: "[]",
        viewport: null,
        contentType,
        content,
        updatedAt: new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  function handleClear() {
    if (graph.provider === "desmos") {
      desmosRef.current?.setBlank({ allowUndo: false });
      return;
    }

    const nextSource = getDefaultGraphSource(graph.provider);
    sourceDraftRef.current = nextSource;
    setSourceDraft(nextSource);
  }

  return (
    <div
      className={`graph-editor ${paperView ? "graph-editor--paper" : ""} ${
        isExpanded ? "graph-editor--expanded" : ""
      }`}
    >
      <div className="graph-editor__header">
        <div className="graph-editor__header-main">
          <label className="sync-field graph-editor__name-field">
            <input
              aria-label="Filename"
              onBlur={commitFileName}
              onChange={(event) => {
                fileNameDraftRef.current = event.target.value;
                setFileNameDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitFileName();
                }
              }}
              type="text"
              value={fileNameDraft}
            />
          </label>
          <button
            className="pane__button pane__button--compact graph-editor__new-button"
            onClick={async () => {
              const asset = await captureGraphAsset();
              if (asset) {
                onNew(asset);
              }
            }}
            type="button"
          >
            New
          </button>
          {onExpand ? (
            <button
              className="pane__button pane__button--compact graph-editor__expand-button"
              onClick={onExpand}
              type="button"
            >
              Expand
            </button>
          ) : null}
        </div>
        <div className="graph-editor__header-meta">
          <div
            className={`menu-dropdown graph-editor__provider-menu ${
              isProviderMenuOpen ? "menu-dropdown--open" : ""
            }`}
            onMouseEnter={() => setIsProviderMenuOpen(true)}
            onMouseLeave={() => setIsProviderMenuOpen(false)}
          >
            <button
              aria-expanded={isProviderMenuOpen}
              aria-haspopup="menu"
              className="menu-dropdown__trigger graph-editor__provider-trigger"
              onClick={() => setIsProviderMenuOpen((current) => !current)}
              type="button"
            >
              <span>{providerLabel}</span>
              <span aria-hidden="true" className="graph-editor__provider-chevron">
                ▾
              </span>
            </button>
            {isProviderMenuOpen ? (
              <div className="menu-dropdown__panel graph-editor__provider-panel" role="menu">
                {(["desmos", "plotly", "gnuplot"] as const).map((provider) => (
                  <button
                    className="menu-action"
                    key={provider}
                    onClick={() => {
                      onProviderChange(provider);
                      setIsProviderMenuOpen(false);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {provider === "desmos"
                      ? "Desmos"
                      : provider === "plotly"
                        ? "Plotly"
                        : "gnuplot"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {graph.provider === "plotly" ? (
        <div className="graph-editor__helper">
          <div className="sidebar-card">
            <div className="sidebar-card__row">
              <span>Function helper</span>
              <span className="pane__meta">Sampled trace</span>
            </div>
            <div className="graph-editor__helper-grid">
              <label className="sync-field">
                <span>Equation</span>
                <input
                  onChange={(event) =>
                    commitPlotlyHelper({ equation: event.target.value || "y = x^2" })
                  }
                  value={plotlyEquation}
                />
              </label>
              <label className="sync-field">
                <span>Domain start</span>
                <input
                  onChange={(event) =>
                    commitPlotlyHelper({ domainStart: Number(event.target.value) })
                  }
                  type="number"
                  value={plotlyDomainStart}
                />
              </label>
              <label className="sync-field">
                <span>Domain end</span>
                <input
                  onChange={(event) =>
                    commitPlotlyHelper({ domainEnd: Number(event.target.value) })
                  }
                  type="number"
                  value={plotlyDomainEnd}
                />
              </label>
              <label className="sync-field">
                <span>Samples</span>
                <input
                  onChange={(event) =>
                    commitPlotlyHelper({
                      samples: Math.max(10, Number(event.target.value) || 10)
                    })
                  }
                  type="number"
                  value={plotlySamples}
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="graph-editor__style">
        <div className="sidebar-card">
          <div className="sidebar-card__row">
            <span>Graph style</span>
            <span className="pane__meta">Shared controls</span>
          </div>
          <div className="graph-editor__style-grid">
            <label className="sync-field">
              <span>Width</span>
              <input
                onChange={(event) => updateGraphStyle({ width: Number(event.target.value) })}
                type="number"
                value={graphStyle.width}
              />
            </label>
            <label className="sync-field">
              <span>Height</span>
              <input
                onChange={(event) => updateGraphStyle({ height: Number(event.target.value) })}
                type="number"
                value={graphStyle.height}
              />
            </label>
            <label className="sync-field">
              <span>Thickness</span>
              <input
                onChange={(event) =>
                  updateGraphStyle({ strokeWidth: Number(event.target.value) })
                }
                step="0.1"
                type="number"
                value={graphStyle.strokeWidth}
              />
            </label>
            <label className="sync-field">
              <span>X label</span>
              <input
                onChange={(event) => updateGraphStyle({ xAxisLabel: event.target.value })}
                type="text"
                value={graphStyle.xAxisLabel}
              />
            </label>
            <label className="sync-field">
              <span>Y label</span>
              <input
                onChange={(event) => updateGraphStyle({ yAxisLabel: event.target.value })}
                type="text"
                value={graphStyle.yAxisLabel}
              />
            </label>
            <label className="graph-editor__toggle">
              <input
                checked={graphStyle.axisArrows}
                onChange={(event) => updateGraphStyle({ axisArrows: event.target.checked })}
                type="checkbox"
              />
              <span>Axis arrows</span>
            </label>
          </div>
        </div>
      </div>

      {graph.provider !== "desmos" ? (
        <label className="sync-field graph-editor__source">
          <span>{graph.provider === "plotly" ? "Plotly source" : "gnuplot script"}</span>
          <textarea
            className="graph-editor__source-input"
            onChange={(event) => {
              const nextSource = event.target.value;
              sourceDraftRef.current = nextSource;
              setSourceDraft(nextSource);
            }}
            spellCheck={false}
            value={sourceDraft}
          />
        </label>
      ) : null}

      <div className="graph-editor__surface-wrapper">
        <div className={`graph-editor__surface ${paperView ? "graph-editor__surface--paper" : ""}`}>
          {graph.provider === "desmos" ? (
            <div ref={desmosContainerRef} className="graph-editor__calculator" />
          ) : graph.provider === "plotly" ? (
            <div ref={plotlyContainerRef} className="graph-editor__plotly" />
          ) : (
            <div ref={gnuplotContainerRef} className="graph-editor__gnuplot" />
          )}
          {loadState !== "ready" ? (
            <div className="graph-editor__overlay">
              <div className="sidebar-card">
                <p className="sidebar-card__copy">
                  {loadState === "loading"
                    ? `Loading ${providerLabel}...`
                    : loadError ?? `${providerLabel} is unavailable.`}
                </p>
                {graph.provider === "desmos" && !apiKey.trim() ? (
                  <p className="sidebar-card__copy">
                    Add your API key in Settings to enable Desmos editing.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="graph-editor__mode" aria-label="Graph output mode">
          {([
            ["auto", "Auto"],
            ["typst", "Typst"],
            ["png", "PNG"]
          ] as const).map(([mode, label]) => (
            <button
              aria-pressed={graph.renderMode === mode}
              className="pane__button pane__button--compact graph-editor__mode-button"
              key={mode}
              onClick={() => onRenderModeChange(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-editor__actions">
        <button
          className="pane__button pane__button--compact"
          onClick={async () => {
            const asset = await captureGraphAsset();
            if (asset) {
              onSave(asset);
            }
          }}
          type="button"
        >
          Save
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={async () => {
            const asset = await captureGraphAsset();
            if (asset) {
              onInsertIntoDocument(asset);
            }
          }}
          type="button"
        >
          Insert into doc
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={async () => {
            const asset = await captureGraphAsset();
            if (asset) {
              onDownloadGraph(asset);
            }
          }}
          type="button"
        >
          {graph.renderMode === "typst"
            ? "Download Typst"
            : graph.contentType === "svg"
              ? "Download SVG"
              : "Download PNG"}
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={handleClear}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="graph-editor__footer">
        <span className="pane__meta">{graphPath}</span>
      </div>
    </div>
  );
}

export class GraphEditorErrorBoundary extends Component<
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
        <div className="graph-editor graph-editor--error">
          <div className="graph-editor__header">
            <div>
              <strong>Graph</strong>
              <p>The graph editor failed to load.</p>
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

function applyGraphState(calculator: DesmosGraphingCalculator, stateText: string): void {
  if (!stateText.trim()) {
    calculator.setBlank({ allowUndo: false });
    return;
  }

  try {
    calculator.setState(JSON.parse(stateText), { allowUndo: false });
  } catch {
    calculator.setBlank({ allowUndo: false });
  }
}

function dataUriToBytes(dataUri: string): Uint8Array {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(dataUri);

  if (!match) {
    return new Uint8Array();
  }

  const isBase64 = /;base64/i.test(dataUri);
  const payload = match[2] ?? "";

  if (!isBase64) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parsePlotlyFunctionSource(source: string): {
  equation: string;
  domainStart: number;
  domainEnd: number;
  samples: number;
} | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const equation = lines[0] ?? "";
  const equationMatch = /^(y|x)\s*=\s*(.+)$/i.exec(equation);

  if (!equationMatch) {
    return null;
  }

  let domainStart = -10;
  let domainEnd = 10;
  let samples = 200;

  for (const line of lines.slice(1)) {
    const domainMatch = /^domain\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|to|-)\s*(-?\d+(?:\.\d+)?)$/i.exec(
      line
    );
    if (domainMatch) {
      domainStart = Number(domainMatch[1]);
      domainEnd = Number(domainMatch[2]);
      continue;
    }

    const samplesMatch = /^samples\s*:\s*(\d+)$/i.exec(line);
    if (samplesMatch) {
      samples = Math.max(10, Number(samplesMatch[1]));
    }
  }

  if (domainStart === domainEnd) {
    domainStart = -10;
    domainEnd = 10;
  }

  return {
    equation: `${equationMatch[1].toLowerCase()} = ${equationMatch[2].trim()}`,
    domainStart,
    domainEnd,
    samples
  };
}

function buildPlotlyFunctionSource(spec: {
  equation: string;
  domainStart: number;
  domainEnd: number;
  samples: number;
}): string {
  const equation = spec.equation.trim() || "y = x^2";
  const domainStart = Number.isFinite(spec.domainStart) ? spec.domainStart : -10;
  const domainEnd = Number.isFinite(spec.domainEnd) ? spec.domainEnd : 10;
  const samples = Math.max(10, Math.floor(Number.isFinite(spec.samples) ? spec.samples : 200));

  return [
    equation,
    `domain: ${formatGraphNumber(domainStart)}..${formatGraphNumber(domainEnd)}`,
    `samples: ${samples}`
  ].join("\n");
}

function formatGraphNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(6)).toString();
}

function extractViewport(
  bounds: DesmosGraphingCalculator["graphpaperBounds"]
): GraphViewport | null {
  const coordinates = bounds?.mathCoordinates;

  if (!coordinates) {
    return null;
  }

  if (
    typeof coordinates.left !== "number" ||
    typeof coordinates.right !== "number" ||
    typeof coordinates.top !== "number" ||
    typeof coordinates.bottom !== "number"
  ) {
    return null;
  }

  return {
    left: coordinates.left,
    right: coordinates.right,
    top: coordinates.top,
    bottom: coordinates.bottom
  };
}

function createDetachedDiv(): HTMLElement {
  return document.createElement("div");
}
