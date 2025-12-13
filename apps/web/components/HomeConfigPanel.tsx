"use client";

import { BUILT_IN_THEMES, DEFAULT_UI_CONFIG, type ThemePreset } from "@/lib/uiConfig";
import React from "react";
import type { TempSourceKey, UiConfigV2 } from "@/lib/uiConfig";

type TempOption = { key: TempSourceKey; label: string };

function Field({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field">
      <div>
        <div className="settings-label">{label}</div>
        {description ? <div className="settings-desc">{description}</div> : null}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

export function HomeConfigPanel({
  open,
  config,
  availableTempSources,
  onSave,
  onClose
}: {
  open: boolean;
  config: UiConfigV2;
  availableTempSources: TempOption[];
  onSave: (cfg: UiConfigV2) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<UiConfigV2>(config);
  const [selectedTheme, setSelectedTheme] = React.useState<string>(config.appearance.themeId ?? "");

  React.useEffect(() => {
    if (open) {
      setDraft(config);
      setSelectedTheme(config.appearance.themeId ?? "");
    }
  }, [open, config]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const setAppearance = (patch: Partial<UiConfigV2["appearance"]>) =>
    setDraft((d) => ({ ...d, appearance: { ...d.appearance, ...patch } }));
  const setHome = (patch: Partial<UiConfigV2["home"]>) => setDraft((d) => ({ ...d, home: { ...d.home, ...patch } }));
  const setData = (patch: Partial<UiConfigV2["data"]>) => setDraft((d) => ({ ...d, data: { ...d.data, ...patch } }));
  const setTempCard = (id: string, patch: Partial<UiConfigV2["temps"]["cards"][number]>) =>
    setDraft((d) => ({
      ...d,
      temps: {
        ...d.temps,
        cards: d.temps.cards.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }
    }));

  const addTempCard = () => {
    setDraft((d) => {
      if (d.temps.cards.length >= 8) return d;
      const base: UiConfigV2["temps"]["cards"][number] = {
        id: `t${Date.now()}`,
        enabled: true,
        label: `Temp ${d.temps.cards.length + 1}`,
        sourceKey: (availableTempSources[0]?.key ?? "cpuTempC") as TempSourceKey
      };
      return { ...d, temps: { ...d.temps, cards: [...d.temps.cards, base] } };
    });
  };

  const removeTempCard = (id: string) => {
    setDraft((d) => ({ ...d, temps: { ...d.temps, cards: d.temps.cards.filter((c) => c.id !== id) } }));
  };

  const allThemes: ThemePreset[] = React.useMemo(
    () => [...BUILT_IN_THEMES, ...(draft.appearance.customThemes ?? [])],
    [draft.appearance.customThemes]
  );

  const applyTheme = (id: string) => {
    const theme = allThemes.find((t) => t.id === id);
    if (!theme) return;
    setDraft((d) => ({
      ...d,
      appearance: {
        ...d.appearance,
        accent: theme.accent,
        accent2: theme.accent2,
        backgroundGlow: theme.backgroundGlow ?? d.appearance.backgroundGlow,
        compact: theme.compact ?? d.appearance.compact,
        themeId: theme.id
      }
    }));
    setSelectedTheme(id);
  };

  const saveCurrentAsTheme = () => {
    const name = window.prompt("Name this theme", "My Theme");
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const newTheme: ThemePreset = {
      id,
      name: name.slice(0, 40),
      accent: draft.appearance.accent,
      accent2: draft.appearance.accent2,
      backgroundGlow: draft.appearance.backgroundGlow,
      compact: draft.appearance.compact
    };
    setDraft((d) => ({
      ...d,
      appearance: {
        ...d.appearance,
        customThemes: [...(d.appearance.customThemes ?? [])].concat(newTheme).slice(-8),
        themeId: id
      }
    }));
    setSelectedTheme(id);
  };

  const handleAccentChange = (val: string, key: "accent" | "accent2") => {
    setDraft((d) => ({
      ...d,
      appearance: {
        ...d.appearance,
        [key]: val,
        themeId: ""
      }
    }));
    setSelectedTheme("");
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard settings"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="document">
        <div className="title-row" style={{ marginBottom: 10 }}>
          <div>
            <div className="badge">Settings</div>
            <div className="stat-value" style={{ fontSize: 20, marginTop: 10 }}>
              Home Panel
            </div>
            <div className="stat-label">Customize what shows up and how it looks (saved in this browser).</div>
          </div>
          <button className="button button-muted" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-grid">
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>
            <Field label="Theme">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", width: "100%" }}>
                <select
                  value={selectedTheme}
                  onChange={(e) => applyTheme(e.target.value)}
                  aria-label="Theme preset"
                  style={{ minWidth: 180, flex: "1 1 160px", maxWidth: 260 }}
                >
                  <option value="">Custom</option>
                  {allThemes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="button button-muted" onClick={saveCurrentAsTheme} style={{ padding: "10px 12px", flex: "0 0 auto" }}>
                  Save current as theme
                </button>
              </div>
            </Field>
            <Field label="Accent color">
              <input
                type="color"
                value={draft.appearance.accent}
                onChange={(e) => handleAccentChange(e.target.value, "accent")}
                aria-label="Accent color"
              />
            </Field>
            <Field label="Accent 2 color">
              <input
                type="color"
                value={draft.appearance.accent2}
                onChange={(e) => handleAccentChange(e.target.value, "accent2")}
                aria-label="Secondary accent color"
              />
            </Field>
            <Field label="Background glow" description="Toggle the radial glow behind the UI.">
              <input
                type="checkbox"
                checked={draft.appearance.backgroundGlow}
                onChange={(e) => setAppearance({ backgroundGlow: e.target.checked, themeId: "" })}
              />
            </Field>
            <Field label="Compact mode" description="Tighter spacing, smaller cards.">
              <input
                type="checkbox"
                checked={draft.appearance.compact}
                onChange={(e) => setAppearance({ compact: e.target.checked, themeId: "" })}
              />
            </Field>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Display</div>
            <Field label="Device picker card">
              <input
                type="checkbox"
                checked={draft.home.showDevicePicker}
                onChange={(e) => setHome({ showDevicePicker: e.target.checked })}
              />
            </Field>
            <Field label="Stats row (CPU/Mem/Disk)">
              <input type="checkbox" checked={draft.home.showStats} onChange={(e) => setHome({ showStats: e.target.checked })} />
            </Field>
            <Field label="Temps row" description="CPU/GPU temps + temp source.">
              <input type="checkbox" checked={draft.home.showTemps} onChange={(e) => setHome({ showTemps: e.target.checked })} />
            </Field>
            <Field label="Network panel">
              <input
                type="checkbox"
                checked={draft.home.showNetworkPanel}
                onChange={(e) => setHome({ showNetworkPanel: e.target.checked })}
              />
            </Field>
            <Field label="Metrics table">
              <input
                type="checkbox"
                checked={draft.home.showMetricsTable}
                onChange={(e) => setHome({ showMetricsTable: e.target.checked })}
              />
            </Field>
            <Field label="Processes card">
              <input
                type="checkbox"
                checked={draft.home.showProcessesCard}
                onChange={(e) => setHome({ showProcessesCard: e.target.checked })}
              />
            </Field>
            <Field label="Devices list">
              <input
                type="checkbox"
                checked={draft.home.showDevicesList}
                onChange={(e) => setHome({ showDevicesList: e.target.checked })}
              />
            </Field>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Data</div>
            <Field label="Polling fallback (ms)" description="Used only when SSE is disconnected.">
              <input
                type="number"
                min={1000}
                max={60000}
                step={500}
                value={draft.data.metricPollMs}
                onChange={(e) => setData({ metricPollMs: parseInt(e.target.value || "0", 10) || DEFAULT_UI_CONFIG.data.metricPollMs })}
              />
            </Field>
            <Field label="Device refresh (ms)" description="How often the device list refreshes.">
              <input
                type="number"
                min={2000}
                max={60000}
                step={500}
                value={draft.data.deviceRefreshMs}
                onChange={(e) => setData({ deviceRefreshMs: parseInt(e.target.value || "0", 10) || DEFAULT_UI_CONFIG.data.deviceRefreshMs })}
              />
            </Field>
            <Field label="Sample history" description="How many SSE samples to keep in memory.">
              <input
                type="number"
                min={20}
                max={2000}
                step={10}
                value={draft.data.sampleHistory}
                onChange={(e) => setData({ sampleHistory: parseInt(e.target.value || "0", 10) || DEFAULT_UI_CONFIG.data.sampleHistory })}
              />
            </Field>
            <Field label="Log download minutes" description={'Used by the "Last Xm Log" button.'}>
              <input
                type="number"
                min={1}
                max={720}
                step={1}
                value={draft.data.logMinutes}
                onChange={(e) => setData({ logMinutes: parseInt(e.target.value || "0", 10) || DEFAULT_UI_CONFIG.data.logMinutes })}
              />
            </Field>
          </div>

          <div className="settings-section settings-section--full">
            <div className="settings-section-title">Temperature Cards</div>
            <div className="settings-desc" style={{ marginBottom: 10 }}>
              Sources are detected from the latest heartbeat (built-in temps + all sensor names).
            </div>
            {draft.temps.cards.map((c) => (
              <div key={c.id} className="temp-card-row">
                <div className="temp-card-left">
                    <input type="checkbox" checked={c.enabled} onChange={(e) => setTempCard(c.id, { enabled: e.target.checked })} />
                    <input
                      type="text"
                      value={c.label}
                      onChange={(e) => setTempCard(c.id, { label: e.target.value })}
                      aria-label={`Temp card label ${c.id}`}
                      className="temp-card-label"
                    />
                </div>
                <div className="temp-card-right">
                    <select
                      value={c.sourceKey}
                      onChange={(e) => setTempCard(c.id, { sourceKey: e.target.value as TempSourceKey })}
                      aria-label={`Temp source ${c.id}`}
                      className="temp-card-source"
                    >
                      {availableTempSources.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button className="button button-muted" onClick={() => removeTempCard(c.id)}>
                      Remove
                    </button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button button-muted" onClick={addTempCard}>
                Add Temp Card
              </button>
            </div>
          </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="stat-label">Changes apply only after Save.</div>
          <div className="modal-footer-actions">
            <button className="button button-muted" onClick={() => setDraft(DEFAULT_UI_CONFIG)} aria-label="Reset settings">
              Reset defaults
            </button>
            <button
              className="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              aria-label="Save settings"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
