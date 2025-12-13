import { NextResponse } from "next/server";
import { getSamples } from "@/lib/store";
import { readRecentSamplesAllDevices, readRecentDeviceSamples } from "@/lib/persist";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId") || undefined;
  const limitParam = parseInt(searchParams.get("limit") || "300", 10);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 2000)) : 300;

  const memSamples = getSamples(limit);
  const haveMemory = deviceId ? memSamples.some((s) => s.deviceId === deviceId) : memSamples.length > 0;

  const cutoffMs = Date.now() - 60 * 60 * 1000; // last hour
  const diskSamples = haveMemory
    ? []
    : deviceId
      ? readRecentDeviceSamples(deviceId, cutoffMs, limit)
      : readRecentSamplesAllDevices(cutoffMs, limit);

  const samples = haveMemory ? memSamples : diskSamples;
  return NextResponse.json({ samples });
}
