export interface Report {
  id: string;
  analysisId: string;
  format: "json" | "markdown" | "pdf";
  storageUrl?: string | null;
  content?: string | null;
  createdAt?: Date;
}
