import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  createTypstCompiler,
  type CompileResult,
  type CompilerStatus
} from "../compiler/typstCompiler";
import { InlinePaneExpandControls } from "../app/InlinePaneExpandControls";
import { PreviewPane } from "../preview/PreviewPane";
import type { GraphAsset, GraphStyle } from "../app/appState";
import {
  analyzeSimplePlotFunctions,
  buildSimplePlotPreviewDocument,
  createSimplePlotGraphAssetContent,
  createDefaultSimplePlotSource,
  parseSimplePlotGraphDocument,
  serializeSimplePlotGraphDocument,
  type SimplePlotArrowStyle,
  type SimplePlotFunctionEntry,
  type SimplePlotGraphDocument,
  type SimplePlotLineStyle,
  type SimplePlotWindow
} from "./simplePlotGraph";
import { normalizeGraphFileNameForContentType } from "./graphFiles";

interface GraphEditorProps {
  graph: GraphAsset;
  paperView?: boolean;
  isExpanded?: boolean;
  previewLayoutKey?: string;
  onExpandLeft?: () => void;
  onExpandRight?: () => void;
  onSave: (graph: GraphAsset) => void;
  onNew: (graph: GraphAsset) => void;
  onInsertIntoDocument: (graph: GraphAsset) => void;
  onInsertSourceIntoDocument: (graph: GraphAsset) => void;
  onRename: (name: string) => void;
}

interface GraphFunctionRow extends SimplePlotFunctionEntry {
  id: string;
}

const FUNCTION_LINE_STYLE_OPTIONS: Array<{ value: SimplePlotLineStyle; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" }
];

const FUNCTION_ARROW_OPTIONS: Array<{ value: SimplePlotArrowStyle; label: string }> = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "open-circle", label: "Blank circle" },
  { value: "filled-circle", label: "Filled circle" }
];

const GRAPH_PREVIEW_DEBOUNCE_MS = 180;
const GRAPH_PREVIEW_IDLE_STATUS: CompilerStatus = {
  phase: "idle",
  mode: "main-thread",
  label: "Graph preview ready"
};

export function GraphEditor({
  graph,
  paperView = false,
  isExpanded = false,
  previewLayoutKey,
  onExpandLeft,
  onExpandRight,
  onSave,
  onNew,
  onInsertIntoDocument,
  onInsertSourceIntoDocument,
  onRename,
}: GraphEditorProps) {
  const [fileNameDraft, setFileNameDraft] = useState(graph.name);
  const [functionRows, setFunctionRows] = useState<GraphFunctionRow[]>(() =>
    createFunctionRows(parseSimplePlotGraphDocument(graph.source).functions)
  );
  const [windowDraft, setWindowDraft] = useState<SimplePlotWindow>(
    parseSimplePlotGraphDocument(graph.source).window
  );
  const [graphStyle, setGraphStyle] = useState<GraphStyle>(graph.style);
  const [openFunctionSettingsId, setOpenFunctionSettingsId] = useState<string | null>(null);
  const [draggedFunctionRowId, setDraggedFunctionRowId] = useState<string | null>(null);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus>(GRAPH_PREVIEW_IDLE_STATUS);
  const [isCompiling, setIsCompiling] = useState(false);
  const compiler = useMemo(
    () =>
      createTypstCompiler({
        onStatusChange: (status) => {
          setCompilerStatus(status);
        }
      }),
    []
  );
  const hasExpandControls = onExpandLeft || onExpandRight;

  useEffect(() => {
    return () => {
      compiler.dispose();
    };
  }, [compiler]);

  useEffect(() => {
    const nextDocument = parseSimplePlotGraphDocument(graph.source);
    setFileNameDraft(graph.name);
    setFunctionRows(createFunctionRows(nextDocument.functions));
    setOpenFunctionSettingsId(null);
    setDraggedFunctionRowId(null);
    setWindowDraft(nextDocument.window);
    setGraphStyle(graph.style);
  }, [graph.id, graph.name, graph.source, graph.style]);

  useEffect(() => {
    if (!graphStyle.lockAspectRatio) {
      return;
    }

    setGraphStyle((current) => {
      if (!current.lockAspectRatio) {
        return current;
      }

      const nextHeight = roundGraphDimension(
        current.width / getWindowAspectRatio(windowDraft)
      );

      return approximatelyEqual(current.height, nextHeight)
        ? current
        : { ...current, height: nextHeight };
    });
  }, [graphStyle.lockAspectRatio, windowDraft]);

  const documentDraft = useMemo<SimplePlotGraphDocument>(
    () => ({
      version: 1,
      functions: functionRows.map((row) => ({
        expression: row.expression,
        visible: row.visible,
        color: row.color,
        lineStyle: row.lineStyle,
        startArrow: row.startArrow,
        endArrow: row.endArrow,
        samples: row.samples,
        domainStart: row.domainStart ?? null,
        domainEnd: row.domainEnd ?? null
      })),
      window: windowDraft
    }),
    [functionRows, windowDraft]
  );

  const functionAnalysis = useMemo(
    () => analyzeSimplePlotFunctions(documentDraft),
    [documentDraft]
  );
  const validFunctionCount = functionAnalysis.filter(
    (analysis) => analysis.entry.visible && analysis.parsed
  ).length;
  const previewSource = useMemo(
    () => buildSimplePlotPreviewDocument(documentDraft, graphStyle),
    [documentDraft, graphStyle]
  );

  useEffect(() => {
    let cancelled = false;
    setIsCompiling(true);

    const timer = window.setTimeout(() => {
      void compiler
        .compileDocument(previewSource)
        .then((result) => {
          if (cancelled) {
            return;
          }

          setCompileResult(result);
          if (result.ok) {
            setLastSuccessfulResult(result);
            setCompilerStatus({
              phase: "ready",
              mode: "main-thread",
              label: "Graph preview ready"
            });
          }
          setIsCompiling(false);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setCompileResult({
            ok: false,
            engine: "typst-ts",
            errors: [
              {
                message: error instanceof Error ? error.message : "Graph preview failed.",
                severity: "error"
              }
            ]
          });
          setCompilerStatus({
            phase: "error",
            mode: "main-thread",
            label: "Graph preview failed",
            detail: error instanceof Error ? error.message : "Graph preview failed."
          });
          setIsCompiling(false);
        });
    }, GRAPH_PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [compiler, previewSource]);

  function commitFileName() {
    const normalized = normalizeGraphFileNameForContentType(fileNameDraft, graph.contentType);
    setFileNameDraft(normalized);

    if (normalized !== graph.name) {
      onRename(normalized);
    }
  }

  function updateGraphStyle(next: Partial<GraphStyle>) {
    setGraphStyle((current) => ({ ...current, ...next }));
  }

  function handleGraphDimensionChange(dimension: "width" | "height", rawValue: number) {
    setGraphStyle((current) => {
      const nextValue = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : current[dimension];

      if (!current.lockAspectRatio) {
        return {
          ...current,
          [dimension]: nextValue
        };
      }

      const aspectRatio = getWindowAspectRatio(windowDraft);

      if (dimension === "width") {
        return {
          ...current,
          width: nextValue,
          height: roundGraphDimension(nextValue / aspectRatio)
        };
      }

      return {
        ...current,
        height: nextValue,
        width: roundGraphDimension(nextValue * aspectRatio)
      };
    });
  }

  function toggleAspectRatioLock() {
    setGraphStyle((current) => {
      const nextLocked = !current.lockAspectRatio;

      if (!nextLocked) {
        return {
          ...current,
          lockAspectRatio: false
        };
      }

      return {
        ...current,
        lockAspectRatio: true,
        height: roundGraphDimension(current.width / getWindowAspectRatio(windowDraft))
      };
    });
  }

  function updateWindow<K extends keyof SimplePlotWindow>(key: K, value: number) {
    setWindowDraft((current) => ({
      ...current,
      [key]: Number.isFinite(value) ? value : current[key]
    }));
  }

  function updateFunctionRow(id: string, next: Partial<GraphFunctionRow>) {
    setFunctionRows((currentRows) =>
      currentRows.map((row) => (row.id === id ? { ...row, ...next } : row))
    );
  }

  function moveFunctionRow(movedRowId: string, targetRowId: string) {
    if (movedRowId === targetRowId) {
      return;
    }

    setFunctionRows((currentRows) => {
      const sourceIndex = currentRows.findIndex((row) => row.id === movedRowId);
      const targetIndex = currentRows.findIndex((row) => row.id === targetRowId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return currentRows;
      }

      const nextRows = [...currentRows];
      const [movedRow] = nextRows.splice(sourceIndex, 1);
      nextRows.splice(targetIndex, 0, movedRow);
      return nextRows;
    });
  }

  function addFunctionRow() {
    setFunctionRows((currentRows) => {
      if (currentRows.length >= 8) {
        return currentRows;
      }

      return [...currentRows, createFunctionRow({ expression: "", visible: true })];
    });
  }

  function removeFunctionRow(id: string) {
    setFunctionRows((currentRows) => {
      if (currentRows.length <= 1) {
        return [{ ...currentRows[0], expression: "", visible: true }];
      }

      return currentRows.filter((row) => row.id !== id);
    });
    setOpenFunctionSettingsId((currentId) => (currentId === id ? null : currentId));
  }

  function handleClear() {
    const cleared = parseSimplePlotGraphDocument(createDefaultSimplePlotSource());
    setFunctionRows(createFunctionRows(cleared.functions));
    setWindowDraft(cleared.window);
  }

  function captureGraphAsset(): GraphAsset | null {
    if (validFunctionCount === 0) {
      return null;
    }

    const normalizedName = normalizeGraphFileNameForContentType(
      fileNameDraft || graph.name,
      graph.contentType
    );
    const source = serializeSimplePlotGraphDocument(documentDraft);

    return {
      ...graph,
      name: normalizedName,
      provider: "simple-plot",
      source,
      style: graphStyle,
      viewport: {
        left: windowDraft.xmin,
        right: windowDraft.xmax,
        top: windowDraft.ymax,
        bottom: windowDraft.ymin
      },
      renderMode: "typst",
      contentType: "typ",
      content: createSimplePlotGraphAssetContent(documentDraft, graphStyle),
      updatedAt: new Date().toISOString()
    };
  }

  function withCapturedGraphAsset(action: (asset: GraphAsset) => void) {
    const asset = captureGraphAsset();

    if (!asset) {
      window.alert("Add at least one valid function before saving or inserting the graph.");
      return;
    }

    action(asset);
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
            onClick={() => withCapturedGraphAsset(onNew)}
            type="button"
          >
            New
          </button>
          {hasExpandControls ? (
            <InlinePaneExpandControls
              collapseLabel="Collapse graph layout"
              expandLabel="Expand graph layout"
              onExpandLeft={onExpandLeft}
              onExpandRight={onExpandRight}
            />
          ) : null}
        </div>
      </div>

      <div className="graph-editor__body">
        <div className="graph-editor__screen-panel">
          <div className="graph-editor__surface-wrapper">
            <div className={`graph-editor__surface ${paperView ? "graph-editor__surface--paper" : ""}`}>
              <PreviewPane
                key={previewLayoutKey}
                compilerStatus={compilerStatus}
                isCompiling={isCompiling}
                isErrorSettled={Boolean(compileResult && !compileResult.ok)}
                lastSuccessfulResult={lastSuccessfulResult}
                paperView={paperView}
                result={compileResult}
                showToolbar={false}
                viewportPadding={0}
              />
              {validFunctionCount === 0 ? (
                <div className="graph-editor__overlay">
                  <div className="sidebar-card">
                    <p className="sidebar-card__copy">
                      Add a valid function like <code>y = x^2</code> or <code>y = sin(x)</code>
                      to render the graph.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="graph-editor__control-panel">
          <div className="graph-editor__helper">
            <div className="sidebar-card graph-editor__card graph-editor__card--functions">
              <div className="graph-editor__function-list">
                {functionAnalysis.map((analysis, index) => (
                  <div className="graph-editor__function-block" key={functionRows[index]?.id ?? index}>
                    <div
                      className={`graph-editor__function-row ${
                        functionRows[index]?.visible === false ? "graph-editor__function-row--muted" : ""
                      } ${draggedFunctionRowId === functionRows[index]?.id ? "graph-editor__function-row--dragging" : ""}`}
                      onDragOver={(event) => {
                        if (!draggedFunctionRowId || draggedFunctionRowId === functionRows[index]?.id) {
                          return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();

                        if (!draggedFunctionRowId || !functionRows[index]) {
                          return;
                        }

                        moveFunctionRow(draggedFunctionRowId, functionRows[index]!.id);
                        setDraggedFunctionRowId(null);
                      }}
                    >
                      <button
                        aria-label={`Drag Y${index + 1}`}
                        className="graph-editor__function-grip"
                        draggable
                        onDragEnd={() => setDraggedFunctionRowId(null)}
                        onDragStart={(event) => {
                          setDraggedFunctionRowId(functionRows[index]!.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", functionRows[index]!.id);
                        }}
                        type="button"
                      >
                        ::
                      </button>
                      <label className="graph-editor__function-visibility">
                        <input
                          checked={functionRows[index]?.visible ?? true}
                          onChange={(event) =>
                            updateFunctionRow(functionRows[index]!.id, { visible: event.target.checked })
                          }
                          type="checkbox"
                        />
                      </label>
                      <span className="graph-editor__function-label">Y{index + 1}</span>
                      <button
                        aria-label={`Style Y${index + 1}`}
                        aria-expanded={openFunctionSettingsId === functionRows[index]?.id}
                        className="graph-editor__function-swatch graph-editor__function-swatch-button"
                        onClick={() =>
                          setOpenFunctionSettingsId((currentId) =>
                            currentId === functionRows[index]!.id ? null : functionRows[index]!.id
                          )
                        }
                        style={{ backgroundColor: analysis.color }}
                        type="button"
                      />
                      <input
                        className="graph-editor__function-input"
                        onChange={(event) =>
                          updateFunctionRow(functionRows[index]!.id, { expression: event.target.value })
                        }
                        placeholder="x^2"
                        spellCheck={false}
                        value={functionRows[index]?.expression ?? ""}
                      />
                      <button
                        aria-label={`Clear Y${index + 1}`}
                        className="pane__button pane__button--compact graph-editor__function-remove"
                        onClick={() => removeFunctionRow(functionRows[index]!.id)}
                        type="button"
                      >
                        X
                      </button>
                      {analysis.error ? (
                        <div className="graph-editor__function-error">{analysis.error}</div>
                      ) : null}
                    </div>
                    {openFunctionSettingsId === functionRows[index]?.id ? (
                      <div className="graph-editor__function-settings">
                        <label className="sync-field graph-editor__function-setting">
                          <span>Color</span>
                          <input
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, { color: event.target.value })
                            }
                            type="color"
                            value={normalizeColorInputValue(functionRows[index]?.color ?? analysis.color)}
                          />
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>Line</span>
                          <select
                            className="graph-editor__function-select"
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                lineStyle: event.target.value as SimplePlotLineStyle
                              })
                            }
                            value={functionRows[index]?.lineStyle ?? "solid"}
                          >
                            {FUNCTION_LINE_STYLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>Start</span>
                          <select
                            className="graph-editor__function-select"
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                startArrow: event.target.value as SimplePlotArrowStyle
                              })
                            }
                            value={functionRows[index]?.startArrow ?? "none"}
                          >
                            {FUNCTION_ARROW_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>End</span>
                          <select
                            className="graph-editor__function-select"
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                endArrow: event.target.value as SimplePlotArrowStyle
                              })
                            }
                            value={functionRows[index]?.endArrow ?? "none"}
                          >
                            {FUNCTION_ARROW_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>Samples</span>
                          <input
                            min="10"
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                samples: Number(event.target.value)
                              })
                            }
                            step="10"
                            type="number"
                            value={functionRows[index]?.samples ?? 100}
                          />
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>Domain min</span>
                          <input
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                domainStart: parseOptionalNumberInput(event.target.value)
                              })
                            }
                            placeholder={`${windowDraft.xmin}`}
                            step="0.1"
                            type="number"
                            value={functionRows[index]?.domainStart ?? ""}
                          />
                        </label>
                        <label className="sync-field graph-editor__function-setting">
                          <span>Domain max</span>
                          <input
                            onChange={(event) =>
                              updateFunctionRow(functionRows[index]!.id, {
                                domainEnd: parseOptionalNumberInput(event.target.value)
                              })
                            }
                            placeholder={`${windowDraft.xmax}`}
                            step="0.1"
                            type="number"
                            value={functionRows[index]?.domainEnd ?? ""}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="graph-editor__function-actions">
                <button
                  className="pane__button pane__button--compact"
                  disabled={functionRows.length >= 8}
                  onClick={addFunctionRow}
                  type="button"
                >
                  Add function
                </button>
              </div>
            </div>
          </div>

          <div className="graph-editor__style">
            <div className="sidebar-card graph-editor__card graph-editor__card--window">
              <div className="graph-editor__window-grid">
                {([
                  ["xmin", "Xmin"],
                  ["xmax", "Xmax"],
                  ["xscl", "Xscl"],
                  ["ymin", "Ymin"],
                  ["ymax", "Ymax"],
                  ["yscl", "Yscl"]
                ] as const).map(([key, label]) => (
                  <label className="sync-field graph-editor__window-field" key={key}>
                    <span>{label}</span>
                    <input
                      onChange={(event) => updateWindow(key, Number(event.target.value))}
                      step="0.1"
                      type="number"
                      value={windowDraft[key]}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="sidebar-card graph-editor__card graph-editor__card--style">
              <div className="graph-editor__style-grid">
                <label className="sync-field">
                  <span>Width (cm)</span>
                  <input
                    onChange={(event) => handleGraphDimensionChange("width", Number(event.target.value))}
                    step="0.1"
                    type="number"
                    value={graphStyle.width}
                  />
                </label>
                <label className="sync-field">
                  <span>Height (cm)</span>
                  <input
                    onChange={(event) => handleGraphDimensionChange("height", Number(event.target.value))}
                    step="0.1"
                    type="number"
                    value={graphStyle.height}
                  />
                </label>
                <button
                  aria-pressed={graphStyle.lockAspectRatio}
                  className="pane__button pane__button--compact graph-editor__lock-button"
                  onClick={toggleAspectRatioLock}
                  type="button"
                >
                  {graphStyle.lockAspectRatio ? "Unlock 1:1 ratio" : "Lock 1:1 ratio"}
                </button>
                <label className="sync-field">
                  <span>Stroke (pt)</span>
                  <input
                    onChange={(event) => updateGraphStyle({ strokeWidth: Number(event.target.value) })}
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
                    checked={graphStyle.showGrid}
                    onChange={(event) => updateGraphStyle({ showGrid: event.target.checked })}
                    type="checkbox"
                  />
                  <span>Show grid</span>
                </label>
                <label className="graph-editor__toggle">
                  <input
                    checked={graphStyle.showOnlyGreatestTickLabel}
                    onChange={(event) =>
                      updateGraphStyle({ showOnlyGreatestTickLabel: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <span>Only max labels</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="graph-editor__actions">
        <button
          className="pane__button pane__button--compact"
          onClick={handleClear}
          type="button"
        >
          Reset
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={() => withCapturedGraphAsset(onSave)}
          type="button"
        >
          Save
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={() => withCapturedGraphAsset(onInsertIntoDocument)}
          type="button"
        >
          Insert
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={() => withCapturedGraphAsset(onInsertSourceIntoDocument)}
          type="button"
        >
          Insert source
        </button>
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

function createFunctionRows(functions: SimplePlotFunctionEntry[]): GraphFunctionRow[] {
  return functions.map((entry) => createFunctionRow(entry));
}

function createFunctionRow(entry: SimplePlotFunctionEntry): GraphFunctionRow {
  return {
    id: crypto.randomUUID(),
    expression: entry.expression,
    visible: entry.visible,
    color: entry.color,
    lineStyle: entry.lineStyle ?? "solid",
    startArrow: entry.startArrow ?? "none",
    endArrow: entry.endArrow ?? "none",
    samples: entry.samples ?? 100,
    domainStart: entry.domainStart ?? null,
    domainEnd: entry.domainEnd ?? null
  };
}

function parseOptionalNumberInput(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColorInputValue(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#3b82f6";
}

function getWindowAspectRatio(window: SimplePlotWindow): number {
  const width = Math.abs(window.xmax - window.xmin);
  const height = Math.abs(window.ymax - window.ymin);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
}

function roundGraphDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Number(value.toFixed(3));
}

function approximatelyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.001;
}
