#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * Usage:
 *   node run-migrations.js [up|down]
 *   
 * Examples:
 *   node run-migrations.js up     # Apply all pending migrations
 *   node run-migrations.js down   # Roll back the last migration
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const constants = require('./vars/constants');
const dbcon = require('./config/mysqlClient');

const migrationsDir = path.join(__dirname, 'migrations');
const direction = process.argv[2] || 'up';

async function runMigrations() {
  try {
    if (!constants.vals.dbconn) {
      constants.vals.dbconn = await dbcon.connection();
    }

    // Get all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    if (files.length === 0) {
      console.log('✅ No migrations to run');
      process.exit(0);
    }

    console.log(`\n🔄 Running migrations (direction: ${direction.toUpperCase()})\n`);

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const migration = require(migrationPath);

      try {
        if (direction === 'up') {
          console.log(`⬆️  Running UP: ${file}`);
          await migration.up();
        } else if (direction === 'down') {
          console.log(`⬇️  Running DOWN: ${file}`);
          await migration.down();
        } else {
          console.error(`❌ Unknown direction: ${direction}`);
          process.exit(1);
        }
        
        console.log(`✅ Completed: ${file}\n`);
      } catch (err) {
        console.error(`❌ Failed: ${file}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log('✅ All migrations completed successfully!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Migration runner failed:', err.message);
    process.exit(1);
  }
}

// Run migrations
runMigrations();
