#!/usr/bin/env node
/**
 * Task Management CLI for Kitchen Remodel Project
 * Unified Issues System v2
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
 *   materials-check      Scan materials and create missing issues
 *   note <task-id>       Add a note to task
 *   issues [--action]    List issues by action category
 *   issue [id]           Add new issue or manage existing
 *   respond [id]         Answer an issue with structured response
 *   review [id]          Review answered issues with impact analysis
 *   detect               Run auto-detection rules
 *   dismiss [id]         Dismiss an auto-detected issue
 *   list                 List all tasks
 *   show <task-id>       Show task details
 *   validate             Validate data.json
 *   export               Export to spreadsheet with guardrails
 *
 * Action Categories (--action filter):
 *   ASSIGN, SCHEDULE, ORDER, SPECIFY, TRACK, DECIDE
 *
 * Issue Types:
 *   assignee, date, date-range, dependency, yes-no, select-one,
 *   material-status, notification, free-text, schedule-conflict,
 *   past-due, unscheduled-blocker, material-overdue
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
const VALID_MATERIAL_STATUSES = ['need-to-select', 'selected', 'need-to-order', 'ordered', 'vendor-provided', 'on-hand'];

// Question assignees and statuses (unified issues system)
const VALID_ASSIGNEES = ['brandon', 'dave', 'tonia', 'system'];
const VALID_QUESTION_STATUSES = ['open', 'answered', 'resolved', 'dismissed'];
const VALID_REVIEW_STATUSES = ['pending', 'accepted', 'rejected'];
const VALID_ISSUE_SOURCES = ['manual', 'auto-lifecycle', 'auto-detection'];
const ASSIGNEE_DISPLAY_NAMES = {
  brandon: 'Brandon (GC)',
  dave: 'Dave',
  tonia: 'Tonia'
};

// Structured question types
const QUESTION_TYPES = [
  { value: 'assignee', name: 'Assignee (Who should do X?)', questionPattern: 'Who' },
  { value: 'date', name: 'Date (When should X happen?)', questionPattern: 'When' },
  { value: 'date-range', name: 'Date Range (Start and end dates)', questionPattern: null },
  { value: 'dependency', name: 'Dependency (What depends on what?)', questionPattern: 'depend' },
  { value: 'yes-no', name: 'Yes/No (Binary decision)', questionPattern: 'Should' },
  { value: 'select-one', name: 'Select One (Choose from options)', questionPattern: null },
  { value: 'material-status', name: 'Material Status (Status update)', questionPattern: null },
  { value: 'notification', name: 'Notification (System alert)', questionPattern: 'DETECTED' },
  { value: 'free-text', name: 'Free Text (Open-ended)', questionPattern: null },
];

// Question type display names for UI
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

// Keywords that suggest a question should go to Tonia (material-related)
const TONIA_KEYWORDS = [
  'material', 'order', 'buy', 'purchase', 'supplier',
  'hinge', 'door', 'molding', 'trim', 'paint', 'flooring', 'tile',
  'cabinet', 'handle', 'knob', 'fixture', 'light', 'lamp',
  'hardware', 'screw', 'nail', 'bracket', 'shelf'
];

// ============ ACTION CATEGORIES (UNIFIED ISSUES SYSTEM) ============

// Action-oriented categories: "What do I need to DO?"
const ACTION_CATEGORIES = ['ASSIGN', 'SCHEDULE', 'ORDER', 'SPECIFY', 'TRACK', 'DECIDE'];

// Display names for action categories
const CATEGORY_DISPLAY_NAMES = {
  'ASSIGN': 'Assign',
  'SCHEDULE': 'Schedule',
  'ORDER': 'Order',
  'SPECIFY': 'Specify',
  'TRACK': 'Track',
  'DECIDE': 'Decide'
};

// Row colors for action categories in spreadsheet (light pastels)
const CATEGORY_COLORS = {
  'ASSIGN': 'DEEBF7',    // Light blue
  'SCHEDULE': 'FCE4D6',  // Light orange
  'ORDER': 'E2EFDA',     // Light green
  'SPECIFY': 'FFF2CC',   // Light yellow
  'TRACK': 'E4DFEC',     // Light purple
  'DECIDE': 'FFFFFF'     // White/default
};

/**
 * Determine the ActionCategory for a question/issue based on its type and context.
 *
 * Category mapping:
 * - ASSIGN: assignee questions, missing-assignee auto-detection
 * - SCHEDULE: date/date-range (task), schedule-conflict, unscheduled-blocker, past-due
 * - ORDER: yes-no "Has X been ordered?" (material ready to order)
 * - SPECIFY: free-text for qty/specs (material missing details)
 * - TRACK: date (material delivery), material-status, material-overdue
 * - DECIDE: yes-no (task decisions), dependency, notification
 *
 * @param {Object} question - The question/issue object
 * @returns {string} ActionCategory: ASSIGN, SCHEDULE, ORDER, SPECIFY, TRACK, or DECIDE
 */
function getActionCategory(question) {
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
    // Ordered materials needing tracking → TRACK
    if (type === 'material-overdue') {
      return 'TRACK';
    }
    if (type === 'date' || (type === 'free-text' && (promptText.includes('delivery') || promptText.includes('expected')))) {
      return 'TRACK';
    }
    if (type === 'material-status') {
      return 'TRACK';
    }
    // Yes/no about ordering → ORDER
    if (type === 'yes-no' && (promptText.includes('order') || promptText.includes('purchase') || promptText.includes('buy'))) {
      return 'ORDER';
    }
    // Free-text for specs/quantity → SPECIFY
    if (type === 'free-text') {
      return 'SPECIFY';
    }
  }

  // Task date questions → SCHEDULE
  if ((type === 'date' || type === 'date-range') && relatedTask) {
    return 'SCHEDULE';
  }

  // Dependency questions → DECIDE
  if (type === 'dependency') {
    return 'DECIDE';
  }

  // Notifications → DECIDE (need acknowledgment)
  if (type === 'notification') {
    return 'DECIDE';
  }

  // Yes/no questions are typically decisions
  if (type === 'yes-no') {
    return 'DECIDE';
  }

  // Free-text task questions that combine dates + assignee → SCHEDULE (primary action)
  if (type === 'free-text' && relatedTask && !relatedMaterial) {
    if (promptText.includes('schedul') || promptText.includes('date') || promptText.includes('when')) {
      return 'SCHEDULE';
    }
    if (promptText.includes('assign') || promptText.includes('who')) {
      return 'ASSIGN';
    }
  }

  // Default to DECIDE for anything else
  return 'DECIDE';
}

/**
 * Generate a short title for an issue based on its type and context
 * @param {Object} question - The question/issue object
 * @returns {string} Short title (max ~40 chars)
 */
function generateIssueTitle(question) {
  const { type, relatedTask, relatedMaterial, prompt = '', question: legacyPrompt = '' } = question;
  const promptText = prompt || legacyPrompt;

  // For material-related issues, include material name
  if (relatedMaterial) {
    const materialName = relatedMaterial.replace(/-/g, ' ');
    switch (type) {
      case 'free-text':
        if (promptText.toLowerCase().includes('quantity')) return `Qty needed: ${materialName}`;
        if (promptText.toLowerCase().includes('spec')) return `Specs needed: ${materialName}`;
        return `Info needed: ${materialName}`;
      case 'yes-no':
        if (promptText.toLowerCase().includes('order')) return `Order ready? ${materialName}`;
        return `Confirm: ${materialName}`;
      case 'date':
        return `Delivery date: ${materialName}`;
      case 'material-status':
        return `Status: ${materialName}`;
      case 'material-overdue':
        return `Overdue: ${materialName}`;
      default:
        return `Material: ${materialName}`;
    }
  }

  // For task-related issues
  if (relatedTask) {
    const taskName = relatedTask.replace(/-/g, ' ');
    switch (type) {
      case 'assignee':
      case 'missing-assignee':
        return `Assign: ${taskName}`;
      case 'date':
      case 'date-range':
        return `Schedule: ${taskName}`;
      case 'free-text':
        // Combined date+assignee questions
        if (promptText.toLowerCase().includes('schedul') && promptText.toLowerCase().includes('who')) {
          return `Schedule+Assign: ${taskName}`;
        }
        return `Info: ${taskName}`;
      case 'dependency':
        return `Dependencies: ${taskName}`;
      case 'yes-no':
        if (promptText.toLowerCase().includes('complete')) return `Complete? ${taskName}`;
        if (promptText.toLowerCase().includes('start')) return `Started? ${taskName}`;
        return `Decide: ${taskName}`;
      case 'schedule-conflict':
        return `Conflict: ${taskName}`;
      case 'past-due':
        return `Past due: ${taskName}`;
      case 'unscheduled-blocker':
        return `Blocking: ${taskName}`;
      default:
        return `Task: ${taskName}`;
    }
  }

  // Fallback: use first 40 chars of prompt
  if (promptText.length > 40) {
    return promptText.substring(0, 37) + '...';
  }
  return promptText || 'Issue';
}

// Command aliases for backward compatibility (questions → issues)
const COMMAND_ALIASES = {
  'question': 'issue',
  'questions': 'issues',
  'answer': 'respond',
};

// ============ FLAG PARSING ============

/**
 * Parse command line flags into an options object
 * Supports: --flag value, --flag=value, --boolean-flag
 */
function parseFlags(args) {
  const flags = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        flags[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    }
    i++;
  }
  return flags;
}

/**
 * Validate required flags and enum values
 * Returns array of error messages (empty if valid)
 */
function validateFlags(flags, rules) {
  const errors = [];
  for (const [key, rule] of Object.entries(rules)) {
    const value = flags[key];
    if (rule.required && !value) {
      errors.push(`Missing required flag: --${key}`);
    }
    if (value && rule.enum && !rule.enum.includes(value)) {
      errors.push(`Invalid value for --${key}: "${value}". Valid values: ${rule.enum.join(', ')}`);
    }
    if (value && rule.validate && !rule.validate(value)) {
      errors.push(`Invalid value for --${key}: "${value}". ${rule.message || ''}`);
    }
  }
  return errors;
}

// ============ DATA OPERATIONS ============

function loadData() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  // Migrate questions → issues if needed
  if (data.issues && !data.issues) {
    data.issues = data.issues;
    delete data.issues;
  }
  if (!data.issues) {
    data.issues = [];
  }
  return data;
}

function saveData(data) {
  // Migrate 'questions' to 'issues' if needed (legacy support)
  if (data.questions && !data.issues) {
    data.issues = data.questions;
  }
  if (data.questions) {
    delete data.questions;
  }
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
  const issueIds = new Set();

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

  // Validate issues
  const validIssueTypes = [
    'assignee', 'date', 'date-range', 'dependency', 'yes-no', 'select-one',
    'material-status', 'notification', 'free-text',
    // Auto-detection types
    'schedule-conflict', 'missing-assignee', 'past-due', 'unscheduled-blocker', 'material-overdue'
  ];

  for (const issue of (data.issues || [])) {
    // Duplicate ID check
    if (issueIds.has(issue.id)) {
      errors.push(`Duplicate issue ID: "${issue.id}"`);
    }
    issueIds.add(issue.id);

    // Required fields - support both prompt (new) and question (legacy) fields
    const promptText = issue.prompt || issue.question;
    if (!promptText || promptText.trim().length === 0) {
      errors.push(`Issue "${issue.id}" is missing prompt text`);
    }

    // Type validation (optional for legacy issues)
    if (issue.type && !validIssueTypes.includes(issue.type)) {
      errors.push(`Invalid type "${issue.type}" for issue "${issue.id}". Valid: ${validIssueTypes.join(', ')}`);
    }

    // Assignee validation
    if (!issue.assignee) {
      errors.push(`Issue "${issue.id}" is missing assignee`);
    } else if (!VALID_ASSIGNEES.includes(issue.assignee)) {
      errors.push(`Invalid assignee "${issue.assignee}" for issue "${issue.id}". Valid: ${VALID_ASSIGNEES.join(', ')}`);
    }

    // Status validation
    if (!issue.status) {
      errors.push(`Issue "${issue.id}" is missing status`);
    } else if (!VALID_QUESTION_STATUSES.includes(issue.status)) {
      errors.push(`Invalid status "${issue.status}" for issue "${issue.id}". Valid: ${VALID_QUESTION_STATUSES.join(', ')}`);
    }

    // Review status validation (optional)
    if (issue.reviewStatus && !VALID_REVIEW_STATUSES.includes(issue.reviewStatus)) {
      errors.push(`Invalid review status "${issue.reviewStatus}" for issue "${issue.id}". Valid: ${VALID_REVIEW_STATUSES.join(', ')}`);
    }

    // Related task validation (if provided)
    if (issue.relatedTask && !taskIds.has(issue.relatedTask)) {
      errors.push(`Related task "${issue.relatedTask}" not found for issue "${issue.id}"`);
    }

    // Related material validation (if provided)
    if (issue.relatedMaterial) {
      const allMaterialIds = getAllMaterialIds(data);
      if (!allMaterialIds.has(issue.relatedMaterial)) {
        errors.push(`Related material "${issue.relatedMaterial}" not found for issue "${issue.id}"`);
      }
    }

    // Date validations
    if (issue.created && !isValidDate(issue.created)) {
      errors.push(`Invalid created date "${issue.created}" for issue "${issue.id}". Use YYYY-MM-DD format`);
    }
    if (issue.resolvedDate && !isValidDate(issue.resolvedDate)) {
      errors.push(`Invalid resolved date "${issue.resolvedDate}" for issue "${issue.id}". Use YYYY-MM-DD format`);
    }
    if (issue.resolvedAt && !isValidDate(issue.resolvedAt)) {
      errors.push(`Invalid resolvedAt date "${issue.resolvedAt}" for issue "${issue.id}". Use YYYY-MM-DD format`);
    }
    if (issue.respondedAt && !isValidDate(issue.respondedAt)) {
      errors.push(`Invalid respondedAt date "${issue.respondedAt}" for issue "${issue.id}". Use YYYY-MM-DD format`);
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

// ============ QUESTION HELPERS ============

/**
 * Auto-detect question assignee based on keywords
 * Material-related questions go to Tonia, others to Brandon
 */
function detectAssignee(questionText) {
  const lower = questionText.toLowerCase();
  if (TONIA_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'tonia';
  }
  return 'brandon'; // default
}

/**
 * Find questions similar to the given question text
 */
function findSimilarQuestions(newQuestion, existingQuestions, threshold = 0.5) {
  const results = [];
  const newQuestionText = newQuestion.prompt || newQuestion.question || '';

  for (const existing of existingQuestions) {
    const reasons = [];
    const existingText = existing.prompt || existing.question || '';

    // Question text similarity (weight: 70%)
    const textSim = textSimilarity(newQuestionText, existingText);
    if (textSim > 0.3) {
      reasons.push(`Question: ${Math.round(textSim * 100)}% similar`);
    }

    // Same assignee (weight: 15%)
    const assigneeMatch = newQuestion.assignee && existing.assignee &&
      newQuestion.assignee === existing.assignee ? 1.0 : 0.0;
    if (assigneeMatch > 0) {
      reasons.push(`Assignee: both "${ASSIGNEE_DISPLAY_NAMES[existing.assignee]}"`);
    }

    // Same related task (weight: 15%)
    const taskMatch = newQuestion.relatedTask && existing.relatedTask &&
      newQuestion.relatedTask === existing.relatedTask ? 1.0 : 0.0;
    if (taskMatch > 0) {
      reasons.push(`Related task: ${existing.relatedTask}`);
    }

    // Combined weighted score
    const score = (textSim * 0.70) + (assigneeMatch * 0.15) + (taskMatch * 0.15);

    if (score >= threshold) {
      results.push({
        question: existing,
        score,
        textSimilarity: textSim,
        reasons,
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Display question similarity warning
 */
function displayQuestionSimilarityWarning(similar) {
  const match = similar[0];
  const pct = Math.round(match.score * 100);

  console.log(yellow('\n⚠ Similar question found:'));
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  const questionPreview = match.question.question.substring(0, 45) + (match.question.question.length > 45 ? '...' : '');
  console.log(`  │ "${questionPreview}" (${match.question.id})`.padEnd(60) + '│');
  console.log(`  │ ${pct}% match - ${match.question.status}`.padEnd(60) + '│');
  for (const reason of match.reasons) {
    console.log(`  │   • ${reason}`.padEnd(60) + '│');
  }
  console.log('  └─────────────────────────────────────────────────────────┘');
}

/**
 * Get questions related to a specific task
 */
function getQuestionsForTask(data, taskId) {
  const questions = data.issues || [];
  return questions.filter(q => q.relatedTask === taskId);
}

/**
 * Get all materials for a task (including subtask materials)
 */
function getMaterialsForTask(data, taskId) {
  const { task, parent } = findTask(data, taskId);
  if (!task) return [];

  const materials = [];

  // If this is a subtask, get parent task's materials too
  if (parent) {
    for (const mat of (parent.materialDependencies || [])) {
      if (typeof mat === 'object') {
        materials.push({ ...mat, source: parent.id });
      }
    }
  }

  // Get task's own materials
  for (const mat of (task.materialDependencies || [])) {
    if (typeof mat === 'object') {
      materials.push({ ...mat, source: task.id });
    }
  }

  return materials;
}

/**
 * Get all material IDs across all tasks
 */
function getAllMaterialIds(data) {
  const materialIds = new Set();
  for (const task of data.tasks) {
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat === 'object' && mat.id) {
        materialIds.add(mat.id);
      }
    }
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat === 'object' && mat.id) {
          materialIds.add(mat.id);
        }
      }
    }
  }
  return materialIds;
}

/**
 * Auto-detect question type from question/prompt text
 */
function detectQuestionType(text) {
  const lower = text.toLowerCase();

  // Check for notification pattern (system alerts)
  if (lower.includes('spreadsheet edit detected') || lower.includes('detected:')) {
    return 'notification';
  }

  // Check for assignee pattern (who questions)
  if (lower.startsWith('who ') || lower.includes(' who ')) {
    return 'assignee';
  }

  // Check for dependency pattern
  if (lower.includes('depend') || lower.includes('block') || lower.includes('wait for')) {
    return 'dependency';
  }

  // Check for yes/no pattern
  if (lower.startsWith('should ') || lower.startsWith('do we ') || lower.startsWith('can we ') ||
      lower.startsWith('is it ') || lower.startsWith('does ')) {
    return 'yes-no';
  }

  // Check for date pattern
  if (lower.startsWith('when ') || lower.includes(' when ') || lower.includes('date')) {
    // If mentions both start and end, it's a date range
    if ((lower.includes('start') && lower.includes('end')) || lower.includes('schedule') || lower.includes('dates')) {
      return 'date-range';
    }
    return 'date';
  }

  // Default to free-text
  return 'free-text';
}

/**
 * Get the question text (supports both prompt and question fields)
 */
function getQuestionText(question) {
  return question.prompt || question.question || '';
}

/**
 * Find tasks assigned to a specific vendor
 */
function findTasksByVendor(data, vendorRef) {
  const tasks = [];
  for (const task of data.tasks) {
    if (task.assignee === vendorRef) {
      tasks.push({ ...task, type: 'task' });
    }
    for (const sub of (task.subtasks || [])) {
      if (sub.assignee === vendorRef || (!sub.assignee && task.assignee === vendorRef)) {
        tasks.push({ ...sub, type: 'subtask', parentId: task.id });
      }
    }
  }
  return tasks;
}

/**
 * Check if two date ranges overlap
 */
function datesOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  return start1 <= end2 && end1 >= start2;
}

/**
 * Analyze impact of an assignee change
 */
function analyzeAssigneeImpact(data, taskId, vendorId) {
  const impacts = [];
  const { task, parent } = findTask(data, taskId);
  if (!task) return impacts;

  // Check vendor's other assignments for date overlaps
  const vendorTasks = findTasksByVendor(data, vendorId);
  const taskStart = task.start || (parent ? parent.start : null);
  const taskEnd = task.end || task.start || (parent ? parent.end : null);

  for (const vt of vendorTasks) {
    if (vt.id === taskId) continue;
    const vtStart = vt.start;
    const vtEnd = vt.end || vt.start;
    if (datesOverlap(taskStart, taskEnd, vtStart, vtEnd)) {
      impacts.push({
        type: 'warning',
        message: `Vendor overlap with "${vt.name}" (${vtStart} - ${vtEnd})`
      });
    }
  }

  // Count subtasks that will inherit
  if (task.subtasks) {
    const inheritCount = task.subtasks.filter(s => !s.assignee).length;
    if (inheritCount > 0) {
      const subtaskNames = task.subtasks
        .filter(s => !s.assignee)
        .map(s => s.id)
        .slice(0, 3)
        .join(', ');
      impacts.push({
        type: 'info',
        message: `${inheritCount} subtask(s) will inherit: ${subtaskNames}${inheritCount > 3 ? '...' : ''}`
      });
    }
  }

  return impacts;
}

/**
 * Analyze impact of a date range change
 */
function analyzeDateRangeImpact(data, taskId, start, end) {
  const impacts = [];
  const { task, parent } = findTask(data, taskId);
  if (!task) return impacts;

  // Check dependencies complete before start
  for (const depId of (task.dependencies || [])) {
    const dep = findTask(data, depId).task;
    if (dep) {
      if (!dep.end && !dep.start) {
        impacts.push({
          type: 'warning',
          message: `Dependency "${depId}" not scheduled yet`
        });
      } else if (dep.end && dep.end >= start) {
        impacts.push({
          type: 'error',
          message: `Dependency "${depId}" ends ${dep.end}, after proposed start ${start}`
        });
      } else if (dep.end) {
        impacts.push({
          type: 'info',
          message: `Dependency "${depId}" ends ${dep.end} - OK`
        });
      }
    }
  }

  // Check if this task blocks others
  for (const task2 of data.tasks) {
    if ((task2.dependencies || []).includes(taskId)) {
      if (task2.start && task2.start <= end) {
        impacts.push({
          type: 'warning',
          message: `Blocks "${task2.id}" which starts ${task2.start}`
        });
      }
    }
    for (const sub of (task2.subtasks || [])) {
      if ((sub.dependencies || []).includes(taskId)) {
        const subStart = sub.start || task2.start;
        if (subStart && subStart <= end) {
          impacts.push({
            type: 'warning',
            message: `Blocks "${sub.id}" which starts ${subStart}`
          });
        }
      }
    }
  }

  return impacts;
}

/**
 * Analyze impact of adding dependencies
 */
function analyzeDependencyImpact(data, taskId, newDepIds) {
  const impacts = [];
  const { task } = findTask(data, taskId);
  if (!task) return impacts;

  // Check for circular dependencies
  for (const depId of newDepIds) {
    const depTask = findTask(data, depId).task;
    if (depTask && (depTask.dependencies || []).includes(taskId)) {
      impacts.push({
        type: 'error',
        message: `Circular dependency: "${depId}" already depends on "${taskId}"`
      });
    }
  }

  // Check if new deps are scheduled
  for (const depId of newDepIds) {
    const depTask = findTask(data, depId).task;
    if (depTask) {
      if (!depTask.end && !depTask.start) {
        impacts.push({
          type: 'warning',
          message: `"${depId}" not scheduled - "${taskId}" cannot be scheduled until it has dates`
        });
      } else {
        impacts.push({
          type: 'info',
          message: `"${depId}" ends ${depTask.end || depTask.start}`
        });
      }
    }
  }

  return impacts;
}

/**
 * Analyze full impact of a question response
 */
function analyzeImpact(data, question) {
  const impacts = [];
  const response = question.response;
  const relatedTask = question.relatedTask;

  if (!response || typeof response === 'string') {
    return impacts;
  }

  switch (response.type) {
    case 'assignee':
      impacts.push(...analyzeAssigneeImpact(data, relatedTask, response.value));
      break;
    case 'date':
      impacts.push(...analyzeDateRangeImpact(data, relatedTask, response.value, response.value));
      break;
    case 'date-range':
      impacts.push(...analyzeDateRangeImpact(data, relatedTask, response.start, response.end));
      break;
    case 'dependency':
      impacts.push(...analyzeDependencyImpact(data, relatedTask, response.tasks));
      break;
    case 'yes-no':
      // Context-dependent - may need follow-up
      if (response.value) {
        impacts.push({ type: 'info', message: 'Response is Yes - may require follow-up action' });
      }
      break;
  }

  return impacts;
}

/**
 * Get proposed changes for a question response
 */
function getProposedChanges(data, question) {
  const changes = [];
  const response = question.response;
  const relatedTask = question.relatedTask;

  if (!response || typeof response === 'string' || !relatedTask) {
    return changes;
  }

  const { task, parent } = findTask(data, relatedTask);
  if (!task) return changes;

  const entityType = parent ? 'subtask' : 'task';

  switch (response.type) {
    case 'assignee':
      changes.push({
        entity: entityType,
        entityId: relatedTask,
        field: 'assignee',
        oldValue: task.assignee || null,
        newValue: response.value
      });
      // Check for subtask inheritance
      if (task.subtasks) {
        for (const sub of task.subtasks) {
          if (!sub.assignee) {
            changes.push({
              entity: 'subtask',
              entityId: sub.id,
              field: 'assignee (inherited)',
              oldValue: task.assignee || null,
              newValue: response.value
            });
          }
        }
      }
      break;

    case 'date':
      changes.push({
        entity: entityType,
        entityId: relatedTask,
        field: 'start',
        oldValue: task.start || null,
        newValue: response.value
      });
      break;

    case 'date-range':
      changes.push({
        entity: entityType,
        entityId: relatedTask,
        field: 'start',
        oldValue: task.start || null,
        newValue: response.start
      });
      changes.push({
        entity: entityType,
        entityId: relatedTask,
        field: 'end',
        oldValue: task.end || null,
        newValue: response.end
      });
      if (task.status === 'needs-scheduled') {
        changes.push({
          entity: entityType,
          entityId: relatedTask,
          field: 'status',
          oldValue: 'needs-scheduled',
          newValue: 'scheduled'
        });
      }
      break;

    case 'dependency':
      const newDeps = [...(task.dependencies || []), ...response.tasks];
      changes.push({
        entity: entityType,
        entityId: relatedTask,
        field: 'dependencies',
        oldValue: task.dependencies || [],
        newValue: newDeps
      });
      break;
  }

  return changes;
}

/**
 * Apply structured response changes to data
 */
function applyResponse(data, question) {
  const response = question.response;
  const relatedTask = question.relatedTask;
  const relatedMaterial = question.relatedMaterial;
  const changes = [];

  if (!response || typeof response === 'string') {
    return changes;
  }

  // Handle material-related questions
  if (relatedMaterial && relatedTask) {
    const materialChanges = applyMaterialResponse(data, question);
    changes.push(...materialChanges);
    return changes;
  }

  // Handle task-related questions
  if (!relatedTask) {
    return changes;
  }

  const { task, parent } = findTask(data, relatedTask);
  if (!task) return changes;

  // Try lifecycle-based auto-apply first (for questions generated by getTaskQuestion)
  const lifecycleRule = getTaskQuestion(task, !!parent);
  if (lifecycleRule && lifecycleRule.autoApply) {
    const taskChanges = applyTaskResponse(data, question);
    if (taskChanges.length > 0) {
      changes.push(...taskChanges);
      return changes;
    }
  }

  // Fall back to original logic for manually created questions
  switch (response.type) {
    case 'assignee':
      changes.push({
        entity: parent ? 'subtask' : 'task',
        entityId: relatedTask,
        field: 'assignee',
        oldValue: task.assignee,
        newValue: response.value
      });
      task.assignee = response.value;
      break;

    case 'date':
      changes.push({
        entity: parent ? 'subtask' : 'task',
        entityId: relatedTask,
        field: 'start',
        oldValue: task.start,
        newValue: response.value
      });
      task.start = response.value;
      break;

    case 'date-range':
      changes.push({
        entity: parent ? 'subtask' : 'task',
        entityId: relatedTask,
        field: 'start',
        oldValue: task.start,
        newValue: response.start
      });
      changes.push({
        entity: parent ? 'subtask' : 'task',
        entityId: relatedTask,
        field: 'end',
        oldValue: task.end,
        newValue: response.end
      });
      task.start = response.start;
      task.end = response.end;
      if (task.status === 'needs-scheduled') {
        changes.push({
          entity: parent ? 'subtask' : 'task',
          entityId: relatedTask,
          field: 'status',
          oldValue: 'needs-scheduled',
          newValue: 'scheduled'
        });
        task.status = 'scheduled';
      }
      break;

    case 'dependency':
      const oldDeps = task.dependencies || [];
      const newDeps = [...oldDeps, ...response.tasks.filter(t => !oldDeps.includes(t))];
      changes.push({
        entity: parent ? 'subtask' : 'task',
        entityId: relatedTask,
        field: 'dependencies',
        oldValue: oldDeps,
        newValue: newDeps
      });
      task.dependencies = newDeps;
      break;
  }

  return changes;
}

/**
 * Apply material question response and return changes
 */
function applyMaterialResponse(data, question) {
  const { relatedTask, relatedMaterial, response } = question;
  const changes = [];

  const { material } = findMaterial(data, relatedMaterial);
  if (!material) return changes;

  // Get the lifecycle rule for this material
  const rule = getMaterialQuestion(material, relatedTask);
  if (!rule || !rule.autoApply) return changes;

  // Apply the rule's auto-apply function
  const updates = rule.autoApply(response);
  if (!updates) return changes;

  // Record and apply each change
  for (const [field, value] of Object.entries(updates)) {
    changes.push({
      entity: 'material',
      entityId: relatedMaterial,
      field,
      oldValue: material[field],
      newValue: value
    });
    material[field] = value;
  }

  return changes;
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

// ============ STATUS CHANGE HELPERS ============

/**
 * Append a timestamped comment to a task or material's comments field.
 * Format: "N. YYYY-MM-DD: Status - Reason"
 *
 * @param {Object} entity - Task, subtask, or material object
 * @param {string} status - The new status being set
 * @param {string} reason - User-provided reason for the change
 * @returns {string} The new comment entry that was added
 */
function appendComment(entity, status, reason) {
  const today = new Date().toISOString().split('T')[0];
  const existing = entity.comments || '';
  const lines = existing.split('\n').filter(l => l.trim());
  const nextNum = lines.length + 1;
  const statusCap = status.charAt(0).toUpperCase() + status.slice(1);
  const newEntry = `${nextNum}. ${today}: ${statusCap} - ${reason}`;

  entity.comments = existing ? `${existing}\n${newEntry}` : newEntry;
  return newEntry;
}

/**
 * Find all tasks and subtasks that depend on a given task.
 *
 * @param {Object} data - The full project data object
 * @param {string} taskId - The task ID to find dependents for
 * @returns {Array} Array of { id, name, type } objects for dependent tasks
 */
function findDependentTasks(data, taskId) {
  const dependents = [];

  for (const task of data.tasks) {
    // Check if this task depends on the given taskId
    if ((task.dependencies || []).includes(taskId)) {
      dependents.push({
        id: task.id,
        name: task.name,
        type: 'task',
      });
    }

    // Check subtasks
    for (const sub of (task.subtasks || [])) {
      if ((sub.dependencies || []).includes(taskId)) {
        dependents.push({
          id: sub.id,
          name: sub.name,
          type: 'subtask',
          parent: task.id,
        });
      }
    }
  }

  return dependents;
}

/**
 * Evaluate the impact of changing a task's status on dependent tasks.
 *
 * @param {Object} data - The full project data object
 * @param {string} taskId - The task ID being changed
 * @param {string} newStatus - The new status being set
 * @returns {Object} { warnings: string[], unblocked: string[] }
 */
function evaluateDependencyImpact(data, taskId, newStatus) {
  const dependents = findDependentTasks(data, taskId);
  const warnings = [];
  const unblocked = [];

  if (dependents.length === 0) {
    return { warnings, unblocked };
  }

  // Status changes that might block dependents
  if (['cancelled', 'blocked'].includes(newStatus)) {
    const activeNames = dependents
      .filter(d => {
        const { task } = findTask(data, d.id);
        return task && !['cancelled', 'completed'].includes(task.status);
      })
      .map(d => d.name);

    if (activeNames.length > 0) {
      warnings.push(`${activeNames.length} task(s) depend on this: ${activeNames.join(', ')}`);
    }
  }

  // Status changes that unblock dependents
  if (newStatus === 'completed') {
    const blockedDeps = dependents.filter(d => {
      const { task } = findTask(data, d.id);
      return task && task.status === 'blocked';
    });

    if (blockedDeps.length > 0) {
      unblocked.push(...blockedDeps.map(d => d.name));
    }
  }

  return { warnings, unblocked };
}

/**
 * Remove a cancelled task from all dependency arrays in the project.
 * When a task is cancelled, other tasks should no longer depend on it.
 *
 * @param {Object} data - The full project data object
 * @param {string} cancelledTaskId - The ID of the cancelled task
 * @returns {string[]} List of task names that had their dependencies updated
 */
function removeCancelledTaskFromDependencies(data, cancelledTaskId) {
  const updated = [];

  for (const task of data.tasks) {
    // Check parent task dependencies
    if (task.dependencies && task.dependencies.includes(cancelledTaskId)) {
      task.dependencies = task.dependencies.filter(d => d !== cancelledTaskId);
      if (task.dependencies.length === 0) {
        delete task.dependencies;
      }
      updated.push(task.name);
    }

    // Check subtask dependencies
    for (const subtask of (task.subtasks || [])) {
      if (subtask.dependencies && subtask.dependencies.includes(cancelledTaskId)) {
        subtask.dependencies = subtask.dependencies.filter(d => d !== cancelledTaskId);
        if (subtask.dependencies.length === 0) {
          delete subtask.dependencies;
        }
        updated.push(subtask.name);
      }
    }
  }

  return updated;
}

/**
 * Generate questions for a task or material that just had a status change.
 * Uses existing question generation logic from the lifecycle rules.
 *
 * @param {Object} data - The full project data object
 * @param {string} entityType - 'task' or 'material'
 * @param {string} entityId - The entity ID
 * @param {string} taskId - For materials, the parent task ID
 * @returns {number} Number of questions generated
 */
function triggerQuestionGeneration(data, entityType, entityId, taskId = null) {
  if (!data.issues) {
    data.issues = [];
  }

  let questionsCreated = 0;

  if (entityType === 'task') {
    const { task, parent } = findTask(data, entityId);
    if (!task) return 0;

    const questionSpec = getTaskQuestion(task, !!parent);
    if (questionSpec) {
      // Check if question already exists
      const field = questionSpec.field || (questionSpec.fields ? questionSpec.fields.join('-') : 'info');
      if (!taskQuestionExists(data, entityId, questionSpec.type, field)) {
        const questionId = generateTaskQuestionId(questionSpec.type, entityId, field);
        const today = new Date().toISOString().split('T')[0];

        const newQuestion = {
          id: questionId,
          type: questionSpec.type,
          prompt: questionSpec.prompt,
          assignee: questionSpec.assignee,
          status: 'open',
          created: today,
          relatedTask: entityId,
          source: 'auto-lifecycle',
        };

        if (questionSpec.autoApply) {
          newQuestion.autoApply = questionSpec.autoApply.toString();
        }

        // Add category and title (unified issues system)
        newQuestion.category = getActionCategory(newQuestion);
        newQuestion.title = generateIssueTitle(newQuestion);

        data.issues.push(newQuestion);
        questionsCreated++;
      }
    }
  } else if (entityType === 'material') {
    const { task } = findTask(data, taskId);
    if (!task) return 0;

    const material = (task.materialDependencies || []).find(m =>
      typeof m === 'object' && m.id === entityId
    );
    if (!material) return 0;

    const questionSpec = getMaterialQuestion(material, taskId);
    if (questionSpec) {
      const field = questionSpec.field || (questionSpec.fields ? questionSpec.fields.join('-') : 'info');
      if (!materialQuestionExists(data, entityId, questionSpec.type, field)) {
        const questionId = generateMaterialQuestionId(questionSpec.type, entityId, field);
        const today = new Date().toISOString().split('T')[0];

        const newQuestion = {
          id: questionId,
          type: questionSpec.type,
          prompt: questionSpec.prompt,
          assignee: questionSpec.assignee,
          status: 'open',
          created: today,
          relatedMaterial: entityId,
          relatedTask: taskId,
          source: 'auto-lifecycle',
        };

        if (questionSpec.autoApply) {
          newQuestion.autoApply = questionSpec.autoApply.toString();
        }

        // Add category and title (unified issues system)
        newQuestion.category = getActionCategory(newQuestion);
        newQuestion.title = generateIssueTitle(newQuestion);

        data.issues.push(newQuestion);
        questionsCreated++;
      }
    }
  }

  return questionsCreated;
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

// ============ MATERIAL QUESTION LIFECYCLE ============

/**
 * Parse combined quantity/spec response
 * Expected format: "12, 4-inch Antique Bronze" or "6, N/A"
 */
function parseQuantityAndSpec(value) {
  if (!value || typeof value !== 'string') return null;

  const parts = value.split(',').map(s => s.trim());
  const quantity = parseInt(parts[0]) || null;
  const detail = parts.length > 1 ? parts.slice(1).join(', ').trim() : null;

  const result = {};
  if (quantity) result.quantity = quantity;
  if (detail && detail.toLowerCase() !== 'n/a') result.detail = detail;
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse combined delivery date and order link response
 * Expected format: "2026-01-25, https://amazon.com/..." or "2026-01-25, N/A"
 */
function parseDateAndLink(value) {
  if (!value || typeof value !== 'string') return null;

  const result = {};
  const trimmed = value.trim();

  // Look for date pattern (YYYY-MM-DD) anywhere in the string
  const dateMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    result.expectedDate = dateMatch[1];
  }

  // Look for URL pattern (http/https or common domains)
  const urlMatch = trimmed.match(/(https?:\/\/[^\s,]+|www\.[^\s,]+|amazon\.com[^\s,]*)/i);
  if (urlMatch) {
    let url = urlMatch[1];
    // Add https:// if missing
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    result.orderLink = url;
  } else {
    // Check if there's text after the date that's not N/A
    const afterDate = dateMatch
      ? trimmed.substring(trimmed.indexOf(dateMatch[1]) + dateMatch[1].length).replace(/^[\s,]+/, '').trim()
      : trimmed;
    if (afterDate && afterDate.toLowerCase() !== 'n/a' && afterDate.length > 3) {
      result.orderLink = afterDate;
    } else if (afterDate.toLowerCase() === 'n/a') {
      result.orderLink = 'N/A';
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Get the appropriate question for a material based on its lifecycle state.
 * Returns null if no question is needed.
 *
 * @param {Object} material - The material object
 * @param {string} taskId - The parent task ID
 * @returns {Object|null} Question rule or null if material is complete
 */
function getMaterialQuestion(material, taskId) {
  const { id, name, status, quantity, detail, expectedDate, orderLink } = material;
  const today = new Date().toISOString().split('T')[0];

  switch (status) {
    case 'need-to-order':
      // Combined quantity + specs question
      if (!quantity || !detail) {
        return {
          type: 'free-text',
          prompt: `How many "${name}" are needed, and what are the specifications? (Answer 'N/A' for specs if not applicable)`,
          fields: ['quantity', 'detail'],
          assignee: 'tonia',
          materialId: id,
          taskId,
          autoApply: (response) => {
            if (typeof response === 'string') {
              return parseQuantityAndSpec(response);
            }
            return response.value ? parseQuantityAndSpec(response.value) : null;
          }
        };
      }
      // Ready to order
      return {
        type: 'yes-no',
        prompt: `Has "${name}" been ordered? (Qty: ${quantity}, Spec: ${detail})`,
        field: 'status',
        assignee: 'tonia',
        materialId: id,
        taskId,
        autoApply: (response) => {
          const value = typeof response === 'object' ? response.value : response;
          return value ? { status: 'ordered' } : null;
        },
        followUp: (response) => {
          const value = typeof response === 'object' ? response.value : response;
          return value ? {
            type: 'date',
            prompt: `When is "${name}" expected to arrive?`,
            field: 'expectedDate',
            assignee: 'tonia',
            materialId: id,
            taskId
          } : null;
        }
      };

    case 'ordered':
      // Combined question for delivery date + order link (minimizes questions)
      if (!expectedDate || !orderLink) {
        // Both missing - ask combined question
        if (!expectedDate && !orderLink) {
          return {
            type: 'free-text',
            prompt: `For "${name}": What is the expected delivery date and order link? (e.g., "2026-01-25, https://amazon.com/..." or "2026-01-25, N/A")`,
            fields: ['expectedDate', 'orderLink'],
            assignee: 'tonia',
            materialId: id,
            taskId,
            autoApply: (response) => {
              const value = typeof response === 'object' ? response.value : response;
              return parseDateAndLink(value);
            }
          };
        }
        // Only expectedDate missing
        if (!expectedDate) {
          return {
            type: 'date',
            prompt: `When is "${name}" expected to arrive?`,
            field: 'expectedDate',
            assignee: 'tonia',
            materialId: id,
            taskId,
            autoApply: (response) => {
              const value = typeof response === 'object' ? response.value : response;
              return value ? { expectedDate: value } : null;
            }
          };
        }
        // Only orderLink missing
        return {
          type: 'free-text',
          prompt: `What is the order link for "${name}"? (e.g., Amazon order URL, or 'N/A' if not applicable)`,
          field: 'orderLink',
          assignee: 'tonia',
          materialId: id,
          taskId,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            if (!value) return null;
            return { orderLink: value.trim() };
          }
        };
      }
      // Check if past due and ask for delivery confirmation
      if (expectedDate < today) {
        return {
          type: 'yes-no',
          prompt: `Has "${name}" been delivered? (Expected ${expectedDate})`,
          field: 'status',
          assignee: 'tonia',
          materialId: id,
          taskId,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return value ? { status: 'on-hand' } : null;
          }
        };
      }
      return null; // Waiting for delivery date

    case 'vendor-provided':
      // No tracking needed - vendor provides as part of their work scope
      return null;

    case 'on-hand':
      return null; // Material complete

    default:
      return null;
  }
}

/**
 * Generate a question ID for a material question
 * Pattern: sq-{type}-{material-id}-{field}
 */
function generateMaterialQuestionId(type, materialId, field) {
  return `sq-${type}-${materialId}-${field || 'info'}`;
}

/**
 * Check if a question already exists for a material's fields
 * @param {Object} data - The data object
 * @param {string} materialId - The material ID
 * @param {string|string[]} fields - Field(s) to check for (e.g., 'expectedDate' or ['expectedDate', 'orderLink'])
 */
function materialQuestionExists(data, materialId, questionType, fields) {
  const questions = data.issues || [];
  const fieldsArray = Array.isArray(fields) ? fields : [fields];

  return questions.some(q => {
    if (q.relatedMaterial !== materialId) return false;
    if (q.status === 'resolved') return false;

    // Check if any of the fields we want to ask about are already covered
    return fieldsArray.some(field => q.id.includes(field));
  });
}

/**
 * Get all materials from all tasks with their parent task info
 */
function getAllMaterials(data) {
  const materials = [];
  for (const task of data.tasks) {
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat === 'object') {
        materials.push({ material: mat, taskId: task.id, taskName: task.name });
      }
    }
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat === 'object') {
          materials.push({ material: mat, taskId: sub.id, taskName: sub.name });
        }
      }
    }
  }
  return materials;
}

/**
 * Find a material by ID across all tasks
 */
function findMaterial(data, materialId) {
  for (const task of data.tasks) {
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat === 'object' && mat.id === materialId) {
        return { material: mat, task, parent: null };
      }
    }
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat === 'object' && mat.id === materialId) {
          return { material: mat, task: sub, parent: task };
        }
      }
    }
  }
  return { material: null, task: null, parent: null };
}

/**
 * Generate missing material questions (used by both materials-check and export)
 * Returns the number of questions created
 */
function generateMaterialQuestions(data) {
  if (!data.issues) {
    data.issues = [];
  }

  const materials = getAllMaterials(data);
  const today = new Date().toISOString().split('T')[0];
  let created = 0;

  for (const { material, taskId } of materials) {
    const rule = getMaterialQuestion(material, taskId);
    if (!rule) continue;

    // Check if question already exists (non-resolved)
    const existingQuestion = materialQuestionExists(data, material.id, rule.type, rule.fields || rule.field);
    if (existingQuestion) continue;

    // Generate question ID
    const fieldSuffix = rule.field || (rule.fields ? rule.fields.join('-') : 'info');
    const id = generateMaterialQuestionId(rule.type, material.id, fieldSuffix);

    // Check if a question with this ID already exists (including resolved)
    const idExists = data.issues.some(q => q.id === id);
    if (idExists) continue;

    // Create the question
    const newQuestion = {
      id,
      created: today,
      type: rule.type,
      prompt: rule.prompt,
      assignee: rule.assignee,
      status: 'open',
      relatedTask: taskId,
      relatedMaterial: material.id,
      source: 'auto-lifecycle',
    };

    // Add category and title (unified issues system)
    newQuestion.category = getActionCategory(newQuestion);
    newQuestion.title = generateIssueTitle(newQuestion);

    data.issues.push(newQuestion);
    created++;
  }

  return created;
}

/**
 * Get completeness status for a material
 * Returns: '✅ Complete', '⚠️ Missing: X', or '❌ Needs attention'
 */
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

// ============ TASK QUESTION LIFECYCLE ============

/**
 * Get the appropriate question for a task based on its lifecycle state.
 * Returns null if no question is needed.
 * @param {Object} task - The task or subtask object
 * @param {boolean} isSubtask - Whether this is a subtask
 */
function getTaskQuestion(task, isSubtask = false) {
  const { id, name, status, start, end, assignee } = task;
  const today = new Date().toISOString().split('T')[0];
  const hasStart = start && start !== '';
  const hasEnd = end && end !== '';
  const hasDates = hasStart && hasEnd;
  const hasAssignee = assignee && assignee !== '';

  switch (status) {
    case 'needs-scheduled':
      // Combined question when both missing
      if (!hasDates && !hasAssignee) {
        return {
          type: 'free-text',
          prompt: `For "${name}": When should this be scheduled, and who should do it? (e.g., "2026-01-25 to 2026-01-26, Eliseo")`,
          fields: ['start', 'end', 'assignee'],
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return parseDatesAndAssignee(value);
          }
        };
      }
      // Need dates only
      if (!hasDates) {
        return {
          type: 'date-range',
          prompt: `When should "${name}" be scheduled?`,
          fields: ['start', 'end'],
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            if (typeof response === 'object' && response.start && response.end) {
              return { start: response.start, end: response.end, status: 'scheduled' };
            }
            return parseDateRange(typeof response === 'object' ? response.value : response);
          }
        };
      }
      // Need assignee only
      if (!hasAssignee) {
        return {
          type: 'assignee',
          prompt: `Who should be assigned to "${name}"?`,
          field: 'assignee',
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return value ? { assignee: normalizeVendorRef(value) } : null;
          }
        };
      }
      return null; // Has everything, shouldn't be needs-scheduled

    case 'scheduled':
      // Missing assignee
      if (!hasAssignee) {
        return {
          type: 'assignee',
          prompt: `Who should be assigned to "${name}"?`,
          field: 'assignee',
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return value ? { assignee: normalizeVendorRef(value) } : null;
          }
        };
      }
      // Past start date, should be in-progress
      if (hasStart && start < today) {
        return {
          type: 'yes-no',
          prompt: `Has work started on "${name}"? (Scheduled start: ${start})`,
          field: 'status',
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return value ? { status: 'in-progress' } : null;
          }
        };
      }
      return null;

    case 'in-progress':
      // Past end date, might be complete
      if (hasEnd && end < today) {
        return {
          type: 'yes-no',
          prompt: `Is "${name}" complete? (Scheduled end: ${end})`,
          field: 'status',
          assignee: 'brandon',
          taskId: id,
          isSubtask,
          autoApply: (response) => {
            const value = typeof response === 'object' ? response.value : response;
            return value ? { status: 'completed' } : null;
          }
        };
      }
      return null;

    case 'completed':
    case 'cancelled':
    case 'confirmed':
    case 'blocked':
      return null; // Terminal or requires manual handling

    default:
      return null;
  }
}

/**
 * Parse combined dates + assignee response
 * @param {string} value - Response like "2026-01-25 to 2026-01-26, Eliseo"
 */
function parseDatesAndAssignee(value) {
  if (!value || typeof value !== 'string') return null;
  const result = {};

  // Look for date range pattern: YYYY-MM-DD to YYYY-MM-DD
  const dateRangeMatch = value.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (dateRangeMatch) {
    result.start = dateRangeMatch[1];
    result.end = dateRangeMatch[2];
    result.status = 'scheduled';
  }

  // Look for vendor name (anything after dates, separated by comma)
  const vendorMatch = value.match(/,\s*([^,]+?)(?:$|\s*,)/);
  if (vendorMatch) {
    result.assignee = normalizeVendorRef(vendorMatch[1].trim());
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse date range response
 * @param {string} value - Response like "2026-01-25 to 2026-01-26"
 */
function parseDateRange(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (match) {
    return { start: match[1], end: match[2], status: 'scheduled' };
  }
  return null;
}

/**
 * Normalize vendor reference (ensure vendor: prefix)
 * @param {string} value - Vendor name or reference
 */
function normalizeVendorRef(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('vendor:')) return trimmed;
  return `vendor:${trimmed}`;
}

/**
 * Generate a question ID for a task question
 * Pattern: tq-{type}-{task-id}[-{field}]
 */
function generateTaskQuestionId(type, taskId, field) {
  return `tq-${type}-${taskId}-${field || 'info'}`;
}

/**
 * Check if a question already exists for a task's fields
 * @param {Object} data - The data object
 * @param {string} taskId - The task ID
 * @param {string} questionType - Type of question (assignee, date-range, etc.)
 * @param {string|string[]} fields - Field(s) to check for
 */
function taskQuestionExists(data, taskId, questionType, fields) {
  const questions = data.issues || [];
  const fieldsArray = Array.isArray(fields) ? fields : [fields];

  return questions.some(q => {
    if (q.relatedTask !== taskId) return false;
    if (q.relatedMaterial) return false; // Skip material questions
    if (q.status === 'resolved') return false;

    // Check if any of the fields we want to ask about are already covered
    return fieldsArray.some(field => q.id.includes(field) || q.id.includes(questionType));
  });
}

/**
 * Generate missing task questions (used by export)
 * Returns the number of questions created
 */
function generateTaskQuestions(data) {
  if (!data.issues) {
    data.issues = [];
  }

  const today = new Date().toISOString().split('T')[0];
  let created = 0;

  for (const task of data.tasks) {
    // Check parent task
    const rule = getTaskQuestion(task, false);
    if (rule) {
      const fields = rule.fields || [rule.field];
      if (!taskQuestionExists(data, task.id, rule.type, fields)) {
        const fieldSuffix = rule.field || (rule.fields ? rule.fields.join('-') : 'info');
        const id = generateTaskQuestionId(rule.type, task.id, fieldSuffix);

        // Check if a question with this ID already exists (including resolved)
        const idExists = data.issues.some(q => q.id === id);
        if (!idExists) {
          const newQuestion = {
            id,
            created: today,
            type: rule.type,
            prompt: rule.prompt,
            assignee: rule.assignee,
            status: 'open',
            relatedTask: task.id,
            source: 'auto-lifecycle',
          };

          // Add category and title (unified issues system)
          newQuestion.category = getActionCategory(newQuestion);
          newQuestion.title = generateIssueTitle(newQuestion);

          data.issues.push(newQuestion);
          created++;
        }
      }
    }

    // Check subtasks
    for (const sub of (task.subtasks || [])) {
      const subRule = getTaskQuestion(sub, true);
      if (subRule) {
        const fields = subRule.fields || [subRule.field];
        if (!taskQuestionExists(data, sub.id, subRule.type, fields)) {
          const fieldSuffix = subRule.field || (subRule.fields ? subRule.fields.join('-') : 'info');
          const id = generateTaskQuestionId(subRule.type, sub.id, fieldSuffix);

          // Check if a question with this ID already exists (including resolved)
          const idExists = data.issues.some(q => q.id === id);
          if (!idExists) {
            const newQuestion = {
              id,
              created: today,
              type: subRule.type,
              prompt: subRule.prompt,
              assignee: subRule.assignee,
              status: 'open',
              relatedTask: sub.id,
              source: 'auto-lifecycle',
            };

            // Add category and title (unified issues system)
            newQuestion.category = getActionCategory(newQuestion);
            newQuestion.title = generateIssueTitle(newQuestion);

            data.issues.push(newQuestion);
            created++;
          }
        }
      }
    }
  }

  return created;
}

/**
 * Remove fully resolved questions from data.
 * A question is fully resolved when:
 * - status === 'resolved'
 * - reviewStatus === 'accepted'
 * - No partialResponse (meaning all fields were answered)
 *
 * Returns the number of questions removed.
 */
function cleanupResolvedQuestions(data) {
  if (!data.issues || data.issues.length === 0) {
    return 0;
  }

  const before = data.issues.length;

  // Keep questions that are NOT fully resolved
  data.issues = data.issues.filter(q => {
    // Keep if not resolved
    if (q.status !== 'resolved') return true;

    // Keep if not accepted (might be rejected and needs attention)
    if (q.reviewStatus !== 'accepted') return true;

    // Keep if has partial response with missing fields (still needs follow-up)
    if (q.partialResponse && q.partialResponse.missingFields && q.partialResponse.missingFields.length > 0) {
      return true;
    }

    // Fully resolved and accepted - safe to remove
    return false;
  });

  return before - data.issues.length;
}

/**
 * Apply task question response and return changes
 */
function applyTaskResponse(data, question) {
  const { relatedTask, response } = question;
  const changes = [];

  const { task, parent } = findTask(data, relatedTask);
  if (!task) return changes;

  // Get the lifecycle rule for this task
  const rule = getTaskQuestion(task, !!parent);
  if (!rule || !rule.autoApply) return changes;

  // Apply the rule's auto-apply function
  const updates = rule.autoApply(response);
  if (!updates) return changes;

  // Record and apply each change
  for (const [field, value] of Object.entries(updates)) {
    changes.push({
      entity: parent ? 'subtask' : 'task',
      entityId: relatedTask,
      field,
      oldValue: task[field],
      newValue: value
    });
    task[field] = value;
  }

  return changes;
}

/**
 * Get completeness status for a task
 * Returns: '✅ Complete', '⚠️ Missing: X', or status-specific info
 */
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

// ============ AUTO-DETECTION RULES (UNIFIED ISSUES SYSTEM) ============

/**
 * Detection rules for auto-generated issues.
 * Each rule detects a specific condition and creates an issue.
 */
const DETECTION_RULES = {
  'schedule-conflict': {
    description: 'Task scheduled before its dependency ends',
    category: 'SCHEDULE',
    detect: (data, task, parent) => {
      if (!task.start || !task.dependencies || task.dependencies.length === 0) return null;
      if (task.status === 'completed' || task.status === 'cancelled') return null;

      const conflicts = [];
      for (const depId of task.dependencies) {
        const { task: depTask } = findTask(data, depId);
        if (depTask && depTask.end && task.start < depTask.end) {
          conflicts.push({ depId, depEnd: depTask.end });
        }
      }

      if (conflicts.length === 0) return null;

      return {
        type: 'schedule-conflict',
        title: `Conflict: ${task.name}`,
        prompt: `"${task.name}" starts ${task.start} but depends on tasks that end later: ${conflicts.map(c => `${c.depId} (ends ${c.depEnd})`).join(', ')}`,
        relatedTask: task.id,
        relatedTasks: conflicts.map(c => c.depId),
        assignee: 'brandon',
        priority: 'high',
      };
    }
  },

  'past-due': {
    description: 'Task past its end date but not completed',
    category: 'SCHEDULE',
    detect: (data, task, parent) => {
      const today = new Date().toISOString().split('T')[0];
      if (!task.end || task.end >= today) return null;
      if (task.status === 'completed' || task.status === 'cancelled') return null;

      return {
        type: 'past-due',
        title: `Past due: ${task.name}`,
        prompt: `"${task.name}" was scheduled to end ${task.end} but is still ${task.status || 'pending'}`,
        relatedTask: task.id,
        assignee: 'brandon',
        priority: 'high',
      };
    }
  },

  'unscheduled-blocker': {
    description: 'Task that blocks others but has no scheduled dates',
    category: 'SCHEDULE',
    detect: (data, task, parent) => {
      if (task.start && task.end) return null; // Already scheduled
      if (task.status === 'completed' || task.status === 'cancelled') return null;

      // Check if any other task depends on this one
      const blockedTasks = [];
      for (const t of data.tasks) {
        if ((t.dependencies || []).includes(task.id)) {
          blockedTasks.push(t.id);
        }
        for (const sub of (t.subtasks || [])) {
          if ((sub.dependencies || []).includes(task.id)) {
            blockedTasks.push(sub.id);
          }
        }
      }

      if (blockedTasks.length === 0) return null;

      return {
        type: 'unscheduled-blocker',
        title: `Blocking: ${task.name}`,
        prompt: `"${task.name}" has no scheduled dates but blocks ${blockedTasks.length} task(s): ${blockedTasks.slice(0, 3).join(', ')}${blockedTasks.length > 3 ? '...' : ''}`,
        relatedTask: task.id,
        relatedTasks: blockedTasks,
        assignee: 'brandon',
        priority: 'high',
      };
    }
  },

  'material-overdue': {
    description: 'Material past expected delivery date but not on-hand',
    category: 'TRACK',
    detect: (data, material, taskId) => {
      const today = new Date().toISOString().split('T')[0];
      if (material.status === 'on-hand') return null;
      if (!material.expectedDate || material.expectedDate >= today) return null;

      return {
        type: 'material-overdue',
        title: `Overdue: ${material.name || material.id}`,
        prompt: `"${material.name || material.id}" was expected ${material.expectedDate} but status is still "${material.status}"`,
        relatedTask: taskId,
        relatedMaterial: material.id,
        assignee: 'tonia',
        priority: 'high',
      };
    }
  },
};

/**
 * Run all auto-detection rules and create/update issues.
 * - Creates new issues for detected conditions
 * - Auto-resolves issues when condition clears
 * Returns { created: number, resolved: number }
 */
function runAutoDetection(data) {
  if (!data.issues) {
    data.issues = [];
  }

  const today = new Date().toISOString().split('T')[0];
  let created = 0;
  let resolved = 0;

  // Track which detection issues are still valid
  const validDetectionIds = new Set();

  // Run task-level detection rules
  for (const task of data.tasks) {
    // Check parent task
    for (const [ruleName, rule] of Object.entries(DETECTION_RULES)) {
      if (ruleName === 'material-overdue') continue; // Material rule handled separately

      const detection = rule.detect(data, task, null);
      if (detection) {
        const issueId = `id-${detection.type}-${task.id}`;
        validDetectionIds.add(issueId);

        // Check if issue already exists
        const existing = data.issues.find(q => q.id === issueId);
        if (!existing) {
          const newIssue = {
            id: issueId,
            created: today,
            ...detection,
            category: rule.category,
            source: 'auto-detection',
            status: 'open',
            detectionRule: ruleName,
            lastChecked: today,
          };
          data.issues.push(newIssue);
          created++;
        } else {
          // Update lastChecked
          existing.lastChecked = today;
        }
      }
    }

    // Check subtasks
    for (const sub of (task.subtasks || [])) {
      for (const [ruleName, rule] of Object.entries(DETECTION_RULES)) {
        if (ruleName === 'material-overdue') continue;

        const detection = rule.detect(data, sub, task);
        if (detection) {
          const issueId = `id-${detection.type}-${sub.id}`;
          validDetectionIds.add(issueId);

          const existing = data.issues.find(q => q.id === issueId);
          if (!existing) {
            const newIssue = {
              id: issueId,
              created: today,
              ...detection,
              category: rule.category,
              source: 'auto-detection',
              status: 'open',
              detectionRule: ruleName,
              lastChecked: today,
            };
            data.issues.push(newIssue);
            created++;
          } else {
            existing.lastChecked = today;
          }
        }
      }
    }

    // Check materials for material-overdue rule
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat !== 'object') continue;

      const materialRule = DETECTION_RULES['material-overdue'];
      const detection = materialRule.detect(data, mat, task.id);
      if (detection) {
        const issueId = `id-${detection.type}-${mat.id}`;
        validDetectionIds.add(issueId);

        const existing = data.issues.find(q => q.id === issueId);
        if (!existing) {
          const newIssue = {
            id: issueId,
            created: today,
            ...detection,
            category: materialRule.category,
            source: 'auto-detection',
            status: 'open',
            detectionRule: 'material-overdue',
            lastChecked: today,
          };
          data.issues.push(newIssue);
          created++;
        } else {
          existing.lastChecked = today;
        }
      }
    }

    // Check subtask materials
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat !== 'object') continue;

        const materialRule = DETECTION_RULES['material-overdue'];
        const detection = materialRule.detect(data, mat, sub.id);
        if (detection) {
          const issueId = `id-${detection.type}-${mat.id}`;
          validDetectionIds.add(issueId);

          const existing = data.issues.find(q => q.id === issueId);
          if (!existing) {
            const newIssue = {
              id: issueId,
              created: today,
              ...detection,
              category: materialRule.category,
              source: 'auto-detection',
              status: 'open',
              detectionRule: 'material-overdue',
              lastChecked: today,
            };
            data.issues.push(newIssue);
            created++;
          } else {
            existing.lastChecked = today;
          }
        }
      }
    }
  }

  // Auto-resolve detection issues that are no longer valid
  for (const question of data.issues) {
    if (question.source !== 'auto-detection') continue;
    if (question.status === 'resolved' || question.status === 'dismissed') continue;

    if (!validDetectionIds.has(question.id)) {
      question.status = 'resolved';
      question.resolvedAt = today;
      question.resolvedBy = 'auto';
      resolved++;
    }
  }

  return { created, resolved };
}

/**
 * Dismiss an auto-detected issue (user acknowledges but doesn't want to see it)
 */
function dismissIssue(data, issueId) {
  const issue = data.issues.find(q => q.id === issueId);
  if (!issue) return null;

  issue.status = 'dismissed';
  issue.resolvedAt = new Date().toISOString().split('T')[0];
  return issue;
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

/**
 * Add a new task
 *
 * Flag-based usage:
 *   node scripts/task.js add --name "Task name" --category finish --status needs-scheduled
 *
 * Flags:
 *   --name       Task name (required)
 *   --category   Category (required): demolition, rough-in, structural, mechanical, electrical,
 *                plumbing, finish, fixtures, cleanup, inspection, trim, paint, framing, milestone, clean
 *   --status     Status (optional, default: needs-scheduled): pending, needs-scheduled, scheduled,
 *                confirmed, in-progress, completed, blocked, cancelled
 *   --assignee   Vendor ID (optional)
 *   --start      Start date YYYY-MM-DD (optional)
 *   --end        End date YYYY-MM-DD (optional)
 *   --notes      Notes (optional)
 *   --force      Skip duplicate check (optional)
 *   --interactive  Use interactive mode (optional)
 */
async function cmdAdd(flags = {}) {
  const data = loadData();
  const existingIds = new Set();
  for (const task of data.tasks) {
    existingIds.add(task.id);
    for (const sub of (task.subtasks || [])) {
      existingIds.add(sub.id);
    }
  }

  // Check if we have required flags for non-interactive mode
  const hasFlags = flags.name && flags.category;
  const interactive = flags.interactive || !hasFlags;

  let name, category, status, assigneeId, startInput, endInput, notes, materials = [];

  if (interactive) {
    // ===== INTERACTIVE MODE =====
    name = flags.name || await input({
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

    category = await select({
      message: 'Category:',
      choices: VALID_CATEGORIES.map(c => ({ name: c, value: c })),
    });

    status = await select({
      message: 'Status:',
      choices: VALID_STATUSES.map(s => ({ name: s, value: s })),
      default: 'needs-scheduled',
    });

    const vendorChoices = [
      { name: '(none)', value: '' },
      ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
    ];

    assigneeId = await search({
      message: 'Assignee (type to filter):',
      source: async (term) => {
        if (!term) return vendorChoices;
        const lower = term.toLowerCase();
        return vendorChoices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });

    startInput = await input({
      message: 'Start date (YYYY-MM-DD, optional):',
      validate: v => {
        if (!v) return true;
        if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
        return true;
      },
    });

    endInput = await input({
      message: 'End date (YYYY-MM-DD, optional):',
      validate: v => {
        if (!v) return true;
        if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
        if (startInput && v < startInput) return `End date cannot be before start date (${startInput})`;
        return true;
      },
    });

    notes = await input({
      message: 'Notes (optional):',
    });

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
  } else {
    // ===== FLAG-BASED MODE =====

    // Validate required flags
    const validationErrors = validateFlags(flags, {
      name: { required: true },
      category: { required: true, enum: VALID_CATEGORIES },
      status: { enum: VALID_STATUSES },
      start: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
      end: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      console.log(`\n${yellow('Valid categories:')} ${VALID_CATEGORIES.join(', ')}`);
      console.log(`${yellow('Valid statuses:')} ${VALID_STATUSES.join(', ')}`);
      console.log(`${yellow('Valid assignees:')} ${data.vendors.map(v => v.id).join(', ')}`);
      process.exit(1);
    }

    // Validate assignee if provided
    if (flags.assignee && !data.vendors.find(v => v.id === flags.assignee)) {
      console.error(red(`Invalid assignee: "${flags.assignee}"`));
      console.log(`${yellow('Valid assignees:')} ${data.vendors.map(v => v.id).join(', ')}`);
      process.exit(1);
    }

    // Validate date order
    if (flags.start && flags.end && flags.end < flags.start) {
      console.error(red(`End date (${flags.end}) cannot be before start date (${flags.start})`));
      process.exit(1);
    }

    name = flags.name;
    category = flags.category;
    status = flags.status || 'needs-scheduled';
    assigneeId = flags.assignee || '';
    startInput = flags.start || '';
    endInput = flags.end || '';
    notes = flags.notes || '';

    // Duplicate check (unless --force)
    if (!flags.force) {
      const allExistingTasks = getAllTasksWithData(data);
      const matches = findSimilarTasks({ name, notes, category, assignee: assigneeId ? `vendor:${assigneeId}` : undefined }, allExistingTasks, 0.70);
      if (matches.length > 0) {
        console.error(yellow(`⚠ Similar task exists: "${matches[0].task.name}" (${matches[0].task.id})`));
        console.error(yellow('Use --force to create anyway'));
        process.exit(1);
      }
    }
  }

  // Auto-generate ID
  let id = slugify(name);
  let counter = 1;
  while (existingIds.has(id)) {
    id = `${slugify(name)}-${counter++}`;
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
  console.log(green(`✓ Created task "${id}"${matSuffix}`));

  // Output JSON for scripting
  if (flags.json) {
    console.log(JSON.stringify(newTask, null, 2));
  }
}

/**
 * Add a subtask to an existing task
 *
 * Flag-based usage:
 *   node scripts/task.js add-subtask --parent install-doors --name "Install weatherstripping"
 *
 * Flags:
 *   --parent     Parent task ID (required)
 *   --name       Subtask name (required)
 *   --status     Status (optional, inherits from parent)
 *   --assignee   Vendor ID (optional, inherits from parent)
 *   --start      Start date YYYY-MM-DD (optional)
 *   --end        End date YYYY-MM-DD (optional)
 *   --notes      Notes (optional)
 *   --force      Skip duplicate check (optional)
 *   --interactive  Use interactive mode (optional)
 */
async function cmdAddSubtask(flags = {}) {
  const data = loadData();

  // Check if we have required flags for non-interactive mode
  const hasFlags = flags.parent && flags.name;
  const interactive = flags.interactive || !hasFlags;

  let parentId, parentTask;

  if (interactive) {
    // ===== INTERACTIVE MODE =====
    const items = getAllTaskItems(data).filter(i => i.type === 'task');

    if (!flags.parent) {
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
    } else {
      parentId = flags.parent;
    }
  } else {
    parentId = flags.parent;
  }

  parentTask = data.tasks.find(t => t.id === parentId);
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

  let name, status, assigneeId, startInput, endInput, notes, materials = [];

  if (interactive) {
    name = flags.name || await input({
      message: 'Subtask name:',
      validate: v => v.trim().length > 0 || 'Name is required',
    });

    // Duplicate check
    const allExistingTasks = getAllTasksWithData(data);
    const quickMatches = findSimilarTasks({ name }, allExistingTasks, 0.70);

    if (quickMatches.length > 0) {
      const match = quickMatches[0];
      const location = match.task.type === 'subtask' ? ` under "${match.task.parent}"` : '';
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

    status = await select({
      message: 'Status:',
      choices: VALID_STATUSES.map(s => ({ name: s, value: s })),
      default: parentTask.status || 'needs-scheduled',
    });

    const vendorChoices = [
      { name: `(inherit from parent: ${getVendorName(data, parentTask.assignee) || 'none'})`, value: '' },
      ...data.vendors.map(v => ({ name: `${v.name} (${v.id})`, value: v.id })),
    ];

    assigneeId = await search({
      message: 'Assignee (type to filter):',
      source: async (term) => {
        if (!term) return vendorChoices;
        const lower = term.toLowerCase();
        return vendorChoices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });

    notes = await input({
      message: 'Notes (optional):',
    });

    const addMaterials = await confirm({
      message: 'Add material dependencies?',
      default: false,
    });
    if (addMaterials) {
      materials = await collectMaterials(data);
    }
  } else {
    // ===== FLAG-BASED MODE =====

    const validationErrors = validateFlags(flags, {
      parent: { required: true },
      name: { required: true },
      status: { enum: VALID_STATUSES },
      start: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
      end: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      process.exit(1);
    }

    if (flags.assignee && !data.vendors.find(v => v.id === flags.assignee)) {
      console.error(red(`Invalid assignee: "${flags.assignee}"`));
      console.log(`${yellow('Valid assignees:')} ${data.vendors.map(v => v.id).join(', ')}`);
      process.exit(1);
    }

    if (flags.start && flags.end && flags.end < flags.start) {
      console.error(red(`End date (${flags.end}) cannot be before start date (${flags.start})`));
      process.exit(1);
    }

    name = flags.name;
    status = flags.status || parentTask.status || 'needs-scheduled';
    assigneeId = flags.assignee || '';
    startInput = flags.start || '';
    endInput = flags.end || '';
    notes = flags.notes || '';

    // Duplicate check (unless --force)
    if (!flags.force) {
      const allExistingTasks = getAllTasksWithData(data);
      const matches = findSimilarTasks({ name }, allExistingTasks, 0.70);
      if (matches.length > 0) {
        console.error(yellow(`⚠ Similar task/subtask exists: "${matches[0].task.name}" (${matches[0].task.id})`));
        console.error(yellow('Use --force to create anyway'));
        process.exit(1);
      }
    }
  }

  // Auto-generate ID: {parent}-{n}
  const existingSubtaskCount = (parentTask.subtasks || []).length;
  let nextNum = existingSubtaskCount + 1;
  let id = `${parentId}-${nextNum}`;
  while (existingIds.has(id)) {
    id = `${parentId}-${++nextNum}`;
  }

  // Build subtask object
  const newSubtask = {
    id,
    name,
    status,
  };

  if (assigneeId) newSubtask.assignee = `vendor:${assigneeId}`;
  if (startInput) newSubtask.start = startInput;
  if (endInput) newSubtask.end = endInput;
  if (notes) newSubtask.notes = notes;
  if (materials.length > 0) newSubtask.materialDependencies = materials;

  if (!parentTask.subtasks) parentTask.subtasks = [];
  parentTask.subtasks.push(newSubtask);
  saveData(data);

  const matSuffix = materials.length > 0 ? ` with ${materials.length} material${materials.length > 1 ? 's' : ''}` : '';
  console.log(green(`✓ Created subtask "${id}" under "${parentId}"${matSuffix}`));

  if (flags.json) {
    console.log(JSON.stringify(newSubtask, null, 2));
  }
}

/**
 * Update task status
 *
 * Flag-based usage:
 *   node scripts/task.js status --id install-doors --status in-progress
 *
 * Flags:
 *   --id         Task ID (required for flag mode)
 *   --status     New status (required for flag mode)
 *   --interactive  Use interactive mode
 */
async function cmdStatus(flags = {}) {
  const data = loadData();

  // Support legacy positional arg or flag
  let taskId = typeof flags === 'string' ? flags : flags.id;
  const hasFlags = taskId && flags.status;
  const interactive = flags.interactive || !hasFlags;

  // Statuses that require a reason
  const requiresReason = ['cancelled', 'blocked'];

  if (interactive) {
    // ===== INTERACTIVE MODE =====
    if (!taskId) {
      const items = getAllTaskItems(data);
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

    const { task } = findTask(data, taskId);
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

    // Prompt for reason
    const isReasonRequired = requiresReason.includes(newStatus);
    const reason = await input({
      message: isReasonRequired
        ? 'Reason for status change (required):'
        : 'Reason for status change (optional):',
      validate: (val) => isReasonRequired && !val.trim() ? 'Reason is required for this status' : true,
    });

    // Update status
    task.status = newStatus;

    // Append comment if reason provided
    if (reason.trim()) {
      const entry = appendComment(task, newStatus, reason.trim());
      console.log(green(`✓ Comment added: ${entry}`));
    }

    // Show dependency impact
    const impact = evaluateDependencyImpact(data, taskId, newStatus);
    if (impact.warnings.length > 0) {
      console.log(yellow('\n⚠️  Impact:'));
      impact.warnings.forEach(w => console.log(yellow(`  - ${w}`)));
    }
    if (impact.unblocked.length > 0) {
      console.log(green('\n✓ Tasks now unblocked:'));
      impact.unblocked.forEach(t => console.log(green(`  - ${t}`)));
    }

    // Remove cancelled task from other tasks' dependencies
    if (newStatus === 'cancelled') {
      const updatedTasks = removeCancelledTaskFromDependencies(data, taskId);
      if (updatedTasks.length > 0) {
        console.log(green(`\n✓ Removed from dependencies of: ${updatedTasks.join(', ')}`));
      }
    }

    // Save and generate questions
    saveData(data);
    const questionsCreated = triggerQuestionGeneration(data, 'task', taskId);
    if (questionsCreated > 0) {
      saveData(data); // Save again with new questions
      console.log(green(`✓ Created ${questionsCreated} question(s) for task`));
    }

    console.log(green(`✓ Updated ${taskId} status to "${newStatus}"`));
  } else {
    // ===== FLAG-BASED MODE =====
    const validationErrors = validateFlags(flags, {
      id: { required: true },
      status: { required: true, enum: VALID_STATUSES },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      console.log(`\n${yellow('Valid statuses:')} ${VALID_STATUSES.join(', ')}`);
      process.exit(1);
    }

    // Validate reason for statuses that require it
    const isReasonRequired = requiresReason.includes(flags.status);
    if (isReasonRequired && !flags.reason) {
      console.error(red(`Reason is required when setting status to "${flags.status}"`));
      console.log(`${yellow('Usage:')} --reason "Your reason here"`);
      process.exit(1);
    }

    const { task } = findTask(data, taskId);
    if (!task) {
      console.error(red(`Task "${taskId}" not found`));
      process.exit(1);
    }

    const oldStatus = task.status;
    task.status = flags.status;

    // Append comment if reason provided
    if (flags.reason && flags.reason.trim()) {
      const entry = appendComment(task, flags.status, flags.reason.trim());
      console.log(green(`✓ Comment added: ${entry}`));
    }

    // Show dependency impact
    const impact = evaluateDependencyImpact(data, taskId, flags.status);
    if (impact.warnings.length > 0) {
      console.log(yellow('\n⚠️  Impact:'));
      impact.warnings.forEach(w => console.log(yellow(`  - ${w}`)));
    }
    if (impact.unblocked.length > 0) {
      console.log(green('\n✓ Tasks now unblocked:'));
      impact.unblocked.forEach(t => console.log(green(`  - ${t}`)));
    }

    // Remove cancelled task from other tasks' dependencies
    if (flags.status === 'cancelled') {
      const updatedTasks = removeCancelledTaskFromDependencies(data, taskId);
      if (updatedTasks.length > 0) {
        console.log(green(`\n✓ Removed from dependencies of: ${updatedTasks.join(', ')}`));
      }
    }

    // Save and generate questions
    saveData(data);
    const questionsCreated = triggerQuestionGeneration(data, 'task', taskId);
    if (questionsCreated > 0) {
      saveData(data); // Save again with new questions
      console.log(green(`✓ Created ${questionsCreated} question(s) for dependent tasks`));
    }

    console.log(green(`✓ Updated ${taskId} status: ${oldStatus} → ${flags.status}`));
  }
}

/**
 * Update task dates
 *
 * Flag-based usage:
 *   node scripts/task.js date --id install-doors --start 2026-02-01 --end 2026-02-02
 *
 * Flags:
 *   --id         Task ID (required for flag mode)
 *   --start      Start date YYYY-MM-DD
 *   --end        End date YYYY-MM-DD
 *   --interactive  Use interactive mode
 */
async function cmdDate(flags = {}) {
  const data = loadData();

  let taskId = typeof flags === 'string' ? flags : flags.id;
  const hasFlags = taskId && (flags.start || flags.end);
  const interactive = flags.interactive || !hasFlags;

  if (interactive) {
    // ===== INTERACTIVE MODE =====
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
    console.log(green(`✓ Updated dates for "${taskId}"`));
  } else {
    // ===== FLAG-BASED MODE =====
    const validationErrors = validateFlags(flags, {
      id: { required: true },
      start: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
      end: { validate: isValidDate, message: 'Use YYYY-MM-DD format' },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      process.exit(1);
    }

    if (flags.start && flags.end && flags.end < flags.start) {
      console.error(red(`End date (${flags.end}) cannot be before start date (${flags.start})`));
      process.exit(1);
    }

    const { task } = findTask(data, taskId);
    if (!task) {
      console.error(red(`Task "${taskId}" not found`));
      process.exit(1);
    }

    const oldStart = task.start || '(none)';
    const oldEnd = task.end || '(none)';

    if (flags.start) task.start = flags.start;
    if (flags.end) task.end = flags.end;

    saveData(data);
    console.log(green(`✓ Updated ${taskId} dates: ${oldStart}→${task.start || '(none)'}, ${oldEnd}→${task.end || '(none)'}`));
  }
}

/**
 * Assign task to vendor
 *
 * Flag-based usage:
 *   node scripts/task.js assign --id install-doors --assignee eliseo
 *
 * Flags:
 *   --id         Task ID (required for flag mode)
 *   --assignee   Vendor ID (required for flag mode, use "none" to clear)
 *   --interactive  Use interactive mode
 */
async function cmdAssign(flags = {}) {
  const data = loadData();

  let taskId = typeof flags === 'string' ? flags : flags.id;
  const hasFlags = taskId && flags.assignee !== undefined;
  const interactive = flags.interactive || !hasFlags;

  if (interactive) {
    // ===== INTERACTIVE MODE =====
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
    console.log(green(`✓ Updated assignee for "${taskId}"`));
  } else {
    // ===== FLAG-BASED MODE =====
    const validationErrors = validateFlags(flags, {
      id: { required: true },
      assignee: { required: true },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      process.exit(1);
    }

    // Validate assignee (unless "none")
    if (flags.assignee !== 'none' && !data.vendors.find(v => v.id === flags.assignee)) {
      console.error(red(`Invalid assignee: "${flags.assignee}"`));
      console.log(`${yellow('Valid assignees:')} ${data.vendors.map(v => v.id).join(', ')}, none`);
      process.exit(1);
    }

    const { task } = findTask(data, taskId);
    if (!task) {
      console.error(red(`Task "${taskId}" not found`));
      process.exit(1);
    }

    const oldAssignee = task.assignee ? getVendorName(data, task.assignee) : '(none)';

    if (flags.assignee === 'none') {
      delete task.assignee;
    } else {
      task.assignee = `vendor:${flags.assignee}`;
    }

    const newAssignee = task.assignee ? getVendorName(data, task.assignee) : '(none)';
    saveData(data);
    console.log(green(`✓ Updated ${taskId} assignee: ${oldAssignee} → ${newAssignee}`));
  }
}

/**
 * Manage task dependencies
 *
 * Flag-based usage:
 *   node scripts/task.js deps --id framing --add demolition
 *   node scripts/task.js deps --id framing --remove old-task
 *
 * Interactive usage:
 *   node scripts/task.js deps
 *   node scripts/task.js deps framing
 */
async function cmdDeps(flags = {}) {
  const data = loadData();

  // Support legacy positional arg (when flags is a string)
  let taskId = typeof flags === 'string' ? flags : flags.id;

  // Determine mode: flag-based if we have taskId AND (add or remove)
  const hasActionFlag = typeof flags === 'object' && (flags.add || flags.remove);
  const interactive = flags.interactive || !hasActionFlag;

  if (interactive) {
    // ===== INTERACTIVE MODE =====
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
  } else {
    // ===== FLAG-BASED MODE =====
    const validationErrors = validateFlags(flags, {
      id: { required: true },
    });

    if (validationErrors.length > 0) {
      console.error(red('Validation errors:'));
      validationErrors.forEach(e => console.error(red(`  - ${e}`)));
      process.exit(1);
    }

    // Find the task
    const { task } = findTask(data, taskId);
    if (!task) {
      console.error(red(`Task "${taskId}" not found`));
      process.exit(1);
    }

    // Initialize dependencies array if needed
    if (!task.dependencies) task.dependencies = [];

    // Handle --add
    if (flags.add) {
      // Validate dependency exists
      const { task: depTask } = findTask(data, flags.add);
      if (!depTask) {
        console.error(red(`Dependency "${flags.add}" not found`));
        const items = getAllTaskItems(data);
        console.log(`${yellow('Available tasks:')} ${items.slice(0, 10).map(t => t.id).join(', ')}...`);
        process.exit(1);
      }

      // Check if already exists
      if (task.dependencies.includes(flags.add)) {
        console.log(yellow(`"${flags.add}" is already a dependency of "${taskId}"`));
        return;
      }

      // Check for circular dependency and show impact
      const impacts = analyzeDependencyImpact(data, taskId, [flags.add]);
      const errors = impacts.filter(i => i.type === 'error');

      if (errors.length > 0) {
        console.error(red('Cannot add dependency:'));
        errors.forEach(i => console.error(red(`  - ${i.message}`)));
        process.exit(1);
      }

      // Show warnings/info
      impacts.filter(i => i.type === 'warning').forEach(i => console.log(yellow(`⚠️  ${i.message}`)));
      impacts.filter(i => i.type === 'info').forEach(i => console.log(cyan(`ℹ️  ${i.message}`)));

      // Add the dependency
      task.dependencies.push(flags.add);
      saveData(data);
      console.log(green(`✓ Added "${flags.add}" as dependency of "${taskId}"`));
    }

    // Handle --remove
    if (flags.remove) {
      const idx = task.dependencies.indexOf(flags.remove);
      if (idx === -1) {
        console.error(red(`"${flags.remove}" is not a dependency of "${taskId}"`));
        console.log(`${yellow('Current dependencies:')} ${task.dependencies.join(', ') || '(none)'}`);
        process.exit(1);
      }

      task.dependencies.splice(idx, 1);
      if (task.dependencies.length === 0) delete task.dependencies;
      saveData(data);
      console.log(green(`✓ Removed "${flags.remove}" from dependencies of "${taskId}"`));
    }
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

/**
 * Manage material dependencies for a task
 *
 * Flag-based usage:
 *   node scripts/task.js materials --task install-doors --action list
 *   node scripts/task.js materials --task install-doors --action add --name "Weatherstripping" --mat-status need-to-order
 *   node scripts/task.js materials --task install-doors --action remove --material weatherstripping
 *   node scripts/task.js materials --task install-doors --action status --material weatherstripping --mat-status ordered
 *
 * Flags:
 *   --task        Task ID (required)
 *   --action      Action: list, add, remove, status (required for flag mode)
 *   --name        Material name (required for add)
 *   --mat-status  Material status (required for add/status): need-to-select, selected, need-to-order, ordered, on-hand
 *   --material    Material ID (required for remove/status)
 *   --quantity    Quantity (optional for add)
 *   --detail      Detail/specs (optional for add)
 *   --vendor      Vendor ID (optional for add)
 *   --expected-date  Expected date YYYY-MM-DD (optional for add)
 *   --order-link  Order link URL (optional for add)
 *   --interactive Use interactive mode
 */
async function cmdMaterials(flags = {}) {
  const data = loadData();

  let taskId = typeof flags === 'string' ? flags : flags.task;
  const hasFlags = taskId && flags.action;
  const interactive = flags.interactive || !hasFlags;

  if (interactive) {
    // ===== INTERACTIVE MODE =====
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

        // Prompt for reason (optional for materials)
        const reason = await input({
          message: 'Reason for status change (optional):',
        });

        material.status = newStatus;

        // Append comment if reason provided
        if (reason.trim()) {
          const entry = appendComment(material, newStatus, reason.trim());
          console.log(green(`  ✓ Comment added: ${entry}`));
        }

        saveData(data);

        // Generate questions for material
        const questionsCreated = triggerQuestionGeneration(data, 'material', matId, taskId);
        if (questionsCreated > 0) {
          saveData(data);
          console.log(green(`  ✓ Created ${questionsCreated} question(s) for material`));
        }

        console.log(green(`  ✓ Updated "${material.name}" status to "${newStatus}"`));
      }

      // Refresh current materials list
      const refreshedTask = findTask(data, taskId).task;
      currentMaterials.length = 0;
      currentMaterials.push(...(refreshedTask.materialDependencies || []));
    }
  } else {
    // ===== FLAG-BASED MODE =====
    const { task } = findTask(data, taskId);
    if (!task) {
      console.error(red(`Task "${taskId}" not found`));
      process.exit(1);
    }

    const action = flags.action;
    const validActions = ['list', 'add', 'remove', 'status'];

    if (!validActions.includes(action)) {
      console.error(red(`Invalid action: "${action}"`));
      console.log(`${yellow('Valid actions:')} ${validActions.join(', ')}`);
      process.exit(1);
    }

    // LIST
    if (action === 'list') {
      const materials = task.materialDependencies || [];
      console.log(`Materials for "${task.name}":`);
      if (materials.length === 0) {
        console.log('  (none)');
      } else {
        for (const mat of materials) {
          if (typeof mat === 'object') {
            console.log(`  - ${mat.id}: ${mat.name} (${mat.status})`);
          } else {
            console.log(`  - ${mat} (reference)`);
          }
        }
      }
      return;
    }

    // ADD
    if (action === 'add') {
      const validationErrors = validateFlags(flags, {
        name: { required: true },
        'mat-status': { required: true, enum: VALID_MATERIAL_STATUSES },
        'expected-date': { validate: v => !v || isValidDate(v), message: 'Use YYYY-MM-DD format' },
      });

      if (validationErrors.length > 0) {
        console.error(red('Validation errors:'));
        validationErrors.forEach(e => console.error(red(`  - ${e}`)));
        console.log(`\n${yellow('Valid material statuses:')} ${VALID_MATERIAL_STATUSES.join(', ')}`);
        process.exit(1);
      }

      if (flags.vendor && !data.vendors.find(v => v.id === flags.vendor)) {
        console.error(red(`Invalid vendor: "${flags.vendor}"`));
        console.log(`${yellow('Valid vendors:')} ${data.vendors.map(v => v.id).join(', ')}`);
        process.exit(1);
      }

      const material = {
        id: slugify(flags.name),
        name: flags.name,
        status: flags['mat-status'],
      };

      if (flags.quantity) material.quantity = parseFloat(flags.quantity);
      if (flags.detail) material.detail = flags.detail;
      if (flags.vendor) material.vendor = `vendor:${flags.vendor}`;
      if (flags['expected-date']) material.expectedDate = flags['expected-date'];
      if (flags['order-link']) material.orderLink = flags['order-link'];

      if (!task.materialDependencies) task.materialDependencies = [];
      task.materialDependencies.push(material);
      saveData(data);
      console.log(green(`✓ Added material "${material.id}" to "${taskId}"`));
      return;
    }

    // REMOVE
    if (action === 'remove') {
      if (!flags.material) {
        console.error(red('Missing required flag: --material'));
        process.exit(1);
      }

      const materials = task.materialDependencies || [];
      const exists = materials.some(m => typeof m === 'object' && m.id === flags.material);

      if (!exists) {
        console.error(red(`Material "${flags.material}" not found on task "${taskId}"`));
        const matIds = materials.filter(m => typeof m === 'object').map(m => m.id);
        if (matIds.length > 0) {
          console.log(`${yellow('Available materials:')} ${matIds.join(', ')}`);
        }
        process.exit(1);
      }

      task.materialDependencies = materials.filter(m =>
        typeof m === 'string' || m.id !== flags.material
      );
      if (task.materialDependencies.length === 0) {
        delete task.materialDependencies;
      }
      saveData(data);
      console.log(green(`✓ Removed material "${flags.material}" from "${taskId}"`));
      return;
    }

    // STATUS
    if (action === 'status') {
      const validationErrors = validateFlags(flags, {
        material: { required: true },
        'mat-status': { required: true, enum: VALID_MATERIAL_STATUSES },
      });

      if (validationErrors.length > 0) {
        console.error(red('Validation errors:'));
        validationErrors.forEach(e => console.error(red(`  - ${e}`)));
        console.log(`\n${yellow('Valid material statuses:')} ${VALID_MATERIAL_STATUSES.join(', ')}`);
        process.exit(1);
      }

      const materials = task.materialDependencies || [];
      const material = materials.find(m => typeof m === 'object' && m.id === flags.material);

      if (!material) {
        console.error(red(`Material "${flags.material}" not found on task "${taskId}"`));
        process.exit(1);
      }

      const oldStatus = material.status;
      material.status = flags['mat-status'];

      // Append comment if reason provided
      if (flags.reason && flags.reason.trim()) {
        const entry = appendComment(material, flags['mat-status'], flags.reason.trim());
        console.log(green(`✓ Comment added: ${entry}`));
      }

      saveData(data);

      // Generate questions for material
      const questionsCreated = triggerQuestionGeneration(data, 'material', flags.material, taskId);
      if (questionsCreated > 0) {
        saveData(data);
        console.log(green(`✓ Created ${questionsCreated} question(s) for material`));
      }

      console.log(green(`✓ Updated "${flags.material}" status: ${oldStatus} → ${flags['mat-status']}`));
      return;
    }
  }
}

/**
 * Scan all materials and generate missing questions based on lifecycle rules.
 */
async function cmdMaterialsCheck() {
  const data = loadData();

  // Initialize questions array if needed
  if (!data.issues) {
    data.issues = [];
  }

  const materials = getAllMaterials(data);
  const today = new Date().toISOString().split('T')[0];

  console.log(bold('\nScanning materials for missing information...\n'));

  let created = 0;
  let complete = 0;
  let scanned = 0;

  for (const { material, taskId, taskName } of materials) {
    scanned++;
    const rule = getMaterialQuestion(material, taskId);

    if (!rule) {
      // Material is complete
      complete++;
      continue;
    }

    // Check if question already exists
    const existingQuestion = materialQuestionExists(data, material.id, rule.type, rule.fields || rule.field);
    if (existingQuestion) {
      console.log(dim(`📦 ${material.name} (${material.status}) - question already exists`));
      continue;
    }

    // Generate question ID
    const fieldSuffix = rule.field || (rule.fields ? rule.fields.join('-') : 'info');
    const id = generateMaterialQuestionId(rule.type, material.id, fieldSuffix);

    // Create the question
    const newQuestion = {
      id,
      created: today,
      type: rule.type,
      prompt: rule.prompt,
      assignee: rule.assignee,
      status: 'open',
      relatedTask: taskId,
      relatedMaterial: material.id,
    };

    data.issues.push(newQuestion);
    created++;

    // Display info
    const missingInfo = rule.fields ? rule.fields.join(', ') : rule.field || 'info';
    console.log(`📦 ${cyan(material.name)} ${dim(`(${material.status})`)}`);
    console.log(`   Missing: ${yellow(missingInfo)}`);
    console.log(`   → Created ${green(id)} ${dim(`(assigned to ${ASSIGNEE_DISPLAY_NAMES[rule.assignee]})`)}`);
    console.log();
  }

  if (created > 0) {
    saveData(data);
  }

  console.log(dim('─'.repeat(40)));
  console.log(`✓ Scanned ${scanned} materials`);
  if (created > 0) {
    console.log(green(`✓ Created ${created} questions (assigned to Tonia)`));
  }
  console.log(`✓ ${complete} materials complete`);
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

  // Show related questions
  const relatedQuestions = getQuestionsForTask(data, taskId);
  if (relatedQuestions.length > 0) {
    const openCount = relatedQuestions.filter(q => q.status === 'open').length;
    const statusSummary = openCount > 0 ? `${openCount} open` : 'all resolved';
    console.log(`  Questions:   ${relatedQuestions.length} (${statusSummary})`);
    for (const q of relatedQuestions) {
      const statusIcon = q.status === 'open' ? '?' : q.status === 'answered' ? '!' : '✓';
      const questionText = q.question || '(no question text)';
      const preview = questionText.substring(0, 40) + (questionText.length > 40 ? '...' : '');
      console.log(`               ${statusIcon} ${preview} (${ASSIGNEE_DISPLAY_NAMES[q.assignee]}) [${q.status}]`);
    }
  }
  console.log();
}

function cmdValidate() {
  const data = loadData();
  const errors = validate(data);

  // Check for incomplete materials (warnings, not errors)
  const warnings = [];
  const materials = getAllMaterials(data);
  for (const { material, taskId } of materials) {
    const completeness = getMaterialCompleteness(material);
    if (completeness.startsWith('⚠️')) {
      const missing = completeness.replace('⚠️ Missing: ', '');
      warnings.push(`${material.id}: status=${material.status} but no ${missing}`);
    }
  }

  if (errors.length === 0) {
    if (warnings.length > 0) {
      console.log(green('✓ Data validation passed') + yellow(' (with warnings)'));
      console.log(yellow('\n⚠️  Warnings:'));
      warnings.forEach(w => console.log(yellow(`  • ${w}`)));
    } else {
      console.log(green('✓ Data validation passed'));
    }
  } else {
    console.error(red('\nValidation errors:'));
    errors.forEach(e => console.error(red(`  - ${e}`)));
    if (warnings.length > 0) {
      console.log(yellow('\n⚠️  Warnings:'));
      warnings.forEach(w => console.log(yellow(`  • ${w}`)));
    }
    process.exit(1);
  }
}

// ============ QUESTION COMMANDS ============

async function cmdQuestion(questionId) {
  const data = loadData();

  // Initialize questions array if needed
  if (!data.issues) {
    data.issues = [];
  }

  // If questionId provided, manage existing question
  if (questionId) {
    const question = data.issues.find(q => q.id === questionId);
    if (!question) {
      console.error(red(`Question "${questionId}" not found`));
      process.exit(1);
    }

    // Display question details
    const qText = getQuestionText(question);
    const qType = question.type || detectQuestionType(qText);

    console.log();
    console.log(bold(`Question: ${qText}`));
    console.log(dim('─'.repeat(40)));
    console.log(`  ID:          ${question.id}`);
    console.log(`  Type:        ${QUESTION_TYPE_DISPLAY[qType] || 'Free Text'}`);
    console.log(`  Assignee:    ${ASSIGNEE_DISPLAY_NAMES[question.assignee]}`);
    console.log(`  Status:      ${question.status}`);
    if (question.reviewStatus) console.log(`  Review:      ${question.reviewStatus}`);
    if (question.relatedTask) console.log(`  Task:        ${question.relatedTask}`);
    if (question.relatedMaterial) console.log(`  Material:    ${question.relatedMaterial}`);
    console.log(`  Created:     ${question.created}`);

    // Display response based on type
    if (question.response) {
      if (typeof question.response === 'object') {
        const r = question.response;
        let responseDisplay = '';
        if (r.type === 'yes-no') responseDisplay = r.value ? 'Yes' : 'No';
        else if (r.type === 'assignee') responseDisplay = `${r.value} (${getVendorName(data, r.value)})`;
        else if (r.type === 'date-range') responseDisplay = `${r.start} to ${r.end}`;
        else if (r.type === 'dependency') responseDisplay = (r.tasks || []).join(', ');
        else if (r.type === 'notification') responseDisplay = r.acknowledged ? 'Acknowledged' : 'Dismissed';
        else responseDisplay = r.value || '';
        console.log(`  Response:    ${responseDisplay}`);
      } else {
        console.log(`  Response:    ${question.response.substring(0, 60)}${question.response.length > 60 ? '...' : ''}`);
      }
    }
    if (question.responseNotes) console.log(`  Notes:       ${question.responseNotes}`);
    if (question.rejectionReason) console.log(`  Rejected:    ${question.rejectionReason}`);
    if (question.resolvedAt || question.resolvedDate) console.log(`  Resolved:    ${question.resolvedAt || question.resolvedDate}`);
    console.log();

    // Action menu based on question state
    const actionChoices = [];

    if (question.status === 'open' && qType !== 'notification') {
      actionChoices.push({ name: 'Answer this question', value: 'answer' });
    }
    if (question.status === 'answered') {
      actionChoices.push({ name: 'Review and apply', value: 'review' });
    }
    if (qType === 'notification' && question.status === 'open') {
      actionChoices.push({ name: 'Acknowledge notification', value: 'review' });
    }
    actionChoices.push({ name: 'Change assignee', value: 'assignee' });
    actionChoices.push({ name: 'Change status', value: 'status' });
    actionChoices.push({ name: 'Delete', value: 'delete' });
    actionChoices.push({ name: 'Done', value: 'done' });

    const action = await select({
      message: 'Action:',
      choices: actionChoices,
    });

    if (action === 'done') return;

    if (action === 'answer') {
      // Redirect to cmdAnswer
      await cmdAnswer(questionId);
      return;
    }

    if (action === 'review') {
      // Redirect to cmdReview
      await cmdReview(questionId);
      return;
    }

    if (action === 'assignee') {
      const newAssignee = await select({
        message: 'Assignee:',
        choices: VALID_ASSIGNEES.map(a => ({ name: ASSIGNEE_DISPLAY_NAMES[a], value: a })),
        default: question.assignee,
      });
      question.assignee = newAssignee;
      saveData(data);
      console.log(green(`\n✓ Updated assignee to "${ASSIGNEE_DISPLAY_NAMES[newAssignee]}"`));
    }

    if (action === 'status') {
      const newStatus = await select({
        message: 'Status:',
        choices: VALID_QUESTION_STATUSES.map(s => ({ name: s, value: s })),
        default: question.status,
      });
      question.status = newStatus;
      if (newStatus === 'resolved' && !question.resolvedAt && !question.resolvedDate) {
        question.resolvedAt = new Date().toISOString().split('T')[0];
      }
      saveData(data);
      console.log(green(`\n✓ Updated status to "${newStatus}"`));
    }

    if (action === 'delete') {
      const confirmDelete = await confirm({
        message: `Delete question "${questionId}"?`,
        default: false,
      });
      if (confirmDelete) {
        data.issues = data.issues.filter(q => q.id !== questionId);
        saveData(data);
        console.log(green(`\n✓ Deleted question "${questionId}"`));
      } else {
        console.log(yellow('Cancelled'));
      }
    }

    return;
  }

  // Create new question - first ask for question type
  const questionType = await select({
    message: 'Question type:',
    choices: QUESTION_TYPES.filter(t => t.value !== 'notification').map(t => ({
      name: t.name,
      value: t.value,
    })),
  });

  // Get question/prompt text
  const questionText = await input({
    message: 'Question:',
    validate: v => v.trim().length > 0 || 'Question is required',
  });

  // Related task (optional)
  const items = getAllTaskItems(data);
  const taskChoices = [
    { name: '(none)', value: '' },
    ...items.map(t => ({
      name: `${t.name} (${t.id})`,
      value: t.id,
    })),
  ];

  const relatedTask = await search({
    message: 'Related task (optional):',
    source: async (term) => {
      if (!term) return taskChoices;
      const lower = term.toLowerCase();
      return taskChoices.filter(c =>
        c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
      );
    },
  });

  // Related material (optional, only if task selected)
  let relatedMaterial = '';
  if (relatedTask) {
    const taskMaterials = getMaterialsForTask(data, relatedTask);
    if (taskMaterials.length > 0) {
      const materialChoices = [
        { name: '(none)', value: '' },
        ...taskMaterials.map(m => ({
          name: `${m.name} (${m.status})`,
          value: m.id,
        })),
      ];

      relatedMaterial = await search({
        message: 'Related material (optional):',
        source: async (term) => {
          if (!term) return materialChoices;
          const lower = term.toLowerCase();
          return materialChoices.filter(c =>
            c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
          );
        },
      });
    }
  }

  // Type-specific config
  let config = undefined;

  if (questionType === 'assignee') {
    // Optionally filter by trade
    const filterByTrade = await confirm({
      message: 'Filter vendors by trade?',
      default: false,
    });

    if (filterByTrade) {
      const trades = [...new Set(data.vendors.map(v => v.trade).filter(Boolean))];
      if (trades.length > 0) {
        const selectedTrades = [];
        for (const trade of trades) {
          const include = await confirm({
            message: `Include ${trade}?`,
            default: false,
          });
          if (include) selectedTrades.push(trade);
        }
        if (selectedTrades.length > 0) {
          config = { tradeFilter: selectedTrades };
        }
      }
    }
  }

  if (questionType === 'select-one') {
    // Get options for selection
    const options = [];
    let addMore = true;
    while (addMore) {
      const option = await input({
        message: `Option ${options.length + 1}:`,
        validate: v => v.trim().length > 0 || 'Option is required',
      });
      options.push(option);

      if (options.length >= 2) {
        addMore = await confirm({
          message: 'Add another option?',
          default: options.length < 4,
        });
      }
    }
    config = { options };
  }

  // Auto-detect assignee and let user confirm/change
  const detectedAssignee = detectAssignee(questionText);
  const reasonText = detectedAssignee === 'tonia' ? ' - mentions materials' : ' - default for questions';

  const assignee = await select({
    message: `Assignee (auto-detected: ${ASSIGNEE_DISPLAY_NAMES[detectedAssignee]}${reasonText}):`,
    choices: VALID_ASSIGNEES.map(a => ({
      name: ASSIGNEE_DISPLAY_NAMES[a] + (a === detectedAssignee ? ' (Recommended)' : ''),
      value: a,
    })),
    default: detectedAssignee,
  });

  // Generate ID with type prefix for structured questions
  const baseId = `sq-${questionType}-${slugify(questionText.substring(0, 20))}`;
  let id = baseId;
  let counter = 1;
  const existingIds = new Set(data.issues.map(q => q.id));
  while (existingIds.has(id)) {
    id = `${baseId}-${counter++}`;
  }

  // Check for similar questions
  const newQuestionData = {
    question: questionText,
    assignee,
    relatedTask: relatedTask || undefined,
    relatedMaterial: relatedMaterial || undefined,
  };
  const similarQuestions = findSimilarQuestions(newQuestionData, data.issues, 0.50);

  if (similarQuestions.length > 0) {
    displayQuestionSimilarityWarning(similarQuestions);
    const continueAnyway = await confirm({
      message: 'Continue creating this question?',
      default: false,
    });
    if (!continueAnyway) {
      console.log(yellow('Cancelled'));
      return;
    }
  }

  // Create the structured question
  const today = new Date().toISOString().split('T')[0];
  const newQuestion = {
    id,
    created: today,
    type: questionType,
    prompt: questionText,
    assignee,
    status: 'open',
  };
  if (relatedTask) newQuestion.relatedTask = relatedTask;
  if (relatedMaterial) newQuestion.relatedMaterial = relatedMaterial;
  if (config) newQuestion.config = config;

  data.issues.push(newQuestion);
  saveData(data);

  const materialSuffix = relatedMaterial ? ` (material: ${relatedMaterial})` : '';
  console.log(green(`\n✓ Created ${QUESTION_TYPE_DISPLAY[questionType]} question "${id}" assigned to ${ASSIGNEE_DISPLAY_NAMES[assignee]}${materialSuffix}`));
}

async function cmdQuestions(flags = {}) {
  const data = loadData();
  const questions = data.issues || [];
  const showAll = flags.all;
  const filterAction = flags.action?.toUpperCase();
  const filterAssignee = flags.assignee?.toLowerCase();

  if (questions.length === 0) {
    console.log(dim('\nNo issues found.'));
    console.log(dim('Add one with: npm run task issue'));
    return;
  }

  // Apply filters
  let filtered = questions;

  // Filter by status (unless --all)
  if (!showAll) {
    filtered = filtered.filter(q => q.status !== 'resolved' && q.status !== 'dismissed');
  }

  // Filter by action category
  if (filterAction && ACTION_CATEGORIES.includes(filterAction)) {
    filtered = filtered.filter(q => {
      const cat = q.category || getActionCategory(q);
      return cat === filterAction;
    });
  }

  // Filter by assignee
  if (filterAssignee && VALID_ASSIGNEES.includes(filterAssignee)) {
    filtered = filtered.filter(q => q.assignee === filterAssignee);
  }

  if (filtered.length === 0) {
    const hint = filterAction ? ` with action=${filterAction}` : '';
    const hint2 = filterAssignee ? ` for ${filterAssignee}` : '';
    console.log(dim(`\nNo open issues${hint}${hint2}.`));
    console.log(dim('Use --all to see resolved issues.'));
    console.log(dim('\nFilter by action: --action ASSIGN|SCHEDULE|ORDER|SPECIFY|TRACK|DECIDE'));
    console.log(dim('Filter by assignee: --assignee brandon|tonia|dave'));
    return;
  }

  // Determine display mode
  const displayByCategory = filterAction || !filterAssignee;

  if (displayByCategory) {
    // Group by category (action-oriented view)
    console.log(bold('\nIssues by Action'));
    console.log(dim('─'.repeat(60)));

    const byCategory = {};
    for (const cat of ACTION_CATEGORIES) {
      byCategory[cat] = [];
    }
    for (const q of filtered) {
      const cat = q.category || getActionCategory(q);
      byCategory[cat].push(q);
    }

    for (const cat of ACTION_CATEGORIES) {
      const catIssues = byCategory[cat];
      if (catIssues.length === 0) continue;

      const catName = CATEGORY_DISPLAY_NAMES[cat] || cat;
      console.log(`\n${cyan(`[${catName.toUpperCase()}]`)} ${dim(`(${catIssues.length})`)}`);

      for (const q of catIssues) {
        const statusIcon = q.status === 'open' ? yellow('○') :
          q.status === 'answered' ? cyan('◐') :
          q.status === 'dismissed' ? dim('⊘') : green('●');
        const assigneeTag = dim(`[${ASSIGNEE_DISPLAY_NAMES[q.assignee] || q.assignee}]`);
        const title = q.title || getQuestionText(q).substring(0, 40);
        const sourceTag = q.source === 'auto-detection' ? dim(' ⚡') : '';
        console.log(`  ${statusIcon} ${title}${sourceTag} ${assigneeTag}`);
      }
    }
  } else {
    // Group by assignee (legacy view)
    console.log(bold('\nIssues by Assignee'));
    console.log(dim('─'.repeat(60)));

    const byAssignee = {};
    for (const assignee of VALID_ASSIGNEES) {
      byAssignee[assignee] = [];
    }
    for (const q of filtered) {
      byAssignee[q.assignee]?.push(q);
    }

    for (const assignee of VALID_ASSIGNEES) {
      const assigneeQuestions = byAssignee[assignee];
      if (assigneeQuestions.length === 0) continue;

      console.log(`\n${cyan(`[${ASSIGNEE_DISPLAY_NAMES[assignee]}]`)}`);

      for (const q of assigneeQuestions) {
        const statusIcon = q.status === 'open' ? yellow('○') :
          q.status === 'answered' ? cyan('◐') : green('●');
        const cat = q.category || getActionCategory(q);
        const catTag = dim(`[${CATEGORY_DISPLAY_NAMES[cat] || cat}]`);
        const title = q.title || getQuestionText(q).substring(0, 40);
        console.log(`  ${statusIcon} ${title} ${catTag}`);
      }
    }
  }

  // Summary
  const openCount = questions.filter(q => q.status === 'open').length;
  const answeredCount = questions.filter(q => q.status === 'answered').length;
  const resolvedCount = questions.filter(q => q.status === 'resolved').length;
  const dismissedCount = questions.filter(q => q.status === 'dismissed').length;
  const detectedCount = questions.filter(q => q.source === 'auto-detection').length;

  console.log();
  console.log(dim(`Total: ${questions.length} issues (${openCount} open, ${answeredCount} answered, ${resolvedCount} resolved${dismissedCount > 0 ? `, ${dismissedCount} dismissed` : ''})`));
  if (detectedCount > 0) {
    console.log(dim(`  ${detectedCount} auto-detected`));
  }
  console.log();
  console.log(dim('Commands:'));
  console.log(dim('  npm run task issues --action ASSIGN     # What needs assignment?'));
  console.log(dim('  npm run task issues --action SCHEDULE   # What needs scheduling?'));
  console.log(dim('  npm run task issues --action ORDER      # What\'s ready to order?'));
  console.log(dim('  npm run task detect                     # Run auto-detection'));
  console.log();
}

// ============ ANSWER COMMAND ============

async function cmdAnswer(questionId) {
  const data = loadData();

  if (!data.issues || data.issues.length === 0) {
    console.log(dim('\nNo questions found.'));
    return;
  }

  // Select question if not provided
  if (!questionId) {
    const openQuestions = data.issues.filter(q => q.status === 'open');
    if (openQuestions.length === 0) {
      console.log(dim('\nNo open questions to answer.'));
      return;
    }

    const choices = openQuestions.map(q => ({
      name: `${getQuestionText(q).substring(0, 50)}${getQuestionText(q).length > 50 ? '...' : ''} ${dim(`[${q.id}]`)}`,
      value: q.id,
    }));

    questionId = await search({
      message: 'Select question to answer:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const question = data.issues.find(q => q.id === questionId);
  if (!question) {
    console.error(red(`Question "${questionId}" not found`));
    process.exit(1);
  }

  // Display question
  const questionText = getQuestionText(question);
  const questionType = question.type || detectQuestionType(questionText);

  console.log();
  console.log(bold(`Question: ${questionText}`));
  console.log(`Type: ${QUESTION_TYPE_DISPLAY[questionType] || 'Free Text'}`);
  if (question.relatedTask) console.log(`Task: ${question.relatedTask}`);
  console.log(dim('─'.repeat(40)));
  console.log();

  // Handle notification type - no response needed
  if (questionType === 'notification') {
    console.log(yellow('⚠️  This is a system notification. Use `npm run task review` to acknowledge it.'));
    return;
  }

  // Collect structured response based on type
  let response;
  let responseNotes = '';

  switch (questionType) {
    case 'assignee': {
      // Filter vendors if config specifies trades
      let vendorChoices = data.vendors.map(v => ({
        name: `${v.name} (${v.trade || v.type || 'general'})`,
        value: `vendor:${v.id}`,
      }));

      if (question.config?.tradeFilter?.length > 0) {
        vendorChoices = vendorChoices.filter(c => {
          const vendor = data.vendors.find(v => `vendor:${v.id}` === c.value);
          return vendor && question.config.tradeFilter.includes(vendor.trade);
        });
      }

      const vendorRef = await search({
        message: 'Select vendor:',
        source: async (term) => {
          if (!term) return vendorChoices;
          const lower = term.toLowerCase();
          return vendorChoices.filter(c => c.name.toLowerCase().includes(lower));
        },
      });

      response = { type: 'assignee', value: vendorRef };
      break;
    }

    case 'date': {
      const dateInput = await input({
        message: 'Date (YYYY-MM-DD):',
        validate: v => {
          if (!v) return 'Date is required';
          if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
          return true;
        },
      });
      response = { type: 'date', value: dateInput };
      break;
    }

    case 'date-range': {
      const startInput = await input({
        message: 'Start date (YYYY-MM-DD):',
        validate: v => {
          if (!v) return 'Start date is required';
          if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
          return true;
        },
      });

      const endInput = await input({
        message: 'End date (YYYY-MM-DD):',
        validate: v => {
          if (!v) return 'End date is required';
          if (!isValidDate(v)) return 'Invalid date. Use YYYY-MM-DD format';
          if (v < startInput) return `End date cannot be before start date (${startInput})`;
          return true;
        },
      });

      response = { type: 'date-range', start: startInput, end: endInput };
      break;
    }

    case 'dependency': {
      const items = getAllTaskItems(data);
      const available = items.filter(t => t.id !== question.relatedTask);

      const choices = available.map(t => ({
        name: `${t.name} ${dim(`[${t.id}]`)}`,
        value: t.id,
      }));

      const selectedTasks = [];
      let addMore = true;

      while (addMore && choices.length > 0) {
        const taskId = await search({
          message: selectedTasks.length === 0 ? 'Select dependency:' : 'Select another dependency:',
          source: async (term) => {
            const remaining = choices.filter(c => !selectedTasks.includes(c.value));
            if (!term) return remaining;
            const lower = term.toLowerCase();
            return remaining.filter(c => c.name.toLowerCase().includes(lower));
          },
        });

        selectedTasks.push(taskId);

        if (selectedTasks.length < available.length) {
          addMore = await confirm({
            message: 'Add another dependency?',
            default: false,
          });
        } else {
          addMore = false;
        }
      }

      response = { type: 'dependency', tasks: selectedTasks };
      break;
    }

    case 'yes-no': {
      const yesNo = await select({
        message: 'Answer:',
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
      });
      response = { type: 'yes-no', value: yesNo };
      break;
    }

    case 'select-one': {
      const options = question.config?.options || ['Option 1', 'Option 2', 'Option 3'];
      const choices = options.map(o => ({ name: o, value: o }));

      const selected = await select({
        message: 'Select option:',
        choices,
      });
      response = { type: 'select-one', value: selected };
      break;
    }

    case 'material-status': {
      const statuses = question.config?.statusOptions || VALID_MATERIAL_STATUSES;
      const choices = statuses.map(s => ({ name: s, value: s }));

      const selected = await select({
        message: 'Select status:',
        choices,
      });
      response = { type: 'material-status', value: selected };
      break;
    }

    default: // free-text
    {
      const textResponse = await input({
        message: 'Response:',
        validate: v => v.trim().length > 0 || 'Response is required',
      });
      response = { type: 'free-text', value: textResponse };
    }
  }

  // Optional notes
  responseNotes = await input({
    message: 'Notes (optional):',
  });

  // Update question
  const today = new Date().toISOString().split('T')[0];
  question.response = response;
  if (responseNotes) question.responseNotes = responseNotes;
  question.respondedAt = today;
  question.status = 'answered';
  question.reviewStatus = 'pending';

  saveData(data);

  const responsePreview = response.type === 'yes-no' ? (response.value ? 'Yes' : 'No') :
    response.type === 'assignee' ? getVendorName(data, response.value) :
    response.type === 'date-range' ? `${response.start} to ${response.end}` :
    response.type === 'dependency' ? response.tasks.join(', ') :
    response.value;

  console.log(green(`\n✓ Response recorded: ${responsePreview}`));
  console.log(dim('  Status: answered → ready for review'));
  console.log(dim('  Run `npm run task review` to review and apply changes'));
}

// ============ DETECT COMMAND ============

/**
 * Run auto-detection rules to find schedule conflicts, past-due items, etc.
 */
function cmdDetect() {
  const data = loadData();

  console.log(bold('\nRunning Auto-Detection Rules'));
  console.log(dim('─'.repeat(40)));

  const { created, resolved } = runAutoDetection(data);

  if (created === 0 && resolved === 0) {
    console.log(dim('\nNo issues detected or resolved.'));
  } else {
    if (created > 0) {
      console.log(yellow(`\n⚡ Created ${created} new auto-detected issue(s)`));
    }
    if (resolved > 0) {
      console.log(green(`✓ Auto-resolved ${resolved} issue(s) (conditions cleared)`));
    }
    saveData(data);
  }

  // Show summary of detected issues
  const detected = data.issues.filter(q =>
    q.source === 'auto-detection' && q.status !== 'resolved' && q.status !== 'dismissed'
  );

  if (detected.length > 0) {
    console.log(bold('\nActive Auto-Detected Issues:'));
    for (const issue of detected) {
      const cat = issue.category || getActionCategory(issue);
      const catName = CATEGORY_DISPLAY_NAMES[cat] || cat;
      console.log(`  ${yellow('⚡')} [${catName}] ${issue.title || issue.prompt}`);
    }
    console.log(dim(`\nDismiss with: npm run task dismiss <issue-id>`));
  }

  console.log();
}

// ============ DISMISS COMMAND ============

/**
 * Dismiss an auto-detected issue (acknowledge but don't want to see it)
 */
async function cmdDismiss(issueId) {
  const data = loadData();

  if (!issueId) {
    // Show list of dismissable issues
    const dismissable = data.issues.filter(q =>
      q.source === 'auto-detection' && q.status !== 'resolved' && q.status !== 'dismissed'
    );

    if (dismissable.length === 0) {
      console.log(dim('\nNo auto-detected issues to dismiss.'));
      return;
    }

    const choices = dismissable.map(q => ({
      name: `${q.title || q.prompt?.substring(0, 50)} ${dim(`[${q.id}]`)}`,
      value: q.id,
    }));

    issueId = await search({
      message: 'Select issue to dismiss:',
      source: async (term) => {
        if (!term) return choices;
        const lower = term.toLowerCase();
        return choices.filter(c =>
          c.name.toLowerCase().includes(lower) || c.value.toLowerCase().includes(lower)
        );
      },
    });
  }

  const issue = dismissIssue(data, issueId);
  if (!issue) {
    console.error(red(`Issue "${issueId}" not found`));
    process.exit(1);
  }

  saveData(data);
  console.log(green(`\n✓ Dismissed: ${issue.title || issue.id}`));
  console.log(dim('  The issue will be hidden unless it recurs.'));
}

// ============ REVIEW COMMAND ============

async function cmdReview(questionId) {
  const data = loadData();

  if (!data.issues || data.issues.length === 0) {
    console.log(dim('\nNo questions found.'));
    return;
  }

  // Find questions ready for review
  const reviewable = data.issues.filter(q =>
    q.status === 'answered' ||
    (q.type === 'notification' && q.status === 'open')
  );

  if (reviewable.length === 0 && !questionId) {
    console.log(dim('\nNo questions ready for review.'));
    console.log(dim('Questions need to be answered before review.'));
    return;
  }

  // Select question if not provided
  if (!questionId) {
    console.log(bold('\nAnswered Questions Ready for Review'));
    console.log(dim('─'.repeat(40)));

    const choices = reviewable.map((q, i) => {
      const qText = getQuestionText(q);
      const qType = q.type || 'free-text';
      const preview = qText.substring(0, 40) + (qText.length > 40 ? '...' : '');

      let responsePreview = '';
      if (q.response && typeof q.response === 'object') {
        if (q.response.type === 'yes-no') responsePreview = q.response.value ? 'Yes' : 'No';
        else if (q.response.type === 'assignee') responsePreview = getVendorName(data, q.response.value);
        else if (q.response.type === 'date-range') responsePreview = `${q.response.start} - ${q.response.end}`;
        else if (q.response.type === 'dependency') responsePreview = q.response.tasks?.join(', ');
        else responsePreview = q.response.value || '';
      } else if (q.type === 'notification') {
        responsePreview = '(acknowledge)';
      }

      return {
        name: `[${qType}] ${preview} → ${responsePreview}`,
        value: q.id,
      };
    });

    questionId = await select({
      message: 'Select question to review:',
      choices,
    });
  }

  const question = data.issues.find(q => q.id === questionId);
  if (!question) {
    console.error(red(`Question "${questionId}" not found`));
    process.exit(1);
  }

  // Display question details
  const questionText = getQuestionText(question);
  const questionType = question.type || detectQuestionType(questionText);

  console.log();
  console.log(bold(`Question: ${questionText}`));
  console.log(`Type: ${QUESTION_TYPE_DISPLAY[questionType] || 'Free Text'}`);

  // Handle notification type
  if (questionType === 'notification') {
    if (question.relatedTask) console.log(`Related task: ${question.relatedTask}`);
    console.log(`Created: ${question.created}`);
    console.log(dim('─'.repeat(40)));
    console.log();
    console.log(yellow('⚠️  SYSTEM NOTIFICATION'));
    console.log();

    const action = await select({
      message: 'Action:',
      choices: [
        { name: 'Acknowledge - I understand', value: 'acknowledge' },
        { name: 'Dismiss - No action needed', value: 'dismiss' },
        { name: 'Skip - review later', value: 'skip' },
      ],
    });

    if (action === 'skip') {
      console.log(yellow('Skipped'));
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    question.response = { type: 'notification', acknowledged: action === 'acknowledge' };
    question.respondedAt = today;
    question.status = 'resolved';
    question.resolvedAt = today;
    question.reviewStatus = 'accepted';

    saveData(data);
    console.log(green(`\n✓ Notification ${action === 'acknowledge' ? 'acknowledged' : 'dismissed'}`));
    return;
  }

  // Display response
  if (question.response && typeof question.response === 'object') {
    const r = question.response;
    let responseDisplay = '';
    if (r.type === 'yes-no') responseDisplay = r.value ? 'Yes' : 'No';
    else if (r.type === 'assignee') responseDisplay = `${r.value} (${getVendorName(data, r.value)})`;
    else if (r.type === 'date-range') responseDisplay = `start=${r.start}, end=${r.end}`;
    else if (r.type === 'dependency') responseDisplay = r.tasks?.join(', ');
    else responseDisplay = r.value || '';

    console.log(`Response: ${responseDisplay}`);
  } else if (question.response) {
    console.log(`Response: ${question.response}`);
  }
  if (question.responseNotes) console.log(`Notes: "${question.responseNotes}"`);
  console.log(dim('─'.repeat(40)));

  // Get and display proposed changes
  const proposedChanges = getProposedChanges(data, question);
  if (proposedChanges.length > 0) {
    console.log();
    console.log(cyan('📋 Proposed Changes:'));
    for (const change of proposedChanges) {
      if (change.field.includes('inherited')) {
        console.log(dim(`  • ${change.entityId} will inherit ${change.field.split(' ')[0]}`));
      } else {
        console.log(`  • Set ${change.entityId}.${change.field} → ${typeof change.newValue === 'object' ? JSON.stringify(change.newValue) : change.newValue}`);
      }
    }
  }

  // Get and display impact analysis
  const impacts = analyzeImpact(data, question);
  if (impacts.length > 0) {
    console.log();
    const hasErrors = impacts.some(i => i.type === 'error');
    const hasWarnings = impacts.some(i => i.type === 'warning');

    if (hasErrors) {
      console.log(red('❌ Impact Analysis:'));
    } else if (hasWarnings) {
      console.log(yellow('⚠️  Impact Analysis:'));
    } else {
      console.log(cyan('ℹ️  Impact Analysis:'));
    }

    for (const impact of impacts) {
      const prefix = impact.type === 'error' ? red('  • ERROR: ') :
        impact.type === 'warning' ? yellow('  • Warning: ') :
        dim('  • ');
      console.log(`${prefix}${impact.message}`);
    }

    if (!hasErrors && !hasWarnings) {
      console.log();
      console.log(green('✅ No conflicts detected'));
    }
  } else {
    console.log();
    console.log(green('✅ No conflicts detected'));
  }

  // Determine available actions
  const hasBlockingErrors = impacts.some(i => i.type === 'error');
  const actionChoices = [];

  if (!hasBlockingErrors && proposedChanges.length > 0) {
    actionChoices.push({ name: 'Accept - apply changes', value: 'accept' });
  }
  actionChoices.push({ name: 'Reject - provide reason', value: 'reject' });
  actionChoices.push({ name: 'Skip - review later', value: 'skip' });

  console.log();
  const action = await select({
    message: 'Action:',
    choices: actionChoices,
  });

  if (action === 'skip') {
    console.log(yellow('Skipped'));
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  if (action === 'accept') {
    // Apply changes
    const appliedChanges = applyResponse(data, question);

    // Update question status
    question.reviewStatus = 'accepted';
    question.status = 'resolved';
    question.resolvedAt = today;
    question.appliedChanges = appliedChanges;

    saveData(data);

    console.log();
    for (const change of appliedChanges) {
      console.log(green(`✓ Applied: ${change.entityId}.${change.field} = ${typeof change.newValue === 'object' ? JSON.stringify(change.newValue) : change.newValue}`));
    }
    console.log(green('✓ Question resolved'));

  } else if (action === 'reject') {
    const reason = await input({
      message: 'Rejection reason:',
      validate: v => v.trim().length > 0 || 'Reason is required',
    });

    question.reviewStatus = 'rejected';
    question.rejectionReason = reason;
    // Keep status as 'answered' so it can be re-reviewed after re-answering

    saveData(data);
    console.log(yellow(`\n✓ Rejected: ${questionId}`));
    console.log(dim('  Question remains answered - can be re-answered or re-reviewed'));

    // Offer to create follow-up question
    const createFollowUp = await confirm({
      message: 'Create follow-up question?',
      default: false,
    });

    if (createFollowUp) {
      const followUpPrompt = await input({
        message: 'Follow-up question:',
        validate: v => v.trim().length > 0 || 'Question is required',
      });

      const followUpType = await select({
        message: 'Question type:',
        choices: QUESTION_TYPES.filter(t => t.value !== 'notification').map(t => ({
          name: t.name,
          value: t.value,
        })),
      });

      const followUpId = `sq-${followUpType}-${slugify(followUpPrompt.substring(0, 20))}-${Date.now()}`;
      const followUpQuestion = {
        id: followUpId,
        created: today,
        type: followUpType,
        prompt: followUpPrompt,
        assignee: question.assignee,
        status: 'open',
        relatedTask: question.relatedTask,
        relatedMaterial: question.relatedMaterial,
      };

      data.issues.push(followUpQuestion);
      saveData(data);

      console.log(green(`\n✓ Created follow-up ${followUpId} assigned to ${ASSIGNEE_DISPLAY_NAMES[question.assignee]}`));
    }
  }
}

async function cmdExport() {
  let data = loadData();
  const xlsxPath = path.join(projectDir, 'Kitchen-Remodel-Tracker.xlsx');
  const googleDrivePath = path.join(
    process.env.HOME,
    'Google Drive/Shared drives/White Doe Inn/Operations/Building and Maintenance /Kitchen Remodel/Kitchen-Remodel-Tracker.xlsx'
  );

  // Step 0a: Generate material questions
  console.log('Checking materials for missing questions...');
  const materialQuestionsCreated = generateMaterialQuestions(data);
  if (materialQuestionsCreated > 0) {
    console.log(green(`✓ Created ${materialQuestionsCreated} material question(s)`));
  } else {
    console.log(green('✓ All materials have questions'));
  }

  // Step 0b: Generate task questions
  console.log('Checking tasks for missing questions...');
  const taskQuestionsCreated = generateTaskQuestions(data);
  if (taskQuestionsCreated > 0) {
    console.log(green(`✓ Created ${taskQuestionsCreated} task question(s)`));
  } else {
    console.log(green('✓ All tasks have questions'));
  }

  // Save if any questions were created
  if (materialQuestionsCreated > 0 || taskQuestionsCreated > 0) {
    saveData(data);
    // Reload data after saving
    data = loadData();
  }

  // Step 0c: Clean up fully resolved questions
  console.log('Cleaning up resolved questions...');
  const removedCount = cleanupResolvedQuestions(data);
  if (removedCount > 0) {
    console.log(green(`✓ Removed ${removedCount} resolved question(s)`));
    saveData(data);
    data = loadData();
  } else {
    console.log(green('✓ No resolved questions to clean up'));
  }

  // Step 1: Validate
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

      // Check for responses to preserve in Issues sheet (or legacy Open Questions)
      const questionsSheet = wbGD.Sheets['Issues'] || wbGD.Sheets['Open Questions'];
      if (questionsSheet) {
        const questionsData = XLSX.utils.sheet_to_json(questionsSheet);
        gcResponses = questionsData
          .filter(row => row['Response'] && row['Response'].trim())
          .map(row => ({
            questionId: row['Question ID'],
            response: row['Response'],
          }));

        if (gcResponses.length > 0) {
          console.log(yellow(`⚠ Found ${gcResponses.length} response(s) that will be preserved`));
          for (const r of gcResponses) {
            console.log(dim(`  - ${r.questionId}: "${r.response.substring(0, 40)}${r.response.length > 40 ? '...' : ''}"`));
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

        // Create a notification type question about the manual changes
        const today = new Date().toISOString().split('T')[0];
        const changeDetails = manualChanges.map(c =>
          `${c.taskId} ${c.field} was changed to "${c.newValue}"`
        ).join('; ');

        // Create a notification question for each affected task
        const affectedTasks = [...new Set(manualChanges.map(c => c.taskId))];
        for (const taskId of affectedTasks) {
          const taskChanges = manualChanges.filter(c => c.taskId === taskId);
          const taskChangeDetails = taskChanges.map(c =>
            `${c.field}: "${c.oldValue}" → "${c.newValue}"`
          ).join(', ');

          const questionId = `sq-notification-edit-${taskId}-${Date.now()}`;
          const notificationQuestion = {
            id: questionId,
            created: today,
            type: 'notification',
            prompt: `SPREADSHEET EDIT DETECTED: ${taskId} changes (${taskChangeDetails}) were reverted. Use CLI for changes.`,
            relatedTask: taskId,
            assignee: 'brandon',
            status: 'open',
          };

          if (!data.issues) data.issues = [];
          data.issues.push(notificationQuestion);
        }

        saveData(data);
        console.log(yellow(`\nCreated ${affectedTasks.length} notification(s) for spreadsheet edits`));
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
      const questionsSheet = wb.Sheets['Issues'] || wb.Sheets['Open Questions'];

      if (questionsSheet) {
        const questionsData = XLSX.utils.sheet_to_json(questionsSheet);
        gcResponses = questionsData
          .filter(row => row['Response'] && row['Response'].trim())
          .map(row => ({
            questionId: row['Question ID'],
            response: row['Response'],
          }));

        if (gcResponses.length > 0) {
          console.log(yellow(`⚠ Found ${gcResponses.length} response(s) that will be preserved`));
          for (const r of gcResponses) {
            console.log(dim(`  - ${r.questionId}: "${r.response.substring(0, 40)}${r.response.length > 40 ? '...' : ''}"`));
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

  // Step 5: Merge responses back if any
  if (gcResponses.length > 0) {
    console.log('\nPreserving responses...');

    try {
      const XLSX = (await import('xlsx-js-style')).default;

      const wb = XLSX.readFile(xlsxPath);
      const questionsSheet = wb.Sheets['Issues'] || wb.Sheets['Open Questions'];

      if (questionsSheet) {
        const questionsData = XLSX.utils.sheet_to_json(questionsSheet, { header: 1 });
        const headerRow = questionsData[0];
        const responseColIndex = headerRow.indexOf('Response');

        if (responseColIndex >= 0) {
          // Build question ID to row index mapping
          const questionIdColIndex = headerRow.indexOf('Question ID');

          for (let i = 1; i < questionsData.length; i++) {
            const questionId = questionsData[i][questionIdColIndex];
            const preserved = gcResponses.find(r => r.questionId === questionId);

            if (preserved) {
              const cellRef = XLSX.utils.encode_cell({ r: i, c: responseColIndex });
              questionsSheet[cellRef] = { t: 's', v: preserved.response };
            }
          }

          XLSX.writeFile(wb, xlsxPath);
          console.log(green(`✓ Preserved ${gcResponses.length} response(s)`));
        }
      }
    } catch (err) {
      console.error(yellow(`Warning: Could not preserve responses: ${err.message}`));
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
const flags = parseFlags(args.slice(1)); // Parse flags from args after command

switch (command) {
  case 'add':
    // Support both: `add "Task name"` (legacy) and `add --name "Task name"` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.name = arg1;
    }
    cmdAdd(flags).catch(console.error);
    break;
  case 'add-subtask':
    // Support both: `add-subtask parentId` (legacy) and `add-subtask --parent parentId` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.parent = arg1;
    }
    cmdAddSubtask(flags).catch(console.error);
    break;
  case 'status':
    // Support both: `status taskId` (legacy) and `status --id taskId --status value` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.id = arg1;
    }
    cmdStatus(flags).catch(console.error);
    break;
  case 'date':
    // Support both: `date taskId` (legacy) and `date --id taskId --start/--end` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.id = arg1;
    }
    cmdDate(flags).catch(console.error);
    break;
  case 'assign':
    // Support both: `assign taskId` (legacy) and `assign --id taskId --assignee` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.id = arg1;
    }
    cmdAssign(flags).catch(console.error);
    break;
  case 'deps':
    // Support both: `deps taskId` (legacy) and `deps --id taskId --add/--remove` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.id = arg1;
    }
    cmdDeps(flags).catch(console.error);
    break;
  case 'note':
    cmdNote(arg1).catch(console.error);
    break;
  case 'materials':
    // Support both: `materials taskId` (legacy) and `materials --task taskId --action ...` (new)
    if (arg1 && !arg1.startsWith('--')) {
      flags.task = arg1;
    }
    cmdMaterials(flags).catch(console.error);
    break;
  case 'materials-check':
    cmdMaterialsCheck().catch(console.error);
    break;
  // Issue commands (unified issues system)
  case 'issue':
  case 'question': // Backward compatibility alias
    cmdQuestion(arg1).catch(console.error);
    break;
  case 'issues':
  case 'questions': // Backward compatibility alias
    cmdQuestions(flags).catch(console.error);
    break;
  case 'respond':
  case 'answer': // Backward compatibility alias
    cmdAnswer(arg1).catch(console.error);
    break;
  case 'dismiss':
    cmdDismiss(arg1).catch(console.error);
    break;
  case 'detect':
    cmdDetect();
    break;
  case 'review':
    cmdReview(arg1).catch(console.error);
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
  materials-check      Scan materials and create missing questions
  note <task-id>       Add a note to task
  list                 List all tasks
  show <task-id>       Show task details
  validate             Validate data.json
  export               Export to spreadsheet with guardrails

${yellow('Issues (Unified):')}
  issues [--action]    List issues (filter by action category)
  issue [id]           Add new issue or manage existing
  respond [id]         Answer an issue with structured response
  review [id]          Review answered issues with impact analysis
  detect               Run auto-detection rules (conflicts, past-due, etc.)
  dismiss [id]         Dismiss an auto-detected issue

${yellow('Materials:')}
  materials [task-id]  Manage material dependencies
  materials-check      Scan materials and create missing issues

${yellow('Action Categories:')}
  ASSIGN     What do I need to assign? (Brandon)
  SCHEDULE   What do I need to schedule? (Brandon)
  ORDER      What's ready to order? (Tonia)
  SPECIFY    What needs specs/quantity? (Tonia)
  TRACK      What needs delivery tracking? (Tonia)
  DECIDE     What decisions are needed? (Varies)

${yellow('Issue Types:')}
  assignee       Who should do X? → Select vendor
  date           When should X happen? → Single date
  date-range     What dates for X? → Start and end dates
  dependency     What does X depend on? → Task IDs
  yes-no         Should we do X? → Yes or No
  select-one     Which option for X? → Single choice
  material-status What's the status of X? → Status enum
  notification   System alert → Acknowledge only
  free-text      Open-ended → Free-form text

${yellow('Examples:')}
  ${dim('# Issue filtering')}
  npm run task issues                     # All open issues
  npm run task issues --action ASSIGN     # What needs assignment?
  npm run task issues --action SCHEDULE   # What needs scheduling?
  npm run task issues --action ORDER      # What's ready to order?
  npm run task issues --assignee tonia    # Tonia's issues

  ${dim('# Auto-detection')}
  npm run task detect                     # Find conflicts, past-due items
  npm run task dismiss <id>               # Dismiss a warning

  ${dim('# Tasks (interactive mode)')}
  npm run task add
  npm run task add-subtask

  ${dim('# Tasks (flag-based for scripting)')}
  npm run task add --name "Install dryer vents" --category finish --status needs-scheduled
  npm run task add --name "Paint doors" --category paint --assignee eliseo --start 2026-02-01 --end 2026-02-02

  ${dim('# Other commands')}
  npm run task status finish-trim
  npm run task deps hvac-registers
  npm run task export

${yellow('Add Task Flags:')}
  --name        Task name (required)
  --category    Category: ${VALID_CATEGORIES.join(', ')}
  --status      Status: ${VALID_STATUSES.join(', ')}
  --assignee    Vendor ID
  --start       Start date (YYYY-MM-DD)
  --end         End date (YYYY-MM-DD)
  --notes       Notes
  --force       Skip duplicate check
  --interactive Use interactive mode
`);
}
