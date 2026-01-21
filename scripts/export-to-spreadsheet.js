#!/usr/bin/env node
/**
 * Export kitchen remodel data.json to Excel and CSV (for Google Sheets import)
 *
 * Usage: node scripts/export-to-spreadsheet.js
 *
 * Outputs:
 *   - projects/kitchen-remodel/Kitchen-Remodel-Tracker.xlsx
 *   - projects/kitchen-remodel/exports/ (CSV files for Sheets import)
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', 'projects', 'kitchen-remodel');
const dataPath = path.join(projectDir, 'data.json');
const exportsDir = path.join(projectDir, 'exports');

// Load data
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Create exports directory
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Helper to get vendor name by ID
function getVendorName(vendorRef) {
  if (!vendorRef) return '';
  const id = vendorRef.replace('vendor:', '');
  const vendor = data.vendors.find(v => v.id === id);
  return vendor ? vendor.name : vendorRef;
}

// Helper to format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  return dateStr; // Keep as YYYY-MM-DD for spreadsheet sorting
}

// ============ SCHEDULE TAB (DEPENDENCY ORDER) ============

// Build a flat list of all tasks and subtasks with their info
const allItems = [];
const itemMap = {}; // id -> item for quick lookup

for (const task of data.tasks) {
  const item = {
    id: task.id,
    name: task.name,
    type: 'TASK',
    status: task.status || '',
    start: task.start || '',
    end: task.end || '',
    assignee: getVendorName(task.assignee) || '',
    category: task.category || '',
    dependencies: task.dependencies || [],
    parentId: null
  };
  allItems.push(item);
  itemMap[task.id] = item;

  for (const sub of (task.subtasks || [])) {
    const subItem = {
      id: sub.id,
      name: sub.name,
      type: 'subtask',
      status: sub.status || task.status || '',
      start: sub.start || task.start || '',
      end: sub.end || sub.start || task.end || '',
      assignee: getVendorName(sub.assignee) || getVendorName(task.assignee) || '',
      category: task.category || '',
      dependencies: sub.dependencies || [],
      parentId: task.id
    };
    allItems.push(subItem);
    itemMap[sub.id] = subItem;
  }
}

// Topological sort based on dependencies
function topologicalSort(items, itemMap) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set(); // for cycle detection
  const noDeps = []; // items with no dependencies (roots)

  function visit(item) {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) {
      // Cycle detected - just add it anyway
      return;
    }
    visiting.add(item.id);

    // Visit dependencies first
    for (const depId of item.dependencies) {
      if (itemMap[depId]) {
        visit(itemMap[depId]);
      }
    }

    visiting.delete(item.id);
    visited.add(item.id);
    sorted.push(item);
  }

  // Start with items that have no dependencies
  for (const item of items) {
    if (item.dependencies.length === 0) {
      noDeps.push(item);
    }
  }

  // Visit all items
  for (const item of items) {
    visit(item);
  }

  return sorted;
}

const sortedItems = topologicalSort(allItems, itemMap);

// Calculate proposed dates based on dependency order
// Start from today and schedule sequentially based on dependencies
const proposedDates = {};
const today = new Date().toISOString().split('T')[0];

function getNextWorkday(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  // Skip weekends
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}

function getLatestDepEndDate(item) {
  let latest = today;
  for (const depId of item.dependencies) {
    const depDates = proposedDates[depId];
    if (depDates && depDates.end > latest) {
      latest = depDates.end;
    }
  }
  return latest;
}

// Calculate proposed dates
for (const item of sortedItems) {
  const depEndDate = getLatestDepEndDate(item);
  const proposedStart = item.dependencies.length > 0 ? getNextWorkday(depEndDate) : (item.start || today);

  // If item has explicit dates, use them; otherwise propose based on deps
  const actualStart = item.start || proposedStart;
  const actualEnd = item.end || actualStart;

  proposedDates[item.id] = {
    start: actualStart,
    end: actualEnd,
    proposedStart: proposedStart
  };
}

// Build reverse dependency map for schedule issues
const scheduleRequiredFor = {};
for (const item of allItems) {
  for (const depId of item.dependencies) {
    if (!scheduleRequiredFor[depId]) {
      scheduleRequiredFor[depId] = [];
    }
    scheduleRequiredFor[depId].push(item.id);
  }
}

// Detect issues
function detectIssues(item) {
  const issues = [];
  const dates = proposedDates[item.id];

  // Check if scheduled before dependencies complete
  for (const depId of item.dependencies) {
    const depDates = proposedDates[depId];
    if (depDates && dates.start && depDates.end) {
      if (dates.start <= depDates.end) {
        issues.push(`Scheduled before ${depId} ends (${depDates.end})`);
      }
    }
  }

  // Check for missing assignee on critical path tasks
  if (!item.assignee && item.status !== 'completed') {
    issues.push('No assignee');
  }

  // Check for missing dates on tasks with dependents
  if (!item.start && scheduleRequiredFor[item.id] && scheduleRequiredFor[item.id].length > 0) {
    issues.push('No date set but blocks other tasks');
  }

  return issues;
}

// Build schedule rows
const scheduleRows = [];
scheduleRows.push([
  'Order', 'Type', 'Task ID', 'Name', 'Status', 'Current Start', 'Current End',
  'Proposed Start', 'Assignee', 'Dependencies', 'Issues'
]);

let order = 1;
for (const item of sortedItems) {
  const dates = proposedDates[item.id];
  const issues = detectIssues(item);

  scheduleRows.push([
    order++,
    item.type,
    item.id,
    item.type === 'subtask' ? `  ${item.name}` : item.name,
    item.status,
    formatDate(item.start),
    formatDate(item.end),
    formatDate(dates.proposedStart),
    item.assignee || 'Needs Assignment',
    item.dependencies.join(', '),
    issues.join('; ')
  ]);
}

// ============ TASKS + SUBTASKS (HIERARCHICAL) TAB ============

// Build reverse dependency map (task ID -> list of tasks that depend on it)
const requiredFor = {};
for (const task of data.tasks) {
  for (const depId of (task.dependencies || [])) {
    if (!requiredFor[depId]) {
      requiredFor[depId] = [];
    }
    requiredFor[depId].push(task.id);
  }
  for (const sub of (task.subtasks || [])) {
    for (const depId of (sub.dependencies || [])) {
      if (!requiredFor[depId]) {
        requiredFor[depId] = [];
      }
      requiredFor[depId].push(sub.id);
    }
  }
}

const taskHierarchyRows = [];
taskHierarchyRows.push([
  'Type', 'Task ID', 'Name', 'Status', 'Start Date', 'End Date',
  'Assignee', 'Category', 'Dependencies', 'Required For', 'Material Deps', 'Notes', 'Comments'
]);

// Helper to get material dependency names
function getMaterialDeps(matDeps) {
  if (!matDeps || matDeps.length === 0) return '';
  // matDeps can be array of objects (task level) or array of strings (subtask level)
  return matDeps.map(m => typeof m === 'string' ? m : m.id).join(', ');
}

for (const task of data.tasks) {
  const deps = (task.dependencies || []).join(', ');
  const taskAssignee = getVendorName(task.assignee);
  const taskMatDeps = getMaterialDeps(task.materialDependencies);
  const taskRequiredFor = (requiredFor[task.id] || []).join(', ');
  // Add parent task row
  taskHierarchyRows.push([
    'TASK',
    task.id,
    task.name,
    task.status || '',
    formatDate(task.start),
    formatDate(task.end),
    taskAssignee || 'Needs Assignment',
    task.category || '',
    deps,
    taskRequiredFor,
    taskMatDeps,
    task.notes || '',
    '' // Comments column for collaboration
  ]);

  // Add subtasks indented below parent (inherit parent values unless overridden)
  for (const sub of (task.subtasks || [])) {
    const subAssignee = getVendorName(sub.assignee) || getVendorName(task.assignee);
    const subStatus = sub.status || task.status || '';
    const subStart = sub.start || task.start;
    const subEnd = sub.end || sub.start || task.end;
    const subDeps = (sub.dependencies || []).join(', ');
    const subMatDeps = getMaterialDeps(sub.materialDependencies);

    const subRequiredFor = (requiredFor[sub.id] || []).join(', ');
    taskHierarchyRows.push([
      '  ↳ subtask',
      sub.id,
      `    ${sub.name}`,
      subStatus,
      formatDate(subStart),
      formatDate(subEnd),
      subAssignee || 'Needs Assignment',
      task.category || '', // always inherit category from parent
      subDeps,
      subRequiredFor,
      subMatDeps,
      sub.notes || '',
      '' // Comments column
    ]);
  }
}

// ============ MATERIALS TAB ============
// Build map of material ID -> subtask IDs that depend on it
const materialDependsOn = {};
for (const task of data.tasks) {
  for (const sub of (task.subtasks || [])) {
    for (const matId of (sub.materialDependencies || [])) {
      if (!materialDependsOn[matId]) {
        materialDependsOn[matId] = [];
      }
      materialDependsOn[matId].push(sub.id);
    }
  }
}

const materialsRows = [];
materialsRows.push([
  'Material ID', 'Material Name', 'Status', 'For Task',
  'Depends On', 'Quantity', 'Expected Date', 'Detail', 'Notes', 'Comments'
]);

for (const task of data.tasks) {
  for (const mat of (task.materialDependencies || [])) {
    const dependsOn = (materialDependsOn[mat.id] || []).join(', ');
    materialsRows.push([
      mat.id,
      mat.name,
      mat.status || '',
      task.id,
      dependsOn,
      mat.quantity || '',
      formatDate(mat.expectedDate),
      mat.detail || '',
      mat.notes || '',
      '' // Comments column
    ]);
  }
}

// ============ VENDORS TAB ============
const vendorsRows = [];
vendorsRows.push([
  'Vendor ID', 'Name', 'Type', 'Trade', 'Status', 'Contact', 'Notes'
]);

for (const vendor of data.vendors) {
  vendorsRows.push([
    vendor.id,
    vendor.name,
    vendor.type || '',
    vendor.trade || '',
    vendor.status || '',
    vendor.contact || '',
    '' // Notes column
  ]);
}

// ============ GC ACTION NEEDED TAB ============
const gcActionRows = [];
gcActionRows.push([
  'Note ID', 'Created', 'Action Needed', 'Related Task', 'GC Response'
]);

for (const note of (data.notes || [])) {
  // Extract task reference from tags
  const taskTag = (note.tags || []).find(t => t.startsWith('task:'));
  const relatedTask = taskTag ? taskTag.replace('task:', '') : '';

  gcActionRows.push([
    note.id,
    note.created,
    note.content,
    relatedTask,
    '' // GC Response column - editable
  ]);
}

// ============ CREATE EXCEL WORKBOOK ============
const wb = XLSX.utils.book_new();

// Add sheets
const wsScheduleData = XLSX.utils.aoa_to_sheet(scheduleRows);
const wsTaskHierarchyData = XLSX.utils.aoa_to_sheet(taskHierarchyRows);
const wsMaterialsData = XLSX.utils.aoa_to_sheet(materialsRows);
const wsVendorsData = XLSX.utils.aoa_to_sheet(vendorsRows);
const wsGCActionData = XLSX.utils.aoa_to_sheet(gcActionRows);

// Set column widths
wsTaskHierarchyData['!cols'] = [
  { wch: 12 }, // Type
  { wch: 28 }, // Task ID
  { wch: 45 }, // Name (wider to accommodate indentation)
  { wch: 15 }, // Status
  { wch: 12 }, // Start
  { wch: 12 }, // End
  { wch: 20 }, // Assignee
  { wch: 12 }, // Category
  { wch: 30 }, // Dependencies
  { wch: 30 }, // Required For
  { wch: 30 }, // Material Deps
  { wch: 60 }, // Notes
  { wch: 40 }, // Comments
];

wsMaterialsData['!cols'] = [
  { wch: 30 }, // Material ID
  { wch: 35 }, // Material Name
  { wch: 15 }, // Status
  { wch: 30 }, // For Task
  { wch: 35 }, // Depends On
  { wch: 10 }, // Quantity
  { wch: 15 }, // Expected Date
  { wch: 25 }, // Detail
  { wch: 40 }, // Notes
  { wch: 40 }, // Comments
];

wsVendorsData['!cols'] = [
  { wch: 20 }, // ID
  { wch: 30 }, // Name
  { wch: 15 }, // Type
  { wch: 20 }, // Trade
  { wch: 10 }, // Status
  { wch: 25 }, // Contact
  { wch: 40 }, // Notes
];

wsGCActionData['!cols'] = [
  { wch: 15 }, // Note ID
  { wch: 12 }, // Created
  { wch: 70 }, // Action Needed
  { wch: 25 }, // Related Task
  { wch: 50 }, // GC Response
];

wsScheduleData['!cols'] = [
  { wch: 6 },  // Order
  { wch: 10 }, // Type
  { wch: 28 }, // Task ID
  { wch: 40 }, // Name
  { wch: 15 }, // Status
  { wch: 12 }, // Current Start
  { wch: 12 }, // Current End
  { wch: 14 }, // Proposed Start
  { wch: 20 }, // Assignee
  { wch: 35 }, // Dependencies
  { wch: 50 }, // Issues
];

// Add sheet protection to all sheets except GC Action Needed
// Note: xlsx library protection is limited - full protection requires Excel/Sheets UI
wsScheduleData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsTaskHierarchyData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsMaterialsData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsVendorsData['!protect'] = { sheet: true, objects: true, scenarios: true };
// wsGCActionData is NOT protected - GC can edit

XLSX.utils.book_append_sheet(wb, wsScheduleData, 'Schedule');
XLSX.utils.book_append_sheet(wb, wsTaskHierarchyData, 'Tasks');
XLSX.utils.book_append_sheet(wb, wsMaterialsData, 'Materials');
XLSX.utils.book_append_sheet(wb, wsVendorsData, 'Vendors');
XLSX.utils.book_append_sheet(wb, wsGCActionData, 'GC Action Needed');

// Write Excel file
const xlsxPath = path.join(projectDir, 'Kitchen-Remodel-Tracker.xlsx');
XLSX.writeFile(wb, xlsxPath);
console.log(`✓ Excel file created: ${xlsxPath}`);

// ============ CREATE CSV FILES FOR GOOGLE SHEETS ============
const csvOptions = { FS: ',', RS: '\n' };

fs.writeFileSync(
  path.join(exportsDir, 'schedule.csv'),
  XLSX.utils.sheet_to_csv(wsScheduleData, csvOptions)
);
fs.writeFileSync(
  path.join(exportsDir, 'tasks.csv'),
  XLSX.utils.sheet_to_csv(wsTaskHierarchyData, csvOptions)
);
fs.writeFileSync(
  path.join(exportsDir, 'materials.csv'),
  XLSX.utils.sheet_to_csv(wsMaterialsData, csvOptions)
);
fs.writeFileSync(
  path.join(exportsDir, 'vendors.csv'),
  XLSX.utils.sheet_to_csv(wsVendorsData, csvOptions)
);
fs.writeFileSync(
  path.join(exportsDir, 'gc-action-needed.csv'),
  XLSX.utils.sheet_to_csv(wsGCActionData, csvOptions)
);

console.log(`✓ CSV files created in: ${exportsDir}`);
console.log('\nTo import into Google Sheets:');
console.log('  1. Create a new Google Sheet');
console.log('  2. File > Import > Upload each CSV');
console.log('  3. Choose "Insert new sheet(s)" for each');
console.log('\nOr use the Excel file directly - both work!');
