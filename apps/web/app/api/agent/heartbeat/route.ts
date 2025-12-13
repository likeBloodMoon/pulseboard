import { NextResponse } from "next/server";
import { addMetricSample, ensureDevice, getDevice, touchDevicePresence, verifyDeviceToken } from "@/lib/store";
import { appendMetricSample } from "@/lib/persist";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as any;
    const deviceId = body?.deviceId ?? req.headers.get("x-device-id") ?? "";
    const token = req.headers.get("x-agent-token") ?? body?.agentToken ?? "";
    const safeDeviceId = deviceId || "unknown";

    // Enforce token for heartbeats; allow auto-provision only when a token is supplied
    if (!safeDeviceId || !token) {
      return NextResponse.json({ ok: false, error: "deviceId and agentToken are required" }, { status: 401 });
    }

    const known = getDevice(safeDeviceId);
    if (!known) {
      ensureDevice(safeDeviceId, token, body?.hostname);
    } else if (!verifyDeviceToken(safeDeviceId, token)) {
      return NextResponse.json({ ok: false, error: "invalid agent token" }, { status: 401 });
    }

    // Accept either { metrics: {...} } or the metrics object directly
    const metricsCandidate = body?.metrics ?? body;
    const metrics = metricsCandidate && typeof metricsCandidate === "object" ? metricsCandidate : {};

    const sample = {
      timestamp: metrics?.timestamp || body?.timestamp || new Date().toISOString(),
      deviceId: safeDeviceId,
      agentVersion: body?.agentVersion ?? "unknown",
      hostname: body?.hostname ?? "unknown",
      metrics: {
        cpuPercent: metrics?.cpuPercent,
        memUsedGB: metrics?.memUsedGB,
        memTotalGB: metrics?.memTotalGB,
        diskUsedGB: metrics?.diskUsedGB,
        diskFreeGB: metrics?.diskFreeGB,
        diskTotalGB: metrics?.diskTotalGB,
        diskLabel: metrics?.diskLabel ?? null,
        disks: metrics?.disks,
        processCount: metrics?.processCount,
        uptimeSec: metrics?.uptimeSec,
        cpuTempC: metrics?.cpuTempC,
        gpuTempC: metrics?.gpuTempC,
        gpuMemoryTempC: metrics?.gpuMemoryTempC,
        boardTempC: metrics?.boardTempC,
        cpuTempMaxC: metrics?.cpuTempMaxC,
        gpuHotspotTempC: metrics?.gpuHotspotTempC,
        temps: metrics?.temps,
        tempSource: metrics?.tempSource ?? metrics?.tempProvider ?? null,
        tempReason: metrics?.tempReason ?? metrics?.tempStatus ?? null,
        net: metrics?.net
      }
    } as const;

    addMetricSample(sample);
    try {
      appendMetricSample(sample);
    } catch {
      // persistence is best-effort
    }

    touchDevicePresence(safeDeviceId, body?.hostname);

    console.info(
      `[heartbeat] host=${body?.hostname ?? "unknown"} cpu=${metrics?.cpuPercent ?? "?"}% mem=${
        metrics?.memUsedGB ?? "?"
      }/${metrics?.memTotalGB ?? "?"} ts=${metrics?.timestamp ?? "now"}`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "invalid payload" }, { status: 400 });
  }
}
