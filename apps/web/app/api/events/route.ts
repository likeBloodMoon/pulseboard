import { NextResponse } from "next/server";
import { subscribeToMetrics, type MetricSample } from "@/lib/store";

export const runtime = "nodejs"; // ensure streaming works

export async function GET() {
  let unsubscribe: (() => void) | null = null;
  let keepAlive: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: MetricSample) => {
        const data = `event: metric\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      };
      unsubscribe = subscribeToMetrics(send);

      keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
      }, 15000);

      controller.enqueue(new TextEncoder().encode("event: ready\ndata: {}\n\n"));
    },
    cancel() {
      // Clean up SSE listeners
      if (unsubscribe) unsubscribe();
      if (keepAlive) clearInterval(keepAlive);
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache"
    }
  });
}
