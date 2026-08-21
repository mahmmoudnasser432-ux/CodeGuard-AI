import { sqlPool } from "./src/infrastructure/database/sqlserver.ts";
import * as fs from "fs";
import * as path from "path";

console.log('Starting migration test...');

async function test() {
  try {
    console.log('Connecting to database...');
    await sqlPool.connect();
    console.log('Connected to database');

    const migrationsDir = path.resolve('../database/migrations');
    console.log('Migrations dir:', migrationsDir);

    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory does not exist');
      return;
    }

    const files = fs.readdirSync(migrationsDir);
    console.log('Files in migrations dir:', files);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sqlPool.close();
    console.log('Connection closed');
  }
}

test().catch(console.error);