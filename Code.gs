/**
 * Task Tracker Google Apps Script
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Save (Ctrl+S or Cmd+S)
 * 5. Run the function you want:
 *    - createBlankSheet() - Creates blank template for GC
 *    - createSheetWithDummyData() - Creates sheet with sample data for testing
 * 6. When prompted, authorize the script to access Google Sheets
 * 7. The sheet will be set up automatically
 *
 * MODIFIED: Parent and Depends On columns now show task NAMES instead of IDs
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  priorities: ['Critical', 'High', 'Normal', 'Low'],
  priorityColors: {
    'Critical': '#ea4335',  // Red
    'High': '#fa903e',      // Orange
    'Normal': '#fbbc04',    // Yellow
    'Low': '#34a853'        // Green
  },
  owners: ['Owner', 'Contractor'],
  statuses: ['Pending', 'Scheduled', 'In Progress', 'Completed', 'Blocked', 'Cancelled'],
  categories: [
    'Demolition', 'Structural', 'Mechanical', 'Electrical', 'Plumbing',
    'Finish', 'Fixtures', 'Cleanup', 'Inspection', 'Equipment', 'Windows & Doors'
  ],
  issueStatuses: ['Open', 'In Progress', 'Blocked', 'Resolved']
};

// ============================================================================
// HELPER FUNCTIONS FOR NAME-BASED LOOKUPS
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
    const name = values[i][1]; // Column B (index 1) is Name
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
    const name = values[i][1]; // Column B (index 1) is Name
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

/**
 * Resolves a value that might be in old "ID - Name" format or just a name
 * Returns the task ID
 * @param {Sheet} sheet - The Tasks sheet
 * @param {string} value - The value to resolve
 * @returns {string|null} The task ID or null
 */
function resolveToTaskId(sheet, value) {
  if (!value) return null;
  const valueStr = value.toString().trim();

  // Check if it's in old "ID - Name" format
  if (valueStr.includes(' - ')) {
    return valueStr.split(' - ')[0].trim();
  }

  // Check if it's already an ID (numeric or numeric.numeric)
  if (/^\d+(\.\d+)?$/.test(valueStr)) {
    return valueStr;
  }

  // Assume it's a name, look up the ID
  return getTaskIdByName(sheet, valueStr);
}

// ============================================================================
// MENU AND UI
// ============================================================================

/**
 * Creates custom menu when spreadsheet opens
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Task Tracker')
    .addItem('Add New Task', 'addNewTask')
    .addItem('Add Subtask...', 'addSubtask')
    .addItem('Set Dependencies...', 'setDependencies')
    .addItem('Set Issues...', 'setTaskIssues')
    .addSeparator()
    .addItem('Add New Issue', 'addNewIssue')
    .addItem('Set Affected Tasks...', 'setAffectedTasks')
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Create Blank Sheet', 'createBlankSheet'))
    .addSubMenu(ui.createMenu('More')
      .addItem('Refresh Dropdowns', 'refreshAllDropdowns')
      .addItem('Reorganize Tasks', 'reorganizeAllTasks')
      .addItem('Migrate to Name Format', 'migrateToNameFormat'))
    .addToUi();
}

/**
 * Adds a new parent task at the end of the task list
 */
function addNewTask() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Find next available parent ID
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let maxId = 0;

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id && !id.includes('.')) {
      const num = parseInt(id, 10);
      if (num > maxId) maxId = num;
    }
  }

  const newId = (maxId + 1).toString();

  // Find first empty row or add at end
  let insertRow = 2;
  for (let i = 1; i < values.length; i++) {
    if (values[i][1]) { // Has name (now column B, index 1)
      insertRow = i + 2;
    }
  }

  // Insert new row with ID and defaults
  // NEW column order: ID, Name, Status, Priority, Owner, Assignee, Start, End, Issues, Depends On, Category, Description, Parent, Est Cost, Location, Last Updated, Comments
  const newRow = [newId, '', 'Pending', 'Normal', '', '', '', '', '', '', '', '', '', '', '', new Date(), ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on name cell (now column 2)
  sheet.setActiveRange(sheet.getRange(insertRow, 2));

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  SpreadsheetApp.getUi().alert('New task added with ID: ' + newId + '\n\nFill in the Name, Start, End, and Owner columns.');
}

/**
 * Adds a subtask under a selected parent
 * NOW USES TASK NAMES instead of IDs
 */
function addSubtask() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Get list of parent tasks (no dots in ID)
  // Name is now column B (index 1)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const parentTasks = [];

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    const name = values[i][1]; // Name is now column B (index 1)
    if (id && name && !id.includes('.')) {
      parentTasks.push({ id: id, name: name });
    }
  }

  if (parentTasks.length === 0) {
    SpreadsheetApp.getUi().alert('No parent tasks found!\n\nCreate a parent task first using "Add New Task".');
    return;
  }

  // Prompt user to select parent BY NAME
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
    ui.alert('Invalid parent name: ' + selectedName + '\n\nPlease enter the exact task name from the list.');
    return;
  }

  // Generate subtask ID
  let maxChild = 0;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id.startsWith(parent.id + '.')) {
      const childNum = parseInt(id.split('.').pop(), 10);
      if (childNum > maxChild) maxChild = childNum;
    }
  }
  const newId = parent.id + '.' + (maxChild + 1);

  // Find where to insert (after parent and its existing children)
  let insertRow = 2;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id === parent.id || id.startsWith(parent.id + '.')) {
      insertRow = i + 2;
    }
  }

  // Insert new row - Parent column (13) now contains the NAME
  // NEW column order: ID, Name, Status, Priority, Owner, Assignee, Start, End, Issues, Depends On, Category, Description, Parent, Est Cost, Location, Last Updated, Comments
  sheet.insertRowAfter(insertRow - 1);
  const newRow = [newId, '', 'Pending', 'Normal', '', '', '', '', '', '', '', '', parent.name, '', '', new Date(), ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on name cell (now column 2)
  sheet.setActiveRange(sheet.getRange(insertRow, 2));

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  ui.alert('Subtask added with ID: ' + newId + '\n\nFill in the Name, Start, End, and Owner columns.');
}

/**
 * Opens a dialog to set multiple dependencies for the selected task
 * Uses checkboxes so user can select multiple tasks
 */
function setDependencies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Get the active cell - must be in the Tasks sheet
  const activeSheet = ss.getActiveSheet();
  if (activeSheet.getName() !== 'Tasks') {
    SpreadsheetApp.getUi().alert('Please select a task row in the Tasks sheet first.');
    return;
  }

  const activeCell = sheet.getActiveCell();
  const row = activeCell.getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please select a task row (not the header).');
    return;
  }

  // Column indices for new column order
  const NAME_COL = 2;
  const DEPENDS_ON_COL = 10;

  // Get the task name for this row
  const taskName = sheet.getRange(row, NAME_COL).getValue();
  const taskId = sheet.getRange(row, 1).getValue();

  if (!taskName) {
    SpreadsheetApp.getUi().alert('This row doesn\'t have a task. Please select a row with a task name.');
    return;
  }

  // Get all tasks (for checkbox options)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const allTasks = [];

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][NAME_COL - 1]; // 0-indexed
    if (id && name && id !== taskId.toString()) { // Exclude the current task
      allTasks.push({ id: id, name: name });
    }
  }

  if (allTasks.length === 0) {
    SpreadsheetApp.getUi().alert('No other tasks available to depend on.');
    return;
  }

  // Get current dependencies
  const currentDeps = sheet.getRange(row, DEPENDS_ON_COL).getValue()?.toString() || '';
  const currentDepNames = currentDeps.split(',').map(d => d.trim()).filter(d => d);

  // Build HTML for the dialog
  const html = buildDependencyDialogHtml(taskName, allTasks, currentDepNames, row);

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(450);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Set Dependencies for: ' + taskName);
}

/**
 * Builds the HTML for the dependency selection dialog
 */
function buildDependencyDialogHtml(taskName, allTasks, currentDepNames, row) {
  let checkboxes = '';

  for (const task of allTasks) {
    const checked = currentDepNames.includes(task.name) ? 'checked' : '';
    const escapedName = task.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    checkboxes += `
      <div style="padding: 6px 0; border-bottom: 1px solid #eee;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" name="dep" value="${escapedName}" ${checked}
                 style="margin-right: 10px; width: 18px; height: 18px;">
          <span style="flex: 1;">${task.name}</span>
          <span style="color: #666; font-size: 12px; margin-left: 8px;">ID: ${task.id}</span>
        </label>
      </div>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; }
        .task-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .buttons { text-align: right; margin-top: 15px; }
        button { padding: 8px 16px; margin-left: 8px; cursor: pointer; }
        .save-btn { background: #4285f4; color: white; border: none; border-radius: 4px; }
        .save-btn:hover { background: #3367d6; }
        .cancel-btn { background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; }
        .cancel-btn:hover { background: #e1e1e1; }
        .select-all { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <p>Select tasks that <strong>${taskName}</strong> depends on:</p>

      <div class="select-all">
        <button type="button" onclick="selectAll()">Select All</button>
        <button type="button" onclick="selectNone()">Select None</button>
      </div>

      <div class="task-list">
        ${checkboxes}
      </div>

      <div class="buttons">
        <button class="cancel-btn" onclick="google.script.host.close()">Cancel</button>
        <button class="save-btn" onclick="saveDependencies()">Save</button>
      </div>

      <script>
        function selectAll() {
          document.querySelectorAll('input[name="dep"]').forEach(cb => cb.checked = true);
        }

        function selectNone() {
          document.querySelectorAll('input[name="dep"]').forEach(cb => cb.checked = false);
        }

        function saveDependencies() {
          const selected = [];
          document.querySelectorAll('input[name="dep"]:checked').forEach(cb => {
            selected.push(cb.value);
          });

          google.script.run
            .withSuccessHandler(() => google.script.host.close())
            .withFailureHandler(err => alert('Error: ' + err))
            .saveDependenciesToCell(${row}, selected);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Called from the dialog to save selected dependencies to the cell
 */
function saveDependenciesToCell(row, dependencies) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');

  if (!sheet) throw new Error('Tasks sheet not found');

  const DEPENDS_COL = 10; // New column position
  const depString = dependencies.join(', ');

  sheet.getRange(row, DEPENDS_COL).setValue(depString);
}

/**
 * Opens a dialog to set issues for the selected task
 * Uses checkboxes so user can select multiple issues
 */
function setTaskIssues() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = ss.getSheetByName('Tasks');
  const issuesSheet = ss.getSheetByName('Issues');

  if (!tasksSheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }
  if (!issuesSheet) {
    SpreadsheetApp.getUi().alert('Issues sheet not found!');
    return;
  }

  // Get the active cell - must be in the Tasks sheet
  const activeSheet = ss.getActiveSheet();
  if (activeSheet.getName() !== 'Tasks') {
    SpreadsheetApp.getUi().alert('Please select a task row in the Tasks sheet first.');
    return;
  }

  const activeCell = tasksSheet.getActiveCell();
  const row = activeCell.getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please select a task row (not the header).');
    return;
  }

  // Column indices for new column order
  const NAME_COL = 2;
  const ISSUES_COL = 9;

  // Get the task info for this row
  const taskName = tasksSheet.getRange(row, NAME_COL).getValue();
  const taskId = tasksSheet.getRange(row, 1).getValue();

  if (!taskName) {
    SpreadsheetApp.getUi().alert('This row doesn\'t have a task. Please select a row with a task name.');
    return;
  }

  // Get all issues (for checkbox options)
  const issueDataRange = issuesSheet.getDataRange();
  const issueValues = issueDataRange.getValues();
  const allIssues = [];

  for (let i = 1; i < issueValues.length; i++) {
    const id = issueValues[i][0]?.toString();
    const title = issueValues[i][1];
    const status = issueValues[i][3];
    if (id && title) {
      allIssues.push({ id: id, title: title, status: status });
    }
  }

  if (allIssues.length === 0) {
    SpreadsheetApp.getUi().alert('No issues available to link.\n\nCreate an issue first using "Add New Issue".');
    return;
  }

  // Get current issues for this task
  const currentIssues = tasksSheet.getRange(row, ISSUES_COL).getValue()?.toString() || '';
  const currentIssueTitles = currentIssues.split(',').map(i => i.trim()).filter(i => i);

  // Build HTML for the dialog
  const html = buildTaskIssuesDialogHtml(taskName, allIssues, currentIssueTitles, row);

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(450);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Set Issues for: ' + taskName);
}

/**
 * Builds the HTML for the task issues selection dialog
 */
function buildTaskIssuesDialogHtml(taskName, allIssues, currentIssueTitles, row) {
  let checkboxes = '';

  for (const issue of allIssues) {
    const checked = currentIssueTitles.includes(issue.title) ? 'checked' : '';
    const escapedTitle = issue.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const statusColor = issue.status === 'Resolved' ? '#34a853' :
                        issue.status === 'Open' ? '#ea4335' :
                        issue.status === 'In Progress' ? '#4285f4' : '#666';
    checkboxes += `
      <div style="padding: 6px 0; border-bottom: 1px solid #eee;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" name="issue" value="${escapedTitle}" ${checked}
                 style="margin-right: 10px; width: 18px; height: 18px;">
          <span style="flex: 1;">${issue.title}</span>
          <span style="color: ${statusColor}; font-size: 11px; margin-left: 8px; padding: 2px 6px; border-radius: 3px; background: ${statusColor}22;">${issue.status}</span>
        </label>
      </div>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; }
        .issue-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .buttons { text-align: right; margin-top: 15px; }
        button { padding: 8px 16px; margin-left: 8px; cursor: pointer; }
        .save-btn { background: #4285f4; color: white; border: none; border-radius: 4px; }
        .save-btn:hover { background: #3367d6; }
        .cancel-btn { background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; }
        .cancel-btn:hover { background: #e1e1e1; }
        .select-all { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <p>Select issues affecting: <strong>${taskName}</strong></p>

      <div class="select-all">
        <button type="button" onclick="selectAll()">Select All</button>
        <button type="button" onclick="selectNone()">Select None</button>
      </div>

      <div class="issue-list">
        ${checkboxes}
      </div>

      <div class="buttons">
        <button class="cancel-btn" onclick="google.script.host.close()">Cancel</button>
        <button class="save-btn" onclick="saveTaskIssues()">Save</button>
      </div>

      <script>
        function selectAll() {
          document.querySelectorAll('input[name="issue"]').forEach(cb => cb.checked = true);
        }

        function selectNone() {
          document.querySelectorAll('input[name="issue"]').forEach(cb => cb.checked = false);
        }

        function saveTaskIssues() {
          const selected = [];
          document.querySelectorAll('input[name="issue"]:checked').forEach(cb => {
            selected.push(cb.value);
          });

          google.script.run
            .withSuccessHandler(() => google.script.host.close())
            .withFailureHandler(err => alert('Error: ' + err))
            .saveTaskIssuesToCell(${row}, selected);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Called from the dialog to save selected issues to the task's Issues cell
 */
function saveTaskIssuesToCell(row, issues) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');

  if (!sheet) throw new Error('Tasks sheet not found');

  const ISSUES_COL = 9;
  const issuesString = issues.join(', ');

  sheet.getRange(row, ISSUES_COL).setValue(issuesString);
}

// ============================================================================
// ISSUE FUNCTIONS
// ============================================================================

/**
 * Adds a new issue to the Issues sheet
 */
function addNewIssue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Issues');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Issues sheet not found!');
    return;
  }

  // Find next available issue ID
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let maxNum = 0;

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    if (id && id.startsWith('I')) {
      const num = parseInt(id.substring(1), 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const newId = 'I' + (maxNum + 1);

  // Find first empty row or add at end
  let insertRow = 2;
  for (let i = 1; i < values.length; i++) {
    if (values[i][1]) { // Has title
      insertRow = i + 2;
    }
  }

  // Insert new row with ID, empty title, and defaults
  // Columns: ID, Title, Description, Status, Priority, Affected Tasks, Created, Resolved, Comments
  const newRow = [newId, '', '', 'Open', 'Normal', '', new Date(), '', ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on title cell
  sheet.setActiveRange(sheet.getRange(insertRow, 2));

  // Switch to Issues sheet
  ss.setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert('New issue added with ID: ' + newId + '\n\nFill in the Title and Description.\nUse "Set Affected Tasks..." to link to tasks.');
}

/**
 * Opens a dialog to set affected tasks for the selected issue
 * Uses checkboxes so user can select multiple tasks
 */
function setAffectedTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const issuesSheet = ss.getSheetByName('Issues');
  const tasksSheet = ss.getSheetByName('Tasks');

  if (!issuesSheet) {
    SpreadsheetApp.getUi().alert('Issues sheet not found!');
    return;
  }
  if (!tasksSheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Get the active cell - must be in the Issues sheet
  const activeSheet = ss.getActiveSheet();
  if (activeSheet.getName() !== 'Issues') {
    SpreadsheetApp.getUi().alert('Please select an issue row in the Issues sheet first.');
    return;
  }

  const activeCell = issuesSheet.getActiveCell();
  const row = activeCell.getRow();

  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please select an issue row (not the header).');
    return;
  }

  // Get the issue info for this row
  const issueId = issuesSheet.getRange(row, 1).getValue();
  const issueTitle = issuesSheet.getRange(row, 2).getValue();

  if (!issueId) {
    SpreadsheetApp.getUi().alert('This row doesn\'t have an issue. Please select a row with an issue ID.');
    return;
  }

  // Get all tasks (for checkbox options)
  // Name is now column 2 (index 1)
  const taskDataRange = tasksSheet.getDataRange();
  const taskValues = taskDataRange.getValues();
  const allTasks = [];

  for (let i = 1; i < taskValues.length; i++) {
    const id = taskValues[i][0]?.toString();
    const name = taskValues[i][1]; // Name is now column B (index 1)
    if (id && name) {
      allTasks.push({ id: id, name: name });
    }
  }

  if (allTasks.length === 0) {
    SpreadsheetApp.getUi().alert('No tasks available to link.');
    return;
  }

  // Get current affected tasks (column 6 in Issues sheet)
  const currentAffected = issuesSheet.getRange(row, 6).getValue()?.toString() || '';
  const currentAffectedNames = currentAffected.split(',').map(t => t.trim()).filter(t => t);

  // Build HTML for the dialog
  const html = buildAffectedTasksDialogHtml(issueId, issueTitle, allTasks, currentAffectedNames, row);

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(400)
    .setHeight(450);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Set Affected Tasks for Issue: ' + issueId);
}

/**
 * Builds the HTML for the affected tasks selection dialog
 */
function buildAffectedTasksDialogHtml(issueId, issueTitle, allTasks, currentAffectedNames, row) {
  let checkboxes = '';

  for (const task of allTasks) {
    const checked = currentAffectedNames.includes(task.name) ? 'checked' : '';
    const escapedName = task.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    checkboxes += `
      <div style="padding: 6px 0; border-bottom: 1px solid #eee;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" name="task" value="${escapedName}" ${checked}
                 style="margin-right: 10px; width: 18px; height: 18px;">
          <span style="flex: 1;">${task.name}</span>
          <span style="color: #666; font-size: 12px; margin-left: 8px;">ID: ${task.id}</span>
        </label>
      </div>`;
  }

  const displayTitle = issueTitle ? issueTitle : issueId;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <base target="_top">
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; }
        .task-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
        .buttons { text-align: right; margin-top: 15px; }
        button { padding: 8px 16px; margin-left: 8px; cursor: pointer; }
        .save-btn { background: #ea4335; color: white; border: none; border-radius: 4px; }
        .save-btn:hover { background: #c5221f; }
        .cancel-btn { background: #f1f1f1; border: 1px solid #ddd; border-radius: 4px; }
        .cancel-btn:hover { background: #e1e1e1; }
        .select-all { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <p>Select tasks affected by: <strong>${displayTitle}</strong></p>

      <div class="select-all">
        <button type="button" onclick="selectAll()">Select All</button>
        <button type="button" onclick="selectNone()">Select None</button>
      </div>

      <div class="task-list">
        ${checkboxes}
      </div>

      <div class="buttons">
        <button class="cancel-btn" onclick="google.script.host.close()">Cancel</button>
        <button class="save-btn" onclick="saveAffectedTasks()">Save</button>
      </div>

      <script>
        function selectAll() {
          document.querySelectorAll('input[name="task"]').forEach(cb => cb.checked = true);
        }

        function selectNone() {
          document.querySelectorAll('input[name="task"]').forEach(cb => cb.checked = false);
        }

        function saveAffectedTasks() {
          const selected = [];
          document.querySelectorAll('input[name="task"]:checked').forEach(cb => {
            selected.push(cb.value);
          });

          google.script.run
            .withSuccessHandler(() => google.script.host.close())
            .withFailureHandler(err => alert('Error: ' + err))
            .saveAffectedTasksToCell(${row}, selected);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Called from the dialog to save selected affected tasks to the cell
 */
function saveAffectedTasksToCell(row, tasks) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Issues');

  if (!sheet) throw new Error('Issues sheet not found');

  const AFFECTED_TASKS_COL = 6;
  const tasksString = tasks.join(', ');

  sheet.getRange(row, AFFECTED_TASKS_COL).setValue(tasksString);
}

// ============================================================================
// MAIN FUNCTIONS - Run these from the Apps Script editor
// ============================================================================

/**
 * Creates blank sheet template (for GC)
 */
function createBlankSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Task Tracker - Blank');

  setupAllSheets(ss);
  setupTriggers();

  SpreadsheetApp.getUi().alert('Blank Task Tracker created successfully!\n\nStart with the "START HERE" tab for instructions.');
}

// ============================================================================
// SHEET SETUP
// ============================================================================

function setupAllSheets(ss) {
  // Remove default Sheet1 if exists
  const defaultSheet = ss.getSheetByName('Sheet1');

  // Create sheets in order
  createStartHereSheet(ss);
  createTasksSheet(ss);
  createIssuesSheet(ss);
  createVendorsSheet(ss);
  createLookupsSheet(ss);

  // Delete default sheet after others exist
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
  }

  // Move START HERE to first position
  const startHere = ss.getSheetByName('START HERE');
  ss.setActiveSheet(startHere);
  ss.moveActiveSheet(1);
}

function createStartHereSheet(ss) {
  let sheet = ss.getSheetByName('START HERE');
  if (!sheet) {
    sheet = ss.insertSheet('START HERE');
  }
  sheet.clear();

  // Set column width
  sheet.setColumnWidth(1, 800);

  const instructions = [
    ['TASK TRACKER - QUICK START GUIDE'],
    [''],
    ['Welcome! This spreadsheet helps you track project tasks, subtasks, and issues.'],
    [''],
    ['TASK TRACKER MENU'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['Look for the "Task Tracker" menu in the menu bar. It has these options:'],
    ['• Add New Task - Creates a new task with auto-generated ID'],
    ['• Add Subtask... - Creates a subtask under a parent you choose (by name)'],
    ['• Refresh Dropdowns - Updates all dropdown menus'],
    ['• Reorganize Tasks - Groups subtasks under their parents'],
    ['• Migrate to Name Format - Converts old ID references to names'],
    [''],
    ['HOW TO ADD A NEW TASK'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['EASIEST: Use the menu! Click Task Tracker > Add New Task'],
    [''],
    ['Or manually:'],
    ['1. Go to the "Tasks" tab'],
    ['2. Find the first empty row'],
    ['3. Fill in the REQUIRED columns (highlighted in yellow):'],
    ['   • Name - What is this task?'],
    ['   • Start Date - When does it begin?'],
    ['   • End Date - When should it finish?'],
    ['   • Owner - Who is responsible? (Owner or Contractor)'],
    [''],
    ['4. The ID column fills in automatically - don\'t type in it!'],
    ['5. Use the dropdown menus for fields like Priority, Status, and Category'],
    [''],
    ['HOW TO CREATE A SUBTASK'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['EASIEST: Use the menu! Click Task Tracker > Add Subtask...'],
    ['   - Enter the parent task NAME when prompted'],
    ['   - The subtask is created in the right position with the right ID'],
    [''],
    ['Or manually:'],
    ['1. First, create the parent task (see above)'],
    ['2. Create a new row for your subtask'],
    ['3. In the "Parent" column, select the parent task NAME from the dropdown'],
    ['4. The ID will automatically become something like "1.1" or "1.2"'],
    ['5. The row will move to group under its parent automatically'],
    [''],
    ['Example: If task "Kitchen Demo" has ID "1", its subtasks will be "1.1", "1.2", etc.'],
    [''],
    ['HOW TO SET TASK DEPENDENCIES'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['The "Depends On" column lets you specify which tasks must finish first.'],
    ['1. Click the "Depends On" cell for your task'],
    ['2. Select the task NAME from the dropdown'],
    ['3. For multiple dependencies, separate names with commas'],
    [''],
    ['HOW TO LOG AN ISSUE'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['Issues are problems that affect one or more tasks.'],
    ['1. Go to the "Issues" tab'],
    ['2. Fill in: Title, Status, Priority'],
    ['3. In "Affected Tasks", list which task names are impacted'],
    ['4. The ID and Created date fill in automatically'],
    [''],
    ['COLUMN GUIDE'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [''],
    ['TASKS TAB:'],
    ['• ID - Auto-generated, don\'t edit (1, 1.1, 1.2, 2, etc.)'],
    ['• Parent - Pick parent task NAME to make this a subtask'],
    ['• Name - Task description (required)'],
    ['• Start/End - Dates (required)'],
    ['• Owner - Who is responsible: Owner or Contractor (required)'],
    ['• Assignee - Specific vendor/person doing the work'],
    ['• Depends On - Task NAMES that must finish before this one starts'],
    ['• Status - Current state of the task'],
    ['• Priority - Urgency level (color-coded!)'],
    ['• Category - Type of work'],
    ['• Description - Additional details'],
    ['• Est. Cost - Estimated cost'],
    ['• Location - Where in the project'],
    ['• Last Updated - Auto-filled when you edit the row'],
    ['• Comments - Any notes'],
    [''],
    ['ISSUES TAB:'],
    ['• ID - Auto-generated (I1, I2, I3...)'],
    ['• Title - Brief description of the issue'],
    ['• Description - Full details'],
    ['• Status - Open, In Progress, Blocked, or Resolved'],
    ['• Priority - Urgency (color-coded)'],
    ['• Affected Tasks - Which task names this issue impacts'],
    ['• Created - Auto-filled when you add the issue'],
    ['• Resolved - Date the issue was resolved'],
    ['• Comments - Any notes'],
    [''],
    ['TIPS'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['• Gray columns are protected - they update automatically'],
    ['• Use dropdowns whenever available - they prevent errors'],
    ['• The "Vendors" tab lists available assignees'],
    ['• Priority colors: Red = Critical, Orange = High, Yellow = Normal, Green = Low'],
    ['• If you need a new vendor, add them to the "Vendors" tab first'],
    [''],
    ['NEED HELP?'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['Contact the project owner with any questions.']
  ];

  sheet.getRange(1, 1, instructions.length, 1).setValues(instructions);

  // Format title
  sheet.getRange(1, 1).setFontSize(18).setFontWeight('bold');

  // Format section headers
  const headerRows = [5, 14, 30, 45, 52, 60, 91, 99];
  headerRows.forEach(row => {
    if (row <= instructions.length) {
      sheet.getRange(row, 1).setFontWeight('bold').setFontSize(12);
    }
  });

  // Set background
  sheet.getRange(1, 1, instructions.length, 1).setBackground('#f8f9fa');

  // Hide gridlines for cleaner look
  sheet.setHiddenGridlines(true);

  // Protect sheet
  const protection = sheet.protect().setDescription('Instructions - Read Only');
  protection.setWarningOnly(true);
}

function createTasksSheet(ss) {
  let sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    sheet = ss.insertSheet('Tasks');
  }
  sheet.clear();

  // ============================================================================
  // COLUMN CONFIGURATION (1-17)
  // ============================================================================
  // Col 1:  ID          - Auto-generated, protected
  // Col 2:  Name        - Free text (required)
  // Col 3:  Status      - Dropdown: CONFIG.statuses
  // Col 4:  Priority    - Dropdown: CONFIG.priorities + conditional formatting
  // Col 5:  Owner       - Dropdown: Owner/Contractor
  // Col 6:  Assignee    - Dropdown: from Vendors sheet
  // Col 7:  Start       - Date format
  // Col 8:  End         - Date format
  // Col 9:  Issues      - Multi-select via menu (issue titles)
  // Col 10: Depends On  - Multi-select via menu (task names)
  // Col 11: Category    - Dropdown: CONFIG.categories
  // Col 12: Description - Free text
  // Col 13: Parent      - Dropdown: parent task names (hidden)
  // Col 14: Est. Cost   - Currency format (hidden)
  // Col 15: Location    - Free text (hidden)
  // Col 16: Last Updated - Auto-generated, protected
  // Col 17: Comments    - Free text
  // ============================================================================

  const headers = [
    'ID', 'Name', 'Status', 'Priority', 'Owner', 'Assignee', 'Start', 'End',
    'Issues', 'Depends On', 'Category', 'Description', 'Parent',
    'Est. Cost', 'Location', 'Last Updated', 'Comments'
  ];

  // Set headers - all blue with white text
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white');

  // Freeze header row and first column (ID)
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Set column widths
  const widths = [45, 220, 100, 80, 90, 150, 95, 95, 140, 150, 110, 250, 140, 80, 100, 130, 250];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ============================================================================
  // PROTECTED/AUTO-GENERATED COLUMNS
  // ============================================================================

  // Col 1: ID - gray background, protected
  sheet.getRange(2, 1, 100, 1).setBackground('#f5f5f5');
  sheet.getRange(2, 1, 100, 1).protect()
    .setDescription('ID - Auto-generated')
    .setWarningOnly(true);

  // Col 16: Last Updated - gray background, protected
  sheet.getRange(2, 16, 100, 1).setBackground('#f5f5f5');
  sheet.getRange(2, 16, 100, 1).protect()
    .setDescription('Last Updated - Auto-generated')
    .setWarningOnly(true);

  // ============================================================================
  // DROPDOWN VALIDATIONS
  // ============================================================================

  // Col 3: Status - dropdown from CONFIG.statuses
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.statuses, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 3, 100, 1).setDataValidation(statusRule);

  // Col 4: Priority - dropdown from CONFIG.priorities
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.priorities, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, 100, 1).setDataValidation(priorityRule);

  // Col 5: Owner - dropdown (Owner/Contractor)
  const ownerRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.owners, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, 100, 1).setDataValidation(ownerRule);

  // Col 6: Assignee - dropdown from Vendors sheet (set up after vendors are added)
  // This will be populated by setupAssigneeDropdown() after sample data is loaded

  // Col 11: Category - dropdown from CONFIG.categories
  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.categories, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 11, 100, 1).setDataValidation(categoryRule);

  // Col 13: Parent - dropdown of parent task names (set up by updateTaskDropdowns)
  // This will be populated after tasks are added

  // ============================================================================
  // NUMBER/DATE FORMATS
  // ============================================================================

  // Col 7-8: Start/End - date format
  sheet.getRange(2, 7, 100, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, 8, 100, 1).setNumberFormat('yyyy-mm-dd');

  // Col 14: Est. Cost - currency format
  sheet.getRange(2, 14, 100, 1).setNumberFormat('$#,##0.00');

  // Col 16: Last Updated - datetime format
  sheet.getRange(2, 16, 100, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  // ============================================================================
  // CONDITIONAL FORMATTING
  // ============================================================================

  // Col 3: Status - color coding
  addStatusConditionalFormatting(sheet, 3, 2, 100);

  // Col 4: Priority - color coding
  addPriorityConditionalFormatting(sheet, 4, 2, 100);

  // Col 9: Issues - highlight if not empty (pink/red)
  addIssuesHighlightFormatting(sheet, 9, 2, 100);

  // ============================================================================
  // HIDDEN COLUMNS (less frequently used)
  // ============================================================================
  sheet.hideColumns(13); // Parent
  sheet.hideColumns(14); // Est. Cost
  sheet.hideColumns(15); // Location
}

/**
 * Sets up the Assignee dropdown from the Vendors sheet
 * Call this AFTER vendors have been added
 */
function setupAssigneeDropdown(ss) {
  const tasksSheet = ss.getSheetByName('Tasks');
  const vendorsSheet = ss.getSheetByName('Vendors');

  if (!tasksSheet || !vendorsSheet) return;

  const vendorData = vendorsSheet.getDataRange().getValues();
  const vendorNames = [];

  for (let i = 1; i < vendorData.length; i++) {
    if (vendorData[i][0]) {
      vendorNames.push(vendorData[i][0]);
    }
  }

  if (vendorNames.length === 0) return;

  // Col 6: Assignee - dropdown from Vendors
  const assigneeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(vendorNames, true)
    .setAllowInvalid(true)  // Allow empty or custom values
    .build();
  tasksSheet.getRange(2, 6, 100, 1).setDataValidation(assigneeRule);
}

function createIssuesSheet(ss) {
  let sheet = ss.getSheetByName('Issues');
  if (!sheet) {
    sheet = ss.insertSheet('Issues');
  }
  sheet.clear();

  const headers = [
    'ID', 'Title', 'Description', 'Status', 'Priority',
    'Affected Tasks', 'Created', 'Resolved', 'Comments'
  ];

  // Set headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#ea4335')
    .setFontColor('white');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  const widths = [50, 200, 300, 100, 80, 150, 130, 100, 300];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Protected columns (ID, Created) - gray background
  sheet.getRange(2, 1, 100, 1).setBackground('#e8eaed'); // ID column
  sheet.getRange(2, 7, 100, 1).setBackground('#e8eaed'); // Created column

  // Status dropdown
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.issueStatuses, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, 100, 1).setDataValidation(statusRule);

  // Priority dropdown
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.priorities, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, 100, 1).setDataValidation(priorityRule);

  // Date format
  sheet.getRange(2, 7, 100, 2).setNumberFormat('yyyy-mm-dd');

  // Add conditional formatting for priorities
  addPriorityConditionalFormatting(sheet, 5, 2, 100);

  // Add conditional formatting for status
  addIssueStatusConditionalFormatting(sheet, 4, 2, 100);
}

function createVendorsSheet(ss) {
  let sheet = ss.getSheetByName('Vendors');
  if (!sheet) {
    sheet = ss.insertSheet('Vendors');
  }
  sheet.clear();

  const headers = ['Name', 'Type', 'Trade', 'Phone', 'Email', 'Notes'];

  // Set headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#34a853')
    .setFontColor('white');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  const widths = [200, 150, 120, 120, 200, 250];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

function createLookupsSheet(ss) {
  let sheet = ss.getSheetByName('Lookups');
  if (!sheet) {
    sheet = ss.insertSheet('Lookups');
  }
  sheet.clear();

  // This sheet stores lookup values for dropdowns
  // It's hidden from users

  const data = [
    ['Priorities', 'Owners', 'Statuses', 'Categories', 'IssueStatuses'],
    ...CONFIG.priorities.map((p, i) => [
      p,
      CONFIG.owners[i] || '',
      CONFIG.statuses[i] || '',
      CONFIG.categories[i] || '',
      CONFIG.issueStatuses[i] || ''
    ])
  ];

  // Pad arrays to same length
  const maxLen = Math.max(
    CONFIG.priorities.length,
    CONFIG.owners.length,
    CONFIG.statuses.length,
    CONFIG.categories.length,
    CONFIG.issueStatuses.length
  );

  for (let i = data.length; i <= maxLen; i++) {
    data.push(['', '', '', '', '']);
  }

  sheet.getRange(1, 1, data.length, 5).setValues(data);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');

  // Hide the sheet
  sheet.hideSheet();
}

// ============================================================================
// CONDITIONAL FORMATTING
// ============================================================================

function addPriorityConditionalFormatting(sheet, column, startRow, numRows) {
  const range = sheet.getRange(startRow, column, numRows, 1);

  Object.entries(CONFIG.priorityColors).forEach(([priority, color]) => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(priority)
      .setBackground(color)
      .setFontColor('white')
      .setRanges([range])
      .build();

    const rules = sheet.getConditionalFormatRules();
    rules.push(rule);
    sheet.setConditionalFormatRules(rules);
  });
}

function addStatusConditionalFormatting(sheet, column, startRow, numRows) {
  const range = sheet.getRange(startRow, column, numRows, 1);

  const statusColors = {
    'Completed': '#34a853',
    'In Progress': '#4285f4',
    'Blocked': '#ea4335',
    'Cancelled': '#9e9e9e'
  };

  Object.entries(statusColors).forEach(([status, color]) => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(color)
      .setFontColor('white')
      .setRanges([range])
      .build();

    const rules = sheet.getConditionalFormatRules();
    rules.push(rule);
    sheet.setConditionalFormatRules(rules);
  });
}

/**
 * Highlights the Issues column if it contains any text (task has issues)
 */
function addIssuesHighlightFormatting(sheet, column, startRow, numRows) {
  const range = sheet.getRange(startRow, column, numRows, 1);

  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty()
    .setBackground('#fce4ec') // Light pink/red background
    .setFontColor('#c62828') // Dark red text
    .setRanges([range])
    .build();

  const rules = sheet.getConditionalFormatRules();
  rules.push(rule);
  sheet.setConditionalFormatRules(rules);
}

function addIssueStatusConditionalFormatting(sheet, column, startRow, numRows) {
  const range = sheet.getRange(startRow, column, numRows, 1);

  const statusColors = {
    'Resolved': '#34a853',
    'In Progress': '#4285f4',
    'Blocked': '#ea4335',
    'Open': '#fbbc04'
  };

  Object.entries(statusColors).forEach(([status, color]) => {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(color)
      .setFontColor('white')
      .setRanges([range])
      .build();

    const rules = sheet.getConditionalFormatRules();
    rules.push(rule);
    sheet.setConditionalFormatRules(rules);
  });
}

// ============================================================================
// AUTO-ID AND TIMESTAMP TRIGGERS
// ============================================================================

function setupTriggers() {
  // Remove any existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEditHandler') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger
  ScriptApp.newTrigger('onEditHandler')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
}

function onEditHandler(e) {
  if (!e) return;

  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();

  if (sheetName === 'Tasks' && row > 1) {
    handleTaskEdit(sheet, row, col);
  } else if (sheetName === 'Issues' && row > 1) {
    handleIssueEdit(sheet, row, col);
  }
}

/**
 * Handles edits to the Tasks sheet
 * MODIFIED: Now resolves parent NAME to ID for subtask generation
 */
function handleTaskEdit(sheet, row, col) {
  // Column indices for new column order
  // ID, Name, Status, Priority, Owner, Assignee, Start, End, Issues, Depends On, Category, Description, Parent, Est Cost, Location, Last Updated, Comments
  const ID_COL = 1;
  const NAME_COL = 2;
  const PARENT_COL = 13;
  const LAST_UPDATED_COL = 16;

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
    const parentValue = parentCell.getValue();

    // Resolve parent value to ID (handles both name and old "ID - Name" format)
    const parentId = resolveToTaskId(sheet, parentValue);

    const newId = generateTaskId(sheet, row, parentId);
    idCell.setValue(newId);

    // If parent changed, reorganize rows and update dependencies
    if (col === PARENT_COL && oldId && oldId !== newId) {
      // Update dependencies that reference the old ID
      updateDependencyReferences(sheet, oldId, newId);

      // Reorganize to move task under its parent
      reorganizeTaskRows(sheet);
    }
  }

  // Update Parent dropdown and Depends On dropdown with current tasks
  updateTaskDropdowns(sheet);
}

function handleIssueEdit(sheet, row, col) {
  const ID_COL = 1;
  const TITLE_COL = 2;
  const CREATED_COL = 7;

  // Only process if we have a title (issue exists)
  const titleCell = sheet.getRange(row, TITLE_COL);
  if (!titleCell.getValue()) return;

  // Generate ID if empty
  const idCell = sheet.getRange(row, ID_COL);
  if (!idCell.getValue()) {
    const newId = generateIssueId(sheet);
    idCell.setValue(newId);
  }

  // Set Created date if empty
  const createdCell = sheet.getRange(row, CREATED_COL);
  if (!createdCell.getValue()) {
    createdCell.setValue(new Date());
  }
}

/**
 * Generates a task ID based on parent
 * MODIFIED: Now accepts parentId directly (already resolved from name)
 */
function generateTaskId(sheet, currentRow, parentId) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (parentId) {
    // This is a subtask - count existing children of this parent
    let maxChild = 0;
    for (let i = 1; i < values.length; i++) {
      const id = values[i][0].toString();
      if (id.startsWith(parentId + '.')) {
        const childNum = parseInt(id.split('.').pop(), 10);
        if (childNum > maxChild) maxChild = childNum;
      }
    }
    return parentId + '.' + (maxChild + 1);
  } else {
    // This is a top-level task
    let maxId = 0;
    for (let i = 1; i < values.length; i++) {
      const id = values[i][0].toString();
      // Only count top-level IDs (no dots)
      if (id && !id.includes('.')) {
        const num = parseInt(id, 10);
        if (num > maxId) maxId = num;
      }
    }
    return (maxId + 1).toString();
  }
}

function generateIssueId(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  let maxNum = 0;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id.startsWith('I')) {
      const num = parseInt(id.substring(1), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'I' + (maxNum + 1);
}

/**
 * Updates the Parent and Depends On dropdowns
 * MODIFIED: Now shows task NAMES only (not "ID - Name")
 * - Parent dropdown: Only parent task names (no dots in ID)
 * - Depends On dropdown: All task names
 */
function updateTaskDropdowns(sheet) {
  // Column indices for new column order
  const NAME_COL = 2;
  const ISSUES_COL = 9;
  const DEPENDS_ON_COL = 10;
  const PARENT_COL = 13;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build separate lists for Parent (parent tasks only) and Depends On (all tasks)
  const parentTaskNames = [];  // Only parent tasks (no dots in ID)
  const allTaskNames = [];     // All tasks

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0]?.toString();
    const name = values[i][NAME_COL - 1]; // Column B is Name (0-indexed)
    if (id && name) {
      allTaskNames.push(name);
      // Parent dropdown only shows top-level tasks (IDs without dots)
      if (isParentTask(id)) {
        parentTaskNames.push(name);
      }
    }
  }

  if (allTaskNames.length === 0) return;

  // Update Parent dropdown (column 13) - only parent task names
  if (parentTaskNames.length > 0) {
    const parentRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(parentTaskNames, true)
      .setAllowInvalid(true) // Allow empty
      .build();
    sheet.getRange(2, PARENT_COL, 100, 1).setDataValidation(parentRule);
  }

  // Update Depends On dropdown (column 10) - all task names
  const dependsRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(allTaskNames, true)
    .setAllowInvalid(true) // Allow multiple comma-separated or empty
    .build();
  sheet.getRange(2, DEPENDS_ON_COL, 100, 1).setDataValidation(dependsRule);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Manual function to refresh all task dropdowns
 * Run this if dropdowns get out of sync
 */
function refreshTaskDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (sheet) {
    updateTaskDropdowns(sheet);
    SpreadsheetApp.getUi().alert('Task dropdowns refreshed!');
  }
}

/**
 * Manual function to update assignee dropdown from Vendors sheet
 * Run this after adding new vendors
 */
function refreshAssigneeDropdown() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = ss.getSheetByName('Tasks');
  const vendorsSheet = ss.getSheetByName('Vendors');

  if (!tasksSheet || !vendorsSheet) return;

  const vendorData = vendorsSheet.getDataRange().getValues();
  const vendorNames = [];

  for (let i = 1; i < vendorData.length; i++) {
    if (vendorData[i][0]) {
      vendorNames.push(vendorData[i][0]);
    }
  }

  if (vendorNames.length === 0) return;

  const assigneeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(vendorNames, true)
    .setAllowInvalid(true)
    .build();

  tasksSheet.getRange(2, 6, 100, 1).setDataValidation(assigneeRule);  // Col 6 = Assignee

  SpreadsheetApp.getUi().alert('Assignee dropdown updated with ' + vendorNames.length + ' vendors!');
}

/**
 * Refreshes all dropdowns (Task Tracker menu option)
 */
function refreshAllDropdowns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasksSheet = ss.getSheetByName('Tasks');
  const vendorsSheet = ss.getSheetByName('Vendors');

  if (tasksSheet) {
    updateTaskDropdowns(tasksSheet);
  }

  if (tasksSheet && vendorsSheet) {
    // Update assignee dropdown from vendors
    const vendorData = vendorsSheet.getDataRange().getValues();
    const vendorNames = [];

    for (let i = 1; i < vendorData.length; i++) {
      if (vendorData[i][0]) {
        vendorNames.push(vendorData[i][0]);
      }
    }

    if (vendorNames.length > 0) {
      const assigneeRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(vendorNames, true)
        .setAllowInvalid(true)
        .build();
      tasksSheet.getRange(2, 6, 100, 1).setDataValidation(assigneeRule);  // Col 6 = Assignee
    }
  }

  SpreadsheetApp.getUi().alert('All dropdowns refreshed!');
}

/**
 * Reorganize all tasks (Task Tracker menu option)
 */
function reorganizeAllTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  reorganizeTaskRows(sheet);
  updateTaskDropdowns(sheet);

  SpreadsheetApp.getUi().alert('Tasks reorganized! Subtasks are now grouped under their parents.');
}

/**
 * Reorganizes task rows so subtasks appear directly under their parents
 * Sorts by: parent ID, then subtask order
 */
function reorganizeTaskRows(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 2) return; // Only header + maybe 1 row

  // Get all data rows (skip header)
  // Name is now column B (index 1)
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] || values[i][1]) { // Has ID or name (name is now index 1)
      rows.push({
        data: values[i],
        id: values[i][0].toString(),
        name: values[i][1]
      });
    }
  }

  if (rows.length === 0) return;

  // Sort function: parents first (by numeric ID), then their children
  rows.sort((a, b) => {
    const aParts = a.id.split('.').map(Number);
    const bParts = b.id.split('.').map(Number);

    // Compare each part
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });

  // Write sorted data back (starting at row 2)
  const sortedData = rows.map(r => r.data);
  sheet.getRange(2, 1, sortedData.length, sortedData[0].length).setValues(sortedData);

  // Clear any extra rows
  const totalRows = values.length - 1;
  if (totalRows > sortedData.length) {
    sheet.getRange(sortedData.length + 2, 1, totalRows - sortedData.length, values[0].length).clearContent();
  }
}

/**
 * Updates dependency references when a task ID changes
 * MODIFIED: Now handles name-based references
 * @param {Sheet} sheet - The Tasks sheet
 * @param {string} oldId - The old task ID
 * @param {string} newId - The new task ID
 */
function updateDependencyReferences(sheet, oldId, newId) {
  // Column indices for new column order
  const DEPENDS_COL = 10;  // Depends On is column J
  const PARENT_COL = 13;   // Parent is column M

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build maps for ID <-> Name conversion
  const idToName = buildTaskIdToNameMap(sheet);
  const oldName = idToName[oldId];
  const newName = idToName[newId];

  for (let i = 1; i < values.length; i++) {
    // Update Depends On column
    const depends = values[i][DEPENDS_COL - 1]?.toString();
    if (depends) {
      let updated = depends;

      // Handle old "ID - Name" format references
      if (depends.includes(oldId + ' - ')) {
        updated = updated.replace(new RegExp(oldId + ' - [^,]+', 'g'), newName || newId);
      }
      // Handle plain ID references
      if (depends.includes(oldId)) {
        updated = updated.split(',').map(dep => {
          dep = dep.trim();
          if (dep === oldId) return newName || newId;
          return dep;
        }).join(', ');
      }
      // Handle old name references (if name changed)
      if (oldName && newName && oldName !== newName && depends.includes(oldName)) {
        updated = updated.split(',').map(dep => {
          dep = dep.trim();
          if (dep === oldName) return newName;
          return dep;
        }).join(', ');
      }

      if (updated !== depends) {
        sheet.getRange(i + 1, DEPENDS_COL).setValue(updated);
      }
    }

    // Update Parent column references
    const parent = values[i][PARENT_COL - 1]?.toString();
    if (parent) {
      let updatedParent = parent;

      // Handle old "ID - Name" format
      if (parent.startsWith(oldId + ' - ')) {
        updatedParent = newName || parent.replace(oldId, newId);
      }
      // Handle plain ID
      else if (parent === oldId) {
        updatedParent = newName || newId;
      }
      // Handle old name (if name changed)
      else if (oldName && parent === oldName && newName) {
        updatedParent = newName;
      }

      if (updatedParent !== parent) {
        sheet.getRange(i + 1, PARENT_COL).setValue(updatedParent);
      }
    }
  }
}

// ============================================================================
// MIGRATION FUNCTION
// ============================================================================

/**
 * Migrates existing data from "ID - Name" format to name-only format
 * Run this once from the Task Tracker menu after updating the script
 */
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

  // Column indices for new column order
  const PARENT_COL = 13;   // Parent is column M
  const DEPENDS_COL = 10;  // Depends On is column J

  let changesCount = 0;

  for (let i = 1; i < values.length; i++) {
    // Convert Parent column
    const parentValue = values[i][PARENT_COL - 1]?.toString();
    if (parentValue) {
      let newValue = parentValue;

      // Check if it's in old "ID - Name" format
      if (parentValue.includes(' - ')) {
        const parentId = parentValue.split(' - ')[0].trim();
        if (idToName[parentId]) {
          newValue = idToName[parentId];
        }
      }
      // Check if it's just an ID
      else if (/^\d+(\.\d+)?$/.test(parentValue) && idToName[parentValue]) {
        newValue = idToName[parentValue];
      }

      if (newValue !== parentValue) {
        sheet.getRange(i + 1, PARENT_COL).setValue(newValue);
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

          // Check if it's in old "ID - Name" format
          if (dep.includes(' - ')) {
            const depId = dep.split(' - ')[0].trim();
            return idToName[depId] || dep;
          }
          // Check if it's just an ID
          if (/^\d+(\.\d+)?$/.test(dep) && idToName[dep]) {
            return idToName[dep];
          }
          return dep;
        })
        .join(', ');

      if (updated !== dependsValue) {
        sheet.getRange(i + 1, DEPENDS_COL).setValue(updated);
        changesCount++;
      }
    }
  }

  // Refresh dropdowns to show names
  updateTaskDropdowns(sheet);

  SpreadsheetApp.getUi().alert('Migration complete!\n\n' + changesCount + ' cells updated to name format.\n\nDropdowns now show task names.');
}
