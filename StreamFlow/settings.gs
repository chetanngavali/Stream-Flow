/**
 * StreamFlow - Settings Service
 * Public configuration and administrative settings.
 */

/**
 * Retrieves public application settings with caching.
 * @return {Object}
 */
function getSettings() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CONFIG.CACHE.SETTINGS_KEY);
  if (cached) {
    const parsed = safeJsonParse(cached);
    if (parsed) return parsed;
  }

  const sheet = getDatabaseSheet(CONFIG.SHEETS.SETTINGS);
  const settings = { ...CONFIG.DEFAULT_SETTINGS };

  if (sheet) {
    const values = sheet.getDataRange().getValues();
    if (values.length > 1) {
      for (let i = 1; i < values.length; i++) {
        const key = String(values[i][0] || '').trim();
        const val = String(values[i][1] !== undefined ? values[i][1] : '').trim();
        if (key && settings.hasOwnProperty(key)) {
          settings[key] = val;
        }
      }
    }
  }

  try {
    cache.put(CONFIG.CACHE.SETTINGS_KEY, JSON.stringify(settings), CONFIG.CACHE.TTL_SECONDS);
  } catch (e) {}

  return settings;
}

/**
 * Updates application settings. Requires admin authorization.
 * Protected against race conditions and formula injection.
 * @param {Object} newSettings
 * @param {string} [token]
 * @return {boolean}
 */
function updateSettings(newSettings, token) {
  requireAdmin(token);
  if (!newSettings || typeof newSettings !== 'object') {
    throw new Error('Settings payload must be a valid object.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.SETTINGS);
    if (!sheet) throw new Error('Settings sheet not found.');

    const values = sheet.getDataRange().getValues();
    const existingMap = {};
    for (let i = 1; i < values.length; i++) {
      const key = String(values[i][0] || '').trim();
      if (key) {
        existingMap[key] = i + 1; // 1-indexed row
      }
    }

    // Mass assignment prevention: only iterate allowed keys
    const allowedKeys = Object.keys(CONFIG.DEFAULT_SETTINGS);
    allowedKeys.forEach(key => {
      if (newSettings[key] !== undefined) {
        const sanitizedVal = sanitizeString(newSettings[key], 500);
        const formulaSafeVal = sanitizeSheetCellValue(sanitizedVal);
        if (existingMap[key]) {
          sheet.getRange(existingMap[key], 2).setValue(formulaSafeVal);
        } else {
          sheet.appendRow([
            sanitizeSheetCellValue(key),
            formulaSafeVal,
            sanitizeSheetCellValue(`Application setting: ${key}`)
          ]);
        }
      }
    });

    clearCache(CONFIG.CACHE.SETTINGS_KEY);
    recordActivity('UPDATE_SETTINGS', '', 'Updated application settings');
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Initializes default settings in the Settings sheet idempotently.
 */
function initializeSettings() {
  const sheet = getDatabaseSheet(CONFIG.SHEETS.SETTINGS);
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    if (key) existingKeys.add(key);
  }

  const defaultKeys = Object.keys(CONFIG.DEFAULT_SETTINGS);
  defaultKeys.forEach(key => {
    if (!existingKeys.has(key)) {
      sheet.appendRow([
        sanitizeSheetCellValue(key),
        sanitizeSheetCellValue(CONFIG.DEFAULT_SETTINGS[key]),
        sanitizeSheetCellValue(`Application setting: ${key}`)
      ]);
    }
  });
}
