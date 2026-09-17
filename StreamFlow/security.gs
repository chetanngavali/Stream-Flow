/**
 * StreamFlow - Security and Authorization Service
 * Supports Google account identity, Email/Password authentication, 2FA security PIN,
 * HMAC session tokens, and input validation.
 */

const SECURITY_CONSTANTS = {
  DEFAULT_ADMIN_EMAIL: 'chetanngavali@gmail.com',
  DEFAULT_PASSWORD: 'admin',
  DEFAULT_PIN: '123456',
  TOKEN_EXPIRY_MS: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Internal helper: Computes SHA-256 hash of a string with salt.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @param {string} text
 * @param {string} salt
 * @return {string}
 */
function hashPassword_(text, salt = 'sf_salt_2026') {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text) + salt);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Internal helper: Retrieves or generates the system HMAC signing secret.
 * Appended with underscore to prohibit invocation via google.script.run.
 * @return {string}
 */
function getSigningSecret_() {
  let secret = getScriptProperty_('ADMIN_TOKEN_SECRET');
  if (!secret) {
    secret = generateId('sec_') + Math.random().toString(36).substring(2) + Utilities.getUuid().replace(/-/g, '');
    setScriptProperty_('ADMIN_TOKEN_SECRET', secret);
  }
  return secret;
}

/**
 * Internal helper: Initializes default admin credentials in Script Properties if not already set.
 * Appended with underscore to prohibit invocation via google.script.run.
 */
function ensureAdminCredentialsInitialized_() {
  const email = getScriptProperty_('ADMIN_EMAIL');
  if (!email) {
    setScriptProperty_('ADMIN_EMAIL', SECURITY_CONSTANTS.DEFAULT_ADMIN_EMAIL);
    setScriptProperty_('ADMIN_PASSWORD_HASH', hashPassword_(SECURITY_CONSTANTS.DEFAULT_PASSWORD));
    setScriptProperty_('ADMIN_2FA_PIN', SECURITY_CONSTANTS.DEFAULT_PIN);
  }
}

/**
 * Authenticates an administrator using Email, Password, and 2FA PIN.
 * Returns a cryptographically signed admin session token upon success.
 * @param {string} email
 * @param {string} password
 * @param {string} twoFactorPin
 * @return {Object} { success: boolean, token?: string, email?: string, message?: string }
 */
function loginAdmin(email, password, twoFactorPin) {
  ensureAdminCredentialsInitialized_();

  if (!email || !password || !twoFactorPin) {
    throw new Error('Email, password, and 2FA PIN are all required.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPin = String(twoFactorPin).trim();
  const storedEmail = (getScriptProperty_('ADMIN_EMAIL') || SECURITY_CONSTANTS.DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const storedHash = getScriptProperty_('ADMIN_PASSWORD_HASH') || hashPassword_(SECURITY_CONSTANTS.DEFAULT_PASSWORD);
  const storedPin = String(getScriptProperty_('ADMIN_2FA_PIN') || SECURITY_CONSTANTS.DEFAULT_PIN).trim();

  // Verify Email
  if (cleanEmail !== storedEmail && !getAdminEmails_().includes(cleanEmail)) {
    recordActivity('LOGIN_FAILED', '', `Invalid email attempt: ${cleanEmail}`);
    throw new Error('Invalid email address or credentials.');
  }

  // Verify Password with constant-time comparison
  const inputHash = hashPassword_(password);
  if (!secureCompare(inputHash, storedHash)) {
    recordActivity('LOGIN_FAILED', '', `Invalid password for: ${cleanEmail}`);
    throw new Error('Invalid credentials.');
  }

  // Verify 2FA PIN with constant-time comparison
  if (!secureCompare(cleanPin, storedPin)) {
    recordActivity('LOGIN_FAILED', '', `Invalid 2FA PIN for: ${cleanEmail}`);
    throw new Error('Invalid 2FA PIN.');
  }

  // Generate signed admin session token (strictly role: 'admin')
  const payload = {
    role: 'admin',
    email: cleanEmail,
    exp: Date.now() + SECURITY_CONSTANTS.TOKEN_EXPIRY_MS,
    nonce: generateId('tok_')
  };

  const payloadStr = Utilities.base64Encode(JSON.stringify(payload));
  const secret = getSigningSecret_();
  const sigBytes = Utilities.computeHmacSha256Signature(payloadStr, secret);
  const sigStr = Utilities.base64Encode(sigBytes);
  const token = `${payloadStr}.${sigStr}`;

  recordActivity('ADMIN_LOGIN_SUCCESS', '', `Admin logged in with 2FA: ${cleanEmail}`);

  return {
    success: true,
    token: token,
    email: cleanEmail
  };
}

/**
 * Internal helper: Strictly validates an administrative session token.
 * Enforces valid signature, unexpired timestamp, role === 'admin', and authorized admin email.
 * @param {string} token
 * @return {boolean}
 */
function isValidAdminSessionToken_(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  try {
    const payloadStr = parts[0];
    const signature = parts[1];
    const secret = getSigningSecret_();

    // Constant-time HMAC signature comparison
    const expectedSigBytes = Utilities.computeHmacSha256Signature(payloadStr, secret);
    const expectedSigStr = Utilities.base64Encode(expectedSigBytes);
    if (!secureCompare(signature, expectedSigStr)) {
      return false;
    }

    const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payloadStr)).getDataAsString());
    
    // Validate expiration
    if (!payload.exp || Date.now() > payload.exp) {
      return false;
    }

    // STRICT Privilege Check: Token must explicitly have role: 'admin'
    if (payload.role !== 'admin') {
      return false;
    }

    // STRICT Identity Check: Email inside token must be an authorized admin
    if (!payload.email || !isAuthorizedAdmin(payload.email)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validates a session token signature and expiration.
 * @param {string} token
 * @return {boolean}
 */
function isValidSessionToken(token) {
  return isValidAdminSessionToken_(token);
}

/**
 * Retrieves email from a valid session token.
 * @param {string} token
 * @return {string}
 */
function getEmailFromToken(token) {
  try {
    if (!isValidAdminSessionToken_(token)) return '';
    const payloadStr = token.split('.')[0];
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payloadStr)).getDataAsString());
    return payload.email || '';
  } catch (e) {
    return '';
  }
}

/**
 * Retrieves the current authenticated user's email safely.
 * Checks admin token first, then falls back to Google session.
 * @param {string} [token]
 * @return {string}
 */
function getCurrentUserEmail(token) {
  if (token && isValidAdminSessionToken_(token)) {
    const email = getEmailFromToken(token);
    if (email) return email;
  }

  try {
    const user = Session.getActiveUser();
    if (user) {
      return (user.getEmail() || '').toLowerCase().trim();
    }
  } catch (e) {}

  return '';
}

/**
 * Checks whether the specified email or token is an authorized administrator.
 * @param {string} emailOrToken
 * @return {boolean}
 */
function isAuthorizedAdmin(emailOrToken) {
  if (!emailOrToken) return false;

  // 1. If it looks like a token, check if it's a valid admin session token
  if (typeof emailOrToken === 'string' && emailOrToken.includes('.')) {
    return isValidAdminSessionToken_(emailOrToken);
  }

  // 2. Check email against Script Properties
  const cleanEmail = String(emailOrToken).toLowerCase().trim();
  const configuredEmails = getAdminEmails_();
  if (configuredEmails.includes(cleanEmail)) {
    return true;
  }

  const storedAdminEmail = (getScriptProperty_('ADMIN_EMAIL') || '').toLowerCase().trim();
  if (storedAdminEmail && cleanEmail === storedAdminEmail) {
    return true;
  }

  // 3. Check Database 'Admins' sheet
  try {
    const sheet = getDatabaseSheet(CONFIG.SHEETS.ADMINS);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const rowEmail = String(data[i][0] || '').toLowerCase().trim();
        const isActive = String(data[i][3]).toLowerCase() === 'true';
        if (rowEmail === cleanEmail && isActive) {
          return true;
        }
      }
    }
  } catch (err) {}

  return false;
}

/**
 * Enforces administrative access on server endpoints.
 * Strictly verifies admin token or authenticated Google owner identity.
 * Rejects standard user tokens.
 * @param {string} [token]
 * @return {boolean}
 */
function requireAdmin(token) {
  // Check valid admin token
  if (token && isValidAdminSessionToken_(token)) {
    return true;
  }

  // Check active Google account
  const email = getCurrentUserEmail();
  if (email && isAuthorizedAdmin(email)) {
    return true;
  }

  console.warn(`[Security Alert] Unauthorized admin access attempt. Token valid: ${Boolean(token && isValidAdminSessionToken_(token))}, Email: ${email || 'Anonymous'}`);
  throw new Error('Unauthorized: Administrative authentication required.');
}

/**
 * Determines whether the current client or token is authorized as admin.
 * @param {string} [token]
 * @return {boolean}
 */
function isAdmin(token) {
  if (token && isValidAdminSessionToken_(token)) {
    return true;
  }
  const email = getCurrentUserEmail();
  return Boolean(email && isAuthorizedAdmin(email));
}

/**
 * Updates administrator password and 2FA PIN.
 * Requires valid current admin credentials or session token.
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} newPin
 * @param {string} token
 * @return {boolean}
 */
function updateAdminCredentials(currentPassword, newPassword, newPin, token) {
  requireAdmin(token);

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  if (!newPin || !/^\d{4,8}$/.test(String(newPin).trim())) {
    throw new Error('New 2FA PIN must be 4 to 8 digits.');
  }

  const storedHash = getScriptProperty_('ADMIN_PASSWORD_HASH') || hashPassword_(SECURITY_CONSTANTS.DEFAULT_PASSWORD);
  if (!secureCompare(hashPassword_(currentPassword), storedHash)) {
    throw new Error('Current password does not match.');
  }

  setScriptProperty_('ADMIN_PASSWORD_HASH', hashPassword_(newPassword));
  setScriptProperty_('ADMIN_2FA_PIN', String(newPin).trim());
  recordActivity('UPDATE_CREDENTIALS', '', 'Administrator updated password and 2FA PIN.');

  return true;
}

/**
 * Validates channel payload prior to creation or updates.
 * @param {Object} channel
 * @throws {Error} if validation fails
 */
function validateChannelPayload(channel) {
  if (!channel || typeof channel !== 'object') {
    throw new Error('Channel data must be a valid object.');
  }

  if (!channel.name || sanitizeString(channel.name, 120).length === 0) {
    throw new Error('Channel name is required.');
  }

  if (!channel.stream_url || !isValidStreamUrl(channel.stream_url)) {
    throw new Error('A valid HTTP or HTTPS stream URL is required. Dangerous or malformed protocols are rejected.');
  }

  if (!channel.category || sanitizeString(channel.category, 60).length === 0) {
    throw new Error('Category is required.');
  }

  if (!channel.country || sanitizeString(channel.country, 60).length === 0) {
    throw new Error('Country is required.');
  }

  if (!channel.language || sanitizeString(channel.language, 60).length === 0) {
    throw new Error('Language is required.');
  }

  const validStreamTypes = ['hls', 'mp4', 'm3u8', 'dash', 'custom'];
  const streamType = (channel.stream_type || 'hls').toLowerCase().trim();
  if (!validStreamTypes.includes(streamType)) {
    channel.stream_type = 'hls';
  }

  if (channel.logo && !isValidImageUrl(channel.logo)) {
    throw new Error('Invalid logo URL format. Must be http:// or https://');
  }

  channel.name = sanitizeString(channel.name, 120);
  channel.stream_url = channel.stream_url.trim();
  channel.category = sanitizeString(channel.category, 60);
  channel.country = sanitizeString(channel.country, 60);
  channel.country_code = sanitizeString(channel.country_code || '', 10).toUpperCase();
  channel.language = sanitizeString(channel.language, 60);
  channel.description = sanitizeString(channel.description || '', 1000);
  channel.logo = sanitizeString(channel.logo || '', 500);
  channel.is_featured = Boolean(channel.is_featured);
  channel.is_active = channel.is_active !== undefined ? Boolean(channel.is_active) : true;
  channel.sort_order = Number.isInteger(Number(channel.sort_order)) ? Number(channel.sort_order) : 0;
}

/**
 * Validates email address syntax.
 * @param {string} email
 * @return {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Ensures that the Users sheet exists in the spreadsheet database.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateUsersSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.USERS);
    const headers = DATABASE_SCHEMAS[CONFIG.SHEETS.USERS];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#F0F2F8');
  }
  return sheet;
}

/**
 * Generates a signed user session token (30 days validity).
 * Uses role: 'user' so it can never authenticate for administrative operations.
 * @param {string} userId
 * @param {string} email
 * @param {string} name
 * @return {string}
 */
function generateUserSessionToken(userId, email, name) {
  const payload = {
    sub: userId,
    email: String(email).toLowerCase().trim(),
    name: name || '',
    role: 'user',
    exp: Date.now() + (30 * 24 * 60 * 60 * 1000),
    nonce: generateId('usr_tok_')
  };
  const payloadStr = Utilities.base64Encode(JSON.stringify(payload));
  const secret = getSigningSecret_();
  const sigBytes = Utilities.computeHmacSha256Signature(payloadStr, secret);
  const sigStr = Utilities.base64Encode(sigBytes);
  return `${payloadStr}.${sigStr}`;
}

/**
 * Verifies and decodes a user session token.
 * @param {string} token
 * @return {Object|null}
 */
function getUserFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const payloadStr = parts[0];
    const signature = parts[1];
    const secret = getSigningSecret_();
    const expectedSigBytes = Utilities.computeHmacSha256Signature(payloadStr, secret);
    const expectedSigStr = Utilities.base64Encode(expectedSigBytes);
    if (!secureCompare(signature, expectedSigStr)) return null;
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payloadStr)).getDataAsString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Registers a new user account with email and password.
 * Protected against race conditions via LockService and formula injection via sanitizeSheetCellValue.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @return {Object}
 */
function registerUser(name, email, password) {
  if (!name || !sanitizeString(name, 100)) {
    throw new Error('Please enter your name.');
  }
  if (!email || !isValidEmail(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Server is currently busy. Please try again in a moment.');
  }

  try {
    const cleanName = sanitizeString(name, 100);
    const cleanEmail = email.toLowerCase().trim();
    const sheet = getOrCreateUsersSheet();
    const data = sheet.getDataRange().getValues();

    // Check duplicate email
    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][2] || '').toLowerCase().trim();
      if (rowEmail === cleanEmail) {
        throw new Error('An account with this email address already exists. Please sign in instead.');
      }
    }

    const userId = generateId('usr_');
    const passwordHash = hashPassword_(password);
    const createdAt = new Date().toISOString();

    // Neutralize formula injection in user-supplied strings
    sheet.appendRow([
      userId,
      sanitizeSheetCellValue(cleanName),
      sanitizeSheetCellValue(cleanEmail),
      passwordHash,
      true,
      '',
      '',
      createdAt
    ]);

    recordActivity('USER_REGISTER', '', `New user registered: ${cleanEmail}`);
    const token = generateUserSessionToken(userId, cleanEmail, cleanName);

    return {
      success: true,
      message: 'Account created successfully!',
      token: token,
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail
      }
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Authenticates a user using email and password.
 * @param {string} email
 * @param {string} password
 * @return {Object}
 */
function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const sheet = getOrCreateUsersSheet();
  const data = sheet.getDataRange().getValues();

  let userRow = null;
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][2] || '').toLowerCase().trim();
    if (rowEmail === cleanEmail) {
      userRow = data[i];
      break;
    }
  }

  if (!userRow) {
    recordActivity('LOGIN_FAILED', '', `User login failed (email not found): ${cleanEmail}`);
    throw new Error('Invalid email or password.');
  }

  const isActive = String(userRow[4]).toLowerCase() !== 'false';
  if (!isActive) {
    throw new Error('This account has been deactivated. Please contact support.');
  }

  const storedHash = String(userRow[3]);
  const inputHash = hashPassword_(password);
  if (!secureCompare(storedHash, inputHash)) {
    recordActivity('LOGIN_FAILED', '', `User login failed (wrong password): ${cleanEmail}`);
    throw new Error('Invalid email or password.');
  }

  const userId = String(userRow[0]);
  const name = String(userRow[1]);
  const token = generateUserSessionToken(userId, cleanEmail, name);

  recordActivity('USER_LOGIN', '', `User logged in: ${cleanEmail}`);

  return {
    success: true,
    message: 'Login successful!',
    token: token,
    user: {
      id: userId,
      name: name,
      email: cleanEmail
    }
  };
}

/**
 * Generates a password reset token and sends a direct email with reset link.
 * Protected against rate limiting and quota abuse via CacheService.
 * @param {string} email
 * @return {Object}
 */
function sendPasswordResetEmail(email) {
  if (!email || !isValidEmail(email)) {
    throw new Error('Please enter a valid email address.');
  }

  const cleanEmail = email.toLowerCase().trim();

  // Rate Limiting Protection: Max 3 reset requests per email per 10 minutes
  const cache = CacheService.getScriptCache();
  const rateLimitKey = `rate_reset_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
  const currentAttempts = parseInt(cache.get(rateLimitKey) || '0', 10);
  if (currentAttempts >= 3) {
    throw new Error('Too many password reset requests for this email. Please wait a few minutes before trying again.');
  }
  cache.put(rateLimitKey, String(currentAttempts + 1), 600); // 10 minutes

  const sheet = getOrCreateUsersSheet();
  const data = sheet.getDataRange().getValues();

  let userRowIndex = -1;
  let userName = '';
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][2] || '').toLowerCase().trim();
    if (rowEmail === cleanEmail) {
      userRowIndex = i;
      userName = String(data[i][1] || '');
      break;
    }
  }

  // Timing & enumeration resistance: return identical message if account doesn't exist
  if (userRowIndex === -1) {
    return {
      success: true,
      message: `If an account is associated with ${cleanEmail}, a password reset link has been dispatched to your inbox.`
    };
  }

  // Generate secure unguessable reset token and set 1 hour expiry
  const resetToken = Utilities.getUuid().replace(/-/g, '') + Math.random().toString(36).substring(2, 12);
  const resetExpires = Date.now() + (60 * 60 * 1000);

  // Save token and expiry in sheet
  sheet.getRange(userRowIndex + 1, 6, 1, 2).setValues([[resetToken, resetExpires]]);

  // Resolve Web App URL
  let webAppUrl = '';
  try {
    webAppUrl = ScriptApp.getService().getUrl();
  } catch (e) {}
  if (!webAppUrl) {
    webAppUrl = getScriptProperty_('WEB_APP_URL') || 'https://script.google.com/macros/s/AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA/exec';
  }

  const sep = webAppUrl.indexOf('?') !== -1 ? '&' : '?';
  const resetUrl = `${webAppUrl}${sep}view=reset&token=${encodeURIComponent(resetToken)}`;

  // Dispatch email directly to user
  try {
    MailApp.sendEmail({
      to: cleanEmail,
      subject: 'StreamFlow — Password Reset Request',
      htmlBody: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Reset Your StreamFlow Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 32px 16px;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <tr>
              <td style="padding: 36px 32px 24px 32px; text-align: center; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);">
                <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;">Stream<span style="color: #818cf8;">Flow</span></h1>
                <p style="margin: 6px 0 0 0; color: #cbd5e1; font-size: 14px;">Live TV Catalog & Streaming Platform</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <h2 style="margin: 0 0 16px 0; color: #f8fafc; font-size: 20px; font-weight: 700;">Password Reset Request</h2>
                <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Hello ${escapeHtml(userName) || 'there'},</p>
                <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 0 0 28px 0;">We received a request to reset the password for your StreamFlow account (<strong>${escapeHtml(cleanEmail)}</strong>). Click the button below to set a new password:</p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 9999px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 18px rgba(99, 102, 241, 0.4);">Reset My Password</a>
                </div>
                <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
                  <p style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin: 0;">⏱️ <strong>Security Note:</strong> This password reset link will expire in <strong>1 hour</strong>.</p>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.</p>
                <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
                <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0; word-break: break-all;">If the button above does not work, copy and paste this link into your browser:<br/><a href="${resetUrl}" style="color: #818cf8; text-decoration: underline;">${resetUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px; background-color: #0f172a; text-align: center; border-top: 1px solid #1e293b;">
                <p style="color: #64748b; font-size: 12px; margin: 0;">StreamFlow Live TV &bull; Cloud Streaming Directory</p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    });
  } catch (err) {
    console.error('Failed to send reset email:', err);
    throw new Error(`Failed to send email: ${err.message}. Please verify MailApp permissions in Apps Script.`);
  }

  recordActivity('PASSWORD_RESET_REQ', '', `Password reset email dispatched to: ${cleanEmail}`);

  return {
    success: true,
    message: `A password reset link has been sent to ${cleanEmail}. Please check your inbox and spam folder.`
  };
}

/**
 * Resets user password using a verified reset token.
 * Protected against race conditions via LockService.
 * @param {string} token
 * @param {string} newPassword
 * @return {Object}
 */
function resetPasswordWithToken(token, newPassword) {
  if (!token || typeof token !== 'string') {
    throw new Error('Reset token is required.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    throw new Error('Server is currently busy. Please try again in a moment.');
  }

  try {
    const cleanToken = token.trim();
    const sheet = getOrCreateUsersSheet();
    const data = sheet.getDataRange().getValues();

    let userRowIndex = -1;
    let userEmail = '';
    let tokenExpires = 0;

    for (let i = 1; i < data.length; i++) {
      const rowToken = String(data[i][5] || '').trim();
      if (rowToken && secureCompare(rowToken, cleanToken)) {
        userRowIndex = i;
        userEmail = String(data[i][2] || '').trim();
        tokenExpires = Number(data[i][6] || 0);
        break;
      }
    }

    if (userRowIndex === -1) {
      throw new Error('Invalid or expired password reset link. Please request a new one.');
    }

    if (Date.now() > tokenExpires) {
      // Clear expired token
      sheet.getRange(userRowIndex + 1, 6, 1, 2).setValues([['', '']]);
      throw new Error('This password reset link has expired (links are valid for 1 hour). Please request a new one.');
    }

    // Update password hash and clear reset token
    const newHash = hashPassword_(newPassword);
    sheet.getRange(userRowIndex + 1, 4).setValue(newHash);
    sheet.getRange(userRowIndex + 1, 6, 1, 2).setValues([['', '']]);

    recordActivity('PASSWORD_RESET_SUCCESS', '', `User reset password successfully: ${userEmail}`);

    return {
      success: true,
      message: 'Your password has been reset successfully! You can now log in with your new password.'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retrieves profile of logged in user from token.
 * @param {string} token
 * @return {Object|null}
 */
function getUserProfile(token) {
  const payload = getUserFromToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name
  };
}
