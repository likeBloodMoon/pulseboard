"use client";

import { useEffect, useMemo, useState } from "react";
import type { MetricSample } from "@/lib/store";
import { DualSparkline } from "@/components/DualSparkline";

type HistoryPoint = { t: number; rxBps?: number; txBps?: number; dnsMs?: number; ping?: Record<string, { avgMs?: number; lossPct?: number }> };

function fmtRate(bps?: number | null, unit: "bytes" | "bits" = "bytes") {
  if (bps === undefined || bps === null || !Number.isFinite(bps)) return "--";
  const value = unit === "bits" ? bps * 8 : bps;
  const abs = Math.abs(value);
  const suffix = unit === "bits" ? "b/s" : "B/s";
  if (abs < 1024) return `${value.toFixed(0)} ${suffix}`;
  if (abs < 1024 * 1024) return `${(value / 1024).toFixed(1)} K${suffix}`;
  if (abs < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} M${suffix}`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} G${suffix}`;
}

function fmtMs(v?: number | null) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "--";
  return `${v.toFixed(1)} ms`;
}

function fmtPct(v?: number | null) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "--";
  return `${v.toFixed(1)}%`;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? null;
}

export function NetworkPanel({
  latest,
  history,
  stale = false
}: {
  latest?: MetricSample;
  history?: HistoryPoint[];
  stale?: boolean;
}) {
  const net = latest?.metrics?.net;
  const totals = net?.totals ?? {};
  const ifaces = net?.interfaces ?? [];
  const defaultIfIndex = net?.defaultIfIndex ?? null;

  const [unit, setUnit] = useState<"bytes" | "bits">("bytes");
  const [selectedIf, setSelectedIf] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [saving, setSaving] = useState(false);
  const [showProbeSettings, setShowProbeSettings] = useState(false);
  const [targetsText, setTargetsText] = useState(() => ["gateway", "1.1.1.1", "8.8.8.8"].join(", "));
  const [dnsHost, setDnsHost] = useState(() => "one.one.one.one");
  const [probeInterval, setProbeInterval] = useState<number>(10);
  const [enablePublicIp, setEnablePublicIp] = useState(false);

  useEffect(() => {
    if (selectedIf) return;
    if (!ifaces.length) return;
    const preferred = defaultIfIndex !== null ? ifaces.find((i) => i.ifIndex === defaultIfIndex) : null;
    setSelectedIf(preferred?.name ?? ifaces[0]?.name ?? "");
  }, [defaultIfIndex, ifaces, selectedIf]);

  useEffect(() => {
    if (!showProbeSettings) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowProbeSettings(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showProbeSettings]);

  const selected = selectedIf ? ifaces.find((i) => i.name === selectedIf) : undefined;
  const rx = (selected?.rxBps ?? totals.rxBps) ?? null;
  const tx = (selected?.txBps ?? totals.txBps) ?? null;
  const gateway = net?.gateway ?? null;
  const dns = (net?.dnsServers ?? []).slice(0, 4);
  const probe = net?.probe;
  const ping = (probe?.ping ?? []).filter(Boolean).slice(0, 8);

  const convertVal = (v?: number) => {
    if (typeof v !== "number") return null;
    return unit === "bits" ? v * 8 : v;
  };

  const baseRxSeries = useMemo(() => (history ?? []).map((p) => ({ t: p.t, v: convertVal(p.rxBps) })), [history, unit]);
  const baseTxSeries = useMemo(() => (history ?? []).map((p) => ({ t: p.t, v: convertVal(p.txBps) })), [history, unit]);

  const baseVals = useMemo(() => {
    const vals: number[] = [];
    baseRxSeries.forEach((p) => typeof p.v === "number" && vals.push(p.v));
    baseTxSeries.forEach((p) => typeof p.v === "number" && vals.push(p.v));
    return vals;
  }, [baseRxSeries, baseTxSeries]);

  const maxBase = useMemo(() => Math.max(1, ...baseVals), [baseVals]);
  const p95Base = useMemo(() => percentile(baseVals, 95), [baseVals]);
  const peakBase = useMemo(() => Math.max(0, ...baseVals), [baseVals]);

  const scale = useMemo(() => {
    const thresholds = [
      { div: 1024 * 1024 * 1024, suffix: unit === "bits" ? "Gb/s" : "GB/s" },
      { div: 1024 * 1024, suffix: unit === "bits" ? "Mb/s" : "MB/s" },
      { div: 1024, suffix: unit === "bits" ? "Kb/s" : "KB/s" }
    ];
    for (const t of thresholds) {
      if (maxBase >= t.div * 0.8) return t;
    }
    return { div: 1, suffix: unit === "bits" ? "b/s" : "B/s" };
  }, [maxBase, unit]);

  const rxSeries = useMemo(() => baseRxSeries.map((p) => ({ t: p.t, v: typeof p.v === "number" ? p.v / scale.div : null })), [baseRxSeries, scale.div]);
  const txSeries = useMemo(() => baseTxSeries.map((p) => ({ t: p.t, v: typeof p.v === "number" ? p.v / scale.div : null })), [baseTxSeries, scale.div]);

  const maxScaled = Math.max(1, ...(rxSeries.map((p) => (typeof p.v === "number" ? p.v : 0))), ...(txSeries.map((p) => (typeof p.v === "number" ? p.v : 0))));
  const ticks = useMemo(() => {
    const top = maxScaled || 1;
    return [0, top * 0.25, top * 0.5, top * 0.75, top].map((v) => Number(v.toFixed(1)));
  }, [maxScaled]);

  const saveConfig = async () => {
    const targets = targetsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);

    setSaving(true);
    try {
      const res = await fetch("/api/agent/config/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkProbeIntervalSeconds: probeInterval,
          networkTargets: targets,
          networkDnsTestHost: dnsHost,
          enablePublicIp
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert("Network config saved to dist/agent.config.json (restart agent to apply).");
      setShowProbeSettings(false);
    } catch (err: any) {
      alert(`Save failed: ${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  if (!net) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="title-row">
          <div>
            <div className="stat-label">Network</div>
            <div className="stat-value" style={{ fontSize: 18 }}>
              No network telemetry
            </div>
          </div>
        </div>
        <div className="stat-label">Update the agent to a version that reports `metrics.net`.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="title-row">
        <div>
          <div className="stat-label">Network</div>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {fmtRate(rx, unit)} <span className="stat-label">down</span>
            </div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {fmtRate(tx, unit)} <span className="stat-label">up</span>
            </div>
            {stale ? <span className="pill pill-warn">stale</span> : <span className="pill pill-ok">live</span>}
          </div>
          <div className="stat-label" style={{ marginTop: 6 }}>
            {gateway ? `Gateway: ${gateway}` : "Gateway: --"}
            {dns.length ? ` • DNS: ${dns.join(", ")}` : ""}
            {probe?.publicIp ? ` • Public IP: ${probe.publicIp}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select value={selectedIf} onChange={(e) => setSelectedIf(e.target.value)} aria-label="Select interface">
            <option value="" disabled>
              Select interface…
            </option>
            {ifaces.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
          <button className="button button-muted" onClick={() => setUnit(unit === "bytes" ? "bits" : "bytes")}>
            {unit === "bytes" ? "Bytes/s" : "Bits/s"}
          </button>
          <button className="button button-muted" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Simple" : "Advanced"}
          </button>
          <button className="button" onClick={() => setShowProbeSettings(true)}>
            Probe settings
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "stretch" }}>
          <div className="settings-section">
            <div className="settings-section-title">History</div>
            <DualSparkline
              a={rxSeries}
              b={txSeries}
              width="100%"
              height={120}
              strokeA="#22d3ee"
              strokeB="#f59e0b"
              grid={{
                ticks,
                suffix: ` ${scale.suffix}`,
                decimals: 1,
                domain: { min: 0, max: maxScaled }
              }}
              timeAxis={{ ticks: 4, format: (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }}
              tooltip={{
                labelA: "Down",
                labelB: "Up",
                formatValue: (v) => `${v.toFixed(1)} ${scale.suffix}`,
                formatTime: (t) => new Date(t).toLocaleString()
              }}
            />
            <div className="stat-label" style={{ marginTop: 8 }}>
              Peak: {fmtRate(unit === "bits" ? peakBase / 8 : peakBase, unit)}
              {p95Base !== null ? ` • P95: ${fmtRate(unit === "bits" ? p95Base / 8 : p95Base, unit)}` : ""}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Probe</div>
            {!probe ? (
              <div className="stat-label">No probe telemetry yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {probe.dns ? (
                  <div className="stat-label">
                    DNS: {probe.dns.ok ? "OK" : "FAIL"} • {probe.dns.host || "host"} • {fmtMs(probe.dns.ms ?? null)}
                    {probe.at ? ` • ${new Date(probe.at).toLocaleTimeString()}` : ""}
                  </div>
                ) : null}
                {probe.http ? (
                  <div className="stat-label">
                    HTTP: {probe.http.ok ? "OK" : "FAIL"} • {probe.http.url || "url"} •{" "}
                    {probe.http.status ? `${probe.http.status}` : "--"} • {fmtMs(probe.http.ms ?? null)}
                  </div>
                ) : null}

                <div style={{ marginTop: 4 }}>
                  <div className="stat-label" style={{ fontWeight: 700, marginBottom: 6 }}>
                    Latency / Loss
                  </div>
                  {!ping.length ? (
                    <div className="stat-label">Awaiting ping data…</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
                      <div className="stat-label">Target</div>
                      <div className="stat-label">Avg</div>
                      <div className="stat-label">Jitter</div>
                      <div className="stat-label">Loss</div>
                      {ping.map((p) => (
                        <div key={p.target} style={{ display: "contents" }}>
                          <div style={{ fontWeight: 700 }}>{p.target}</div>
                          <div className="stat-label">{fmtMs(p.avgMs ?? null)}</div>
                          <div className="stat-label">{fmtMs(p.jitterMs ?? null)}</div>
                          <div className="stat-label">{fmtPct(p.lossPct ?? null)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Interfaces</div>
          <div style={{ display: "grid", gridTemplateColumns: showAdvanced ? "2fr 1fr 1fr 1fr 1fr" : "2fr 1fr 1fr 1fr", gap: 8 }}>
            <div className="stat-label">Interface</div>
            <div className="stat-label">IPs</div>
            <div className="stat-label">Rx / Tx</div>
            <div className="stat-label">Err / Drop</div>
            {showAdvanced ? <div className="stat-label">Bytes</div> : null}
            {ifaces.slice(0, 8).map((i) => (
              <div key={`${i.ifIndex ?? i.name}`} style={{ display: "contents" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i.name}</div>
                  <div className="stat-label">
                    {i.linkSpeedMbps ? `${i.linkSpeedMbps} Mbps` : "link --"}
                    {i.mac ? ` • ${i.mac}` : ""}
                    {i.mac ? (
                      <button
                        className="button button-muted"
                        style={{ padding: "6px 10px", marginLeft: 10, verticalAlign: "middle" }}
                        onClick={() => navigator.clipboard.writeText(i.mac!)}
                        aria-label="Copy MAC"
                      >
                        Copy
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="stat-label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(i.ipv4 && i.ipv4.length ? i.ipv4.join(", ") : "--") + (i.ipv6 && i.ipv6.length ? ` • ${i.ipv6[0]}` : "")}
                </div>
                <div className="stat-label">
                  {fmtRate(i.rxBps ?? null, unit)}
                  <br />
                  {fmtRate(i.txBps ?? null, unit)}
                </div>
                <div className="stat-label">
                  {`${i.rxErrors ?? 0}/${i.txErrors ?? 0}`}
                  <br />
                  {`${i.rxDiscards ?? 0}/${i.txDiscards ?? 0}`}
                </div>
                {showAdvanced ? (
                  <div className="stat-label">
                    {typeof i.rxBytes === "number" ? i.rxBytes.toLocaleString() : "--"}
                    <br />
                    {typeof i.txBytes === "number" ? i.txBytes.toLocaleString() : "--"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showProbeSettings ? (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowProbeSettings(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="badge">Network</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>Probe Settings</div>
                <div className="stat-label" style={{ marginTop: 6 }}>
                  Writes to `dist/agent.config.json` (restart the agent to apply).
                </div>
              </div>
              <button className="button button-muted" onClick={() => setShowProbeSettings(false)}>
                Close
              </button>
            </div>

            <div className="modal-body" style={{ marginTop: 12 }}>
              <div className="settings-grid">
                <div className="settings-section">
                  <div className="settings-section-title">Targets</div>
                  <div className="stat-label">Comma-separated. Use `gateway` to probe the default gateway.</div>
                  <div style={{ marginTop: 10 }}>
                    <input type="text" value={targetsText} onChange={(e) => setTargetsText(e.target.value)} style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">DNS Test</div>
                  <div className="stat-label">Host to resolve during DNS probe.</div>
                  <div style={{ marginTop: 10 }}>
                    <input type="text" value={dnsHost} onChange={(e) => setDnsHost(e.target.value)} style={{ width: "100%" }} />
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-title">Interval</div>
                  <div className="stat-label">How often probes run (seconds).</div>
                  <div style={{ marginTop: 10 }}>
                    <input
                      type="number"
                      min={2}
                      max={300}
                      value={probeInterval}
                      onChange={(e) => setProbeInterval(Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <label className="stat-label" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                    <input type="checkbox" checked={enablePublicIp} onChange={(e) => setEnablePublicIp(e.target.checked)} />
                    Enable public IP lookup
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="stat-label">Changes apply after restart.</div>
              <div className="modal-footer-actions">
                <button className="button button-muted" onClick={() => setShowProbeSettings(false)}>
                  Cancel
                </button>
                <button className="button" disabled={saving} onClick={saveConfig}>
                  {saving ? "Saving…" : "Save to Agent Config"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

