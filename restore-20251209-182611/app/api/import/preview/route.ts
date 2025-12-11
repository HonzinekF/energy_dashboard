import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { isAuthenticated } from "@/lib/auth";
import { previewSolaxBuffer, previewTigoCsv } from "@/lib/importers";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const SUPPORTED_DATASETS = ["solax", "tigo"] as const;

type Dataset = (typeof SUPPORTED_DATASETS)[number];

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Očekávám multipart/form-data s polem file" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const dataset = normalizeDataset(formData.get("dataset"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Soubor chybí" }, { status: 400 });
  }
  if (!dataset) {
    return NextResponse.json({ error: "Nepodporovaný dataset" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Soubor je příliš velký (limit 10 MB)" }, { status: 413 });
  }

  try {
    if (dataset === "solax") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const preview = await previewSolaxBuffer(buffer, file.name);
      const columns = preview.rows[0] ? Object.keys(preview.rows[0]) : [];
      return NextResponse.json({ dataset, columns, rows: preview.rows, intervalMinutes: preview.intervalMinutes });
    }

    // Tigo: píšeme do /tmp kvůli CSV parseru
    const tmpPath = `/tmp/${randomUUID()}_${safeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buffer);
    const preview = await previewTigoCsv(tmpPath);
    const columns = preview.rows[0] ? Object.keys(preview.rows[0]) : [];
    return NextResponse.json({ dataset, columns, rows: preview.rows, intervalMinutes: preview.intervalMinutes });
  } catch (error) {
    console.error("Preview importu selhal", error);
    return NextResponse.json({ error: "Náhled se nepodařilo vytvořit" }, { status: 500 });
  }
}

function normalizeDataset(value: FormDataEntryValue | null): Dataset | null {
  if (!value || typeof value !== "string") {
    return "solax";
  }
  const normalized = value.toLowerCase();
  return SUPPORTED_DATASETS.includes(normalized as Dataset) ? (normalized as Dataset) : null;
}

function safeFileName(name: string) {
  const base = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || path.basename(name);
}
