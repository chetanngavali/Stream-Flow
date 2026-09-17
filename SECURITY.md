# Security Policy & Vulnerability Disclosure

## Supported Versions

| Version | Status | Security Model |
|---|---|---|
| **v9 (Current)** | :white_check_mark: Supported | Full 2FA, SSRF defense, Formula Injection neutralization, Segregated HMAC tokens, Concurrency locks |
| < v9 | :x: Deprecated | Upgrade to v9 recommended |

---

## Reporting a Security Vulnerability

If you discover a security vulnerability or sensitive issue in StreamFlow:

1. **Do NOT open a public GitHub issue.**
2. Report the vulnerability privately via GitHub Security Advisories:  
   [https://github.com/chetanngavali/Stream-Flow/security/advisories](https://github.com/chetanngavali/Stream-Flow/security/advisories)
3. Please include:
   - Detailed description of the vulnerability.
   - Proof-of-concept code or step-by-step instructions.
   - Potential impact.

We commit to acknowledging receipt within 48 hours and deploying a remediation release promptly.

---

## Security Architectural Safeguards in StreamFlow

* **Strict Server-Side Authorization:** Mutating operations require cryptographically signed HMAC-SHA256 admin tokens (`role: 'admin'`) or active Google Workspace admin identity. Regular user tokens cannot authenticate for admin functions.
* **Internal Function Encapsulation:** Critical helpers append a trailing underscore `_` (`getScriptProperty_`, `setScriptProperty_`, `getSigningSecret_`), completely blocking client invocation via `google.script.run`.
* **Zero Video Proxying:** StreamFlow never proxies, stores, or relays video streams; browser plays directly via HLS.js.
* **SSRF Defense:** Remote M3U URL requests pass through `validateFetchUrl()` which blocks loopback, cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), and private IP ranges.
* **Google Sheets Formula Injection Neutralization:** All sheet cell writes starting with `=`, `+`, `-`, or `@` are neutralized with prepended single quotes (`'`).
* **Timing-Attack Resistance:** Uses constant-time `secureCompare()` for HMAC signatures, hashes, and PINs.
* **Concurrency Protection:** Mutex locks via `LockService.getScriptLock()` prevent race conditions during bulk writes.
* **Email Rate Limiting:** Password reset requests are limited to 3 per email per 10 minutes via `CacheService` to prevent quota abuse.
