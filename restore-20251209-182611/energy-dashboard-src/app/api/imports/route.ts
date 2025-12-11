import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listImportJobs } from "@/lib/importQueue";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const jobs = await listImportJobs();
  return NextResponse.json(jobs);
}
