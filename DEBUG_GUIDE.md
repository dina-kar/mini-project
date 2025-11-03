# Debugging Wrong Sensor Values

## Problem
- Serial Monitor shows correct values (e.g., HR: 75 bpm, SpO2: 98%, Temp: 36.5°C)
- UI shows wrong values (e.g., HR: 28639 bpm, SpO2: 33718%, Temp: 634°C)

## Root Cause Analysis

The issue is likely one of these:

### 1. **FPGA Not Actually Encrypting** (Most Likely)
If the FPGA is not connected or not working, the ESP32 might be:
- Sending plaintext data instead of encrypted
- Receiving garbage data back from FPGA
- Timing out and sending uninitialized `encryptedData[]` buffer

### 2. **Encryption/Decryption Key Mismatch**
- ESP32 FPGA uses one key
- Backend uses different key
- Result: Decrypted data is garbage

### 3. **Byte Order Issue**
- ESP32 sends little-endian
- Backend reads big-endian (or vice versa)
- Result: Bytes are swapped

## Diagnostic Steps

### Step 1: Check ESP32 Serial Output

When ESP32 sends data, you should see:
```
[FPGA] → Sending data for encryption...
[FPGA] ✓ 64 bytes sent to FPGA
[FPGA] ✓ Received 64 bytes encrypted data
[FPGA] Encrypted (preview): A1 B2 C3 D4 ...
```

**Question**: Do you see "Received 64 bytes encrypted data"?
- **YES** → FPGA is responding, go to Step 2
- **NO** → FPGA not connected or not working

### Step 2: Check if Data is Actually Encrypted

Add this to ESP32 after line 421 (in `receiveFromFPGA()`):

```cpp
// Compare first bytes of plaintext vs encrypted
Serial.println("\n[DEBUG] Encryption Comparison:");
Serial.print("[DEBUG] Plain: ");
for (int i = 0; i < 8; i++) {
  Serial.printf("%02X ", plainData[i]);
}
Serial.print("\n[DEBUG] Encry: ");
for (int i = 0; i < 8; i++) {
  Serial.printf("%02X ", encryptedData[i]);
}
Serial.println();
```

**Expected**: The two hex strings should be DIFFERENT
- **DIFFERENT** → Encryption is working, go to Step 3  
- **SAME** → FPGA is echoing back plaintext, not encrypting!

### Step 3: Check Backend Decryption

Look at the backend console output:
```
[Decrypt] First 23 bytes (hex): 1a2b3c4d...
[Debug] Raw values:
  heartRate: 75
  heartRateAvg: 78
  spo2: 98
  temperature: 3650 (raw), 36.50 (converted)
```

**Expected**: Raw values should be reasonable
- **Reasonable** → Decryption working, go to Step 4
- **Garbage (28639, 33718)** → Decryption failing

### Step 4: Verify ChaCha20 Keys Match

**ESP32 Side** (in FPGA firmware):
- Check what key the FPGA is using
- Default is usually all-zeros: `00 00 00 00 ... (32 bytes)`

**Backend Side** (index.js line 125):
```javascript
const key = Buffer.alloc(32, 0);  // All-zero key
const nonce = Buffer.alloc(8, 0); // All-zero nonce
```

**Action**: Verify FPGA firmware uses same key

## Quick Fixes

### Fix 1: If FPGA Not Working - Use Software Encryption

If FPGA is not responding, temporarily bypass it for testing:

**In ESP32** `sendToServer()` function, change:
```cpp
// Send plaintext for testing (REMOVE AFTER FPGA FIXED)
webSocket.sendBIN(plainData, BLOCK_SIZE);  // Send unencrypted
```

**In Backend** `index.js`, add before decryption:
```javascript
// Skip decryption for testing (REMOVE AFTER FPGA FIXED)
const decryptedData = data;  // Use data directly
```

This will let you verify the parsing is correct when encryption is removed.

### Fix 2: Print Hex Dump in Backend

To see exactly what bytes are being received, add to backend after line 162:

```javascript
console.log('[HexDump] Decrypted data:');
for (let i = 0; i < 23; i++) {
  process.stdout.write(`${i.toString().padStart(2, '0')}: ${decryptedData[i].toString(16).padStart(2, '0')} `);
  if ((i + 1) % 8 === 0) console.log();
}
console.log();
```

This shows byte-by-byte what was decrypted.

### Fix 3: Verify Struct Packing in ESP32

The struct should match this exact layout:

| Offset | Size | Field           | Value Example |
|--------|------|-----------------|---------------|
| 0      | 4    | timestamp       | 45000 ms      |
| 4      | 2    | heartRate       | 75 bpm        |
| 6      | 2    | heartRateAvg    | 78 bpm        |
| 8      | 2    | spo2            | 98 %          |
| 10     | 2    | temperature     | 3650 (36.5°C) |
| 12     | 4    | irValue         | 50000         |
| 16     | 4    | redValue        | 45000         |
| 20     | 2    | perfusionIndex  | 150 (1.50%)   |
| 22     | 1    | signalQuality   | 80            |
| 23     | 39   | padding         | 0x00...       |

**Total**: 64 bytes

## Most Likely Solution

Based on the symptoms (Serial Monitor correct, UI wrong), the issue is:

**The FPGA is NOT encrypting the data properly**, so when the backend tries to decrypt random/garbage data, it gets nonsense values.

### Immediate Test:

1. **Temporarily disable encryption** in ESP32:
   ```cpp
   // In sendToServer(), replace:
   webSocket.sendBIN(encryptedData, BLOCK_SIZE);
   // With:
   webSocket.sendBIN(plainData, BLOCK_SIZE);
   ```

2. **Temporarily disable decryption** in backend:
   ```javascript
   // In index.js, replace:
   const decryptedData = chacha20Decrypt(data, key, nonce, blockCounter);
   // With:
   const decryptedData = data;
   ```

3. **Test again** - if UI now shows correct values, then FPGA encryption is the problem!

## Expected Backend Debug Output

When working correctly, you should see:

```
[Decrypt] First 23 bytes (hex): 88af0000 4b00 4e00 6200 420e 50c30000 08b00000 9600 50
[Debug] Raw values:
  timestamp: 45000
  heartRate: 75
  heartRateAvg: 78  
  spo2: 98
  temperature: 3650 (raw), 36.50 (converted)
  irValue: 50000
  redValue: 45000
  perfusionIndex: 150 (raw), 1.50 (converted)
  signalQuality: 80
```

If you see values like:
```
  heartRate: 28639
  heartRateAvg: 19200
  spo2: 33718
```

Then the decryption is producing garbage → **FPGA encryption problem**

## Next Steps

1. Run ESP32 and check Serial Monitor for "Received 64 bytes encrypted data"
2. Check backend console for the debug raw values
3. Report back what you see and I'll help you fix it!
