#!/usr/bin/env node
/**
 * Batch accept all answered questions
 * Handles partial responses for combined questions (e.g., date + orderLink)
 * - Applies provided fields
 * - Keeps question open or creates follow-up for missing fields
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'projects', 'kitchen-remodel', 'data.json');

const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const dim = (text) => `\x1b[2m${text}\x1b[0m`;

// Load data
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Find all answered questions
const answeredQuestions = data.questions.filter(q => q.status === 'answered');

if (answeredQuestions.length === 0) {
  console.log('No answered questions to process');
  process.exit(0);
}

console.log(`Processing ${answeredQuestions.length} answered question(s)...\n`);

const today = new Date().toISOString().split('T')[0];
let fullyResolved = 0;
let partiallyResolved = 0;
let changes = [];
let followUps = [];

// Helper to find material
function findMaterial(materialId) {
  for (const task of data.tasks) {
    for (const mat of (task.materialDependencies || [])) {
      if (typeof mat === 'object' && mat.id === materialId) {
        return { material: mat, taskId: task.id };
      }
    }
    for (const sub of (task.subtasks || [])) {
      for (const mat of (sub.materialDependencies || [])) {
        if (typeof mat === 'object' && mat.id === materialId) {
          return { material: mat, taskId: sub.id };
        }
      }
    }
  }
  return { material: null, taskId: null };
}

for (const question of answeredQuestions) {
  const response = question.response;
  if (!response) continue;

  const value = typeof response === 'object' ? response.value : response;
  console.log(`${question.id}`);
  console.log(dim(`  Response: ${value?.substring(0, 60)}${value?.length > 60 ? '...' : ''}`));

  let isFullyResolved = true;
  let appliedFields = [];
  let missingFields = [];

  // Handle material questions
  if (question.relatedMaterial) {
    const { material, taskId } = findMaterial(question.relatedMaterial);

    if (material) {
      // Combined date + link question
      if (question.id.includes('orderLink') && question.id.includes('expectedDate')) {
        const dateMatch = value.match(/(\d{4}-\d{2}-\d{2})/);
        const urlMatch = value.match(/(https?:\/\/[^\s,]+)/);
        const isNA = value.toLowerCase().includes('n/a');

        // Apply expectedDate if found
        if (dateMatch) {
          material.expectedDate = dateMatch[1];
          appliedFields.push('expectedDate');
          changes.push(`  → Set ${question.relatedMaterial}.expectedDate = ${dateMatch[1]}`);
        } else if (!material.expectedDate) {
          missingFields.push('expectedDate');
        }

        // Apply orderLink if found
        if (urlMatch) {
          material.orderLink = urlMatch[1];
          appliedFields.push('orderLink');
          changes.push(`  → Set ${question.relatedMaterial}.orderLink = ${urlMatch[1].substring(0, 40)}...`);
        } else if (isNA) {
          material.orderLink = 'N/A';
          appliedFields.push('orderLink');
          changes.push(`  → Set ${question.relatedMaterial}.orderLink = N/A`);
        } else if (!dateMatch && value.trim()) {
          // No date found, treat entire response as link
          material.orderLink = value.trim();
          appliedFields.push('orderLink');
          changes.push(`  → Set ${question.relatedMaterial}.orderLink = ${value.substring(0, 40)}...`);
        } else if (!material.orderLink) {
          missingFields.push('orderLink');
        }

        // Check if partially resolved
        if (missingFields.length > 0 && appliedFields.length > 0) {
          isFullyResolved = false;
          console.log(yellow(`  ⚠ Partial: got ${appliedFields.join(', ')} but missing ${missingFields.join(', ')}`));
        }

      } else if (question.id.includes('orderLink')) {
        material.orderLink = value.trim();
        appliedFields.push('orderLink');
        changes.push(`  → Set ${question.relatedMaterial}.orderLink = ${value.substring(0, 40)}...`);

      } else if (question.id.includes('expectedDate')) {
        const dateMatch = value.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          material.expectedDate = dateMatch[1];
          appliedFields.push('expectedDate');
          changes.push(`  → Set ${question.relatedMaterial}.expectedDate = ${dateMatch[1]}`);
        } else {
          console.log(yellow(`  ⚠ Could not parse date from: "${value}"`));
          isFullyResolved = false;
        }

      } else if (question.id.includes('quantity-detail')) {
        // Parse quantity and detail
        const qtyMatch = value.match(/(\d+)/);
        if (qtyMatch) {
          material.quantity = parseInt(qtyMatch[1]);
          appliedFields.push('quantity');
          changes.push(`  → Set ${question.relatedMaterial}.quantity = ${qtyMatch[1]}`);
        } else if (!material.quantity) {
          missingFields.push('quantity');
        }
        // Detail is harder to parse - flag for manual review
        if (!material.detail) {
          missingFields.push('detail');
        }
        if (missingFields.length > 0) {
          isFullyResolved = false;
          console.log(yellow(`  ⚠ Needs manual review for: ${missingFields.join(', ')}`));
        }
      }
    }
  }

  // Handle task questions (assignee, dates, etc.)
  if (question.relatedTask && !question.relatedMaterial) {
    // Find task
    let task = null;
    let isSubtask = false;
    for (const t of data.tasks) {
      if (t.id === question.relatedTask) {
        task = t;
        break;
      }
      for (const sub of (t.subtasks || [])) {
        if (sub.id === question.relatedTask) {
          task = sub;
          isSubtask = true;
          break;
        }
      }
    }

    if (task) {
      if (question.type === 'assignee' || question.id.includes('assignee')) {
        const vendorValue = value.toLowerCase().startsWith('vendor:') ? value.toLowerCase() : `vendor:${value.toLowerCase()}`;
        task.assignee = vendorValue;
        appliedFields.push('assignee');
        changes.push(`  → Set ${question.relatedTask}.assignee = ${vendorValue}`);
      }
      // Add more task field handling as needed
    }
  }

  // Mark question status based on resolution
  if (isFullyResolved) {
    question.status = 'resolved';
    question.reviewStatus = 'accepted';
    question.resolvedAt = today;
    fullyResolved++;
    console.log(green(`  ✓ Fully resolved`));
  } else if (appliedFields.length > 0) {
    // Partial - keep open for missing fields, but note what was applied
    question.status = 'open'; // Reset to open so new question can be generated
    question.partialResponse = {
      appliedFields,
      missingFields,
      originalResponse: value,
      processedAt: today
    };
    partiallyResolved++;
    console.log(yellow(`  → Keeping open for missing fields`));
  }
}

// Save
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');

console.log('\n' + green(`✓ Fully resolved: ${fullyResolved}`));
if (partiallyResolved > 0) {
  console.log(yellow(`⚠ Partially resolved: ${partiallyResolved} (kept open for follow-up)`));
}
if (changes.length > 0) {
  console.log('\nChanges applied:');
  for (const change of changes) {
    console.log(change);
  }
}
