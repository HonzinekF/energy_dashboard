export type ImportJob = {
  id: string;
  filePath: string;
  status: "queued" | "processing" | "done" | "failed";
  createdAt: string;
  message?: string | null;
};
