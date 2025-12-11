import { NextResponse } from "next/server";
import { listImportJobs } from "@/lib/importQueue";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      async function pushJobs() {
        const jobs = await listImportJobs();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(jobs)}\n\n`));
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
      }, 15000);

      const updates = setInterval(() => {
        pushJobs().catch((error) => console.error("SSE push failed", error));
      }, 5000);

      await pushJobs();

      const cleanup = () => {
        clearInterval(keepAlive);
        clearInterval(updates);
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      // handled via abort listener
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
