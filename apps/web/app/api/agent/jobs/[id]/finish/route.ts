import { NextResponse, type NextRequest } from "next/server";
import { ensureDevice, getDevice, verifyDeviceToken } from "@/lib/store";

async function authenticate(req: Request) {
  const deviceId = req.headers.get("x-device-id") ?? "";
  const token = req.headers.get("x-agent-token") ?? "";

  if (!deviceId || !token) {
    return NextResponse.json({ ok: false, error: "deviceId and agentToken are required" }, { status: 401 });
  }

  const known = getDevice(deviceId);
  if (!known) {
    ensureDevice(deviceId, token);
    return { deviceId };
  }

  if (!verifyDeviceToken(deviceId, token)) {
    return NextResponse.json({ ok: false, error: "invalid agent token" }, { status: 401 });
  }

  return { deviceId };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { status?: string; output?: unknown };
  if (!body?.status) {
    return NextResponse.json({ ok: false, error: "status is required" }, { status: 400 });
  }

  // For now we simply acknowledge the result; persistence/queue handling can be layered later.
  const { id } = await params;
  return NextResponse.json({ ok: true, jobId: id, deviceId: auth.deviceId });
}
