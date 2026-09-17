# StreamFlow REST API Reference

Base URL: `/api` (or `http://localhost:4000/api` locally)

---

## Channels API

### 1. List Channels
`GET /api/channels`

**Query Parameters:**
* `page` (number, default: `1`)
* `limit` (number, default: `50`, max: `100`)
* `search` (string, case-insensitive title/country/category match)
* `country` (string, ISO-2 country code e.g. `US`, `IN`, `GB`)
* `category` (string, e.g. `News`, `Sports`, `Movies`)
* `status` (string: `live` | `offline`)
* `featured` (boolean: `true` | `false`)
* `sort` (string: `name` | `country` | `category`)
* `order` (string: `asc` | `desc`)

**Response:**
```json
{
  "data": [
    {
      "id": "ch_7f8c10e5",
      "name": "00s Replay",
      "streamUrl": "https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/...",
      "logo": "https://i.imgur.com/...",
      "country": "United States",
      "countryCode": "US",
      "category": "Movies",
      "status": "live"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 11107,
    "totalPages": 223,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 2. Get Channel by ID
`GET /api/channels/:id`

### 3. Featured Channels
`GET /api/channels/featured`

---

## Metadata API

### 4. Countries Summary
`GET /api/countries`

### 5. Categories Summary
`GET /api/categories`

### 6. Health & Diagnostic Check
`GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "uptime": 1420.5,
  "timestamp": "2026-09-17T21:45:00.000Z",
  "channelsLoaded": 11107
}
```

---

## Admin API (Protected by Bearer Token)

* `GET /api/admin/channels`: View all channel overrides.
* `PATCH /api/admin/channels/:id`: Update channel status (enable, disable, feature).
* `POST /api/admin/playlist/refresh`: Force immediate playlist ingestion.
* `GET /api/admin/audit-logs`: Review administrative action logs.
