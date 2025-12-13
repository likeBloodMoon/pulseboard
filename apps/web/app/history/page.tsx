"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sparkline } from "@/components/Sparkline";
import { DualSparkline } from "@/components/DualSparkline";
import type React from "react";

type Device = {
  id: string;
  name: string;
  status: "online" | "offline";
  hostname?: string;
};

type Point = {
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
  dnsMs?: number;
};

function fmtPct(v?: number) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "--";
  return `${v.toFixed(1)}%`;
}

function fmtTemp(v?: number | null) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "N/A";
  return `${v.toFixed(1)}°C`;
}

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

function fmtBps(bps?: number) {
  if (bps === undefined || bps === null || !Number.isFinite(bps)) return "--";
  const abs = Math.abs(bps);
  if (abs < 1024) return `${bps.toFixed(0)} B/s`;
  if (abs < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  if (abs < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function peakLabel(points: Array<{ t: number; v?: number | null }>, fmt: (t: number) => string) {
  let bestIdx = -1;
  let bestVal = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const v = points[i]?.v;
    if (typeof v !== "number") continue;
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  return `Peak ${fmt(points[bestIdx]!.t)}`;
}

function StatWithChart({
  title,
  value,
  points,
  stroke,
  grid,
  tooltip,
  timeAxis
}: {
  title: string;
  value: React.ReactNode;
  points: Array<{ t: number; v?: number | null }>;
  stroke: string;
  grid?: Parameters<typeof Sparkline>[0]["grid"];
  tooltip?: Parameters<typeof Sparkline>[0]["tooltip"];
  timeAxis?: Parameters<typeof Sparkline>[0]["timeAxis"];
}) {
  return (
    <div className="card">
      <div className="title-row" style={{ marginBottom: 10 }}>
        <div>
          <div className="stat-label">{title}</div>
          <div className="stat-value" style={{ fontSize: 22 }}>
            {value}
          </div>
        </div>
      </div>
      <div style={{ width: "100%" }}>
        <Sparkline points={points} width="100%" height={120} stroke={stroke} fill grid={grid} tooltip={tooltip} timeAxis={timeAxis} />
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(240);
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/devices", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        const list = (data.devices ?? []) as Device[];
        setDevices(list);
        setSelectedDeviceId((prev) => prev || list[0]?.id || "");
      } catch (err: any) {
        if (active) setError(err?.message ?? "Failed to load devices");
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedDeviceId) return;
      try {
        const res = await fetch(`/api/metrics/history?deviceId=${encodeURIComponent(selectedDeviceId)}&minutes=${minutes}`, {
          cache: "no-store"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        setPoints((data.points ?? []) as Point[]);
        setError(null);
      } catch (err: any) {
        if (active) setError(err?.message ?? "Failed to load history");
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [selectedDeviceId, minutes]);

  const last = points[points.length - 1];
  const cpuSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.cpu })), [points]);
  const memSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.mem })), [points]);
  const diskSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.disk })), [points]);
  const rxSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.rxBps })), [points]);
  const txSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.txBps })), [points]);
  const rxSeriesMB = useMemo(() => points.map((p) => ({ t: p.t, v: typeof p.rxBps === "number" ? p.rxBps / (1024 * 1024) : null })), [points]);
  const txSeriesMB = useMemo(() => points.map((p) => ({ t: p.t, v: typeof p.txBps === "number" ? p.txBps / (1024 * 1024) : null })), [points]);
  const netMax = useMemo(() => {
    const vals: number[] = [];
    rxSeriesMB.forEach((p) => typeof p.v === "number" && vals.push(p.v));
    txSeriesMB.forEach((p) => typeof p.v === "number" && vals.push(p.v));
    return Math.max(0.5, ...vals);
  }, [rxSeriesMB, txSeriesMB]);
  const netTicks = useMemo(() => {
    const top = netMax || 1;
    return [0, top * 0.25, top * 0.5, top * 0.75, top].map((v) => Number(v.toFixed(1)));
  }, [netMax]);
  const cpuTempSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.cpuTemp ?? null })), [points]);
  const gpuTempSeries = useMemo(() => points.map((p) => ({ t: p.t, v: p.gpuTemp ?? null })), [points]);

  const selectedDevice = selectedDeviceId ? devices.find((d) => d.id === selectedDeviceId) : null;

  const formatAxisTime = useMemo(() => {
    return (t: number) => {
      const d = new Date(t);
      if (minutes <= 24 * 60) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    };
  }, [minutes]);

  const timeAxis = useMemo(() => ({ ticks: 5, format: formatAxisTime }), [formatAxisTime]);

  return (
    <div className="wrapper">
      <div className="hero">
        <div className="title-row" style={{ marginBottom: 10 }}>
          <div>
            <div className="badge">History</div>
            <h1 style={{ marginTop: 10 }}>Telemetry History</h1>
            <div className="stat-label" style={{ marginTop: 6 }}>
              View CPU, memory, disk, and network over time.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="button" href="/">
              Home
            </Link>
            {selectedDeviceId ? (
              <Link className="button" href={`/devices/${encodeURIComponent(selectedDeviceId)}`}>
                Device
              </Link>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="stat-label">Device</div>
          <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} aria-label="Select device" style={{ minWidth: 240 }}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.status === "online" ? "(online)" : "(offline)"}
              </option>
            ))}
          </select>

          <div className="stat-label">Range</div>
          <select value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value, 10))} aria-label="Select range">
            <option value={60}>Last 1h</option>
            <option value={240}>Last 4h</option>
            <option value={1440}>Last 24h</option>
            <option value={4320}>Last 3d</option>
            <option value={10080}>Last 7d</option>
          </select>

          {selectedDevice ? (
            <span className={selectedDevice.status === "online" ? "pill pill-ok" : "pill pill-bad"}>{selectedDevice.status.toUpperCase()}</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="stat-value" style={{ color: "var(--danger)", fontSize: 18 }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", marginTop: 12 }}>
        <StatWithChart
          title="CPU Usage"
          value={
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{fmtPct(last?.cpu)}</span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {peakLabel(cpuSeries, formatAxisTime)}
              </span>
            </span>
          }
          points={cpuSeries}
          stroke="#22d3ee"
          grid={{ ticks: [100, 50, 0], suffix: "%", decimals: 0, domain: { min: 0, max: 100 } }}
          timeAxis={timeAxis}
        />

        <StatWithChart
          title="Memory Usage"
          value={
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{fmtPct(last?.mem)}</span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {fmtGBPair(last?.memUsedGB ?? null, last?.memTotalGB ?? null)}
              </span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {peakLabel(memSeries, formatAxisTime)}
              </span>
            </span>
          }
          points={memSeries}
          stroke="#22c55e"
          grid={{ ticks: [100, 50, 0], suffix: "%", decimals: 0, domain: { min: 0, max: 100 } }}
          tooltip={{
            getValue: (i) => fmtGBPair(points[i]?.memUsedGB ?? null, points[i]?.memTotalGB ?? null),
            getSubValue: (i) => fmtPct(points[i]?.mem),
            formatTime: (t) => new Date(t).toLocaleTimeString()
          }}
          timeAxis={timeAxis}
        />

        <StatWithChart
          title="Disk Usage"
          value={
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{fmtPct(last?.disk)}</span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {peakLabel(diskSeries, formatAxisTime)}
              </span>
            </span>
          }
          points={diskSeries}
          stroke="#f59e0b"
          grid={{ ticks: [100, 50, 0], suffix: "%", decimals: 0, domain: { min: 0, max: 100 } }}
          timeAxis={timeAxis}
        />

        <StatWithChart
          title="Network Down"
          value={
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{fmtBps(last?.rxBps)}</span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {peakLabel(rxSeries, formatAxisTime)}
              </span>
            </span>
          }
          points={rxSeriesMB}
          stroke="#60a5fa"
          grid={{ ticks: netTicks, suffix: " MB/s", decimals: 1, domain: { min: 0, max: netMax } }}
          tooltip={{
            formatValue: (v) => `${v.toFixed(1)} MB/s`,
            formatTime: (t) => new Date(t).toLocaleTimeString()
          }}
          timeAxis={timeAxis}
        />

        <StatWithChart
          title="Network Up"
          value={
            <span style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{fmtBps(last?.txBps)}</span>
              <span className="stat-label" style={{ fontSize: 12, opacity: 0.85 }}>
                {peakLabel(txSeries, formatAxisTime)}
              </span>
            </span>
          }
          points={txSeriesMB}
          stroke="#34d399"
          grid={{ ticks: netTicks, suffix: " MB/s", decimals: 1, domain: { min: 0, max: netMax } }}
          tooltip={{
            formatValue: (v) => `${v.toFixed(1)} MB/s`,
            formatTime: (t) => new Date(t).toLocaleTimeString()
          }}
          timeAxis={timeAxis}
        />

        <div className="card">
          <div className="title-row" style={{ marginBottom: 10 }}>
            <div>
              <div className="stat-label">Temps</div>
              <div className="stat-value" style={{ fontSize: 22 }}>
                <span style={{ color: "#22d3ee" }}>CPU {fmtTemp(last?.cpuTemp)}</span>
                <span className="stat-label" style={{ margin: "0 10px" }}>
                  /
                </span>
                <span style={{ color: "#f59e0b" }}>GPU {fmtTemp(last?.gpuTemp)}</span>
              </div>
              <div className="stat-label" style={{ marginTop: 6 }}>
                {peakLabel(cpuTempSeries, formatAxisTime)} {peakLabel(gpuTempSeries, formatAxisTime) ? `• ${peakLabel(gpuTempSeries, formatAxisTime)}` : ""}
              </div>
            </div>
          </div>
          <div style={{ width: "100%", marginTop: 8 }}>
            <DualSparkline
              a={cpuTempSeries}
              b={gpuTempSeries}
              width="100%"
              height={120}
              strokeA="#22d3ee"
              strokeB="#f59e0b"
              grid={{ ticks: [100, 80, 60, 40], suffix: "°C", decimals: 0, domain: { min: 20, max: 110 } }}
              tooltip={{ labelA: "CPU", labelB: "GPU" }}
              timeAxis={timeAxis}
            />
          </div>
          <div className="stat-label" style={{ marginTop: 8 }}>
            Last updated {last?.t ? new Date(last.t).toLocaleString() : "--"}
          </div>
        </div>
      </div>
    </div>
  );
}

