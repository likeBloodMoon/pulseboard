import { NextResponse } from "next/server";
import { enrollDevice, getDevices } from "@/lib/store";

export async function GET() {
  const devices = getDevices();
  return NextResponse.json({ devices });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  const name = body?.name?.trim() || "New Device";
  const { id, token } = enrollDevice(name);
  return NextResponse.json({ id, token });
}
