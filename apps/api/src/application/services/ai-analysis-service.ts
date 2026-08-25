import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type { AnalysisResult, AnalysisType } from "../../domain/entities/analysis.js";
import type { CodeAnalysisRequest } from "../dto/analysis.dto.js";

function getAiRequestUrls(type: AnalysisType): string[] {
  const primary = new URL(`/${type}`, env.AI_SERVICE_URL);
  const urls = [primary.toString()];

  if (primary.hostname === "localhost") {
    const ipv4Url = new URL(primary.toString());
    ipv4Url.hostname = "127.0.0.1";
    urls.push(ipv4Url.toString());
  } else if (primary.hostname === "127.0.0.1") {
    const localhostUrl = new URL(primary.toString());
    localhostUrl.hostname = "localhost";
    urls.push(localhostUrl.toString());
  }

  return [...new Set(urls)];
}

function logFetchError(error: unknown, url: string) {
  console.error("AI FETCH ERROR URL:", url);
  console.error("AI ERROR:", error);

  if (error instanceof Error) {
    console.error("AI ERROR STACK:", error.stack);
    console.error("AI ERROR CAUSE:", error.cause);
  } else {
    console.error("AI ERROR CAUSE:", undefined);
  }
}

export class AiAnalysisService {
  async analyze(type: AnalysisType, request: CodeAnalysisRequest): Promise<AnalysisResult> {
    const body = JSON.stringify(request);

    console.log("env.AI_SERVICE_URL:", env.AI_SERVICE_URL);
    console.log("AI REQUEST BODY:", body);

    let response: Response | undefined;
    const urls = getAiRequestUrls(type);
    let lastError: unknown;

    for (const url of urls) {
      console.log("FULL REQUEST URL:", url);

      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(45_000)
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        logFetchError(error, url);
      }
    }

    if (lastError || !response) {
      throw lastError || new Error("No response received from AI service");
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`AI service returned HTTP ${response.status}: ${errText}`);
      throw new Error(`AI service failed with status ${response.status}`);
    }

    let payload: Omit<AnalysisResult, "id" | "type">;
    try {
      payload = (await response.json()) as Omit<AnalysisResult, "id" | "type">;
    } catch (error) {
      console.error("AI RESPONSE PARSE ERROR:", error);
      if (error instanceof Error) {
        console.error("AI RESPONSE PARSE ERROR STACK:", error.stack);
        console.error("AI RESPONSE PARSE ERROR CAUSE:", error.cause);
      }
      throw error;
    }

    return {
      id: crypto.randomUUID(),
      type,
      ...payload
    };
  }
}

