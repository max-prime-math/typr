import { Fragment, useEffect, useState } from "react";
import { GoogleDriveConnectionCard } from "../app/GoogleDriveConnectionCard";
import type { MobileKeyboardLanguage } from "../app/appState";
import {
  DEFAULT_COMPANION_BASE_URL,
  normalizeCompanionBaseUrl,
  validateCompanionBaseUrl,
  type CompanionConnectionStatus
} from "../compiler/companionClient";
import type {
  EditorFormatterId,
  EditorLinterId,
  EditorToolLanguage
} from "../editor/editorTools";
import type { SettingsTab } from "./settingsSheetState";

export interface SettingsPanelBindings {
  settingsTab: SettingsTab;
  [key: string]: any;
}

export function SettingsPanelContent({ bindings }: { bindings: SettingsPanelBindings }) {
  const {
    AUTO_THEME_ID,
    DocumentStatsPanel,
    SNIPPET_LANGUAGES,
    SNIPPET_LANGUAGE_LABELS,
    ThemeCard,
    activeAllSnippets,
    activeCustomSnippets,
    activeDefaultSnippets,
    activeSnippetLanguage,
    activeSnippetLanguageLabel,
    customThemes,
    companionBaseUrl,
    companionConnection,
    darkThemes,
    detectedLatexPackages,
    documentStats,
    filteredRepositoryPackages,
    formatByteSize,
    formatEditorToolLanguageLabel,
    formatKeybinding,
    formatLatexPackageBundleLabel,
    formatMobileKeyboardLabels,
    formatSourceLanguageLabel,
    getEditorFormatterOptions,
    getKeybindingConflictsForBinding,
    getKeybindingLabel,
    getSnippetImportTemplate,
    gitHubDiscovery,
    googleDriveSync,
    googleDriveSyncState,
    handleCacheLatexBundle,
    handleCancelPendingKeybindingConflict,
    handleClearCustomSnippets,
    handleClearLatexBundles,
    handleClearTypstPackages,
    handleColorfulFileTreeIconsToggle,
    handleCompanionBaseUrlChange,
    handleCompanionBaseUrlReset,
    handleCursorSmearChange,
    handleCursorSmoothToggle,
    handleDownloadCustomSnippets,
    handleDownloadSnippetTemplate,
    handleDownloadThemeTemplate,
    handleExternalDiagnosticsChange,
    handleFormatOnCompileToggle,
    handleFormatterChange,
    handleGitCredentialChange,
    handleGitHubTokenConnectionAction,
    handleGitIgnorePatternsChange,
    handleGitProjectFieldChange,
    handleImportPastedSnippets,
    handleInstallTypstPackage,
    handleKeybindingReset,
    handleLatexMathPreviewToggle,
    handleLintOnEditToggle,
    handleLinterChange,
    handleLiveCompilationToggle,
    handleMobileKeyboardEnabledToggle,
    handleMobileKeyboardLabelsChange,
    handlePastedImageDirectoryAnchorToggle,
    handlePastedImageDirectoryChange,
    handlePastedImageFormatChange,
    handlePastedImagePrefixChange,
    handlePastedImageWrapperChange,
    handlePastedImagesEnabledToggle,
    handleProjectGitignoreChange,
    handleRecordedKeybinding,
    handleLineWrapToggle,
    handleRelativeLineNumbersToggle,
    handleRemoveCachedLatexPackage,
    handleRemoveCustomSnippet,
    handleRemoveCustomTheme,
    handleRemoveLatexBundle,
    handleRemoveTypstPackage,
    handleResetAllKeybindings,
    handleResolvePendingKeybindingConflict,
    handleShowGitignoreInFileTreeToggle,
    handleSnippetImportTextChange,
    handleSnippetLanguageChange,
    handleTypstMathPreviewToggle,
    handleVimClipboardSharingToggle,
    handleVimToggle,
    handleWhackKeybindingConflicts,
    installedPackageKeys,
    installingLatexBundleId,
    installingPackageName,
    isAppleShortcutPlatform,
    isLatexPackageCacheClearing,
    isLatexPackageCacheLoading,
    isOnline,
    isPackageCacheClearing,
    isPackageCacheLoading,
    isPackageSearchLoading,
    keybindingFromKeyboardEvent,
    keybindingSearchQuery,
    keybindings,
    latexPackageBundleEntries,
    latexPackageCatalog,
    latexPackageFeedback,
    latexPackageSearchQuery,
    latexPackageSearchResults,
    lightThemes,
    localFolderSync,
    localFolderSyncState,
    manualExtraLatexPackages,
    packageCacheEntries,
    packageCacheFeedback,
    packageCacheTotalBytes,
    packageSearchQuery,
    packageSettingsScope,
    pendingKeybindingConflict,
    projectGitignoreContent,
    recordingKeybindingId,
    refreshLatexPackageCache,
    refreshTypstPackageCache,
    renderLatexPackageResolutionRow,
    selectedGitProject,
    selectedGitToken,
    selectedProjectRepository,
    setKeybindingSearchQuery,
    setLatexPackageSearchQuery,
    setPackageSearchQuery,
    setPackageSearchVisibleCount,
    setPackageSettingsScope,
    setPendingKeybindingConflict,
    setRecordingKeybindingId,
    setThemeMode,
    settingsFiles,
    settingsTab,
    snapshot,
    snippetImportFeedback,
    snippetImportInputRef,
    snippetImportText,
    stringifyIgnorePatterns,
    theme,
    themeImportFeedback,
    themeImportInputRef,
    uncachedDetectedLatexPackages,
    visibleKeybindingDefinitions,
    visibleRepositoryPackages
  } = bindings;

  return (
    <>
        {settingsTab === "sync" ? (
          <div className="settings-panel settings-panel--sync" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Local folder sync</h3>
                <p>
                  Choose how the selected project exchanges files and Git data
                  with its linked folder.
                </p>
              </div>

              <div className="sync-settings-project-card">
                <div>
                  <span className="sync-settings-project-card__label">
                    Selected project
                  </span>
                  <strong>
                    {selectedProjectRepository?.displayName ?? "No project selected"}
                  </strong>
                  <small>
                    {localFolderSyncState?.directoryName
                      ? `${localFolderSyncState.directoryName} · ${localFolderSyncState.message}`
                      : localFolderSync.supported
                        ? "No local folder linked"
                        : "Local folder sync requires a Chromium browser"}
                  </small>
                </div>
                {selectedProjectRepository ? (
                  <div className="sync-settings-project-card__actions">
                    {localFolderSyncState?.status === "permission-needed" ? (
                      <button
                        className="pane__button"
                        onClick={() => {
                          void localFolderSync.reconnect(
                            selectedProjectRepository.id
                          );
                        }}
                        type="button"
                      >
                        Reconnect
                      </button>
                    ) : localFolderSyncState?.directoryName ? (
                      <>
                        <button
                          className="pane__button"
                          disabled={localFolderSyncState.status === "syncing"}
                          onClick={() => {
                            void localFolderSync.syncNow(
                              selectedProjectRepository.id
                            );
                          }}
                          type="button"
                        >
                          {localFolderSyncState.status === "syncing"
                            ? "Syncing…"
                            : "Sync now"}
                        </button>
                        <button
                          className="pane__button"
                          onClick={() => {
                            void localFolderSync.disconnect(
                              selectedProjectRepository.id
                            );
                          }}
                          type="button"
                        >
                          Unlink
                        </button>
                      </>
                    ) : (
                      <button
                        className="pane__button"
                        disabled={!localFolderSync.supported}
                        onClick={() => {
                          void localFolderSync.connect(
                            selectedProjectRepository.id
                          );
                        }}
                        type="button"
                      >
                        Link local folder
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              <fieldset
                className="sync-policy-options"
                disabled={!localFolderSyncState?.directoryName}
              >
                <legend>Sync mode</legend>
                {[
                  {
                    mode: "constant",
                    title: "Constant sync",
                    description:
                      "Watch both Typr and the folder and apply changes in real time."
                  },
                  {
                    mode: "compile",
                    title: "Sync on compile",
                    description:
                      "Sync when you explicitly request a document compile."
                  },
                  {
                    mode: "interval",
                    title: "Scheduled sync",
                    description:
                      "Sync automatically after the selected number of minutes."
                  },
                  {
                    mode: "manual",
                    title: "Manual sync",
                    description:
                      "Only sync when you choose Sync now."
                  }
                ].map((option) => (
                  <label
                    className={`sync-policy-option ${
                      localFolderSyncState?.syncMode === option.mode
                        ? "sync-policy-option--active"
                        : ""
                    }`}
                    key={option.mode}
                  >
                    <input
                      checked={localFolderSyncState?.syncMode === option.mode}
                      name="local-folder-sync-mode"
                      onChange={() => {
                        if (selectedProjectRepository) {
                          void localFolderSync.setSyncPolicy(
                            selectedProjectRepository.id,
                            { mode: option.mode }
                          );
                        }
                      }}
                      type="radio"
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="sync-field sync-interval-field">
                <span>Scheduled interval</span>
                <span className="sync-interval-field__control">
                  <input
                    disabled={
                      !localFolderSyncState?.directoryName ||
                      localFolderSyncState.syncMode !== "interval"
                    }
                    max={1440}
                    min={1}
                    onChange={(event) => {
                      if (selectedProjectRepository) {
                        void localFolderSync.setSyncPolicy(
                          selectedProjectRepository.id,
                          {
                            mode: "interval",
                            intervalMinutes: Number(event.target.value)
                          }
                        );
                      }
                    }}
                    type="number"
                    value={localFolderSyncState?.syncIntervalMinutes ?? 5}
                  />
                  <span>minutes</span>
                </span>
              </label>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Google Drive sync</h3>
                <p>
                  Keep an independent copy of the selected project in an
                  app-managed Google Drive folder. GitHub and local-folder
                  connections remain active.
                </p>
              </div>

              {selectedProjectRepository ? (
                <GoogleDriveConnectionCard
                  className="sync-settings-project-card"
                  controller={googleDriveSync}
                  projectId={selectedProjectRepository.id}
                  projectName={selectedProjectRepository.displayName}
                  state={googleDriveSyncState}
                />
              ) : (
                <p className="pane__meta">
                  Select a project to configure Google Drive sync.
                </p>
              )}

              <fieldset
                className="sync-policy-options"
                disabled={
                  !googleDriveSyncState?.projectFolderName ||
                  googleDriveSyncState.migrationRequired
                }
              >
                <legend>Sync mode</legend>
                {[
                  {
                    mode: "constant",
                    title: "Constant sync",
                    description:
                      "Sync browser edits after a short delay and check Drive periodically."
                  },
                  {
                    mode: "compile",
                    title: "Sync on compile",
                    description:
                      "Sync when you explicitly request a document compile."
                  },
                  {
                    mode: "interval",
                    title: "Scheduled sync",
                    description:
                      "Sync automatically while Google authorization remains active."
                  },
                  {
                    mode: "manual",
                    title: "Manual sync",
                    description:
                      "Only sync when you choose Sync now."
                  }
                ].map((option) => (
                  <label
                    className={`sync-policy-option ${
                      googleDriveSyncState?.syncMode === option.mode
                        ? "sync-policy-option--active"
                        : ""
                    }`}
                    key={option.mode}
                  >
                    <input
                      checked={
                        googleDriveSyncState?.syncMode === option.mode
                      }
                      name="google-drive-sync-mode"
                      onChange={() => {
                        if (selectedProjectRepository) {
                          void googleDriveSync.setSyncPolicy(
                            selectedProjectRepository.id,
                            { mode: option.mode }
                          );
                        }
                      }}
                      type="radio"
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="sync-field sync-interval-field">
                <span>Scheduled interval</span>
                <span className="sync-interval-field__control">
                  <input
                    disabled={
                      !googleDriveSyncState?.projectFolderName ||
                      googleDriveSyncState.migrationRequired ||
                      googleDriveSyncState.syncMode !== "interval"
                    }
                    max={1440}
                    min={1}
                    onChange={(event) => {
                      if (selectedProjectRepository) {
                        void googleDriveSync.setSyncPolicy(
                          selectedProjectRepository.id,
                          {
                            mode: "interval",
                            intervalMinutes: Number(event.target.value)
                          }
                        );
                      }
                    }}
                    type="number"
                    value={
                      googleDriveSyncState?.syncIntervalMinutes ?? 15
                    }
                  />
                  <span>minutes</span>
                </span>
              </label>

              <p className="pane__meta">
                Typr requests access only to Drive files it creates or that
                you connect through Typr. Google access tokens remain in
                memory and may need to be renewed after a reload or expiry.
              </p>
            </div>
          </div>
        ) : settingsTab === "git" ? (
          <div className="settings-panel settings-panel--git" role="tabpanel">
            <div className="git-setup-strip git-setup-strip--token-only">
              <a
                aria-label="Open GitHub personal access token settings"
                className="git-setup-step git-setup-step--link"
                href="https://github.com/settings/personal-access-tokens/new"
                rel="noreferrer"
                target="_blank"
                title="Open GitHub"
              >
                <span aria-hidden="true" className="git-setup-step__icon toolbar-icon toolbar-icon--github" />
              </a>
              <label className="sync-field git-token-field">
                <span>Fine-grained token</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => handleGitCredentialChange(event.target.value)}
                  placeholder="Paste token"
                  type="password"
                  value={selectedGitToken}
                />
              </label>
              <button
                className={`pane__button git-connect-button ${
                  gitHubDiscovery.status === "connected" ? "pane__button--success" : ""
                }`}
                disabled={!selectedGitProject || gitHubDiscovery.status === "loading" || !selectedGitToken.trim()}
                onClick={() => {
                  void handleGitHubTokenConnectionAction();
                }}
                type="button"
              >
                {gitHubDiscovery.status === "loading"
                  ? "Connecting..."
                  : gitHubDiscovery.status === "connected"
                    ? gitHubDiscovery.accountLogin
                      ? `Connected as ${gitHubDiscovery.accountLogin}`
                      : "Connected"
                    : "Connect token"}
              </button>
            </div>

            <div className="git-settings-card git-settings-card--guidance">
              <p className="git-settings-note">
                Use a fine-grained GitHub token with repository Contents read/write access. To create repositories from Typr, also grant Administration read/write for the selected owner. Prefer a token that expires in 30 to 90 days instead of one with no expiration.
              </p>
              <p className="git-settings-note">
                Clone existing remote repositories from the Projects tab. Manage pulls, commits, pushes, and conflicts from the Sync tab.
              </p>
              <div className="git-permission-list">
                <div className="git-permission-row">
                  <span>Existing repos</span>
                  <strong>Contents read/write</strong>
                </div>
                <div className="git-permission-row">
                  <span>Create repos</span>
                  <strong>Contents + Administration read/write</strong>
                </div>
              </div>
            </div>

            <div className="git-settings-card git-settings-card--advanced">
              <div className="settings-toggle-stack">
                <label className="settings-toggle">
                  <span>
                    <strong>Show .gitignore in Files</strong>
                    <small>Keep .gitignore editable here without showing it in the file tree.</small>
                  </span>
                  <input
                    checked={snapshot.preferences.showGitignoreInFileTree}
                    onChange={handleShowGitignoreInFileTreeToggle}
                    type="checkbox"
                  />
                </label>
              </div>

              <div className="git-advanced-grid">
                <label className="sync-field">
                  <span>.gitignore</span>
                  <textarea
                    disabled={!selectedProjectRepository}
                    onChange={(event) => handleProjectGitignoreChange(event.target.value)}
                    placeholder={"*.pdf\n.env\nbuild/"}
                    rows={6}
                    value={projectGitignoreContent}
                  />
                </label>

                <label className="sync-field">
                  <span>Status ignore patterns</span>
                  <textarea
                    onChange={(event) => handleGitIgnorePatternsChange(event.target.value)}
                    placeholder={"figures/\n*.pdf\nnotes/private/**"}
                    rows={4}
                    value={stringifyIgnorePatterns(selectedGitProject?.ignorePatterns ?? [])}
                  />
                </label>
              </div>

              <label className="sync-field">
                <span>Default push message</span>
                <input
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(event) =>
                    handleGitProjectFieldChange("commitMessageTemplate", event.target.value)
                  }
                  placeholder="Sync from Typr"
                  type="text"
                  value={selectedGitProject?.commitMessageTemplate ?? ""}
                />
              </label>
            </div>

          </div>
        ) : settingsTab === "themes" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Theme</h3>
              </div>

              <div className="theme-auto-row">
                <label
                  className={`theme-auto-option ${
                    snapshot.preferences.theme === AUTO_THEME_ID ? "theme-auto-option--active" : ""
                  }`}
                >
                  <span>
                    <strong>Follow system default</strong>
                  </span>
                  <input
                    checked={snapshot.preferences.theme === AUTO_THEME_ID}
                    onChange={(event) =>
                      setThemeMode(event.target.checked ? AUTO_THEME_ID : theme.id)
                    }
                    type="checkbox"
                  />
                </label>
              </div>

              <div className="settings-toggle-stack">
                <label className="settings-toggle">
                  <span>
                    <strong>Colorful file icons</strong>
                    <small>Use file-type colors in the Files tree.</small>
                  </span>
                  <input
                    checked={snapshot.preferences.colorfulFileTreeIcons}
                    onChange={handleColorfulFileTreeIconsToggle}
                    type="checkbox"
                  />
                </label>

                <div className="settings-toggle settings-toggle--stacked">
                  <label className="settings-toggle__row">
                    <span>
                      <strong>Smear Cursor</strong>
                      <small>Animate the source cursor as it moves through text.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.cursorSmooth}
                      onChange={handleCursorSmoothToggle}
                      type="checkbox"
                    />
                  </label>

                  {snapshot.preferences.cursorSmooth ? (
                    <label className="settings-slider settings-slider--plain">
                      <span>
                        <strong>Intensity</strong>
                      </span>
                      <div className="settings-slider__control">
                        <input
                          max="100"
                          min="0"
                          onChange={handleCursorSmearChange}
                          type="range"
                          value={snapshot.preferences.cursorSmear}
                        />
                        <output>{snapshot.preferences.cursorSmear}%</output>
                      </div>
                    </label>
                  ) : null}
                </div>
              </div>

              <div className="theme-columns">
                <section className="theme-column">
                  <div className="theme-column__header">
                    <h4>Light</h4>
                  </div>
                  <div className="theme-column__list">
                    {lightThemes.map((themeDefinition: any) => (
                      <ThemeCard
                        key={themeDefinition.id}
                        active={themeDefinition.id === theme.id}
                        themeDefinition={themeDefinition}
                        onClick={() => setThemeMode(themeDefinition.id)}
                      />
                    ))}
                  </div>
                </section>

                <section className="theme-column">
                  <div className="theme-column__header">
                    <h4>Dark</h4>
                  </div>
                  <div className="theme-column__list">
                    {darkThemes.map((themeDefinition: any) => (
                      <ThemeCard
                        key={themeDefinition.id}
                        active={themeDefinition.id === theme.id}
                        themeDefinition={themeDefinition}
                        onClick={() => setThemeMode(themeDefinition.id)}
                      />
                    ))}
                  </div>
                </section>
              </div>

              {customThemes.length > 0 ? (
                <section className="settings-section settings-section--nested">
                  <div className="settings-section__header">
                    <h3>Imported themes</h3>
                    <span className="pane__meta">{customThemes.length}</span>
                  </div>
                  <div className="theme-column__list">
                    {customThemes.map((themeDefinition: any) => (
                      <div className="theme-card-shell" key={themeDefinition.id}>
                        <ThemeCard
                          active={themeDefinition.id === theme.id}
                          themeDefinition={themeDefinition}
                          onClick={() => setThemeMode(themeDefinition.id)}
                        />
                        <button
                          className="theme-card__remove"
                          onClick={() => handleRemoveCustomTheme(themeDefinition.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="theme-import-card">
                <div className="theme-import-card__copy">
                  <h4>Import a theme</h4>
                  <p>
                    Upload a JSON file with <code>name</code>, <code>mode</code>, and a full
                    <code>colors</code> palette.
                  </p>
                </div>
                <div className="theme-import-card__actions">
                  <button
                    className="pane__button"
                    onClick={() => themeImportInputRef.current?.click()}
                    type="button"
                  >
                    Import JSON
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={handleDownloadThemeTemplate}
                    type="button"
                  >
                    Download template
                  </button>
                </div>
                {themeImportFeedback.text ? (
                  <div
                    className={`sync-feedback theme-import-card__feedback ${
                      themeImportFeedback.tone === "success"
                        ? "sync-feedback--success"
                        : themeImportFeedback.tone === "error"
                          ? "sync-feedback--error"
                          : ""
                    }`}
                  >
                    <span>{themeImportFeedback.text}</span>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : settingsTab === "editor" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Editor</h3>
              </div>

              <div className="settings-toggle-stack">
                <label className="settings-toggle">
                  <span>
                    <strong>Show settings files as a project</strong>
                    <small>
                      Create and show a syncable Typr Settings project. Its JSON files can use
                      the normal GitHub and Google Drive project controls.
                    </small>
                    {Object.keys(settingsFiles.errors).length > 0 ? (
                      <small className="settings-file-warning" role="status">
                        One or more settings files are invalid and their defaults are active.
                      </small>
                    ) : null}
                  </span>
                  <input
                    checked={snapshot.preferences.showSettingsProject}
                    onChange={(event) => settingsFiles.setShowSettingsProject(event.target.checked)}
                    type="checkbox"
                  />
                </label>

                <CompanionSettingsCard
                  baseUrl={companionBaseUrl}
                  connection={companionConnection}
                  onApply={handleCompanionBaseUrlChange}
                  onReset={handleCompanionBaseUrlReset}
                />

                <label className="settings-toggle">
                  <span>
                    <strong>Live compilation (experimental)</strong>
                    <small>
                      Recompile the active Typst document automatically while you edit.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.liveCompilation}
                    onChange={handleLiveCompilationToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>Lint while editing</strong>
                    <small>
                      Show browser-available linter diagnostics in the source editor.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.editorTooling.lintOnEdit}
                    onChange={handleLintOnEditToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>Format on compile</strong>
                    <small>
                      Run the selected formatter before compile or Markdown preview.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.editorTooling.formatOnCompile}
                    onChange={handleFormatOnCompileToggle}
                    type="checkbox"
                  />
                </label>

                <div className="settings-toggle settings-toggle--stacked">
                  <label className="settings-toggle__row">
                    <span>
                      <strong>Vim mode</strong>
                      <small>Use Vim motions, operators, and normal-mode editing in the source editor.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.vimMode}
                      onChange={handleVimToggle}
                      type="checkbox"
                    />
                  </label>

                  {snapshot.preferences.vimMode ? (
                    <div className="settings-embedded-grid">
                      <label className="sync-field sync-field--checkbox">
                        <span>Clipboard sharing</span>
                        <input
                          checked={snapshot.preferences.vimClipboardSharing}
                          onChange={handleVimClipboardSharingToggle}
                          type="checkbox"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <label className="settings-toggle">
                  <span>
                    <strong>Line wrap</strong>
                    <small>
                      Wrap long lines in the source editor instead of scrolling sideways.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.lineWrap}
                    onChange={handleLineWrapToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>Relative line numbers</strong>
                    <small>
                      Show line numbers relative to the cursor line.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.relativeLineNumbers}
                    onChange={handleRelativeLineNumbersToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>LaTeX math preview</strong>
                    <small>
                      Show an inline RaTeX preview while typing valid math in LaTeX files.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.latexMathPreview}
                    onChange={handleLatexMathPreviewToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>Typst math preview</strong>
                    <small>
                      Show an inline Typst preview while typing valid math in Typst files.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.typstMathPreview}
                    onChange={handleTypstMathPreviewToggle}
                    type="checkbox"
                  />
                </label>

                <div className="settings-toggle settings-toggle--stacked">
                  <label className="settings-toggle__row">
                    <span>
                      <strong>Paste clipboard images</strong>
                      <small>Save pasted images to a figures directory and insert a source reference.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.pastedImages.enabled}
                      onChange={handlePastedImagesEnabledToggle}
                      type="checkbox"
                    />
                  </label>

                  {snapshot.preferences.pastedImages.enabled ? (
                    <div className="settings-embedded-grid">
                      <label className="sync-field">
                        <span>Format</span>
                        <select
                          onChange={(event) => handlePastedImageFormatChange(event.target.value as "png" | "jpeg")}
                          value={snapshot.preferences.pastedImages.format}
                        >
                          <option value="png">PNG</option>
                          <option value="jpeg">JPEG</option>
                        </select>
                      </label>
                      <label className="sync-field">
                        <span>Filename prefix</span>
                        <input
                          onChange={(event) => handlePastedImagePrefixChange(event.target.value)}
                          value={snapshot.preferences.pastedImages.fileNamePrefix}
                        />
                      </label>
                      <label className="sync-field">
                        <span>Figures directory</span>
                        <input
                          onChange={(event) => handlePastedImageDirectoryChange(event.target.value)}
                          value={snapshot.preferences.pastedImages.figuresDirectory}
                        />
                      </label>
                      <label className="sync-field sync-field--checkbox">
                        <span>Relative to current file</span>
                        <input
                          checked={snapshot.preferences.pastedImages.figuresDirectoryRelativeToFile}
                          onChange={handlePastedImageDirectoryAnchorToggle}
                          type="checkbox"
                        />
                      </label>
                      <div className="pasted-image-template-grid">
                        <span />
                        <span>Prefix</span>
                        <span />
                        <span>Suffix</span>

                        <span className="pasted-image-template-grid__language">Typst</span>
                        <input
                          aria-label="Typst image prefix"
                          onChange={(event) => handlePastedImageWrapperChange("typstPrefix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.typstPrefix.length)}
                          value={snapshot.preferences.pastedImages.typstPrefix}
                        />
                        <span className="pasted-image-template-grid__filename">image filename</span>
                        <input
                          aria-label="Typst image suffix"
                          onChange={(event) => handlePastedImageWrapperChange("typstSuffix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.typstSuffix.length)}
                          value={snapshot.preferences.pastedImages.typstSuffix}
                        />

                        <span className="pasted-image-template-grid__language">TeX</span>
                        <input
                          aria-label="TeX image prefix"
                          onChange={(event) => handlePastedImageWrapperChange("latexPrefix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.latexPrefix.length)}
                          value={snapshot.preferences.pastedImages.latexPrefix}
                        />
                        <span className="pasted-image-template-grid__filename">image filename</span>
                        <input
                          aria-label="TeX image suffix"
                          onChange={(event) => handlePastedImageWrapperChange("latexSuffix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.latexSuffix.length)}
                          value={snapshot.preferences.pastedImages.latexSuffix}
                        />

                        <span className="pasted-image-template-grid__language">Markdown</span>
                        <input
                          aria-label="Markdown image prefix"
                          onChange={(event) => handlePastedImageWrapperChange("markdownPrefix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.markdownPrefix.length)}
                          value={snapshot.preferences.pastedImages.markdownPrefix}
                        />
                        <span className="pasted-image-template-grid__filename">image filename</span>
                        <input
                          aria-label="Markdown image suffix"
                          onChange={(event) => handlePastedImageWrapperChange("markdownSuffix", event.target.value)}
                          size={Math.max(12, snapshot.preferences.pastedImages.markdownSuffix.length)}
                          value={snapshot.preferences.pastedImages.markdownSuffix}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

              </div>

              <section className="settings-section settings-section--nested mobile-keyboard-settings">
                <div className="settings-section__header">
                  <h3>Mobile quick keys</h3>
                  <span className="pane__meta">Editor footer</span>
                </div>

                <div className="settings-toggle-stack">
                  <label className="settings-toggle">
                    <span>
                      <strong>Show extra keyboard row</strong>
                      <small>Show language-specific quick keys below the mobile source editor.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.mobileKeyboard.enabled}
                      onChange={handleMobileKeyboardEnabledToggle}
                      type="checkbox"
                    />
                  </label>
                </div>

                <div className="mobile-keyboard-settings__list">
                  {(["typst", "latex", "markdown"] as MobileKeyboardLanguage[]).map((language) => (
                    <label className="sync-field mobile-keyboard-settings__field" key={language}>
                      <span>{formatSourceLanguageLabel(language)} keys</span>
                      <textarea
                        onChange={(event) => handleMobileKeyboardLabelsChange(language, event.target.value)}
                        rows={2}
                        spellCheck={false}
                        value={formatMobileKeyboardLabels(snapshot.preferences.mobileKeyboard.keys[language])}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="settings-section settings-section--nested">
                <div className="settings-section__header">
                  <h3>External diagnostics</h3>
                  <span className="pane__meta">Harper and LSP</span>
                </div>

                <div className="settings-toggle-stack">
                  <label className="settings-toggle">
                    <span>
                      <strong>Offline Harper grammar check</strong>
                      <small>Run private English writing diagnostics in the browser after the app is cached.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.externalDiagnostics.harper.enabled}
                      onChange={() =>
                        handleExternalDiagnosticsChange((preferences: any) => ({
                          ...preferences,
                          harper: {
                            ...preferences.harper,
                            enabled: !preferences.harper.enabled
                          }
                        }))
                      }
                      type="checkbox"
                    />
                  </label>

                  <div className="settings-toggle settings-toggle--stacked">
                    <label className="settings-toggle__row">
                      <span>
                        <strong>Local WebSocket LSP</strong>
                        <small>Connect to a language server bridge running on this device.</small>
                      </span>
                      <input
                        checked={snapshot.preferences.externalDiagnostics.localLsp.enabled}
                        onChange={() =>
                          handleExternalDiagnosticsChange((preferences: any) => ({
                            ...preferences,
                            localLsp: {
                              ...preferences.localLsp,
                              enabled: !preferences.localLsp.enabled
                            }
                          }))
                        }
                        type="checkbox"
                      />
                    </label>
                    <div className="settings-embedded-grid">
                      <label className="sync-field">
                        <span>Local WebSocket URL</span>
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(event) =>
                            handleExternalDiagnosticsChange((preferences: any) => ({
                              ...preferences,
                              localLsp: {
                                ...preferences.localLsp,
                                url: event.target.value
                              }
                            }))
                          }
                          spellCheck={false}
                          value={snapshot.preferences.externalDiagnostics.localLsp.url}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="settings-toggle settings-toggle--stacked">
                    <label className="settings-toggle__row">
                      <span>
                        <strong>Remote WebSocket LSP</strong>
                        <small>Connect to a network LSP endpoint only after explicit document-upload consent.</small>
                      </span>
                      <input
                        checked={snapshot.preferences.externalDiagnostics.remoteLsp.enabled}
                        onChange={() =>
                          handleExternalDiagnosticsChange((preferences: any) => ({
                            ...preferences,
                            remoteLsp: {
                              ...preferences.remoteLsp,
                              enabled: !preferences.remoteLsp.enabled
                            }
                          }))
                        }
                        type="checkbox"
                      />
                    </label>
                    <div className="settings-embedded-grid">
                      <label className="sync-field">
                        <span>Remote WebSocket URL</span>
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(event) =>
                            handleExternalDiagnosticsChange((preferences: any) => ({
                              ...preferences,
                              remoteLsp: {
                                ...preferences.remoteLsp,
                                url: event.target.value
                              }
                            }))
                          }
                          spellCheck={false}
                          value={snapshot.preferences.externalDiagnostics.remoteLsp.url}
                        />
                      </label>
                      <label className="sync-field sync-field--checkbox">
                        <span>Allow document upload</span>
                        <input
                          checked={snapshot.preferences.externalDiagnostics.remoteLsp.allowDocumentUpload}
                          onChange={() =>
                            handleExternalDiagnosticsChange((preferences: any) => ({
                              ...preferences,
                              remoteLsp: {
                                ...preferences.remoteLsp,
                                allowDocumentUpload: !preferences.remoteLsp.allowDocumentUpload
                              }
                            }))
                          }
                          type="checkbox"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section settings-section--nested">
                <div className="settings-section__header">
                  <h3>Formatters and linters</h3>
                  <span className="pane__meta">Browser mode</span>
                </div>

                <div className="package-repository-list" role="list">
                  {(["typst", "latex", "markdown"] as EditorToolLanguage[]).map((language) => {
                    const languageTools = snapshot.preferences.editorTooling.languages[language];
                    const builtInDescription =
                      language === "typst"
                        ? "Built-in Typst formatting and linting run offline in the browser."
                        : language === "latex"
                          ? "Built-in LaTeX formatting and BusyTeX-oriented linting run offline in the browser."
                          : "Built-in Markdown formatting and linting run offline in the browser.";

                    return (
                      <article className="package-cache-row" key={language} role="listitem">
                        <div className="package-cache-row__main">
                          <strong>{formatEditorToolLanguageLabel(language)}</strong>
                          <span>{builtInDescription}</span>
                        </div>
                        <label className="sync-field">
                          <span>Formatter</span>
                          <select
                            onChange={(event) =>
                              handleFormatterChange(language, event.target.value as EditorFormatterId)
                            }
                            value={languageTools.formatter}
                          >
                            {getEditorFormatterOptions(language).map((option: any) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sync-field">
                          <span>Linter</span>
                          <select
                            onChange={(event) =>
                              handleLinterChange(language, event.target.value as EditorLinterId)
                            }
                            value={languageTools.linter}
                          >
                            <option value="disabled">Disabled</option>
                            <option value="built-in">
                              Built in
                            </option>
                          </select>
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        ) : settingsTab === "keybindings" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="keybindings-search-field">
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setKeybindingSearchQuery(event.target.value)}
                  placeholder="Search keybindings"
                  type="search"
                  value={keybindingSearchQuery}
                />
                {keybindingSearchQuery ? (
                  <button
                    aria-label="Clear keybinding search"
                    className="package-search-clear"
                    onClick={() => setKeybindingSearchQuery("")}
                    type="button"
                  >
                    <span aria-hidden="true" className="package-search-clear__icon" />
                  </button>
                ) : null}
              </div>
              <div className="keybindings-table" role="table" aria-label="Keyboard shortcuts">
                <div className="keybindings-table__row keybindings-table__row--head" role="row">
                  <span role="columnheader">Action</span>
                  <span role="columnheader">Shortcut</span>
                </div>
                {visibleKeybindingDefinitions.map((definition: any, index: number) => {
                  const binding = keybindings[definition.id];
                  const conflicts = getKeybindingConflictsForBinding(
                    keybindings,
                    definition.id,
                    binding
                  );
                  const pendingConflict =
                    pendingKeybindingConflict?.commandId === definition.id
                      ? pendingKeybindingConflict
                      : null;
                  const displayedConflictIds = pendingConflict?.conflictIds ?? conflicts;
                  const displayedConflictBinding = pendingConflict?.binding ?? binding;
                  const conflictLabels = displayedConflictIds
                    .map((conflictId: any) => getKeybindingLabel(conflictId))
                    .join(", ");
                  const isRecording = recordingKeybindingId === definition.id;
                  const isModified = binding !== definition.defaultBinding;
                  const previousDefinition = visibleKeybindingDefinitions[index - 1];
                  const showGroupHeader = previousDefinition?.group !== definition.group;

                  return (
                    <Fragment key={definition.id}>
                      {showGroupHeader ? (
                        <div className="keybindings-table__group" role="row">
                          <span role="cell">{definition.group}</span>
                        </div>
                      ) : null}
                      <div className="keybindings-table__row" role="row">
                        <span className="keybindings-table__action" role="cell">
                          <strong>{definition.label}</strong>
                        </span>
                        <div className="keybindings-table__binding" role="cell">
                          <button
                            className={`keybinding-recorder ${
                              isRecording ? "keybinding-recorder--active" : ""
                            }`}
                            data-keybinding-recorder={definition.id}
                            onClick={() => {
                              setPendingKeybindingConflict(null);
                              setRecordingKeybindingId(definition.id);
                            }}
                            onKeyDown={(event) => {
                              if (!isRecording) {
                                return;
                              }

                              event.preventDefault();
                              event.stopPropagation();

                              if (event.key === "Escape") {
                                setRecordingKeybindingId(null);
                                return;
                              }

                              const nextBinding = keybindingFromKeyboardEvent(
                                event.nativeEvent,
                                isAppleShortcutPlatform
                              );
                              if (!nextBinding) {
                                return;
                              }

                              handleRecordedKeybinding(definition.id, nextBinding);
                              setRecordingKeybindingId(null);
                            }}
                            type="button"
                          >
                            {isRecording
                              ? "Press keys"
                              : formatKeybinding(binding, isAppleShortcutPlatform)}
                          </button>
                          {isModified ? (
                            <button
                              aria-label={`Reset ${definition.label}`}
                              className="pane__button pane__button--compact pane__icon-button keybinding-reset-button"
                              onClick={() => handleKeybindingReset(definition.id)}
                              title={`Reset to ${formatKeybinding(
                                definition.defaultBinding,
                                isAppleShortcutPlatform
                              )}`}
                              type="button"
                            >
                              <span aria-hidden="true" className="toolbar-icon toolbar-icon--reset" />
                            </button>
                          ) : null}
                        </div>
                        {displayedConflictIds.length > 0 ? (
                          <div className="keybinding-conflict" role="alert">
                            <span>
                              <strong>
                                {formatKeybinding(
                                  displayedConflictBinding,
                                  isAppleShortcutPlatform
                                )}
                              </strong>{" "}
                              is already used by {conflictLabels}.
                            </span>
                            <div className="keybinding-conflict__actions">
                              <button
                                className="pane__button pane__button--compact"
                                onClick={() =>
                                  pendingConflict
                                    ? handleResolvePendingKeybindingConflict()
                                    : handleWhackKeybindingConflicts(
                                        definition.id,
                                        displayedConflictBinding
                                      )
                                }
                                type="button"
                              >
                                Whack-a-mole
                              </button>
                              {pendingConflict ? (
                                <button
                                  className="pane__button pane__button--compact pane__button--quiet"
                                  onClick={handleCancelPendingKeybindingConflict}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Fragment>
                  );
                })}
                {visibleKeybindingDefinitions.length === 0 ? (
                  <div className="snippet-empty">No matching keybindings.</div>
                ) : null}
              </div>

              <section className="keybindings-card">
                <div className="keybindings-card__header">
                  <h4>Mouse gestures</h4>
                  <span className="pane__meta">Fixed</span>
                </div>
                <div className="keybindings-gesture-list">
                  <div>
                    <span>Insert cursor</span>
                    <kbd>{isAppleShortcutPlatform ? "Option+Click" : "Alt+Click"}</kbd>
                  </div>
                  <div>
                    <span>Rectangular selection</span>
                    <kbd>{isAppleShortcutPlatform ? "Shift+Option+Drag" : "Shift+Alt+Drag"}</kbd>
                  </div>
                  <div>
                    <span>Zoom pane under pointer</span>
                    <kbd>{isAppleShortcutPlatform ? "Option+Scroll" : "Alt+Scroll"}</kbd>
                  </div>
                </div>
              </section>

              <div className="keybindings-footer">
                <button
                  className="pane__button pane__button--quiet"
                  onClick={handleResetAllKeybindings}
                  type="button"
                >
                  Reset all
                </button>
              </div>

              <section className="settings-section settings-section--nested">
                <div className="settings-section__header">
                  <h3>Snippets</h3>
                  <span className="pane__meta">
                    {activeSnippetLanguageLabel} · {activeAllSnippets.length} total ·{" "}
                    {activeCustomSnippets.length} custom
                  </span>
                </div>

              <div
                className="snippet-language-tabs"
                role="tablist"
                aria-label="Snippet language"
              >
                {SNIPPET_LANGUAGES.map((language: any) => (
                  <button
                    aria-selected={activeSnippetLanguage === language}
                    className={`snippet-language-tab ${
                      activeSnippetLanguage === language ? "snippet-language-tab--active" : ""
                    }`}
                    key={language}
                    onClick={() => handleSnippetLanguageChange(language)}
                    role="tab"
                    type="button"
                  >
                    {SNIPPET_LANGUAGE_LABELS[language]}
                  </button>
                ))}
              </div>

              <div className="snippet-columns">
                <section className="snippet-column">
                  <div className="snippet-column__header">
                    <h4>Built in</h4>
                    <span className="pane__meta">{activeDefaultSnippets.length}</span>
                  </div>
                  <div className="snippet-list">
                    {activeDefaultSnippets.map((snippet: any) => (
                      <article className="snippet-card" key={snippet.prefix}>
                        <div className="snippet-card__top">
                          <strong>{snippet.prefix}</strong>
                          <span className="snippet-card__detail">{snippet.description}</span>
                        </div>
                        <code className="snippet-card__body">{snippet.body}</code>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="snippet-column">
                  <div className="snippet-column__header">
                    <h4>Custom</h4>
                    <span className="pane__meta">{activeCustomSnippets.length}</span>
                  </div>
                  {activeCustomSnippets.length > 0 ? (
                    <div className="snippet-list">
                      {activeCustomSnippets.map((snippet: any) => (
                        <article className="snippet-card" key={snippet.prefix}>
                          <div className="snippet-card__top">
                            <strong>{snippet.prefix}</strong>
                            <button
                              className="snippet-card__remove"
                              onClick={() => handleRemoveCustomSnippet(snippet.prefix)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                          <code className="snippet-card__body">{snippet.body}</code>
                          {snippet.description ? (
                            <span className="snippet-card__detail">{snippet.description}</span>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="snippet-empty">
                      Import your own {activeSnippetLanguageLabel} snippets to extend
                      autocomplete.
                    </div>
                  )}
                  <DocumentStatsPanel stats={documentStats} />
                </section>
              </div>

              <section className="snippet-import-card">
                <div className="snippet-import-card__copy">
                  <h4>Import snippets</h4>
                  <p>
                    Paste JSON here or upload a file for {activeSnippetLanguageLabel}. Accepted
                    shapes include a <code>snippets</code> array or a simple object map of{" "}
                    <code>prefix</code> to snippet body.
                  </p>
                </div>
                <textarea
                  className="snippet-import-card__textarea"
                  onChange={handleSnippetImportTextChange}
                  placeholder={JSON.stringify(
                    getSnippetImportTemplate(activeSnippetLanguage),
                    null,
                    2
                  )}
                  value={snippetImportText}
                />
                <div className="snippet-import-card__actions">
                  <button
                    className="pane__button"
                    onClick={() => snippetImportInputRef.current?.click()}
                    type="button"
                  >
                    Import JSON
                  </button>
                  <button
                    className="pane__button"
                    onClick={handleImportPastedSnippets}
                    type="button"
                  >
                    Import pasted JSON
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={handleDownloadSnippetTemplate}
                    type="button"
                  >
                    Download template
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={handleDownloadCustomSnippets}
                    type="button"
                  >
                    Download current
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={handleClearCustomSnippets}
                    type="button"
                  >
                    Clear custom
                  </button>
                </div>
                {snippetImportFeedback.text ? (
                  <div
                    className={`sync-feedback snippet-import-card__feedback ${
                      snippetImportFeedback.tone === "success"
                        ? "sync-feedback--success"
                        : snippetImportFeedback.tone === "error"
                          ? "sync-feedback--error"
                          : ""
                    }`}
                  >
                    <span>{snippetImportFeedback.text}</span>
                  </div>
                ) : null}
                </section>
              </section>
            </div>
          </div>
        ) : settingsTab === "packages" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Packages</h3>
                <span className="pane__meta">
                  {packageSettingsScope === "typst"
                    ? `${packageCacheEntries.length} installed · ${formatByteSize(packageCacheTotalBytes)}`
                    : `${detectedLatexPackages.length} detected · ${
                        latexPackageBundleEntries.filter((entry: any) => entry.cached).length
                      } bundles ready`}
                </span>
              </div>

              <div className="package-scope-tabs" role="tablist" aria-label="Package type">
                <button
                  aria-selected={packageSettingsScope === "typst"}
                  className={`package-scope-tab ${
                    packageSettingsScope === "typst" ? "package-scope-tab--active" : ""
                  }`}
                  onClick={() => setPackageSettingsScope("typst")}
                  role="tab"
                  type="button"
                >
                  Typst
                </button>
                <button
                  aria-selected={packageSettingsScope === "latex"}
                  className={`package-scope-tab ${
                    packageSettingsScope === "latex" ? "package-scope-tab--active" : ""
                  }`}
                  onClick={() => setPackageSettingsScope("latex")}
                  role="tab"
                  type="button"
                >
                  LaTeX
                </button>
              </div>

              {packageSettingsScope === "typst" ? (
                <>
                  <section className="package-cache-card">
                <div className="package-cache-card__copy">
                  <h4>Add from Universe</h4>
                  <p>
                    Search Typst Universe for packages while online, then download them now so
                    they stay available offline later.
                  </p>
                </div>
                <div className="package-search-field">
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="package-search-input"
                    disabled={!isOnline}
                    onChange={(event) => setPackageSearchQuery(event.target.value)}
                    placeholder={
                      isOnline
                        ? "Search Universe packages like cetz or oxifmt"
                        : "Go online to search Typst Universe"
                    }
                    type="search"
                    value={packageSearchQuery}
                  />
                  {packageSearchQuery ? (
                    <button
                      aria-label="Clear package search"
                      className="package-search-clear"
                      onClick={() => setPackageSearchQuery("")}
                      type="button"
                    >
                      <span aria-hidden="true" className="package-search-clear__icon" />
                    </button>
                  ) : null}
                </div>
                {!isOnline ? (
                  <div className="snippet-empty">
                    Universe search is only available while you are online.
                  </div>
                ) : isPackageSearchLoading ? (
                  <div className="snippet-empty">Searching Typst Universe...</div>
                ) : filteredRepositoryPackages.length > 0 ? (
                  <div className="package-repository-list" role="list">
                    {visibleRepositoryPackages.map((entry: any) => (
                      <article className="package-cache-row" key={entry.name} role="listitem">
                        <div className="package-cache-row__main">
                          <strong>
                            <a
                              className="package-cache-row__link"
                              href={`https://typst.app/universe/package/${entry.name}/`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              @{entry.namespace}/{entry.name}
                            </a>
                          </strong>
                          <span>
                            v{entry.version}
                            {entry.description ? ` · ${entry.description}` : ""}
                          </span>
                        </div>
                        <button
                          className="pane__button"
                          disabled={
                            !isOnline ||
                            installingPackageName === entry.name ||
                            installedPackageKeys.has(`${entry.namespace}/${entry.name}:${entry.version}`)
                          }
                          onClick={() => {
                            void handleInstallTypstPackage(entry);
                          }}
                          type="button"
                        >
                          {installingPackageName === entry.name
                            ? "Installing..."
                            : installedPackageKeys.has(
                                  `${entry.namespace}/${entry.name}:${entry.version}`
                                )
                              ? "Installed"
                              : "Install"}
                        </button>
                      </article>
                    ))}
                    {filteredRepositoryPackages.length > visibleRepositoryPackages.length ? (
                      <button
                        className="pane__button pane__button--quiet package-repository-list__more"
                        onClick={() =>
                          setPackageSearchVisibleCount((currentCount: number) => currentCount + 5)
                        }
                        type="button"
                      >
                        Show more...
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="snippet-empty">
                    {packageSearchQuery.trim()
                      ? "No matching packages found on Typst Universe."
                      : "Start typing to search Typst Universe packages."}
                  </div>
                )}
              </section>

              <section className="package-cache-card">
                <div className="package-cache-card__copy">
                  <h4>Offline package storage</h4>
                  <p>
                    Cached Typst packages stay available offline and are reused until you
                    remove them here.
                  </p>
                </div>
                <div className="package-cache-card__actions">
                  <button
                    className="pane__button"
                    onClick={() => {
                      void refreshTypstPackageCache();
                    }}
                    type="button"
                  >
                    {isPackageCacheLoading ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    disabled={packageCacheEntries.length === 0 || isPackageCacheClearing}
                    onClick={() => {
                      void handleClearTypstPackages();
                    }}
                    type="button"
                  >
                    {isPackageCacheClearing ? "Clearing..." : "Clear cache"}
                  </button>
                </div>
                {packageCacheFeedback.text ? (
                  <div
                    className={`sync-feedback package-cache-card__feedback ${
                      packageCacheFeedback.tone === "success"
                        ? "sync-feedback--success"
                        : packageCacheFeedback.tone === "error"
                          ? "sync-feedback--error"
                          : ""
                    }`}
                  >
                    <span>{packageCacheFeedback.text}</span>
                  </div>
                ) : null}
              </section>

              {isPackageCacheLoading && packageCacheEntries.length === 0 ? (
                <div className="snippet-empty">Loading cached packages...</div>
              ) : packageCacheEntries.length > 0 ? (
                <div className="package-cache-list" role="list">
                  {packageCacheEntries.map((entry: any) => (
                    <article className="package-cache-row" key={entry.reference.key} role="listitem">
                      <div className="package-cache-row__main">
                        <strong>{entry.reference.key}</strong>
                        <span>{formatByteSize(entry.sizeBytes)}</span>
                      </div>
                      <button
                        className="pane__button pane__button--quiet"
                        onClick={() => {
                          void handleRemoveTypstPackage(entry);
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="snippet-empty">
                  No Typst packages are cached yet. Import a package in a document to install
                  it here.
                </div>
              )}
                </>
              ) : (
                <>
                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Manual download</h4>
                      <p>
                        Search LaTeX package names from the local BusyTeX catalog, then cache the
                        TeX Live bundle that contains them.
                      </p>
                    </div>
                    <div className="package-search-field">
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="package-search-input"
                        onChange={(event) => setLatexPackageSearchQuery(event.target.value)}
                        placeholder="Search LaTeX packages like amsmath or tikz"
                        type="search"
                        value={latexPackageSearchQuery}
                      />
                      {latexPackageSearchQuery ? (
                        <button
                          aria-label="Clear package search"
                          className="package-search-clear"
                          onClick={() => setLatexPackageSearchQuery("")}
                          type="button"
                        >
                          <span aria-hidden="true" className="package-search-clear__icon" />
                        </button>
                      ) : null}
                    </div>
                    {isLatexPackageCacheLoading && !latexPackageCatalog ? (
                      <div className="snippet-empty">Loading LaTeX package catalog...</div>
                    ) : latexPackageSearchResults.length > 0 ? (
                      <div className="package-repository-list" role="list">
                        {latexPackageSearchResults.map((entry: any) =>
                          renderLatexPackageResolutionRow(entry, `search-${entry.name}`)
                        )}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        {latexPackageSearchQuery.trim()
                          ? "No matching LaTeX packages found in the bundled catalog."
                          : "Start typing to find the bundle for a LaTeX package."}
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Used in project</h4>
                      <p>
                        Packages from LaTeX source files appear here automatically. Uncached
                        entries can be downloaded from their row.
                      </p>
                    </div>
                    {detectedLatexPackages.length > 0 ? (
                      <div className="package-cache-list" role="list">
                        {uncachedDetectedLatexPackages.map((entry: any) =>
                          renderLatexPackageResolutionRow(entry, `detected-missing-${entry.name}`)
                        )}
                        {detectedLatexPackages
                          .filter(
                            (entry: any) =>
                              !uncachedDetectedLatexPackages.some(
                                (missingEntry: any) => missingEntry.name === entry.name
                              )
                          )
                          .map((entry: any) =>
                            renderLatexPackageResolutionRow(entry, `detected-cached-${entry.name}`)
                          )}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        No LaTeX packages have been detected in this project yet.
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Manual extra packages</h4>
                      <p>Extra packages cached from search.</p>
                    </div>
                    {manualExtraLatexPackages.length > 0 ? (
                      <div className="package-cache-list" role="list">
                        {manualExtraLatexPackages.map((entry: any) => (
                          <article className="package-cache-row" key={entry.name} role="listitem">
                            <div className="package-cache-row__main">
                              <strong>{entry.name}</strong>
                              <span>{formatLatexPackageBundleLabel("texlive-extra")}</span>
                            </div>
                            <button
                              className="pane__button pane__button--quiet"
                              onClick={() => handleRemoveCachedLatexPackage(entry.name)}
                              type="button"
                            >
                              Remove
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        No manually cached extra packages.
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>TeX Live bundle storage</h4>
                      <p>
                        BusyTeX downloads LaTeX packages as grouped TeX Live data bundles. Basic
                        is loaded by default; Recommended and Extra can be cached manually.
                      </p>
                    </div>
                    <div className="package-cache-card__actions">
                      <button
                        className="pane__button"
                        onClick={() => {
                          void refreshLatexPackageCache();
                        }}
                        type="button"
                      >
                        {isLatexPackageCacheLoading ? "Refreshing..." : "Refresh"}
                      </button>
                      <button
                        className="pane__button pane__button--quiet"
                        disabled={
                          isLatexPackageCacheClearing ||
                          latexPackageBundleEntries.every((entry: any) => entry.defaultLoaded || !entry.cached)
                        }
                        onClick={() => {
                          void handleClearLatexBundles();
                        }}
                        type="button"
                      >
                        {isLatexPackageCacheClearing ? "Clearing..." : "Clear cache"}
                      </button>
                    </div>
                    {latexPackageFeedback.text ? (
                      <div
                        className={`sync-feedback package-cache-card__feedback ${
                          latexPackageFeedback.tone === "success"
                            ? "sync-feedback--success"
                            : latexPackageFeedback.tone === "error"
                              ? "sync-feedback--error"
                              : ""
                        }`}
                      >
                        <span>{latexPackageFeedback.text}</span>
                      </div>
                    ) : null}
                    {isLatexPackageCacheLoading && latexPackageBundleEntries.length === 0 ? (
                      <div className="snippet-empty">Loading LaTeX package bundles...</div>
                    ) : (
                      <div className="package-cache-list" role="list">
                        {latexPackageBundleEntries.map((entry: any) => (
                          <article className="package-cache-row" key={entry.id} role="listitem">
                            <div className="package-cache-row__main">
                              <strong>{entry.label}</strong>
                              <span>
                                {entry.packageCount.toLocaleString()} packages ·{" "}
                                {entry.sizeBytes > 0
                                  ? formatByteSize(entry.sizeBytes)
                                  : "size unavailable"}{" "}
                                ·{" "}
                                {entry.defaultLoaded
                                  ? "Loaded by default"
                                  : entry.cached
                                    ? "Cached"
                                    : "Not cached"}
                              </span>
                            </div>
                            {entry.defaultLoaded ? (
                              <span className="package-cache-row__badge">Default</span>
                            ) : entry.cached ? (
                              <button
                                className="pane__button pane__button--quiet"
                                disabled={installingLatexBundleId === entry.id}
                                onClick={() => {
                                  void handleRemoveLatexBundle(entry.id);
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                className="pane__button"
                                disabled={installingLatexBundleId === entry.id}
                                onClick={() => {
                                  void handleCacheLatexBundle(entry.id);
                                }}
                                type="button"
                              >
                                {installingLatexBundleId === entry.id ? "Caching..." : "Cache"}
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        ) : null}
    </>
  );
}

interface CompanionSettingsCardProps {
  baseUrl: string;
  connection: CompanionConnectionStatus;
  onApply: (baseUrl: string) => void;
  onReset: () => void;
}

function CompanionSettingsCard({
  baseUrl,
  connection,
  onApply,
  onReset
}: CompanionSettingsCardProps) {
  const [draft, setDraft] = useState(baseUrl);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(baseUrl);
    setValidationMessage(null);
  }, [baseUrl]);

  const connectionMessage = connection.state === "available"
    ? `Connected · ${connection.status?.capabilities.compile.engines.join(", ") || "no native engines"}`
    : connection.state === "checking"
      ? "Checking connection…"
      : connection.state === "incompatible"
        ? connection.message ?? "The Companion protocol is incompatible."
        : `BusyTeX is active${connection.message ? ` · ${connection.message}` : ""}`;

  return (
    <div className="settings-toggle settings-toggle--stacked companion-settings">
      <span>
        <strong>Typr Companion</strong>
        <small aria-live="polite" role="status">{connectionMessage}</small>
      </span>
      <form
        className="companion-settings__form"
        onSubmit={(event) => {
          event.preventDefault();
          const validation = validateCompanionBaseUrl(draft);
          if (!validation.ok) {
            setValidationMessage(validation.message);
            return;
          }
          setValidationMessage(null);
          onApply(validation.value);
        }}
      >
        <label htmlFor="companion-base-url">Companion URL</label>
        <div className="companion-settings__controls">
          <input
            aria-describedby="companion-base-url-help"
            id="companion-base-url"
            inputMode="url"
            onChange={(event) => {
              setDraft(event.target.value);
              setValidationMessage(null);
            }}
            spellCheck={false}
            type="url"
            value={draft}
          />
          <button className="pane__button" type="submit">Apply</button>
          <button
            className="pane__button pane__button--quiet"
            disabled={baseUrl === normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL)}
            onClick={() => {
              setValidationMessage(null);
              onReset();
            }}
            type="button"
          >
            Reset
          </button>
        </div>
        <small id="companion-base-url-help">
          Keep the loopback default for Docker on this device. A Companion on Unraid or another
          host requires an HTTPS reverse-proxy URL that is reachable from this browser.
        </small>
        {validationMessage ? (
          <small className="companion-settings__error" role="alert">
            {validationMessage}
          </small>
        ) : null}
      </form>
    </div>
  );
}
