# 🚀 Quick Deployment Reference Card

## Render.com Configuration Cheat Sheet

### ⚡ Key Points
- **Protocol**: Use `wss://` (secure WebSocket) for production
- **Port**: 443 (automatic on Render, DO NOT specify in URL)
- **No port number needed** in WebSocket URL

---

## 📋 ESP32 Configuration

### For Render.com Deployment:

```cpp
// WiFi Settings
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket Settings (IMPORTANT!)
const char* ws_host = "your-backend-name.onrender.com";  // NO https:// or wss://
const int ws_port = 443;                                  // WSS port (not 8080!)
const char* ws_path = "/";

// Use SSL WebSocket
webSocket.beginSSL(ws_host, ws_port, ws_path);  // Use beginSSL, not begin!
```

### For Local Testing:

```cpp
const char* ws_host = "192.168.1.100";  // Your local IP
const int ws_port = 8080;
const char* ws_path = "/";

webSocket.begin(ws_host, ws_port, ws_path);  // Use begin for local
```

---

## 🌐 Frontend Configuration

### Change WebSocket URL in `App.tsx`:

**For Production (Render):**
```typescript
const [wsUrl, setWsUrl] = useState('wss://your-backend-name.onrender.com')
```

**For Local Development:**
```typescript
const [wsUrl, setWsUrl] = useState('ws://localhost:8080')
```

---

## 📦 Render.com Settings

### Backend Web Service:
```yaml
Name: health-monitor-backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Root Directory: backend
```

**Result URL:** `https://health-monitor-backend.onrender.com`
**WebSocket URL:** `wss://health-monitor-backend.onrender.com` (port 443 automatic)

### Frontend Static Site:
```yaml
Name: health-monitor-frontend  
Build Command: pnpm install && pnpm build
Publish Directory: dist
Root Directory: frontend/heart-rate-monitor
```

**Result URL:** `https://health-monitor-frontend.onrender.com`

---

## ✅ Connection Flow

```
ESP32 (WiFi) 
  ↓ wss://your-backend.onrender.com:443
Backend (Render)
  ↓ wss://your-backend.onrender.com (from browser)
Frontend (Render)
```

---

## 🔧 Common Issues

### ❌ ESP32 Won't Connect
**Check:**
- Using `beginSSL()` not `begin()`
- Port is 443, not 8080
- Host has NO `wss://` prefix
- WiFi is connected

### ❌ Frontend Can't Connect
**Check:**
- URL starts with `wss://` not `ws://`
- Backend is deployed and running
- No port number in URL
- CORS is enabled in backend

### ❌ Render Service Sleeping
**Solution:**
- Free tier sleeps after 15 min
- Upgrade to $7/month for 24/7
- Or accept 30-second wake-up time

---

## 💡 Pro Tips

1. **Test Locally First**
   - Run backend and frontend locally
   - Verify everything works
   - Then deploy to Render

2. **Check Render Logs**
   - Dashboard → Your Service → Logs
   - Real-time debugging

3. **Use Environment Variables**
   - Store URLs in env vars
   - Easy to switch between dev/prod

4. **Monitor Free Tier Hours**
   - Free tier: 750 hours/month
   - ~25 days of continuous runtime

---

## 📞 Quick Links

- Render Dashboard: https://dashboard.render.com
- Backend Logs: Dashboard → backend service → Logs
- Frontend Deploy: Dashboard → frontend site → Deploy

---

**Remember:**
- `ws://` = unsecure (local only)
- `wss://` = secure (production/Render)
- Port 443 = automatic on Render
- Port 8080 = local development
