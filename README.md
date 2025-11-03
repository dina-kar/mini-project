# Biomedical Sensor System with Hardware Encryption

A complete end-to-end system for real-time biomedical monitoring with hardware-accelerated encryption.

## System Architecture

```
MAX30102 Sensor → ESP32 → FPGA (ChaCha20) → WebSocket Server → Web UI
```

### Components

1. **ESP32 (esp_32_web.ino)** - Reads sensor data, coordinates encryption, manages WiFi/WebSocket
2. **Tang Nano 9K FPGA** - Hardware ChaCha20 encryption accelerator
3. **Node.js Backend** - WebSocket server with ChaCha20 decryption
4. **React Frontend** - Real-time data visualization with charts

## Features

- ❤️ **Heart Rate Monitoring** - Real-time BPM detection and averaging
- 🫁 **Blood Oxygen (SpO2)** - Oxygen saturation percentage
- 🌡️ **Temperature** - Body/sensor temperature in Celsius
- 💉 **Perfusion Index** - Blood flow quality indicator
- 📊 **Signal Quality** - Real-time assessment of sensor contact
- 🔒 **ChaCha20 Encryption** - FPGA-accelerated hardware encryption
- 📈 **Live Charts** - Historical trend visualization

## Hardware Setup

### MAX30102 Sensor Connections
```
MAX30102    →  ESP32
SDA         →  GPIO 21
SCL         →  GPIO 22
VIN         →  3.3V
GND         →  GND
```

### FPGA (Tang Nano 9K) Connections
```
ESP32       →  FPGA
GPIO 17 (TX)→  Pin 28 (RX)
GPIO 16 (RX)→  Pin 27 (TX)
GND         →  GND
```

## Software Setup

### 1. ESP32 Configuration

Edit `esp_32_web.ino` and update:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* ws_host = "192.168.1.100";  // Your server IP
```

**Required Arduino Libraries:**
- Wire.h (built-in)
- WiFi.h (built-in for ESP32)
- WebSocketsClient (install via Arduino Library Manager)
- MAX30105 (SparkFun MAX3010x library)

**Installation:**
1. Open Arduino IDE
2. Go to Tools → Manage Libraries
3. Search and install:
   - "WebSockets" by Markus Sattler
   - "SparkFun MAX3010x Pulse and Proximity Sensor" by SparkFun
4. Select Board: ESP32 Dev Module
5. Upload the sketch

### 2. Backend Server

```bash
cd backend
pnpm install
pnpm start
```

The server will start on port 8080 and display:
```
╔═══════════════════════════════════════════════╗
║   Biomedical Sensor WebSocket Server         ║
║   ChaCha20 Decryption & Real-time Display    ║
╚═══════════════════════════════════════════════╝

[Server] ✓ HTTP server listening on port 8080
[Server] ✓ WebSocket server ready
```

### 3. Frontend UI

```bash
cd frontend/heart-rate-monitor
pnpm install
pnpm dev
```

The frontend will start on `http://localhost:5173`

## Usage

### Step 1: Start the Backend Server
```bash
cd backend
pnpm start
```

### Step 2: Start the Frontend
```bash
cd frontend/heart-rate-monitor
pnpm dev
```

### Step 3: Upload ESP32 Code
1. Connect ESP32 via USB
2. Open `esp_32_web.ino` in Arduino IDE
3. Configure WiFi credentials
4. Upload the sketch

### Step 4: Connect to Web UI
1. Open browser to `http://localhost:5173`
2. Enter WebSocket URL: `ws://localhost:8080` (or your server IP)
3. Click "Connect"
4. Place finger on MAX30102 sensor
5. Watch real-time data appear!

## Data Flow

```
1. MAX30102 → ESP32
   - Heart rate, SpO2, Temperature, IR/Red values
   
2. ESP32 → FPGA
   - 64-byte plaintext sensor data packet
   
3. FPGA → ESP32
   - 64-byte ChaCha20 encrypted ciphertext
   
4. ESP32 → WebSocket Server
   - Binary encrypted data over WiFi
   
5. Server Processing
   - ChaCha20 decryption
   - Data parsing
   - Broadcast to all connected clients
   
6. Web UI
   - Real-time display
   - Historical charts
   - Status indicators
```

## Sensor Data Structure

```c
struct SensorData {
  uint32_t timestamp;       // Milliseconds since boot
  uint16_t heartRate;       // Instantaneous BPM
  uint16_t heartRateAvg;    // 4-sample average BPM
  uint16_t spo2;            // SpO2 percentage
  uint16_t temperature;     // Temperature * 100
  uint32_t irValue;         // Raw IR sensor value
  uint32_t redValue;        // Raw Red sensor value
  uint16_t perfusionIndex;  // Perfusion * 100
  uint8_t signalQuality;    // Quality 0-100
  uint8_t padding[39];      // Padding to 64 bytes
} __attribute__((packed));
```

## Encryption Details

**Algorithm:** ChaCha20 (RFC 8439)
- **Key:** 256-bit (32 bytes) - currently all zeros (matching FPGA)
- **Nonce:** 64-bit (8 bytes) - all zeros
- **Block Counter:** Increments with each 64-byte block
- **Implementation:** FPGA hardware acceleration

## API Endpoints

### WebSocket
- **URL:** `ws://localhost:8080/`
- **Binary Messages:** 64-byte encrypted sensor data
- **JSON Messages:** Control and status messages

### HTTP
- **GET /health** - Server health check
- **GET /stats** - Current statistics (clients, counter, time)

## Troubleshooting

### ESP32 Issues
- **"MAX30102 not found"** - Check I2C connections (SDA/SCL)
- **"WiFi connection failed"** - Verify SSID/password
- **"WebSocket disconnected"** - Check server IP and firewall

### Sensor Issues
- **No readings** - Ensure finger is placed gently on sensor
- **Unstable readings** - Keep finger still, adjust LED brightness
- **Low signal quality** - Clean sensor, ensure good contact

### Server Issues
- **Port 8080 in use** - Change PORT in `backend/index.js`
- **WebSocket errors** - Check firewall settings
- **Decryption errors** - Ensure key/nonce match ESP32/FPGA

### Frontend Issues
- **Cannot connect** - Verify WebSocket URL matches server
- **No data displayed** - Check browser console for errors
- **Charts not updating** - Ensure WebSocket is connected

## Development

### Backend Development Mode
```bash
cd backend
pnpm run dev  # Uses nodemon for auto-reload
```

### Frontend Development Mode
```bash
cd frontend/heart-rate-monitor
pnpm dev  # Vite hot module replacement
```

## Performance

- **Sensor Sampling:** 100 Hz
- **Data Transmission:** Every 2 seconds
- **Encryption:** Hardware-accelerated (FPGA)
- **Latency:** < 100ms end-to-end
- **Chart History:** Last 20 data points

## Security Notes

⚠️ **Current Configuration:**
- Using all-zero encryption key for testing
- No authentication on WebSocket
- HTTP only (not HTTPS)

**For Production:**
1. Use proper 256-bit random encryption key
2. Implement WebSocket authentication
3. Use TLS/HTTPS for all connections
4. Secure key exchange protocol

## License

MIT

## Author

Created for biomedical monitoring with hardware-accelerated encryption.

## Acknowledgments

- SparkFun for MAX30105 library
- ChaCha20 algorithm (D. J. Bernstein)
- Recharts for data visualization
