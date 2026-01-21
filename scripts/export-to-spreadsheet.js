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

import XLSX from 'xlsx-js-style';
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

// Get completeness status for a material
function getMaterialCompleteness(material) {
  const missing = [];
  const { status, quantity, detail, expectedDate } = material;

  switch (status) {
    case 'need-to-order':
      if (!quantity) missing.push('quantity');
      if (!detail) missing.push('specs');
      break;
    case 'ordered':
      if (!expectedDate) missing.push('expectedDate');
      break;
    case 'on-hand':
      // Complete
      break;
    default:
      return '❌ Needs attention';
  }

  if (missing.length === 0) {
    return '✅ Complete';
  }
  return `⚠️ Missing: ${missing.join(', ')}`;
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
  'Material ID', 'Material Name', 'Status', 'Completeness', 'For Task',
  'Depends On', 'Quantity', 'Expected Date', 'Detail', 'Notes', 'Comments'
]);

for (const task of data.tasks) {
  for (const mat of (task.materialDependencies || [])) {
    const dependsOn = (materialDependsOn[mat.id] || []).join(', ');
    const completeness = getMaterialCompleteness(mat);
    materialsRows.push([
      mat.id,
      mat.name,
      mat.status || '',
      completeness,
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

// ============ OPEN QUESTIONS TAB ============
const ASSIGNEE_DISPLAY_NAMES = {
  brandon: 'Brandon',
  dave: 'Dave',
  tonia: 'Tonia'
};

const STATUS_DISPLAY_NAMES = {
  open: 'Open',
  answered: 'Answered',
  resolved: 'Resolved'
};

const QUESTION_TYPE_DISPLAY = {
  'assignee': 'Assignee',
  'date': 'Date',
  'date-range': 'Date Range',
  'dependency': 'Dependency',
  'yes-no': 'Yes/No',
  'select-one': 'Select One',
  'material-status': 'Material Status',
  'notification': 'Notification',
  'free-text': 'Free Text',
};

const REVIEW_STATUS_DISPLAY = {
  pending: 'Pending Review',
  accepted: 'Accepted',
  rejected: 'Rejected'
};

// Helper to format structured response for display
function formatStructuredResponse(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;

  switch (response.type) {
    case 'yes-no':
      return response.value ? 'Yes' : 'No';
    case 'assignee':
      return getVendorName(response.value) || response.value;
    case 'date':
      return response.value || '';
    case 'date-range':
      return `${response.start || ''} to ${response.end || ''}`;
    case 'dependency':
      return (response.tasks || []).join(', ');
    case 'select-one':
    case 'material-status':
      return response.value || '';
    case 'notification':
      return response.acknowledged ? 'Acknowledged' : 'Dismissed';
    case 'free-text':
      return response.value || '';
    default:
      return JSON.stringify(response);
  }
}

const openQuestionsRows = [];
openQuestionsRows.push([
  'Question ID', 'Type', 'Created', 'Question', 'Assignee', 'Related Task', 'Related Material',
  'Response', 'Notes', 'Status', 'Review Status'
]);

for (const question of (data.questions || [])) {
  // Get question text from prompt (new) or question (legacy) field
  const questionText = question.prompt || question.question || '';

  // Auto-detect type if not set
  const questionType = question.type || 'free-text';

  // Format response based on type
  const responseDisplay = formatStructuredResponse(question.response);

  openQuestionsRows.push([
    question.id,
    QUESTION_TYPE_DISPLAY[questionType] || questionType,
    question.created,
    questionText,
    ASSIGNEE_DISPLAY_NAMES[question.assignee] || question.assignee,
    question.relatedTask || '',
    question.relatedMaterial || '',
    responseDisplay, // Response column - editable for legacy questions
    question.responseNotes || '',
    STATUS_DISPLAY_NAMES[question.status] || question.status,
    question.reviewStatus ? (REVIEW_STATUS_DISPLAY[question.reviewStatus] || question.reviewStatus) : ''
  ]);
}

// ============ BY ASSIGNEE TAB ============
// Group tasks by assignee, showing only their work with dependencies
const byAssigneeRows = [];
byAssigneeRows.push([
  'Assignee', 'Task ID', 'Task Name', 'Status', 'Start Date', 'End Date',
  'Dependencies', 'Required For', 'Notes'
]);

// Collect all tasks/subtasks by assignee
const tasksByAssignee = {};

for (const task of data.tasks) {
  const taskAssignee = getVendorName(task.assignee) || 'Unassigned';

  if (!tasksByAssignee[taskAssignee]) {
    tasksByAssignee[taskAssignee] = [];
  }

  // Add task if it has an assignee or subtasks with assignees
  const taskDeps = (task.dependencies || []).join(', ');
  const taskReqFor = (requiredFor[task.id] || []).join(', ');

  tasksByAssignee[taskAssignee].push({
    type: 'TASK',
    id: task.id,
    name: task.name,
    status: task.status || '',
    start: task.start || '',
    end: task.end || '',
    deps: taskDeps,
    reqFor: taskReqFor,
    notes: task.notes || ''
  });

  // Add subtasks to their assignee (may differ from parent)
  for (const sub of (task.subtasks || [])) {
    const subAssignee = getVendorName(sub.assignee) || getVendorName(task.assignee) || 'Unassigned';

    if (!tasksByAssignee[subAssignee]) {
      tasksByAssignee[subAssignee] = [];
    }

    const subDeps = (sub.dependencies || []).join(', ');
    const subReqFor = (requiredFor[sub.id] || []).join(', ');
    const subStart = sub.start || task.start || '';
    const subEnd = sub.end || sub.start || task.end || '';

    tasksByAssignee[subAssignee].push({
      type: 'subtask',
      id: sub.id,
      name: sub.name,
      parentTask: task.name,
      status: sub.status || task.status || '',
      start: subStart,
      end: subEnd,
      deps: subDeps,
      reqFor: subReqFor,
      notes: sub.notes || ''
    });
  }
}

// Sort assignees alphabetically, but put "Unassigned" last
const sortedAssignees = Object.keys(tasksByAssignee).sort((a, b) => {
  if (a === 'Unassigned') return 1;
  if (b === 'Unassigned') return -1;
  return a.localeCompare(b);
});

// Build rows grouped by assignee
for (const assignee of sortedAssignees) {
  const tasks = tasksByAssignee[assignee];

  // Add assignee header row
  byAssigneeRows.push([
    `▶ ${assignee} (${tasks.length} items)`,
    '', '', '', '', '', '', '', ''
  ]);

  // Add each task for this assignee
  for (const item of tasks) {
    const displayName = item.type === 'subtask' ? `  ↳ ${item.name}` : item.name;

    byAssigneeRows.push([
      '', // Assignee column empty for task rows (header has it)
      item.id,
      displayName,
      item.status,
      formatDate(item.start),
      formatDate(item.end),
      item.deps,
      item.reqFor,
      item.notes
    ]);
  }

  // Add blank row between assignees
  byAssigneeRows.push(['', '', '', '', '', '', '', '', '']);
}

// ============ INSTRUCTIONS TAB ============
const instructionsRows = [
  ['Kitchen Remodel Project Tracker'],
  [''],
  ['HOW TO USE THIS WORKBOOK'],
  [''],
  ['This workbook contains 7 sheets to help manage the kitchen remodel project.'],
  ['Use the tabs at the bottom to navigate between sheets.'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📋 SCHEDULE (Proposed Order)'],
  ['Shows all tasks sorted by dependency order - what needs to happen first.'],
  ['• Green rows = Parent tasks'],
  ['• White/gray rows = Subtasks'],
  ['• Red text in Issues column = Problems that need attention'],
  ['• Orange "Needs Assignment" = Task needs someone assigned'],
  ['• "Proposed Start" shows when task should start based on dependencies'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['👤 BY ASSIGNEE'],
  ['Tasks grouped by who is responsible for them.'],
  ['• Blue header rows show each assignee with task count'],
  ['• Shows dependencies and what other tasks are waiting'],
  ['• Easy to see each person\'s workload at a glance'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📝 TASKS (Full Details)'],
  ['Complete task list with all details, notes, and relationships.'],
  ['• Shows dependencies (what must finish first)'],
  ['• Shows "Required For" (what tasks are waiting on this one)'],
  ['• Shows material dependencies'],
  ['• Use filters to find specific tasks'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📦 MATERIALS'],
  ['List of all materials needed for the project.'],
  ['• Shows which task each material is for'],
  ['• Shows which subtasks depend on the material'],
  ['• Tracks status (on-hand, ordered, need-to-order)'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['👷 VENDORS'],
  ['Contact list for all contractors and suppliers.'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📋  OPEN QUESTIONS  📋'],
  [''],
  ['THIS SHEET REQUIRES YOUR RESPONSE'],
  [''],
  ['Contains structured questions that need answers from Brandon (GC), Dave, or Tonia.'],
  ['Questions have types: Assignee, Date, Date Range, Dependency, Yes/No, etc.'],
  ['Use the CLI (npm run task answer) to provide structured responses.'],
  [''],
  ['• Yellow rows = Open questions needing response'],
  ['• Orange rows = System notifications needing acknowledgment'],
  ['• Blue rows = Answered (awaiting review)'],
  ['• Green rows = Resolved'],
  ['• Filter by "Assignee" or "Type" columns to organize your view'],
  ['• "Related Task" links to the relevant task'],
  ['• "Review Status" shows if answer was accepted or rejected'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['TIPS'],
  ['• Use column filters (dropdown arrows in headers) to find items'],
  ['• Freeze panes keep headers visible when scrolling'],
  ['• All sheets except "Open Questions" are protected'],
  [''],
  ['Last updated: ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
];

// ============ CREATE EXCEL WORKBOOK ============
const wb = XLSX.utils.book_new();

// Add sheets
const wsInstructionsData = XLSX.utils.aoa_to_sheet(instructionsRows);
const wsScheduleData = XLSX.utils.aoa_to_sheet(scheduleRows);
const wsTaskHierarchyData = XLSX.utils.aoa_to_sheet(taskHierarchyRows);
const wsMaterialsData = XLSX.utils.aoa_to_sheet(materialsRows);
const wsVendorsData = XLSX.utils.aoa_to_sheet(vendorsRows);
const wsOpenQuestionsData = XLSX.utils.aoa_to_sheet(openQuestionsRows);
const wsByAssigneeData = XLSX.utils.aoa_to_sheet(byAssigneeRows);

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
  { wch: 18 }, // Completeness
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

wsOpenQuestionsData['!cols'] = [
  { wch: 25 }, // Question ID
  { wch: 14 }, // Type
  { wch: 12 }, // Created
  { wch: 50 }, // Question
  { wch: 12 }, // Assignee
  { wch: 22 }, // Related Task
  { wch: 22 }, // Related Material
  { wch: 40 }, // Response
  { wch: 35 }, // Notes
  { wch: 12 }, // Status
  { wch: 15 }, // Review Status
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

wsInstructionsData['!cols'] = [
  { wch: 90 }, // Single wide column for instructions
];

wsByAssigneeData['!cols'] = [
  { wch: 30 }, // Assignee
  { wch: 28 }, // Task ID
  { wch: 45 }, // Task Name
  { wch: 15 }, // Status
  { wch: 12 }, // Start
  { wch: 12 }, // End
  { wch: 35 }, // Dependencies
  { wch: 35 }, // Required For
  { wch: 50 }, // Notes
];

// ============ STYLING AND FORMATTING ============

// Style definitions
const headerStyle = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } }
  }
};

const taskRowStyle = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'D6DCE5' } }
};

const subtaskRowStyle = {
  fill: { fgColor: { rgb: 'F2F2F2' } }
};

const issueStyle = {
  font: { color: { rgb: 'C00000' }, bold: true }
};

const noAssigneeStyle = {
  font: { color: { rgb: 'C65911' }, italic: true }
};

// Helper to apply styles to a cell
function applyCellStyle(ws, cellRef, style) {
  if (!ws[cellRef]) return;
  ws[cellRef].s = { ...ws[cellRef].s, ...style };
}

// Helper to apply styles to header row
function styleHeaderRow(ws, numCols) {
  for (let col = 0; col < numCols; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    applyCellStyle(ws, cellRef, headerStyle);
  }
}

// Helper to apply row height
function setRowHeight(ws, row, height) {
  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][row] = { hpt: height };
}

// Apply formatting to Schedule sheet
styleHeaderRow(wsScheduleData, 11);
setRowHeight(wsScheduleData, 0, 30);

// Style data rows in Schedule - highlight issues and tasks vs subtasks
for (let row = 1; row < scheduleRows.length; row++) {
  const rowData = scheduleRows[row];
  const isTask = rowData[1] === 'TASK';
  const hasIssues = rowData[10] && rowData[10].length > 0;
  const needsAssignee = rowData[8] === 'Needs Assignment';

  for (let col = 0; col < 11; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsScheduleData[cellRef]) {
      // Base style for alternating rows
      const baseStyle = {
        fill: { fgColor: { rgb: isTask ? 'E2EFDA' : (row % 2 === 0 ? 'FFFFFF' : 'F9F9F9') } },
        border: {
          top: { style: 'thin', color: { rgb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
          left: { style: 'thin', color: { rgb: 'D9D9D9' } },
          right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
      };

      // Bold for task rows
      if (isTask) {
        baseStyle.font = { bold: true };
      }

      applyCellStyle(wsScheduleData, cellRef, baseStyle);

      // Highlight issues column in red
      if (col === 10 && hasIssues) {
        applyCellStyle(wsScheduleData, cellRef, issueStyle);
      }

      // Highlight needs assignee in orange
      if (col === 8 && needsAssignee) {
        applyCellStyle(wsScheduleData, cellRef, noAssigneeStyle);
      }
    }
  }
}

// Apply formatting to Tasks sheet
styleHeaderRow(wsTaskHierarchyData, 13);
setRowHeight(wsTaskHierarchyData, 0, 30);

for (let row = 1; row < taskHierarchyRows.length; row++) {
  const rowData = taskHierarchyRows[row];
  const isTask = rowData[0] === 'TASK';
  const needsAssignee = rowData[6] === 'Needs Assignment';

  for (let col = 0; col < 13; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsTaskHierarchyData[cellRef]) {
      const baseStyle = {
        fill: { fgColor: { rgb: isTask ? 'E2EFDA' : 'FFFFFF' } },
        border: {
          top: { style: 'thin', color: { rgb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
          left: { style: 'thin', color: { rgb: 'D9D9D9' } },
          right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
      };

      if (isTask) {
        baseStyle.font = { bold: true };
      }

      applyCellStyle(wsTaskHierarchyData, cellRef, baseStyle);

      if (col === 6 && needsAssignee) {
        applyCellStyle(wsTaskHierarchyData, cellRef, noAssigneeStyle);
      }
    }
  }
}

// Apply formatting to Materials sheet
styleHeaderRow(wsMaterialsData, 11);
setRowHeight(wsMaterialsData, 0, 30);

for (let row = 1; row < materialsRows.length; row++) {
  for (let col = 0; col < 11; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsMaterialsData[cellRef]) {
      applyCellStyle(wsMaterialsData, cellRef, {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'FFFFFF' : 'F2F2F2' } },
        border: {
          top: { style: 'thin', color: { rgb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
          left: { style: 'thin', color: { rgb: 'D9D9D9' } },
          right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
      });
    }
  }
}

// Apply formatting to Vendors sheet
styleHeaderRow(wsVendorsData, 7);
setRowHeight(wsVendorsData, 0, 30);

for (let row = 1; row < vendorsRows.length; row++) {
  for (let col = 0; col < 7; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsVendorsData[cellRef]) {
      applyCellStyle(wsVendorsData, cellRef, {
        fill: { fgColor: { rgb: row % 2 === 0 ? 'FFFFFF' : 'F2F2F2' } },
        border: {
          top: { style: 'thin', color: { rgb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
          left: { style: 'thin', color: { rgb: 'D9D9D9' } },
          right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
      });
    }
  }
}

// Apply formatting to Open Questions sheet
styleHeaderRow(wsOpenQuestionsData, 11);
setRowHeight(wsOpenQuestionsData, 0, 30);

for (let row = 1; row < openQuestionsRows.length; row++) {
  const rowData = openQuestionsRows[row];
  const status = rowData[9]; // Status column (index 9 with new columns)
  const questionType = rowData[1]; // Type column (index 1)

  for (let col = 0; col < 11; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsOpenQuestionsData[cellRef]) {
      // Color based on status: Open = yellow, Answered = light blue, Resolved = light green
      // Notifications get orange when open
      let fillColor;
      if (status === 'Resolved') {
        fillColor = row % 2 === 0 ? 'E2EFDA' : 'D6EAD0'; // Light green
      } else if (status === 'Answered') {
        fillColor = row % 2 === 0 ? 'DEEBF7' : 'D0E4F4'; // Light blue
      } else if (questionType === 'Notification') {
        fillColor = row % 2 === 0 ? 'FCE4D6' : 'F8CBAD'; // Light orange for notifications
      } else {
        fillColor = row % 2 === 0 ? 'FFFFFF' : 'FFF2CC'; // Yellow for Open
      }

      applyCellStyle(wsOpenQuestionsData, cellRef, {
        fill: { fgColor: { rgb: fillColor } },
        border: {
          top: { style: 'thin', color: { rgb: 'D9D9D9' } },
          bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
          left: { style: 'thin', color: { rgb: 'D9D9D9' } },
          right: { style: 'thin', color: { rgb: 'D9D9D9' } }
        }
      });
    }
  }
}

// Apply formatting to By Assignee sheet
styleHeaderRow(wsByAssigneeData, 9);
setRowHeight(wsByAssigneeData, 0, 30);

for (let row = 1; row < byAssigneeRows.length; row++) {
  const rowData = byAssigneeRows[row];
  const isAssigneeHeader = rowData[0] && rowData[0].startsWith('▶');
  const isBlankRow = !rowData[0] && !rowData[1] && !rowData[2];

  for (let col = 0; col < 9; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (wsByAssigneeData[cellRef]) {
      if (isAssigneeHeader) {
        // Assignee header row - blue background, bold
        applyCellStyle(wsByAssigneeData, cellRef, {
          font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '4472C4' } },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        });
      } else if (!isBlankRow) {
        // Task rows - alternating colors
        applyCellStyle(wsByAssigneeData, cellRef, {
          fill: { fgColor: { rgb: row % 2 === 0 ? 'FFFFFF' : 'F2F2F2' } },
          border: {
            top: { style: 'thin', color: { rgb: 'D9D9D9' } },
            bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
            left: { style: 'thin', color: { rgb: 'D9D9D9' } },
            right: { style: 'thin', color: { rgb: 'D9D9D9' } }
          }
        });
      }
    }
  }
}

// Apply formatting to Instructions sheet
// Title row - large and bold
applyCellStyle(wsInstructionsData, 'A1', {
  font: { bold: true, sz: 20, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'center' }
});
setRowHeight(wsInstructionsData, 0, 35);

// Section headers
const sectionRows = [2, 9, 17, 26, 34, 39, 52]; // "HOW TO USE", section dividers
for (const row of sectionRows) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
  if (wsInstructionsData[cellRef]) {
    applyCellStyle(wsInstructionsData, cellRef, {
      font: { bold: true, sz: 14, color: { rgb: '1F4E79' } }
    });
  }
}

// Sheet name headers (📋 SCHEDULE, etc.)
const sheetNameRows = [9, 17, 26, 34, 39];
for (const row of sheetNameRows) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
  if (wsInstructionsData[cellRef]) {
    applyCellStyle(wsInstructionsData, cellRef, {
      font: { bold: true, sz: 13, color: { rgb: '2E75B6' } }
    });
  }
}

// GC Action Needed section - highlighted
const gcActionInstructionRows = [41, 43, 44];
for (const row of gcActionInstructionRows) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
  if (wsInstructionsData[cellRef]) {
    applyCellStyle(wsInstructionsData, cellRef, {
      font: { bold: true, sz: 14, color: { rgb: 'C00000' } },
      fill: { fgColor: { rgb: 'FFF2CC' } }
    });
  }
}

// Freeze header rows for all sheets
wsScheduleData['!freeze'] = { xSplit: 0, ySplit: 1 };
wsTaskHierarchyData['!freeze'] = { xSplit: 0, ySplit: 1 };
wsMaterialsData['!freeze'] = { xSplit: 0, ySplit: 1 };
wsVendorsData['!freeze'] = { xSplit: 0, ySplit: 1 };
wsOpenQuestionsData['!freeze'] = { xSplit: 0, ySplit: 1 };
wsByAssigneeData['!freeze'] = { xSplit: 0, ySplit: 1 };

// Set auto-filter for data exploration
wsScheduleData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: scheduleRows.length - 1, c: 10 } }) };
wsTaskHierarchyData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: taskHierarchyRows.length - 1, c: 12 } }) };
wsMaterialsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: materialsRows.length - 1, c: 10 } }) };
wsVendorsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: vendorsRows.length - 1, c: 6 } }) };
wsOpenQuestionsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: openQuestionsRows.length - 1, c: 10 } }) };
wsByAssigneeData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: byAssigneeRows.length - 1, c: 8 } }) };

// Add sheet protection to all sheets except GC Action Needed
// Note: xlsx library protection is limited - full protection requires Excel/Sheets UI
wsScheduleData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsTaskHierarchyData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsMaterialsData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsVendorsData['!protect'] = { sheet: true, objects: true, scenarios: true };
wsByAssigneeData['!protect'] = { sheet: true, objects: true, scenarios: true };
// wsOpenQuestionsData is NOT protected - users can add responses

// Add Instructions sheet protection
wsInstructionsData['!protect'] = { sheet: true, objects: true, scenarios: true };

XLSX.utils.book_append_sheet(wb, wsInstructionsData, 'Instructions');
XLSX.utils.book_append_sheet(wb, wsScheduleData, 'Schedule');
XLSX.utils.book_append_sheet(wb, wsByAssigneeData, 'By Assignee');
XLSX.utils.book_append_sheet(wb, wsTaskHierarchyData, 'Tasks');
XLSX.utils.book_append_sheet(wb, wsMaterialsData, 'Materials');
XLSX.utils.book_append_sheet(wb, wsVendorsData, 'Vendors');
XLSX.utils.book_append_sheet(wb, wsOpenQuestionsData, 'Open Questions');

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
  path.join(exportsDir, 'open-questions.csv'),
  XLSX.utils.sheet_to_csv(wsOpenQuestionsData, csvOptions)
);
fs.writeFileSync(
  path.join(exportsDir, 'by-assignee.csv'),
  XLSX.utils.sheet_to_csv(wsByAssigneeData, csvOptions)
);

console.log(`✓ CSV files created in: ${exportsDir}`);
console.log('\nTo import into Google Sheets:');
console.log('  1. Create a new Google Sheet');
console.log('  2. File > Import > Upload each CSV');
console.log('  3. Choose "Insert new sheet(s)" for each');
console.log('\nOr use the Excel file directly - both work!');
