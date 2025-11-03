# Testing Guide

Step-by-step guide to test the Biomedical Sensor System.

## 🧪 Testing Checklist

### Phase 1: Software Setup ✓

#### 1.1 Backend Server Test
```bash
cd backend
pnpm start
```

**Expected Output:**
```
╔═══════════════════════════════════════════════╗
║   Biomedical Sensor WebSocket Server         ║
║   ChaCha20 Decryption & Real-time Display    ║
╚═══════════════════════════════════════════════╝

[Server] ✓ HTTP server listening on port 8080
[Server] ✓ WebSocket server ready
[Server] URL: ws://localhost:8080
[Server] Health check: http://localhost:8080/health

[Server] Waiting for ESP32 connection...
```

**Test Health Endpoint:**
```bash
curl http://localhost:8080/health
```

**Expected Response:**
```json
{"status":"ok","clients":0,"uptime":1.234}
```

✅ **PASS** if server starts without errors
❌ **FAIL** if port 8080 is already in use → change PORT in index.js

---

#### 1.2 Frontend UI Test
```bash
cd frontend/heart-rate-monitor
pnpm dev
```

**Expected Output:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.xxx:5173/
```

**Manual Test:**
1. Open browser to `http://localhost:5173`
2. You should see the dark themed UI with:
   - "❤️ Biomedical Sensor Monitor" header
   - Connection panel with WebSocket URL input
   - "Connect" button
   - Status showing "○ Disconnected"

✅ **PASS** if UI loads correctly
❌ **FAIL** if build errors → check pnpm install completed

---

#### 1.3 WebSocket Connection Test

**In the browser UI:**
1. Ensure WebSocket URL is `ws://localhost:8080`
2. Click "Connect" button

**Expected:**
- Status changes to "● Connected" (green)
- Message appears: "Waiting for sensor data..."

**In backend terminal:**
```
[WebSocket] ✓ New client connected from ::ffff:127.0.0.1
[WebSocket] Total clients: 1
```

✅ **PASS** if connection succeeds
❌ **FAIL** if connection fails → check backend is running

---

### Phase 2: Hardware Tests 🔧

#### 2.1 MAX30102 Sensor Test (Standalone)

**Upload Test Sketch:**
```cpp
// Simple I2C scanner to verify sensor
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Serial.println("I2C Scanner");
}

void loop() {
  for(byte i = 1; i < 127; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      Serial.println(i, HEX);
    }
  }
  delay(5000);
}
```

**Expected Output:**
```
I2C Scanner
Found device at 0x57
```

✅ **PASS** if device found at 0x57 (MAX30102 address)
❌ **FAIL** if no device found:
   - Check SDA → GPIO 21
   - Check SCL → GPIO 22
   - Check 3.3V and GND connections
   - Check sensor orientation

---

#### 2.2 WiFi Connection Test

**In ESP32 Serial Monitor:**
After uploading `esp_32_web.ino`:

**Expected Output:**
```
╔═══════════════════════════════════════════════╗
║  ESP32 Biomedical Sensor Encryption System   ║
║  MAX30102 → FPGA ChaCha20 → WebSocket        ║
╚═══════════════════════════════════════════════╝

[WiFi] Connecting to WiFi...
[WiFi] SSID: YourNetworkName
..........
[WiFi] ✓ Connected!
[WiFi] IP Address: 192.168.1.xxx
```

✅ **PASS** if WiFi connects
❌ **FAIL** if connection fails:
   - Verify SSID and password in code
   - Check if network is 2.4GHz (ESP32 doesn't support 5GHz only)
   - Move ESP32 closer to router
   - Check if MAC filtering is enabled on router

---

#### 2.3 FPGA Communication Test

**Expected in Serial Monitor:**
```
[FPGA] Initializing UART communication...
[FPGA] ✓ UART initialized (115200 baud, RX=16, TX=17)
```

**When data is sent:**
```
[FPGA] → Sending data for encryption...
[FPGA] ✓ 64 bytes sent to FPGA
[FPGA] ✓ Received 64 bytes encrypted data
[FPGA] Encrypted (preview): A7 F3 2E 9B ...
```

✅ **PASS** if FPGA responds
❌ **FAIL** if timeout:
   - Check TX/RX connections (they should be crossed: ESP TX → FPGA RX)
   - Verify GND connection
   - Check FPGA is powered and programmed
   - Verify baud rate matches (115200)

---

### Phase 3: End-to-End Test 🎯

#### 3.1 Full System Test

**Prerequisites:**
- ✅ Backend server running
- ✅ Frontend UI running and connected
- ✅ ESP32 programmed and powered
- ✅ MAX30102 sensor connected
- ✅ FPGA connected and programmed

**Test Procedure:**

1. **Place finger on MAX30102 sensor**
   - Use gentle pressure
   - Cover the sensor completely
   - Keep finger still

2. **Watch ESP32 Serial Monitor:**
```
╔══════════════════════════════════════╗
║     SENSOR DATA PACKET               ║
╠══════════════════════════════════════╣
║ Heart Rate:         75 bpm          ║
║ SpO2:               98 %            ║
║ Temperature:       36.50 °C         ║
║ Signal Quality:     85/100         ║
╚══════════════════════════════════════╝

[FPGA] → Sending data for encryption...
[FPGA] ✓ 64 bytes sent to FPGA
[FPGA] ✓ Received 64 bytes encrypted data

[WebSocket] → Sending encrypted data to server...
[WebSocket] ✓ Data sent successfully
```

3. **Watch Backend Server Terminal:**
```
╔══════════════════════════════════════════════╗
║   ENCRYPTED DATA RECEIVED FROM ESP32        ║
╚══════════════════════════════════════════════╝
[Data] Received 64 bytes of encrypted data
[Decrypt] Decrypting with ChaCha20...
[Decrypt] ✓ Decryption complete

╔══════════════════════════════════════════════╗
║        DECRYPTED SENSOR DATA                 ║
╠══════════════════════════════════════════════╣
║ ❤️  Heart Rate:         75 bpm            ║
║ 🫁 SpO2:                98 %              ║
║ 🌡️  Temperature:       36.50 °C          ║
║ 📊 Signal Quality:      85/100           ║
╚══════════════════════════════════════════════╝

[Broadcast] ✓ Data sent to 1 client(s)
```

4. **Watch Frontend UI:**
   - Heart Rate card shows ~75 bpm ❤️
   - SpO2 card shows ~98% 🫁 (green/normal)
   - Temperature card shows ~36.5°C 🌡️
   - Signal Quality shows ~85/100 📊
   - Chart begins plotting data points
   - Values update every 2 seconds

✅ **PASS** if all three systems show matching data
❌ **FAIL** if any component fails → see troubleshooting below

---

#### 3.2 Data Integrity Test

**Verify encryption/decryption:**
- Values in ESP32 serial should match backend decrypted values
- Values in backend should match frontend display
- No data corruption or mismatches

**Check for:**
- Heart Rate: 40-200 bpm (realistic range)
- SpO2: 85-100% (realistic range)
- Temperature: 30-40°C (realistic range)
- No sudden jumps or impossible values

---

#### 3.3 Real-time Update Test

**Test continuous operation:**
1. Keep finger on sensor for 1 minute
2. Watch chart fill with data points
3. Verify smooth updates every 2 seconds
4. Check for consistent readings

**Performance Metrics:**
- Update interval: ~2 seconds
- No disconnections
- No memory leaks
- Smooth chart animation

---

### Phase 4: Edge Cases 🔍

#### 4.1 Sensor Removal Test

**Action:** Remove finger from sensor

**Expected ESP32 Output:**
```
⚠ No finger detected! Place finger on sensor.
   (Current IR value too low)
```

**Expected Frontend:**
- Values stop updating
- Last known values remain displayed
- No errors or crashes

✅ **PASS** if system handles gracefully

---

#### 4.2 Connection Loss Test

**Action:** Stop backend server (Ctrl+C)

**Expected Frontend:**
- Status changes to "○ Disconnected"
- Connection error message
- UI remains functional
- Can reconnect when server restarts

✅ **PASS** if automatic reconnection works

---

#### 4.3 Multiple Clients Test

**Action:** Open frontend in 2+ browser tabs

**Expected:**
- All clients receive same data
- Backend logs multiple connections
- No interference between clients
- Smooth operation for all

✅ **PASS** if all clients work simultaneously

---

## 🐛 Troubleshooting

### Problem: No sensor readings
**Solutions:**
1. Check IR value in serial monitor - should be > 50,000 with finger
2. Increase LED brightness in code (line 344: `byte ledBrightness = 100;`)
3. Ensure complete sensor coverage with finger
4. Clean sensor surface
5. Try different finger

### Problem: Unstable readings
**Solutions:**
1. Keep finger completely still
2. Use gentle but firm pressure
3. Ensure good blood circulation (warm hands)
4. Wait 5-10 seconds for stabilization
5. Adjust sample averaging (line 345)

### Problem: WebSocket disconnects frequently
**Solutions:**
1. Check WiFi signal strength
2. Reduce distance to router
3. Check for WiFi interference
4. Verify power supply is stable
5. Check router doesn't have connection timeouts

### Problem: Encryption/decryption mismatch
**Solutions:**
1. Verify key and nonce are all zeros in all components
2. Check block counter increments correctly
3. Ensure FPGA is programmed with matching algorithm
4. Verify data structure packing (no padding issues)

### Problem: Frontend shows wrong values
**Solutions:**
1. Check data parsing in backend (offset values)
2. Verify structure packing in ESP32 (`__attribute__((packed))`)
3. Check endianness (should be little-endian)
4. Clear browser cache and reload

---

## ✅ Success Criteria

Your system is working correctly when:

- [x] Backend starts without errors
- [x] Frontend loads and connects to backend
- [x] ESP32 connects to WiFi and WebSocket
- [x] MAX30102 detected and reading values
- [x] FPGA encrypts and returns data
- [x] Backend decrypts data correctly
- [x] Frontend displays real-time data
- [x] Charts update smoothly
- [x] Values are realistic and stable
- [x] System runs continuously without crashes
- [x] All three logs show matching data

---

## 📊 Test Results Template

```
=== TEST RESULTS ===
Date: ___________
Tester: ___________

[ ] Backend Server Started
[ ] Frontend UI Loaded
[ ] WebSocket Connected
[ ] MAX30102 Detected
[ ] WiFi Connected
[ ] FPGA Communication
[ ] Data Encryption/Decryption
[ ] Real-time Display
[ ] Chart Updates
[ ] Multiple Clients
[ ] Sensor Removal Handling
[ ] Connection Recovery

Overall Status: PASS / FAIL
Notes:
_________________________________
_________________________________
_________________________________
```

---

**Happy Testing! 🎉**

If all tests pass, your biomedical sensor system with hardware encryption is fully operational!
