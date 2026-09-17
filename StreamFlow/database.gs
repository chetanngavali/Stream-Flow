/**
 * StreamFlow - Database Service
 * High-performance Google Sheets integration with batch reads and writes.
 */

// Canonical Sheet Headers Definition
const DATABASE_SCHEMAS = {
  [CONFIG.SHEETS.CHANNELS]: [
    'id', 'name', 'logo', 'country', 'country_code', 'language', 'category',
    'description', 'stream_url', 'stream_type', 'is_featured', 'is_active',
    'sort_order', 'created_at', 'updated_at', 'last_checked'
  ],
  [CONFIG.SHEETS.COUNTRIES]: [
    'id', 'name', 'code', 'flag', 'is_active', 'sort_order'
  ],
  [CONFIG.SHEETS.CATEGORIES]: [
    'id', 'name', 'icon', 'description', 'is_active', 'sort_order'
  ],
  [CONFIG.SHEETS.LANGUAGES]: [
    'id', 'name', 'code', 'is_active', 'sort_order'
  ],
  [CONFIG.SHEETS.SETTINGS]: [
    'key', 'value', 'description'
  ],
  [CONFIG.SHEETS.ADMINS]: [
    'email', 'name', 'role', 'is_active', 'created_at'
  ],
  [CONFIG.SHEETS.ACTIVITY]: [
    'timestamp', 'action', 'user', 'channel_id', 'details'
  ],
  [CONFIG.SHEETS.USERS]: [
    'id', 'name', 'email', 'password_hash', 'is_active', 'reset_token', 'reset_expires', 'created_at'
  ]
};

/**
 * Internal helper: Retrieves the StreamFlow database spreadsheet.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  const spreadsheetId = getSpreadsheetId_();
  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (err) {
      console.warn(`Could not open spreadsheet by ID ${spreadsheetId}:`, err);
    }
  }

  // Fallback to active spreadsheet if bound
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  throw new Error('Spreadsheet not configured. Please run setupStreamFlow() or set SPREADSHEET_ID in Script Properties.');
}

/**
 * Internal helper: Retrieves a specific sheet by name, or creates it if missing during setup.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @param {string} sheetName
 * @return {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getDatabaseSheet(sheetName) {
  const ss = getSpreadsheet();
  return ss.getSheetByName(sheetName);
}

/**
 * Converts a 2D sheet array into an array of objects mapped by header names.
 * @param {Array<Array<*>>} dataValues
 * @return {Array<Object>}
 */
function mapSheetValuesToObjects(dataValues) {
  if (!dataValues || dataValues.length <= 1) return [];

  const headers = dataValues[0].map(h => String(h || '').trim());
  const results = [];

  for (let r = 1; r < dataValues.length; r++) {
    const row = dataValues[r];
    // Skip completely empty rows
    const hasData = row.some(cell => cell !== '' && cell !== null && cell !== undefined);
    if (!hasData) continue;

    const item = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (header) {
        item[header] = row[c] !== undefined ? row[c] : '';
      }
    }
    results.push(item);
  }

  return results;
}

/**
 * Initializes the entire Google Spreadsheet database structure idempotently.
 * Creates all required sheets, sets header columns, and freezes header rows without altering existing data.
 */
function initializeSpreadsheet() {
  let ss;
  const configuredId = getSpreadsheetId_();

  if (configuredId) {
    try {
      ss = SpreadsheetApp.openById(configuredId);
    } catch (e) {
      console.log('Specified SPREADSHEET_ID not accessible. Checking active spreadsheet.');
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
  }

  if (!ss) {
    // Create new spreadsheet in Drive root
    ss = SpreadsheetApp.create('StreamFlow Database');
    setScriptProperty_(CONFIG.PROPERTY_KEYS.SPREADSHEET_ID, ss.getId());
    console.log(`Created new StreamFlow Database: ${ss.getUrl()} (ID: ${ss.getId()})`);
  }

  const sheetKeys = Object.keys(DATABASE_SCHEMAS);
  sheetKeys.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const headers = DATABASE_SCHEMAS[sheetName];

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
      // Format headers
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F0F2F8');
    } else {
      // Sheet exists: verify header row exists
      const lastRow = sheet.getLastRow();
      if (lastRow === 0) {
        sheet.appendRow(headers);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F0F2F8');
      }
    }
  });

  // Remove default 'Sheet1' if empty and unused
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {}
  }

  return ss.getId();
}

/**
 * Clears script cache for a specific key or all keys.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @param {string} [key]
 */
function clearCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    if (key) {
      cache.remove(key);
    } else {
      cache.removeAll([
        CONFIG.CACHE.CHANNELS_KEY,
        CONFIG.CACHE.CATEGORIES_KEY,
        CONFIG.CACHE.COUNTRIES_KEY,
        CONFIG.CACHE.LANGUAGES_KEY,
        CONFIG.CACHE.SETTINGS_KEY
      ]);
    }
  } catch (err) {
    console.warn('Failed to invalidate cache:', err);
  }
}
