import { NextResponse } from "next/server";
import { getSamples } from "@/lib/store";

export async function GET() {
  const samples = getSamples();
  const last = samples[samples.length - 1];
  return NextResponse.json({
    count: samples.length,
    last
  });
}
