import { Component } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatToolbarModule } from "@angular/material/toolbar";

@Component({
  selector: "cg-root",
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatButtonModule, MatIconModule, MatToolbarModule],
  template: `
    <mat-toolbar class="shell-toolbar">
      <div class="brand">
        <mat-icon aria-hidden="true">verified_user</mat-icon>
        <span>CodeGuard AI</span>
      </div>
      <nav>
        <a mat-button routerLink="/dashboard">Dashboard</a>
        <a mat-button routerLink="/analysis">Review</a>
        <a mat-button routerLink="/interview">Interview</a>
      </nav>
    </mat-toolbar>
    <main class="shell-content">
      <router-outlet />
    </main>
  `
})
export class AppComponent {}
