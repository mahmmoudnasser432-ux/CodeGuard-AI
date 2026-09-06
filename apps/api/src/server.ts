import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startRedisClient } from "./infrastructure/redis/client.js";

async function bootstrap() {
  if (env.DB_DIALECT === "postgres") {
    throw new Error(
      "DB_DIALECT=postgres runtime application mode is scheduled for Phase 6C-2 (PostgreSQL Repositories). " +
      "Currently, PostgreSQL configuration and migrations are verified, but domain repository adapters have not yet been implemented. " +
      "Application startup with DB_DIALECT=postgres is blocked to prevent accidental fallback or connection attempts to SQL Server."
    );
  }

  await startRedisClient();
  const { app } = createApp();

  app.listen(env.PORT, () => {
    console.log(`CodeGuard AI API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  console.error(`CodeGuard AI API failed to start: ${message}`);
  process.exit(1);
});
