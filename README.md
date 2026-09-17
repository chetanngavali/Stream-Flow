# StreamFlow — Modern Web-Based Live TV Streaming Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com/)

> **StreamFlow** is a production-quality, web-based Live TV & IPTV streaming catalog application built with **React 19, TypeScript, Node.js/Express**, and **HLS.js**. It ingests public broadcast metadata from the open-source community playlist (`iptv-org`), providing a Netflix/YouTube TV-caliber streaming experience directly in modern browsers.

---

## ⚠️ LEGAL & DMCA SAFE HARBOR NOTICE

> [!IMPORTANT]
> **StreamFlow is exclusively a catalog directory and media player interface. It does NOT host, store, cache, proxy, rebroadcast, or transcode any media streams.**

1. **Zero-Hosting Architecture:** All video streams are played directly in the client's browser from the original broadcaster's publicly accessible servers via standard HLS (`.m3u8`) protocols.
2. **Public Directory Source:** Stream listings are parsed from the open-source community playlist (`https://iptv-org.github.io/iptv/index.m3u`), which strictly catalogs free, publicly available web broadcasts.
3. **DMCA & Safe Harbor Compliance:** StreamFlow operates under Section 512 of the Digital Millennium Copyright Act (17 U.S.C. § 512) as an information location tool. We expeditiously remove or disable any disputed stream URL upon notice.
4. **Full Documentation:**
   - 📜 [Legal Disclaimer & Architecture Notice](DISCLAIMER.md)
   - 🛡️ [DMCA Notice & Takedown Policy](DMCA.md)
   - ⚖️ [Terms of Service](TERMS_OF_SERVICE.md)
   - 🔒 [Privacy Policy](PRIVACY_POLICY.md)

---

## ✨ Key Features

* **Live TV Catalog:** Discover 11,000+ channels across 178 countries and 35+ genres.
* **Direct HLS Playback:** Built-in player powered by `hls.js` with auto quality switching, buffering diagnostics, fullscreen, picture-in-picture, and keyboard shortcuts.
* **Geographic & Scale Filters:**
  - Regional filter pills: North America, Europe, Asia, Latin America, Middle East, Africa, Oceania.
  - Broadcast volume scale: Major Hubs (100+ channels), Mid-Tier, Regional.
  - Multi-criteria sorting: Most Channels, Fewest Channels, A–Z, Z–A.
* **Personal Library:** 1-click Favorites and Recently Watched channels persisted securely in client `localStorage`.
* **Zero-Latency In-Memory Caching:** Backend memory cache with sub-millisecond filtering, search, and pagination.
* **Admin Governance Console:** Channel status overrides (mark dead/hidden/live), playlist cache refreshes, and structured audit logging.
* **Vercel Serverless Ready:** Built with serverless adapters (`/api/index.ts` and `vercel.json`) using `os.tmpdir()` for safe ephemeral storage.

---

## 🏛️ Architecture Overview

```
                        [ End User Browser ]
                                 │
                 ┌───────────────┴──────────────┐
                 │                              │
     1. Metadata Request (JSON)       2. Direct Video Stream (HLS)
                 │                              │
                 ▼                              ▼
     [ StreamFlow API / Vercel ]    [ Third-Party Broadcaster ]
                 │                  (Akamai, Cloudflare, Fastly)
                 ▼
     [ In-Memory Playlist Cache ]
                 │
                 ▼
   [ iptv-org/iptv Public Index ]
```

---

## 🚀 Quickstart (Local Development)

### Prerequisites
- Node.js 18+ or 20+
- npm 9+

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/chetanngavali/Stream-Flow.git
cd Stream-Flow

# 2. Install dependencies across client and server
npm install

# 3. Start development servers concurrently
npm run dev
```

* **Frontend:** `http://localhost:5173`
* **Backend API:** `http://localhost:4000/api/channels`
* **Health Check:** `http://localhost:4000/api/health`

### Running Automated Tests

```bash
# Run unit & integration tests
npm test --workspace=server
```

---

## ☁️ Deployment on Vercel

1. Fork or push this repository to GitHub: `https://github.com/chetanngavali/Stream-Flow`.
2. Navigate to [Vercel Dashboard](https://vercel.com) → **Add New Project** → Import `Stream-Flow`.
3. Configure Project Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `client/dist`
4. Deploy! Vercel automatically maps `/api/*` to the serverless function and `/*` to the client bundle.

---

## 📄 License & Attribution

* **Software Code:** Licensed under the [MIT License](LICENSE).
* **Channel Metadata:** Sourced from the community-driven [iptv-org](https://github.com/iptv-org/iptv) project under the Unlicense.
* **Station Logos & Streams:** All media streams and logos belong to their respective copyright owners and networks.
