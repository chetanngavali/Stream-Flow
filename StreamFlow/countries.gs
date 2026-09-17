/**
 * StreamFlow - Countries Service
 * Querying and management for countries.
 */

/**
 * Retrieves all active countries with channel counts.
 * @param {boolean} includeInactive
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getCountries(includeInactive = false, token) {
  if (includeInactive) {
    requireAdmin(token);
  } else {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CONFIG.CACHE.COUNTRIES_KEY);
    if (cached) {
      const parsed = safeJsonParse(cached);
      if (parsed) return parsed;
    }
  }

  const sheet = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
  if (!sheet) return [];

  const rawValues = sheet.getDataRange().getValues();
  const rawCountries = mapSheetValuesToObjects(rawValues);

  // Compute live channel count per country dynamically from active channels
  const activeChannels = getChannels(false);
  const countryCountMap = {};
  activeChannels.forEach(ch => {
    const cnt = (ch.country || '').trim();
    if (cnt) {
      countryCountMap[cnt] = (countryCountMap[cnt] || 0) + 1;
    }
  });

  const countries = rawCountries.map(c => ({
    id: String(c.id || ''),
    name: String(c.name || ''),
    code: String(c.code || '').toUpperCase(),
    flag: String(c.flag || '🌐'),
    is_active: String(c.is_active).toLowerCase() === 'true',
    sort_order: Number(c.sort_order) || 0,
    channel_count: countryCountMap[c.name] || 0
  }));

  if (includeInactive) {
    return countries;
  }

  const publicCountries = countries
    .filter(c => c.is_active)
    .sort((a, b) => b.channel_count - a.channel_count || a.name.localeCompare(b.name));

  try {
    const json = JSON.stringify(publicCountries);
    if (json.length < 95000) {
      CacheService.getScriptCache().put(CONFIG.CACHE.COUNTRIES_KEY, json, CONFIG.CACHE.TTL_SECONDS);
    }
  } catch (e) {}

  return publicCountries;
}

/**
 * Adds a new country record. Requires admin authorization.
 * @param {Object} data
 * @param {string} [token]
 * @return {Object}
 */
function addCountry(data, token) {
  requireAdmin(token);
  if (!data || !data.name) throw new Error('Country name is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
    const newId = generateId('cnt_');
    const name = sanitizeString(data.name, 60);
    const code = sanitizeString(data.code || '', 10).toUpperCase();
    const flag = sanitizeString(data.flag || '🌐', 10);
    const isActive = data.is_active !== false;
    const sortOrder = Number(data.sort_order) || 0;

    sheet.appendRow([
      newId,
      sanitizeSheetCellValue(name),
      sanitizeSheetCellValue(code),
      sanitizeSheetCellValue(flag),
      isActive,
      sortOrder
    ]);
    clearCache(CONFIG.CACHE.COUNTRIES_KEY);
    recordActivity('ADD_COUNTRY', newId, `Added country: ${name}`);

    return { id: newId, name, code, flag, is_active: isActive, sort_order: sortOrder };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates a country record. Requires admin authorization.
 * @param {string} id
 * @param {Object} data
 * @param {string} [token]
 * @return {boolean}
 */
function updateCountry(id, data, token) {
  requireAdmin(token);
  if (!id || !data || !data.name) throw new Error('Country ID and name are required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
    const values = sheet.getDataRange().getValues();
    const idCol = values[0].indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        const name = sanitizeString(data.name, 60);
        const code = sanitizeString(data.code || '', 10).toUpperCase();
        const flag = sanitizeString(data.flag || '🌐', 10);
        const isActive = data.is_active !== false;
        const sortOrder = Number(data.sort_order) || 0;

        sheet.getRange(i + 1, 1, 1, 6).setValues([[
          id,
          sanitizeSheetCellValue(name),
          sanitizeSheetCellValue(code),
          sanitizeSheetCellValue(flag),
          isActive,
          sortOrder
        ]]);
        clearCache(CONFIG.CACHE.COUNTRIES_KEY);
        recordActivity('UPDATE_COUNTRY', id, `Updated country: ${name}`);
        return true;
      }
    }

    throw new Error(`Country ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a country record. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean}
 */
function deleteCountry(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Country ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
    const values = sheet.getDataRange().getValues();
    const idCol = values[0].indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        clearCache(CONFIG.CACHE.COUNTRIES_KEY);
        recordActivity('DELETE_COUNTRY', id, 'Deleted country');
        return true;
      }
    }

    throw new Error(`Country ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}
