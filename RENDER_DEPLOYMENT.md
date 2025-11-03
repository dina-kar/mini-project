# Render.com Deployment Guide

Complete guide to deploy your biomedical sensor system to Render.com

## 📋 Overview

**What we'll deploy:**
- Backend (WebSocket server) on Render
- Frontend (React app) on Render
- ESP32 connects to deployed backend via WSS (secure WebSocket)

## 🌐 Render.com WebSocket Details

### Important: WebSocket Configuration

**For Render.com WebSocket connections:**
- **Protocol**: Use `wss://` (secure WebSocket) NOT `ws://`
- **Port**: Port 443 (HTTPS/WSS default) - Render handles this automatically
- **URL Format**: `wss://your-app-name.onrender.com`

**You do NOT specify a port** - Render automatically handles:
- HTTP/HTTPS on port 443
- WebSocket/WSS on port 443
- All SSL/TLS certificates

---

## 🚀 Part 1: Deploy Backend (WebSocket Server)

### Step 1: Prepare Backend for Render

First, update `backend/package.json`:

```json
{
  "name": "backend",
  "version": "1.0.0",
  "description": "WebSocket server for biomedical sensor data",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "ws": "^8.14.2"
  }
}
```

### Step 2: Update Backend for Production

Edit `backend/index.js` to use environment variables:

```javascript
// At the top of the file, replace:
const PORT = 8080;

// With:
const PORT = process.env.PORT || 8080;
```

### Step 3: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub (recommended) or email
3. Verify your email

### Step 4: Deploy Backend to Render

1. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository (or use "Public Git Repository")
   - If using public repo, enter: `https://github.com/yourusername/yourrepo.git`

2. **Configure Service**
   - **Name**: `health-monitor-backend` (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: `main` or `master`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install` or `pnpm install`
   - **Start Command**: `npm start`

3. **Environment Variables** (optional)
   - Click "Advanced"
   - Add: `PORT` = `8080` (Render overrides this anyway)

4. **Instance Type**
   - Free tier is sufficient for testing
   - Paid tier for production use

5. **Click "Create Web Service"**

6. **Wait for Deployment** (3-5 minutes)
   - Watch the logs
   - Look for: "Your service is live 🎉"

7. **Get Your Backend URL**
   - Will be: `https://health-monitor-backend.onrender.com`
   - Note: HTTPS is automatic

---

## 🎨 Part 2: Deploy Frontend (React App)

### Step 1: Prepare Frontend for Render

Create `frontend/heart-rate-monitor/package.json` build script (already exists):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  }
}
```

### Step 2: Update Frontend Default WebSocket URL

Edit `frontend/heart-rate-monitor/src/App.tsx`:

```typescript
// Change the default wsUrl to your deployed backend
const [wsUrl, setWsUrl] = useState('wss://health-monitor-backend.onrender.com')
```

**Important:** Use `wss://` not `ws://` for secure WebSocket!

### Step 3: Deploy Frontend to Render

1. **Create New Static Site**
   - Click "New +" → "Static Site"
   - Connect repository

2. **Configure Static Site**
   - **Name**: `health-monitor-frontend`
   - **Branch**: `main` or `master`
   - **Root Directory**: `frontend/heart-rate-monitor`
   - **Build Command**: `pnpm install && pnpm build`
   - **Publish Directory**: `dist`

3. **Environment Variables** (if needed)
   - Add `NODE_VERSION` = `18` (optional)

4. **Click "Create Static Site"**

5. **Wait for Deployment** (2-3 minutes)

6. **Get Your Frontend URL**
   - Will be: `https://health-monitor-frontend.onrender.com`

---

## 🔧 Part 3: Configure ESP32

### Update ESP32 WebSocket Configuration

Edit `esp_32_web.ino`:

```cpp
// WiFi Configuration (use your local WiFi)
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket Configuration - UPDATE THESE
const char* ws_host = "health-monitor-backend.onrender.com";  // Your Render backend URL
const int ws_port = 443;                                       // HTTPS/WSS port
const char* ws_path = "/";

// Use SECURE WebSocket client
#include <WebSocketsClient.h>

// In setupWebSocket() function, use:
webSocket.beginSSL(ws_host, ws_port, ws_path);  // Note: beginSSL for wss://
```

**Important Changes:**
- `ws_host`: Your Render backend URL (WITHOUT `https://` or `wss://`)
- `ws_port`: `443` (not 8080)
- Use `beginSSL()` instead of `begin()` for secure connection

---

## 📝 Complete Configuration Summary

### For ESP32 (in `esp_32_web.ino`)

```cpp
// Example configuration for Render.com deployment
const char* ssid = "MyHomeWiFi";
const char* password = "MyWiFiPassword";
const char* ws_host = "health-monitor-backend.onrender.com";  // NO https:// prefix
const int ws_port = 443;                                       // WSS port
const char* ws_path = "/";
```

### For Frontend (in `App.tsx`)

```typescript
// Default WebSocket URL
const [wsUrl, setWsUrl] = useState('wss://health-monitor-backend.onrender.com')
```

### URLs Summary

| Service | URL | Protocol |
|---------|-----|----------|
| Backend API | `https://health-monitor-backend.onrender.com` | HTTPS |
| Backend WebSocket | `wss://health-monitor-backend.onrender.com` | WSS (Secure WebSocket) |
| Frontend | `https://health-monitor-frontend.onrender.com` | HTTPS |

---

## 🧪 Testing Deployment

### 1. Test Backend Health

```bash
curl https://health-monitor-backend.onrender.com/health
```

Expected response:
```json
{"status":"ok","clients":0,"uptime":1.234}
```

### 2. Test Frontend

1. Open: `https://health-monitor-frontend.onrender.com`
2. Should see the Health Monitor UI
3. WebSocket URL should be pre-filled
4. Click "Connect"
5. Should see "● Online"

### 3. Test ESP32 Connection

1. Upload configured sketch to ESP32
2. Open Serial Monitor
3. Should see:
   ```
   [WiFi] ✓ Connected!
   [WiFi] IP Address: 192.168.x.x
   [WebSocket] ✓ Connected to server
   ```

4. Place finger on sensor
5. Data should appear in:
   - ESP32 Serial Monitor
   - Backend Render logs
   - Frontend web UI

---

## ⚙️ Environment Variables (Optional)

### Backend Environment Variables on Render

In Render Dashboard → Your Backend Service → Environment:

```
PORT=8080
NODE_ENV=production
```

### Frontend Build Environment Variables

In Render Dashboard → Your Frontend Static Site → Environment:

```
NODE_VERSION=18
VITE_WS_URL=wss://health-monitor-backend.onrender.com
```

Then update `App.tsx`:
```typescript
const [wsUrl, setWsUrl] = useState(
  import.meta.env.VITE_WS_URL || 'wss://health-monitor-backend.onrender.com'
)
```

---

## 🔒 Important Security Notes

### For Production Deployment:

1. **Update Encryption Keys**
   - Change from all-zero keys to proper random keys
   - Keep keys secure (use environment variables)

2. **Add Authentication**
   - Implement WebSocket authentication tokens
   - Verify ESP32 clients before accepting data

3. **Enable CORS Properly**
   - In `backend/index.js`, configure CORS for your frontend domain:
   ```javascript
   app.use(cors({
     origin: 'https://health-monitor-frontend.onrender.com'
   }));
   ```

4. **Rate Limiting**
   - Add rate limiting to prevent abuse
   - Use `express-rate-limit` package

---

## 🐛 Troubleshooting

### Backend Won't Start
- Check Render logs: Dashboard → Your Service → Logs
- Verify `package.json` has correct `start` script
- Ensure all dependencies are in `dependencies` not `devDependencies`

### WebSocket Connection Failed (ESP32)
- Verify you're using `beginSSL()` not `begin()`
- Check port is 443, not 8080
- Ensure host doesn't include `https://` or `wss://`
- Install ESP32 SSL certificates if needed

### Frontend Won't Connect
- Check browser console for errors (F12)
- Verify WebSocket URL uses `wss://` not `ws://`
- Test backend health endpoint first
- Check CORS configuration

### Render Free Tier Limitations
- Services sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds
- Upgrade to paid tier for 24/7 availability

---

## 💰 Cost Breakdown

### Free Tier (Render)
- **Backend**: Free (with limitations)
  - Sleeps after 15 min inactivity
  - 750 hours/month free
- **Frontend**: Free (static site)
- **Total**: $0/month

### Paid Tier (Recommended for 24/7)
- **Backend**: $7/month (Starter)
  - Always on
  - No sleep
  - 512MB RAM
- **Frontend**: Free (static)
- **Total**: $7/month

---

## 📱 Alternative: Using ngrok for Testing

If you want to test without deploying:

### 1. Install ngrok
```bash
npm install -g ngrok
```

### 2. Start Backend Locally
```bash
cd backend
pnpm start
```

### 3. Create Public URL
```bash
ngrok http 8080
```

### 4. Get WebSocket URL
- ngrok shows: `https://abc123.ngrok.io`
- Use in ESP32: `wss://abc123.ngrok.io`
- Port: 443

**Note:** ngrok URLs change each time (free tier)

---

## ✅ Final Checklist

- [ ] Backend deployed to Render
- [ ] Backend health endpoint returns OK
- [ ] Frontend deployed to Render
- [ ] Frontend loads in browser
- [ ] ESP32 code updated with Render URLs
- [ ] ESP32 uses `wss://` and port 443
- [ ] ESP32 connects successfully
- [ ] Sensor data flows through system
- [ ] Frontend displays real-time data
- [ ] Charts update smoothly

---

## 🎉 Success!

Once all steps are complete:

1. **Frontend URL**: `https://your-frontend.onrender.com`
2. **Backend URL**: `wss://your-backend.onrender.com`
3. **ESP32**: Connects via WiFi to Render backend
4. **Data Flow**: MAX30102 → ESP32 → FPGA → Render Backend → Render Frontend

Your biomedical sensor system is now deployed globally! 🌍

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [WebSocket over WSS](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ESP32 WebSocket SSL](https://github.com/Links2004/arduinoWebSockets)

---

**Need Help?**
- Check Render logs for errors
- Test each component individually
- Verify all URLs and ports
- Ensure SSL/TLS is working
