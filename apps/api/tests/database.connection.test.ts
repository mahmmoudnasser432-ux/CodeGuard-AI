import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { sqlPool } from "../src/infrastructure/database/sqlserver.js";

describe("Database Connection", () => {
  beforeAll(async () => {
    await sqlPool.connect();
  });

  afterAll(async () => {
    await sqlPool.close();
  });

  it("should connect to the database", async () => {
    const result = await sqlPool.request().query("SELECT 1 as test");
    expect(result.recordset[0].test).toBe(1);
  });

  it("should be able to query the database", async () => {
    const result = await sqlPool.request().query("SELECT DB_NAME() as databaseName");
    expect(result.recordset[0].databaseName).toBeDefined();
  });
});