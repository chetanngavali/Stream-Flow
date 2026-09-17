# StreamFlow Architecture & Engineering Specification

## 1. High-Level Architecture

StreamFlow is built as a production monorepo containing:
- **`apps/web`**: Frontend Single-Page Application (React 19, TypeScript, Tailwind CSS, Vite).
- **`apps/api`**: Backend Node.js / Express API service with M3U ingestion, in-memory caching, and administrative controllers.
- **`packages/shared`**: Shared TypeScript contracts, interfaces, and data models.
- **`api/`**: Vercel Serverless Function entrypoints.

```
┌────────────────────────────────────────────────────────┐
│                   User Web Browser                     │
│  - React 19 UI (Catalog, Navigation, Filters)          │
│  - HLS.js Direct Engine (Plays streams directly)      │
│  - LocalStorage (Favorites & History)                  │
└──────────────────────────┬─────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
    Metadata Requests (JSON)       Direct Video Traffic (HLS)
            │                             │
            ▼                             ▼
  ┌───────────────────┐        ┌─────────────────────────┐
  │ StreamFlow API    │        │ Public Broadcaster CDN  │
  │ (Express/Vercel)  │        │ (Akamai, Cloudflare...) │
  └─────────┬─────────┘        └─────────────────────────┘
            │
            ▼
  ┌───────────────────┐
  │ In-Memory Cache   │
  └─────────┬─────────┘
            │
            ▼
  ┌───────────────────┐
  │ iptv-org M3U Feeds│
  └───────────────────┘
```

---

## 2. Ingestion & Cache Engine

1. **Scheduled & Lazy Ingestion:**
   - The playlist ingester checks `https://iptv-org.github.io/iptv/index.m3u`.
   - Caches parsed channels in memory with sub-millisecond query execution.
   - Saves backup to disk (`os.tmpdir()`) to prevent cold-start delays on serverless platforms.
2. **Deterministic ID Generation:**
   - Stream URLs and `tvg-id` are hashed to form deterministic SHA-256 IDs (`ch_xxxxxxxx`), ensuring bookmark stability across restarts.
3. **Country & Category Resolution:**
   - Country codes are parsed from `tvg-id` and resolved to 178 full localized nation names via `Intl.DisplayNames`.
   - Channels are mapped to 35 standard genres.
