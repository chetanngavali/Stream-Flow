# StreamFlow — Client/Server API Reference

StreamFlow communicates between the browser single-page interface and the Google Apps Script backend using Google's RPC transport (`google.script.run`).

The client provides a clean Promise-based client wrapper:
```javascript
API.call(fnName, ...args)
  .then(result => { /* handle response */ })
  .catch(err => { /* handle error */ });
```

---

## 1. Public Read Endpoints

These endpoints require no authentication and return only approved, active public records.

### `getChannels(includeInactive, token)`
* **Description:** Retrieves all active channels sorted by sort order and name. Uses 10-minute cache in `CacheService`.
* **Parameters:**
  * `includeInactive` *(boolean, default: `false`)*: If `true`, requires valid admin session token.
  * `token` *(string, optional)*: Admin session token if requesting inactive channels.
* **Returns:** `Array<ChannelObject>`

### `getChannelById(id, token)`
* **Description:** Retrieves a single channel record by ID.
* **Parameters:**
  * `id` *(string, required)*: The channel unique ID (e.g. `ch_abcdef_123456`).
  * `token` *(string, optional)*: Admin session token if requesting an inactive channel.
* **Returns:** `ChannelObject|null`

### `searchChannels(query)`
* **Description:** Performs sub-second search against channel title, country, category, and language. Capped to 100 characters.
* **Parameters:**
  * `query` *(string, required)*: Text search string.
* **Returns:** `Array<ChannelObject>`

### `getFeaturedChannels()`
* **Description:** Retrieves all channels flagged with `is_featured === true`.
* **Returns:** `Array<ChannelObject>`

### `getCountries(includeInactive, token)`
* **Description:** Retrieves all active countries with dynamically computed channel counts.
* **Returns:** `Array<CountryObject>`

### `getCategories(includeInactive, token)`
* **Description:** Retrieves all active categories with dynamically computed channel counts.
* **Returns:** `Array<CategoryObject>`

### `getLanguages(includeInactive, token)`
* **Description:** Retrieves all active broadcast languages with channel counts.
* **Returns:** `Array<LanguageObject>`

### `getSettings()`
* **Description:** Retrieves public site configuration settings (`site_name`, `site_description`, `logo_url`, etc.).
* **Returns:** `Object`

### `isAdmin(token)`
* **Description:** Checks whether the active session token or Google account holds administrator privileges.
* **Parameters:**
  * `token` *(string, optional)*: Session token.
* **Returns:** `boolean`

---

## 2. User Account & Password Recovery Endpoints

### `registerUser(name, email, password)`
* **Description:** Registers a new member account with salted SHA-256 password hashing. Protected against race conditions and formula injection.
* **Parameters:**
  * `name` *(string, max 100 chars)*: Member display name.
  * `email` *(string)*: Valid email address (must be unique).
  * `password` *(string, min 6 chars)*: Plaintext password.
* **Returns:** `{ success: true, token: string, user: { id, name, email } }`

### `loginUser(email, password)`
* **Description:** Authenticates a member and returns a 30-day user session token (`role: 'user'`).
* **Parameters:**
  * `email` *(string)*
  * `password` *(string)*
* **Returns:** `{ success: true, token: string, user: { id, name, email } }`

### `sendPasswordResetEmail(email)`
* **Description:** Dispatches an automated, branded HTML password reset link via Google `MailApp`. Rate limited to 3 requests per email per 10 minutes.
* **Parameters:**
  * `email` *(string)*
* **Returns:** `{ success: true, message: string }`

### `resetPasswordWithToken(token, newPassword)`
* **Description:** Sets a new password using a verified 1-hour reset token.
* **Parameters:**
  * `token` *(string, required)*: 64-character unguessable reset token.
  * `newPassword` *(string, min 6 chars)*
* **Returns:** `{ success: true, message: string }`

### `getUserProfile(token)`
* **Description:** Resolves member identity from a valid user token.
* **Parameters:**
  * `token` *(string, required)*
* **Returns:** `{ id, email, name }|null`

---

## 3. Administrative Endpoints (Strictly Authorized)

All endpoints below enforce `requireAdmin(token)` on the server. Standard user tokens (`role: 'user'`) are strictly rejected.

### `loginAdmin(email, password, twoFactorPin)`
* **Description:** Authenticates an administrator using email, password, and 2FA PIN. Returns a cryptographically signed HMAC-SHA256 session token with `role: 'admin'`.
* **Parameters:**
  * `email` *(string)*
  * `password` *(string)*
  * `twoFactorPin` *(string, 4-8 digits)*
* **Returns:** `{ success: true, token: string, email: string }`

### `getAdminData(token)`
* **Description:** Aggregates dashboard metrics, channel rosters, taxonomies, and audit logs into a single high-performance payload.
* **Returns:** `{ channels, categories, countries, languages, settings, stats, admins, activity }`

### `addChannel(data, token)`
* **Description:** Validates and creates a new channel. Protected by `LockService` and formula sanitization.
* **Parameters:**
  * `data` *(object)*: `{ name, stream_url, category, country, language, logo, is_featured, is_active, sort_order }`
* **Returns:** `ChannelObject`

### `updateChannel(id, data, token)`
* **Description:** Updates channel attributes by ID. Enforces strict schema allowlisting.
* **Returns:** `boolean`

### `deleteChannel(id, token)`
* **Description:** Permanently removes a channel record.
* **Returns:** `boolean`

### `toggleChannelStatus(id, token)`
* **Description:** Toggles channel between `Active` and `Disabled`.
* **Returns:** `boolean` (new status)

### `toggleFeatured(id, token)`
* **Description:** Toggles whether channel is highlighted on the home page.
* **Returns:** `boolean` (new featured status)

### `fetchAndParseM3UUrl(url, token)`
* **Description:** Downloads remote M3U playlist with **SSRF protection** (`validateFetchUrl`).
* **Parameters:**
  * `url` *(string)*: Remote playlist URL.
* **Returns:** `{ total_detected, new_count, duplicate_count, invalid_count, items: Array }`

### `commitM3UImport(channelsToImport, token)`
* **Description:** Batches parsed M3U items into Google Sheets with formula injection neutralization and `LockService`.
* **Returns:** `number` (count of channels imported)

### `importM3UFromUrlDirectly(url, token)`
* **Description:** High-volume stream ingest from URL directly into Google Sheets in chunks of 2,500 rows. Avoids browser serialization limits.
* **Returns:** `{ total, imported, duplicates, invalid }`

### `uploadChannelLogo(fileName, base64Data, mimeType, token)`
* **Description:** Uploads a channel logo to Google Drive. Restricts to raster formats (PNG, JPEG, WebP) up to 3MB.
* **Returns:** `string` (Direct view URL)

### `createDatabaseBackup(token)`
* **Description:** Creates an automated timestamped backup copy of the database spreadsheet in Google Drive.
* **Returns:** `string` (Backup Drive URL)

### `updateSettings(newSettings, token)`
* **Description:** Updates application settings. Enforces whitelisted keys.
* **Returns:** `boolean`

### `updateAdminCredentials(currentPassword, newPassword, newPin, token)`
* **Description:** Updates admin password and 2FA PIN. Uses constant-time `secureCompare` for authentication.
* **Returns:** `boolean`
