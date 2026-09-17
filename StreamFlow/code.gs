/**
 * StreamFlow — Web Application Main Controller
 * Handles HTTP requests, HTML template rendering, and system initialization.
 */

/**
 * Main HTTP GET handler for Google Apps Script Web App.
 * Serves the single-page application with responsive viewport and title.
 * @param {Object} e
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  // Automatically record current web app URL if accessible
  try {
    const currentUrl = ScriptApp.getService().getUrl();
    if (currentUrl) setScriptProperty_('WEB_APP_URL', currentUrl);
  } catch (err) {}

  const template = HtmlService.createTemplateFromFile('Index');
  
  // Sanitize initial route query params to prevent control characters or oversized strings
  template.initialParams = {
    view: (e && e.parameter && e.parameter.view) ? sanitizeString(String(e.parameter.view), 30) : 'home',
    id: (e && e.parameter && e.parameter.id) ? sanitizeString(String(e.parameter.id), 80) : '',
    q: (e && e.parameter && e.parameter.q) ? sanitizeString(String(e.parameter.q), 100) : '',
    country: (e && e.parameter && e.parameter.country) ? sanitizeString(String(e.parameter.country), 60) : '',
    category: (e && e.parameter && e.parameter.category) ? sanitizeString(String(e.parameter.category), 60) : '',
    lang: (e && e.parameter && e.parameter.lang) ? sanitizeString(String(e.parameter.lang), 60) : '',
    token: (e && e.parameter && e.parameter.token) ? sanitizeString(String(e.parameter.token), 200) : ''
  };

  return template.evaluate()
    .setTitle('StreamFlow — Live TV')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Helper function for server-side HTML templating.
 * Allows modular inclusion of partial HTML files (Styles, Scripts, Components, etc.).
 * @param {string} filename
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Master Setup Function for StreamFlow.
 * Idempotently creates Drive folders, Spreadsheet database sheets, default settings,
 * and registers the current Google account as the initial administrator.
 * Safe to run multiple times without duplicating data or overwriting existing channels.
 * If already configured, requires administrative authorization.
 * @param {string} [token]
 * @return {Object} Status report
 */
function setupStreamFlow(token) {
  // If spreadsheet ID is already set, require admin authorization to rerun setup
  const existingSsId = getSpreadsheetId_();
  if (existingSsId) {
    requireAdmin(token);
  }

  const log = [];
  log.push('[Setup] Starting StreamFlow setup...');

  // 1. Initialize Drive Folders
  try {
    const driveFolders = initializeDriveFolders();
    log.push(`[Setup] Google Drive folders verified. Root Folder ID: ${driveFolders.rootId}`);
  } catch (err) {
    log.push(`[Setup Error] Drive initialization warning: ${err.message}`);
  }

  // 2. Initialize Spreadsheet Database
  let ssId;
  try {
    ssId = initializeSpreadsheet();
    log.push(`[Setup] Spreadsheet database verified. ID: ${ssId}`);
  } catch (err) {
    log.push(`[Setup Error] Spreadsheet initialization failed: ${err.message}`);
    throw err;
  }

  // 3. Initialize Default Settings
  try {
    initializeSettings();
    log.push('[Setup] Default settings verified.');
  } catch (err) {
    log.push(`[Setup Error] Settings initialization: ${err.message}`);
  }

  // 4. Verify & Authorize Email Service
  try {
    const quota = MailApp.getRemainingDailyQuota();
    log.push(`[Setup] MailApp service verified. Remaining email quota: ${quota}`);
  } catch (err) {
    log.push(`[Setup Note] MailApp authorization check: ${err.message}`);
  }

  // 5. Initialize Current User as Administrator
  try {
    const activeEmail = getCurrentUserEmail(token);
    if (activeEmail) {
      const existingAdmins = getAdminEmails_();
      if (!existingAdmins.includes(activeEmail)) {
        existingAdmins.push(activeEmail);
        setScriptProperty_(CONFIG.PROPERTY_KEYS.ADMIN_EMAILS, existingAdmins.join(','));
        log.push(`[Setup] Added ${activeEmail} to Script Properties ADMIN_EMAILS.`);
      }

      // Verify Admins sheet record
      const adminsSheet = getDatabaseSheet(CONFIG.SHEETS.ADMINS);
      if (adminsSheet) {
        const values = adminsSheet.getDataRange().getValues();
        let existsInSheet = false;
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]).toLowerCase() === activeEmail) {
            existsInSheet = true;
            break;
          }
        }
        if (!existsInSheet) {
          adminsSheet.appendRow([
            sanitizeSheetCellValue(activeEmail),
            'Super Admin',
            'Super Admin',
            true,
            getTimestamp()
          ]);
          log.push(`[Setup] Added ${activeEmail} to Admins sheet.`);
        }
      }
    } else {
      log.push('[Setup Notice] Could not detect active user email automatically. Set ADMIN_EMAILS in Script Properties.');
    }
  } catch (err) {
    log.push(`[Setup Error] Admin setup warning: ${err.message}`);
  }

  // 6. Populate standard countries and categories if empty
  try {
    populateStarterDataIfEmpty();
    log.push('[Setup] Verified reference taxonomy (countries/categories/languages).');
  } catch (e) {
    log.push(`[Setup Notice] Starter taxonomy verification: ${e.message}`);
  }

  // 7. Record Setup Activity
  recordActivity('SYSTEM_SETUP', '', 'Executed setupStreamFlow() initialization');
  log.push('[Setup] StreamFlow initialization complete and ready for deployment!');

  console.log(log.join('\n'));
  return { success: true, log };
}

/**
 * Populates starter reference categories, countries, and languages if database sheets are completely empty.
 * Never inserts mock or fake channels. Only standard taxonomy.
 */
function populateStarterDataIfEmpty() {
  const catSheet = getDatabaseSheet(CONFIG.SHEETS.CATEGORIES);
  if (catSheet && catSheet.getLastRow() <= 1) {
    const starterCategories = [
      ['cat_news', 'News', 'newspaper', '24/7 Global & Regional News', true, 1],
      ['cat_sports', 'Sports', 'trophy', 'Live Sports, Matches & Highlights', true, 2],
      ['cat_ent', 'Entertainment', 'film', 'Movies, Series & General Shows', true, 3],
      ['cat_music', 'Music', 'music', 'Concerts, Music Videos & Radio', true, 4],
      ['cat_doc', 'Documentary', 'globe', 'Nature, Science & History', true, 5],
      ['cat_kids', 'Kids', 'smile', 'Children programming & Cartoons', true, 6]
    ];
    catSheet.getRange(2, 1, starterCategories.length, 6).setValues(starterCategories);
  }

  const cntSheet = getDatabaseSheet(CONFIG.SHEETS.COUNTRIES);
  if (cntSheet && cntSheet.getLastRow() <= 1) {
    const starterCountries = [
      ['cnt_us', 'United States', 'US', '🇺🇸', true, 1],
      ['cnt_uk', 'United Kingdom', 'GB', '🇬🇧', true, 2],
      ['cnt_ca', 'Canada', 'CA', '🇨🇦', true, 3],
      ['cnt_in', 'India', 'IN', '🇮🇳', true, 4],
      ['cnt_au', 'Australia', 'AU', '🇦🇺', true, 5],
      ['cnt_de', 'Germany', 'DE', '🇩🇪', true, 6],
      ['cnt_fr', 'France', 'FR', '🇫🇷', true, 7],
      ['cnt_jp', 'Japan', 'JP', '🇯🇵', true, 8],
      ['cnt_br', 'Brazil', 'BR', '🇧🇷', true, 9],
      ['cnt_gl', 'Global', 'GL', '🌐', true, 10]
    ];
    cntSheet.getRange(2, 1, starterCountries.length, 6).setValues(starterCountries);
  }

  const lngSheet = getDatabaseSheet(CONFIG.SHEETS.LANGUAGES);
  if (lngSheet && lngSheet.getLastRow() <= 1) {
    const starterLanguages = [
      ['lng_en', 'English', 'en', true, 1],
      ['lng_es', 'Spanish', 'es', true, 2],
      ['lng_fr', 'French', 'fr', true, 3],
      ['lng_de', 'German', 'de', true, 4],
      ['lng_hi', 'Hindi', 'hi', true, 5],
      ['lng_ja', 'Japanese', 'ja', true, 6]
    ];
    lngSheet.getRange(2, 1, starterLanguages.length, 5).setValues(starterLanguages);
  }
}

/**
 * One-click helper function to authorize MailApp permission in Google Apps Script Editor.
 * Run this once in the Apps Script Editor toolbar dropdown to grant email permission.
 */
function authorizeEmailService() {
  const quota = MailApp.getRemainingDailyQuota();
  console.log(`[Authorization] MailApp is fully authorized! Remaining daily email quota: ${quota} emails.`);
  return `MailApp successfully authorized. Daily quota remaining: ${quota}`;
}
