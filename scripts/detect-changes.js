import XLSX from 'xlsx-js-style';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getKitchenRemodelSpreadsheet } from './google-drive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', 'projects', 'kitchen-remodel');

const xlsxPath = getKitchenRemodelSpreadsheet();
const localXlsxPath = path.join(projectDir, 'Kitchen-Remodel-Tracker.xlsx');

// Compare Google Drive version to local version
const wbGD = XLSX.readFile(xlsxPath);
const wbLocal = XLSX.readFile(localXlsxPath);

console.log('Comparing Google Drive to local file...\n');

const sheetsToCheck = ['Schedule', 'Tasks', 'By Assignee', 'Materials', 'Vendors'];

for (const sheetName of sheetsToCheck) {
  const sheetGD = wbGD.Sheets[sheetName];
  const sheetLocal = wbLocal.Sheets[sheetName];
  if (!sheetGD || !sheetLocal) continue;

  const dataGD = XLSX.utils.sheet_to_json(sheetGD, { header: 1 });
  const dataLocal = XLSX.utils.sheet_to_json(sheetLocal, { header: 1 });

  let differences = [];

  for (let r = 0; r < Math.max(dataGD.length, dataLocal.length); r++) {
    const rowGD = dataGD[r] || [];
    const rowLocal = dataLocal[r] || [];

    for (let c = 0; c < Math.max(rowGD.length, rowLocal.length); c++) {
      const cellGD = rowGD[c] || '';
      const cellLocal = rowLocal[c] || '';

      if (String(cellGD) !== String(cellLocal)) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        differences.push({ row: r + 1, col: c + 1, cellRef, gd: cellGD, local: cellLocal });
      }
    }
  }

  if (differences.length > 0) {
    console.log(`${sheetName} sheet - ${differences.length} difference(s):`);
    for (const d of differences.slice(0, 10)) {
      console.log(`  Row ${d.row}, Col ${d.col} (${d.cellRef}): "${d.gd}" (GD) vs "${d.local}" (local)`);
    }
    if (differences.length > 10) {
      console.log(`  ... and ${differences.length - 10} more`);
    }
    console.log();
  }
}
