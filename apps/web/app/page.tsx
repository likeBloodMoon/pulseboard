"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HomeConfigPanel } from "@/components/HomeConfigPanel";
import { MetricsTable } from "@/components/MetricsTable";
import { NetworkPanelContainer } from "@/components/NetworkPanelContainer";
import { StatCard } from "@/components/StatCard";
import { normalizeMemory } from "@/lib/metrics";
import type { MetricSample } from "@/lib/store";
import { applyUiConfig, DEFAULT_UI_CONFIG, loadUiConfig, saveUiConfig, type TempSourceKey, type UiConfigV2 } from "@/lib/uiConfig";

type Snapshot = {
  cpu: number;
  memPercent: number;
  memUsedGB?: number;
  memTotalGB?: number;
  diskPercent: number | null;
  processes: number;
  hostname?: string;
  updated?: string;
  cpuTemp?: number | null;
  gpuTemp?: number | null;
  gpuMemoryTemp?: number | null;
  diskLabel?: string | null;
  disks?: Array<{
    id: string;
    label?: string | null;
    sizeGB?: number;
    freeGB?: number;
    usedGB?: number;
    percent?: number;
  }>;
  tempSource?: string | null;
  tempReason?: string | null;
};

type Device = {
  id: string;
  name: string;
  status: "online" | "offline";
  hostname?: string;
  secondsSinceSeen?: number;
};

function computeSnapshot(samples: MetricSample[]): Snapshot | null {
  if (!samples.length) return null;
  const last = samples[samples.length - 1];
  const memStats = normalizeMemory(last.metrics.memUsedGB, last.metrics.memTotalGB);
  const memPercent = memStats.percent ?? 0;
  const diskPercent =
    last.metrics.diskTotalGB && last.metrics.diskUsedGB
      ? (last.metrics.diskUsedGB / Math.max(last.metrics.diskTotalGB, 0.01)) * 100
      : null;

  return {
    cpu: last.metrics.cpuPercent ?? 0,
    memPercent,
    memUsedGB: typeof last.metrics.memUsedGB === "number" ? last.metrics.memUsedGB : undefined,
    memTotalGB: typeof last.metrics.memTotalGB === "number" ? last.metrics.memTotalGB : undefined,
    diskPercent,
    processes: last.metrics.processCount ?? 0,
    hostname: last.hostname,
    updated: last.timestamp,
    diskLabel: (last.metrics as any).diskLabel ?? null,
    disks: (last.metrics as any).disks ?? [],
    cpuTemp: last.metrics.cpuTempC ?? null,
    gpuTemp: last.metrics.gpuTempC ?? null,
    gpuMemoryTemp: (last.metrics as any).gpuMemoryTempC ?? null,
    tempSource: last.metrics.tempSource ?? null,
    tempReason: last.metrics.tempReason ?? null
  };
}

function secToPill(secondsSinceSeen?: number) {
  if (secondsSinceSeen === undefined) return null;
  if (secondsSinceSeen < 30) return { label: "Fresh data", cls: "pill pill-ok" };
  if (secondsSinceSeen < 90) return { label: "Recent data", cls: "pill pill-warn" };
  return { label: "Data stale", cls: "pill pill-bad" };
}

export default function Page() {
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedDisk, setSelectedDisk] = useState<string | null>(null);

  const [uiConfig, setUiConfig] = useState<UiConfigV2>(DEFAULT_UI_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const cfg = loadUiConfig();
    setUiConfig(cfg);
    applyUiConfig(cfg);
  }, []);

  useEffect(() => {
    applyUiConfig(uiConfig);
  }, [uiConfig]);

  const saveConfig = (cfg: UiConfigV2) => {
    setUiConfig(cfg);
    applyUiConfig(cfg);
    saveUiConfig(cfg);
  };

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active) {
          setSamples(data.samples || []);
          setError(null);
        }
      } catch (err: any) {
        if (active) setError(err?.message ?? "Failed to load metrics");
      }
    }

    load();
    const t = setInterval(() => {
      if (!sseConnected) load();
    }, uiConfig.data.metricPollMs);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [sseConnected, uiConfig.data.metricPollMs]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events");
      es.addEventListener("metric", (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as MetricSample;
          setSamples((prev) => [...prev.slice(-uiConfig.data.sampleHistory), payload]);
          setSelectedDeviceId((prev) => prev ?? payload.deviceId);
          setSseConnected(true);
        } catch {
          // ignore
        }
      });
      es.addEventListener("open", () => setSseConnected(true));
      es.addEventListener("error", () => setSseConnected(false));
    } catch {
      // ignore
    }
    return () => {
      if (es) es.close();
    };
  }, [uiConfig.data.sampleHistory]);

  useEffect(() => {
    let active = true;
    const loadDevices = async () => {
      try {
        const res = await fetch("/api/devices", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active) setDevices(data.devices ?? []);
      } catch {
        // ignore
      }
    };
    loadDevices();
    const t = setInterval(loadDevices, uiConfig.data.deviceRefreshMs);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [uiConfig.data.deviceRefreshMs]);

  useEffect(() => {
    if (selectedDeviceId) return;
    if (devices.length > 0) {
      setSelectedDeviceId(devices[0].id);
    } else if (samples.length > 0) {
      setSelectedDeviceId(samples[samples.length - 1].deviceId);
    }
  }, [devices, samples, selectedDeviceId]);

  const filteredSamples = useMemo(
    () => (selectedDeviceId ? samples.filter((s) => s.deviceId === selectedDeviceId) : samples),
    [samples, selectedDeviceId]
  );

  const snapshot = useMemo(() => computeSnapshot(filteredSamples), [filteredSamples]);
  const latestSample = filteredSamples[filteredSamples.length - 1];
  const tempsList: Array<{ name: string; value: number }> = latestSample?.metrics?.temps || [];
  const disks = snapshot?.disks ?? [];

  const availableTempSources = useMemo(() => {
    const opts: Array<{ key: TempSourceKey; label: string }> = [];
    const m = latestSample?.metrics as any;
    if (!m) return opts;

    const add = (key: TempSourceKey, label: string) => {
      if (opts.some((o) => o.key === key)) return;
      opts.push({ key, label });
    };

    add("cpuTempC", "CPU Temp (cpuTempC)");
    add("gpuTempC", "GPU Temp (gpuTempC)");
    add("gpuMemoryTempC", "GPU Memory Temp (gpuMemoryTempC)");
    add("gpuHotspotTempC", "GPU Hotspot Temp (gpuHotspotTempC)");
    add("cpuTempMaxC", "CPU Max Temp (cpuTempMaxC)");
    add("boardTempC", "Board Temp (boardTempC)");

    const sensors: Array<{ name: string; value: number }> = Array.isArray(m.temps) ? m.temps : [];
    for (const s of sensors) {
      if (!s?.name) continue;
      const name = String(s.name);
      add(`temps:${name}`, `Sensor: ${name}`);
    }

    return opts;
  }, [latestSample]);

  useEffect(() => {
    if (!selectedDisk && disks.length > 0) {
      setSelectedDisk(disks[0].id);
    }
  }, [disks, selectedDisk]);

  const selectedDiskId = selectedDisk ?? (disks[0]?.id ?? "C:");
  const selectedDiskObj = disks.find((d) => d.id === selectedDiskId);
  const diskPercentSelected = selectedDiskObj?.percent ?? (snapshot && selectedDiskId === "C:" ? snapshot.diskPercent : null);
  const diskLabel =
    selectedDiskObj?.label ?? (snapshot?.diskLabel ? snapshot.diskLabel : selectedDiskId === "C:" ? "System drive" : undefined);

  const selectedDeviceMeta = selectedDeviceId ? devices.find((d) => d.id === selectedDeviceId) : null;
  const dataPill = secToPill(selectedDeviceMeta?.secondsSinceSeen);

  const cpuStatus = snapshot && snapshot.cpu > 90 ? "bad" : snapshot && snapshot.cpu > 70 ? "warn" : "ok";
  const memStatus = snapshot && snapshot.memPercent > 90 ? "bad" : snapshot && snapshot.memPercent > 75 ? "warn" : "ok";
  const diskStatus =
    diskPercentSelected !== null ? (diskPercentSelected > 90 ? "bad" : diskPercentSelected > 80 ? "warn" : "ok") : "ok";

  const tempStatus = (val?: number | null) => {
    if (val === undefined || val === null) return "warn";
    if (val >= 90) return "bad";
    if (val >= 80) return "warn";
    return "ok";
  };

  const refreshDevices = async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch (err: any) {
      alert(`Refresh failed: ${err?.message ?? err}`);
    }
  };

  const copyAgentConfig = async () => {
    const deviceId = selectedDeviceId ?? "YOUR-DEVICE-ID";
    const token = "YOUR-AGENT-TOKEN";
    const baseUrl = window.location.origin;
    const sample = { baseUrl, deviceId, agentToken: token };
    try {
      await navigator.clipboard.writeText(JSON.stringify(sample, null, 2));
      alert("Agent config copied (fill in your real token if needed).");
    } catch (err: any) {
      alert(`Copy failed: ${err?.message ?? err}`);
    }
  };

  const downloadRecentLog = async () => {
    try {
      const m = uiConfig.data.logMinutes;
      const res = await fetch(`/api/logs/recent?minutes=${m}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-metrics-last-${m}m.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download failed: ${err?.message ?? err}`);
    }
  };

  const enrollCurrent = async () => {
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: snapshot?.hostname || "This Device" })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const applyRes = await fetch("/api/devices/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: data.id, agentToken: data.token, baseUrl: window.location.origin })
      });
      if (!applyRes.ok) throw new Error(`Apply failed: HTTP ${applyRes.status}`);

      setDevices((prev) => [...prev, { id: data.id, name: snapshot?.hostname || "This Device", status: "offline" }]);
    } catch (err: any) {
      alert(`Enroll failed: ${err?.message ?? err}`);
    }
  };

  const pollSeconds = Math.round(uiConfig.data.metricPollMs / 100) / 10;

  return (
    <div className="wrapper">
      <div className="hero">
        <div className="badge">Live Telemetry</div>
        <h1>Pulseboard Device Monitor</h1>
        <p>Live metrics streamed from the Pulseboard PowerShell agent. Point your agent at this server to see updates in real time.</p>
        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="button" href="/history">
            History Dashboard
          </Link>
          <button
            className="button"
            style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }}
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <span className={sseConnected ? "pill pill-ok" : "pill pill-warn"}>{sseConnected ? "Live via SSE" : "Polling fallback"}</span>
          {dataPill ? (
            <span className={dataPill.cls} style={{ marginLeft: 8 }}>
              {dataPill.label}
            </span>
          ) : null}
        </div>
      </div>

      <HomeConfigPanel
        open={settingsOpen}
        config={uiConfig}
        availableTempSources={availableTempSources}
        onSave={saveConfig}
        onClose={() => setSettingsOpen(false)}
      />

      {uiConfig.home.showDevicePicker && devices.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="title-row">
            <div>
              <div className="stat-label">Viewing device</div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {selectedDeviceId ? devices.find((d) => d.id === selectedDeviceId)?.name ?? "Unknown device" : "Select a device"}
              </div>
              {selectedDeviceMeta?.secondsSinceSeen !== undefined ? (
                <div className="stat-label">Last seen {selectedDeviceMeta.secondsSinceSeen}s ago</div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                aria-label="Select device"
                value={selectedDeviceId ?? ""}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                style={{ minWidth: 180 }}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.status === "online" ? "(online)" : "(offline)"}
                  </option>
                ))}
              </select>

              <select aria-label="Select disk to monitor" value={selectedDiskId} onChange={(e) => setSelectedDisk(e.target.value)} style={{ minWidth: 140 }}>
                {(disks.length ? disks : [{ id: "C:", label: diskLabel ?? "System drive" }]).map((d) => (
                  <option key={d.id} value={d.id}>
                    {(d.label || d.id) + ` (${d.id})`}
                  </option>
                ))}
              </select>

              <button className="button" style={{ padding: "10px 12px" }} onClick={refreshDevices}>
                Refresh Devices
              </button>
              <button className="button" style={{ padding: "10px 12px" }} onClick={copyAgentConfig}>
                Copy Agent Config
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="stat-value" style={{ color: "var(--danger)", fontSize: 18 }}>
            {error}
          </div>
          <div className="stat-label">Check that the agent is running and that the metrics log path is accessible.</div>
        </div>
      ) : null}

      {uiConfig.home.showStats ? (
        <div className="grid grid-3">
          <StatCard
            label="CPU Usage"
            value={snapshot ? `${snapshot.cpu.toFixed(1)}%` : "--"}
            status={cpuStatus as any}
            hint={snapshot?.hostname ? snapshot.hostname : "No host"}
          />
          <StatCard
            label="Memory Usage"
            value={
              snapshot
                ? `${snapshot.memPercent.toFixed(1)}%${
                    snapshot.memUsedGB !== undefined && snapshot.memTotalGB !== undefined
                      ? ` (${snapshot.memUsedGB.toFixed(1)}/${snapshot.memTotalGB.toFixed(1)} GB)`
                      : ""
                  }`
                : "--"
            }
            status={memStatus as any}
            hint={snapshot?.updated ? `Updated ${new Date(snapshot.updated).toLocaleTimeString()}` : "Awaiting data"}
          />
          <StatCard
            label="Disk Usage"
            value={diskPercentSelected !== null ? `${diskPercentSelected.toFixed(1)}%` : "N/A"}
            status={diskStatus as any}
            hint={diskLabel ? `${diskLabel} (${selectedDiskId})` : `${selectedDiskId} drive`}
          />
        </div>
      ) : null}

      {uiConfig.home.showTemps ? (
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          {uiConfig.temps.cards
            .filter((c) => c.enabled)
            .slice(0, 6)
            .map((c) => {
              const key = c.sourceKey;
              let val: number | null | undefined = undefined;
              if (key.startsWith("temps:")) {
                const name = key.slice("temps:".length);
                val = tempsList.find((t) => t.name === name)?.value;
              } else {
                val = (latestSample?.metrics as any)?.[key] as any;
              }
              return (
                <StatCard
                  key={c.id}
                  label={c.label}
                  value={typeof val === "number" ? `${val.toFixed(1)} C` : "N/A"}
                  status={tempStatus(typeof val === "number" ? val : null) as any}
                  hint={snapshot?.tempSource ? `Source: ${snapshot.tempSource}` : snapshot?.tempReason ? snapshot.tempReason : "Sensor (best effort)"}
                />
              );
            })}
        </div>
      ) : null}

      {uiConfig.home.showNetworkPanel ? <NetworkPanelContainer deviceId={selectedDeviceId} latest={latestSample} stale={false} /> : null}

      {(uiConfig.home.showMetricsTable || uiConfig.home.showProcessesCard || uiConfig.home.showDevicesList) ? (
        <div className="panel" style={{ marginTop: 18 }}>
          {uiConfig.home.showMetricsTable ? <MetricsTable samples={filteredSamples} selectedDiskId={selectedDiskId} /> : null}

          {uiConfig.home.showProcessesCard || uiConfig.home.showDevicesList ? (
            <div className="card">
              <div className="title-row">
                <div>
                  {uiConfig.home.showProcessesCard ? (
                    <>
                      <div className="stat-label">Processes</div>
                      <div className="stat-value" style={{ fontSize: 26 }}>
                        {snapshot ? snapshot.processes : "--"}
                      </div>
                    </>
                  ) : (
                    <div className="stat-label">Actions</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="button" onClick={() => window.location.reload()} aria-label="Refresh">
                    Refresh
                  </button>
                  <button className="button" onClick={downloadRecentLog} aria-label="Download recent log">
                    Last {uiConfig.data.logMinutes}m Log
                  </button>
                  <button
                    className="button"
                    style={{ background: "linear-gradient(135deg, #6366f1, #22d3ee)" }}
                    onClick={enrollCurrent}
                    aria-label="Enroll"
                    title="Enroll and auto-apply credentials to local agent.config.json"
                  >
                    Enroll & Apply
                  </button>
                </div>
              </div>

              <div className="stat-label">Live via SSE + heartbeat; poll fallback {pollSeconds}s</div>

              {uiConfig.home.showDevicesList ? (
                <div style={{ marginTop: 16 }}>
                  <div className="stat-label" style={{ fontWeight: 700, marginBottom: 6 }}>
                    Devices
                  </div>
                  {devices.length === 0 ? (
                    <div className="stat-label">No devices yet. Use "Enroll & Apply" or POST /api/devices.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {devices.map((d) => (
                        <Link
                          key={d.id}
                          href={`/devices/${encodeURIComponent(d.id)}`}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "rgba(255,255,255,0.03)",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.04)"
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{d.name}</div>
                            <div className="stat-label">{(d.hostname || "n/a") + " - " + d.id}</div>
                          </div>
                          <span className={d.status === "online" ? "pill pill-ok" : "pill pill-bad"}>{d.status.toUpperCase()}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
