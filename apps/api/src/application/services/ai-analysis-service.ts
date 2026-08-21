import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type { AnalysisResult, AnalysisType } from "../../domain/entities/analysis.js";
import type { CodeAnalysisRequest } from "../dto/analysis.dto.js";

export class AiAnalysisService {
  async analyze(type: AnalysisType, request: CodeAnalysisRequest): Promise<AnalysisResult> {
    const response = await fetch(`${env.AI_SERVICE_URL}/${type}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(45_000)
    });

    if (!response.ok) {
      throw new Error(`AI service failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Omit<AnalysisResult, "id" | "type">;
    return {
      id: crypto.randomUUID(),
      type,
      ...payload
    };
  }
}
