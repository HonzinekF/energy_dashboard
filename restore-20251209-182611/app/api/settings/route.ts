import { NextResponse } from "next/server";
import { getDefaultAnalysisConfig } from "@/lib/analysis";

export async function GET() {
  return NextResponse.json(getDefaultAnalysisConfig());
}
