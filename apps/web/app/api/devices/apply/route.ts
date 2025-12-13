import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type ApplyBody = {
  deviceId: string;
  agentToken: string;
  baseUrl?: string;
};

const CONFIG_PATH = path.resolve(process.cwd(), "dist", "agent.config.json");
const APPLY_ENABLED = process.env.AGENT_APPLY_ENABLED === "true" || process.env.NODE_ENV !== "production";

export async function POST(req: Request) {
  try {
    if (!APPLY_ENABLED) {
      return NextResponse.json(
        { ok: false, error: "agent apply is disabled; set AGENT_APPLY_ENABLED=true to allow writes" },
        { status: 403 }
      );
    }

    const body = (await req.json()) as ApplyBody;
    if (!body.deviceId || !body.agentToken) {
      return NextResponse.json({ ok: false, error: "deviceId and agentToken are required" }, { status: 400 });
    }

    let config: any = {};
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      } catch (_err) {
        config = {};
      }
    }

    config.deviceId = body.deviceId;
    config.agentToken = body.agentToken;
    config.baseUrl = body.baseUrl || config.baseUrl || "http://localhost:3000";

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

    return NextResponse.json({ ok: true, path: CONFIG_PATH, config });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "failed to apply config" }, { status: 500 });
  }
}
