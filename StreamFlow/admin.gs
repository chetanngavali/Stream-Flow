/**
 * StreamFlow - Administration Service
 * Dashboard metrics, M3U playlist parsing & import, admin user management, and activity logs.
 */

/**
 * Aggregates all administrative data in a single high-performance payload.
 * Requires admin authorization.
 * @param {string} [token]
 * @return {Object}
 */
function getAdminData(token) {
  requireAdmin(token);

  const channels = getChannels(true, token); // include inactive
  const categories = getCategories(true, token);
  const countries = getCountries(true, token);
  const languages = getLanguages(true, token);
  const settings = getSettings();
  const stats = getDashboardStats(token);
  const admins = getAdmins(token);
  const activity = getActivityLog(30, token);

  return {
    channels,
    categories,
    countries,
    languages,
    settings,
    stats,
    admins,
    activity,
    userEmail: getCurrentUserEmail(token)
  };
}

/**
 * Computes exact, non-mocked dashboard statistics from the database.
 * Requires admin authorization.
 * @param {string} [token]
 * @return {Object}
 */
function getDashboardStats(token) {
  requireAdmin(token);

  const sheetChannels = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
  const sheetCountries = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
  const sheetCategories = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
  const sheetLanguages = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);

  const channelsData = sheetChannels ? sheetChannels.getDataRange().getValues() : [];
  const channels = mapSheetValuesToObjects(channelsData);

  let activeChannels = 0;
  let featuredChannels = 0;

  channels.forEach(ch => {
    if (String(ch.is_active).toLowerCase() === 'true') activeChannels++;
    if (String(ch.is_featured).toLowerCase() === 'true') featuredChannels++;
  });

  const totalCountries = sheetCountries ? Math.max(0, sheetCountries.getLastRow() - 1) : 0;
  const totalCategories = sheetCategories ? Math.max(0, sheetCategories.getLastRow() - 1) : 0;
  const totalLanguages = sheetLanguages ? Math.max(0, sheetLanguages.getLastRow() - 1) : 0;

  return {
    total_channels: channels.length,
    active_channels: activeChannels,
    featured_channels: featuredChannels,
    total_countries: totalCountries,
    total_categories: totalCategories,
    total_languages: totalLanguages
  };
}

/**
 * Retrieves the most recent activity log entries.
 * Requires admin authorization.
 * @param {number} limit
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getActivityLog(limit = 50, token) {
  requireAdmin(token);
  const sheet = getDatabaseSheet(CONFIG.SHEETS.ACTIVITY);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const items = mapSheetValuesToObjects(values);
  // Return reversed to show latest first
  return items.slice(-limit).reverse();
}

/**
 * Retrieves the authorized administrators list.
 * Requires admin authorization.
 * @param {string} [token]
 * @return {Array<Object>}
 */
function getAdmins(token) {
  requireAdmin(token);
  const sheet = getDatabaseSheet(CONFIG.SHEETS.ADMINS);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  return mapSheetValuesToObjects(values);
}

/**
 * Adds a new administrator to the Admins sheet.
 * Requires admin authorization.
 * @param {Object} data
 * @param {string} [token]
 * @return {boolean}
 */
function addAdmin(data, token) {
  requireAdmin(token);
  if (!data || !data.email) throw new Error('Admin email is required.');

  const email = sanitizeString(data.email, 120).toLowerCase();
  const name = sanitizeString(data.name || email.split('@')[0], 100);
  const role = sanitizeString(data.role || 'Admin', 40);

  const sheet = getDatabaseSheet(CONFIG.SHEETS.ADMINS);
  const values = sheet.getDataRange().getValues();

  // Check duplicate
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) {
      throw new Error(`Administrator with email ${email} already exists.`);
    }
  }

  sheet.appendRow([
    sanitizeSheetCellValue(email),
    sanitizeSheetCellValue(name),
    sanitizeSheetCellValue(role),
    true,
    getTimestamp()
  ]);
  recordActivity('ADD_ADMIN', '', `Added administrator: ${email}`);
  return true;
}

/**
 * Downloads an M3U playlist from an authorized remote URL and parses channel metadata.
 * Strictly restricted to administrators and defended against SSRF.
 * @param {string} url
 * @param {string} [token]
 * @return {Object}
 */
function fetchAndParseM3UUrl(url, token) {
  requireAdmin(token);
  // SSRF Protection
  const validatedUrl = validateFetchUrl(url);

  try {
    const response = UrlFetchApp.fetch(validatedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (StreamFlow Playlist Ingest 1.0)' },
      muteHttpExceptions: true,
      followRedirects: true
    });

    const statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Remote server responded with HTTP status ${statusCode}`);
    }

    const content = response.getContentText();
    if (!content || !content.includes('#EXTINF')) {
      throw new Error('The URL did not return a valid M3U playlist (no #EXTINF tags found).');
    }

    recordActivity('FETCH_M3U_URL', '', `Fetched M3U playlist from: ${validatedUrl.substring(0, 100)}`);
    return parseM3U(content, token);
  } catch (err) {
    console.error('M3U URL fetch failed:', err);
    throw new Error(`Failed to load M3U URL: ${err.message}`);
  }
}

/**
 * Parses raw M3U playlist text and performs duplicate detection against existing channels.
 * Returns parsed preview statistics and candidate records.
 * Requires admin authorization.
 * @param {string} m3uContent
 * @param {string} [token]
 * @return {Object}
 */
function parseM3U(m3uContent, token) {
  requireAdmin(token);
  if (!m3uContent || typeof m3uContent !== 'string') {
    throw new Error('M3U content must be a non-empty text string.');
  }

  // Cap content length to 20MB in memory to prevent Apps Script memory exhaustion
  if (m3uContent.length > 20 * 1024 * 1024) {
    throw new Error('M3U content exceeds the 20MB processing limit. Please use direct URL import.');
  }

  const lines = m3uContent.split(/\r?\n/);
  const existingChannels = getChannels(true, token);

  // Index existing channels for duplicate matching
  const existingUrls = new Set(existingChannels.map(c => (c.stream_url || '').toLowerCase().trim()));
  const existingNames = new Set(existingChannels.map(c => normalizeForComparison(c.name)));

  const parsedItems = [];
  let newCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  let currentExtInf = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentExtInf = line;
    } else if (!line.startsWith('#') && currentExtInf) {
      const streamUrl = line;
      
      // Parse #EXTINF attributes
      const extInf = currentExtInf;
      currentExtInf = null; // reset

      // URL scheme validation
      if (!isValidStreamUrl(streamUrl)) {
        invalidCount++;
        continue;
      }

      // Attribute extraction via regex
      const tvgNameMatch = extInf.match(/tvg-name="([^"]*)"/i);
      const tvgLogoMatch = extInf.match(/tvg-logo="([^"]*)"/i);
      const groupTitleMatch = extInf.match(/group-title="([^"]*)"/i);
      const tvgCountryMatch = extInf.match(/tvg-country="([^"]*)"/i);
      const tvgLanguageMatch = extInf.match(/tvg-language="([^"]*)"/i);

      // Channel title after last comma
      const commaIndex = extInf.lastIndexOf(',');
      const rawTitle = commaIndex !== -1 ? extInf.substring(commaIndex + 1).trim() : '';

      const channelName = sanitizeString((tvgNameMatch ? tvgNameMatch[1] : rawTitle) || 'Untitled Stream', 120);
      const logo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
      const category = sanitizeString(groupTitleMatch ? groupTitleMatch[1] : 'General', 60);
      const country = sanitizeString(tvgCountryMatch ? tvgCountryMatch[1] : 'Global', 60);
      const language = sanitizeString(tvgLanguageMatch ? tvgLanguageMatch[1] : 'English', 60);

      // Duplicate Check
      const normName = normalizeForComparison(channelName);
      const isDuplicate = existingUrls.has(streamUrl.toLowerCase()) || existingNames.has(normName);

      if (isDuplicate) {
        duplicateCount++;
      } else {
        newCount++;
      }

      parsedItems.push({
        name: channelName,
        logo: isValidImageUrl(logo) ? logo : '',
        category: category || 'General',
        country: country || 'Global',
        country_code: '',
        language: language || 'English',
        description: 'Imported via M3U playlist',
        stream_url: streamUrl,
        stream_type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
        is_featured: false,
        is_active: true,
        is_duplicate: isDuplicate
      });
    }
  }

  return {
    total_detected: parsedItems.length,
    new_count: newCount,
    duplicate_count: duplicateCount,
    invalid_count: invalidCount,
    items: parsedItems.slice(0, 200) // Preview capped to 200 items for UI performance
  };
}

/**
 * Commits an array of validated channel items from M3U import in high-speed batches.
 * Requires admin authorization, enforces formula sanitization, and uses LockService.
 * @param {Array<Object>} channelsToImport
 * @param {string} [token]
 * @return {number} Count of channels imported
 */
function commitM3UImport(channelsToImport, token) {
  requireAdmin(token);
  if (!Array.isArray(channelsToImport) || channelsToImport.length === 0) {
    throw new Error('No valid channel list provided for import.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error('Database is currently locked by another operation. Please try again.');
  }

  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    if (!sheet) throw new Error('Channels sheet not found.');

    const now = getTimestamp();
    const rows = [];

    channelsToImport.forEach(item => {
      // Validate minimal requirements
      if (item.name && isValidStreamUrl(item.stream_url)) {
        const newId = generateId('ch_');
        rows.push([
          newId,
          sanitizeSheetCellValue(sanitizeString(item.name, 120)),
          sanitizeSheetCellValue(sanitizeString(item.logo || '', 500)),
          sanitizeSheetCellValue(sanitizeString(item.country || 'Global', 60)),
          sanitizeSheetCellValue(sanitizeString(item.country_code || '', 10).toUpperCase()),
          sanitizeSheetCellValue(sanitizeString(item.language || 'English', 60)),
          sanitizeSheetCellValue(sanitizeString(item.category || 'General', 60)),
          sanitizeSheetCellValue(sanitizeString(item.description || 'Imported via M3U', 500)),
          sanitizeSheetCellValue(item.stream_url.trim()),
          sanitizeSheetCellValue(item.stream_type || 'hls'),
          false,
          true,
          0,
          now,
          now,
          now
        ]);
      }
    });

    if (rows.length > 0) {
      const CHUNK_SIZE = 2500;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, chunk.length, chunk[0].length).setValues(chunk);
      }
      clearCache(CONFIG.CACHE.CHANNELS_KEY);
      recordActivity('M3U_IMPORT', '', `Successfully imported ${rows.length} channels.`);
    }

    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Directly imports all valid channels from a remote M3U URL into Google Sheets in fast batches.
 * Defended against SSRF, formula injection, and concurrent collisions.
 * @param {string} url
 * @param {string} [token]
 * @return {Object} { total: number, imported: number, duplicates: number, invalid: number }
 */
function importM3UFromUrlDirectly(url, token) {
  requireAdmin(token);
  // SSRF Defense
  const validatedUrl = validateFetchUrl(url);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error('Database is currently locked by another operation. Please try again.');
  }

  try {
    const response = UrlFetchApp.fetch(validatedUrl, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (StreamFlow IPTV Importer)' }
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(`Failed to fetch M3U playlist (HTTP status ${response.getResponseCode()}).`);
    }

    const content = response.getContentText();
    const lines = content.split(/\r?\n/);

    const sheet = getDatabaseSheet(CONFIG.SHEETS.CHANNELS);
    if (!sheet) throw new Error('Channels sheet not found.');

    // Load existing channels for duplicate filtering
    const existingChannels = getChannels(true, token);
    const existingUrls = new Set(existingChannels.map(c => (c.stream_url || '').toLowerCase().trim()));
    const existingNames = new Set(existingChannels.map(c => normalizeForComparison(c.name)));

    const now = getTimestamp();
    const rowsToInsert = [];
    let totalDetected = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    let currentExtInf = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentExtInf = line;
      } else if (!line.startsWith('#') && currentExtInf) {
        const streamUrl = line;
        const extInf = currentExtInf;
        currentExtInf = null;
        totalDetected++;

        if (!isValidStreamUrl(streamUrl)) {
          invalidCount++;
          continue;
        }

        const tvgNameMatch = extInf.match(/tvg-name="([^"]*)"/i);
        const tvgLogoMatch = extInf.match(/tvg-logo="([^"]*)"/i);
        const groupTitleMatch = extInf.match(/group-title="([^"]*)"/i);
        const tvgCountryMatch = extInf.match(/tvg-country="([^"]*)"/i);
        const tvgLanguageMatch = extInf.match(/tvg-language="([^"]*)"/i);

        const commaIndex = extInf.lastIndexOf(',');
        const rawTitle = commaIndex !== -1 ? extInf.substring(commaIndex + 1).trim() : '';

        const channelName = sanitizeString((tvgNameMatch ? tvgNameMatch[1] : rawTitle) || 'Untitled Stream', 120);
        const logo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
        const category = sanitizeString(groupTitleMatch ? groupTitleMatch[1] : 'General', 60);
        const country = sanitizeString(tvgCountryMatch ? tvgCountryMatch[1] : 'Global', 60);
        const language = sanitizeString(tvgLanguageMatch ? tvgLanguageMatch[1] : 'English', 60);

        const normName = normalizeForComparison(channelName);
        if (existingUrls.has(streamUrl.toLowerCase()) || existingNames.has(normName)) {
          duplicateCount++;
          continue;
        }

        existingUrls.add(streamUrl.toLowerCase());
        existingNames.add(normName);

        const newId = generateId('ch_');
        // Formula injection protection on every inserted cell
        rowsToInsert.push([
          newId,
          sanitizeSheetCellValue(channelName),
          sanitizeSheetCellValue(isValidImageUrl(logo) ? logo : ''),
          sanitizeSheetCellValue(country || 'Global'),
          '',
          sanitizeSheetCellValue(language || 'English'),
          sanitizeSheetCellValue(category || 'General'),
          sanitizeSheetCellValue('Imported via M3U playlist'),
          sanitizeSheetCellValue(streamUrl.trim()),
          sanitizeSheetCellValue(streamUrl.includes('.m3u8') ? 'hls' : 'mp4'),
          false,
          true,
          0,
          now,
          now,
          now
        ]);
      }
    }

    // Insert in chunks of 2,500 rows for stability
    const CHUNK_SIZE = 2500;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, chunk.length, chunk[0].length).setValues(chunk);
    }

    clearCache(CONFIG.CACHE.CHANNELS_KEY);
    recordActivity('M3U_DIRECT_IMPORT', '', `Direct imported ${rowsToInsert.length} channels from M3U URL.`);

    return {
      total: totalDetected,
      imported: rowsToInsert.length,
      duplicates: duplicateCount,
      invalid: invalidCount
    };
  } finally {
    lock.releaseLock();
  }
}
