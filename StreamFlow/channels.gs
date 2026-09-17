/**
 * StreamFlow - Channels Service
 * High-performance channel querying, caching, filtering, and administration.
 */

/**
 * Retrieves all active channels for public display with caching.
 * If called by an admin requesting all, returns all channels including inactive.
 * @param {boolean} includeInactive
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getChannels(includeInactive = false, token) {
  // If requesting inactive channels, require admin privileges
  if (includeInactive) {
    requireAdmin(token);
  } else {
    // Check Cache for public active channels
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CONFIG.CACHE.CHANNELS_KEY);
    if (cached) {
      const parsed = safeJsonParse(cached);
      if (parsed) return parsed;
    }
  }

  const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
  if (!sheet) return [];

  const rawValues = sheet.getDataRange().getValues();
  const allChannels = mapSheetValuesToObjects(rawValues);

  // Normalize booleans and numbers
  const formattedChannels = allChannels.map(ch => ({
    id: String(ch.id || ''),
    name: String(ch.name || ''),
    logo: String(ch.logo || ''),
    country: String(ch.country || ''),
    country_code: String(ch.country_code || ''),
    language: String(ch.language || ''),
    category: String(ch.category || ''),
    description: String(ch.description || ''),
    stream_url: String(ch.stream_url || ''),
    stream_type: String(ch.stream_type || 'hls'),
    is_featured: String(ch.is_featured).toLowerCase() === 'true',
    is_active: String(ch.is_active).toLowerCase() === 'true',
    sort_order: Number(ch.sort_order) || 0,
    created_at: String(ch.created_at || ''),
    updated_at: String(ch.updated_at || ''),
    last_checked: String(ch.last_checked || '')
  }));

  if (includeInactive) {
    return formattedChannels;
  }

  const publicChannels = formattedChannels
    .filter(ch => ch.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  // Store in cache (capped to 100KB chunks if necessary)
  try {
    const jsonStr = JSON.stringify(publicChannels);
    if (jsonStr.length < 95000) {
      const cache = CacheService.getScriptCache();
      cache.put(CONFIG.CACHE.CHANNELS_KEY, jsonStr, CONFIG.CACHE.TTL_SECONDS);
    }
  } catch (e) {
    console.warn('Could not cache public channels:', e);
  }

  return publicChannels;
}

/**
 * Retrieves a single channel by ID.
 * @param {string} id
 * @param {string} [token]
 * @return {Object|null}
 */
function getChannelById(id, token) {
  if (!id) return null;
  const cleanId = String(id).trim();

  // Search across active channels
  const channels = getChannels(false);
  const match = channels.find(c => c.id === cleanId);
  if (match) return match;

  // If not found in active, check if user is admin viewing inactive
  if (isAdmin(token)) {
    const all = getChannels(true, token);
    return all.find(c => c.id === cleanId) || null;
  }

  return null;
}

/**
 * Searches channels by name, country, category, or language.
 * @param {string} query
 * @return {Array<Object>}
 */
function searchChannels(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase().trim();
  if (q.length === 0) return [];

  // Protect against regex or oversized search queries
  if (q.length > 100) return [];

  const channels = getChannels(false);
  return channels.filter(ch => 
    ch.name.toLowerCase().includes(q) ||
    ch.country.toLowerCase().includes(q) ||
    ch.category.toLowerCase().includes(q) ||
    ch.language.toLowerCase().includes(q) ||
    (ch.description && ch.description.toLowerCase().includes(q))
  );
}

/**
 * Retrieves featured channels for the home page carousel/hero.
 * @return {Array<Object>}
 */
function getFeaturedChannels() {
  const channels = getChannels(false);
  return channels.filter(ch => ch.is_featured);
}

/**
 * Retrieves channels filtered by country.
 * @param {string} country
 * @return {Array<Object>}
 */
function getChannelsByCountry(country) {
  if (!country) return [];
  const target = country.toLowerCase().trim();
  const channels = getChannels(false);
  return channels.filter(ch => ch.country.toLowerCase() === target || ch.country_code.toLowerCase() === target);
}

/**
 * Retrieves channels filtered by category.
 * @param {string} category
 * @return {Array<Object>}
 */
function getChannelsByCategory(category) {
  if (!category) return [];
  const target = category.toLowerCase().trim();
  const channels = getChannels(false);
  return channels.filter(ch => ch.category.toLowerCase() === target);
}

/**
 * Retrieves channels filtered by language.
 * @param {string} language
 * @return {Array<Object>}
 */
function getChannelsByLanguage(language) {
  if (!language) return [];
  const target = language.toLowerCase().trim();
  const channels = getChannels(false);
  return channels.filter(ch => ch.language.toLowerCase() === target);
}

/**
 * Adds a new channel to the database. Requires admin authorization.
 * Protected against race conditions and formula injection.
 * @param {Object} data
 * @param {string} [token]
 * @return {Object} The added channel
 */
function addChannel(data, token) {
  requireAdmin(token);
  validateChannelPayload(data);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is currently busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    if (!sheet) throw new Error('Channels sheet not found.');

    const newId = generateId('ch_');
    const now = getTimestamp();

    const newRow = [
      newId,
      sanitizeSheetCellValue(data.name),
      sanitizeSheetCellValue(data.logo || ''),
      sanitizeSheetCellValue(data.country),
      sanitizeSheetCellValue(data.country_code || ''),
      sanitizeSheetCellValue(data.language),
      sanitizeSheetCellValue(data.category),
      sanitizeSheetCellValue(data.description || ''),
      sanitizeSheetCellValue(data.stream_url),
      sanitizeSheetCellValue(data.stream_type || 'hls'),
      data.is_featured === true,
      data.is_active !== false,
      Number(data.sort_order) || 0,
      now,
      now,
      now
    ];

    sheet.appendRow(newRow);
    clearCache(CONFIG.CACHE.CHANNELS_KEY);
    recordActivity('ADD_CHANNEL', newId, `Added channel: ${data.name}`);

    return { id: newId, ...data, created_at: now, updated_at: now };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates an existing channel. Requires admin authorization.
 * Protected against race conditions and formula injection.
 * @param {string} id
 * @param {Object} data
 * @param {string} [token]
 * @return {boolean}
 */
function updateChannel(id, data, token) {
  requireAdmin(token);
  if (!id) throw new Error('Channel ID is required.');
  validateChannelPayload(data);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is currently busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    if (!sheet) throw new Error('Channels sheet not found.');

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIndex = headers.indexOf('id');
    if (idIndex === -1) throw new Error('Malformed channels schema.');

    let targetRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIndex]) === String(id)) {
        targetRowIndex = i + 1; // 1-indexed for Sheet range
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new Error(`Channel with ID ${id} not found.`);
    }

    const now = getTimestamp();
    const rowUpdates = [
      id,
      sanitizeSheetCellValue(data.name),
      sanitizeSheetCellValue(data.logo || ''),
      sanitizeSheetCellValue(data.country),
      sanitizeSheetCellValue(data.country_code || ''),
      sanitizeSheetCellValue(data.language),
      sanitizeSheetCellValue(data.category),
      sanitizeSheetCellValue(data.description || ''),
      sanitizeSheetCellValue(data.stream_url),
      sanitizeSheetCellValue(data.stream_type || 'hls'),
      data.is_featured === true,
      data.is_active !== false,
      Number(data.sort_order) || 0,
      values[targetRowIndex - 1][headers.indexOf('created_at')] || now,
      now,
      now
    ];

    sheet.getRange(targetRowIndex, 1, 1, rowUpdates.length).setValues([rowUpdates]);
    clearCache(CONFIG.CACHE.CHANNELS_KEY);
    recordActivity('UPDATE_CHANNEL', id, `Updated channel: ${data.name}`);

    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes a channel from the database. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean}
 */
function deleteChannel(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Channel ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is currently busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    if (!sheet) throw new Error('Channels sheet not found.');

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIndex = headers.indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIndex]) === String(id)) {
        const channelName = values[i][headers.indexOf('name')] || id;
        sheet.deleteRow(i + 1);
        clearCache(CONFIG.CACHE.CHANNELS_KEY);
        recordActivity('DELETE_CHANNEL', id, `Deleted channel: ${channelName}`);
        return true;
      }
    }

    throw new Error(`Channel with ID ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Toggles a channel's active status. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean} New status
 */
function toggleChannelStatus(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Channel ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is currently busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idCol = headers.indexOf('id');
    const activeCol = headers.indexOf('is_active');
    const updatedCol = headers.indexOf('updated_at');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        const current = String(values[i][activeCol]).toLowerCase() === 'true';
        const next = !current;
        sheet.getRange(i + 1, activeCol + 1).setValue(next);
        if (updatedCol !== -1) {
          sheet.getRange(i + 1, updatedCol + 1).setValue(getTimestamp());
        }
        clearCache(CONFIG.CACHE.CHANNELS_KEY);
        recordActivity('TOGGLE_STATUS', id, `Changed is_active to ${next}`);
        return next;
      }
    }

    throw new Error(`Channel ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Toggles whether a channel is featured. Requires admin authorization.
 * @param {string} id
 * @param {string} [token]
 * @return {boolean} New featured status
 */
function toggleFeatured(id, token) {
  requireAdmin(token);
  if (!id) throw new Error('Channel ID is required.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Database is currently busy. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idCol = headers.indexOf('id');
    const featuredCol = headers.indexOf('is_featured');
    const updatedCol = headers.indexOf('updated_at');

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) {
        const current = String(values[i][featuredCol]).toLowerCase() === 'true';
        const next = !current;
        sheet.getRange(i + 1, featuredCol + 1).setValue(next);
        if (updatedCol !== -1) {
          sheet.getRange(i + 1, updatedCol + 1).setValue(getTimestamp());
        }
        clearCache(CONFIG.CACHE.CHANNELS_KEY);
        recordActivity('TOGGLE_FEATURED', id, `Changed is_featured to ${next}`);
        return next;
      }
    }

    throw new Error(`Channel ${id} not found.`);
  } finally {
    lock.releaseLock();
  }
}
