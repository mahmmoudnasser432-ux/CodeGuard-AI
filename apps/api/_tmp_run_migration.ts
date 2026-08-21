console.log('Temp file running');
import { runMigrations } from './src/migration-runner.ts';
runMigrations().catch(error => {
  console.error(error);
  process.exit(1);
});