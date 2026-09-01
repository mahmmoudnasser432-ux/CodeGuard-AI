import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startRedisClient } from "./infrastructure/redis/client.js";

async function bootstrap() {
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
