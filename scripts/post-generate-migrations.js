#!/usr/bin/env node

/**
 * Post-processes Drizzle migration files to add IF NOT EXISTS to CREATE TABLE statements
 */

const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "drizzle");

// Read all .sql files in the migrations directory
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));

files.forEach((file) => {
  const filePath = path.join(migrationsDir, file);
  let content = fs.readFileSync(filePath, "utf8");

  // Replace CREATE TABLE with CREATE TABLE IF NOT EXISTS
  // Also handle CREATE INDEX and CREATE UNIQUE INDEX
  content = content.replace(/CREATE TABLE (`\w+`)/g, "CREATE TABLE IF NOT EXISTS $1");
  content = content.replace(/CREATE INDEX (`\w+`)/g, "CREATE INDEX IF NOT EXISTS $1");
  content = content.replace(/CREATE UNIQUE INDEX (`\w+`)/g, "CREATE UNIQUE INDEX IF NOT EXISTS $1");

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✓ Processed ${file}`);
});

console.log(`\n✓ Successfully processed ${files.length} migration file(s)`);
