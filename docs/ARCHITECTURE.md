# StreamFlow — Technical Architecture & Engineering Specification

## 1. Architectural Overview

StreamFlow is engineered as a cloud-native, serverless single-page web application running entirely on the **Google Workspace Platform** (Google Apps Script, Google Sheets, Google Drive, and Google MailApp).

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Client Web Browser                              │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │ Single-Page App (SPA) │  │  State Store (Auth,   │  │ HLS.js HTML5    │  │
│  │ Hash Router, Catalog  │  │  Favorites, History)  │  │ Media Engine    │  │
│  └───────────┬───────────┘  └───────────────────────┘  └────────┬────────┘  │
└──────────────┼──────────────────────────────────────────────────┼───────────┘
               │                                                  │
               │ RPC calls (google.script.run)                    │ Direct Video
               ▼                                                  ▼
┌──────────────────────────────────────────────┐        ┌─────────────────────┐
│        Google Apps Script Web App            │        │ Broadcaster Network │
│  (Runtime: V8 Engine | ExecuteAs: Deploying) │        │ (Akamai, Cloudflare)│
│                                              │        └─────────────────────┘
│  ┌────────────────────┐ ┌──────────────────┐ │
│  │ Router (code.gs)   │ │ Security Engine  │ │
│  │ doGet(e), Includes │ │ 2FA, HMAC Tokens │ │
│  └─────────┬──────────┘ └─────────┬────────┘ │
│            │                      │          │
│  ┌─────────▼──────────────────────▼────────┐ │
│  │ Business Services Layer                 │ │
│  │ Channels, Categories, Countries, Admin  │ │
│  └────────────────────┬────────────────────┘ │
│                       │                      │
│  ┌────────────────────▼────────────────────┐ │
│  │ Hardened Data & Infrastructure Layer    │ │
│  │ LockService, CacheService, SSRF Guard   │ │
│  └─────────┬──────────────────────┬────────┘ │
└────────────┼──────────────────────┼──────────┘
             ▼                      ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│ Google Sheets Database  │  │ Google Drive Storage    │
│  - Channels (CRUD)      │  │  - Channel Logos        │
│  - Categories           │  │  - Website Assets       │
│  - Countries            │  │  - Database Backups     │
│  - Languages            │  │  - M3U Ingest Files     │
│  - Settings             │  └─────────────────────────┘
│  - Users & Admins       │
│  - Activity Logs        │
└─────────────────────────┘
```

---

## 2. Core Subsystems

### 2.1 Web App Controller & Serving Engine (`code.gs`)
* **Execution Identity:** Configured with `executeAs: "USER_DEPLOYING"` and `access: "ANYONE"`. This enables anonymous web visitors to query approved channels without needing explicit individual Google account permissions.
* **Clickjacking Protection:** Enforces `setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)` to prevent unauthorized framing.
* **Modular Include Templating:** HTML components (`Styles.html`, `Scripts.html`, `Components.html`, `Header.html`, `Home.html`, etc.) are modularized and dynamically evaluated into `Index.html` via `HtmlService.createHtmlOutputFromFile().getContent()`.

### 2.2 Relational Data Layer via Google Sheets (`database.gs`, `channels.gs`)
Google Sheets acts as the high-speed structured persistence tier:
* **Batch Operations:** All read and write operations use multi-row batch ranges (`getValues()`, `setValues()`) rather than individual cell calls to maximize throughput.
* **Schema Freeze & Formatting:** Header rows are frozen and styled upon initialization.
* **Object Mapping:** The DAL translates 2D array ranges into JSON objects mapped to canonical column definitions (`DATABASE_SCHEMAS`).
* **High-Volume Chunker:** M3U imports with 10,000+ rows are partitioned into chunks of 2,500 rows to prevent execution timeouts.

### 2.3 Two-Tier Identity & Authorization (`security.gs`)
StreamFlow enforces strict cryptographic segregation between standard users and administrators:

```text
                                 [ Incoming Request ]
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
        [ User Session Token ]                        [ Admin Session Token ]
        - payload.role = 'user'                       - payload.role = 'admin'
        - Signed with HMAC-SHA256                     - Signed with HMAC-SHA256
        - 30-day validity                             - 24-hour validity
        - Granted: Profile, Favorites                 - Must match isAuthorizedAdmin()
                   │                                             │
                   ▼                                             ▼
      [ REJECTED on Admin APIs ]                    [ ACCEPTED on Admin APIs ]
```

* **Standard User Authentication:**
  - Password hashing uses salted SHA-256 (`Utilities.computeDigest`).
  - Session tokens carry `role: 'user'` and cannot authenticate for administrative operations.
  - Password reset links use 64-character unguessable tokens with 1-hour expiry timestamps.
* **Admin 2FA Authentication:**
  - Requires Admin Email, Password, and a separate 4-to-8 digit 2FA Security PIN.
  - Issues cryptographic HMAC-SHA256 signed session tokens carrying `role: 'admin'`.
  - Every mutating endpoint calls `requireAdmin(token)` on the server.
* **Google Account Native Identity:**
  - Deploying owners and Google Workspace admins can authenticate directly via `Session.getActiveUser().getEmail()` if matching `ADMIN_EMAILS`.

### 2.4 Hardened Security Layer (`utils.gs`)
* **Function Visibility Encapsulation:** Internal methods append a trailing underscore `_` (`getScriptProperty_`, `setScriptProperty_`, `getSigningSecret_`, `hashPassword_`). Under Apps Script HTML Service, functions ending in `_` are completely invisible to client scripts and cannot be called via `google.script.run`.
* **SSRF Defense:** `validateFetchUrl(url)` inspects protocol, hostname, and port prior to `UrlFetchApp.fetch()`. Blocks loopback (`127.0.0.0/8`, `localhost`), link-local and cloud metadata (`169.254.169.254`, `metadata.google.internal`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and non-standard ports.
* **Formula Injection Neutralization:** `sanitizeSheetCellValue(val)` prepends `'` to any string beginning with `=`, `+`, `-`, `@`, `\t`, or `\r`.
* **Timing-Attack Resistance:** `secureCompare(a, b)` performs constant-time byte-by-byte XOR comparison for token signatures and passwords.
* **Concurrency Locks:** Mutex locks via `LockService.getScriptLock()` prevent race conditions during bulk writes.

### 2.5 Streaming Architecture
* **Zero Video Proxying:** StreamFlow NEVER acts as a media proxy or relay.
* **Client-Side HLS Engine:** The client browser uses `HLS.js` directly against the broadcaster's authorized streaming servers.
* **Adaptive Bitrate:** Automatically selects optimal stream bitrate based on the client's current bandwidth.

### 2.6 Client-Side UI & Mobile Architecture (`Styles.html`, `Scripts.html`, `Header.html`)
* **Responsive 2-Column Mobile Grid:** On viewports $\le 768\text{px}$, the channel catalog automatically transitions to a 2-column card layout (`grid-template-columns: repeat(2, 1fr)`) with compact badges, logos, truncated channel titles, and full-width "Watch Live" touch targets.
* **Glassmorphic Bottom Navigation:** Fixed bottom bar featuring safe-area inset support for modern mobile devices (`env(safe-area-inset-bottom)`), active route indicators, and 6 evenly spaced touch targets (Home, Live TV, Search, Favorites, Account, Admin).
* **Horizontal Touch Carousel:** Categories and tags render as a horizontal touch-scrollable pill container (`overflow-x: auto; -webkit-overflow-scrolling: touch;`) with hidden scrollbars for swipeable filtering.
* **16:9 Mobile Video Player:** Auto-scaling video container capped at 55vh with stacked metadata, full-width favorite toggle, and adaptive related channels list.
* **Explicit Global Window Exports:** Singletons and event handlers (`window.Router`, `window.handleAdminBtnClick`, `window.handleUserAuthBtnClick`, `window.openModal`, `window.closeModal`, etc.) are explicitly attached to `window` to ensure inline HTML event handlers in the sandbox iframe always resolve without `ReferenceError`.
* **Safe Logo Error Handlers:** Image error fallbacks use dedicated helper functions (`handleCardImgError`, `getChannelCardLogoHtml`, `getAdminTableLogoHtml`) without multi-level template literal nesting, preventing unescaped newline `SyntaxError`s in browser JS engines.

### 2.7 Google Apps Script Iframe & Sandbox Communication
* **Warden Proxy Protocol:** Google Apps Script HTML Service wraps user code inside a sandboxed iframe (`https://n-*.script.googleusercontent.com/userCodeAppPanel`) embedded within the outer Apps Script page (`https://script.google.com`).
* **Handshake Reliability:** Parent-to-iframe communication operates via `postMessage`. By eliminating client-side syntax errors during script evaluation, the user panel initializes promptly and maintains a stable postMessage handshake with the Google Warden security proxy.

