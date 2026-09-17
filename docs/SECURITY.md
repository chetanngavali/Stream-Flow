# StreamFlow — Security Policy & Audit Specification

## 1. Security Philosophy & Threat Model

StreamFlow is designed with defense-in-depth principles tailored specifically to the Google Apps Script execution model. The core boundary assumptions are:

* **Untrusted Clients:** The web browser client is completely untrusted. No client-side variable (e.g. `isAdmin`, `role`) is ever trusted by the backend.
* **Public vs Admin Segregation:** Anonymous viewers can read approved public channels and execute HLS streams directly. All administrative operations require cryptographically signed HMAC-SHA256 session tokens with verified administrator email addresses.
* **Zero Video Proxying:** StreamFlow never proxies, relays, or caches media streams on Google servers. Stream playback occurs 100% direct from broadcaster servers in the client browser via HLS.js.

---

## 2. Hardened Security Safeguards

### 2.1 Server-Side Authorization & Privilege Escalation Defense
* Standard member accounts and administrators use strictly segregated token structures:
  - User session tokens contain `role: 'user'`.
  - Admin session tokens contain `role: 'admin'` and an authorized administrator email.
* `requireAdmin(token)` strictly rejects any token with `role !== 'admin'` or with an email not present in `ADMIN_EMAILS` or the `Admins` sheet.
* Constant-time comparison `secureCompare(a, b)` prevents timing side-channel attacks during HMAC signature, password hash, and 2FA PIN verification.

### 2.2 Global Function Exposure Mitigation
* Under Google Apps Script HTML Service, any globally defined function in a `.gs` file without a trailing underscore `_` is callable by clients via `google.script.run`.
* All sensitive configuration, credential handlers, and private internal utilities are suffixed with a trailing underscore:
  - `getScriptProperty_()`, `setScriptProperty_()`
  - `getSpreadsheetId_()`, `getAdminEmails_()`
  - `getSigningSecret_()`, `hashPassword_()`
  - `ensureAdminCredentialsInitialized_()`
  - `isValidAdminSessionToken_()`
* The Google Apps Script runtime strictly blocks client calls to any function ending in `_`.

### 2.3 Server-Side Request Forgery (SSRF) Protection
* All remote playlist fetches (`UrlFetchApp.fetch`) pass through `validateFetchUrl(url)`.
* Enforces HTTP/HTTPS protocols and restricts to standard web ports (80, 443, 8080, 8443).
* Rejects loopback addresses (`127.0.0.0/8`, `localhost`, `[::1]`).
* Rejects Google Cloud and AWS/Azure metadata services (`169.254.169.254`, `metadata.google.internal`).
* Rejects private subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).

### 2.4 Google Sheets Formula Injection Neutralization
* Untrusted user inputs, channel titles, categories, descriptions, or M3U metadata starting with trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are neutralized using `sanitizeSheetCellValue(val)`.
* Prepending a single quote (`'`) forces Google Sheets to treat the cell value as plain text, eliminating formula execution (`=IMPORTXML(...)`, `=HYPERLINK(...)`) when viewed in Google Sheets.

### 2.5 Cross-Site Scripting (XSS) & DOM Context Sanitization
* In `Index.html`, initial route parameters are embedded with `<` escaped as `\u003c`, eliminating script tag breakout via `</script><script>alert(1)</script>`.
* In `Scripts.html`, logo URLs are validated to ensure schemes begin with `http://`, `https://`, or `/`.
* Channel table editing resolves channels from memory by ID instead of serializing raw JSON into inline HTML event attributes.
* Country and category navigation clicks use `decodeURIComponent(encodeURIComponent(...))` to eliminate quote breakout vulnerabilities.

### 2.6 Concurrency & Race Condition Mutexes
* Mutating database operations (channel creation, updates, deletes, M3U imports, user registration, and password resets) are guarded with `LockService.getScriptLock()` to serialize writes and prevent row collisions.

### 2.7 Rate Limiting & Quota Abuse Protection
* Automated password reset requests via `sendPasswordResetEmail(email)` are rate-limited to at most 3 requests per email per 10 minutes using `CacheService`.
* Confirmation responses return identical status messages regardless of account existence to prevent user enumeration.

### 2.8 Safe Asset Uploads
* Logo uploads via `uploadChannelLogo` are restricted to raster formats (`image/png`, `image/jpeg`, `image/webp`). SVG is prohibited to prevent embedded script execution.
* Decoded byte size is capped at 3MB.

---

## 3. Vulnerability Disclosure Policy

If you identify a potential security issue in StreamFlow:

1. **Do NOT disclose publicly or file a public GitHub issue.**
2. Report the vulnerability privately through GitHub Security Advisories:
   [https://github.com/chetanngavali/Stream-Flow/security/advisories](https://github.com/chetanngavali/Stream-Flow/security/advisories)
3. Please provide:
   - Vulnerability description and classification.
   - Exact steps or proof-of-concept payload.
   - Affected file(s) and proposed remediation if available.

We commit to acknowledging reports within 48 hours and deploying remediations expeditiously.
