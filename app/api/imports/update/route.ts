import { NextResponse } from "next/server";
import { updateImportJob } from "@/lib/importQueue";

type UpdatePayload = {
  jobId?: string;
  status?: "queued" | "processing" | "done" | "failed";
  message?: string | null;
  secret?: string;
};

const IMPORT_WEBHOOK_SECRET = process.env.IMPORT_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!IMPORT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "IMPORT_WEBHOOK_SECRET není nastaven" }, { status: 500 });
  }

  let payload: UpdatePayload;
  try {
    payload = (await request.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: "Neplatný JSON" }, { status: 400 });
  }

  if (!payload.jobId || payload.secret !== IMPORT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Neplatná autorizace nebo jobId" }, { status: 401 });
  }

  const nextStatus = payload.status;
  if (nextStatus && !["queued", "processing", "done", "failed"].includes(nextStatus)) {
    return NextResponse.json({ error: "Neplatný status" }, { status: 400 });
  }

  const updated = await updateImportJob(payload.jobId, {
    status: nextStatus,
    message: payload.message,
  });

  if (!updated) {
    return NextResponse.json({ error: "Job nenalezen" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job: updated });
}
