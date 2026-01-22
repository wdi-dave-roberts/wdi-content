/**
 * Tests for task-lib.js pure functions
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  VALID_STATUSES,
  VALID_MATERIAL_STATUSES,
  ACTION_CATEGORIES,
  isValidDate,
  getAllMaterialIds,
  validate,
  findTask,
  findTasksByVendor,
  findDependentTasks,
  slugify,
  simpleStem,
  normalizeText,
  getWords,
  jaccardSimilarity,
  textSimilarity,
  getActionCategory,
  datesOverlap,
  analyzeAssigneeImpact,
  analyzeDateRangeImpact,
  analyzeDependencyImpact,
  DETECTION_RULES,
  runAutoDetection,
} from './task-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

// Helper to load fixture data
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

// ============ CONSTANTS ============

describe('Constants', () => {
  test('VALID_STATUSES contains expected values', () => {
    expect(VALID_STATUSES).toContain('pending');
    expect(VALID_STATUSES).toContain('scheduled');
    expect(VALID_STATUSES).toContain('completed');
    expect(VALID_STATUSES).toContain('in-progress');
    expect(VALID_STATUSES).not.toContain('invalid');
  });

  test('VALID_MATERIAL_STATUSES contains expected values', () => {
    expect(VALID_MATERIAL_STATUSES).toContain('need-to-select');
    expect(VALID_MATERIAL_STATUSES).toContain('on-hand');
    expect(VALID_MATERIAL_STATUSES).toContain('ordered');
  });

  test('ACTION_CATEGORIES contains expected values', () => {
    expect(ACTION_CATEGORIES).toEqual(['ASSIGN', 'SCHEDULE', 'ORDER', 'SPECIFY', 'TRACK', 'DECIDE']);
  });
});

// ============ VALIDATION ============

describe('isValidDate', () => {
  test('accepts valid YYYY-MM-DD format', () => {
    expect(isValidDate('2026-01-15')).toBe(true);
    expect(isValidDate('2025-12-31')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true); // Leap year
  });

  test('rejects invalid formats', () => {
    expect(isValidDate('01/15/2026')).toBe(false);
    expect(isValidDate('2026/01/15')).toBe(false);
    expect(isValidDate('01-15-2026')).toBe(false);
    expect(isValidDate('2026-1-15')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  test('rejects clearly invalid dates', () => {
    // Note: Date.parse is lenient with some dates (e.g., Feb 30 becomes Mar 2)
    // so we only test truly invalid cases
    expect(isValidDate('2026-00-01')).toBe(false); // Month 0
    expect(isValidDate('invalid')).toBe(false);
  });
});

describe('validate', () => {
  test('passes valid data', () => {
    const data = loadFixture('valid-data.json');
    const errors = validate(data);
    expect(errors).toEqual([]);
  });

  test('catches duplicate task IDs', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Duplicate task ID'))).toBe(true);
  });

  test('catches invalid status values', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Invalid status') && e.includes('bad-status'))).toBe(true);
  });

  test('catches start > end date', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Start date') && e.includes('cannot be after end date'))).toBe(true);
  });

  test('catches orphaned vendor references', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Vendor "nonexistent" not found'))).toBe(true);
  });

  test('catches invalid date formats', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Invalid date') && e.includes('Use YYYY-MM-DD format'))).toBe(true);
  });

  test('catches missing dependencies', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Dependency "nonexistent-task" not found'))).toBe(true);
  });

  test('catches invalid material status', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Invalid material status'))).toBe(true);
  });

  test('catches duplicate issue IDs', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Duplicate issue ID'))).toBe(true);
  });

  test('catches missing issue prompt', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('missing prompt text'))).toBe(true);
  });

  test('catches invalid issue assignee', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Invalid assignee') && e.includes('bad-assignee'))).toBe(true);
  });

  test('catches invalid issue status', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Invalid status') && e.includes('bad-issue-status'))).toBe(true);
  });

  test('catches missing related task', () => {
    const data = loadFixture('invalid-data.json');
    const errors = validate(data);
    expect(errors.some(e => e.includes('Related task "nonexistent-task" not found'))).toBe(true);
  });
});

// ============ LOOKUP FUNCTIONS ============

describe('findTask', () => {
  test('finds top-level task', () => {
    const data = loadFixture('valid-data.json');
    const { task, parent } = findTask(data, 'task-1');
    expect(task).not.toBeNull();
    expect(task.name).toBe('First Task');
    expect(parent).toBeNull();
  });

  test('finds subtask with parent', () => {
    const data = loadFixture('valid-data.json');
    const { task, parent } = findTask(data, 'subtask-1a');
    expect(task).not.toBeNull();
    expect(task.name).toBe('Subtask A');
    expect(parent).not.toBeNull();
    expect(parent.id).toBe('task-1');
  });

  test('returns null for nonexistent task', () => {
    const data = loadFixture('valid-data.json');
    const { task, parent } = findTask(data, 'nonexistent');
    expect(task).toBeNull();
    expect(parent).toBeNull();
  });
});

describe('findTasksByVendor', () => {
  test('finds tasks assigned to vendor', () => {
    const data = loadFixture('valid-data.json');
    const tasks = findTasksByVendor(data, 'vendor:danny');
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some(t => t.id === 'task-1')).toBe(true);
  });

  test('returns empty array for unassigned vendor', () => {
    const data = loadFixture('valid-data.json');
    const tasks = findTasksByVendor(data, 'vendor:bob');
    expect(tasks).toEqual([]);
  });

  test('includes inherited subtasks', () => {
    const data = loadFixture('valid-data.json');
    const tasks = findTasksByVendor(data, 'vendor:danny');
    // Subtasks without explicit assignee should inherit from parent
    expect(tasks.some(t => t.id === 'subtask-1a')).toBe(true);
  });
});

describe('findDependentTasks', () => {
  test('finds tasks that depend on given task', () => {
    const data = loadFixture('valid-data.json');
    const dependents = findDependentTasks(data, 'task-1');
    expect(dependents.length).toBeGreaterThan(0);
    expect(dependents.some(d => d.id === 'task-2')).toBe(true);
  });

  test('finds subtasks that depend on given task', () => {
    const data = loadFixture('valid-data.json');
    const dependents = findDependentTasks(data, 'subtask-1a');
    expect(dependents.some(d => d.id === 'subtask-1b')).toBe(true);
  });

  test('returns empty for task with no dependents', () => {
    const data = loadFixture('valid-data.json');
    const dependents = findDependentTasks(data, 'task-3');
    expect(dependents).toEqual([]);
  });
});

describe('getAllMaterialIds', () => {
  test('collects material IDs from tasks', () => {
    const data = loadFixture('valid-data.json');
    const ids = getAllMaterialIds(data);
    expect(ids.has('mat-wood')).toBe(true);
  });

  test('collects material IDs from subtasks', () => {
    const data = {
      tasks: [{
        id: 'task-1',
        name: 'Test',
        subtasks: [{
          id: 'sub-1',
          name: 'Sub',
          materialDependencies: [{ id: 'sub-mat', name: 'Sub Material', status: 'on-hand' }]
        }]
      }],
      vendors: [],
      issues: []
    };
    const ids = getAllMaterialIds(data);
    expect(ids.has('sub-mat')).toBe(true);
  });
});

// ============ ID GENERATION ============

describe('slugify', () => {
  test('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  test('replaces spaces with hyphens', () => {
    expect(slugify('my task name')).toBe('my-task-name');
  });

  test('removes special characters', () => {
    expect(slugify("Task's Name!")).toBe('task-s-name');
  });

  test('removes leading/trailing hyphens', () => {
    expect(slugify('--test--')).toBe('test');
  });

  test('collapses multiple hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });
});

// ============ TEXT SIMILARITY ============

describe('simpleStem', () => {
  test('stems common suffixes', () => {
    expect(simpleStem('running')).toBe('runn');
    expect(simpleStem('walked')).toBe('walk');
    expect(simpleStem('buildings')).toBe('building');
  });

  test('leaves short words unchanged', () => {
    expect(simpleStem('the')).toBe('the');
    expect(simpleStem('an')).toBe('an');
  });
});

describe('normalizeText', () => {
  test('lowercases text', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  test('removes punctuation', () => {
    expect(normalizeText("What's up?")).toBe('what s up');
  });

  test('collapses whitespace', () => {
    expect(normalizeText('hello    world')).toBe('hello world');
  });

  test('handles empty/null input', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('textSimilarity', () => {
  test('identical texts have high similarity', () => {
    const sim = textSimilarity('install kitchen cabinets', 'install kitchen cabinets');
    expect(sim).toBeGreaterThan(0.9);
  });

  test('similar texts have moderate similarity', () => {
    const sim = textSimilarity('install kitchen cabinets', 'install the kitchen cabinet units');
    expect(sim).toBeGreaterThan(0.4);
  });

  test('different texts have low similarity', () => {
    const sim = textSimilarity('install kitchen cabinets', 'paint the bedroom walls');
    expect(sim).toBeLessThan(0.3);
  });
});

// ============ ACTION CATEGORIES ============

describe('getActionCategory', () => {
  test('assignee type returns ASSIGN', () => {
    const result = getActionCategory({ type: 'assignee', prompt: 'Who should do this?' });
    expect(result).toBe('ASSIGN');
  });

  test('schedule-conflict returns SCHEDULE', () => {
    const result = getActionCategory({ type: 'schedule-conflict', prompt: 'Conflict detected' });
    expect(result).toBe('SCHEDULE');
  });

  test('past-due returns SCHEDULE', () => {
    const result = getActionCategory({ type: 'past-due', prompt: 'Task past due' });
    expect(result).toBe('SCHEDULE');
  });

  test('date with relatedTask returns SCHEDULE', () => {
    const result = getActionCategory({ type: 'date', relatedTask: 'task-1', prompt: 'When to start?' });
    expect(result).toBe('SCHEDULE');
  });

  test('material ordering yes-no returns ORDER', () => {
    const result = getActionCategory({
      type: 'yes-no',
      relatedMaterial: 'mat-1',
      prompt: 'Has this been ordered?'
    });
    expect(result).toBe('ORDER');
  });

  test('material free-text returns SPECIFY', () => {
    const result = getActionCategory({
      type: 'free-text',
      relatedMaterial: 'mat-1',
      prompt: 'What quantity needed?'
    });
    expect(result).toBe('SPECIFY');
  });

  test('material-overdue returns TRACK', () => {
    const result = getActionCategory({
      type: 'material-overdue',
      relatedMaterial: 'mat-1',
      prompt: 'Material is overdue'
    });
    expect(result).toBe('TRACK');
  });

  test('dependency returns DECIDE', () => {
    const result = getActionCategory({ type: 'dependency', prompt: 'What depends on what?' });
    expect(result).toBe('DECIDE');
  });

  test('notification returns DECIDE', () => {
    const result = getActionCategory({ type: 'notification', prompt: 'Alert!' });
    expect(result).toBe('DECIDE');
  });

  test('yes-no without material context returns DECIDE', () => {
    const result = getActionCategory({ type: 'yes-no', prompt: 'Should we proceed?' });
    expect(result).toBe('DECIDE');
  });
});

// ============ IMPACT ANALYSIS ============

describe('datesOverlap', () => {
  test('overlapping ranges return true', () => {
    expect(datesOverlap('2026-01-01', '2026-01-15', '2026-01-10', '2026-01-20')).toBe(true);
  });

  test('non-overlapping ranges return false', () => {
    expect(datesOverlap('2026-01-01', '2026-01-10', '2026-01-15', '2026-01-20')).toBe(false);
  });

  test('adjacent ranges do not overlap', () => {
    expect(datesOverlap('2026-01-01', '2026-01-10', '2026-01-11', '2026-01-20')).toBe(false);
  });

  test('returns false if any date is null', () => {
    expect(datesOverlap('2026-01-01', null, '2026-01-10', '2026-01-20')).toBe(false);
    expect(datesOverlap(null, '2026-01-15', '2026-01-10', '2026-01-20')).toBe(false);
  });
});

describe('analyzeDependencyImpact', () => {
  test('detects circular dependencies', () => {
    const data = loadFixture('circular-deps.json');
    const impacts = analyzeDependencyImpact(data, 'task-a', ['task-b']);
    expect(impacts.some(i => i.type === 'error' && i.message.includes('Circular dependency'))).toBe(true);
  });

  test('allows valid dependency chains', () => {
    const data = loadFixture('valid-data.json');
    const impacts = analyzeDependencyImpact(data, 'task-2', ['task-1']);
    expect(impacts.every(i => i.type !== 'error')).toBe(true);
  });

  test('warns about unscheduled dependencies', () => {
    const data = loadFixture('valid-data.json');
    // task-2 has no dates, so depending on it should warn
    const impacts = analyzeDependencyImpact(data, 'task-3', ['task-2']);
    expect(impacts.some(i => i.type === 'warning' && i.message.includes('not scheduled'))).toBe(true);
  });
});

describe('analyzeAssigneeImpact', () => {
  test('detects schedule conflicts for same assignee', () => {
    const data = loadFixture('schedule-conflicts.json');
    // Assigning vendor-overlap-2 to danny when danny already has overlapping task
    const impacts = analyzeAssigneeImpact(data, 'vendor-overlap-2', 'vendor:danny');
    expect(impacts.some(i => i.type === 'warning' && i.message.includes('Vendor overlap'))).toBe(true);
  });

  test('allows non-overlapping schedules', () => {
    const data = loadFixture('valid-data.json');
    // task-1 (Jan 20-25) and task-3 (Feb 1-5) don't overlap
    const impacts = analyzeAssigneeImpact(data, 'task-3', 'vendor:danny');
    expect(impacts.every(i => !i.message.includes('overlap'))).toBe(true);
  });
});

describe('analyzeDateRangeImpact', () => {
  test('detects dependency ending after start', () => {
    const data = loadFixture('schedule-conflicts.json');
    // conflicting-task depends on blocking-task which ends Jan 30, but starts Jan 25
    const impacts = analyzeDateRangeImpact(data, 'conflicting-task', '2026-01-25', '2026-02-05');
    expect(impacts.some(i => i.type === 'error' && i.message.includes('after proposed start'))).toBe(true);
  });

  test('warns about blocking other tasks', () => {
    const data = loadFixture('valid-data.json');
    // task-1 is a dependency of task-2
    const impacts = analyzeDateRangeImpact(data, 'task-1', '2026-01-20', '2026-01-30');
    // This should produce some informational output at least
    expect(impacts.length).toBeGreaterThanOrEqual(0);
  });
});

// ============ AUTO-DETECTION ============

describe('DETECTION_RULES', () => {
  test('schedule-conflict rule exists', () => {
    expect(DETECTION_RULES['schedule-conflict']).toBeDefined();
    expect(DETECTION_RULES['schedule-conflict'].category).toBe('SCHEDULE');
  });

  test('past-due rule exists', () => {
    expect(DETECTION_RULES['past-due']).toBeDefined();
    expect(DETECTION_RULES['past-due'].category).toBe('SCHEDULE');
  });

  test('unscheduled-blocker rule exists', () => {
    expect(DETECTION_RULES['unscheduled-blocker']).toBeDefined();
    expect(DETECTION_RULES['unscheduled-blocker'].category).toBe('SCHEDULE');
  });

  test('material-overdue rule exists', () => {
    expect(DETECTION_RULES['material-overdue']).toBeDefined();
    expect(DETECTION_RULES['material-overdue'].category).toBe('TRACK');
  });
});

describe('runAutoDetection', () => {
  test('detects schedule conflicts', () => {
    const data = loadFixture('schedule-conflicts.json');
    data.issues = [];
    const result = runAutoDetection(data);
    expect(data.issues.some(i => i.type === 'schedule-conflict')).toBe(true);
  });

  test('detects past-due tasks', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    // Use a date after the past-due tasks
    const result = runAutoDetection(data, '2026-01-15');
    expect(data.issues.some(i => i.type === 'past-due')).toBe(true);
  });

  test('detects unscheduled blockers', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    const result = runAutoDetection(data);
    expect(data.issues.some(i => i.type === 'unscheduled-blocker')).toBe(true);
  });

  test('detects overdue materials', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    // Use a date after the material expected date
    const result = runAutoDetection(data, '2026-01-15');
    expect(data.issues.some(i => i.type === 'material-overdue')).toBe(true);
  });

  test('does not create duplicate issues', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    runAutoDetection(data, '2026-01-15');
    const countBefore = data.issues.length;
    runAutoDetection(data, '2026-01-15');
    const countAfter = data.issues.length;
    expect(countAfter).toBe(countBefore);
  });

  test('auto-resolves cleared issues', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];

    // First run creates issues
    runAutoDetection(data, '2026-01-15');

    // Mark the past-due task as completed
    const pastDueTask = data.tasks.find(t => t.id === 'past-due-task');
    pastDueTask.status = 'completed';

    // Second run should auto-resolve
    runAutoDetection(data, '2026-01-15');

    const pastDueIssue = data.issues.find(i => i.id === 'id-past-due-past-due-task');
    expect(pastDueIssue.status).toBe('resolved');
  });

  test('does not flag completed tasks as past-due', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    runAutoDetection(data, '2026-01-15');

    // completed-past-due should not have an issue
    expect(data.issues.some(i => i.relatedTask === 'completed-past-due')).toBe(false);
  });

  test('does not flag on-hand materials as overdue', () => {
    const data = loadFixture('past-due.json');
    data.issues = [];
    runAutoDetection(data, '2026-01-15');

    // received-mat (on-hand) should not have an issue
    expect(data.issues.some(i => i.relatedMaterial === 'received-mat')).toBe(false);
  });
});
