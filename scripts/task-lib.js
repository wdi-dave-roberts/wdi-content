/**
 * Task Library - Pure functions extracted from task.js for testing
 *
 * This module contains validation, lookup, and analysis functions
 * that can be tested in isolation without I/O.
 */

// ============ CONSTANTS ============

export const VALID_STATUSES = ['pending', 'needs-scheduled', 'scheduled', 'confirmed', 'in-progress', 'completed', 'blocked', 'cancelled'];
export const VALID_CATEGORIES = ['demolition', 'rough-in', 'structural', 'mechanical', 'electrical', 'plumbing', 'finish', 'fixtures', 'cleanup', 'inspection', 'trim', 'paint', 'framing', 'milestone', 'clean'];
export const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];
export const VALID_MATERIAL_STATUSES = ['need-to-select', 'selected', 'need-to-order', 'ordered', 'vendor-provided', 'on-hand'];
export const VALID_ASSIGNEES = ['brandon', 'dave', 'tonia', 'system'];
export const VALID_QUESTION_STATUSES = ['open', 'answered', 'resolved', 'dismissed'];
export const VALID_REVIEW_STATUSES = ['pending', 'accepted', 'rejected'];
export const VALID_ISSUE_SOURCES = ['manual', 'auto-lifecycle', 'auto-detection'];
export const ACTION_CATEGORIES = ['ASSIGN', 'SCHEDULE', 'ORDER', 'SPECIFY', 'TRACK', 'DECIDE'];

// ============ VALIDATION ============

/**
 * Validate a date string in YYYY-MM-DD format
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid
 */
export function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

/**
 * Get all material IDs from the data
 * @param {Object} data - Project data
 * @returns {Set<string>} Set of material IDs
 */
export function getAllMaterialIds(data) {
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
 * Validate project data structure
 * @param {Object} data - Project data to validate
 * @returns {string[]} Array of error messages (empty if valid)
 */
export function validate(data) {
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

// ============ LOOKUP FUNCTIONS ============

/**
 * Find a task or subtask by ID
 * @param {Object} data - Project data
 * @param {string} taskId - Task ID to find
 * @returns {{ task: Object|null, parent: Object|null }} Found task and parent (if subtask)
 */
export function findTask(data, taskId) {
  for (const task of data.tasks) {
    if (task.id === taskId) return { task, parent: null };
    for (const sub of (task.subtasks || [])) {
      if (sub.id === taskId) return { task: sub, parent: task };
    }
  }
  return { task: null, parent: null };
}

/**
 * Find tasks assigned to a specific vendor
 * @param {Object} data - Project data
 * @param {string} vendorRef - Vendor reference (e.g., "vendor:danny")
 * @returns {Array} Tasks and subtasks assigned to the vendor
 */
export function findTasksByVendor(data, vendorRef) {
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
 * Find all tasks and subtasks that depend on a given task
 * @param {Object} data - Project data
 * @param {string} taskId - Task ID to find dependents for
 * @returns {Array} Array of { id, name, type } objects for dependent tasks
 */
export function findDependentTasks(data, taskId) {
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

// ============ ID GENERATION ============

/**
 * Convert a name to a URL-friendly slug
 * @param {string} name - Name to slugify
 * @returns {string} Slugified name
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============ SIMILARITY DETECTION ============

/**
 * Simple stemmer for common English suffixes
 * Reduces words to approximate base forms for better matching
 */
export function simpleStem(word) {
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
export function normalizeText(text) {
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
export function getWords(text) {
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
 * @returns {number} 0.0 - 1.0
 */
export function jaccardSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate text similarity using Jaccard with word-order boost
 * @returns {number} 0.0 - 1.0
 */
export function textSimilarity(text1, text2) {
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

// ============ ACTION CATEGORIES ============

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
export function getActionCategory(question) {
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
    // Ordered materials needing tracking -> TRACK
    if (type === 'material-overdue') {
      return 'TRACK';
    }
    if (type === 'date' || (type === 'free-text' && (promptText.includes('delivery') || promptText.includes('expected')))) {
      return 'TRACK';
    }
    if (type === 'material-status') {
      return 'TRACK';
    }
    // Yes/no about ordering -> ORDER
    if (type === 'yes-no' && (promptText.includes('order') || promptText.includes('purchase') || promptText.includes('buy'))) {
      return 'ORDER';
    }
    // Free-text for specs/quantity -> SPECIFY
    if (type === 'free-text') {
      return 'SPECIFY';
    }
  }

  // Task date questions -> SCHEDULE
  if ((type === 'date' || type === 'date-range') && relatedTask) {
    return 'SCHEDULE';
  }

  // Dependency questions -> DECIDE
  if (type === 'dependency') {
    return 'DECIDE';
  }

  // Notifications -> DECIDE (need acknowledgment)
  if (type === 'notification') {
    return 'DECIDE';
  }

  // Yes/no questions are typically decisions
  if (type === 'yes-no') {
    return 'DECIDE';
  }

  // Free-text task questions that combine dates + assignee -> SCHEDULE (primary action)
  if (type === 'free-text' && relatedTask && !relatedMaterial) {
    if (promptText.includes('schedul') || promptText.includes('date') || promptText.includes('when')) {
      return 'SCHEDULE';
    }
    if (promptText.includes('assign') || promptText.includes('who')) {
      return 'ASSIGN';
    }
  }

  // Default to DECIDE for unknown types
  return 'DECIDE';
}

// ============ IMPACT ANALYSIS ============

/**
 * Check if two date ranges overlap
 */
export function datesOverlap(start1, end1, start2, end2) {
  if (!start1 || !end1 || !start2 || !end2) return false;
  return start1 <= end2 && end1 >= start2;
}

/**
 * Analyze impact of an assignee change
 * @param {Object} data - Project data
 * @param {string} taskId - Task being modified
 * @param {string} vendorId - New vendor reference
 * @returns {Array} Array of { type, message } impact objects
 */
export function analyzeAssigneeImpact(data, taskId, vendorId) {
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
 * @param {Object} data - Project data
 * @param {string} taskId - Task being modified
 * @param {string} start - New start date
 * @param {string} end - New end date
 * @returns {Array} Array of { type, message } impact objects
 */
export function analyzeDateRangeImpact(data, taskId, start, end) {
  const impacts = [];
  const { task } = findTask(data, taskId);
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
 * @param {Object} data - Project data
 * @param {string} taskId - Task being modified
 * @param {string[]} newDepIds - New dependency task IDs
 * @returns {Array} Array of { type, message } impact objects
 */
export function analyzeDependencyImpact(data, taskId, newDepIds) {
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

// ============ AUTO-DETECTION RULES ============

/**
 * Detection rules for auto-generated issues.
 * Each rule detects a specific condition and creates an issue.
 */
export const DETECTION_RULES = {
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
    detect: (data, task, parent, today = null) => {
      const checkDate = today || new Date().toISOString().split('T')[0];
      if (!task.end || task.end >= checkDate) return null;
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
    detect: (data, material, taskId, today = null) => {
      const checkDate = today || new Date().toISOString().split('T')[0];
      if (material.status === 'on-hand') return null;
      if (!material.expectedDate || material.expectedDate >= checkDate) return null;

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
 * @param {Object} data - Project data (will be mutated)
 * @param {string} [today] - Override for today's date (for testing)
 * @returns {{ created: number, resolved: number }}
 */
export function runAutoDetection(data, today = null) {
  if (!data.issues) {
    data.issues = [];
  }

  const checkDate = today || new Date().toISOString().split('T')[0];
  let created = 0;
  let resolved = 0;

  // Track which detection issues are still valid
  const validDetectionIds = new Set();

  // Run task-level detection rules
  for (const task of data.tasks) {
    // Check parent task
    for (const [ruleName, rule] of Object.entries(DETECTION_RULES)) {
      if (ruleName === 'material-overdue') continue; // Material rule handled separately

      const detection = rule.detect(data, task, null, checkDate);
      if (detection) {
        const issueId = `id-${detection.type}-${task.id}`;
        validDetectionIds.add(issueId);

        // Check if issue already exists
        const existing = data.issues.find(q => q.id === issueId);
        if (!existing) {
          const newIssue = {
            id: issueId,
            created: checkDate,
            ...detection,
            category: rule.category,
            source: 'auto-detection',
            status: 'open',
            detectionRule: ruleName,
            lastChecked: checkDate,
          };
          data.issues.push(newIssue);
          created++;
        } else {
          // Update lastChecked
          existing.lastChecked = checkDate;
        }
      }
    }

    // Check subtasks
    for (const sub of (task.subtasks || [])) {
      for (const [ruleName, rule] of Object.entries(DETECTION_RULES)) {
        if (ruleName === 'material-overdue') continue;

        const detection = rule.detect(data, sub, task, checkDate);
        if (detection) {
          const issueId = `id-${detection.type}-${sub.id}`;
          validDetectionIds.add(issueId);

          const existing = data.issues.find(q => q.id === issueId);
          if (!existing) {
            const newIssue = {
              id: issueId,
              created: checkDate,
              ...detection,
              category: rule.category,
              source: 'auto-detection',
              status: 'open',
              detectionRule: ruleName,
              lastChecked: checkDate,
            };
            data.issues.push(newIssue);
            created++;
          } else {
            existing.lastChecked = checkDate;
          }
        }
      }
    }

    // Check materials for material-overdue rule
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat !== 'object') continue;

      const materialRule = DETECTION_RULES['material-overdue'];
      const detection = materialRule.detect(data, mat, task.id, checkDate);
      if (detection) {
        const issueId = `id-${detection.type}-${mat.id}`;
        validDetectionIds.add(issueId);

        const existing = data.issues.find(q => q.id === issueId);
        if (!existing) {
          const newIssue = {
            id: issueId,
            created: checkDate,
            ...detection,
            category: materialRule.category,
            source: 'auto-detection',
            status: 'open',
            detectionRule: 'material-overdue',
            lastChecked: checkDate,
          };
          data.issues.push(newIssue);
          created++;
        } else {
          existing.lastChecked = checkDate;
        }
      }
    }

    // Check subtask materials
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat !== 'object') continue;

        const materialRule = DETECTION_RULES['material-overdue'];
        const detection = materialRule.detect(data, mat, sub.id, checkDate);
        if (detection) {
          const issueId = `id-${detection.type}-${mat.id}`;
          validDetectionIds.add(issueId);

          const existing = data.issues.find(q => q.id === issueId);
          if (!existing) {
            const newIssue = {
              id: issueId,
              created: checkDate,
              ...detection,
              category: materialRule.category,
              source: 'auto-detection',
              status: 'open',
              detectionRule: 'material-overdue',
              lastChecked: checkDate,
            };
            data.issues.push(newIssue);
            created++;
          } else {
            existing.lastChecked = checkDate;
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
      question.resolvedAt = checkDate;
      question.resolvedBy = 'auto';
      resolved++;
    }
  }

  return { created, resolved };
}
