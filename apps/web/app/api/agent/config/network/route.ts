import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CONFIG_PATH = path.resolve(process.cwd(), "dist", "agent.config.json");
const APPLY_ENABLED = process.env.AGENT_APPLY_ENABLED === "true" || process.env.NODE_ENV !== "production";

type Body = {
  networkProbeIntervalSeconds?: number;
  networkTargets?: string[];
  networkDnsTestHost?: string;
  enablePublicIp?: boolean;
};

export async function POST(req: Request) {
  try {
    if (!APPLY_ENABLED) {
      return NextResponse.json(
        { ok: false, error: "agent apply is disabled; set AGENT_APPLY_ENABLED=true to allow writes" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Body;

    let config: any = {};
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      } catch {
        config = {};
      }
    }

    if (typeof body.networkProbeIntervalSeconds === "number") {
      config.networkProbeIntervalSeconds = Math.max(2, Math.min(body.networkProbeIntervalSeconds, 300));
    }
    if (Array.isArray(body.networkTargets)) {
      config.networkTargets = body.networkTargets
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, 12);
    }
    if (typeof body.networkDnsTestHost === "string") {
      config.networkDnsTestHost = body.networkDnsTestHost.trim().slice(0, 200);
    }
    if (typeof body.enablePublicIp === "boolean") {
      config.enablePublicIp = body.enablePublicIp;
    }

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

    return NextResponse.json({ ok: true, path: CONFIG_PATH, config });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "failed to apply network config" }, { status: 500 });
  }
}

