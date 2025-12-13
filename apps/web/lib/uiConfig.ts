export type TempSourceKey =
  | "cpuTempC"
  | "gpuTempC"
  | "gpuMemoryTempC"
  | "boardTempC"
  | "cpuTempMaxC"
  | "gpuHotspotTempC"
  | `temps:${string}`;

export type UiConfigV2 = {
  version: 2;
  appearance: {
    accent: string;
    accent2: string;
    backgroundGlow: boolean;
    compact: boolean;
    themeId?: string | null;
    customThemes?: ThemePreset[];
  };
  home: {
    showDevicePicker: boolean;
    showStats: boolean;
    showTemps: boolean;
    showNetworkPanel: boolean;
    showMetricsTable: boolean;
    showProcessesCard: boolean;
    showDevicesList: boolean;
  };
  temps: {
    cards: Array<{
      id: string;
      enabled: boolean;
      label: string;
      sourceKey: TempSourceKey;
    }>;
  };
  data: {
    metricPollMs: number;
    deviceRefreshMs: number;
    sampleHistory: number;
    logMinutes: number;
  };
};

export type UiConfigV1 = Omit<UiConfigV2, "version" | "temps"> & { version: 1 };
export type UiConfig = UiConfigV2;

export type ThemePreset = {
  id: string;
  name: string;
  accent: string;
  accent2: string;
  backgroundGlow?: boolean;
  compact?: boolean;
};

export const BUILT_IN_THEMES: ThemePreset[] = [
  { id: "emerald-teal", name: "Emerald / Teal", accent: "#10b981", accent2: "#22d3ee", backgroundGlow: true },
  { id: "amber-violet", name: "Amber / Violet", accent: "#f59e0b", accent2: "#6366f1", backgroundGlow: true },
  { id: "rose-cyan", name: "Rose / Cyan", accent: "#f43f5e", accent2: "#06b6d4", backgroundGlow: false },
  { id: "lime-slate", name: "Lime / Slate", accent: "#a3e635", accent2: "#0ea5e9", backgroundGlow: false, compact: true }
];

export const DEFAULT_UI_CONFIG: UiConfigV2 = {
  version: 2,
  appearance: {
    accent: "#10b981",
    accent2: "#22d3ee",
    backgroundGlow: true,
    compact: false,
    themeId: "emerald-teal",
    customThemes: []
  },
  home: {
    showDevicePicker: true,
    showStats: true,
    showTemps: true,
    showNetworkPanel: true,
    showMetricsTable: true,
    showProcessesCard: true,
    showDevicesList: true
  },
  temps: {
    cards: [
      { id: "cpu", enabled: true, label: "CPU Temp", sourceKey: "cpuTempC" },
      { id: "gpu", enabled: true, label: "GPU Temp", sourceKey: "gpuTempC" },
      { id: "board", enabled: false, label: "Board Temp", sourceKey: "boardTempC" }
    ]
  },
  data: {
    metricPollMs: 5000,
    deviceRefreshMs: 15000,
    sampleHistory: 120,
    logMinutes: 10
  }
};

const STORAGE_KEY = "pulseboard.uiConfig";
const STORAGE_KEY_V1 = "pulseboard.uiConfig.v1";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{6})$/.test(v);
}

function cleanThemePreset(raw: any): ThemePreset | null {
  if (!raw || typeof raw !== "object") return null;
  if (!isHexColor(raw.accent) || !isHexColor(raw.accent2)) return null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 40) : "";
  const name = typeof raw.name === "string" ? raw.name.slice(0, 40) : "";
  if (!id || !name) return null;
  const out: ThemePreset = { id, name, accent: raw.accent, accent2: raw.accent2 };
  if (typeof raw.backgroundGlow === "boolean") out.backgroundGlow = raw.backgroundGlow;
  if (typeof raw.compact === "boolean") out.compact = raw.compact;
  return out;
}

function normalize(raw: any): UiConfigV2 {
  const out: UiConfigV2 = structuredClone(DEFAULT_UI_CONFIG);
  if (!raw || typeof raw !== "object") return out;

  const ap = raw.appearance ?? {};
  if (isHexColor(ap.accent)) out.appearance.accent = ap.accent;
  if (isHexColor(ap.accent2)) out.appearance.accent2 = ap.accent2;
  if (typeof ap.backgroundGlow === "boolean") out.appearance.backgroundGlow = ap.backgroundGlow;
  if (typeof ap.compact === "boolean") out.appearance.compact = ap.compact;
  if (typeof ap.themeId === "string") out.appearance.themeId = ap.themeId.slice(0, 60);
  if (Array.isArray(ap.customThemes)) {
    const cleaned: ThemePreset[] = [];
    for (const t of ap.customThemes) {
      const c = cleanThemePreset(t);
      if (c) cleaned.push(c);
      if (cleaned.length >= 8) break;
    }
    out.appearance.customThemes = cleaned;
  }

  const home = raw.home ?? {};
  for (const k of Object.keys(out.home) as Array<keyof UiConfigV2["home"]>) {
    if (typeof home[k] === "boolean") (out.home[k] as boolean) = home[k];
  }

  const temps = raw.temps ?? null;
  if (temps && typeof temps === "object" && Array.isArray(temps.cards)) {
    const cleaned: UiConfigV2["temps"]["cards"] = [];
    for (const c of temps.cards) {
      if (!c || typeof c !== "object") continue;
      const id = typeof c.id === "string" ? c.id.slice(0, 40) : "";
      const label = typeof c.label === "string" ? c.label.slice(0, 40) : "";
      const enabled = typeof c.enabled === "boolean" ? c.enabled : true;
      const sourceKey = typeof c.sourceKey === "string" ? (c.sourceKey as TempSourceKey) : null;
      if (!id || !label || !sourceKey) continue;
      cleaned.push({ id, label, enabled, sourceKey });
      if (cleaned.length >= 8) break;
    }
    if (cleaned.length) out.temps.cards = cleaned;
  } else if (raw.version === 1) {
    // v1 -> v2 migration: keep default temp cards
    out.temps = structuredClone(DEFAULT_UI_CONFIG.temps);
  }

  const data = raw.data ?? {};
  if (typeof data.metricPollMs === "number") out.data.metricPollMs = clamp(data.metricPollMs, 1000, 60000);
  if (typeof data.deviceRefreshMs === "number") out.data.deviceRefreshMs = clamp(data.deviceRefreshMs, 2000, 60000);
  if (typeof data.sampleHistory === "number") out.data.sampleHistory = clamp(data.sampleHistory, 20, 2000);
  if (typeof data.logMinutes === "number") out.data.logMinutes = clamp(data.logMinutes, 1, 720);

  return out;
}

export function loadUiConfig(): UiConfigV2 {
  if (typeof window === "undefined") return DEFAULT_UI_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return DEFAULT_UI_CONFIG;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_UI_CONFIG;
  }
}

export function saveUiConfig(cfg: UiConfigV2) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function applyUiConfig(cfg: UiConfigV2) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--accent", cfg.appearance.accent);
  root.style.setProperty("--accent-2", cfg.appearance.accent2);
  document.body.classList.toggle("bg-glow-off", !cfg.appearance.backgroundGlow);
  document.body.classList.toggle("compact", cfg.appearance.compact);
}
