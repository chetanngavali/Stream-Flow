/**
 * StreamFlow - Application Configuration
 * Handles Script Properties, Sheet Names, and System Constants.
 */

const CONFIG = {
  // Sheet Names in the StreamFlow Database
  SHEETS: {
    CHANNELS: 'Channels',
    COUNTRIES: 'Countries',
    CATEGORIES: 'Categories',
    LANGUAGES: 'Languages',
    SETTINGS: 'Settings',
    ADMINS: 'Admins',
    ACTIVITY: 'Activity',
    USERS: 'Users'
  },

  // Cache Configuration
  CACHE: {
    CHANNELS_KEY: 'sf_cache_channels',
    CATEGORIES_KEY: 'sf_cache_categories',
    COUNTRIES_KEY: 'sf_cache_countries',
    LANGUAGES_KEY: 'sf_cache_languages',
    SETTINGS_KEY: 'sf_cache_settings',
    TTL_SECONDS: 600 // 10 minutes cache for public read endpoints
  },

  // Property Keys for ScriptProperties
  PROPERTY_KEYS: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
    CHANNEL_LOGOS_FOLDER_ID: 'CHANNEL_LOGOS_FOLDER_ID',
    WEBSITE_ASSETS_FOLDER_ID: 'WEBSITE_ASSETS_FOLDER_ID',
    M3U_FOLDER_ID: 'M3U_FOLDER_ID',
    BACKUPS_FOLDER_ID: 'BACKUPS_FOLDER_ID',
    ADMIN_EMAILS: 'ADMIN_EMAILS'
  },

  // Drive Folder Structure
  DRIVE_FOLDERS: {
    ROOT: 'StreamFlow',
    LOGOS: 'Channel Logos',
    ASSETS: 'Website Assets',
    M3U: 'M3U Files',
    DOCS: 'Documentation',
    LEGAL: 'Legal',
    BACKUPS: 'Backups'
  },

  // Default App Settings
  DEFAULT_SETTINGS: {
    site_name: 'StreamFlow',
    site_description: 'Watch authorized live channels from around the world.',
    logo_url: '',
    default_category: 'General',
    default_country: 'Global',
    items_per_page: '24',
    maintenance_mode: 'false'
  }
};

/**
 * Internal helper: Retrieves a script property value by key.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @param {string} key
 * @param {string} defaultValue
 * @return {string}
 */
function getScriptProperty_(key, defaultValue = '') {
  try {
    const props = PropertiesService.getScriptProperties();
    const val = props.getProperty(key);
    return val !== null && val !== undefined ? val : defaultValue;
  } catch (err) {
    console.error(`Error reading property ${key}:`, err);
    return defaultValue;
  }
}

/**
 * Internal helper: Sets a script property value.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @param {string} key
 * @param {string} value
 */
function setScriptProperty_(key, value) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(key, String(value));
}

/**
 * Internal helper: Returns configured Spreadsheet ID.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @return {string}
 */
function getSpreadsheetId_() {
  return getScriptProperty_(CONFIG.PROPERTY_KEYS.SPREADSHEET_ID, '');
}

/**
 * Internal helper: Returns configured Admin Emails as an array of lowercase strings.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @return {string[]}
 */
function getAdminEmails_() {
  const raw = getScriptProperty_(CONFIG.PROPERTY_KEYS.ADMIN_EMAILS, '');
  if (!raw) return [];
  return raw
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}
