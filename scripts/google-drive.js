/**
 * Cross-platform Google Drive path detection
 *
 * Automatically detects the correct Google Drive path based on platform:
 * - Mac/Linux: ~/Google Drive
 * - WSL: /mnt/c/Users/<windows-username>/Google Drive
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Get the base Google Drive path for this machine
 * @returns {string} Path to Google Drive folder
 */
export function getGoogleDriveBase() {
  // Check if WSL
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    if (version.toLowerCase().includes('microsoft')) {
      // Get Windows username
      const winUser = execSync('cmd.exe /c "echo %USERNAME%"', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim().replace(/\r/g, '');
      return path.join('/mnt/c/Users', winUser, 'Google Drive');
    }
  } catch (e) {
    // Not WSL or error reading, continue to default
  }

  // Default: ~/Google Drive (Mac/Linux)
  return path.join(os.homedir(), 'Google Drive');
}

/**
 * Get the path to the White Doe Inn shared drive
 * @returns {string} Path to WDI shared drive
 */
export function getWdiSharedDrive() {
  return path.join(
    getGoogleDriveBase(),
    'Shared drives',
    'White Doe Inn'
  );
}

/**
 * Get the path to the Kitchen Remodel folder
 * @returns {string} Path to Kitchen Remodel folder
 */
export function getKitchenRemodelFolder() {
  return path.join(
    getWdiSharedDrive(),
    'Operations',
    'Building and Maintenance ',  // Note: trailing space in folder name
    'Kitchen Remodel'
  );
}

/**
 * Get the path to the Kitchen Remodel spreadsheet in Google Drive
 * @returns {string} Path to Kitchen-Remodel-Tracker.xlsx
 */
export function getKitchenRemodelSpreadsheet() {
  return path.join(
    getKitchenRemodelFolder(),
    'Kitchen-Remodel-Tracker.xlsx'
  );
}
