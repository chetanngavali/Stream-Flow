# Deployment Guide (Vercel & Self-Hosted)

## 1. Deploying on Vercel (Recommended)

StreamFlow is configured out of the box for monolithic Vercel deployment:

1. Push your code to GitHub:
   ```bash
   git push origin main
   ```
2. In the [Vercel Dashboard](https://vercel.com):
   - Click **Add New Project** → Select `Stream-Flow`.
   - **Framework Preset:** Vite
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `apps/web/dist`
3. Click **Deploy**.

`vercel.json` will automatically route:
- `/api/*` to the serverless function.
- All other routes to the React Single-Page Application with client-side routing fallback.

---

## 2. Self-Hosting with Docker / Node.js

You can also run StreamFlow on any Ubuntu, Debian, or Docker host:

```bash
# Build frontend
npm run build --workspace=apps/web

# Build backend
npm run build --workspace=apps/api

# Run production server
PORT=4000 npm run start --workspace=apps/api
```
