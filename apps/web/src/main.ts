import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient } from "@angular/common/http";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideRouter, Routes } from "@angular/router";
import { provideStore } from "@ngrx/store";
import { AppComponent } from "./app/app.component";
import { DashboardComponent } from "./app/features/dashboard/dashboard.component";
import { AnalysisComponent } from "./app/features/analysis/analysis.component";
import { InterviewComponent } from "./app/features/interview/interview.component";

const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  { path: "dashboard", component: DashboardComponent },
  { path: "analysis", component: AnalysisComponent },
  { path: "interview", component: InterviewComponent }
];

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient(), provideAnimations(), provideStore()]
}).catch((error) => console.error(error));
