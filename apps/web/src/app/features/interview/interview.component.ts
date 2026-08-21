import { Component } from "@angular/core";

@Component({
  selector: "cg-interview",
  standalone: true,
  template: `
    <section class="page-heading">
      <p>Candidate Evaluation</p>
      <h1>Generate technical interviews from real code and repository architecture.</h1>
    </section>
    <section class="panel">
      <h2>Evaluation Areas</h2>
      <div class="pill-row">
        <span>Technical depth</span>
        <span>Communication</span>
        <span>Problem solving</span>
        <span>Architecture judgment</span>
      </div>
    </section>
  `
})
export class InterviewComponent {}
