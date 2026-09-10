import type pg from "pg";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startRedisClient, stopRedisClient } from "./infrastructure/redis/client.js";
import { createPostgresPool } from "./infrastructure/database/postgres.js";
import { runPostgresMigrations, verifyPostgresSchema } from "./infrastructure/database/postgres-migration-runner.js";

async function bootstrap() {
  await startRedisClient();

  let postgresPool: pg.Pool | undefined;
  if (env.DB_DIALECT === "postgres") {
    // 1. Create exactly one shared PostgreSQL pool for the application
    postgresPool = createPostgresPool(env);

    // 2. Verify database connectivity
    const ping = await postgresPool.query("SELECT 1 AS connected;");
    if (!ping.rows || ping.rows.length === 0) {
      throw new Error("PostgreSQL connection verification ping failed.");
    }
    console.log("[Bootstrap] PostgreSQL shared pool connected successfully.");

    // 3. Handle PostgreSQL schema migrations based on configured mode
    const mode = env.POSTGRES_MIGRATION_MODE;
    if (mode === "auto" || mode === "migrate") {
      console.log(`[Bootstrap] Running PostgreSQL migrations (mode: ${mode})...`);
      await runPostgresMigrations(undefined, postgresPool);
      console.log("[Bootstrap] PostgreSQL migrations verified.");
    } else if (mode === "validate") {
      console.log("[Bootstrap] Validating PostgreSQL schema with read-only checks (mode: validate)...");
      await verifyPostgresSchema(postgresPool);
      console.log("[Bootstrap] PostgreSQL schema validation passed.");
    } else {
      console.log(`[Bootstrap] PostgreSQL migration check skipped (mode: ${mode}).`);
    }
  }

  const { app, close } = createApp({
    dbDialect: env.DB_DIALECT,
    postgresPool,
  });

  const server = app.listen(env.PORT, () => {
    console.log(`CodeGuard AI API listening on port ${env.PORT} (dialect: ${env.DB_DIALECT})`);
  });

  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Lifecycle] Received ${signal}. Shutting down CodeGuard AI API gracefully...`);

    server.close(async () => {
      try {
        await close();
        if (postgresPool) {
          await postgresPool.end();
        }
        await stopRedisClient();
        console.log("[Lifecycle] Graceful shutdown complete.");
        process.exit(0);
      } catch (err) {
        console.error("[Lifecycle] Error during graceful shutdown:", err);
        process.exit(1);
      }
    });

    // Hard fallback timeout in case open sockets stall shutdown
    setTimeout(() => {
      console.error("[Lifecycle] Forcefully terminating after shutdown timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  console.error(`CodeGuard AI API failed to start: ${message}`);
  process.exit(1);
});
