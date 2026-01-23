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

// ============ CELL STYLING HELPERS ============
// xlsx-js-style requires styles embedded in cell objects BEFORE aoa_to_sheet()

// Style definitions - xlsx-js-style requires patternType: "solid" for fills
const STYLES = {
  header: {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    }
  },
  taskRow: {
    font: { bold: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'E2EFDA' } }, // Light green for tasks
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } }
    }
  },
  subtaskRow: {
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } }
    }
  },
  subtaskRowAlt: {
    fill: { patternType: 'solid', fgColor: { rgb: 'F9F9F9' } },
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } }
    }
  },
  issueText: {
    font: { color: { rgb: 'C00000' }, bold: true }
  },
  needsAssignee: {
    font: { color: { rgb: 'C65911' }, italic: true }
  },
  assigneeGroupHeader: {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '305496' } },
    alignment: { horizontal: 'left' }
  }
};

// Category colors for Issues sheet
const CATEGORY_STYLES = {
  'ASSIGN': { fill: { patternType: 'solid', fgColor: { rgb: 'DEEBF7' } } },    // Light blue
  'SCHEDULE': { fill: { patternType: 'solid', fgColor: { rgb: 'FCE4D6' } } },  // Light orange
  'ORDER': { fill: { patternType: 'solid', fgColor: { rgb: 'E2EFDA' } } },     // Light green
  'SPECIFY': { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } },   // Light yellow
  'TRACK': { fill: { patternType: 'solid', fgColor: { rgb: 'E4DFEC' } } },     // Light purple
  'DECIDE': { fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } } }     // Light gray
};

// Create a styled cell object
function cell(value, style = null) {
  const c = { v: value ?? '', t: typeof value === 'number' ? 'n' : 's' };
  if (style) c.s = style;
  return c;
}

// Create a row of header cells
function headerRow(values) {
  return values.map(v => cell(v, STYLES.header));
}

// Create a styled data row
function dataRow(values, baseStyle, overrides = {}) {
  return values.map((v, i) => {
    const style = overrides[i] ? { ...baseStyle, ...overrides[i] } : baseStyle;
    return cell(v, style);
  });
}

// Merge two style objects (deep merge for nested properties)
function mergeStyles(base, override) {
  if (!override) return base;
  if (!base) return override;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = { ...base[key], ...override[key] };
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

// Get completeness status for a material
function getMaterialCompleteness(material) {
  const missing = [];
  const { status, quantity, detail, expectedDate, orderLink } = material;

  switch (status) {
    case 'need-to-select':
      // Early stage - need to decide what to buy
      if (!detail) missing.push('specs');
      break;
    case 'selected':
      // Selected but not ready to order yet
      if (!quantity) missing.push('quantity');
      if (!detail) missing.push('specs');
      break;
    case 'need-to-order':
      if (!quantity) missing.push('quantity');
      if (!detail) missing.push('specs');
      break;
    case 'ordered':
      if (!expectedDate) missing.push('expectedDate');
      if (!orderLink) missing.push('orderLink');
      break;
    case 'vendor-provided':
      // Vendor provides as part of work scope - only need basic info
      if (!quantity) missing.push('quantity');
      if (!detail) missing.push('specs');
      break;
    case 'on-hand':
      // Ready - has all needed info
      break;
  }

  if (missing.length === 0) {
    return '✅ Yes';
  }
  return `⚠️ Missing: ${missing.join(', ')}`;
}

// Get ready status for a task (do we have all needed information?)
function getTaskCompleteness(task) {
  const missing = [];
  const { status, start, end, assignee } = task;

  // Terminal statuses - no more info needed
  if (status === 'completed' || status === 'cancelled' || status === 'confirmed') {
    return '✅ Yes';
  }

  // For all other statuses, check required fields
  if (!start || !end) missing.push('dates');
  if (!assignee) missing.push('assignee');

  if (missing.length === 0) {
    return '✅ Yes';
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

// Build map of task IDs to their open questions
const taskOpenQuestions = {};
for (const question of (data.issues || [])) {
  if (question.status === 'open' && question.relatedTask) {
    if (!taskOpenQuestions[question.relatedTask]) {
      taskOpenQuestions[question.relatedTask] = [];
    }
    taskOpenQuestions[question.relatedTask].push(question);
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

  // Flag external dependencies for visibility (subtasks depending on tasks outside their parent)
  if (item.parentId) {
    const externalDeps = item.dependencies.filter(depId => {
      const dep = itemMap[depId];
      return dep && dep.parentId !== item.parentId;
    });
    if (externalDeps.length > 0) {
      issues.push(`Waits for: ${externalDeps.join(', ')}`);
    }
  }

  // Check for open questions linked to this task
  const openQuestions = taskOpenQuestions[item.id] || [];
  if (openQuestions.length > 0) {
    for (const q of openQuestions) {
      const assignee = q.assignee ? q.assignee.charAt(0).toUpperCase() + q.assignee.slice(1) : 'Unknown';
      const questionText = q.prompt || q.question || 'Question pending';
      // Truncate long questions
      const truncated = questionText.length > 40 ? questionText.substring(0, 37) + '...' : questionText;
      issues.push(`❓ ${assignee}: ${truncated}`);
    }
  }

  return issues;
}

// Build schedule rows grouped by parent task
const scheduleRows = [];
scheduleRows.push(headerRow([
  'Order', 'Type', 'Task ID', 'Name', 'Status', 'Current Start', 'Current End',
  'Proposed Start', 'Assignee', 'Dependencies', 'Issues'
]));

// Statuses that indicate task is no longer actionable
const closedStatuses = ['completed', 'cancelled', 'confirmed'];

// Get open parent tasks only, sorted by dependency order
const parentTasks = sortedItems.filter(item =>
  item.type === 'TASK' && !closedStatuses.includes(item.status)
);

let order = 1;
let subtaskRowIndex = 0;
for (const parent of parentTasks) {
  // Add parent task row (green background, bold)
  const parentDates = proposedDates[parent.id];
  const parentIssues = detectIssues(parent);
  const hasIssues = parentIssues.length > 0;
  const needsAssignee = !parent.assignee;

  const parentValues = [
    order++,
    parent.type,
    parent.id,
    parent.name,
    parent.status,
    formatDate(parent.start),
    formatDate(parent.end),
    formatDate(parentDates.proposedStart),
    parent.assignee || 'Needs Assignment',
    parent.dependencies.join(', '),
    parentIssues.join('; ')
  ];

  // Build overrides for special columns
  const parentOverrides = {};
  if (needsAssignee) parentOverrides[8] = mergeStyles(STYLES.taskRow, STYLES.needsAssignee);
  if (hasIssues) parentOverrides[10] = mergeStyles(STYLES.taskRow, STYLES.issueText);

  scheduleRows.push(dataRow(parentValues, STYLES.taskRow, parentOverrides));

  // Add subtasks immediately after parent (only open ones)
  const subtasks = sortedItems.filter(item =>
    item.parentId === parent.id && !closedStatuses.includes(item.status)
  );
  for (const sub of subtasks) {
    const subDates = proposedDates[sub.id];
    const subIssues = detectIssues(sub);
    const subHasIssues = subIssues.length > 0;
    const subNeedsAssignee = !sub.assignee;

    // Alternate subtask row colors
    const subtaskStyle = subtaskRowIndex % 2 === 0 ? STYLES.subtaskRow : STYLES.subtaskRowAlt;
    subtaskRowIndex++;

    const subValues = [
      order++,
      sub.type,
      sub.id,
      `  ${sub.name}`,
      sub.status,
      formatDate(sub.start),
      formatDate(sub.end),
      formatDate(subDates.proposedStart),
      sub.assignee || 'Needs Assignment',
      sub.dependencies.join(', '),
      subIssues.join('; ')
    ];

    const subOverrides = {};
    if (subNeedsAssignee) subOverrides[8] = mergeStyles(subtaskStyle, STYLES.needsAssignee);
    if (subHasIssues) subOverrides[10] = mergeStyles(subtaskStyle, STYLES.issueText);

    scheduleRows.push(dataRow(subValues, subtaskStyle, subOverrides));
  }
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
taskHierarchyRows.push(headerRow([
  'Type', 'Task ID', 'Name', 'Status', 'Ready', 'Start Date', 'End Date',
  'Assignee', 'Category', 'Dependencies', 'Required For', 'Material Deps', 'Notes', 'Comments'
]));

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
  const taskCompleteness = getTaskCompleteness(task);
  const taskNeedsAssignee = !taskAssignee;

  // Add parent task row (green background, bold)
  const taskValues = [
    'TASK',
    task.id,
    task.name,
    task.status || '',
    taskCompleteness,
    formatDate(task.start),
    formatDate(task.end),
    taskAssignee || 'Needs Assignment',
    task.category || '',
    deps,
    taskRequiredFor,
    taskMatDeps,
    task.notes || '',
    task.comments || '' // Status change history
  ];

  const taskOverrides = {};
  if (taskNeedsAssignee) taskOverrides[7] = mergeStyles(STYLES.taskRow, STYLES.needsAssignee);

  taskHierarchyRows.push(dataRow(taskValues, STYLES.taskRow, taskOverrides));

  // Add subtasks indented below parent (inherit parent values unless overridden)
  for (const sub of (task.subtasks || [])) {
    const subAssignee = getVendorName(sub.assignee) || getVendorName(task.assignee);
    const subStatus = sub.status || task.status || '';
    const subStart = sub.start || task.start;
    const subEnd = sub.end || sub.start || task.end;
    const subDeps = (sub.dependencies || []).join(', ');
    const subMatDeps = getMaterialDeps(sub.materialDependencies);
    // Build effective subtask object for completeness check (with inherited values)
    const effectiveSub = {
      ...sub,
      status: subStatus,
      start: subStart,
      end: subEnd,
      assignee: sub.assignee || task.assignee
    };
    const subCompleteness = getTaskCompleteness(effectiveSub);
    const subNeedsAssignee = !subAssignee;

    const subRequiredFor = (requiredFor[sub.id] || []).join(', ');
    const subValues = [
      '  ↳ subtask',
      sub.id,
      `    ${sub.name}`,
      subStatus,
      subCompleteness,
      formatDate(subStart),
      formatDate(subEnd),
      subAssignee || 'Needs Assignment',
      task.category || '', // always inherit category from parent
      subDeps,
      subRequiredFor,
      subMatDeps,
      sub.notes || '',
      sub.comments || '' // Status change history
    ];

    const subOverrides = {};
    if (subNeedsAssignee) subOverrides[7] = mergeStyles(STYLES.subtaskRow, STYLES.needsAssignee);

    taskHierarchyRows.push(dataRow(subValues, STYLES.subtaskRow, subOverrides));
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
materialsRows.push(headerRow([
  'Material ID', 'Material Name', 'Status', 'Ready', 'For Task',
  'Depends On', 'Quantity', 'Expected Date', 'Order Link', 'Detail', 'Notes', 'Comments'
]));

let materialRowIndex = 0;
for (const task of data.tasks) {
  for (const mat of (task.materialDependencies || [])) {
    const dependsOn = (materialDependsOn[mat.id] || []).join(', ');
    const completeness = getMaterialCompleteness(mat);
    const matValues = [
      mat.id,
      mat.name,
      mat.status || '',
      completeness,
      task.id,
      dependsOn,
      mat.quantity || '',
      formatDate(mat.expectedDate),
      mat.orderLink || '',
      mat.detail || '',
      mat.notes || '',
      mat.comments || '' // Status change history
    ];
    // Alternate row colors for readability
    const rowStyle = materialRowIndex % 2 === 0 ? STYLES.subtaskRow : STYLES.subtaskRowAlt;
    materialRowIndex++;
    materialsRows.push(dataRow(matValues, rowStyle));
  }
}

// ============ VENDORS TAB ============
const vendorsRows = [];
vendorsRows.push(headerRow([
  'Vendor ID', 'Name', 'Type', 'Trade', 'Status', 'Contact', 'Notes'
]));

let vendorRowIndex = 0;
for (const vendor of data.vendors) {
  const vendorValues = [
    vendor.id,
    vendor.name,
    vendor.type || '',
    vendor.trade || '',
    vendor.status || '',
    vendor.contact || '',
    '' // Notes column
  ];
  const rowStyle = vendorRowIndex % 2 === 0 ? STYLES.subtaskRow : STYLES.subtaskRowAlt;
  vendorRowIndex++;
  vendorsRows.push(dataRow(vendorValues, rowStyle));
}

// ============ ISSUES TAB ============
const ASSIGNEE_DISPLAY_NAMES = {
  brandon: 'Brandon',
  dave: 'Dave',
  tonia: 'Tonia',
  system: 'System'
};

const STATUS_DISPLAY_NAMES = {
  open: 'Open',
  answered: 'Answered',
  resolved: 'Resolved',
  dismissed: 'Dismissed'
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
  'schedule-conflict': 'Conflict',
  'missing-assignee': 'Missing Assignee',
  'past-due': 'Past Due',
  'unscheduled-blocker': 'Blocking',
  'material-overdue': 'Overdue',
};

const REVIEW_STATUS_DISPLAY = {
  pending: 'Pending Review',
  accepted: 'Accepted',
  rejected: 'Rejected'
};

// Action category display names
const CATEGORY_DISPLAY_NAMES = {
  'ASSIGN': 'Assign',
  'SCHEDULE': 'Schedule',
  'ORDER': 'Order',
  'SPECIFY': 'Specify',
  'TRACK': 'Track',
  'DECIDE': 'Decide'
};

// Category sort order (for spreadsheet grouping)
const CATEGORY_SORT_ORDER = {
  'ASSIGN': 1,
  'SCHEDULE': 2,
  'ORDER': 3,
  'SPECIFY': 4,
  'TRACK': 5,
  'DECIDE': 6
};

/**
 * Compute ActionCategory for a question if not already set.
 * This mirrors the logic in task.js for questions created before the category field was added.
 */
function computeCategory(question) {
  if (question.category) return question.category;

  const { type, relatedMaterial, relatedTask, prompt = '', question: legacyPrompt = '' } = question;
  const promptText = (prompt || legacyPrompt).toLowerCase();

  // Assignee questions are always ASSIGN
  if (type === 'assignee' || type === 'missing-assignee') {
    return 'ASSIGN';
  }

  // Schedule-related types for tasks
  if (type === 'schedule-conflict' || type === 'unscheduled-blocker' || type === 'past-due') {
    return 'SCHEDULE';
  }

  // Material-related questions
  if (relatedMaterial) {
    if (type === 'material-overdue' || type === 'date' ||
        (type === 'free-text' && (promptText.includes('delivery') || promptText.includes('expected')))) {
      return 'TRACK';
    }
    if (type === 'material-status') {
      return 'TRACK';
    }
    if (type === 'yes-no' && (promptText.includes('order') || promptText.includes('purchase'))) {
      return 'ORDER';
    }
    if (type === 'free-text') {
      return 'SPECIFY';
    }
  }

  // Task date questions → SCHEDULE
  if ((type === 'date' || type === 'date-range') && relatedTask) {
    return 'SCHEDULE';
  }

  // Dependency questions → DECIDE
  if (type === 'dependency' || type === 'notification' || type === 'yes-no') {
    return 'DECIDE';
  }

  // Free-text task questions
  if (type === 'free-text' && relatedTask && !relatedMaterial) {
    if (promptText.includes('schedul') || promptText.includes('date') || promptText.includes('when')) {
      return 'SCHEDULE';
    }
    if (promptText.includes('assign') || promptText.includes('who')) {
      return 'ASSIGN';
    }
  }

  return 'DECIDE';
}

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
openQuestionsRows.push(headerRow([
  'Action', 'Question ID', 'Type', 'Created', 'Question', 'Assignee', 'Related Task', 'Related Material',
  'Response', 'Notes', 'Status', 'Review Status'
]));

// Sort questions by Action category for better grouping
const sortedQuestions = [...(data.issues || [])].sort((a, b) => {
  const catA = computeCategory(a);
  const catB = computeCategory(b);
  const orderA = CATEGORY_SORT_ORDER[catA] || 99;
  const orderB = CATEGORY_SORT_ORDER[catB] || 99;
  if (orderA !== orderB) return orderA - orderB;
  // Secondary sort by assignee within category
  return (a.assignee || '').localeCompare(b.assignee || '');
});

for (const question of sortedQuestions) {
  // Get question text from prompt (new) or question (legacy) field
  const questionText = question.prompt || question.question || '';

  // Auto-detect type if not set
  const questionType = question.type || 'free-text';

  // Format response based on type
  const responseDisplay = formatStructuredResponse(question.response);

  // Compute category if not already set
  const category = computeCategory(question);

  // Get category-based row style
  const categoryStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES['DECIDE'];
  const rowStyle = {
    fill: categoryStyle.fill,
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } },
      right: { style: 'thin', color: { rgb: 'D9D9D9' } }
    }
  };

  const issueValues = [
    CATEGORY_DISPLAY_NAMES[category] || category,
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
  ];

  openQuestionsRows.push(dataRow(issueValues, rowStyle));
}

// ============ BY ASSIGNEE TAB ============
// Group tasks by assignee, showing only their work with dependencies
const byAssigneeRows = [];
byAssigneeRows.push(headerRow([
  'Assignee', 'Task ID', 'Task Name', 'Status', 'Start Date', 'End Date',
  'Dependencies', 'Required For', 'Notes'
]));

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

  // Add assignee header row (dark blue background)
  const assigneeHeaderValues = [
    `▶ ${assignee} (${tasks.length} items)`,
    '', '', '', '', '', '', '', ''
  ];
  byAssigneeRows.push(dataRow(assigneeHeaderValues, STYLES.assigneeGroupHeader));

  // Add each task for this assignee
  for (const item of tasks) {
    const displayName = item.type === 'subtask' ? `  ↳ ${item.name}` : item.name;
    const isTask = item.type === 'TASK';
    const rowStyle = isTask ? STYLES.taskRow : STYLES.subtaskRow;

    const itemValues = [
      '', // Assignee column empty for task rows (header has it)
      item.id,
      displayName,
      item.status,
      formatDate(item.start),
      formatDate(item.end),
      item.deps,
      item.reqFor,
      item.notes
    ];

    byAssigneeRows.push(dataRow(itemValues, rowStyle));
  }

  // Add blank row between assignees
  byAssigneeRows.push(['', '', '', '', '', '', '', '', ''].map(v => cell(v)));
}

// ============ INSTRUCTIONS TAB ============
const instructionsRows = [
  ['Kitchen Remodel Project Tracker'],
  [''],
  ['This spreadsheet tracks all tasks and materials for the kitchen remodel.'],
  ['It updates automatically - you don\'t need to maintain it.'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📋 ISSUES'],
  [''],
  ['Issues that need your input. Find your name in the Assignee column'],
  ['and type your answer in the Response column.'],
  [''],
  ['Once answered, Dave reviews and updates the tracker - then your'],
  ['issue disappears from this list.'],
  [''],
  ['Row colors indicate action needed:'],
  ['  • Blue = Assign (Who should do this?)'],
  ['  • Orange = Schedule (When should this happen?)'],
  ['  • Green = Order (Ready to purchase?)'],
  ['  • Yellow = Specify (Need specs/quantity)'],
  ['  • Purple = Track (Need delivery info)'],
  ['  • White = Decide (Decision needed)'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📅 SCHEDULE'],
  [''],
  ['Shows tasks in the order they can be done - what needs to finish'],
  ['before something else can start.'],
  [''],
  ['Use this to see what\'s next and what\'s blocking progress.'],
  ['Check the Issues column (in red) for problems that need attention.'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['👤 BY ASSIGNEE'],
  [''],
  ['Tasks grouped by who\'s responsible.'],
  ['See your workload at a glance, or check what others are working on.'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📝 TASKS'],
  [''],
  ['The master list of all tasks with full details - dates, dependencies,'],
  ['notes, and materials needed.'],
  [''],
  ['Look here when you need the complete picture on any task.'],
  [''],
  ['Ready column shows if we have all needed info:'],
  ['  • ✅ Yes = Has dates and assignee'],
  ['  • ⚠️ Missing: dates = Needs start/end dates'],
  ['  • ⚠️ Missing: assignee = Needs someone assigned'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['📦 MATERIALS'],
  [''],
  ['All materials needed for the project - what\'s on-hand, what\'s ordered,'],
  ['what still needs to be purchased.'],
  [''],
  ['Check expected delivery dates and order links here.'],
  [''],
  ['Ready column shows if we have all needed info for that status:'],
  ['  • ✅ Yes = Has everything needed'],
  ['  • ⚠️ Missing: specs = Needs specs/details'],
  ['  • ⚠️ Missing: quantity = Needs quantity'],
  ['  • ⚠️ Missing: expectedDate = Needs delivery date'],
  ['  • ⚠️ Missing: orderLink = Needs order link'],
  [''],
  ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
  [''],
  ['NOTES'],
  [''],
  ['• You can\'t break anything - other tabs are protected'],
  ['• After you answer, changes appear in the next update'],
  ['• View this on a computer - it\'s too complex for mobile'],
  ['• Questions? Contact Dave'],
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
  { wch: 22 }, // Ready
  { wch: 30 }, // For Task
  { wch: 35 }, // Depends On
  { wch: 10 }, // Quantity
  { wch: 15 }, // Expected Date
  { wch: 40 }, // Order Link
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
  { wch: 10 }, // Action (category)
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

// ============ ROW HEIGHT AND SHEET SETTINGS ============

// Helper to apply row height
function setRowHeight(ws, row, height) {
  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][row] = { hpt: height };
}

// Set header row heights
setRowHeight(wsScheduleData, 0, 30);
setRowHeight(wsTaskHierarchyData, 0, 30);
setRowHeight(wsMaterialsData, 0, 30);
setRowHeight(wsVendorsData, 0, 30);
setRowHeight(wsOpenQuestionsData, 0, 30);
setRowHeight(wsByAssigneeData, 0, 30);
setRowHeight(wsInstructionsData, 0, 35);

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
wsMaterialsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: materialsRows.length - 1, c: 11 } }) };
wsVendorsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: vendorsRows.length - 1, c: 6 } }) };
wsOpenQuestionsData['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: openQuestionsRows.length - 1, c: 11 } }) };
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

// Hide Vendors sheet (internal reference data)
wsVendorsData['!hidden'] = true;

XLSX.utils.book_append_sheet(wb, wsInstructionsData, 'Instructions');
XLSX.utils.book_append_sheet(wb, wsScheduleData, 'Schedule');
XLSX.utils.book_append_sheet(wb, wsByAssigneeData, 'By Assignee');
XLSX.utils.book_append_sheet(wb, wsTaskHierarchyData, 'Tasks');
XLSX.utils.book_append_sheet(wb, wsMaterialsData, 'Materials');
XLSX.utils.book_append_sheet(wb, wsVendorsData, 'Vendors');
XLSX.utils.book_append_sheet(wb, wsOpenQuestionsData, 'Issues');

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
  path.join(exportsDir, 'issues.csv'),
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
