"use client";

import { useRef, useState, type PointerEvent } from "react";

type SeriesPoint = { t: number; v?: number | null };

type Props = {
  a: SeriesPoint[];
  b: SeriesPoint[];
  width?: number | string;
  height?: number;
  strokeA?: string;
  strokeB?: string;
  grid?: {
    ticks: number[];
    suffix?: string;
    decimals?: number;
    domain: { min: number; max: number };
  };
  timeAxis?: {
    ticks?: number;
    format?: (t: number) => string;
  };
  tooltip?: {
    labelA?: string;
    labelB?: string;
    formatValue?: (v: number) => string;
    formatTime?: (t: number) => string;
  };
};

export function DualSparkline({
  a,
  b,
  width = 520,
  height = 120,
  strokeA = "#22d3ee",
  strokeB = "#f59e0b",
  grid,
  timeAxis,
  tooltip
}: Props) {
  const [hover, setHover] = useState<{ index: number; xPx: number; yPx: number } | null>(null);
  const svgPaneRef = useRef<HTMLDivElement | null>(null);

  const viewW = typeof width === "number" ? width : 520;
  const domainMin = grid?.domain?.min;
  const domainMax = grid?.domain?.max;
  const padLeft = 2;
  const padRight = 6;
  const padTop = 6;
  const padBottom = 6;
  const w = Math.max(1, viewW - padLeft - padRight);
  const h = Math.max(1, height - padTop - padBottom);

  const values: number[] = [];
  for (const p of a) if (typeof p.v === "number") values.push(p.v);
  for (const p of b) if (typeof p.v === "number") values.push(p.v);
  if (values.length < 2) return null;

  const min = domainMin ?? Math.min(...values);
  const max = domainMax ?? Math.max(...values);
  const span = Math.max(0.0001, max - min);

  const len = Math.max(a.length, b.length);
  if (len < 2) return null;
  const xs = Array.from({ length: len }, (_, i) => padLeft + (i / Math.max(1, len - 1)) * w);

  const pathFor = (series: SeriesPoint[]) => {
    let d = "";
    for (let i = 0; i < len; i++) {
      const v = series[i]?.v;
      if (typeof v !== "number") continue;
      const y = padTop + (1 - (v - min) / span) * h;
      d += (d ? " L" : "M") + `${xs[i].toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  const da = pathFor(a);
  const db = pathFor(b);
  if (!da && !db) return null;

  const yFor = (series: SeriesPoint[], index: number) => {
    const v = series[index]?.v;
    if (typeof v !== "number") return null;
    return padTop + (1 - (v - min) / span) * h;
  };

  const formatValue =
    tooltip?.formatValue ??
    ((v: number) => {
      const decimals = grid?.decimals ?? 1;
      const suffix = grid?.suffix ?? "";
      return `${v.toFixed(decimals)}${suffix}`;
    });
  const formatTime = tooltip?.formatTime ?? ((t: number) => new Date(t).toLocaleString());
  const formatAxisTime = timeAxis?.format ?? ((t: number) => new Date(t).toLocaleTimeString());

  const tickCount = Math.max(2, Math.min(timeAxis?.ticks ?? 4, 10));
  const tickIdxs =
    timeAxis && len >= 2 ? Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (len - 1))) : [];
  const tickIdxsUnique = Array.from(new Set(tickIdxs)).sort((x, y) => x - y);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = svgPaneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const xView = (xPx / rect.width) * viewW;
    const idxFloat = ((xView - padLeft) / w) * (len - 1);
    const index = Math.max(0, Math.min(len - 1, Math.round(idxFloat)));
    setHover({ index, xPx, yPx });
  };

  const onPointerLeave = () => setHover(null);

  const svg = (
    <svg
      width={grid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${viewW} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", width: grid ? "100%" : typeof width === "string" ? width : undefined, maxWidth: "100%" }}
    >
      {timeAxis
        ? tickIdxsUnique.map((idx) => (
            <line
              key={`t-${idx}`}
              x1={xs[idx]}
              x2={xs[idx]}
              y1={padTop}
              y2={padTop + h}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))
        : null}
      {grid
        ? grid.ticks.map((tick) => {
            const y = padTop + (1 - (tick - min) / span) * h;
            return (
              <line
                key={tick}
                x1={padLeft}
                x2={padLeft + w}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        : null}
      {da ? (
        <path
          d={da}
          fill="none"
          stroke={strokeA}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {db ? (
        <path
          d={db}
          fill="none"
          stroke={strokeB}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {hover ? (
        <line
          x1={xs[hover.index]}
          x2={xs[hover.index]}
          y1={padTop}
          y2={padTop + h}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {hover && yFor(a, hover.index) !== null ? (
        <circle
          cx={xs[hover.index]}
          cy={yFor(a, hover.index) as number}
          r={3.2}
          fill="rgba(10,18,30,0.9)"
          stroke={strokeA}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {hover && yFor(b, hover.index) !== null ? (
        <circle
          cx={xs[hover.index]}
          cy={yFor(b, hover.index) as number}
          r={3.2}
          fill="rgba(10,18,30,0.9)"
          stroke={strokeB}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );

  const hoverTime = hover ? a[hover.index]?.t ?? b[hover.index]?.t ?? null : null;
  const aVal = hover ? a[hover.index]?.v : null;
  const bVal = hover ? b[hover.index]?.v : null;

  const labelWidth = grid ? 42 : 0;
  const gap = grid ? 8 : 0;

  return (
    <div style={{ position: "relative", width: typeof width === "string" ? width : undefined, maxWidth: "100%", cursor: "crosshair", touchAction: "none" }}>
      <div style={{ display: "flex", gap, alignItems: "stretch" }}>
        {grid ? (
          <div style={{ width: labelWidth, height, position: "relative", pointerEvents: "none" }}>
            {grid.ticks.map((tick) => {
              const y = padTop + (1 - (tick - min) / span) * h;
              const pct = (y / height) * 100;
              const label = `${tick.toFixed(grid.decimals ?? 0)}${grid.suffix ?? ""}`;
              return (
                <div
                  key={tick}
                  className="stat-label"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: `${pct}%`,
                    transform: "translateY(-50%)",
                    fontSize: 11,
                    opacity: 0.75,
                    width: labelWidth,
                    textAlign: "left",
                    whiteSpace: "nowrap"
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        ) : null}
        <div
          ref={svgPaneRef}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
        >
          {svg}
        </div>
      </div>

      {timeAxis && tickIdxsUnique.length ? (
        <div style={{ position: "relative", height: 16, marginTop: 6, marginLeft: grid ? labelWidth + gap : 0 }}>
          {tickIdxsUnique.map((idx) => {
            const pct = ((idx / Math.max(1, len - 1)) * 100).toFixed(3);
            const label = formatAxisTime((a[idx]?.t ?? b[idx]?.t) as number);
            const align = idx === 0 ? "translateX(0)" : idx === len - 1 ? "translateX(-100%)" : "translateX(-50%)";
            return (
              <div
                key={`tl-${idx}`}
                className="stat-label"
                style={{
                  position: "absolute",
                  left: `${pct}%`,
                  top: 0,
                  transform: align,
                  fontSize: 11,
                  opacity: 0.8,
                  whiteSpace: "nowrap",
                  pointerEvents: "none"
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      ) : null}

      {hover && hoverTime ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            margin: 8,
            pointerEvents: "none",
            background: "rgba(10,18,30,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "8px 10px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            minWidth: 170,
            maxWidth: 320,
            zIndex: 5
          }}
        >
          <div style={{ fontSize: 12, color: "rgba(229,231,235,0.8)", lineHeight: 1.2 }}>{formatTime(hoverTime)}</div>
          <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: strokeA, display: "inline-block" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                {(tooltip?.labelA ?? "A") + ": "}
                {typeof aVal === "number" ? formatValue(aVal) : "--"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: strokeB, display: "inline-block" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                {(tooltip?.labelB ?? "B") + ": "}
                {typeof bVal === "number" ? formatValue(bVal) : "--"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
