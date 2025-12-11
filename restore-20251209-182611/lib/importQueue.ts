import { fetchJobs, modifyJob, saveJob } from "./importStore";
import type { ImportJob } from "./importTypes";

export async function recordImportJob(job: ImportJob) {
  return saveJob(job);
}

export async function listImportJobs(limit = 10) {
  return fetchJobs(limit);
}

export async function updateImportJob(id: string, data: Partial<Pick<ImportJob, "status" | "message">>) {
  return modifyJob(id, data);
}
