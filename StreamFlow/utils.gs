/**
 * StreamFlow - Security & Utility Functions
 * ID generation, URL validation, SSRF defense, formula injection neutralization,
 * HTML escaping, constant-time comparison, and activity audit logging.
 */

/**
 * Generates a unique, URL-safe identifier with optional prefix.
 * @param {string} prefix e.g., 'ch_', 'cat_', 'cnt_'
 * @return {string}
 */
function generateId(prefix = '') {
  const timestamp = new Date().getTime().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomPart}`;
}

/**
 * Validates whether a URL is a legitimate, permitted HTTP or HTTPS URL.
 * Strictly blocks javascript:, data:, file:, ftp:, blob:, and malformed strings.
 * @param {string} urlStr
 * @return {boolean}
 */
function isValidStreamUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  
  // Must begin strictly with http:// or https://
  const regex = /^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i;
  if (!regex.test(trimmed)) return false;

  // Prohibit dangerous schemes explicitly
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('ftp:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  return true;
}

/**
 * Validates logo or image URL. Permits empty strings or valid HTTP/HTTPS URLs.
 * @param {string} urlStr
 * @return {boolean}
 */
function isValidImageUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return true; // Optional field
  const trimmed = urlStr.trim();
  if (trimmed === '') return true;
  return isValidStreamUrl(trimmed);
}

/**
 * Server-Side Request Forgery (SSRF) Protection.
 * Validates URLs before UrlFetchApp fetches remote resources (e.g. M3U playlists).
 * Rejects private, loopback, link-local, and cloud metadata IP addresses and hostnames.
 * @param {string} urlStr
 * @return {string} Validated URL string
 * @throws {Error} if URL is unsafe or targets protected network resources
 */
function validateFetchUrl(urlStr) {
  if (!isValidStreamUrl(urlStr)) {
    throw new Error('Invalid URL. Only standard HTTP and HTTPS URLs are permitted.');
  }

  const trimmed = urlStr.trim();
  const lower = trimmed.toLowerCase();

  // Extract hostname
  const hostMatch = lower.match(/^https?:\/\/([^/?#:]+)(?::(\d+))?/);
  if (!hostMatch) {
    throw new Error('Malformed URL structure.');
  }

  const hostname = hostMatch[1];
  const port = hostMatch[2] ? parseInt(hostMatch[2], 10) : null;

  // Restrict to standard web ports
  if (port !== null && ![80, 443, 8080, 8443].includes(port)) {
    throw new Error(`Port ${port} is not permitted for remote fetching.`);
  }

  // Block Google Cloud & AWS/Azure metadata services
  const blockedHostnames = [
    'metadata.google.internal',
    'metadata',
    '169.254.169.254',
    'localhost',
    '0.0.0.0',
    '127.0.0.1',
    '[::1]',
    '::1'
  ];

  if (blockedHostnames.includes(hostname) || hostname.endsWith('.metadata.google.internal')) {
    throw new Error('Access to local, internal, or cloud metadata services is strictly forbidden.');
  }

  // Block IPv4 loopback & private subnets (RFC 1918 & RFC 3927)
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const octet1 = parseInt(ipMatch[1], 10);
    const octet2 = parseInt(ipMatch[2], 10);

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) {
      throw new Error('Loopback network addresses are prohibited.');
    }
    // 10.0.0.0/8 (Private)
    if (octet1 === 10) {
      throw new Error('Private network addresses (10.0.0.0/8) are prohibited.');
    }
    // 172.16.0.0/12 (Private)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      throw new Error('Private network addresses (172.16.0.0/12) are prohibited.');
    }
    // 192.168.0.0/16 (Private)
    if (octet1 === 192 && octet2 === 168) {
      throw new Error('Private network addresses (192.168.0.0/16) are prohibited.');
    }
    // 169.254.0.0/16 (Link-Local / Cloud Metadata)
    if (octet1 === 169 && octet2 === 254) {
      throw new Error('Link-local and cloud metadata addresses are prohibited.');
    }
    // 0.0.0.0/8
    if (octet1 === 0) {
      throw new Error('Reserved network addresses are prohibited.');
    }
  }

  // Block IPv6 local/private representations
  if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80')) {
    throw new Error('Private IPv6 addresses are prohibited.');
  }

  return trimmed;
}

/**
 * Google Sheets Formula Injection Neutralizer.
 * Prevents CSV/Spreadsheet formula execution by prepending a single quote (')
 * if the string value starts with '=', '+', '-', '@', tab, or carriage return.
 * @param {*} val
 * @return {*}
 */
function sanitizeSheetCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  const str = String(val);
  if (str.length === 0) return '';
  const firstChar = str.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' || firstChar === '\t' || firstChar === '\r') {
    return "'" + str;
  }
  return str;
}

/**
 * Constant-time string comparison to mitigate timing attacks on HMAC tokens, hashes, and secrets.
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let mismatch = a.length === b.length ? 0 : 1;
  if (mismatch) {
    b = a;
  }
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return mismatch === 0;
}

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes a string input: trims whitespace, strips control characters, and enforces length limit.
 * @param {string} input
 * @param {number} maxLength
 * @return {string}
 */
function sanitizeString(input, maxLength = 255) {
  if (input === null || input === undefined) return '';
  let str = String(input).trim();
  // Strip control characters except newline and tab
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  return str;
}

/**
 * Returns current timestamp formatted as an ISO 8601 string.
 * @return {string}
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Safely parses a JSON string with fallback.
 * @param {string} str
 * @param {*} fallback
 * @return {*}
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

/**
 * Records an entry into the Activity audit log sheet with formula sanitization.
 * @param {string} action
 * @param {string} channelId
 * @param {string} details
 */
function recordActivity(action, channelId = '', details = '') {
  try {
    const email = getCurrentUserEmail();
    const sheet = getDatabaseSheet(CONFIG.SHEETS.ACTIVITY);
    if (!sheet) return;

    sheet.appendRow([
      getTimestamp(),
      sanitizeSheetCellValue(sanitizeString(action, 100)),
      sanitizeSheetCellValue(email || 'Anonymous'),
      sanitizeSheetCellValue(sanitizeString(channelId, 100)),
      sanitizeSheetCellValue(sanitizeString(details, 500))
    ]);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

/**
 * Normalizes strings for duplicate detection and search comparison.
 * @param {string} str
 * @return {string}
 */
function normalizeForComparison(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}
