# StreamFlow — Modern Live TV Platform (Google Apps Script & Google Workspace)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-V8%20Runtime-4285F4?logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Database-34A853?logo=googlesheets&logoColor=white)](https://www.google.com/sheets/about/)
[![Google Drive](https://img.shields.io/badge/Google%20Drive-Asset%20Storage-FBBC05?logo=googledrive&logoColor=white)](https://www.google.com/drive/)
[![HLS.js](https://img.shields.io/badge/Player-HLS.js%20Direct-FF6B6B)](https://github.com/video-dev/hls.js/)
[![Security & Mobile: Hardened](https://img.shields.io/badge/Release-v10%20(Mobile%20Polish%20%2B%20Hardened)-success)](SECURITY.md)

> **StreamFlow** is a serverless, enterprise-hardened Live TV catalog and streaming platform built entirely on **Google Apps Script**, **Google Sheets** (as a high-performance relational database), **Google Drive** (asset & backup storage), and **HTML Service**. It delivers an OTT-caliber streaming experience with direct client-side **HLS.js** playback, full user account management, self-service password recovery via Google MailApp, a comprehensive mobile-optimized design system, and a 2FA-secured administrative console capable of ingesting 10,000+ channels.

---

## 🌐 Live Web App

* **Production URL:** [https://script.google.com/macros/s/AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA/exec](https://script.google.com/macros/s/AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA/exec)
* **Deployment Identity:** `USER_DEPLOYING` (executes as owner, publicly accessible)
* **Current Version:** `@10` (SyntaxError fix, explicit window globals & full Mobile UI overhaul)

---

## ⚠️ LEGAL & COMPLIANCE NOTICE

> [!IMPORTANT]
> **StreamFlow is exclusively a catalog index and media player interface. It does NOT host, store, cache, proxy, rebroadcast, or transcode any media streams.**

1. **Zero-Proxy Architecture:** All video streams are played directly in the user's web browser from the original broadcaster's public CDN servers via standard HLS (`.m3u8`) protocols. The Apps Script backend never touches video data.
2. **Public Directory Index:** Stream listings are curated and imported from authorized public community playlists (such as `iptv-org`), cataloging free, publicly accessible broadcasts.
3. **DMCA & Safe Harbor Compliance:** StreamFlow operates under Section 512 of the Digital Millennium Copyright Act (17 U.S.C. § 512). We expeditiously disable or remove any disputed stream links upon notification.
4. **Legal Documentation:**
   - 📜 [Legal Disclaimer](DISCLAIMER.md)
   - 🛡️ [DMCA Policy](DMCA.md)
   - ⚖️ [Terms of Service](TERMS_OF_SERVICE.md)
   - 🔒 [Privacy Policy](PRIVACY_POLICY.md)

---

## ✨ Key Platform Features

### 📺 Viewer Experience & Mobile UI
* **Global Channel Catalog:** Discover thousands of live channels organized across 178 countries and genres (News, Sports, Movies, Music, Documentary, Kids).
* **Direct HLS.js Player:** High-performance HTML5 video player with adaptive bitrate, buffer diagnostics, error recovery, and fullscreen support.
* **Mobile-First Experience:**
  - **2-Column Responsive Grid:** Fluid mobile channel cards with crisp logos, live indicators, and full-width "Watch Live" buttons.
  - **Glassmorphic Bottom Navigation:** Fixed bottom bar with 6 touch targets, active indicators, and iPhone safe-area inset support (`env(safe-area-inset-bottom)`).
  - **Swipeable Category Pills:** Horizontal touch carousel with hidden scrollbars for rapid genre filtering.
  - **Mobile 16:9 Player Layout:** Auto-scaling video container capped at 55vh with stacked metadata and single-tap favorites.
  - **Touch Modals & Floating Toasts:** Centered, auto-scrolling mobile dialogs with touch-padded inputs and floating toast alerts.
* **Instant Search & Filters:** Sub-second search by channel name, country, or category with real-time UI filtering.
* **Favorites & Watch History:** 1-click personal bookmarking and recently watched channels persisted securely in client `localStorage`.

### 👤 User Account & Authentication
* **Member Registration & Login:** Email and password accounts stored with salted SHA-256 password hashing.
* **Password Reset via MailApp:** Automated password reset links dispatched directly to user inboxes with 1-hour expiry tokens.
* **Rate-Limited Email Protection:** Prevents spamming and Google Apps Script daily email quota exhaustion (max 3 reset requests per email per 10 minutes).

### 🛡️ 2FA Admin Management Console
* **Two-Factor Authentication:** Requires Admin Email, Password, and a separate 2FA PIN generating cryptographically signed HMAC-SHA256 session tokens.
* **Direct High-Volume M3U Ingest:** Ingests playlists containing 10,000+ channels directly into Google Sheets in chunks of 2,500 rows.
* **Taxonomy Management:** Live creation, editing, and sorting of categories, countries, and broadcast languages.
* **Audit Activity Logs:** Real-time logging of administrative events (channel updates, logins, imports, backups).
* **Automated Drive Backups:** One-click timestamped database snapshot creation in Google Drive.

---

## 📥 Adding & Ingesting 10,000+ Channels

StreamFlow supports three seamless methods for loading massive channel playlists:

### Method 1: Remote M3U URL Batch Ingest (Recommended)
1. Open StreamFlow and click the **Admin** button (top header or mobile bottom bar).
2. Authenticate with your Admin Email, Password, and 2FA PIN.
3. Click the **Import M3U** button in the top toolbar.
4. In the **Direct Remote M3U URL** section, paste a playlist URL (e.g. `https://iptv-org.github.io/iptv/index.m3u`).
5. Click **Import URL Directly into Database**.
6. The Apps Script backend fetches the playlist via `UrlFetchApp`, parses M3U headers (`#EXTINF`), and writes rows in atomic batches of **2,500 rows** using `LockService` mutex locks to ensure zero timeouts or database collisions.

### Method 2: Direct Google Sheets Bulk Paste
1. Open your Google Drive and open the **`StreamFlow Database`** spreadsheet.
2. Switch to the **`Channels`** sheet tab.
3. Paste rows directly below the frozen header matching the schema:
   `id | name | logo | country | country_code | language | category | description | stream_url | stream_type | is_active | is_featured | sort_order | created_at | updated_at`
4. StreamFlow automatically picks up the new channels on the next query (cache invalidates every 10 minutes, or instantly when updated via Admin UI).

### Method 3: Drag-and-Drop Local M3U File
1. In the Admin **Import M3U** modal, drag any `.m3u` or `.m3u8` file into the upload zone.
2. StreamFlow parses the file client-side, presents a table preview of detected channels, and allows one-click bulk import into the Google Sheet.

---

## 🔒 Security Architecture & Hardening

StreamFlow has undergone a complete security audit and penetration test (v10):

1. **Strict Server-Side Authorization:** Every administrative operation enforces `requireAdmin(token)` on the server. User tokens (`role: 'user'`) are strictly segregated and rejected on admin endpoints.
2. **Global Function Encapsulation:** Internal utility and credential-handling functions append a trailing underscore `_` (e.g. `getSigningSecret_`, `getScriptProperty_`, `setScriptProperty_`), making them invisible and inaccessible via `google.script.run`.
3. **SSRF (Server-Side Request Forgery) Defense:** `validateFetchUrl(url)` blocks requests to loopback (`127.0.0.0/8`), local networks (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), cloud metadata (`169.254.169.254`, `metadata.google.internal`), and non-standard web ports.
4. **Google Sheets Formula Injection Neutralization:** `sanitizeSheetCellValue(val)` prepends `'` to any cell value starting with `=`, `+`, `-`, `@`, `\t`, or `\r`, ensuring data is never executed as spreadsheet formulas.
5. **XSS & DOM Context Breakout Protection:** Initial parameters safely escaped with `\u003c`, image URLs strictly validated to prevent `javascript:` execution, and modal parameters resolved by ID to avoid inline JSON injection.
6. **SyntaxError & ReferenceError Protection:** Standalone helper functions (`handleCardImgError`, `getChannelCardLogoHtml`, `getAdminTableLogoHtml`) and explicit global window exports (`window.Router`, `window.handleAdminBtnClick`, etc.) ensure zero runtime parse crashes in Google Apps Script's sandboxed iframe.
7. **Concurrency Locks:** Mutex locks via `LockService.getScriptLock()` prevent race condition collisions during batch writes.
8. **Timing-Attack Resistance:** `secureCompare()` provides constant-time comparison for HMAC signatures, hashes, and PINs.

---

## 🏛️ System Architecture

```text
                           [ Client Web Browser ]
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
     1. Metadata & Admin Operations            2. Direct HLS Stream Playback
     (google.script.run / Promises)             (Browser HTML5 / HLS.js)
                 │                                       │
                 ▼                                       ▼
     [ Google Apps Script Web App ]             [ Authorized Broadcaster CDN ]
     - Controller & Router (code.gs)             (Akamai, Cloudflare, Fastly)
     - Security & 2FA Auth (security.gs)
     - Business Services (channels, admin)
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
[ Google Sheets DB ]  [ Google Drive ]
  - Channels (CRUD)     - Channel Logos
  - Categories          - Website Assets
  - Countries           - Database Backups
  - Languages           - M3U Ingest Files
  - Settings
  - Users & Admins
  - Activity Logs
```

---

## 📁 Repository Structure

```text
Stream-Flow/
├── StreamFlow/                 # Google Apps Script Project Core
│   ├── appsscript.json         # Manifest, V8 engine, and minimal OAuth scopes
│   ├── code.gs                 # doGet(e), template inclusion, master setup
│   ├── config.gs               # Protected script properties, sheet schemas, defaults
│   ├── database.gs             # Sheets batch DAL, cache invalidation, table schemas
│   ├── channels.gs             # Channel queries, search, CRUD, status & featured toggles
│   ├── categories.gs           # Category querying and admin management
│   ├── countries.gs            # Country querying and admin management
│   ├── languages.gs            # Language querying and admin management
│   ├── admin.gs                # Admin dashboard stats, M3U parser & direct URL ingest
│   ├── driveservice.gs         # Drive folder hierarchy, logo upload, DB backups
│   ├── settings.gs             # Public site configuration & admin settings
│   ├── utils.gs                # SSRF validator, formula neutralizer, secureCompare
│   ├── security.gs             # 2FA login, HMAC session tokens, user auth, reset email
│   │
│   ├── Index.html              # HTML shell, HLS.js CDN, SEO metadata, safe params
│   ├── Styles.html             # Vanilla CSS design system (desktop + comprehensive mobile UI)
│   ├── Scripts.html            # Client API client (Promises), router, player manager, window exports
│   ├── Components.html         # User auth, 2FA admin login, channel forms, modals, toasts
│   ├── Header.html             # Navigation bar, brand logo, search trigger, auth buttons
│   ├── Footer.html             # Responsive footer, legal links, copyright notices
│   ├── Home.html               # Hero banner, featured carousel, category/country pills
│   ├── Browse.html             # Filterable live TV catalog, multi-criteria sorting
│   ├── Watch.html              # Video player view, related channels, diagnostics
│   ├── Favorites.html          # Local personal bookmarks view
│   ├── Search.html             # Real-time search interface
│   └── Reset.html              # Password reset form view with token validation
│
├── docs/                       # Project Documentation
│   ├── ARCHITECTURE.md         # Detailed technical architecture specification
│   ├── DEPLOYMENT.md           # Clasp deployment, setupStreamFlow(), and configuration
│   ├── API.md                  # Comprehensive google.script.run API reference
│   ├── SECURITY.md             # Security audit report, vulnerability matrix & policies
│   └── STREAMS.md              # Stream diagnostics, HLS architecture, and CORS policy
│
├── DISCLAIMER.md               # Legal disclaimer & zero-hosting notice
├── DMCA.md                     # DMCA notice & takedown policy
├── TERMS_OF_SERVICE.md         # Terms of service
├── PRIVACY_POLICY.md           # Privacy policy
├── SECURITY.md                 # Vulnerability disclosure policy
├── LICENSE                     # MIT License
└── package.json                # Project root manifest
```

---

## 🚀 Deployment & Operations Guide

### Prerequisites
* Node.js 18+ and npm
* Google account with Google Sheets and Google Drive access
* Google Apps Script CLI ([`@google/clasp`](https://github.com/google/clasp)):
  ```bash
  npm install -g @google/clasp
  clasp login
  ```

### Pushing Code & Deploying
```bash
# 1. Navigate to the StreamFlow script directory
cd StreamFlow

# 2. Push all 26 source files to Apps Script
clasp push -f

# 3. Deploy new release version to the existing Web App deployment
clasp deploy -i AKfycbzA2Y70HkzRPG2dznStNi7TLI-Riea0uJP7iRIYW872p20FfUzetWCFF_xqNYvPz1eqsA -d "StreamFlow_Production_V10"
```

### Initializing the Database & Drive
Open the Google Apps Script editor, select **`setupStreamFlow`** from the function dropdown, and click **Run**. This will automatically:
1. Create the `StreamFlow` Google Drive folder hierarchy (`Channel Logos`, `Website Assets`, `Backups`).
2. Create and format the `StreamFlow Database` spreadsheet with all 8 sheets and frozen headers.
3. Register your Google account as the Super Admin.
4. Populate starter reference categories, countries, and broadcast languages.

---

## 📄 License & Attribution

* **Source Code:** Released under the [MIT License](LICENSE).
* **Metadata:** Channel metadata sourced from community public playlists under the Unlicense.
* **Logos & Media:** All stream broadcasts, channel logos, and trademarks belong to their respective networks and copyright holders.
