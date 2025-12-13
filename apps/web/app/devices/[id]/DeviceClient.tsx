"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MetricsTable } from "@/components/MetricsTable";
import { NetworkPanelContainer } from "@/components/NetworkPanelContainer";
import { Sparkline } from "@/components/Sparkline";
import { StatCard } from "@/components/StatCard";
import type { MetricSample } from "@/lib/store";

type HistoryPoint = {
  t: number;
  cpu?: number;
  mem?: number;
  memUsedGB?: number;
  memTotalGB?: number;
  disk?: number;
  cpuTemp?: number | null;
  gpuTemp?: number | null;
  rxBps?: number;
  txBps?: number;
};

function fmtGBPair(used?: number | null, total?: number | null) {
  if (
    used === undefined ||
    used === null ||
    !Number.isFinite(used) ||
    total === undefined ||
    total === null ||
    !Number.isFinite(total) ||
    total <= 0
  )
    return "--";
  return `${used.toFixed(1)}/${total.toFixed(1)} GB`;
}

export default function DeviceClient({ deviceId }: { deviceId: string }) {
  const [samples, setSamples] = useState<MetricSample[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/metrics?deviceId=${encodeURIComponent(deviceId)}&limit=500`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        setSamples(data.samples ?? []);
        setError(null);
      } catch (err: any) {
        if (active) setError(err?.message ?? "Failed to load samples");
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [deviceId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/metrics/history?deviceId=${encodeURIComponent(deviceId)}&minutes=${minutes}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        setHistory(data.points ?? []);
      } catch {
        if (active) setHistory([]);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [deviceId, minutes]);

  const latest = samples[samples.length - 1];
  const cpu = latest?.metrics?.cpuPercent ?? null;
  const mem =
    latest?.metrics?.memUsedGB !== undefined &&
    latest?.metrics?.memTotalGB !== undefined &&
    latest.metrics.memTotalGB
      ? (latest.metrics.memUsedGB / latest.metrics.memTotalGB) * 100
      : null;
  const disk =
    latest?.metrics?.diskUsedGB !== undefined &&
    latest?.metrics?.diskTotalGB !== undefined &&
    latest.metrics.diskTotalGB
      ? (latest.metrics.diskUsedGB / latest.metrics.diskTotalGB) * 100
      : null;

  const cpuSeries = useMemo(() => history.map((p) => ({ t: p.t, v: p.cpu })), [history]);
  const memSeries = useMemo(() => history.map((p) => ({ t: p.t, v: p.mem })), [history]);
  const diskSeries = useMemo(() => history.map((p) => ({ t: p.t, v: p.disk })), [history]);

  return (
    <div className="wrapper">
      <div className="hero">
        <div className="title-row" style={{ marginBottom: 6 }}>
          <div>
            <div className="badge">Device</div>
            <h1 style={{ marginTop: 10 }}>{deviceId}</h1>
            <div className="stat-label" style={{ marginTop: 6 }}>
              {latest?.hostname ? `${latest.hostname} - ` : ""}
              {latest?.timestamp ? new Date(latest.timestamp).toLocaleString() : "No data yet"}
            </div>
          </div>
          <Link className="button" href="/">
            Back
          </Link>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="stat-label">History</div>
          <select value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value, 10))} aria-label="History range">
            <option value={30}>30m</option>
            <option value={60}>1h</option>
            <option value={240}>4h</option>
            <option value={1440}>24h</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="stat-value" style={{ color: "var(--danger)", fontSize: 18 }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="grid grid-3">
        <div className="card">
          <div className="title-row">
            <span className="stat-label">CPU Usage</span>
            <span className="pill pill-ok">LIVE</span>
          </div>
          <div className="stat-value">{cpu !== null ? `${cpu.toFixed(1)}%` : "--"}</div>
          <div style={{ marginTop: 10 }}>
            <Sparkline points={cpuSeries} />
          </div>
        </div>

        <div className="card">
          <div className="title-row">
            <span className="stat-label">Memory Usage</span>
            <span className="pill pill-ok">LIVE</span>
          </div>
          <div className="stat-value" style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <span>{mem !== null ? `${mem.toFixed(1)}%` : "--"}</span>
            <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
              {fmtGBPair(latest?.metrics?.memUsedGB ?? null, latest?.metrics?.memTotalGB ?? null)}
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Sparkline
              points={memSeries}
              stroke="#22c55e"
              tooltip={{
                getValue: (i) => fmtGBPair(history[i]?.memUsedGB ?? null, history[i]?.memTotalGB ?? null),
                getSubValue: (i) => (typeof history[i]?.mem === "number" ? `${history[i]!.mem!.toFixed(1)}%` : "--"),
                formatTime: (t) => new Date(t).toLocaleTimeString()
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="title-row">
            <span className="stat-label">Disk Usage</span>
            <span className="pill pill-ok">LIVE</span>
          </div>
          <div className="stat-value">{disk !== null ? `${disk.toFixed(1)}%` : "N/A"}</div>
          <div style={{ marginTop: 10 }}>
            <Sparkline points={diskSeries} stroke="#f59e0b" />
          </div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <StatCard
          label="CPU Temp"
          value={
            latest?.metrics?.cpuTempC !== undefined && latest?.metrics?.cpuTempC !== null
              ? `${latest.metrics.cpuTempC.toFixed(1)}°C`
              : "N/A"
          }
          status="ok"
          hint={latest?.metrics?.tempSource ? `Source: ${latest.metrics.tempSource}` : "Sensor (best effort)"}
        />
        <StatCard
          label="GPU Temp"
          value={
            latest?.metrics?.gpuTempC !== undefined && latest?.metrics?.gpuTempC !== null
              ? `${latest.metrics.gpuTempC.toFixed(1)}°C`
              : "N/A"
          }
          status="ok"
          hint={latest?.metrics?.tempSource ? `Source: ${latest.metrics.tempSource}` : "Sensor (best effort)"}
        />
        <StatCard
          label="Samples"
          value={samples.length ? `${samples.length}` : "--"}
          status="ok"
          hint={samples.length ? `Last ${minutes}m via disk cache` : "No samples loaded"}
        />
      </div>

      <NetworkPanelContainer deviceId={deviceId} latest={latest} stale={false} minutes={minutes} />

      <div className="panel" style={{ marginTop: 18 }}>
        <MetricsTable samples={samples} selectedDiskId={"C:"} />
      </div>
    </div>
  );
}
