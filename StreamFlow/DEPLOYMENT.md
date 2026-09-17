# StreamFlow — Google Apps Script Deployment & Operations Guide

This guide provides step-by-step instructions for deploying, configuring, and maintaining the **StreamFlow** Web Application using Google Apps Script, Google Sheets, and Google Drive.

---

## 1. Project Structure

```text
StreamFlow/
│
├── appsscript.json          # Google Apps Script manifest (V8 engine & OAuth scopes)
│
├── code.gs                  # doGet(e), include() helper, setupStreamFlow() master initialization
├── config.gs                # Script Properties accessors, sheet names, and system constants
├── database.gs              # Google Sheets batch read/write abstractions, schema initialization
├── channels.gs              # CRUD, queries, search, filter, status & featured toggles
├── categories.gs            # Category queries and management
├── countries.gs             # Country queries and management
├── languages.gs             # Language queries and management
├── admin.gs                 # Dashboard metrics, M3U parser & importer, audit logging
├── driveservice.gs          # Google Drive folder hierarchy, logo uploads & backups
├── settings.gs              # Application settings get/set
├── utils.gs                 # UUID generation, URL validation, text sanitization, logging
├── security.gs              # requireAdmin(), Google account identity, input validation
│
├── Index.html               # Main HTML shell, SEO metadata, HLS.js CDN, modular includes
├── Styles.html              # Vanilla CSS design system (light-mode, glassmorphism, responsive)
├── Scripts.html             # Client-side API wrapper (Promises), router, state, HLS player
├── Components.html          # Modals (User Auth, Admin 2FA, Channel Form, M3U Import, Legal), toasts
├── Header.html              # Sticky navigation header, Admin button, User Account button, search trigger
├── Footer.html              # Footer with copyright, legal and compliance modal triggers
├── Home.html                # Hero banner, featured streams, taxonomy, recently watched
├── Browse.html              # Live TV catalog, multi-criteria filters, countries & categories
├── Watch.html               # HTML5/HLS video player, stream diagnostics, error recovery
├── Favorites.html           # Personal favorites view (localStorage-backed)
├── Search.html              # Instant debounced search interface
├── Reset.html               # Password Reset view with token verification
└── Admin.html               # Administrative dashboard, channels table, settings & audit logs
```

---

## 2. Google Sheets Database Schema

Database Spreadsheet Name: **StreamFlow Database**

### 1. `Channels`
| Column | Type | Description |
|---|---|---|
| `id` | String | Unique channel identifier (e.g. `ch_...`) |
| `name` | String | Display name of the broadcast channel |
| `logo` | String | Public image URL or Google Drive asset link |
| `country` | String | Country name (e.g. United States) |
| `country_code` | String | 2-letter ISO code (e.g. US) |
| `language` | String | Primary broadcast language (e.g. English) |
| `category` | String | Channel genre (e.g. News, Sports, Entertainment) |
| `description` | String | Channel summary and schedule information |
| `stream_url` | String | Authorized HTTP/HTTPS stream URL (`.m3u8` or `.mp4`) |
| `stream_type` | String | Protocol type (`hls` or `mp4`) |
| `is_featured` | Boolean | `true` to display in homepage hero/featured sections |
| `is_active` | Boolean | `true` for public visibility; `false` to hide |
| `sort_order` | Number | Sorting weight (lower numbers appear first) |
| `created_at` | String | ISO 8601 creation timestamp |
| `updated_at` | String | ISO 8601 last update timestamp |
| `last_checked`| String | ISO 8601 health check verification timestamp |

### 2. `Countries`
Columns: `id`, `name`, `code`, `flag`, `is_active`, `sort_order`

### 3. `Categories`
Columns: `id`, `name`, `icon`, `description`, `is_active`, `sort_order`

### 4. `Languages`
Columns: `id`, `name`, `code`, `is_active`, `sort_order`

### 5. `Settings`
Columns: `key`, `value`, `description`

### 6. `Admins`
Columns: `email`, `name`, `role`, `is_active`, `created_at`

### 7. `Activity`
Columns: `timestamp`, `action`, `user`, `channel_id`, `details`

### 8. `Users`
Columns: `id`, `name`, `email`, `password_hash`, `is_active`, `reset_token`, `reset_expires`, `created_at`

---

## 3. Google Drive Structure

StreamFlow uses Google Drive for asset storage and automated database backups:

```text
Google Drive/
└── StreamFlow/
    ├── Channel Logos/       # Uploaded channel logo graphics (public view link generated)
    ├── Website Assets/      # Static icons, site badges, and brand artwork
    ├── M3U Files/           # Uploaded or archived playlist sources
    ├── Documentation/       # Technical and compliance documentation
    ├── Legal/               # Licensing records and broadcast authorization permits
    └── Backups/             # Automated timestamped copies of the StreamFlow Database
```

---

## 4. Script Properties

Configure these key-value pairs in Apps Script (**Project Settings > Script Properties**):

| Property Key | Example Value | Description |
|---|---|---|
| `SPREADSHEET_ID` | `1BxiMVs0XR_...` | ID of the StreamFlow Database spreadsheet |
| `ROOT_FOLDER_ID` | `1A2b3C4d...` | ID of the `StreamFlow` root folder in Google Drive |
| `CHANNEL_LOGOS_FOLDER_ID` | `1X9y8Z...` | ID of the `Channel Logos` folder |
| `WEBSITE_ASSETS_FOLDER_ID` | `1M7n6O...` | ID of the `Website Assets` folder |
| `M3U_FOLDER_ID` | `1K5j4H...` | ID of the `M3U Files` folder |
| `BACKUPS_FOLDER_ID` | `1P3o2I...` | ID of the `Backups` folder |
| `ADMIN_EMAILS` | `admin@domain.com,staff@domain.com` | Comma-separated list of authorized administrator emails |

---

## 5. Deployment Steps

### Step 1: Create or Select Your Google Account
Ensure you are logged into the Google Account that will own and host the application.

### Step 2: Open Google Apps Script
1. Navigate to [script.google.com](https://script.google.com).
2. Click **New Project** and name it **StreamFlow**.

### Step 3: Add the Project Files
1. Enable manifest view: **Project Settings** > Check **"Show 'appsscript.json' manifest file in editor"**.
2. Replace `appsscript.json` with the repository's `appsscript.json`.
3. Create the 12 script files (`.gs`) and paste their corresponding contents:
   - `code.gs`, `config.gs`, `database.gs`, `channels.gs`, `categories.gs`, `countries.gs`, `languages.gs`, `admin.gs`, `driveservice.gs`, `settings.gs`, `utils.gs`, `security.gs`.
4. Create the 13 HTML files and paste their corresponding contents:
   - `Index.html`, `Styles.html`, `Scripts.html`, `Components.html`, `Header.html`, `Footer.html`, `Home.html`, `Browse.html`, `Watch.html`, `Favorites.html`, `Search.html`, `Admin.html`, `Reset.html`.

### Step 4: Run Initial Setup
1. In the Apps Script editor, select function `setupStreamFlow` in the top toolbar.
2. Click **Run**.
3. Accept the authorization prompts when requested by Google.
4. `setupStreamFlow()` will automatically:
   - Create the `StreamFlow` Drive folder hierarchy.
   - Create and configure the `StreamFlow Database` spreadsheet with all required headers.
   - Set up default settings.
   - Register your current Google Account email as the Primary Administrator.
   - Store all generated IDs into Script Properties.

### Step 5: Deploy as Web App
1. Click the blue **Deploy** button at top right > **Manage deployments**.
2. Active Deployment ID: `AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA` (Version `@10`)
3. Web App Settings:
   - **Execute as:** `Me (your_email@gmail.com)`
   - **Who has access:** `Anyone`
4. Live Web App URL:
   `https://script.google.com/macros/s/AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA/exec`

---

## 6. Security Checklist

- [x] **Zero Hardcoded Credentials:** No API keys, passwords, or personal email addresses exist in the source files.
- [x] **Strict Scheme Filtering:** Only `http://` and `https://` stream and logo URLs are permitted. Dangerous protocols (`javascript:`, `data:`, `file:`, `ftp:`) are strictly rejected.
- [x] **Input Sanitization:** All text inputs are stripped of control characters and escaped to prevent stored XSS.
- [x] **Server-Side Authorization:** Every administrative backend function calls `requireAdmin()`, validating the active Google session against `ADMIN_EMAILS` and the `Admins` sheet.
- [x] **Zero Stream Relaying / SSRF Defense:** Apps Script is never used as an open proxy (`UrlFetchApp` does not proxy streams). Video playback connects directly from browser to broadcaster CDN.
- [x] **Data Isolation:** Administrative tables, internal spreadsheet IDs, and audit logs are never returned to non-admin public clients.

---

## 7. Testing Checklist

### Public User Experience
- [ ] **Home View:** Hero loads with CTA buttons, featured channels appear, categories and countries render.
- [ ] **Live TV / Browse View:** Channels load; filtering by country, category, and language responds instantly.
- [ ] **Search:** Typing into search bar triggers debounced filtering with correct match counts.
- [ ] **Watch / Player View:** HLS stream launches; error overlay appears with Retry button if stream is offline.
- [ ] **Favorites:** Clicking heart adds channel to `localStorage` favorites and persists across reloads.
- [ ] **History:** Watching a channel records it into recent history; "Clear History" resets it.
- [ ] **Responsive Design:** Verify interface on mobile viewport (sticky bottom navigation, touch targets >= 44px).

### Admin Experience
- [ ] **Auth Verification:** Non-admin accounts attempting to access Admin endpoints receive an explicit unauthorized rejection.
- [ ] **Channel CRUD:** Add new channel, edit existing channel, toggle active status, and delete.
- [ ] **M3U Import:** Paste valid `#EXTINF` content, verify duplicate detection metrics, and commit import to Google Sheets.
- [ ] **Settings:** Update site name or description; verify title and public view reflect updates.
- [ ] **Activity Log:** Confirm all administrative actions are logged in the `Activity` sheet.
