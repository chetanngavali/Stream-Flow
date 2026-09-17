/**
 * StreamFlow - Categories Service
 * Querying and management for channel categories.
 */

/**
 * Retrieves all categories with live channel counts.
 * @param {boolean} includeInactive
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getCategories(includeInactive = false, token) {
  if (includeInactive) {
    requireAdmin(token);
  } else {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CONFIG.CACHE.CATEGORIES_KEY);
    if (cached) {
      const parsed = safeJsonParse(cached);
      if (parsed) return parsed;
    }
  }

  const sheet = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
  if (!sheet) return [];

  const rawValues = sheet.getDataRange().getValues();
  const rawCategories = mapSheetValuesToObjects(rawValues);

  // Compute channel count per category dynamically from active channels
  const activeChannels = getChannels(false);
  const channelCountMap = {};
  activeChannels.forEach(ch => {
    const cat = (ch.category || 'Other').trim();
    channelCountMap[cat] = (channelCountMap[cat] || 0) + 1;
  });

  const categories = rawCategories.map(cat => ({
    id: String(cat.id || ''),
    name: String(cat.name || ''),
    icon: String(cat.icon || 'folder'),
    description: String(cat.description || ''),
    is_active: String(cat.is_active).toLowerCase() === 'true',
    sort_order: Number(cat.sort_order) || 0,
    channel_count: channelCountMap[cat.name] || 0
  }));

  if (includeInactive) {
    return categories;
  }

  const publicCategories = categories
    .filter(cat => cat.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  try {
    const json = JSON.stringify(publicCategories);
    if (json.length < 95000) {
      CacheService.getScriptCache().put(CONFIG.CACHE.CATEGORIES_KEY, json, CONFIG.CACHE.TTL_SECONDS);
    }
  } catch (e) {}

  return publicCategories;
}

/**
 * Adds a new category. Requires admin authorization.
 * @param {Object} data
 * @param {string} [token]
 * @return {Object}
 */
function addCategory(data, token) {
  requireAdmin(token);
  if (!data || !data.name || sanitizeString(data.name, 60).length === 0) {
    throw new Error('Category name is required.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
    const newId = generateId('cat_');
    const name = sanitizeString(data.name, 60);
    const icon = sanitizeString(data.icon || 'folder', 50);
    const desc = sanitizeString(data.description || '', 255);
    const isActive = data.is_active !== false;
    const sortOrder = Number(data.sort_order) || 0;

    sheet.appendRow([
      newId,
      sanitizeSheetCellValue(name),
      sanitizeSheetCellValue(icon),
      sanitizeSheetCellValue(desc),
      isActive,
      sortOrder
    ]);
    clearCache(CONFIG.CACHE.CATEGORIES_KEY);
    recordActivity('ADD_CATEGORY', newId, `Added category: ${name}`);

    return { id: newId, name, icon, description: desc, is_active: isActive, sort_order: sortOrder };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates a category. Requires admin authorization.
 * @param {string} id
 * @param {Object} data
 * @param {string} [token]
 * @return {boolean}
 */
function updateCategory(id, data, token) {
  requireAdmin(token);
  if (!id || !data || !data.name) throw new Error('Category ID and name are required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idCol = headers.indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        const name = sanitizeString(data.name, 60);
        const icon = sanitizeString(data.icon || 'folder', 50);
        const desc = sanitizeString(data.description || '', 255);
        const isActive = data.is_active !== false;
        const sortOrder = Number(data.sort_order) || 0;

        sheet.getRange(i + 1, 1, 1, 6).setValues([[
          id,
          sanitizeSheetCellValue(name),
          sanitizeSheetCellValue(icon),
          sanitizeSheetCellValue(desc),
          isActive,
          sortOrder
        ]]);
        clearCache(CONFIG.CACHE.CATEGORIES_KEY);
        recordActivity('UPDATE_CATEGORY', id, `Updated category: ${name}`);
        return true;
      }
    }

    throw new Error(`Category ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a category. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean}
 */
function deleteCategory(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Category ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
    const values = sheet.getDataRange().getValues();
    const idCol = values[0].indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        clearCache(CONFIG.CACHE.CATEGORIES_KEY);
        recordActivity('DELETE_CATEGORY', id, 'Deleted category');
        return true;
      }
    }

    throw new Error(`Category ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}
