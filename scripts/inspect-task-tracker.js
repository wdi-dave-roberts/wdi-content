#!/usr/bin/env node

import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';

const filePath = path.join(
  os.homedir(),
  'Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Weathertek Construction & Restoration/task-tracker-sample.xlsx'
);

async function inspect() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('=== SHEETS ===');
  workbook.worksheets.forEach(sheet => {
    console.log(`- ${sheet.name}`);
  });

  console.log('\n=== TASKS COLUMNS ===');
  const tasksSheet = workbook.getWorksheet('Tasks');
  const headerRow = tasksSheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    console.log(`  ${colNumber}: ${cell.value}`);
  });

  console.log('\n=== FIRST 3 TASK ROWS ===');
  for (let r = 2; r <= 4; r++) {
    const row = tasksSheet.getRow(r);
    const values = [];
    row.eachCell((cell, col) => {
      values.push(`${col}:${cell.value}`);
    });
    console.log(`  Row ${r}: ${values.join(' | ')}`);
  }
}

inspect().catch(console.error);
