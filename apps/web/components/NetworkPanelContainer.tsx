"use client";

import { useEffect, useState } from "react";
import type { MetricSample } from "@/lib/store";
import { NetworkPanel } from "@/components/NetworkPanel";

type Point = { t: number; rxBps?: number; txBps?: number; dnsMs?: number; ping?: Record<string, { avgMs?: number; lossPct?: number }> };

export function NetworkPanelContainer({
  deviceId,
  latest,
  stale,
  minutes = 60
}: {
  deviceId?: string | null;
  latest?: MetricSample;
  stale?: boolean;
  minutes?: number;
}) {
  const [history, setHistory] = useState<Point[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!deviceId) return;
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

  return <NetworkPanel latest={latest} history={history} stale={!!stale} />;
}

