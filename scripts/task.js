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
 *   materials-check      Scan materials and create missing questions
 *   note <task-id>       Add a note to task
 *   question [id]        Add new structured question or manage existing
 *   questions [--all]    List open questions (--all includes resolved)
 *   answer [id]          Answer a question with structured response
 *   review [id]          Review answered questions with impact analysis
 *   list                 List all tasks
 *   show <task-id>       Show task details
 *   validate             Validate data.json
 *   export               Export to spreadsheet with guardrails
 *
 * Question Types:
 *   assignee, date, date-range, dependency, yes-no, select-one,
 *   material-status, notification, free-text
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

// Question assignees and statuses
const VALID_ASSIGNEES = ['brandon', 'dave', 'tonia'];
const VALID_QUESTION_STATUSES = ['open', 'answered', 'resolved'];
const VALID_REVIEW_STATUSES = ['pending', 'accepted', 'rejected'];
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
  const questionIds = new Set();

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

  // Validate questions
  const validQuestionTypes = ['assignee', 'date', 'date-range', 'dependency', 'yes-no', 'select-one', 'material-status', 'notification', 'free-text'];

  for (const question of (data.questions || [])) {
    // Duplicate ID check
    if (questionIds.has(question.id)) {
      errors.push(`Duplicate question ID: "${question.id}"`);
    }
    questionIds.add(question.id);

    // Required fields - support both prompt (new) and question (legacy) fields
    const questionText = question.prompt || question.question;
    if (!questionText || questionText.trim().length === 0) {
      errors.push(`Question "${question.id}" is missing question/prompt text`);
    }

    // Type validation (optional for legacy questions)
    if (question.type && !validQuestionTypes.includes(question.type)) {
      errors.push(`Invalid type "${question.type}" for question "${question.id}". Valid: ${validQuestionTypes.join(', ')}`);
    }

    // Assignee validation
    if (!question.assignee) {
      errors.push(`Question "${question.id}" is missing assignee`);
    } else if (!VALID_ASSIGNEES.includes(question.assignee)) {
      errors.push(`Invalid assignee "${question.assignee}" for question "${question.id}". Valid: ${VALID_ASSIGNEES.join(', ')}`);
    }

    // Status validation
    if (!question.status) {
      errors.push(`Question "${question.id}" is missing status`);
    } else if (!VALID_QUESTION_STATUSES.includes(question.status)) {
      errors.push(`Invalid status "${question.status}" for question "${question.id}". Valid: ${VALID_QUESTION_STATUSES.join(', ')}`);
    }

    // Review status validation (optional)
    if (question.reviewStatus && !VALID_REVIEW_STATUSES.includes(question.reviewStatus)) {
      errors.push(`Invalid review status "${question.reviewStatus}" for question "${question.id}". Valid: ${VALID_REVIEW_STATUSES.join(', ')}`);
    }

    // Related task validation (if provided)
    if (question.relatedTask && !taskIds.has(question.relatedTask)) {
      errors.push(`Related task "${question.relatedTask}" not found for question "${question.id}"`);
    }

    // Related material validation (if provided)
    if (question.relatedMaterial) {
      const allMaterialIds = getAllMaterialIds(data);
      if (!allMaterialIds.has(question.relatedMaterial)) {
        errors.push(`Related material "${question.relatedMaterial}" not found for question "${question.id}"`);
      }
    }

    // Date validations
    if (question.created && !isValidDate(question.created)) {
      errors.push(`Invalid created date "${question.created}" for question "${question.id}". Use YYYY-MM-DD format`);
    }
    if (question.resolvedDate && !isValidDate(question.resolvedDate)) {
      errors.push(`Invalid resolved date "${question.resolvedDate}" for question "${question.id}". Use YYYY-MM-DD format`);
    }
    if (question.resolvedAt && !isValidDate(question.resolvedAt)) {
      errors.push(`Invalid resolvedAt date "${question.resolvedAt}" for question "${question.id}". Use YYYY-MM-DD format`);
    }
    if (question.respondedAt && !isValidDate(question.respondedAt)) {
      errors.push(`Invalid respondedAt date "${question.respondedAt}" for question "${question.id}". Use YYYY-MM-DD format`);
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
  const questions = data.questions || [];
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

  // Handle task-related questions (original logic)
  if (!relatedTask) {
    return changes;
  }

  const { task, parent } = findTask(data, relatedTask);
  if (!task) return changes;

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
 * Get the appropriate question for a material based on its lifecycle state.
 * Returns null if no question is needed.
 *
 * @param {Object} material - The material object
 * @param {string} taskId - The parent task ID
 * @returns {Object|null} Question rule or null if material is complete
 */
function getMaterialQuestion(material, taskId) {
  const { id, name, status, quantity, detail, expectedDate } = material;
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
      // Check if past due
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
 * Check if a question already exists for a material
 */
function materialQuestionExists(data, materialId, questionType, field) {
  const questions = data.questions || [];
  return questions.some(q =>
    q.relatedMaterial === materialId &&
    q.type === questionType &&
    q.status !== 'resolved' &&
    (field ? q.id.includes(field) : true)
  );
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
 * Get completeness status for a material
 * Returns: '✅ Complete', '⚠️ Missing: X', or '❌ Needs attention'
 */
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

/**
 * Scan all materials and generate missing questions based on lifecycle rules.
 */
async function cmdMaterialsCheck() {
  const data = loadData();

  // Initialize questions array if needed
  if (!data.questions) {
    data.questions = [];
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
    const existingQuestion = materialQuestionExists(data, material.id, rule.type, rule.field || rule.fields?.[0]);
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

    data.questions.push(newQuestion);
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
      const preview = q.question.substring(0, 40) + (q.question.length > 40 ? '...' : '');
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
  if (!data.questions) {
    data.questions = [];
  }

  // If questionId provided, manage existing question
  if (questionId) {
    const question = data.questions.find(q => q.id === questionId);
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
        data.questions = data.questions.filter(q => q.id !== questionId);
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
  const existingIds = new Set(data.questions.map(q => q.id));
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
  const similarQuestions = findSimilarQuestions(newQuestionData, data.questions, 0.50);

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

  data.questions.push(newQuestion);
  saveData(data);

  const materialSuffix = relatedMaterial ? ` (material: ${relatedMaterial})` : '';
  console.log(green(`\n✓ Created ${QUESTION_TYPE_DISPLAY[questionType]} question "${id}" assigned to ${ASSIGNEE_DISPLAY_NAMES[assignee]}${materialSuffix}`));
}

function cmdQuestions(showAll = false) {
  const data = loadData();
  const questions = data.questions || [];

  if (questions.length === 0) {
    console.log(dim('\nNo questions found.'));
    console.log(dim('Add one with: npm run task question'));
    return;
  }

  // Filter based on --all flag
  const filtered = showAll ? questions : questions.filter(q => q.status !== 'resolved');

  if (filtered.length === 0) {
    console.log(dim('\nNo open questions.'));
    console.log(dim('Use --all to see resolved questions.'));
    return;
  }

  console.log(bold('\nOpen Questions'));
  console.log(dim('─'.repeat(40)));

  // Group by assignee
  const byAssignee = {};
  for (const assignee of VALID_ASSIGNEES) {
    byAssignee[assignee] = [];
  }
  for (const q of filtered) {
    byAssignee[q.assignee].push(q);
  }

  for (const assignee of VALID_ASSIGNEES) {
    const assigneeQuestions = byAssignee[assignee];
    console.log(`\n${cyan(`[${ASSIGNEE_DISPLAY_NAMES[assignee]}]`)}`);

    if (assigneeQuestions.length === 0) {
      console.log(dim('  (none)'));
    } else {
      for (const q of assigneeQuestions) {
        const statusIcon = q.status === 'open' ? yellow('?') :
          q.status === 'answered' ? cyan('!') : green('✓');
        const taskRef = q.relatedTask ? dim(` (${q.relatedTask})`) : '';
        const qText = getQuestionText(q);
        const preview = qText.substring(0, 50) + (qText.length > 50 ? '...' : '');
        const typeTag = q.type ? dim(` [${q.type}]`) : '';
        console.log(`  ${statusIcon} ${preview}${taskRef}${typeTag} [${q.status}]`);
      }
    }
  }

  const openCount = questions.filter(q => q.status === 'open').length;
  const answeredCount = questions.filter(q => q.status === 'answered').length;
  const resolvedCount = questions.filter(q => q.status === 'resolved').length;

  console.log();
  console.log(dim(`Total: ${questions.length} questions (${openCount} open, ${answeredCount} answered, ${resolvedCount} resolved)`));
  console.log();
}

// ============ ANSWER COMMAND ============

async function cmdAnswer(questionId) {
  const data = loadData();

  if (!data.questions || data.questions.length === 0) {
    console.log(dim('\nNo questions found.'));
    return;
  }

  // Select question if not provided
  if (!questionId) {
    const openQuestions = data.questions.filter(q => q.status === 'open');
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

  const question = data.questions.find(q => q.id === questionId);
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

// ============ REVIEW COMMAND ============

async function cmdReview(questionId) {
  const data = loadData();

  if (!data.questions || data.questions.length === 0) {
    console.log(dim('\nNo questions found.'));
    return;
  }

  // Find questions ready for review
  const reviewable = data.questions.filter(q =>
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

  const question = data.questions.find(q => q.id === questionId);
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

      data.questions.push(followUpQuestion);
      saveData(data);

      console.log(green(`\n✓ Created follow-up ${followUpId} assigned to ${ASSIGNEE_DISPLAY_NAMES[question.assignee]}`));
    }
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

      // Check for responses to preserve in Open Questions sheet
      const questionsSheet = wbGD.Sheets['Open Questions'];
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

          if (!data.questions) data.questions = [];
          data.questions.push(notificationQuestion);
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
      const questionsSheet = wb.Sheets['Open Questions'];

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
      const questionsSheet = wb.Sheets['Open Questions'];

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
  case 'materials-check':
    cmdMaterialsCheck().catch(console.error);
    break;
  case 'question':
    cmdQuestion(arg1).catch(console.error);
    break;
  case 'questions':
    cmdQuestions(args.includes('--all'));
    break;
  case 'answer':
    cmdAnswer(arg1).catch(console.error);
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
  question [id]        Add new structured question or manage existing
  questions [--all]    List open questions (--all includes resolved)
  answer [id]          Answer a question with structured response
  review [id]          Review answered questions with impact analysis
  list                 List all tasks
  show <task-id>       Show task details
  validate             Validate data.json
  export               Export to spreadsheet with guardrails

${yellow('Question Types:')}
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
  npm run task add "Install dryer vents"
  npm run task status finish-trim
  npm run task deps hvac-registers
  npm run task materials kitchen-crown-molding
  npm run task materials-check           # Scan and create material questions
  npm run task question                  # Add new structured question
  npm run task question sq-assignee-xyz  # Manage existing
  npm run task questions                 # List open questions
  npm run task answer                    # Answer a question
  npm run task review                    # Review and apply answers
  npm run task export
`);
}
