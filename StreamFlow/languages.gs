/**
 * StreamFlow - Languages Service
 * Querying and management for broadcast languages.
 */

/**
 * Retrieves all active languages with channel counts.
 * @param {boolean} includeInactive
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getLanguages(includeInactive = false, token) {
  if (includeInactive) {
    requireAdmin(token);
  } else {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CONFIG.CACHE.LANGUAGES_KEY);
    if (cached) {
      const parsed = safeJsonParse(cached);
      if (parsed) return parsed;
    }
  }

  const sheet = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);
  if (!sheet) return [];

  const rawValues = sheet.getDataRange().getValues();
  const rawLanguages = mapSheetValuesToObjects(rawValues);

  // Compute live channel count per language
  const activeChannels = getChannels(false);
  const langCountMap = {};
  activeChannels.forEach(ch => {
    const lang = (ch.language || '').trim();
    if (lang) {
      langCountMap[lang] = (langCountMap[lang] || 0) + 1;
    }
  });

  const languages = rawLanguages.map(l => ({
    id: String(l.id || ''),
    name: String(l.name || ''),
    code: String(l.code || '').toLowerCase(),
    is_active: String(l.is_active).toLowerCase() === 'true',
    sort_order: Number(l.sort_order) || 0,
    channel_count: langCountMap[l.name] || 0
  }));

  if (includeInactive) {
    return languages;
  }

  const publicLanguages = languages
    .filter(l => l.is_active)
    .sort((a, b) => b.channel_count - a.channel_count || a.name.localeCompare(b.name));

  try {
    const json = JSON.stringify(publicLanguages);
    if (json.length < 95000) {
      CacheService.getScriptCache().put(CONFIG.CACHE.LANGUAGES_KEY, json, CONFIG.CACHE.TTL_SECONDS);
    }
  } catch (e) {}

  return publicLanguages;
}

/**
 * Adds a new language record. Requires admin authorization.
 * @param {Object} data
 * @param {string} [token]
 * @return {Object}
 */
function addLanguage(data, token) {
  requireAdmin(token);
  if (!data || !data.name) throw new Error('Language name is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);
    const newId = generateId('lng_');
    const name = sanitizeString(data.name, 60);
    const code = sanitizeString(data.code || '', 10).toLowerCase();
    const isActive = data.is_active !== false;
    const sortOrder = Number(data.sort_order) || 0;

    sheet.appendRow([
      newId,
      sanitizeSheetCellValue(name),
      sanitizeSheetCellValue(code),
      isActive,
      sortOrder
    ]);
    clearCache(CONFIG.CACHE.LANGUAGES_KEY);
    recordActivity('ADD_LANGUAGE', newId, `Added language: ${name}`);

    return { id: newId, name, code, is_active: isActive, sort_order: sortOrder };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates a language record. Requires admin authorization.
 * @param {string} id
 * @param {Object} data
 * @param {string} [token]
 * @return {boolean}
 */
function updateLanguage(id, data, token) {
  requireAdmin(token);
  if (!id || !data || !data.name) throw new Error('Language ID and name are required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);
    const values = sheet.getDataRange().getValues();
    const idCol = values[0].indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        const name = sanitizeString(data.name, 60);
        const code = sanitizeString(data.code || '', 10).toLowerCase();
        const isActive = data.is_active !== false;
        const sortOrder = Number(data.sort_order) || 0;

        sheet.getRange(i + 1, 1, 1, 5).setValues([[
          id,
          sanitizeSheetCellValue(name),
          sanitizeSheetCellValue(code),
          isActive,
          sortOrder
        ]]);
        clearCache(CONFIG.CACHE.LANGUAGES_KEY);
        recordActivity('UPDATE_LANGUAGE', id, `Updated language: ${name}`);
        return true;
      }
    }

    throw new Error(`Language ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a language record. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean}
 */
function deleteLanguage(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Language ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);
    const values = sheet.getDataRange().getValues();
    const idCol = values[0].indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        clearCache(CONFIG.CACHE.LANGUAGES_KEY);
        recordActivity('DELETE_LANGUAGE', id, 'Deleted language');
        return true;
      }
    }

    throw new Error(`Language ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}
