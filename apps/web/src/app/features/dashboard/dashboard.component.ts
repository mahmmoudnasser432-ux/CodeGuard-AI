import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "cg-dashboard",
  standalone: true,
  imports: [MatIconModule],
  template: `
    <section class="page-heading">
      <p>Engineering Intelligence</p>
      <h1>Repository health, security, and delivery risk in one command center.</h1>
    </section>

    <section class="metric-grid" aria-label="Platform metrics">
      @for (metric of metrics; track metric.label) {
        <article class="metric-card">
          <mat-icon aria-hidden="true">{{ metric.icon }}</mat-icon>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      }
    </section>

    <section class="workspace-grid">
      <div class="panel">
        <h2>Recent Activity</h2>
        @for (activity of activities; track activity) {
          <p>{{ activity }}</p>
        }
      </div>
      <div class="panel">
        <h2>Repository Trends</h2>
        <div class="trend-bars">
          <span style="height: 42%"></span>
          <span style="height: 58%"></span>
          <span style="height: 74%"></span>
          <span style="height: 68%"></span>
          <span style="height: 86%"></span>
        </div>
      </div>
    </section>
  `
})
export class DashboardComponent {
  readonly metrics = [
    { label: "Projects", value: "24", icon: "folder_managed" },
    { label: "Analyses", value: "1,284", icon: "analytics" },
    { label: "Security", value: "91", icon: "shield" },
    { label: "Performance", value: "87", icon: "speed" },
    { label: "Quality", value: "94", icon: "workspace_premium" },
    { label: "Debt", value: "18%", icon: "trending_down" }
  ];

  readonly activities = [
    "Payment API review completed with 3 medium findings.",
    "Repository health improved by 8 points on main.",
    "Interview kit generated for senior backend candidate."
  ];
}
