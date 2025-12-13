import fs from "fs";
import path from "path";
import type { MetricSample } from "@/lib/store";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const DATA_DIR = process.env.PULSEBOARD_DATA_DIR
  ? path.resolve(process.env.PULSEBOARD_DATA_DIR)
  : path.join(REPO_ROOT, ".pulseboard");
const METRICS_DIR = path.join(DATA_DIR, "metrics");

function safeId(id: string) {
  return (id || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function deviceFile(deviceId: string) {
  return path.join(METRICS_DIR, `${safeId(deviceId)}.jsonl`);
}

export function appendMetricSample(sample: MetricSample) {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
  fs.appendFileSync(deviceFile(sample.deviceId), JSON.stringify(sample) + "\n", "utf8");
}

function readTailBytes(filePath: string, maxBytes: number) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

export function readRecentDeviceSamples(deviceId: string, cutoffMs: number, limit = 500): MetricSample[] {
  const filePath = deviceFile(deviceId);
  if (!fs.existsSync(filePath)) return [];

  const text = readTailBytes(filePath, 1024 * 1024); // last 1MB
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: MetricSample[] = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]) as MetricSample;
      const ts = parsed?.timestamp ? new Date(parsed.timestamp).getTime() : NaN;
      if (!Number.isFinite(ts)) continue;
      if (ts < cutoffMs) break;
      out.push(parsed);
      if (out.length >= limit) break;
    } catch {
      // ignore bad lines
    }
  }

  return out.reverse();
}

export function listPersistedDeviceIds(): string[] {
  if (!fs.existsSync(METRICS_DIR)) return [];
  return fs
    .readdirSync(METRICS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(/\.jsonl$/, ""));
}

export function readRecentSamplesAllDevices(cutoffMs: number, limit = 300): MetricSample[] {
  if (!fs.existsSync(METRICS_DIR)) return [];
  const files = fs.readdirSync(METRICS_DIR).filter((f) => f.endsWith(".jsonl"));
  const merged: MetricSample[] = [];

  for (const f of files) {
    const deviceId = f.replace(/\.jsonl$/, "");
    const deviceSamples = readRecentDeviceSamples(deviceId, cutoffMs, Math.min(limit, 200));
    merged.push(...deviceSamples);
  }

  merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return merged.slice(-limit);
}

