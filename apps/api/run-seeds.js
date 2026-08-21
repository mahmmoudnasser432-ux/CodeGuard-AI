import { sqlPool } from './src/infrastructure/database/sqlserver.ts';
import * as fs from 'fs';
import * as path from 'path';

async function runSeeds() {
  try {
    console.log('Connecting to database...');
    await sqlPool.connect();
    console.log('Connected to database');

    // Get all seed files from the database/seeds directory
    const seedsDir = path.resolve('../../database/seeds');
    console.log('Looking for seeds in:', seedsDir);
    const files = fs.readdirSync(seedsDir);

    // Filter for SQL files and sort them to ensure proper order
    const seedFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (seedFiles.length === 0) {
      console.log('No seed files found');
      return;
    }

    console.log(`Found ${seedFiles.length} seed files to process`);

    // Execute each seed file
    for (const file of seedFiles) {
      console.log(`\nProcessing seed: ${file}`);

      const filePath = path.join(seedsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      // Split by GO command (SQL Server batch separator) and execute each batch
      const batches = sqlContent.split(/\s+GO\s+/i);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i].trim();
        if (batch) {
          console.log(`  Executing batch ${i + 1}/${batches.length}...`);
          await sqlPool.request().query(batch);
        }
      }

      console.log(`  ✓ Seed ${file} completed`);
    }

    console.log('\n✅ All seeds completed successfully!');
  } catch (error) {
    console.error('❌ Error running seeds:', error);
    throw error;
  } finally {
    await sqlPool.close();
    console.log('Database connection closed');
  }
}

// Run the seed runner if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('run-seeds.js')) {
  runSeeds().catch(error => {
    console.error('❌ Seed runner failed:', error);
    process.exit(1);
  });
}

export { runSeeds };
