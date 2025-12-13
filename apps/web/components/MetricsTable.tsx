import React from "react";
import type { MetricSample } from "@/lib/store";
import { normalizeMemory } from "@/lib/metrics";

type Props = {
  samples: MetricSample[];
  selectedDiskId?: string | null;
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function formatNumber(val?: number, suffix = "") {
  if (val === undefined || val === null || Number.isNaN(val)) return "-";
  return `${val.toFixed(2)}${suffix}`;
}

function tempColor(val?: number | null): React.CSSProperties | undefined {
  if (val === undefined || val === null) return undefined;
  if (val >= 90) return { color: "var(--danger)" };
  if (val >= 80) return { color: "var(--warning)" };
  return undefined;
}

export function MetricsTable({ samples, selectedDiskId }: Props) {
  const last = samples[samples.length - 1];
  const data = samples.slice(-20).reverse();

  const memStats = last ? normalizeMemory(last.metrics.memUsedGB, last.metrics.memTotalGB) : {};
  const memPct = memStats.percent;

  const formatDisk = (row: MetricSample) => {
    const disks = (row.metrics as any).disks as any[] | undefined;
    const diskFromList =
      selectedDiskId && Array.isArray(disks) ? disks.find((d) => d.id === selectedDiskId) : undefined;
    const used = diskFromList?.usedGB ?? row.metrics.diskUsedGB;
    const total = diskFromList?.sizeGB ?? row.metrics.diskTotalGB;
    if (used === undefined || used === null || total === undefined || total === null || total === 0) return "-";
    const pct =
      diskFromList?.percent ??
      (typeof used === "number" && typeof total === "number" && total > 0 ? (used / total) * 100 : undefined);
    return `${used.toFixed(1)}/${total.toFixed(1)} GB${pct !== undefined ? ` (${pct.toFixed(0)}%)` : ""}`;
  };

  return (
    <div className="card">
      <div className="title-row">
        <div>
          <div className="stat-label">Recent Samples</div>
          {last ? (
            <div className="stat-value" style={{ fontSize: 18 }}>
              {last.hostname} - {new Date(last.timestamp).toLocaleTimeString()}
            </div>
          ) : (
            <div className="stat-value" style={{ fontSize: 16 }}>
              No samples yet
            </div>
          )}
        </div>
        {memPct !== undefined ? (
          <span className={memPct > 85 ? "pill pill-bad" : memPct > 70 ? "pill pill-warn" : "pill pill-ok"}>
            Mem {memPct.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>CPU %</th>
              <th>Mem (GB)</th>
              <th>Disk</th>
              <th>Proc</th>
              <th>Uptime (hrs)</th>
              <th>CPU °C</th>
              <th>GPU °C</th>
              <th>Temp Src</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const memStatsRow = normalizeMemory(row.metrics.memUsedGB, row.metrics.memTotalGB);
              const mem =
                memStatsRow.usedGb !== undefined && memStatsRow.totalGb !== undefined
                  ? `${memStatsRow.usedGb.toFixed(2)}/${memStatsRow.totalGb.toFixed(2)} GB`
                  : "-";
              const disk = formatDisk(row);
              const cpuT = row.metrics.cpuTempC ?? null;
              const gpuT = row.metrics.gpuTempC ?? null;
              const tempSrc = row.metrics.tempSource ?? row.metrics.tempReason ?? "-";
              return (
                <tr key={`${row.timestamp}-${idx}`}>
                  <td>{formatTime(row.timestamp)}</td>
                  <td>{formatNumber(row.metrics.cpuPercent)}</td>
                  <td>{mem}</td>
                  <td>{disk}</td>
                  <td>{row.metrics.processCount ?? "-"}</td>
                  <td>{row.metrics.uptimeSec !== undefined ? (row.metrics.uptimeSec / 3600).toFixed(1) : "-"}</td>
                  <td style={tempColor(cpuT)}>{cpuT !== null ? `${cpuT.toFixed(1)}°C` : "-"}</td>
                  <td style={tempColor(gpuT)}>{gpuT !== null ? `${gpuT.toFixed(1)}°C` : "-"}</td>
                  <td title={row.metrics.tempReason ?? undefined}>{tempSrc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

