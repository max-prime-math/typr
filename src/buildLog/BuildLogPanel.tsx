import type { CompileDiagnostic, CompileMetadata } from "../compiler/types";
import {
  dedupeRepeatedWarnings,
  formatDiagnosticRange,
  formatDurationMs,
  formatSourceLanguageLabel,
  getPreviousBuildLogEntry,
  groupDiagnosticsByFile,
  type BuildLogEntry,
  type BuildLogFilter
} from "./buildLogState";
import type { BuildLogController, DownloadBuildLogFile } from "./useBuildLogController";

export function BuildLogPanel(props: {
  controller: BuildLogController;
  downloadFile: DownloadBuildLogFile;
  formatCompileStrategySummary: (metadata: CompileMetadata) => string;
  formatRawLogExcerpt: (log: string) => string;
  jumpToDiagnostic: (diagnostic: CompileDiagnostic, sourcePath: string) => void;
  rerunEntry: (entry: BuildLogEntry) => void;
}) {
  const { controller } = props;
  const timelineMaxMs = Math.max(...controller.filteredEntries.map((entry) => entry.durationMs), 1);

  return (
    <details className="sidebar-card debug-section" open>
      <summary className="debug-section__summary">
        <span>Build log</span>
        <span className="pane__meta">{controller.filteredEntries.length}/{controller.entries.length}</span>
      </summary>
      <div className="debug-control-grid">
        <label>
          <span>Filter</span>
          <select value={controller.filter} onChange={(event) => controller.setFilter(event.target.value as BuildLogFilter)}>
            <option value="all">All builds</option>
            <option value="errors">Errors only</option>
            <option value="warnings">Warnings only</option>
            <option value="current-file">Current file</option>
            <option value="latex">LaTeX only</option>
          </select>
        </label>
        <label>
          <span>Search</span>
          <input
            onChange={(event) => controller.setSearchQuery(event.target.value)}
            placeholder="log, file, package"
            type="search"
            value={controller.searchQuery}
          />
        </label>
        <label className="debug-toggle">
          <input
            checked={controller.hideRepeatedWarnings}
            onChange={(event) => controller.setHideRepeatedWarnings(event.target.checked)}
            type="checkbox"
          />
          <span className="debug-toggle__track" aria-hidden="true" />
          <span>Hide repeated warnings</span>
        </label>
      </div>
      <div className="sidebar-card__actions debug-action-row">
        <button className="pane__button pane__button--compact" onClick={controller.copyEntries} type="button">Copy filtered build log</button>
        <button className="pane__button pane__button--compact" onClick={controller.copyDiagnostics} type="button">Copy filtered diagnostics</button>
        <button className="pane__button pane__button--compact" onClick={() => controller.exportText(props.downloadFile)} type="button">Export filtered build log text</button>
        <button className="pane__button pane__button--compact" onClick={() => controller.exportJson(props.downloadFile)} type="button">Export filtered build log JSON</button>
        <button className="pane__button pane__button--compact" onClick={controller.clear} type="button">Clear</button>
      </div>
      {controller.feedback ? <p className="sidebar-card__copy">{controller.feedback}</p> : null}
      {controller.filteredEntries.length > 0 ? (
        <>
          <div className="build-log-timeline-header"><span>Recent build durations</span></div>
          <div className="build-log-timeline" aria-label="Recent build duration timeline">
            {controller.filteredEntries.slice(0, 12).map((entry) => (
              <span
                className={`build-log-timeline__bar build-log-timeline__bar--${entry.ok ? "success" : "error"}`}
                key={`timeline:${entry.id}`}
                style={{ height: `${Math.max(12, Math.round((entry.durationMs / timelineMaxMs) * 42))}px` }}
                title={`${entry.sourcePath}: ${formatDurationMs(entry.durationMs)}`}
              />
            ))}
          </div>
          <div className="build-log-list">
            {controller.filteredEntries.map((entry, index) => {
              const previousEntry = getPreviousBuildLogEntry(controller.filteredEntries, index);
              const visibleDiagnostics = controller.hideRepeatedWarnings
                ? dedupeRepeatedWarnings(entry.diagnostics)
                : entry.diagnostics;

              return (
                <details className="build-log-entry" key={entry.id}>
                  <summary>
                    <span className={`build-log-status build-log-status--${entry.ok ? "success" : "error"}`}>{entry.ok ? "ok" : "error"}</span>
                    <span className="build-log-entry__main">
                      <strong>{entry.sourcePath}</strong>
                      <span>{formatSourceLanguageLabel(entry.language)} · {entry.engine} · {entry.trigger} · {formatDurationMs(entry.durationMs)}</span>
                    </span>
                    <time>{new Date(entry.startedAt).toLocaleTimeString()}</time>
                  </summary>
                  <div className="sidebar-card__actions build-log-entry__actions">
                    <button className="pane__button pane__button--compact" onClick={() => props.rerunEntry(entry)} type="button">Rerun</button>
                    <button className="pane__button pane__button--compact" onClick={() => controller.copyEntry(entry)} type="button">Copy</button>
                  </div>
                  <ul className="sidebar-card__list build-log-entry__details">
                    <li><span>Started</span><span>{new Date(entry.startedAt).toLocaleString()}</span></li>
                    <li><span>Trigger</span><span>{entry.trigger}</span></li>
                    <li><span>Mode</span><span>{entry.compileMode}{entry.cached ? " · cached" : ""}</span></li>
                    <li><span>Output</span><span>{entry.outputChanged ? "changed" : "unchanged"}</span></li>
                    {previousEntry ? <li><span>Previous</span><span>{formatDurationMs(entry.durationMs - previousEntry.durationMs)} duration · {entry.diagnostics.length - previousEntry.diagnostics.length} diagnostics</span></li> : null}
                    {entry.shellEscapeUnavailable ? <li><span>Shell escape</span><span>Unavailable in browser BusyTeX</span></li> : null}
                    {entry.metadata?.strategy ? <li><span>Strategy</span><span>{props.formatCompileStrategySummary(entry.metadata)}</span></li> : null}
                    {entry.metadata?.timings?.map((timing) => (
                      <li key={`${entry.id}:${timing.label}:${timing.durationMs}`}><span>{timing.label}</span><span>{formatDurationMs(timing.durationMs)}</span></li>
                    ))}
                  </ul>
                  {entry.packageDetails.length > 0 ? <details className="build-log-nested-details"><summary>Package resolution</summary><pre>{entry.packageDetails.join("\n")}</pre></details> : null}
                  {entry.rawLog ? <details className="build-log-nested-details"><summary>Raw LaTeX log</summary><pre>{props.formatRawLogExcerpt(entry.rawLog)}</pre></details> : null}
                  {visibleDiagnostics.length > 0 ? (
                    <div className="sidebar-diagnostics build-log-entry__diagnostics" role="list">
                      {groupDiagnosticsByFile(visibleDiagnostics).map((group) => (
                        <div className="build-log-diagnostic-group" key={`${entry.id}:${group.file}`}>
                          <strong>{group.file}</strong>
                          {group.diagnostics.map((diagnostic, diagnosticIndex) => (
                            <div className="sidebar-diagnostic" key={`${entry.id}:${group.file}:${diagnostic.message}:${diagnosticIndex}`}>
                              <strong>{diagnostic.severity}{formatDiagnosticRange(diagnostic) ? ` · ${formatDiagnosticRange(diagnostic)}` : ""}</strong>
                              <span>{diagnostic.message}</span>
                              {diagnostic.line ? <button className="pane__button pane__button--compact" onClick={() => props.jumpToDiagnostic(diagnostic, entry.sourcePath)} type="button">Jump</button> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </details>
              );
            })}
          </div>
        </>
      ) : <p className="sidebar-card__copy">No builds match the current filters.</p>}
    </details>
  );
}
