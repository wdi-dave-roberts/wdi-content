#!/usr/bin/env node

/**
 * Updates the task-tracker-sample.xlsx in Google Drive
 * - Removes Est. Cost column
 * - Makes Assignee a dropdown from Vendors sheet
 */

import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';

const filePath = path.join(
  os.homedir(),
  'Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Weathertek Construction & Restoration/task-tracker-sample.xlsx'
);

async function updateSpreadsheet() {
  console.log('Reading spreadsheet...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const tasksSheet = workbook.getWorksheet('Tasks');
  const vendorsSheet = workbook.getWorksheet('Vendors');

  if (!tasksSheet) {
    console.error('Tasks sheet not found!');
    return;
  }

  // Find column indices by header name
  const headerRow = tasksSheet.getRow(1);
  let estCostCol = null;
  let assigneeCol = null;

  headerRow.eachCell((cell, colNumber) => {
    const value = cell.value?.toString().toLowerCase();
    if (value === 'est. cost' || value === 'est cost' || value === 'estimated cost') {
      estCostCol = colNumber;
    }
    if (value === 'assignee') {
      assigneeCol = colNumber;
    }
  });

  console.log(`Est. Cost column: ${estCostCol}`);
  console.log(`Assignee column: ${assigneeCol}`);

  // Remove Est. Cost column if found
  if (estCostCol) {
    console.log(`Removing column ${estCostCol} (Est. Cost)...`);
    tasksSheet.spliceColumns(estCostCol, 1);

    // Adjust assignee column index if it was after Est. Cost
    if (assigneeCol && assigneeCol > estCostCol) {
      assigneeCol--;
    }
  }

  // Set up Assignee dropdown from Vendors sheet
  if (assigneeCol) {
    console.log(`Setting up Assignee dropdown (column ${assigneeCol})...`);

    // Get vendor names from Vendors sheet
    const vendorNames = [];
    if (vendorsSheet) {
      vendorsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header
          const name = row.getCell(1).value;
          if (name) {
            vendorNames.push(name.toString());
          }
        }
      });
    }

    console.log(`Found ${vendorNames.length} vendors: ${vendorNames.join(', ')}`);

    // Apply data validation to Assignee column (rows 2-101)
    if (vendorNames.length > 0) {
      for (let row = 2; row <= 101; row++) {
        tasksSheet.getCell(row, assigneeCol).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${vendorNames.join(',')}"`]
        };
      }
    }
  }

  // Save the file
  console.log('Saving spreadsheet...');
  await workbook.xlsx.writeFile(filePath);
  console.log('✅ Done!');
}

updateSpreadsheet().catch(console.error);
