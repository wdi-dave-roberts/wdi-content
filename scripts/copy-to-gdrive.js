#!/usr/bin/env node
/**
 * Copy Kitchen Remodel spreadsheet to Google Drive
 * Uses cross-platform path detection
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getKitchenRemodelSpreadsheet } from './google-drive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPath = path.join(__dirname, '..', 'projects', 'kitchen-remodel', 'Kitchen-Remodel-Tracker.xlsx');
const gdrivePath = getKitchenRemodelSpreadsheet();

if (!fs.existsSync(localPath)) {
  console.error(`Error: Local spreadsheet not found at ${localPath}`);
  console.error('Run "npm run task export" first to generate it.');
  process.exit(1);
}

console.log(`Copying to Google Drive...`);
console.log(`  From: ${localPath}`);
console.log(`  To:   ${gdrivePath}`);

try {
  // Ensure parent directory exists
  const parentDir = path.dirname(gdrivePath);
  if (!fs.existsSync(parentDir)) {
    console.error(`\nError: Google Drive folder not found:`);
    console.error(`  ${parentDir}`);
    console.error('\nMake sure Google Drive is synced and mounted.');
    process.exit(1);
  }

  fs.copyFileSync(localPath, gdrivePath);
  console.log('\n✓ Copied successfully');
} catch (err) {
  console.error(`\nError copying file: ${err.message}`);
  process.exit(1);
}
