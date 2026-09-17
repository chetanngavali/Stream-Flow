# Stream Diagnostics, HLS Architecture & CORS Policy

## 1. How StreamFlow Plays Video

StreamFlow uses **HLS.js** (HTTP Live Streaming) directly in modern browsers to render `.m3u8` playlists and MPEG-TS / fragmented MP4 chunks.

```
[Browser HTML5 Video] <─── HLS.js Engine <─── (Direct CORS GET) <─── [Broadcaster CDN]
```

---

## 2. CORS (Cross-Origin Resource Sharing)

Because playback is browser-direct:
* A public stream must send standard CORS headers (`Access-Control-Allow-Origin: *`) to be playable in web browsers.
* Approximately 60–70% of channels in public IPTV playlists include open CORS headers.
* Streams that restrict CORS cannot be played in a web browser without proxying. In strict compliance with copyright laws and anti-SSRF security guidelines, **StreamFlow intentionally does NOT proxy media chunks**.
* When a stream fails due to CORS, geo-blocking, or offline status, StreamFlow gracefully flags the issue, presents actionable diagnostic messages, and suggests alternative channels from the same genre or country.
