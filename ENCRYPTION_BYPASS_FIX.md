# Quick Fix: Bypass Encryption for Testing

## Problem
UI shows wrong values (28639 bpm, 33718 SpO2) but Serial Monitor shows correct values.

## Root Cause
The FPGA encryption/decryption is either:
1. Not working (FPGA not connected/responding)
2. Using wrong key
3. Producing corrupted data

When backend tries to decrypt garbage, it gets nonsense sensor values.

## Temporary Fix Applied

### ✅ ESP32 Changes (esp_32_web.ino)
**Line ~445 in `sendToServer()`:**
```cpp
// Changed from:
webSocket.sendBIN(encryptedData, BLOCK_SIZE);

// To:
Serial.println("[DEBUG] ⚠️  Sending PLAINTEXT (not encrypted) for testing");
webSocket.sendBIN(plainData, BLOCK_SIZE);
```

### ✅ Backend Changes (backend/index.js)
**Line ~154:**
```javascript
// Changed from:
const decryptedData = chacha20Decrypt(data, key, nonce, blockCounter);

// To:
console.log('[Decrypt] ⚠️  SKIPPING DECRYPTION (using plaintext) for testing');
const decryptedData = data;  // Use data directly
```

## What This Does

1. **ESP32**: Sends plaintext sensor data instead of waiting for FPGA encryption
2. **Backend**: Uses received data directly instead of trying to decrypt
3. **Result**: UI should now display correct values!

## Testing Steps

### 1. Upload Modified ESP32 Code
```bash
# In Arduino IDE:
# 1. Open esp_32_web.ino
# 2. Click Upload
# 3. Wait for "Done uploading"
```

### 2. Restart Backend
```bash
cd /home/dina/Pictures/hrui/backend
node index.js
```

Backend is already running with the fix - it will automatically use the new code.

### 3. Restart Frontend
```bash
cd /home/dina/Pictures/hrui/frontend/heart-rate-monitor
pnpm dev
```

### 4. Check Results

**ESP32 Serial Monitor should show:**
```
[DEBUG] ⚠️  Sending PLAINTEXT (not encrypted) for testing
[WebSocket] ✓ Data sent successfully
```

**Backend console should show:**
```
[Decrypt] ⚠️  SKIPPING DECRYPTION (using plaintext) for testing
[Debug] Raw values:
  heartRate: 75        ← Should be reasonable now!
  heartRateAvg: 78
  spo2: 98
  temperature: 3650 (raw), 36.50 (converted)
```

**Frontend UI should show:**
```
Heart Rate: 78 bpm      ← Correct!
SpO2: 98%              ← Correct!
Temperature: 36.5°C    ← Correct!
```

## If This Fixes It

Then the issue is **FPGA encryption not working**. Next steps:

1. **Check FPGA connections:**
   - ESP32 TX (GPIO17) → FPGA RX (Pin 28)
   - ESP32 RX (GPIO16) → FPGA TX (Pin 27)
   - Common GND

2. **Verify FPGA is programmed:**
   - Flash ChaCha20 encryption firmware to FPGA
   - Ensure FPGA is powered and running

3. **Test FPGA separately:**
   - Send test data to FPGA via UART
   - Check if encrypted data comes back

## If This Doesn't Fix It

Then the issue is **data packing/parsing**. We'll need to:

1. Check struct alignment in ESP32
2. Verify byte order (little vs big endian)
3. Add hex dumps to see exact bytes

## Reverting to Encrypted Mode (After FPGA Fixed)

### ESP32 - Uncomment original line:
```cpp
// Remove debug line:
// Serial.println("[DEBUG] ⚠️  Sending PLAINTEXT...");
// webSocket.sendBIN(plainData, BLOCK_SIZE);

// Restore:
webSocket.sendBIN(encryptedData, BLOCK_SIZE);
```

### Backend - Uncomment decryption:
```javascript
// Remove:
// const decryptedData = data;

// Restore:
const decryptedData = chacha20Decrypt(data, key, nonce, blockCounter);
blockCounter++;
```

## Summary

- ✅ **ESP32**: Modified to send plaintext
- ✅ **Backend**: Modified to skip decryption  
- ⏳ **Frontend**: No changes needed (already updated)
- 🧪 **Test**: Upload ESP32 code and check UI

**Expected Result**: UI should now show correct sensor values!

**After this works**, we can debug why FPGA encryption isn't working.
