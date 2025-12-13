import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const DEFAULT_LOG_CANDIDATES = [
  path.resolve(process.cwd(), "agent-metrics.log"),
  path.resolve(process.cwd(), "..", "agent-metrics.log"),
  path.resolve(process.cwd(), "..", "..", "agent-metrics.log")
];

function resolveLogPath() {
  if (process.env.METRICS_LOG_PATH) {
    const explicit = path.resolve(process.env.METRICS_LOG_PATH);
    if (fs.existsSync(explicit)) return explicit;
  }
  for (const candidate of DEFAULT_LOG_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const minutesParam = parseInt(searchParams.get("minutes") || "10", 10);
    const minutes = Number.isFinite(minutesParam) ? Math.max(1, Math.min(minutesParam, 720)) : 10; // cap at 12h

    const logPath = resolveLogPath();
    if (!logPath) {
      return NextResponse.json({ ok: false, error: "Log file not found. Set METRICS_LOG_PATH or place agent-metrics.log in the repo root." }, { status: 404 });
    }

    const cutoff = Date.now() - minutes * 60 * 1000;

    const maxBytes = 16 * 1024 * 1024; // cap reads for perf
    const text = readTailBytes(logPath, maxBytes);
    const all = text.split(/\r?\n/).filter(Boolean);

    const keep: string[] = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const line = all[i];
      try {
        const obj = JSON.parse(line);
        const ts = obj?.timestamp ? new Date(obj.timestamp).getTime() : NaN;
        if (!Number.isFinite(ts)) continue;
        if (ts < cutoff) break;
        keep.push(line);
      } catch {
        // ignore bad lines
      }
    }

    const lines = keep.reverse();

    const body = lines.join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": 'attachment; filename="agent-metrics-last-10m.log"',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to read log" }, { status: 500 });
  }
}
