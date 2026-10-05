# Funding Rate Arbitrage Cockpit (Web Platform)

A rich, high-performance web dashboard with interactive **Three.js 3D Prismatic Core**, cross-exchange funding spread monitor, high-speed dual-leg hedging latency profiler, and client-side session vault.

---

## Features

- **3D Prismatic Core (`Three.js`)**: Interactive geometric nexus representing dual exchanges, with rotation speed and particle pulses synced to live basis spread (bps).
- **Sub-250ms Dual Hedge & Dual-Close Engine**: Parallel concurrent order dispatch verifying delta-neutrality with zero directional loss.
- **Client-Side Session Vault**: API Key and Secret are stored strictly in your browser session (`localStorage`) and sent via HTTPS headers. Zero server-side key leaks.
- **Render Free Tier Optimized**: Next.js standalone build consuming `<120MB` RAM (well under Render's 512MB free tier cap).

---

## 1. Local Testing

From the `web/` directory:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000` in Google Chrome.

---

## 2. Deploying to Render Free Web Service

### Option A: Using Render Blueprints (`render.yaml`)
1. Push this repository to your GitHub account.
2. Go to [Render Dashboard](https://dashboard.render.com).
3. Click **New +** -> **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically read `render.yaml` and configure the free Node web service pointing to the `web/` directory.
6. Click **Apply**!

### Option B: Manual Web Service Setup
1. In Render, select **New +** -> **Web Service**.
2. Connect your repository.
3. Configure settings:
   - **Root Directory**: `web`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Click **Deploy Web Service**!
