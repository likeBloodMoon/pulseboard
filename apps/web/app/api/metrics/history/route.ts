import { NextResponse } from "next/server";
import { readRecentDeviceSamples } from "@/lib/persist";

export const runtime = "nodejs";

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
  ping?: Record<string, { avgMs?: number; lossPct?: number }>;
};

function bucketMsFromMinutes(minutes: number) {
  if (minutes <= 60) return 10_000; // 10s
  if (minutes <= 6 * 60) return 60_000; // 1m
  return 5 * 60_000; // 5m
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId") || "";
  if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId is required" }, { status: 400 });

  const minutesParam = parseInt(searchParams.get("minutes") || "60", 10);
  const minutes = Number.isFinite(minutesParam) ? Math.max(5, Math.min(minutesParam, 7 * 24 * 60)) : 60;
  const cutoffMs = Date.now() - minutes * 60 * 1000;
  const bucketMs = bucketMsFromMinutes(minutes);

  const samples = readRecentDeviceSamples(deviceId, cutoffMs, 5000);
  const buckets = new Map<number, {
      sumCpu: number; nCpu: number;
      sumMem: number; nMem: number;
      sumMemUsed: number; nMemUsed: number;
      memTotalGB?: number;
      sumDisk: number; nDisk: number;
      sumRx: number; nRx: number;
      sumTx: number; nTx: number;
      sumDns: number; nDns: number;
      ping: Record<string, { sumAvg: number; nAvg: number; sumLoss: number; nLoss: number }>;
      cpuTemp?: number | null;
      gpuTemp?: number | null
    }>();

  for (const s of samples) {
    const ts = new Date(s.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    const b = Math.floor(ts / bucketMs) * bucketMs;
    const cur = buckets.get(b) ?? {
      sumCpu: 0, nCpu: 0,
      sumMem: 0, nMem: 0,
      sumMemUsed: 0, nMemUsed: 0,
      sumDisk: 0, nDisk: 0,
      sumRx: 0, nRx: 0,
      sumTx: 0, nTx: 0,
      sumDns: 0, nDns: 0,
      ping: {}
    };

    if (typeof s.metrics.cpuPercent === "number") {
      cur.sumCpu += s.metrics.cpuPercent;
      cur.nCpu += 1;
    }
    if (typeof s.metrics.memUsedGB === "number" && typeof s.metrics.memTotalGB === "number" && s.metrics.memTotalGB > 0) {
      cur.sumMemUsed += s.metrics.memUsedGB;
      cur.nMemUsed += 1;
      cur.memTotalGB = Math.max(cur.memTotalGB ?? 0, s.metrics.memTotalGB);
      cur.sumMem += (s.metrics.memUsedGB / s.metrics.memTotalGB) * 100;
      cur.nMem += 1;
    }
    if (typeof s.metrics.diskUsedGB === "number" && typeof s.metrics.diskTotalGB === "number" && s.metrics.diskTotalGB > 0) {
      cur.sumDisk += (s.metrics.diskUsedGB / s.metrics.diskTotalGB) * 100;
      cur.nDisk += 1;
    }
    if (typeof s.metrics.cpuTempC === "number") cur.cpuTemp = s.metrics.cpuTempC;
    if (typeof s.metrics.gpuTempC === "number") cur.gpuTemp = s.metrics.gpuTempC;
    if (typeof s.metrics.net?.totals?.rxBps === "number") {
      cur.sumRx += s.metrics.net.totals.rxBps;
      cur.nRx += 1;
    }
    if (typeof s.metrics.net?.totals?.txBps === "number") {
      cur.sumTx += s.metrics.net.totals.txBps;
      cur.nTx += 1;
    }
    if (typeof s.metrics.net?.probe?.dns?.ms === "number") {
      cur.sumDns += s.metrics.net.probe.dns.ms;
      cur.nDns += 1;
    }
    const pings = s.metrics.net?.probe?.ping;
    if (Array.isArray(pings)) {
      for (const p of pings) {
        if (!p?.target) continue;
        const key = String(p.target);
        const agg = cur.ping[key] ?? { sumAvg: 0, nAvg: 0, sumLoss: 0, nLoss: 0 };
        if (typeof p.avgMs === "number") {
          agg.sumAvg += p.avgMs;
          agg.nAvg += 1;
        }
        if (typeof p.lossPct === "number") {
          agg.sumLoss += p.lossPct;
          agg.nLoss += 1;
        }
        cur.ping[key] = agg;
      }
    }

    buckets.set(b, cur);
  }

  const points: Point[] = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({
      t,
      cpu: v.nCpu ? v.sumCpu / v.nCpu : undefined,
      mem: v.nMem ? v.sumMem / v.nMem : undefined,
      memUsedGB: v.nMemUsed ? v.sumMemUsed / v.nMemUsed : undefined,
      memTotalGB: v.memTotalGB ?? undefined,
      disk: v.nDisk ? v.sumDisk / v.nDisk : undefined,
      cpuTemp: v.cpuTemp,
      gpuTemp: v.gpuTemp,
      rxBps: v.nRx ? v.sumRx / v.nRx : undefined,
      txBps: v.nTx ? v.sumTx / v.nTx : undefined,
      dnsMs: v.nDns ? v.sumDns / v.nDns : undefined,
      ping: Object.keys(v.ping).length
        ? Object.fromEntries(
            Object.entries(v.ping).map(([target, agg]) => [
              target,
              {
                avgMs: agg.nAvg ? agg.sumAvg / agg.nAvg : undefined,
                lossPct: agg.nLoss ? agg.sumLoss / agg.nLoss : undefined
              }
            ])
          )
        : undefined
    }));

  return NextResponse.json({ ok: true, minutes, bucketMs, points });
}
