#!/usr/bin/env node

/**
 * Creates Task Tracker Excel files that can be uploaded to Google Sheets
 *
 * Usage:
 *   node scripts/create-task-tracker.js
 *
 * Creates two files in the project root:
 *   - task-tracker-blank.xlsx (for GC)
 *   - task-tracker-sample.xlsx (for testing)
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  priorities: ['Critical', 'High', 'Normal', 'Low'],
  priorityColors: {
    'Critical': 'FFEA4335',
    'High': 'FFFA903E',
    'Normal': 'FFFBBC04',
    'Low': 'FF34A853'
  },
  owners: ['Owner', 'Contractor'],
  statuses: ['Pending', 'Scheduled', 'In Progress', 'Completed', 'Blocked', 'Cancelled'],
  statusColors: {
    'Completed': 'FF34A853',
    'In Progress': 'FF4285F4',
    'Blocked': 'FFEA4335',
    'Cancelled': 'FF9E9E9E'
  },
  categories: [
    'Demolition', 'Structural', 'Mechanical', 'Electrical', 'Plumbing',
    'Finish', 'Fixtures', 'Cleanup', 'Inspection', 'Equipment', 'Windows & Doors'
  ],
  issueStatuses: ['Open', 'In Progress', 'Blocked', 'Resolved'],
  issueStatusColors: {
    'Open': 'FFFBBC04',
    'In Progress': 'FF4285F4',
    'Blocked': 'FFEA4335',
    'Resolved': 'FF34A853'
  }
};

// Sample data
const SAMPLE_VENDORS = [
  ['Danny\'s Construction', 'General Contractor', 'General', '555-0100', 'danny@example.com', 'Primary GC'],
  ['Sparky Electric', 'Subcontractor', 'Electrical', '555-0101', 'sparky@example.com', ''],
  ['Pete\'s Plumbing', 'Subcontractor', 'Plumbing', '555-0102', 'pete@example.com', ''],
  ['Precision Flooring', 'Subcontractor', 'Flooring', '555-0103', 'floors@example.com', 'Hardwood specialist'],
  ['ABC Cabinets', 'Supplier', 'Cabinetry', '555-0104', 'sales@abccabinets.com', ''],
  ['Home Depot', 'Supplier', 'Multiple', '555-0105', '', 'Materials'],
  ['County Inspections', 'Government', 'General', '555-0106', '', 'Building dept']
];

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getSampleTasks() {
  const today = new Date();

  return [
    ['1', '', 'Kitchen Demolition', today, addDays(today, 5), 'Contractor', 'Danny\'s Construction', '', 'In Progress', 'High', 'Demolition', 'Remove existing cabinets, counters, and flooring', 2500, 'Kitchen', today, ''],
    ['1.1', '1', 'Remove upper cabinets', today, addDays(today, 1), 'Contractor', 'Danny\'s Construction', '', 'Completed', 'Normal', 'Demolition', '', 500, 'Kitchen - North wall', today, 'Completed ahead of schedule'],
    ['1.2', '1', 'Remove lower cabinets', addDays(today, 1), addDays(today, 2), 'Contractor', 'Danny\'s Construction', '1.1', 'In Progress', 'Normal', 'Demolition', '', 500, 'Kitchen', today, ''],
    ['1.3', '1', 'Remove flooring', addDays(today, 2), addDays(today, 4), 'Contractor', 'Danny\'s Construction', '1.2', 'Pending', 'Normal', 'Demolition', 'Vinyl sheet removal', 800, 'Kitchen', today, ''],
    ['2', '', 'Electrical Rough-In', addDays(today, 5), addDays(today, 10), 'Contractor', 'Sparky Electric', '1', 'Scheduled', 'High', 'Electrical', 'New circuits for appliances', 3500, 'Kitchen', today, ''],
    ['2.1', '2', 'Run new circuits', addDays(today, 5), addDays(today, 7), 'Contractor', 'Sparky Electric', '', 'Pending', 'Normal', 'Electrical', '', 2000, 'Kitchen', today, ''],
    ['2.2', '2', 'Install outlet boxes', addDays(today, 7), addDays(today, 9), 'Contractor', 'Sparky Electric', '2.1', 'Pending', 'Normal', 'Electrical', '', 1000, 'Kitchen', today, ''],
    ['3', '', 'Plumbing Rough-In', addDays(today, 5), addDays(today, 12), 'Contractor', 'Pete\'s Plumbing', '1', 'Scheduled', 'High', 'Plumbing', 'Move sink location, add dishwasher line', 4000, 'Kitchen', today, ''],
    ['4', '', 'Order Cabinets', today, addDays(today, 2), 'Owner', '', '', 'In Progress', 'Critical', 'Equipment', 'Custom cabinets - 6 week lead time', 15000, '', today, 'Need to finalize selection ASAP'],
    ['5', '', 'Cabinet Installation', addDays(today, 45), addDays(today, 50), 'Contractor', 'Danny\'s Construction', '2, 3, 4', 'Pending', 'Normal', 'Fixtures', '', 2000, 'Kitchen', today, ''],
    ['6', '', 'Final Inspection', addDays(today, 55), addDays(today, 56), 'Owner', 'County Inspections', '5', 'Pending', 'Normal', 'Inspection', 'Schedule with county', 150, '', today, '']
  ];
}

function getSampleIssues() {
  const today = new Date();

  return [
    ['I1', 'Asbestos found in flooring', 'Discovered during demo - need abatement before continuing', 'Open', 'Critical', '1.3, 2, 3', today, '', 'Called abatement company, waiting for quote'],
    ['I2', 'Cabinet delivery delayed', 'Supplier says 2 week delay due to material shortage', 'In Progress', 'High', '4, 5', today, '', 'Negotiating expedited shipping'],
    ['I3', 'Permit clarification needed', 'Inspector wants to review electrical plan before approval', 'Resolved', 'Normal', '2', today, today, 'Resolved - plan approved with minor changes']
  ];
}

async function createWorkbook(includeSampleData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Task Tracker Generator';
  workbook.created = new Date();

  // Create sheets in order
  createStartHereSheet(workbook);
  createTasksSheet(workbook, includeSampleData);
  createIssuesSheet(workbook, includeSampleData);
  createVendorsSheet(workbook, includeSampleData);

  return workbook;
}

function createStartHereSheet(workbook) {
  const sheet = workbook.addWorksheet('START HERE', {
    properties: { tabColor: { argb: 'FF4285F4' } }
  });

  sheet.getColumn(1).width = 100;

  const instructions = [
    { text: 'TASK TRACKER - QUICK START GUIDE', style: 'title' },
    { text: '' },
    { text: 'Welcome! This spreadsheet helps you track project tasks, subtasks, and issues.' },
    { text: '' },
    { text: 'HOW TO ADD A NEW TASK', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: '1. Go to the "Tasks" tab' },
    { text: '2. Find the first empty row' },
    { text: '3. Fill in the REQUIRED columns (highlighted in yellow):' },
    { text: '   • ID - Enter the task number (1, 2, 3 for main tasks)' },
    { text: '   • Name - What is this task?' },
    { text: '   • Start Date - When does it begin?' },
    { text: '   • End Date - When should it finish?' },
    { text: '   • Owner - Who is responsible? (Owner or Contractor)' },
    { text: '' },
    { text: '4. Use the dropdown menus for fields like Priority, Status, and Category' },
    { text: '' },
    { text: 'HOW TO CREATE A SUBTASK', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: '1. First, create the parent task (see above)' },
    { text: '2. Create a new row for your subtask' },
    { text: '3. For the ID, use the parent ID + dot + number (e.g., "1.1", "1.2")' },
    { text: '4. In the "Parent" column, enter the parent task ID (e.g., "1")' },
    { text: '' },
    { text: 'Example: If task "Kitchen Demo" has ID "1", its subtasks will be "1.1", "1.2", etc.' },
    { text: '' },
    { text: 'HOW TO SET TASK DEPENDENCIES', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: 'The "Depends On" column lets you specify which tasks must finish first.' },
    { text: '1. In the "Depends On" cell, enter the task ID(s)' },
    { text: '2. For multiple dependencies, separate with commas: "1, 2.1, 3"' },
    { text: '' },
    { text: 'HOW TO LOG AN ISSUE', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: 'Issues are problems that affect one or more tasks.' },
    { text: '1. Go to the "Issues" tab' },
    { text: '2. Fill in: ID (I1, I2...), Title, Status, Priority' },
    { text: '3. In "Affected Tasks", list which task IDs are impacted' },
    { text: '4. Add the Created date' },
    { text: '' },
    { text: 'COLUMN GUIDE', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: '' },
    { text: 'TASKS TAB:' },
    { text: '• ID - Task number (1, 1.1, 1.2, 2, etc.) - YOU ENTER THIS' },
    { text: '• Parent - Parent task ID for subtasks (optional)' },
    { text: '• Name - Task description (required)' },
    { text: '• Start/End - Dates (required)' },
    { text: '• Owner - Who is responsible: Owner or Contractor (required)' },
    { text: '• Assignee - Specific vendor/person doing the work' },
    { text: '• Depends On - Task IDs that must finish before this one starts' },
    { text: '• Status - Current state of the task' },
    { text: '• Priority - Urgency level (color-coded!)' },
    { text: '• Category - Type of work' },
    { text: '• Description - Additional details' },
    { text: '• Est. Cost - Estimated cost' },
    { text: '• Location - Where in the project' },
    { text: '• Last Updated - When you last changed this row' },
    { text: '• Comments - Any notes' },
    { text: '' },
    { text: 'ISSUES TAB:' },
    { text: '• ID - Issue number (I1, I2, I3...)' },
    { text: '• Title - Brief description of the issue' },
    { text: '• Description - Full details' },
    { text: '• Status - Open, In Progress, Blocked, or Resolved' },
    { text: '• Priority - Urgency (color-coded)' },
    { text: '• Affected Tasks - Which task IDs this issue impacts' },
    { text: '• Created - Date the issue was logged' },
    { text: '• Resolved - Date the issue was resolved' },
    { text: '• Comments - Any notes' },
    { text: '' },
    { text: 'TIPS', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: '• Use dropdowns whenever available - they prevent errors' },
    { text: '• The "Vendors" tab lists available assignees' },
    { text: '• Priority colors: Red = Critical, Orange = High, Yellow = Normal, Green = Low' },
    { text: '• If you need a new vendor, add them to the "Vendors" tab first' },
    { text: '• Update "Last Updated" when you make changes to a task' },
    { text: '' },
    { text: 'NEED HELP?', style: 'header' },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { text: 'Contact the project owner with any questions.' }
  ];

  instructions.forEach((item, index) => {
    const row = sheet.getRow(index + 1);
    const cell = row.getCell(1);
    cell.value = item.text;

    if (item.style === 'title') {
      cell.font = { size: 18, bold: true };
    } else if (item.style === 'header') {
      cell.font = { size: 12, bold: true };
    }

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8F9FA' }
    };
  });

  // Protect sheet
  sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true });
}

function createTasksSheet(workbook, includeSampleData) {
  const sheet = workbook.addWorksheet('Tasks', {
    properties: { tabColor: { argb: 'FF4285F4' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = [
    'ID', 'Parent', 'Name', 'Start', 'End', 'Owner', 'Assignee',
    'Depends On', 'Status', 'Priority', 'Category', 'Description',
    'Est. Cost', 'Location', 'Last Updated', 'Comments'
  ];

  const widths = [8, 8, 30, 12, 12, 12, 20, 15, 12, 10, 15, 35, 12, 15, 15, 35];

  // Set column widths
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = widths[i];
  });

  // Add header row
  const headerRow = sheet.getRow(1);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4285F4' }
    };
    cell.alignment = { horizontal: 'center' };
  });

  // Add data validation for dropdowns (rows 2-101)
  for (let row = 2; row <= 101; row++) {
    // Owner dropdown (column 6)
    sheet.getCell(row, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.owners.join(',')}"`]
    };

    // Status dropdown (column 9)
    sheet.getCell(row, 9).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.statuses.join(',')}"`]
    };

    // Priority dropdown (column 10)
    sheet.getCell(row, 10).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.priorities.join(',')}"`]
    };

    // Category dropdown (column 11)
    sheet.getCell(row, 11).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.categories.join(',')}"`]
    };

    // Date format for Start and End
    sheet.getCell(row, 4).numFmt = 'yyyy-mm-dd';
    sheet.getCell(row, 5).numFmt = 'yyyy-mm-dd';

    // Currency format for Est. Cost
    sheet.getCell(row, 13).numFmt = '$#,##0.00';

    // Date format for Last Updated
    sheet.getCell(row, 15).numFmt = 'yyyy-mm-dd';

    // Yellow background for required columns in row 2 as hint
    if (row === 2) {
      [1, 3, 4, 5, 6].forEach(col => {
        sheet.getCell(row, col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF9C4' }
        };
      });
    }
  }

  // Add conditional formatting for Priority column
  CONFIG.priorities.forEach(priority => {
    sheet.addConditionalFormatting({
      ref: 'J2:J101',
      rules: [{
        type: 'containsText',
        operator: 'containsText',
        text: priority,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: CONFIG.priorityColors[priority] }
          },
          font: { color: { argb: 'FFFFFFFF' } }
        }
      }]
    });
  });

  // Add conditional formatting for Status column
  Object.entries(CONFIG.statusColors).forEach(([status, color]) => {
    sheet.addConditionalFormatting({
      ref: 'I2:I101',
      rules: [{
        type: 'containsText',
        operator: 'containsText',
        text: status,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: color }
          },
          font: { color: { argb: 'FFFFFFFF' } }
        }
      }]
    });
  });

  // Add sample data if requested
  if (includeSampleData) {
    const tasks = getSampleTasks();
    tasks.forEach((task, index) => {
      const row = sheet.getRow(index + 2);
      task.forEach((value, colIndex) => {
        row.getCell(colIndex + 1).value = value;
      });
    });
  }
}

function createIssuesSheet(workbook, includeSampleData) {
  const sheet = workbook.addWorksheet('Issues', {
    properties: { tabColor: { argb: 'FFEA4335' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = [
    'ID', 'Title', 'Description', 'Status', 'Priority',
    'Affected Tasks', 'Created', 'Resolved', 'Comments'
  ];

  const widths = [8, 25, 40, 12, 10, 20, 12, 12, 40];

  // Set column widths
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = widths[i];
  });

  // Add header row
  const headerRow = sheet.getRow(1);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEA4335' }
    };
    cell.alignment = { horizontal: 'center' };
  });

  // Add data validation for dropdowns (rows 2-101)
  for (let row = 2; row <= 101; row++) {
    // Status dropdown (column 4)
    sheet.getCell(row, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.issueStatuses.join(',')}"`]
    };

    // Priority dropdown (column 5)
    sheet.getCell(row, 5).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${CONFIG.priorities.join(',')}"`]
    };

    // Date format
    sheet.getCell(row, 7).numFmt = 'yyyy-mm-dd';
    sheet.getCell(row, 8).numFmt = 'yyyy-mm-dd';
  }

  // Add conditional formatting for Priority column
  CONFIG.priorities.forEach(priority => {
    sheet.addConditionalFormatting({
      ref: 'E2:E101',
      rules: [{
        type: 'containsText',
        operator: 'containsText',
        text: priority,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: CONFIG.priorityColors[priority] }
          },
          font: { color: { argb: 'FFFFFFFF' } }
        }
      }]
    });
  });

  // Add conditional formatting for Status column
  Object.entries(CONFIG.issueStatusColors).forEach(([status, color]) => {
    sheet.addConditionalFormatting({
      ref: 'D2:D101',
      rules: [{
        type: 'containsText',
        operator: 'containsText',
        text: status,
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: color }
          },
          font: { color: { argb: 'FFFFFFFF' } }
        }
      }]
    });
  });

  // Add sample data if requested
  if (includeSampleData) {
    const issues = getSampleIssues();
    issues.forEach((issue, index) => {
      const row = sheet.getRow(index + 2);
      issue.forEach((value, colIndex) => {
        row.getCell(colIndex + 1).value = value;
      });
    });
  }
}

function createVendorsSheet(workbook, includeSampleData) {
  const sheet = workbook.addWorksheet('Vendors', {
    properties: { tabColor: { argb: 'FF34A853' } },
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = ['Name', 'Type', 'Trade', 'Phone', 'Email', 'Notes'];
  const widths = [25, 18, 15, 15, 25, 35];

  // Set column widths
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = widths[i];
  });

  // Add header row
  const headerRow = sheet.getRow(1);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF34A853' }
    };
    cell.alignment = { horizontal: 'center' };
  });

  // Always add sample vendors (needed for assignee dropdown)
  SAMPLE_VENDORS.forEach((vendor, index) => {
    const row = sheet.getRow(index + 2);
    vendor.forEach((value, colIndex) => {
      row.getCell(colIndex + 1).value = value;
    });
  });
}

async function main() {
  const outputDir = path.join(__dirname, '..');

  console.log('Creating Task Tracker spreadsheets...\n');

  // Create blank version
  console.log('1. Creating blank template...');
  const blankWorkbook = await createWorkbook(false);
  const blankPath = path.join(outputDir, 'task-tracker-blank.xlsx');
  await blankWorkbook.xlsx.writeFile(blankPath);
  console.log(`   ✓ Created: ${blankPath}`);

  // Create sample version
  console.log('2. Creating sample data version...');
  const sampleWorkbook = await createWorkbook(true);
  const samplePath = path.join(outputDir, 'task-tracker-sample.xlsx');
  await sampleWorkbook.xlsx.writeFile(samplePath);
  console.log(`   ✓ Created: ${samplePath}`);

  console.log('\n✅ Done!\n');
  console.log('Next steps:');
  console.log('1. Upload to Google Drive');
  console.log('2. Right-click > Open with > Google Sheets');
  console.log('3. File > Save as Google Sheets (to enable full editing)\n');
}

main().catch(console.error);
