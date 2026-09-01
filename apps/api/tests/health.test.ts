import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("health", () => {
  it("returns service health", async () => {
    const { app } = createApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("codeguard-api");
    expect(response.body).toHaveProperty("version");
    expect(response.body).toHaveProperty("uptime");
    expect(response.body).toHaveProperty("timestamp");
  });

  it("returns readiness state", async () => {
    const { app } = createApp();
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.service).toBe("codeguard-api");
    expect(response.body).toHaveProperty("dependencies");
    expect(response.body.dependencies).toHaveProperty("redis");
  });
});
