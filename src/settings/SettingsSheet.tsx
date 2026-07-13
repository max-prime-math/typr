import type { ReactNode } from "react";
import { SETTINGS_TABS, getSettingsTabTitle, type SettingsTab } from "./settingsSheetState";
import type { SettingsSheetController } from "./useSettingsSheetController";

export function SettingsSheet(props: {
  children: ReactNode;
  controller: SettingsSheetController;
  embedded: boolean;
  onClose: (embedded: boolean) => void;
}) {
  const { controller, embedded } = props;
  const renderSearch = () => (
    <div className="modal-search-field settings-search-field">
      <input
        aria-label="Search settings"
        onChange={(event) => controller.setSearchQuery(event.target.value)}
        placeholder="Search settings"
        type="search"
        value={controller.searchQuery}
      />
      {controller.searchQuery ? (
        <button
          aria-label="Clear settings search"
          className="modal-search-field__clear"
          onClick={() => controller.setSearchQuery("")}
          type="button"
        >
          <span aria-hidden="true" className="package-search-clear__icon" />
        </button>
      ) : null}
    </div>
  );

  return (
    <section
      aria-label="Typr settings"
      className={`settings-sheet ${embedded ? "settings-sheet--embedded" : ""} ${controller.isMobileNavOpen ? "settings-sheet--mobile-nav-open" : ""}`}
      onClick={embedded ? undefined : (event) => event.stopPropagation()}
    >
      <div className="modal-control-header settings-sheet__header">
        <div className="settings-sheet__header-main">
          <h2>Settings</h2>
          {renderSearch()}
        </div>
        <div className="settings-sheet__header-actions">
          <button
            className="modal-close-button pane__button"
            onClick={() => {
              controller.saveCurrentScrollPosition();
              controller.setIsMobileNavOpen(false);
              props.onClose(embedded);
            }}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <button
        aria-expanded={controller.isMobileNavOpen}
        className="settings-sheet__mobile-nav-toggle"
        onClick={() => controller.setIsMobileNavOpen((current) => !current)}
        type="button"
      >
        <span>{getSettingsTabTitle(controller.tab)}</span>
        <span aria-hidden="true" className="settings-sheet__mobile-nav-chevron" />
      </button>
      <div className="settings-sheet__mobile-search">{renderSearch()}</div>
      <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
        {SETTINGS_TABS.map((tab) => (
          <button
            aria-selected={controller.tab === tab}
            className={`settings-tab ${controller.tab === tab ? "settings-tab--active" : ""} ${
              controller.searchQuery.trim() && !controller.matchingTabs.includes(tab)
                ? "settings-tab--muted"
                : ""
            }`}
            key={tab}
            onClick={() => controller.handleTabSelect(tab as SettingsTab)}
            role="tab"
            type="button"
          >
            {getSettingsTabTitle(tab)}
          </button>
        ))}
      </div>
      <div
        className="settings-sheet__body"
        onScroll={controller.handleBodyScroll}
        ref={controller.bodyRef}
      >
        {controller.searchQuery.trim() && controller.matchingTabs.length === 0 ? (
          <div className="settings-search-empty">No matching settings.</div>
        ) : null}
        {props.children}
      </div>
    </section>
  );
}
