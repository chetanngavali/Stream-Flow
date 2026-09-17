# Security Policy & Vulnerability Disclosure

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

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

* **No Open SSRF:** The server never acts as an open proxy for user-supplied URLs.
* **Helmet Security Headers:** Enforces Content Security Policy, frame options, and XSS filtering.
* **Rate Limiting:** Protects API endpoints against DDoS and abuse.
* **Admin Token Guard:** Administrative endpoints require cryptographic Bearer token authentication.
