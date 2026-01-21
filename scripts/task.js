#!/usr/bin/env node
/**
 * Task Management CLI for Kitchen Remodel Project
 *
 * Usage: npm run task <command> [options]
 *
 * Commands:
 *   add [name]           Add a new task (interactive)
 *   add-subtask [parent] Add a subtask to existing task
 *   status [task-id]     Update task status
 *   date <task-id>       Update task dates
 *   assign <task-id>     Assign task to vendor
 *   deps <task-id>       Manage dependencies
 *   materials [task-id]  Manage material dependencies
 *   note <task-id>       Add a note to task
 *   list                 List all tasks
 *   show <task-id>       Show task details
 *   validate             Validate data.json
 *   export               Export to spreadsheet with guardrails
 */

import { input, select, confirm, search } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', 'projects', 'kitchen-remodel');
const dataPath = path.join(projectDir, 'data.json');

// ANSI colors
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

// Valid enum values from schema
const VALID_STATUSES = ['pending', 'needs-scheduled', 'scheduled', 'confirmed', 'in-progress', 'completed', 'blocked', 'cancelled'];
const VALID_CATEGORIES = ['demolition', 'rough-in', 'structural', 'mechanical', 'electrical', 'plumbing', 'finish', 'fixtures', 'cleanup', 'inspection', 'trim', 'paint', 'framing', 'milestone', 'clean'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];
const VALID_MATERIAL_STATUSES = ['need-to-select', 'selected', 'need-to-order', 'ordered', 'on-hand'];

// ============ DATA OPERATIONS ============

function loadData() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

function saveData(data) {
  const errors = validate(data);
  if (errors.length > 0) {
    console.error(red('\nValidation failed:'));
    errors.forEach(e => console.error(red(`  - ${e}`)));
    process.exit(1);
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
}

// ============ VALIDATION ============

function validate(data) {
  const errors = [];
  const taskIds = new Set();
  const vendorIds = new Set(data.vendors.map(v => v.id));

  // Build task ID set
  for (const task of data.tasks) {
    if (taskIds.has(task.id)) {
      errors.push(`Duplicate task ID: "${task.id}"`);
    }
    taskIds.add(task.id);

    for (const sub of (task.subtasks || [])) {
      if (taskIds.has(sub.id)) {
        errors.push(`Duplicate task ID: "${sub.id}"`);
      }
      taskIds.add(sub.id);
    }
  }

  // Validate each task
  for (const task of data.tasks) {
    // Status validation
    if (task.status && !VALID_STATUSES.includes(task.status)) {
      errors.push(`Invalid status "${task.status}" for task "${task.id}". Valid: ${VALID_STATUSES.join(', ')}`);
    }

    // Category validation
    if (task.category && !VALID_CATEGORIES.includes(task.category)) {
      errors.push(`Invalid category "${task.category}" for task "${task.id}". Valid: ${VALID_CATEGORIES.join(', ')}`);
    }

    // Assignee validation
    if (task.assignee) {
      const vendorId = task.assignee.replace('vendor:', '');
      if (!vendorIds.has(vendorId)) {
        errors.push(`Vendor "${vendorId}" not found for task "${task.id}". Available: ${[...vendorIds].join(', ')}`);
      }
    }

    // Date validation
    if (task.start && !isValidDate(task.start)) {
      errors.push(`Invalid date "${task.start}" for task "${task.id}". Use YYYY-MM-DD format`);
    }
    if (task.end && !isValidDate(task.end)) {
      errors.push(`Invalid date "${task.end}" for task "${task.id}". Use YYYY-MM-DD format`);
    }
    if (task.start && task.end && task.start > task.end) {
      errors.push(`Start date (${task.start}) cannot be after end date (${task.end}) for task "${task.id}"`);
    }

    // Dependency validation
    for (const depId of (task.dependencies || [])) {
      if (!taskIds.has(depId)) {
        errors.push(`Dependency "${depId}" not found for task "${task.id}"`);
      }
    }

    // Material validation
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat === 'object') {
        if (mat.status && !VALID_MATERIAL_STATUSES.includes(mat.status)) {
          errors.push(`Invalid material status "${mat.status}" for "${mat.id}" in task "${task.id}". Valid: ${VALID_MATERIAL_STATUSES.join(', ')}`);
        }
        if (mat.vendor) {
          const vendorId = mat.vendor.replace('vendor:', '');
          if (!vendorIds.has(vendorId)) {
            errors.push(`Vendor "${vendorId}" not found for material "${mat.id}" in task "${task.id}"`);
          }
        }
        if (mat.expectedDate && !isValidDate(mat.expectedDate)) {
          errors.push(`Invalid date "${mat.expectedDate}" for material "${mat.id}" in task "${task.id}". Use YYYY-MM-DD format`);
        }
      }
    }

    // Subtask validation
    for (const sub of (task.subtasks || [])) {
      if (sub.status && !VALID_STATUSES.includes(sub.status)) {
        errors.push(`Invalid status "${sub.status}" for subtask "${sub.id}". Valid: ${VALID_STATUSES.join(', ')}`);
      }

      if (sub.assignee) {
        const vendorId = sub.assignee.replace('vendor:', '');
        if (!vendorIds.has(vendorId)) {
          errors.push(`Vendor "${vendorId}" not found for subtask "${sub.id}". Available: ${[...vendorIds].join(', ')}`);
        }
      }

      if (sub.start && !isValidDate(sub.start)) {
        errors.push(`Invalid date "${sub.start}" for subtask "${sub.id}". Use YYYY-MM-DD format`);
      }
      if (sub.end && !isValidDate(sub.end)) {
        errors.push(`Invalid date "${sub.end}" for subtask "${sub.id}". Use YYYY-MM-DD format`);
      }

      for (const depId of (sub.dependencies || [])) {
        if (!taskIds.has(depId)) {
          errors.push(`Dependency "${depId}" not found for subtask "${sub.id}"`);
        }
      }

      // Material validation for subtask
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat === 'object') {
          if (mat.status && !VALID_MATERIAL_STATUSES.includes(mat.status)) {
            errors.push(`Invalid material status "${mat.status}" for "${mat.id}" in subtask "${sub.id}". Valid: ${VALID_MATERIAL_STATUSES.join(', ')}`);
          }
          if (mat.vendor) {
            const vendorId = mat.vendor.replace('vendor:', '');
            if (!vendorIds.has(vendorId)) {
              errors.push(`Vendor "${vendorId}" not found for material "${mat.id}" in subtask "${sub.id}"`);
            }
          }
          if (mat.expectedDate && !isValidDate(mat.expectedDate)) {
            errors.push(`Invalid date "${mat.expectedDate}" for material "${mat.id}" in subtask "${sub.id}". Use YYYY-MM-DD format`);
          }
        }
      }
    }
  }

  return errors;
}

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

// ============ SIMILARITY DETECTION ============

/**
 * Simple stemmer for common English suffixes
 * Reduces words to approximate base forms for better matching
 */
function simpleStem(word) {
  if (word.length <= 3) return word;

  // Handle common suffixes (order matters - longest first)
  const suffixes = [
    ['ation', ''],
    ['ment', ''],
    ['ness', ''],
    ['able', ''],
    ['ible', ''],
    ['tion', ''],
    ['sion', ''],
    ['ally', ''],
    ['ying', 'y'],
    ['ies', 'y'],
    ['ing', ''],
    ['ed', ''],
    ['es', ''],
    ['ly', ''],
    ['s', ''],
  ];

  for (const [suffix, replacement] of suffixes) {
    if (word.endsWith(suffix) && word.length > suffix.length + 2) {
      return word.slice(0, -suffix.length) + replacement;
    }
  }
  return word;
}

/**
 * Normalize text for comparison: lowercase, remove punctuation, collapse whitespace
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract stemmed words from normalized text
 */
function getWords(text) {
  const normalized = normalizeText(text);
  if (!normalized) return new Set();
  return new Set(
    normalized.split(' ')
      .filter(w => w.length > 1)
      .map(simpleStem)
  );
}

/**
 * Calculate Jaccard similarity between two word sets
 * Returns 0.0 - 1.0
 */
function jaccardSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate text similarity using Jaccard with word-order boost
 * Returns 0.0 - 1.0
 */
function textSimilarity(text1, text2) {
  const words1 = getWords(text1);
  const words2 = getWords(text2);

  const jaccard = jaccardSimilarity(words1, words2);

  // Boost if words appear in same order (first 3 words)
  const arr1 = [...words1].slice(0, 3);
  const arr2 = [...words2].slice(0, 3);
  const orderMatch = arr1.filter((w, i) => arr2[i] === w).length;
  const orderBoost = orderMatch > 0 ? 0.1 * (orderMatch / 3) : 0;

  return Math.min(1.0, jaccard + orderBoost);
}

/**
 * Find tasks similar to the given task data
 * @param {Object} newTask - { name, notes?, category?, assignee? }
 * @param {Array} existingTasks - All existing tasks/subtasks with full data
 * @param {number} threshold - Minimum similarity score (0.0 - 1.0)
 * @returns {Array} - [{ task, score, reasons[] }] sorted by score descending
 */
function findSimilarTasks(newTask, existingTasks, threshold = 0.5) {
  const results = [];

  for (const existing of existingTasks) {
    const reasons = [];

    // Name similarity (weight: 50%)
    const nameSim = textSimilarity(newTask.name, existing.name);
    if (nameSim > 0.3) {
      reasons.push(`Name: ${Math.round(nameSim * 100)}% similar`);
    }

    // Notes similarity (weight: 25%)
    let notesSim = 0;
    if (newTask.notes && existing.notes) {
      notesSim = textSimilarity(newTask.notes, existing.notes);
      if (notesSim > 0.2) {
        const overlap = [...getWords(newTask.notes)]
          .filter(w => getWords(existing.notes).has(w))
          .slice(0, 3);
        if (overlap.length > 0) {
          reasons.push(`Notes overlap: "${overlap.join('", "')}"`);
        }
      }
    }

    // Category match (weight: 15%)
    const categoryMatch = newTask.category && existing.category &&
      newTask.category === existing.category ? 1.0 : 0.0;
    if (categoryMatch > 0) {
      reasons.push(`Category: both "${existing.category}"`);
    }

    // Assignee match (weight: 10%)
    const assigneeMatch = newTask.assignee && existing.assignee &&
      newTask.assignee === existing.assignee ? 1.0 : 0.0;
    if (assigneeMatch > 0) {
      reasons.push(`Assignee: same vendor`);
    }

    // Combined weighted score
    const score = (nameSim * 0.50) + (notesSim * 0.25) +
      (categoryMatch * 0.15) + (assigneeMatch * 0.10);

    if (score >= threshold) {
      results.push({
        task: existing,
        score,
        nameSimilarity: nameSim,
        reasons,
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Get all tasks and subtasks with full data for similarity comparison
 */
function getAllTasksWithData(data) {
  const tasks = [];
  for (const task of data.tasks) {
    tasks.push({
      id: task.id,
      name: task.name,
      notes: task.notes,
      category: task.category,
      assignee: task.assignee,
      type: 'task',
    });
    for (const sub of (task.subtasks || [])) {
      tasks.push({
        id: sub.id,
        name: sub.name,
        notes: sub.notes,
        category: task.category, // Subtasks inherit parent category
        assignee: sub.assignee || task.assignee,
        type: 'subtask',
        parent: task.id,
      });
    }
  }
  return tasks;
}

/**
 * Display similarity warning box
 */
function displaySimilarityWarning(similar, detailed = false) {
  const match = similar[0];
  const pct = Math.round(match.score * 100);

  if (detailed) {
    console.log(yellow('\n⚠ Potential duplicate detected:'));
    console.log('  ┌─────────────────────────────────────────────────────────┐');
    console.log(`  │ "${match.task.name}" (${match.task.id}) - ${pct}% match`.padEnd(60) + '│');
    for (const reason of match.reasons) {
      console.log(`  │   • ${reason}`.padEnd(60) + '│');
    }
    console.log('  └─────────────────────────────────────────────────────────┘');
  } else {
    console.log(yellow(`\n⚠ Similar ${match.task.type} found: "${match.task.name}" (${match.task.id})`));
  }
}

// ============ HELPERS ============

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function findTask(data, taskId) {
  for (const task of data.tasks) {
    if (task.id === taskId) return { task, parent: null };
    for (const sub of (task.subtasks || [])) {
      if (sub.id === taskId) return { task: sub, parent: task };
    }
  }
  return { task: null, parent: null };
}

function getAllTaskItems(data) {
  const items = [];
  for (const task of data.tasks) {
    items.push({
      id: task.id,
      name: task.name,
      status: task.status || 'pending',
      type: 'task',
      assignee: task.assignee,
    });
    for (const sub of (task.subtasks || [])) {
      items.push({
        id: sub.id,
        name: sub.name,
        status: sub.status || task.status || 'pending',
        type: 'subtask',
        parent: task.id,
        assignee: sub.assignee || task.assignee,
      });
    }
  }
  return items;
}

function getVendorName(data, vendorRef) {
  if (!vendorRef) return '';
  const id = vendorRef.replace('vendor:', '');
  const vendor = data.vendors.find(v => v.id === id);
  return vendor ? vendor.name : id;
}

// ============ MATERIAL HELPERS ============

async function promptNewMaterial(data) {
  const name = await input({
    message: 'Material name:',
    validate: v => v.trim().length > 0 || 'Name is required',
  });

  const id = slugify(name);

  const status = await select({
    message: 'Material status:',
    choices: VALID_MATERIAL_STATUSES.map(s => ({ name: s, value: s })),
    default: 'need-to-select',
  });

  const quantityInput = await input({
    message: 'Quantity (optional):',
    validate: v => {
      if (!v) return true;
      const num = parseFloat(v);
      if (isNaN(num) || num < 0) return 'Must be a positive number';
      return true;
    },
  });

  const detail = await input({
    message: 'Detail (optional):',
  });

  const notes = await input({
    message: 'Notes (optional):',
  });

  // Vendor selection (optional)
  const vendorChoices = [
    { name: '(none)', value: '' },
    ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
  ];

  const vendorId = await search({
    message: 'Vendor (optional):',
    source: async (term) => {
      if (!term) return vendorChoices;
      const lower = term.toLowerCase();
      return vendorChoices.filter(c =>
        c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
      );
    },
  });

  // Expected date (optional, for ordered materials)
  let expectedDate = '';
  if (status === 'ordered' || status === 'need-to-order') {
    expectedDate = await input({
      message: 'Expected date (YYYY-MM-DD, optional):',
      validate: v => {
        if (!v) return true;
        if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
        return true;
      },
    });
  }

  // Cost (optional)
  const costInput = await input({
    message: 'Cost (optional):',
    validate: v => {
      if (!v) return true;
      const num = parseFloat(v);
      if (isNaN(num) || num < 0) return 'Must be a positive number';
      return true;
    },
  });

  // Build material object
  const material = { id, name, status };
  if (quantityInput) material.quantity = parseFloat(quantityInput);
  if (detail) material.detail = detail;
  if (notes) material.notes = notes;
  if (vendorId) material.vendor = `vendor:${vendorId}`;
  if (expectedDate) material.expectedDate = expectedDate;
  if (costInput) material.cost = parseFloat(costInput);

  return material;
}

async function collectMaterials(data) {
  const materials = [];

  while (true) {
    const action = await select({
      message: 'Material action:',
      choices: [
        { name: 'Create new material', value: 'new' },
        { name: 'Done adding materials', value: 'done' },
      ],
    });

    if (action === 'done') break;

    const material = await promptNewMaterial(data);
    materials.push(material);
    console.log(green(`  Added: ${material.name} (${material.status})`));

    const addMore = await confirm({
      message: 'Add another material?',
      default: false,
    });

    if (!addMore) break;
  }

  return materials;
}

function formatMaterial(mat, data) {
  const parts = [mat.name];
  parts.push(`(${mat.status})`);
  if (mat.quantity) parts.push(`- ${mat.quantity} units`);
  if (mat.detail) parts.push(`- ${mat.detail}`);
  if (mat.vendor) parts.push(`- ${getVendorName(data, mat.vendor)}`);
  if (mat.expectedDate) parts.push(`- expected ${mat.expectedDate}`);
  if (mat.cost) parts.push(`- $${mat.cost.toFixed(2)}`);
  return parts.join(' ');
}

function detectManualChanges(wb, data, XLSX) {
  const changes = [];

  // Build expected values from data.json
  const taskMap = {};
  const vendorNames = {};

  for (const v of data.vendors) {
    vendorNames[v.id] = v.name;
  }

  for (const task of data.tasks) {
    taskMap[task.id] = {
      status: task.status || '',
      assignee: task.assignee ? vendorNames[task.assignee.replace('vendor:', '')] || '' : '',
      start: task.start || '',
      end: task.end || '',
      dependencies: (task.dependencies || []).join(', '),
    };
    for (const sub of (task.subtasks || [])) {
      taskMap[sub.id] = {
        status: sub.status || task.status || '',
        assignee: sub.assignee
          ? vendorNames[sub.assignee.replace('vendor:', '')] || ''
          : (task.assignee ? vendorNames[task.assignee.replace('vendor:', '')] || '' : ''),
        start: sub.start || task.start || '',
        end: sub.end || sub.start || task.end || '',
        dependencies: (sub.dependencies || []).join(', '),
      };
    }
  }

  // Check Schedule and Tasks sheets
  const sheetsToCheck = [
    { name: 'Schedule', cols: { taskId: 'Task ID', status: 'Status', assignee: 'Assignee', deps: 'Dependencies' } },
    { name: 'Tasks', cols: { taskId: 'Task ID', status: 'Status', assignee: 'Assignee', start: 'Start Date', end: 'End Date', deps: 'Dependencies' } },
  ];

  for (const sheetInfo of sheetsToCheck) {
    const sheet = wb.Sheets[sheetInfo.name];
    if (!sheet) continue;

    const sheetData = XLSX.utils.sheet_to_json(sheet);

    for (const row of sheetData) {
      const taskId = row[sheetInfo.cols.taskId];
      if (!taskId) continue;

      const expected = taskMap[taskId];
      if (!expected) continue;

      // Check status
      if (sheetInfo.cols.status && row[sheetInfo.cols.status]) {
        const actual = row[sheetInfo.cols.status];
        if (actual !== expected.status && expected.status) {
          changes.push({
            sheet: sheetInfo.name,
            taskId,
            field: 'status',
            oldValue: expected.status,
            newValue: actual,
          });
        }
      }

      // Check assignee
      if (sheetInfo.cols.assignee && row[sheetInfo.cols.assignee]) {
        const actual = row[sheetInfo.cols.assignee];
        const expectedAssignee = expected.assignee || 'Needs Assignment';
        if (actual !== expectedAssignee && actual !== 'Needs Assignment' && !actual.startsWith('▶')) {
          changes.push({
            sheet: sheetInfo.name,
            taskId,
            field: 'assignee',
            oldValue: expectedAssignee,
            newValue: actual,
          });
        }
      }

      // Check dependencies
      if (sheetInfo.cols.deps) {
        const actual = row[sheetInfo.cols.deps] || '';
        if (actual !== expected.dependencies) {
          changes.push({
            sheet: sheetInfo.name,
            taskId,
            field: 'dependencies',
            oldValue: expected.dependencies,
            newValue: actual,
          });
        }
      }

      // Check dates (only in Tasks sheet)
      if (sheetInfo.cols.start && row[sheetInfo.cols.start] !== undefined) {
        const actual = row[sheetInfo.cols.start] || '';
        if (actual !== expected.start && expected.start) {
          changes.push({
            sheet: sheetInfo.name,
            taskId,
            field: 'start',
            oldValue: expected.start,
            newValue: actual,
          });
        }
      }

      if (sheetInfo.cols.end && row[sheetInfo.cols.end] !== undefined) {
        const actual = row[sheetInfo.cols.end] || '';
        if (actual !== expected.end && expected.end) {
          changes.push({
            sheet: sheetInfo.name,
            taskId,
            field: 'end',
            oldValue: expected.end,
            newValue: actual,
          });
        }
      }
    }
  }

  // Dedupe changes (same task/field might appear in multiple sheets)
  const seen = new Set();
  return changes.filter(c => {
    const key = `${c.taskId}:${c.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============ COMMANDS ============

async function cmdAdd(initialName) {
  const data = loadData();
  const existingIds = new Set();
  for (const task of data.tasks) {
    existingIds.add(task.id);
    for (const sub of (task.subtasks || [])) {
      existingIds.add(sub.id);
    }
  }

  // Task name
  const name = initialName || await input({
    message: 'Task name:',
    validate: v => v.trim().length > 0 || 'Name is required',
  });

  // Stage 1: Quick name-only duplicate check (70% threshold)
  const allExistingTasks = getAllTasksWithData(data);
  const quickMatches = findSimilarTasks({ name }, allExistingTasks, 0.70);

  if (quickMatches.length > 0) {
    displaySimilarityWarning(quickMatches, false);
    const continueAnyway = await confirm({
      message: 'Continue anyway?',
      default: false,
    });
    if (!continueAnyway) {
      console.log(yellow('Cancelled'));
      return;
    }
  }

  // Auto-generate ID
  let id = slugify(name);
  let counter = 1;
  while (existingIds.has(id)) {
    id = `${slugify(name)}-${counter++}`;
  }

  // Category
  const category = await select({
    message: 'Category:',
    choices: VALID_CATEGORIES.map(c => ({ name: c, value: c })),
  });

  // Status
  const status = await select({
    message: 'Status:',
    choices: VALID_STATUSES.map(s => ({ name: s, value: s })),
    default: 'needs-scheduled',
  });

  // Assignee
  const vendorChoices = [
    { name: '(none)', value: '' },
    ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
  ];

  const assigneeId = await search({
    message: 'Assignee (type to filter):',
    source: async (term) => {
      if (!term) return vendorChoices;
      const lower = term.toLowerCase();
      return vendorChoices.filter(c =>
        c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
      );
    },
  });

  // Start date
  const startInput = await input({
    message: 'Start date (YYYY-MM-DD, optional):',
    validate: v => {
      if (!v) return true;
      if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
      return true;
    },
  });

  // End date
  const endInput = await input({
    message: 'End date (YYYY-MM-DD, optional):',
    validate: v => {
      if (!v) return true;
      if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
      if (startInput && v < startInput) return `End date cannot be before start date (${startInput})`;
      return true;
    },
  });

  // Notes
  const notes = await input({
    message: 'Notes (optional):',
  });

  // Material dependencies
  let materials = [];
  const addMaterials = await confirm({
    message: 'Add material dependencies?',
    default: false,
  });
  if (addMaterials) {
    materials = await collectMaterials(data);
  }

  // Stage 2: Full duplicate check with all fields (50% threshold)
  const newTaskData = {
    name,
    notes,
    category,
    assignee: assigneeId ? `vendor:${assigneeId}` : undefined,
  };
  const fullMatches = findSimilarTasks(newTaskData, allExistingTasks, 0.50);

  if (fullMatches.length > 0) {
    displaySimilarityWarning(fullMatches, true);
    const action = await select({
      message: `Continue creating "${name}"?`,
      choices: [
        { name: 'Yes, create new task', value: 'create' },
        { name: 'No, cancel', value: 'cancel' },
        { name: 'Show existing task details', value: 'show' },
      ],
    });

    if (action === 'cancel') {
      console.log(yellow('Cancelled'));
      return;
    }

    if (action === 'show') {
      cmdShow(fullMatches[0].task.id);
      const createAfterShow = await confirm({
        message: `Still create new task "${name}"?`,
        default: false,
      });
      if (!createAfterShow) {
        console.log(yellow('Cancelled'));
        return;
      }
    }
  }

  // Build task object
  const newTask = {
    id,
    name,
    category,
    status,
  };

  if (assigneeId) newTask.assignee = `vendor:${assigneeId}`;
  if (startInput) newTask.start = startInput;
  if (endInput) newTask.end = endInput;
  if (notes) newTask.notes = notes;
  if (materials.length > 0) newTask.materialDependencies = materials;
  newTask.subtasks = [];

  data.tasks.push(newTask);
  saveData(data);

  const matSuffix = materials.length > 0 ? ` with ${materials.length} material${materials.length > 1 ? 's' : ''}` : '';
  console.log(green(`\n✓ Created task "${id}"${matSuffix}`));
}

async function cmdAddSubtask(parentId) {
  const data = loadData();
  const items = getAllTaskItems(data).filter(i => i.type === 'task');

  // Select parent task if not provided
  if (!parentId) {
    const choices = items.map(t => ({
      name: `${t.name} (${t.id})`,
      value: t.id,
    }));

    parentId = await search({
      message: 'Select parent task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const parentTask = data.tasks.find(t => t.id === parentId);
  if (!parentTask) {
    console.error(red(`Parent task "${parentId}" not found`));
    process.exit(1);
  }

  const existingIds = new Set();
  for (const task of data.tasks) {
    existingIds.add(task.id);
    for (const sub of (task.subtasks || [])) {
      existingIds.add(sub.id);
    }
  }

  // Subtask name
  const name = await input({
    message: 'Subtask name:',
    validate: v => v.trim().length > 0 || 'Name is required',
  });

  // Stage 1: Quick name-only duplicate check against all tasks/subtasks
  const allExistingTasks = getAllTasksWithData(data);
  const quickMatches = findSimilarTasks({ name }, allExistingTasks, 0.70);

  if (quickMatches.length > 0) {
    const match = quickMatches[0];
    const location = match.task.type === 'subtask'
      ? ` under "${match.task.parent}"`
      : '';
    console.log(yellow(`\n⚠ Similar ${match.task.type} found: "${match.task.name}" (${match.task.id})${location}`));
    const continueAnyway = await confirm({
      message: 'Continue anyway?',
      default: false,
    });
    if (!continueAnyway) {
      console.log(yellow('Cancelled'));
      return;
    }
  }

  // Auto-generate ID
  let id = slugify(name);
  let counter = 1;
  while (existingIds.has(id)) {
    id = `${slugify(name)}-${counter++}`;
  }

  // Status (default to parent's status)
  const status = await select({
    message: 'Status:',
    choices: VALID_STATUSES.map(s => ({ name: s, value: s })),
    default: parentTask.status || 'needs-scheduled',
  });

  // Assignee (default to parent's assignee)
  const vendorChoices = [
    { name: `(inherit from parent: ${getVendorName(data, parentTask.assignee) || 'none'})`, value: '' },
    ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
  ];

  const assigneeId = await search({
    message: 'Assignee (type to filter):',
    source: async (term) => {
      if (!term) return vendorChoices;
      const lower = term.toLowerCase();
      return vendorChoices.filter(c =>
        c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
      );
    },
  });

  // Notes
  const notes = await input({
    message: 'Notes (optional):',
  });

  // Material dependencies
  let materials = [];
  const addMaterials = await confirm({
    message: 'Add material dependencies?',
    default: false,
  });
  if (addMaterials) {
    materials = await collectMaterials(data);
  }

  // Stage 2: Full duplicate check with all fields (50% threshold)
  const newSubtaskData = {
    name,
    notes,
    category: parentTask.category, // Subtasks inherit parent category
    assignee: assigneeId ? `vendor:${assigneeId}` : parentTask.assignee,
  };
  const fullMatches = findSimilarTasks(newSubtaskData, allExistingTasks, 0.50);

  if (fullMatches.length > 0) {
    displaySimilarityWarning(fullMatches, true);
    const action = await select({
      message: `Continue creating subtask "${name}"?`,
      choices: [
        { name: 'Yes, create new subtask', value: 'create' },
        { name: 'No, cancel', value: 'cancel' },
        { name: 'Show existing task details', value: 'show' },
      ],
    });

    if (action === 'cancel') {
      console.log(yellow('Cancelled'));
      return;
    }

    if (action === 'show') {
      cmdShow(fullMatches[0].task.id);
      const createAfterShow = await confirm({
        message: `Still create new subtask "${name}"?`,
        default: false,
      });
      if (!createAfterShow) {
        console.log(yellow('Cancelled'));
        return;
      }
    }
  }

  // Build subtask
  const subtask = { id, name, status };
  if (assigneeId) subtask.assignee = `vendor:${assigneeId}`;
  if (notes) subtask.notes = notes;
  if (materials.length > 0) subtask.materialDependencies = materials;

  if (!parentTask.subtasks) parentTask.subtasks = [];
  parentTask.subtasks.push(subtask);

  saveData(data);
  const matSuffix = materials.length > 0 ? ` with ${materials.length} material${materials.length > 1 ? 's' : ''}` : '';
  console.log(green(`\n✓ Created subtask "${id}" under "${parentId}"${matSuffix}`));
}

async function cmdStatus(taskId) {
  const data = loadData();
  const items = getAllTaskItems(data);

  // Select task if not provided
  if (!taskId) {
    const choices = items.map(t => ({
      name: `${t.name} (${t.status}) ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task, parent } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  console.log(`Current status: ${cyan(task.status || 'pending')}`);

  const newStatus = await select({
    message: 'New status:',
    choices: VALID_STATUSES.map(s => ({ name: s, value: s })),
    default: task.status || 'needs-scheduled',
  });

  task.status = newStatus;
  saveData(data);

  console.log(green(`\n✓ Updated ${taskId} status to "${newStatus}"`));
}

async function cmdDate(taskId) {
  const data = loadData();

  if (!taskId) {
    const items = getAllTaskItems(data);
    const choices = items.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  console.log(`Current: ${task.start || '(none)'} to ${task.end || '(none)'}`);

  const startInput = await input({
    message: 'Start date (YYYY-MM-DD):',
    default: task.start || '',
    validate: v => {
      if (!v) return true;
      if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
      return true;
    },
  });

  const endInput = await input({
    message: 'End date (YYYY-MM-DD):',
    default: task.end || startInput || '',
    validate: v => {
      if (!v) return true;
      if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
      if (startInput && v < startInput) return `End date cannot be before start date (${startInput})`;
      return true;
    },
  });

  if (startInput) task.start = startInput;
  else delete task.start;

  if (endInput) task.end = endInput;
  else delete task.end;

  saveData(data);
  console.log(green(`\n✓ Updated dates for "${taskId}"`));
}

async function cmdAssign(taskId) {
  const data = loadData();

  if (!taskId) {
    const items = getAllTaskItems(data);
    const choices = items.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)} ${t.assignee ? dim(`(${getVendorName(data, t.assignee)})`) : ''}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  console.log(`Current assignee: ${task.assignee ? cyan(getVendorName(data, task.assignee)) : '(none)'}`);

  const vendorChoices = [
    { name: '(none)', value: '' },
    ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
  ];

  const assigneeId = await search({
    message: 'Assignee:',
    source: async (term) => {
      if (!term) return vendorChoices;
      const lower = term.toLowerCase();
      return vendorChoices.filter(c =>
        c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
      );
    },
  });

  if (assigneeId) {
    task.assignee = `vendor:${assigneeId}`;
  } else {
    delete task.assignee;
  }

  saveData(data);
  console.log(green(`\n✓ Updated assignee for "${taskId}"`));
}

async function cmdDeps(taskId) {
  const data = loadData();

  if (!taskId) {
    const items = getAllTaskItems(data);
    const choices = items.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  const currentDeps = task.dependencies || [];
  console.log(`\nCurrent dependencies: ${currentDeps.length > 0 ? currentDeps.join(', ') : '(none)'}`);

  const action = await select({
    message: 'Action:',
    choices: [
      { name: 'Add dependency', value: 'add' },
      { name: 'Remove dependency', value: 'remove' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (action === 'cancel') return;

  const items = getAllTaskItems(data);

  if (action === 'add') {
    // Filter out self and existing dependencies
    const available = items.filter(t => t.id !== taskId && !currentDeps.includes(t.id));

    if (available.length === 0) {
      console.log(yellow('No tasks available to add as dependency'));
      return;
    }

    const choices = available.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    const depId = await search({
      message: 'Select task to add as dependency:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });

    if (!task.dependencies) task.dependencies = [];
    task.dependencies.push(depId);

    saveData(data);
    console.log(green(`\n✓ Added dependency "${depId}" to "${taskId}"`));

  } else if (action === 'remove') {
    if (currentDeps.length === 0) {
      console.log(yellow('No dependencies to remove'));
      return;
    }

    const depId = await select({
      message: 'Select dependency to remove:',
      choices: currentDeps.map(d => ({ name: d, value: d })),
    });

    task.dependencies = task.dependencies.filter(d => d !== depId);
    if (task.dependencies.length === 0) delete task.dependencies;

    saveData(data);
    console.log(green(`\n✓ Removed dependency "${depId}" from "${taskId}"`));
  }
}

async function cmdNote(taskId) {
  const data = loadData();

  if (!taskId) {
    const items = getAllTaskItems(data);
    const choices = items.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  if (task.notes) {
    console.log(`\nCurrent notes:\n${dim(task.notes)}\n`);
  }

  const action = await select({
    message: 'Action:',
    choices: [
      { name: 'Append to notes', value: 'append' },
      { name: 'Replace notes', value: 'replace' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (action === 'cancel') return;

  const newNote = await input({
    message: 'Note:',
    validate: v => v.trim().length > 0 || 'Note is required',
  });

  if (action === 'append') {
    task.notes = task.notes ? `${task.notes}\n${newNote}` : newNote;
  } else {
    task.notes = newNote;
  }

  saveData(data);
  console.log(green(`\n✓ Updated notes for "${taskId}"`));
}

async function cmdMaterials(taskId) {
  const data = loadData();

  if (!taskId) {
    const items = getAllTaskItems(data);
    const choices = items.map(t => ({
      name: `${t.name} ${dim(`[${t.id}]`)}`,
      value: t.id,
    }));

    taskId = await search({
      message: 'Select task:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const { task } = findTask(data, taskId);
  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  const currentMaterials = task.materialDependencies || [];

  // Display current materials
  console.log(`\nCurrent materials for "${task.name}":`);
  if (currentMaterials.length === 0) {
    console.log(dim('  (none)'));
  } else {
    for (const mat of currentMaterials) {
      if (typeof mat === 'object') {
        console.log(`  - ${formatMaterial(mat, data)}`);
      } else {
        console.log(`  - ${mat} ${dim('(reference)')}`);
      }
    }
  }

  while (true) {
    const action = await select({
      message: 'Action:',
      choices: [
        { name: 'Add material', value: 'add' },
        ...(currentMaterials.length > 0 ? [
          { name: 'Remove material', value: 'remove' },
          { name: 'Update material status', value: 'status' },
        ] : []),
        { name: 'Done', value: 'done' },
      ],
    });

    if (action === 'done') break;

    if (action === 'add') {
      const material = await promptNewMaterial(data);
      if (!task.materialDependencies) task.materialDependencies = [];
      task.materialDependencies.push(material);
      saveData(data);
      console.log(green(`  ✓ Added: ${material.name} (${material.status})`));
    }

    if (action === 'remove') {
      const matChoices = currentMaterials
        .filter(m => typeof m === 'object')
        .map(m => ({
          name: `${m.name} (${m.status})`,
          value: m.id,
        }));

      if (matChoices.length === 0) {
        console.log(yellow('  No materials to remove (only references present)'));
        continue;
      }

      const matId = await select({
        message: 'Select material to remove:',
        choices: matChoices,
      });

      task.materialDependencies = task.materialDependencies.filter(m =>
        typeof m === 'string' || m.id !== matId
      );
      if (task.materialDependencies.length === 0) {
        delete task.materialDependencies;
      }
      saveData(data);
      console.log(green(`  ✓ Removed material "${matId}"`));
    }

    if (action === 'status') {
      const matChoices = currentMaterials
        .filter(m => typeof m === 'object')
        .map(m => ({
          name: `${m.name} (${m.status})`,
          value: m.id,
        }));

      if (matChoices.length === 0) {
        console.log(yellow('  No materials to update (only references present)'));
        continue;
      }

      const matId = await select({
        message: 'Select material to update:',
        choices: matChoices,
      });

      const material = task.materialDependencies.find(m =>
        typeof m === 'object' && m.id === matId
      );

      if (!material) continue;

      console.log(`  Current status: ${cyan(material.status)}`);

      const newStatus = await select({
        message: 'New status:',
        choices: VALID_MATERIAL_STATUSES.map(s => ({ name: s, value: s })),
        default: material.status,
      });

      material.status = newStatus;
      saveData(data);
      console.log(green(`  ✓ Updated "${material.name}" status to "${newStatus}"`));
    }

    // Refresh current materials list
    const refreshedTask = findTask(data, taskId).task;
    currentMaterials.length = 0;
    currentMaterials.push(...(refreshedTask.materialDependencies || []));
  }
}

function cmdList() {
  const data = loadData();

  console.log(bold('\nTasks\n'));

  for (const task of data.tasks) {
    const statusColor = task.status === 'completed' ? green :
      task.status === 'in-progress' ? cyan :
        task.status === 'blocked' ? red : dim;

    const assignee = task.assignee ? dim(` (${getVendorName(data, task.assignee)})`) : '';

    console.log(`${statusColor(`[${task.status || 'pending'}]`.padEnd(16))} ${task.name}${assignee}`);
    console.log(dim(`                ${task.id}`));

    for (const sub of (task.subtasks || [])) {
      const subStatus = sub.status || task.status || 'pending';
      const subColor = subStatus === 'completed' ? green :
        subStatus === 'in-progress' ? cyan :
          subStatus === 'blocked' ? red : dim;
      const subAssignee = sub.assignee ? dim(` (${getVendorName(data, sub.assignee)})`) :
        (task.assignee ? dim(` (${getVendorName(data, task.assignee)})`) : '');

      console.log(`  ${subColor(`[${subStatus}]`.padEnd(14))} ${sub.name}${subAssignee}`);
    }
  }

  console.log(`\n${dim(`Total: ${data.tasks.length} tasks`)}\n`);
}

function cmdShow(taskId) {
  if (!taskId) {
    console.error(red('Usage: npm run task show <task-id>'));
    process.exit(1);
  }

  const data = loadData();
  const { task, parent } = findTask(data, taskId);

  if (!task) {
    console.error(red(`Task "${taskId}" not found`));
    process.exit(1);
  }

  console.log();
  console.log(bold(task.name));
  console.log(dim('─'.repeat(40)));
  console.log(`  ID:          ${task.id}`);
  if (parent) console.log(`  Parent:      ${parent.id}`);
  console.log(`  Status:      ${task.status || 'pending'}`);
  if (task.category) console.log(`  Category:    ${task.category}`);
  console.log(`  Assignee:    ${task.assignee ? getVendorName(data, task.assignee) : '(none)'}`);
  if (task.start || task.end) {
    console.log(`  Dates:       ${task.start || '?'} to ${task.end || '?'}`);
  }
  if (task.dependencies?.length > 0) {
    console.log(`  Dependencies: ${task.dependencies.join(', ')}`);
  }
  if (task.notes) {
    console.log(`  Notes:       ${task.notes.substring(0, 60)}${task.notes.length > 60 ? '...' : ''}`);
  }
  if (task.materialDependencies?.length > 0) {
    console.log(`  Materials:`);
    for (const mat of task.materialDependencies) {
      if (typeof mat === 'object') {
        console.log(`               - ${formatMaterial(mat, data)}`);
      } else {
        console.log(`               - ${mat} ${dim('(reference)')}`);
      }
    }
  }
  if (task.subtasks?.length > 0) {
    console.log(`  Subtasks:    ${task.subtasks.length}`);
    for (const sub of task.subtasks) {
      console.log(`               - ${sub.name} (${sub.status || task.status || 'pending'})`);
    }
  }
  console.log();
}

function cmdValidate() {
  const data = loadData();
  const errors = validate(data);

  if (errors.length === 0) {
    console.log(green('✓ Data validation passed'));
  } else {
    console.error(red('\nValidation errors:'));
    errors.forEach(e => console.error(red(`  - ${e}`)));
    process.exit(1);
  }
}

async function cmdExport() {
  const data = loadData();
  const xlsxPath = path.join(projectDir, 'Kitchen-Remodel-Tracker.xlsx');
  const googleDrivePath = path.join(
    process.env.HOME,
    'Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Kitchen-Remodel-Tracker.xlsx'
  );

  // Step 1: Validate first
  console.log('Validating data...');
  const errors = validate(data);
  if (errors.length > 0) {
    console.error(red('\nValidation failed:'));
    errors.forEach(e => console.error(red(`  - ${e}`)));
    process.exit(1);
  }
  console.log(green('✓ Data validation passed'));

  // Step 2: Check for manual changes in Google Drive spreadsheet
  let gcResponses = [];
  let manualChanges = [];

  if (fs.existsSync(googleDrivePath)) {
    console.log('Checking Google Drive spreadsheet for changes...');

    try {
      const XLSX = (await import('xlsx-js-style')).default;
      const wbGD = XLSX.readFile(googleDrivePath);

      // Check for GC responses to preserve
      const gcSheet = wbGD.Sheets['GC Action Needed'];
      if (gcSheet) {
        const gcData = XLSX.utils.sheet_to_json(gcSheet);
        gcResponses = gcData
          .filter(row => row['GC Response'] && row['GC Response'].trim())
          .map(row => ({
            noteId: row['Note ID'],
            response: row['GC Response'],
          }));

        if (gcResponses.length > 0) {
          console.log(yellow(`⚠ Found ${gcResponses.length} GC response(s) that will be preserved`));
          for (const r of gcResponses) {
            console.log(dim(`  - ${r.noteId}: "${r.response.substring(0, 40)}${r.response.length > 40 ? '...' : ''}"`));
          }
        }
      }

      // Check for manual changes in other sheets by comparing to data.json
      manualChanges = detectManualChanges(wbGD, data, XLSX);

      if (manualChanges.length > 0) {
        console.log(red(`\n⚠ Detected ${manualChanges.length} manual change(s) in protected sheets:`));
        for (const c of manualChanges) {
          console.log(red(`  - ${c.sheet}: ${c.taskId} ${c.field}: "${c.oldValue}" → "${c.newValue}"`));
        }
        console.log(yellow('\nThese changes will be REVERTED. To apply them properly, use the CLI:'));
        for (const c of manualChanges) {
          if (c.field === 'status') {
            console.log(cyan(`  npm run task status ${c.taskId}`));
          } else if (c.field === 'assignee') {
            console.log(cyan(`  npm run task assign ${c.taskId}`));
          } else if (c.field === 'dependencies') {
            console.log(cyan(`  npm run task deps ${c.taskId}`));
          } else if (c.field === 'start' || c.field === 'end') {
            console.log(cyan(`  npm run task date ${c.taskId}`));
          }
        }

        // Add a note to data.json about the manual changes
        const today = new Date().toISOString().split('T')[0];
        const noteId = `manual-edit-${Date.now()}`;
        const changeDetails = manualChanges.map(c =>
          `${c.taskId}: ${c.field} was changed to "${c.newValue}" in spreadsheet`
        ).join('; ');

        const newNote = {
          id: noteId,
          created: today,
          content: `SPREADSHEET EDIT DETECTED: The following changes were made directly in the spreadsheet and reverted: ${changeDetails}. Please use the CLI (npm run task) to make changes - do not edit the spreadsheet directly except in the "GC Action Needed" sheet.`,
          tags: ['gc-action-required', ...manualChanges.map(c => `task:${c.taskId}`)],
        };

        data.notes.push(newNote);
        saveData(data);
        console.log(yellow(`\nAdded note "${noteId}" to GC Action Needed sheet`));
      }
    } catch (err) {
      console.log(dim(`Could not read Google Drive spreadsheet: ${err.message}`));
    }
  } else if (fs.existsSync(xlsxPath)) {
    // Fall back to local file if GD not available
    console.log('Checking local spreadsheet...');
    try {
      const XLSX = (await import('xlsx-js-style')).default;
      const wb = XLSX.readFile(xlsxPath);
      const gcSheet = wb.Sheets['GC Action Needed'];

      if (gcSheet) {
        const gcData = XLSX.utils.sheet_to_json(gcSheet);
        gcResponses = gcData
          .filter(row => row['GC Response'] && row['GC Response'].trim())
          .map(row => ({
            noteId: row['Note ID'],
            response: row['GC Response'],
          }));

        if (gcResponses.length > 0) {
          console.log(yellow(`⚠ Found ${gcResponses.length} GC response(s) that will be preserved`));
          for (const r of gcResponses) {
            console.log(dim(`  - ${r.noteId}: "${r.response.substring(0, 40)}${r.response.length > 40 ? '...' : ''}"`));
          }
        }
      }
    } catch {
      console.log(dim('Could not read existing spreadsheet, creating fresh export'));
    }
  }

  // Step 3: Confirm export
  const confirmed = await confirm({
    message: manualChanges.length > 0
      ? `Export and REVERT ${manualChanges.length} manual change(s)?`
      : 'Export to spreadsheet?',
    default: true,
  });

  if (!confirmed) {
    console.log(yellow('Cancelled'));
    return;
  }

  // Step 4: Run the export script
  console.log('\nRunning export...');
  try {
    execSync('node scripts/export-to-spreadsheet.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch {
    console.error(red('Export failed'));
    process.exit(1);
  }

  // Step 5: Merge GC responses back if any
  if (gcResponses.length > 0) {
    console.log('\nPreserving GC responses...');

    try {
      const XLSX = (await import('xlsx-js-style')).default;

      const wb = XLSX.readFile(xlsxPath);
      const gcSheet = wb.Sheets['GC Action Needed'];

      if (gcSheet) {
        const gcData = XLSX.utils.sheet_to_json(gcSheet, { header: 1 });
        const headerRow = gcData[0];
        const responseColIndex = headerRow.indexOf('GC Response');

        if (responseColIndex >= 0) {
          // Build note ID to row index mapping
          const noteIdColIndex = headerRow.indexOf('Note ID');

          for (let i = 1; i < gcData.length; i++) {
            const noteId = gcData[i][noteIdColIndex];
            const preserved = gcResponses.find(r => r.noteId === noteId);

            if (preserved) {
              const cellRef = XLSX.utils.encode_cell({ r: i, c: responseColIndex });
              gcSheet[cellRef] = { t: 's', v: preserved.response };
            }
          }

          XLSX.writeFile(wb, xlsxPath);
          console.log(green(`✓ Preserved ${gcResponses.length} GC response(s)`));
        }
      }
    } catch (err) {
      console.error(yellow(`Warning: Could not preserve GC responses: ${err.message}`));
    }
  }

  // Step 6: Copy to Google Drive
  console.log('\nCopying to Google Drive...');
  try {
    fs.copyFileSync(xlsxPath, googleDrivePath);
    console.log(green('✓ Copied to Google Drive'));
  } catch (err) {
    console.error(yellow(`Warning: Could not copy to Google Drive: ${err.message}`));
    console.log(dim(`Manual copy: cp "${xlsxPath}" "${googleDrivePath}"`));
  }

  // Step 7: Summary
  const taskCount = data.tasks.reduce((sum, t) => sum + 1 + (t.subtasks?.length || 0), 0);
  console.log(green(`\n✓ Exported ${taskCount} tasks to Kitchen-Remodel-Tracker.xlsx`));
}

// ============ MAIN ============

const args = process.argv.slice(2);
const command = args[0];
const arg1 = args[1];

switch (command) {
  case 'add':
    cmdAdd(arg1).catch(console.error);
    break;
  case 'add-subtask':
    cmdAddSubtask(arg1).catch(console.error);
    break;
  case 'status':
    cmdStatus(arg1).catch(console.error);
    break;
  case 'date':
    cmdDate(arg1).catch(console.error);
    break;
  case 'assign':
    cmdAssign(arg1).catch(console.error);
    break;
  case 'deps':
    cmdDeps(arg1).catch(console.error);
    break;
  case 'note':
    cmdNote(arg1).catch(console.error);
    break;
  case 'materials':
    cmdMaterials(arg1).catch(console.error);
    break;
  case 'list':
    cmdList();
    break;
  case 'show':
    cmdShow(arg1);
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'export':
    cmdExport().catch(console.error);
    break;
  default:
    console.log(`
${bold('Task Management CLI')}

${yellow('Usage:')} npm run task <command> [options]

${yellow('Commands:')}
  add [name]           Add a new task (interactive)
  add-subtask [parent] Add a subtask to existing task
  status [task-id]     Update task status
  date <task-id>       Update task dates
  assign <task-id>     Assign task to vendor
  deps <task-id>       Manage dependencies
  materials [task-id]  Manage material dependencies
  note <task-id>       Add a note to task
  list                 List all tasks
  show <task-id>       Show task details
  validate             Validate data.json
  export               Export to spreadsheet with guardrails

${yellow('Examples:')}
  npm run task add "Install dryer vents"
  npm run task status finish-trim
  npm run task deps hvac-registers
  npm run task materials kitchen-crown-molding
  npm run task export
`);
}
