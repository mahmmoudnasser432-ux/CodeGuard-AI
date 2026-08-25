import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("Analyses API Endpoints", () => {
  it("GET /api/analyses returns recent analyses list", async () => {
    const { app } = createApp();
    const response = await request(app).get("/api/analyses?limit=10&offset=0");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("items");
    expect(response.body).toHaveProperty("count");
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it("GET /api/analyses/stats returns user dashboard statistics", async () => {
    const { app } = createApp();
    const response = await request(app).get("/api/analyses/stats");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("totalAnalyses");
    expect(response.body).toHaveProperty("avgScore");
    expect(response.body).toHaveProperty("reposScanned");
    expect(response.body).toHaveProperty("docsGenerated");
    expect(response.body).toHaveProperty("scoreByType");
  });

  it("GET /api/analyses/:id returns 404 for non-existent analysis", async () => {
    const { app } = createApp();
    const fakeId = "00000000-0000-0000-0000-000000009999";
    const response = await request(app).get(`/api/analyses/${fakeId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "ANALYSIS_NOT_FOUND" });
  });

  it("DELETE /api/analyses/:id returns 404 for non-existent analysis", async () => {
    const { app } = createApp();
    const fakeId = "00000000-0000-0000-0000-000000009999";
    const response = await request(app).delete(`/api/analyses/${fakeId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "ANALYSIS_NOT_FOUND_OR_UNAUTHORIZED" });
  });
});
