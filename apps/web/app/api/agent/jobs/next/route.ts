import { NextResponse } from "next/server";
import { ensureDevice, getDevice, verifyDeviceToken } from "@/lib/store";

export async function GET(req: Request) {
  const deviceId = req.headers.get("x-device-id") ?? "";
  const token = req.headers.get("x-agent-token") ?? "";

  if (!deviceId || !token) {
    return NextResponse.json({ ok: false, error: "deviceId and agentToken are required" }, { status: 401 });
  }

  const known = getDevice(deviceId);
  if (!known) {
    ensureDevice(deviceId, token);
  } else if (!verifyDeviceToken(deviceId, token)) {
    return NextResponse.json({ ok: false, error: "invalid agent token" }, { status: 401 });
  }

  // No jobs yet; return 204 to avoid 404 spam/poll
  return new NextResponse(null, { status: 204 });
}
