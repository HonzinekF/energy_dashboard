import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { isAuthenticated } from "@/lib/auth";
import { recordImportJob } from "@/lib/importQueue";
import { importSolaxBuffer, importTigoCsv } from "@/lib/importers";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const SUPPORTED_DATASETS = ["solax", "tigo"] as const;

type Dataset = (typeof SUPPORTED_DATASETS)[number];

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = extractFiles(formData);
  const dataset = normalizeDataset(formData.get("dataset"));

  if (!files.length) {
    return NextResponse.json({ error: "Soubor chybí" }, { status: 400 });
  }
  if (!dataset) {
    return NextResponse.json({ error: "Nepodporovaný dataset" }, { status: 400 });
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_SIZE_BYTES * 3) {
    return NextResponse.json({ error: "Součty souborů přesahují limit 30 MB" }, { status: 413 });
  }

  const results = [];

  for (const file of files) {
    const extension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json({ error: `Nepodporovaný formát: ${file.name}` }, { status: 415 });
    }
    if (!isExtensionAllowed(dataset, extension)) {
      return NextResponse.json(
        { error: `Soubor ${file.name} neodpovídá datasetu ${dataset} (povolené jsou ${ALLOWED_EXTENSIONS.join(", ")})` },
        { status: 415 },
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `Soubor ${file.name} je příliš velký (limit 10 MB)` }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const tmpPath = `/tmp/${randomUUID()}_${safeFileName(file.name)}`;
    await writeFile(tmpPath, buffer);

    let summary = null;
    try {
      if (dataset === "solax" || extension === ".xlsx" || extension === ".xls") {
        summary = await importSolaxBuffer(buffer, file.name);
      } else if (dataset === "tigo" || extension === ".csv") {
        summary = await importTigoCsv(tmpPath);
      }
    } catch (error) {
      console.error("Import souboru selhal", error);
      const message = error instanceof Error ? error.message : "neznamá chyba";
      return NextResponse.json({ error: `Zpracování souboru ${file.name} se nezdařilo: ${message}` }, { status: 500 });
    }

    if (!summary) {
      return NextResponse.json({ error: `Nepodporovaný typ datasetu pro ${file.name}.` }, { status: 400 });
    }

    const backendResponse = await forwardToBackend(tmpPath, dataset);
    const job = await recordImportJob({
      id: backendResponse.jobId ?? randomUUID(),
      filePath: tmpPath,
      status: backendResponse.status ?? "queued",
      createdAt: new Date().toISOString(),
      message: backendResponse.error ?? backendResponse.message ?? null,
    });

    results.push({
      fileName: file.name,
      summary: { ...summary, fileName: file.name },
      backendResponse,
      job,
    });
  }

  const last = results[results.length - 1];
  return NextResponse.json({
    ...last?.backendResponse,
    job: last?.job,
    summary: results.map((item) => ({ ...item.summary, dataset })),
  });
}

async function forwardToBackend(filePath: string, dataset: Dataset) {
  if (!process.env.PY_BACKEND_URL) {
    return { stored: filePath, status: "queued" };
  }

  try {
    const res = await fetch(process.env.PY_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "excel-import", filePath, dataset }),
    });
    if (!res.ok) {
      console.warn("Import backend responded with error", res.status, await res.text());
      return { stored: filePath, status: "queued", error: "Backend zpracování se nepodařilo spustit." };
    }
    const payload = await res.json().catch(() => ({}));
    return {
      stored: filePath,
      status: payload.status ?? "processing",
      jobId: payload.jobId,
      message: payload.message,
    };
  } catch (error) {
    console.error("Import backend request failed", error);
    return { stored: filePath, status: "queued", error: "Nelze kontaktovat backend." };
  }
}

function extractFiles(formData: FormData): File[] {
  const files: File[] = [];
  const maybeSingle = formData.get("file");
  if (maybeSingle instanceof File) {
    files.push(maybeSingle);
  }
  const multi = formData.getAll("files");
  for (const entry of multi) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }
  return files;
}

function normalizeDataset(value: FormDataEntryValue | null): Dataset | null {
  if (!value || typeof value !== "string") {
    return "solax";
  }
  const normalized = value.toLowerCase();
  return SUPPORTED_DATASETS.includes(normalized as Dataset) ? (normalized as Dataset) : null;
}

function isExtensionAllowed(dataset: Dataset, extension: string) {
  if (dataset === "tigo") {
    return extension === ".csv";
  }
  return extension === ".xlsx" || extension === ".xls";
}

function safeFileName(name: string) {
  const base = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "upload";
}
