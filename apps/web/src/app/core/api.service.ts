import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

export interface AnalysisRequest {
  language: "javascript" | "typescript" | "python" | "java" | "cpp" | "csharp" | "php";
  code: string;
  mode: "beginner" | "intermediate" | "expert";
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly baseUrl = "http://localhost:5000/api";

  constructor(private readonly http: HttpClient) {}

  runCodeReview(payload: AnalysisRequest) {
    return this.http.post(`${this.baseUrl}/analyses/code-review`, payload);
  }
}
