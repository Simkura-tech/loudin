const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');

if (!process.env.DB_NAME) {
  console.error('migrate.js: DB_NAME is not set — refusing to run against an unknown database.');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Starting database migrations...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(255) NOT NULL UNIQUE,
        executed_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safe to run on existing DBs — no-op if column already present.
    await client.query(`
      ALTER TABLE migrations ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
    `);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let driftCount = 0;

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const currentHash = sha256(sql);

      const { rows } = await client.query(
        'SELECT id, content_hash FROM migrations WHERE name = $1',
        [file]
      );

      if (rows.length > 0) {
        const storedHash = rows[0].content_hash;

        if (storedHash === null) {
          // Backfill: migration ran before hash tracking was added.
          await client.query(
            'UPDATE migrations SET content_hash = $1 WHERE name = $2',
            [currentHash, file]
          );
          console.log(`⏭️  Skipping ${file} (already executed — hash recorded)`);
        } else if (storedHash !== currentHash) {
          // File was edited after it ran. The DB schema is out of sync.
          // This is always a bug — create a new migration instead of editing old ones.
          console.warn(
            `\n⚠️  DRIFT DETECTED: ${file} was modified after it ran.\n` +
            `   Stored:  ${storedHash}\n` +
            `   Current: ${currentHash}\n` +
            `   The edits are NOT in the database. Create a new migration to apply them.\n`
          );
          driftCount++;
        } else {
          console.log(`⏭️  Skipping ${file} (already executed)`);
        }
        continue;
      }

      console.log(`🔄 Running ${file}...`);
      await client.query(sql);

      await client.query(
        'INSERT INTO migrations (name, content_hash) VALUES ($1, $2)',
        [file, currentHash]
      );

      console.log(`✅ Completed ${file}\n`);
    }

    if (driftCount > 0) {
      console.warn(
        `\n⚠️  ${driftCount} migration file(s) were edited after they ran — schema may be stale.\n` +
        '   Fix: add a new migration file with the intended changes.\n' +
        '   If this is a dev database, run: npm run db:reset\n'
      );
    }

    console.log('All migrations completed successfully!');

  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log('\n✨ Database is up to date!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  });
