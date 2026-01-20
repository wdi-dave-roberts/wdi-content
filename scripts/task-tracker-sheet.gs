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
    .addSeparator()
    .addItem('Refresh Dropdowns', 'refreshAllDropdowns')
    .addItem('Reorganize Tasks', 'reorganizeAllTasks')
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
    if (values[i][2]) { // Has name
      insertRow = i + 2;
    }
  }

  // Insert new row with ID and defaults
  const newRow = [newId, '', '', '', '', '', '', '', 'Pending', 'Normal', '', '', '', '', new Date(), ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on name cell
  sheet.setActiveRange(sheet.getRange(insertRow, 3));

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  SpreadsheetApp.getUi().alert('New task added with ID: ' + newId + '\n\nFill in the Name, Start, End, and Owner columns.');
}

/**
 * Adds a subtask under a selected parent
 */
function addSubtask() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Tasks sheet not found!');
    return;
  }

  // Get list of parent tasks (no dots in ID)
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const parentTasks = [];

  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    const name = values[i][2];
    if (id && name && !id.includes('.')) {
      parentTasks.push({ id: id, name: name, display: id + ' - ' + name });
    }
  }

  if (parentTasks.length === 0) {
    SpreadsheetApp.getUi().alert('No parent tasks found!\n\nCreate a parent task first using "Add New Task".');
    return;
  }

  // Prompt user to select parent
  const ui = SpreadsheetApp.getUi();
  const parentList = parentTasks.map(p => p.display).join('\n');
  const response = ui.prompt(
    'Add Subtask',
    'Enter the parent task ID (number only):\n\nAvailable parents:\n' + parentList,
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const parentId = response.getResponseText().trim();
  const parent = parentTasks.find(p => p.id === parentId);

  if (!parent) {
    ui.alert('Invalid parent ID: ' + parentId);
    return;
  }

  // Generate subtask ID
  let maxChild = 0;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id.startsWith(parentId + '.')) {
      const childNum = parseInt(id.split('.').pop(), 10);
      if (childNum > maxChild) maxChild = childNum;
    }
  }
  const newId = parentId + '.' + (maxChild + 1);

  // Find where to insert (after parent and its existing children)
  let insertRow = 2;
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0].toString();
    if (id === parentId || id.startsWith(parentId + '.')) {
      insertRow = i + 2;
    }
  }

  // Insert new row
  sheet.insertRowAfter(insertRow - 1);
  const newRow = [newId, parent.display, '', '', '', '', '', '', 'Pending', 'Normal', '', '', '', '', new Date(), ''];
  sheet.getRange(insertRow, 1, 1, newRow.length).setValues([newRow]);

  // Set focus on name cell
  sheet.setActiveRange(sheet.getRange(insertRow, 3));

  // Refresh dropdowns
  updateTaskDropdowns(sheet);

  ui.alert('Subtask added with ID: ' + newId + '\n\nFill in the Name, Start, End, and Owner columns.');
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

  // Add sample vendors only
  const vendorsSheet = ss.getSheetByName('Vendors');
  addSampleVendors(vendorsSheet);

  SpreadsheetApp.getUi().alert('Blank Task Tracker created successfully!\n\nStart with the "START HERE" tab for instructions.');
}

/**
 * Creates sheet with dummy data (for testing)
 */
function createSheetWithDummyData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Task Tracker - With Sample Data');

  setupAllSheets(ss);
  setupTriggers();

  // Add all sample data
  const vendorsSheet = ss.getSheetByName('Vendors');
  const tasksSheet = ss.getSheetByName('Tasks');
  const issuesSheet = ss.getSheetByName('Issues');

  addSampleVendors(vendorsSheet);
  addSampleTasks(tasksSheet);
  addSampleIssues(issuesSheet);

  SpreadsheetApp.getUi().alert('Task Tracker with sample data created successfully!\n\nCheck the "START HERE" tab for instructions.');
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
    ['• Add Subtask... - Creates a subtask under a parent you choose'],
    ['• Refresh Dropdowns - Updates all dropdown menus'],
    ['• Reorganize Tasks - Groups subtasks under their parents'],
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
    ['   - Enter the parent task ID when prompted'],
    ['   - The subtask is created in the right position with the right ID'],
    [''],
    ['Or manually:'],
    ['1. First, create the parent task (see above)'],
    ['2. Create a new row for your subtask'],
    ['3. In the "Parent" column, select the parent task from the dropdown'],
    ['4. The ID will automatically become something like "1.1" or "1.2"'],
    ['5. The row will move to group under its parent automatically'],
    [''],
    ['Example: If task "Kitchen Demo" has ID "1", its subtasks will be "1.1", "1.2", etc.'],
    [''],
    ['HOW TO SET TASK DEPENDENCIES'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['The "Depends On" column lets you specify which tasks must finish first.'],
    ['1. Click the "Depends On" cell for your task'],
    ['2. Select from the dropdown (shows task names with their IDs)'],
    ['3. For multiple dependencies, separate with commas: "1, 2.1, 3"'],
    [''],
    ['HOW TO LOG AN ISSUE'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['Issues are problems that affect one or more tasks.'],
    ['1. Go to the "Issues" tab'],
    ['2. Fill in: Title, Status, Priority'],
    ['3. In "Affected Tasks", list which task IDs are impacted'],
    ['4. The ID and Created date fill in automatically'],
    [''],
    ['COLUMN GUIDE'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [''],
    ['TASKS TAB:'],
    ['• ID - Auto-generated, don\'t edit (1, 1.1, 1.2, 2, etc.)'],
    ['• Parent - Optional, pick parent task to make this a subtask'],
    ['• Name - Task description (required)'],
    ['• Start/End - Dates (required)'],
    ['• Owner - Who is responsible: Owner or Contractor (required)'],
    ['• Assignee - Specific vendor/person doing the work'],
    ['• Depends On - Tasks that must finish before this one starts'],
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
    ['• Affected Tasks - Which task IDs this issue impacts'],
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

  // Format section headers (updated for new menu section)
  const headerRows = [5, 13, 29, 44, 51, 59, 90, 98];
  headerRows.forEach(row => {
    sheet.getRange(row, 1).setFontWeight('bold').setFontSize(12);
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

  const headers = [
    'ID', 'Parent', 'Name', 'Start', 'End', 'Owner', 'Assignee',
    'Depends On', 'Status', 'Priority', 'Category', 'Description',
    'Est. Cost', 'Location', 'Last Updated', 'Comments'
  ];

  // Set headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  const widths = [50, 120, 200, 100, 100, 90, 150, 150, 100, 80, 120, 250, 80, 100, 130, 250];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Mark required columns (Name, Start, End, Owner) with yellow background in row 2 as hint
  sheet.getRange(2, 3, 1, 1).setBackground('#fff9c4'); // Name
  sheet.getRange(2, 4, 1, 2).setBackground('#fff9c4'); // Start, End
  sheet.getRange(2, 6, 1, 1).setBackground('#fff9c4'); // Owner

  // Protected columns (ID, Last Updated) - gray background
  sheet.getRange(2, 1, 100, 1).setBackground('#e8eaed'); // ID column
  sheet.getRange(2, 15, 100, 1).setBackground('#e8eaed'); // Last Updated column

  // Set up data validation
  const lookupsSheet = ss.getSheetByName('Lookups') || ss.insertSheet('Lookups');

  // Owner dropdown
  const ownerRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.owners, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 6, 100, 1).setDataValidation(ownerRule);

  // Status dropdown
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.statuses, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 9, 100, 1).setDataValidation(statusRule);

  // Priority dropdown
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.priorities, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 10, 100, 1).setDataValidation(priorityRule);

  // Category dropdown
  const categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.categories, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 11, 100, 1).setDataValidation(categoryRule);

  // Date format for Start and End columns
  sheet.getRange(2, 4, 100, 2).setNumberFormat('yyyy-mm-dd');

  // Currency format for Est. Cost
  sheet.getRange(2, 13, 100, 1).setNumberFormat('$#,##0.00');

  // Add conditional formatting for priorities
  addPriorityConditionalFormatting(sheet, 10, 2, 100);

  // Add conditional formatting for status
  addStatusConditionalFormatting(sheet, 9, 2, 100);
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
    const parentValue = parentCell.getValue();
    const newId = generateTaskId(sheet, row, parentValue);
    idCell.setValue(newId);

    // If parent changed, reorganize rows and update dependencies
    if (col === PARENT_COL && oldId !== newId) {
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

function generateTaskId(sheet, currentRow, parentValue) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (parentValue) {
    // This is a subtask - find parent ID from the display value
    // Parent dropdown shows "ID - Name", extract the ID
    const parentId = parentValue.toString().split(' - ')[0].trim();

    // Count existing children of this parent
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

function updateTaskDropdowns(sheet) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // Build list of "ID - Name" for dropdowns
  const taskList = [];
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0];
    const name = values[i][2];
    if (id && name) {
      taskList.push(id + ' - ' + name);
    }
  }

  if (taskList.length === 0) return;

  // Update Parent dropdown (column 2)
  const parentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(taskList, true)
    .setAllowInvalid(true) // Allow empty
    .build();
  sheet.getRange(2, 2, 100, 1).setDataValidation(parentRule);

  // Update Depends On dropdown (column 8)
  const dependsRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(taskList, true)
    .setAllowInvalid(true) // Allow multiple comma-separated
    .build();
  sheet.getRange(2, 8, 100, 1).setDataValidation(dependsRule);
}

// ============================================================================
// SAMPLE DATA
// ============================================================================

function addSampleVendors(sheet) {
  const vendors = [
    ['Danny\'s Construction', 'General Contractor', 'General', '555-0100', 'danny@example.com', 'Primary GC'],
    ['Sparky Electric', 'Subcontractor', 'Electrical', '555-0101', 'sparky@example.com', ''],
    ['Pete\'s Plumbing', 'Subcontractor', 'Plumbing', '555-0102', 'pete@example.com', ''],
    ['Precision Flooring', 'Subcontractor', 'Flooring', '555-0103', 'floors@example.com', 'Hardwood specialist'],
    ['ABC Cabinets', 'Supplier', 'Cabinetry', '555-0104', 'sales@abccabinets.com', ''],
    ['Home Depot', 'Supplier', 'Multiple', '555-0105', '', 'Materials'],
    ['County Inspections', 'Government', 'General', '555-0106', '', 'Building dept']
  ];

  sheet.getRange(2, 1, vendors.length, vendors[0].length).setValues(vendors);
}

function addSampleTasks(sheet) {
  const now = new Date();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Helper to add days to date
  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const tasks = [
    // ID, Parent, Name, Start, End, Owner, Assignee, Depends On, Status, Priority, Category, Description, Est Cost, Location, Last Updated, Comments
    ['1', '', 'Kitchen Demolition', today, addDays(today, 5), 'Contractor', 'Danny\'s Construction', '', 'In Progress', 'High', 'Demolition', 'Remove existing cabinets, counters, and flooring', 2500, 'Kitchen', now, ''],
    ['1.1', '1 - Kitchen Demolition', 'Remove upper cabinets', today, addDays(today, 1), 'Contractor', 'Danny\'s Construction', '', 'Completed', 'Normal', 'Demolition', '', 500, 'Kitchen - North wall', now, 'Completed ahead of schedule'],
    ['1.2', '1 - Kitchen Demolition', 'Remove lower cabinets', addDays(today, 1), addDays(today, 2), 'Contractor', 'Danny\'s Construction', '1.1 - Remove upper cabinets', 'In Progress', 'Normal', 'Demolition', '', 500, 'Kitchen', now, ''],
    ['1.3', '1 - Kitchen Demolition', 'Remove flooring', addDays(today, 2), addDays(today, 4), 'Contractor', 'Danny\'s Construction', '1.2 - Remove lower cabinets', 'Pending', 'Normal', 'Demolition', 'Vinyl sheet removal', 800, 'Kitchen', now, ''],
    ['2', '', 'Electrical Rough-In', addDays(today, 5), addDays(today, 10), 'Contractor', 'Sparky Electric', '1 - Kitchen Demolition', 'Scheduled', 'High', 'Electrical', 'New circuits for appliances', 3500, 'Kitchen', now, ''],
    ['2.1', '2 - Electrical Rough-In', 'Run new circuits', addDays(today, 5), addDays(today, 7), 'Contractor', 'Sparky Electric', '', 'Pending', 'Normal', 'Electrical', '', 2000, 'Kitchen', now, ''],
    ['2.2', '2 - Electrical Rough-In', 'Install outlet boxes', addDays(today, 7), addDays(today, 9), 'Contractor', 'Sparky Electric', '2.1 - Run new circuits', 'Pending', 'Normal', 'Electrical', '', 1000, 'Kitchen', now, ''],
    ['3', '', 'Plumbing Rough-In', addDays(today, 5), addDays(today, 12), 'Contractor', 'Pete\'s Plumbing', '1 - Kitchen Demolition', 'Scheduled', 'High', 'Plumbing', 'Move sink location, add dishwasher line', 4000, 'Kitchen', now, ''],
    ['4', '', 'Order Cabinets', today, addDays(today, 2), 'Owner', '', '', 'In Progress', 'Critical', 'Equipment', 'Custom cabinets - 6 week lead time', 15000, '', now, 'Need to finalize selection ASAP'],
    ['5', '', 'Cabinet Installation', addDays(today, 45), addDays(today, 50), 'Contractor', 'Danny\'s Construction', '2 - Electrical Rough-In, 3 - Plumbing Rough-In, 4 - Order Cabinets', 'Pending', 'Normal', 'Fixtures', '', 2000, 'Kitchen', now, ''],
    ['6', '', 'Final Inspection', addDays(today, 55), addDays(today, 56), 'Owner', 'County Inspections', '5 - Cabinet Installation', 'Pending', 'Normal', 'Inspection', 'Schedule with county', 150, '', now, '']
  ];

  sheet.getRange(2, 1, tasks.length, tasks[0].length).setValues(tasks);

  // Update dropdowns after adding data
  updateTaskDropdowns(sheet);
}

function addSampleIssues(sheet) {
  const now = new Date();

  const issues = [
    // ID, Title, Description, Status, Priority, Affected Tasks, Created, Resolved, Comments
    ['I1', 'Asbestos found in flooring', 'Discovered during demo - need abatement before continuing', 'Open', 'Critical', '1.3, 2, 3', now, '', 'Called abatement company, waiting for quote'],
    ['I2', 'Cabinet delivery delayed', 'Supplier says 2 week delay due to material shortage', 'In Progress', 'High', '4, 5', now, '', 'Negotiating expedited shipping'],
    ['I3', 'Permit clarification needed', 'Inspector wants to review electrical plan before approval', 'Resolved', 'Normal', '2', now, now, 'Resolved - plan approved with minor changes']
  ];

  sheet.getRange(2, 1, issues.length, issues[0].length).setValues(issues);
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

  tasksSheet.getRange(2, 7, 100, 1).setDataValidation(assigneeRule);

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
      tasksSheet.getRange(2, 7, 100, 1).setDataValidation(assigneeRule);
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
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] || values[i][2]) { // Has ID or name
      rows.push({
        data: values[i],
        id: values[i][0].toString(),
        name: values[i][2]
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
 * @param {Sheet} sheet - The Tasks sheet
 * @param {string} oldId - The old task ID
 * @param {string} newId - The new task ID
 */
function updateDependencyReferences(sheet, oldId, newId) {
  const DEPENDS_COL = 8;
  const PARENT_COL = 2;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  for (let i = 1; i < values.length; i++) {
    // Update Depends On column
    const depends = values[i][DEPENDS_COL - 1].toString();
    if (depends.includes(oldId)) {
      // Replace old ID with new ID in dependencies
      // Handle both "ID - Name" format and plain ID
      const updated = depends
        .split(',')
        .map(dep => {
          dep = dep.trim();
          if (dep.startsWith(oldId + ' - ') || dep === oldId) {
            return dep.replace(oldId, newId);
          }
          return dep;
        })
        .join(', ');

      if (updated !== depends) {
        sheet.getRange(i + 1, DEPENDS_COL).setValue(updated);
      }
    }

    // Update Parent column references
    const parent = values[i][PARENT_COL - 1].toString();
    if (parent.startsWith(oldId + ' - ') || parent === oldId) {
      const updatedParent = parent.replace(oldId, newId);
      sheet.getRange(i + 1, PARENT_COL).setValue(updatedParent);
    }
  }
}
