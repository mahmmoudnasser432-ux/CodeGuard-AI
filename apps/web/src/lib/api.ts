import { useCallback, useState } from "react";

// API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:5000";
const ANALYSES_API_PATH = "/api/analyses";
const AUTH_API_PATH = "/api/auth";

export type AnalysisEndpoint =
  | "code-review"
  | "security-analysis"
  | "performance-analysis"
  | "documentation-generator"
  | "interview-generator"
  | "repository-analysis"
  | "scoring-engine";

export type AnalysisLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp"
  | "csharp"
  | "php"
  | "go"
  | string;

export type AnalysisMode = "beginner" | "intermediate" | "expert" | "standard";

export interface AnalysisRequest {
  language: AnalysisLanguage;
  code: string;
  mode: AnalysisMode;
  repositoryContext?: {
    name: string;
    branch?: string;
    commitSha?: string;
  };
}

export interface AnalysisScore {
  overallScore: number;
  securityScore: number;
  qualityScore: number;
  performanceScore: number;
  maintainabilityScore: number;
  readabilityScore: number;
}

export interface AnalysisFinding {
  severity: "critical" | "high" | "medium" | "low" | "info" | string;
  category: string;
  title: string;
  description: string;
  recommendation: string;
  line?: number;
}

export type AnalysisSource =
  | "REAL_GEMINI"
  | "REAL_OPENAI"
  | "REAL_OPENROUTER"
  | "FALLBACK_ANALYZER"
  | "QUOTA_EXCEEDED";

export interface AnalysisResult {
  id: string;
  title: string;
  type: AnalysisEndpoint;
  summary: string;
  scores: AnalysisScore;
  findings: AnalysisFinding[];
  improvedCode?: string;
  generatedMarkdown?: string;
  projectId?: string;
  source?: AnalysisSource;
  analysisSource?: AnalysisSource;
  provider?: string;
  model?: string;
  degradationReason?: string;
}

export type AnalysisResponse = AnalysisResult;

export interface UserAnalysisStats {
  totalAnalyses: number;
  avgScore: number;
  reposScanned: number;
  docsGenerated: number;
  scoreByType: Record<string, number>;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  isEmailVerified?: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

// Token Storage Utilities (Access Token & User in localStorage; Refresh Token in HttpOnly cookie)
export const TOKEN_KEY = "codeguard_access_token";
export const USER_KEY = "codeguard_user";

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredTokens(accessToken: string, user?: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("codeguard_refresh_token"); // Clean up legacy key
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// Low-level fetch wrapper with Auth token and HttpOnly Refresh Token interceptor
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getStoredAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;
  let response = await fetch(url, { ...options, headers, credentials: options.credentials || "include" });

  // Handle 401 and try refresh using HttpOnly cookie
  if (response.status === 401 && !endpoint.includes("/api/auth/")) {
    try {
      const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setStoredTokens(data.accessToken);
        headers.set("Authorization", `Bearer ${data.accessToken}`);
        response = await fetch(url, { ...options, headers, credentials: options.credentials || "include" });
      } else {
        clearStoredTokens();
      }
    } catch {
      clearStoredTokens();
    }
  }

  return response;
}

// Direct Analysis Helper Functions
export async function analyzeCode(req: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await authenticatedFetch(`${ANALYSES_API_PATH}/security-analysis`, {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Analysis failed" }));
    throw new Error(err.message || err.error || "Analysis failed");
  }
  return res.json();
}

export async function analyzeRepository(req: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await authenticatedFetch(`${ANALYSES_API_PATH}/repository-analysis`, {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Repository analysis failed" }));
    throw new Error(err.message || err.error || "Repository analysis failed");
  }
  return res.json();
}

export async function generateDocumentation(req: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await authenticatedFetch(`${ANALYSES_API_PATH}/documentation-generator`, {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Documentation generation failed" }));
    throw new Error(err.message || err.error || "Documentation generation failed");
  }
  return res.json();
}

export async function generateInterview(req: AnalysisRequest): Promise<AnalysisResponse> {
  const res = await authenticatedFetch(`${ANALYSES_API_PATH}/interview-generator`, {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Interview generation failed" }));
    throw new Error(err.message || err.error || "Interview generation failed");
  }
  return res.json();
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ApiErrorResponse {
  message?: string;
  error?: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unexpected error occurred";
}

// Reusable API hook for React components
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApi = useCallback(async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(endpoint, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" })) as ApiErrorResponse;
        throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  const getRecentAnalyses = useCallback(async (limit: number = 20, offset: number = 0): Promise<ApiResponse<{ items: AnalysisResult[]; count: number }>> => {
    return fetchApi<{ items: AnalysisResult[]; count: number }>(`${ANALYSES_API_PATH}?limit=${limit}&offset=${offset}`);
  }, [fetchApi]);

  const getAnalysisStats = useCallback(async (): Promise<ApiResponse<UserAnalysisStats>> => {
    return fetchApi<UserAnalysisStats>(`${ANALYSES_API_PATH}/stats`);
  }, [fetchApi]);

  const deleteAnalysis = useCallback(async (id: string): Promise<ApiResponse<void>> => {
    const res = await fetchApi<void>(`${ANALYSES_API_PATH}/${id}`, {
      method: "DELETE",
    });
    return res;
  }, [fetchApi]);

  return {
    loading,
    error,
    getRecentAnalyses,
    getAnalysisStats,
    deleteAnalysis,
  };
}

export function showToast(message: string, type: "success" | "error" | "warning" | "info" = "info") {
  console[type === "error" ? "error" : type === "success" ? "log" : "warn"](
    `[${type.toUpperCase()}] ${message}`
  );
}
