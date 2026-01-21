/**
 * MODIFIED FUNCTIONS FOR NAME-BASED PARENT AND DEPENDS ON COLUMNS
 *
 * These modifications change Column B (Parent) and Column H (Depends On) to:
 * 1. Show task NAMES instead of IDs in dropdowns
 * 2. Display names in the cells
 * 3. Internally resolve names back to IDs when needed
 *
 * KEY CHANGES:
 * - updateTaskDropdowns: Creates name-only dropdowns
 * - New helper functions: getTaskNameById, getTaskIdByName, buildTaskNameMap
 * - handleTaskEdit: Resolves parent name to ID for subtask ID generation
 * - addSubtask: Works with name-based parent selection
 */

// ============================================================================
// HELPER FUNCTIONS - Add these near the top of Code.gs (after CONFIG)
// ============================================================================

/**
 * Builds a map of task ID -> task Name from the sheet data
 * @param {Sheet} sheet - The Tasks sheet
 * @returns {Object} Map of {id: name, ...}
 */
function buildTaskIdToNameMap(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][2]; // Column C is Name
    if (id && name) {
      map[id] = name;
    }
  }
  return map;
}

/**
 * Builds a map of task Name -> task ID from the sheet data
 * @param {Sheet} sheet - The Tasks sheet
 * @returns {Object} Map of {name: id, ...}
 */
function buildTaskNameToIdMap(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][2]; // Column C is Name
    if (id && name) {
      map[name] = id;
    }
  }
  return map;
}

/**
 * Gets the task name for a given ID
 * @param {Sheet} sheet - The Tasks sheet
 * @param {string} taskId - The task ID to look up
 * @returns {string|null} The task name or null if not found
 */
function getTaskNameById(sheet, taskId) {
  if (!taskId) return null;
  const map = buildTaskIdToNameMap(sheet);
  return map[taskId] || null;
}

/**
 * Gets the task ID for a given name
 * @param {Sheet} sheet - The Tasks sheet
 * @param {string} taskName - The task name to look up
 * @returns {string|null} The task ID or null if not found
 */
function getTaskIdByName(sheet, taskName) {
  if (!taskName) return null;
  const map = buildTaskNameToIdMap(sheet);
  return map[taskName] || null;
}

/**
 * Checks if a task ID is a parent task (no dots in ID)
 * @param {string} id - The task ID
 * @returns {boolean} True if parent task
 */
function isParentTask(id) {
  return id && !id.toString().includes('.');
}

// ============================================================================
// MODIFIED updateTaskDropdowns FUNCTION
// Replace the existing function (around line 802) with this version
// ============================================================================

function updateTaskDropdowns(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build separate lists for Parent (parent tasks only) and Depends On (all tasks)
  const parentTaskNames = [];  // Only parent tasks (no dots in ID)
  const allTaskNames = [];     // All tasks

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][2]; // Column C is Name
    if (id && name) {
      allTaskNames.push(name);
      // Parent dropdown only shows top-level tasks (IDs without dots)
      if (isParentTask(id)) {
        parentTaskNames.push(name);
      }
    }
  }

  if (allTaskNames.length === 0) return;

  // Update Parent dropdown (column 2) - only parent task names
  if (parentTaskNames.length > 0) {
    const parentRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(parentTaskNames, true)
      .setAllowInvalid(true) // Allow empty
      .build();
    sheet.getRange(2, 2, 100, 1).setDataValidation(parentRule);
  }

  // Update Depends On dropdown (column 8) - all task names
  const dependsRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(allTaskNames, true)
    .setAllowInvalid(true) // Allow multiple comma-separated
    .build();
  sheet.getRange(2, 8, 100, 1).setDataValidation(dependsRule);
}

// ============================================================================
// MODIFIED handleTaskEdit FUNCTION
// Replace the existing function (around line 692) with this version
// ============================================================================

function handleTaskEdit(sheet, row, col) {
  // Column indices
  const ID_COL = 1;
  const PARENT_COL = 2;
  const NAME_COL = 3;
  const LAST_UPDATED_COL = 15;

  // Only process if we have a name (task exists)
  const nameCell = sheet.getRange(row, NAME_COL);
  if (!nameCell.getValue()) return;

  // Update Last Updated timestamp
  sheet.getRange(row, LAST_UPDATED_COL).setValue(new Date());

  // Generate/update ID if empty or parent changed
  const idCell = sheet.getRange(row, ID_COL);
  const parentCell = sheet.getRange(row, PARENT_COL);
  const oldId = idCell.getValue().toString();

  if (!idCell.getValue() || col === PARENT_COL) {
    const parentName = parentCell.getValue();

    // Resolve parent name to ID
    const parentId = parentName ? getTaskIdByName(sheet, parentName) : null;

    const newId = generateTaskId(sheet, parentId);
    idCell.setValue(newId);

    // If ID changed and it's not a new row, update references
    if (oldId && oldId !== newId) {
      updateDependencyReferences(sheet, oldId, newId);
    }
  }
}

// ============================================================================
// MODIFIED generateTaskId FUNCTION
// This version accepts parentId (resolved from name) instead of looking it up
// Replace the existing function with this version
// ============================================================================

function generateTaskId(sheet, parentId) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (parentId) {
    // Generate subtask ID (e.g., 1.1, 1.2, etc.)
    let maxSubtask = 0;
    const prefix = parentId + '.';

    for (let i = 1; i < values.length; i++) {
      const id = values[i][0]?.toString();
      if (id && id.startsWith(prefix)) {
        const subtaskNum = parseInt(id.split('.').pop(), 10);
        if (subtaskNum > maxSubtask) maxSubtask = subtaskNum;
      }
    }
    return parentId + '.' + (maxSubtask + 1);
  } else {
    // Generate parent task ID (e.g., 1, 2, 3, etc.)
    let maxId = 0;
    for (let i = 1; i < values.length; i++) {
      const id = values[i][0]?.toString();
      if (id && isParentTask(id)) {
        const num = parseInt(id, 10);
        if (num > maxId) maxId = num;
      }
    }
    return (maxId + 1).toString();
  }
}

// ============================================================================
// MODIFIED addSubtask FUNCTION
// Replace the existing function (around line 105) with this version
// ============================================================================

function addSubtask() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Get list of parent tasks (no dots in ID) with their names
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const parentTasks = [];

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][2];
    if (id && name && isParentTask(id)) {
      parentTasks.push({ id: id, name: name });
    }
  }

  if (parentTasks.length === 0) {
    SpreadsheetApp.getUi().alert('No parent tasks found!\n\nCreate a parent task first using "Add New Task".');
    return;
  }

  // Prompt user to select parent by NAME
  const ui = SpreadsheetApp.getUi();
  const parentList = parentTasks.map(p => p.name).join('\n');
  const response = ui.prompt(
    'Add Subtask',
    'Enter the parent task NAME:\n\nAvailable parents:\n' + parentList,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const selectedName = response.getResponseText().trim();
  const parent = parentTasks.find(p => p.name === selectedName);

  if (!parent) {
    ui.alert('Invalid parent name: ' + selectedName);
    return;
  }

  // Generate subtask ID
  const newId = generateTaskId(sheet, parent.id);

  // Find where to insert (after parent and its existing children)
  let insertRow = 2;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    if (id === parent.id || id?.startsWith(parent.id + '.')) {
      insertRow = i + 2;
    }
  }

  // Insert new row
  sheet.insertRowAfter(insertRow - 1);
  // Set values: ID, Parent (name), empty fields, Pending status, Normal priority, timestamp
  const newRow = [newId, parent.name, '', '', '', '', '', '', 'Pending', 'Normal', '', '', '', '', new Date(), ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on name cell
  sheet.setActiveRange(sheet.getRange(insertRow, 3));

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  ui.alert('Subtask added with ID: ' + newId + '\n\nFill in the Name, Start, End, and Owner columns.');
}

// ============================================================================
// MODIFIED updateDependencyReferences FUNCTION
// This now handles name-based Depends On values
// Replace the existing function (around line 1053) with this version
// ============================================================================

function updateDependencyReferences(sheet, oldId, newId) {
  const DEPENDS_COL = 8;
  const PARENT_COL = 2;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build ID-to-Name map to convert old references
  const idToName = buildTaskIdToNameMap(sheet);
  const oldName = idToName[oldId];
  const newName = idToName[newId];

  for (let i = 1; i < values.length; i++) {
    // Update Depends On column (now contains names, but might have old format)
    const depends = values[i][DEPENDS_COL - 1]?.toString();
    if (depends) {
      // Check if it contains the old ID or old name
      if (depends.includes(oldId) || (oldName && depends.includes(oldName))) {
        const updated = depends
          .split(',')
          .map(dep => {
            dep = dep.trim();
            // Handle old "ID - Name" format
            if (dep.startsWith(oldId + ' - ')) {
              return newName || dep.replace(oldId, newId);
            }
            // Handle plain old ID
            if (dep === oldId) {
              return newName || newId;
            }
            // Handle old name (shouldn't change but just in case)
            if (oldName && dep === oldName) {
              return newName || oldName;
            }
            return dep;
          })
          .join(', ');

        if (updated !== depends) {
          sheet.getRange(i + 1, DEPENDS_COL).setValue(updated);
        }
      }
    }

    // Update Parent column references (now contains names)
    const parent = values[i][PARENT_COL - 1]?.toString();
    if (parent) {
      // Handle old ID format
      if (parent === oldId || parent.startsWith(oldId + ' - ')) {
        const updatedParent = newName || parent.replace(oldId, newId);
        sheet.getRange(i + 1, PARENT_COL).setValue(updatedParent);
      }
    }
  }
}

// ============================================================================
// MIGRATION FUNCTION - Run once to convert existing data to name format
// Add this function and run it manually from Apps Script editor
// ============================================================================

function migrateToNameFormat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build ID to Name map
  const idToName = buildTaskIdToNameMap(sheet);

  const PARENT_COL = 2;
  const DEPENDS_COL = 8;

  let changesCount = 0;

  for (let i = 1; i < values.length; i++) {
    // Convert Parent column
    const parentValue = values[i][PARENT_COL - 1]?.toString();
    if (parentValue) {
      // Check if it's in old "ID - Name" format or just ID
      let parentId = parentValue;
      if (parentValue.includes(' - ')) {
        parentId = parentValue.split(' - ')[0];
      }
      // If we have a matching name, update to name only
      if (idToName[parentId]) {
        sheet.getRange(i + 1, PARENT_COL).setValue(idToName[parentId]);
        changesCount++;
      }
    }

    // Convert Depends On column
    const dependsValue = values[i][DEPENDS_COL - 1]?.toString();
    if (dependsValue) {
      const updated = dependsValue
        .split(',')
        .map(dep => {
          dep = dep.trim();
          // Check if it's in old "ID - Name" format or just ID
          let depId = dep;
          if (dep.includes(' - ')) {
            depId = dep.split(' - ')[0];
          }
          // If we have a matching name, return name only
          return idToName[depId] || dep;
        })
        .join(', ');

      if (updated !== dependsValue) {
        sheet.getRange(i + 1, DEPENDS_COL).setValue(updated);
        changesCount++;
      }
    }
  }

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  SpreadsheetApp.getUi().alert('Migration complete!\n\n' + changesCount + ' cells updated to name format.');
}
