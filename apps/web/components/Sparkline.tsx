"use client";

import { useRef, useState, type PointerEvent } from "react";

type Props = {
  points: Array<{ t: number; v?: number | null }>;
  width?: number | string;
  height?: number;
  stroke?: string;
  fill?: boolean;
  grid?: {
    ticks: number[];
    suffix?: string;
    decimals?: number;
    domain: { min: number; max: number };
  };
  timeAxis?: {
    ticks?: number; // number of labels across bottom
    format?: (t: number) => string;
  };
  tooltip?: {
    formatValue?: (v: number) => string;
    formatTime?: (t: number) => string;
    getValue?: (index: number, p: { t: number; v?: number | null }) => string;
    getTime?: (index: number, p: { t: number; v?: number | null }) => string;
    getSubValue?: (index: number, p: { t: number; v?: number | null }) => string;
  };
};

export function Sparkline({ points, width = 160, height = 36, stroke = "#22d3ee", fill = false, grid, timeAxis, tooltip }: Props) {
  const [hover, setHover] = useState<{ index: number; xPx: number; yPx: number } | null>(null);
  const svgPaneRef = useRef<HTMLDivElement | null>(null);

  const viewW = typeof width === "number" ? width : 160;
  const values = points.map((p) => (typeof p.v === "number" ? p.v : null)).filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const domainMin = grid?.domain?.min ?? Math.min(...values);
  const domainMax = grid?.domain?.max ?? Math.max(...values);
  const span = Math.max(0.0001, domainMax - domainMin);
  const padLeft = 2;
  const padRight = 6;
  const padTop = 6;
  const padBottom = 6;
  const w = Math.max(1, viewW - padLeft - padRight);
  const h = Math.max(1, height - padTop - padBottom);

  const xs = points.map((_, i) => padLeft + (i / Math.max(1, points.length - 1)) * w);
  const ys = points.map((p) => {
    const v = typeof p.v === "number" ? p.v : null;
    if (v === null) return null;
    return padTop + (1 - (v - domainMin) / span) * h;
  });

  let d = "";
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y === null) continue;
    d += (d ? " L" : "M") + `${xs[i].toFixed(1)} ${y.toFixed(1)}`;
  }
  if (!d) return null;

  const area = fill
    ? `${d} L${(padLeft + w).toFixed(1)} ${(padTop + h).toFixed(1)} L${padLeft.toFixed(1)} ${(padTop + h).toFixed(1)} Z`
    : null;

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
    timeAxis && points.length >= 2
      ? Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (points.length - 1)))
      : [];
  const tickIdxsUnique = Array.from(new Set(tickIdxs)).sort((a, b) => a - b);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = svgPaneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const xView = (xPx / rect.width) * viewW;
    const idxFloat = ((xView - padLeft) / w) * (points.length - 1);
    const index = Math.max(0, Math.min(points.length - 1, Math.round(idxFloat)));
    setHover({ index, xPx, yPx });
  };

  const onPointerLeave = () => setHover(null);

  const svg = (
    <svg
      width={typeof grid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${viewW} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block", width: typeof grid ? "100%" : typeof width === "string" ? width : undefined, maxWidth: "100%" }}
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
            const y = padTop + (1 - (tick - domainMin) / span) * h;
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
      {fill && area ? <path d={area} fill={stroke} fillOpacity="0.16" stroke="none" /> : null}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
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
      {hover && ys[hover.index] !== null ? (
        <circle
          cx={xs[hover.index]}
          cy={ys[hover.index] as number}
          r={3.2}
          fill="rgba(10,18,30,0.9)"
          stroke={stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );

  const hoverValue = hover ? points[hover.index]?.v : null;
  const hoverTime = hover ? points[hover.index]?.t : null;
  const hoverPoint = hover ? points[hover.index] : null;

  const labelWidth = grid ? 42 : 0;
  const gap = grid ? 8 : 0;
  return (
    <div
      style={{
        position: "relative",
        width: typeof width === "string" ? width : undefined,
        maxWidth: "100%",
        cursor: "crosshair",
        touchAction: "none"
      }}
    >
      <div style={{ display: "flex", gap, alignItems: "stretch" }}>
        {grid ? (
          <div style={{ width: labelWidth, height, position: "relative", pointerEvents: "none" }}>
            {grid.ticks.map((tick) => {
              const y = padTop + (1 - (tick - domainMin) / span) * h;
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
            const pct = ((idx / Math.max(1, points.length - 1)) * 100).toFixed(3);
            const label = formatAxisTime(points[idx]!.t);
            const align = idx === 0 ? "translateX(0)" : idx === points.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
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

      {hover && hoverTime && hoverPoint ? (
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
            minWidth: 140,
            maxWidth: 280,
            zIndex: 5
          }}
        >
          <div style={{ fontSize: 12, color: "rgba(229,231,235,0.8)", lineHeight: 1.2 }}>
            {tooltip?.getTime ? tooltip.getTime(hover.index, hoverPoint) : formatTime(hoverTime)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginTop: 4 }}>
            {tooltip?.getValue
              ? tooltip.getValue(hover.index, hoverPoint)
              : typeof hoverValue === "number"
                ? formatValue(hoverValue)
                : "--"}
          </div>
          {tooltip?.getSubValue ? (
            <div style={{ fontSize: 12, color: "rgba(229,231,235,0.75)", marginTop: 4 }}>
              {tooltip.getSubValue(hover.index, hoverPoint)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
