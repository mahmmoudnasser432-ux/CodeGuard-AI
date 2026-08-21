import dotenv from 'dotenv'; dotenv.config({ path: '../../.env' }); import { runMigrations } from './src/migration-runner.ts'; runMigrations();
