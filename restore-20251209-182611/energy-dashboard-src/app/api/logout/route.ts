import { NextResponse } from "next/server";
import { clearSession, isAuthenticated } from "@/lib/auth";

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  await clearSession();
  return NextResponse.json({ ok: true });
}
