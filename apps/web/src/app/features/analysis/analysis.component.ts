import { Component, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { ApiService, AnalysisRequest } from "../../core/api.service";

@Component({
  selector: "cg-analysis",
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <section class="tool-layout">
      <div>
        <h1>AI Code Review</h1>
        <mat-form-field appearance="outline">
          <mat-label>Language</mat-label>
          <mat-select [(ngModel)]="payload.language">
            @for (language of languages; track language) {
              <mat-option [value]="language">{{ language }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Code</mat-label>
          <textarea matInput rows="16" [(ngModel)]="payload.code"></textarea>
        </mat-form-field>
        <button mat-flat-button color="primary" (click)="run()">Run Review</button>
      </div>
      <pre class="result">{{ result() }}</pre>
    </section>
  `
})
export class AnalysisComponent {
  readonly languages: AnalysisRequest["language"][] = ["typescript", "javascript", "python", "java", "cpp", "csharp", "php"];
  readonly result = signal("Results will appear here.");
  payload: AnalysisRequest = {
    language: "typescript",
    mode: "expert",
    code: "export function add(a: number, b: number) { return a + b; }"
  };

  constructor(private readonly api: ApiService) {}

  run() {
    this.result.set("Running analysis...");
    this.api.runCodeReview(this.payload).subscribe({
      next: (value) => this.result.set(JSON.stringify(value, null, 2)),
      error: () => this.result.set("Analysis service is unavailable. Start the API and AI service, then retry.")
    });
  }
}
