/*
 * ESP32 MAX30102 Sensor with FPGA ChaCha20 Encryption and WebSocket
 * 
 * This program:
 * 1. Reads biomedical data from MAX30102 sensor (Heart Rate, SpO2, Temperature)
 * 2. Sends data to FPGA for ChaCha20 encryption
 * 3. Receives encrypted data from FPGA
 * 4. Transmits encrypted data to server via WebSocket
 * 
 * Hardware Connections:
 * MAX30102:
 *   - SDA to GPIO 21
 *   - SCL to GPIO 22
 *   - VIN to 3.3V
 *   - GND to GND
 * 
 * FPGA (Tang Nano 9K):
 *   - ESP32 TX (GPIO17) -> FPGA RX (Pin 28)
 *   - ESP32 RX (GPIO16) -> FPGA TX (Pin 27)
 *   - ESP32 GND -> FPGA GND
 * 
 * WiFi:
 *   - Connect to local network
 *   - WebSocket connection to server
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "MAX30105.h"

// ==================== WiFi Configuration ====================
const char* ssid = "Redmi";           // Replace with your WiFi SSID
const char* password = "summa2004";   // Replace with your WiFi password

// ==================== WebSocket Configuration ====================
const char* ws_host = "192.168.1.100";  // Replace with your server IP
const int ws_port = 443;
const char* ws_path = "/";

WebSocketsClient webSocket;

// ==================== FPGA UART Configuration ====================
HardwareSerial FPGASerial(2);
#define FPGA_RX_PIN 16
#define FPGA_TX_PIN 17
#define BAUD_RATE 115200

// ==================== MAX30102 Sensor ====================
MAX30105 particleSensor;

// ==================== Data Structures ====================
#define BLOCK_SIZE 64

// Sensor data packet structure (unencrypted)
struct SensorData {
  uint32_t timestamp;      // 4 bytes
  uint16_t heartRate;      // 2 bytes - BPM
  uint16_t heartRateAvg;   // 2 bytes - Average BPM
  uint16_t spo2;           // 2 bytes - SpO2 percentage
  uint16_t temperature;    // 2 bytes - Temperature * 100
  uint32_t irValue;        // 4 bytes - IR sensor value
  uint32_t redValue;       // 4 bytes - Red sensor value
  uint16_t perfusionIndex; // 2 bytes - PI * 100
  uint8_t signalQuality;   // 1 byte - Quality indicator (0-100)
  uint8_t padding[39];     // Padding to make 64 bytes
} __attribute__((packed));

SensorData currentSensorData;
uint8_t encryptedData[BLOCK_SIZE];
uint8_t plainData[BLOCK_SIZE];

// ==================== Heart Rate Detection ====================
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

// ==================== SpO2 Calculation ====================
double avered = 0;
double aveir = 0;
double sumirrms = 0;
double sumredrms = 0;
int i = 0;
int SpO2 = 0;
double ESpO2 = 95.0;
double FSpO2 = 0.7;
double frate = 0.95;

// ==================== Timing Variables ====================
unsigned long lastSensorRead = 0;
unsigned long lastDataSend = 0;
const unsigned long SENSOR_INTERVAL = 20;    // Read sensor every 20ms
const unsigned long SEND_INTERVAL = 2000;    // Send data every 2 seconds
bool waitingForFPGA = false;
int fpgaRxIndex = 0;

// ==================== Status Variables ====================
bool wifiConnected = false;
bool wsConnected = false;
bool sensorReady = false;
bool fpgaReady = false;

// ==================== Function Declarations ====================
void setupWiFi();
void setupWebSocket();
void setupSensor();
void setupFPGA();
void readSensorData();
void processSensorData();
void sendToFPGA();
void receiveFromFPGA();
void sendToServer();
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length);

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n╔═══════════════════════════════════════════════╗");
  Serial.println("║  ESP32 Biomedical Sensor Encryption System   ║");
  Serial.println("║  MAX30102 → FPGA ChaCha20 → WebSocket        ║");
  Serial.println("╚═══════════════════════════════════════════════╝\n");
  
  // Initialize components
  setupWiFi();
  setupSensor();
  setupFPGA();
  setupWebSocket();
  
  Serial.println("\n✓ System ready! Starting data acquisition...\n");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Maintain WebSocket connection
  webSocket.loop();
  
  // Read sensor data continuously
  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    readSensorData();
    lastSensorRead = millis();
  }
  
  // Send data periodically
  if (!waitingForFPGA && (millis() - lastDataSend >= SEND_INTERVAL)) {
    processSensorData();
    sendToFPGA();
    lastDataSend = millis();
  }
  
  // Check for encrypted data from FPGA
  if (waitingForFPGA && FPGASerial.available()) {
    receiveFromFPGA();
  }
}

// ==================== WiFi Setup ====================
void setupWiFi() {
  Serial.println("[WiFi] Connecting to WiFi...");
  Serial.print("[WiFi] SSID: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[WiFi] ✓ Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] ✗ Connection failed!");
    Serial.println("[WiFi] Check credentials and try again");
  }
}

// ==================== WebSocket Setup ====================
void setupWebSocket() {
  if (!wifiConnected) {
    Serial.println("[WebSocket] Skipping - No WiFi connection");
    return;
  }
  
  Serial.println("\n[WebSocket] Initializing...");
  Serial.printf("[WebSocket] Server: wss://%s:%d%s\n", ws_host, ws_port, ws_path);

  webSocket.beginSSL(ws_host, ws_port, ws_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  Serial.println("[WebSocket] ✓ Configured");
}

// ==================== WebSocket Event Handler ====================
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WebSocket] ✗ Disconnected");
      wsConnected = false;
      break;
      
    case WStype_CONNECTED:
      Serial.println("[WebSocket] ✓ Connected to server");
      wsConnected = true;
      webSocket.sendTXT("{\"type\":\"hello\",\"device\":\"ESP32-MAX30102\"}");
      break;
      
    case WStype_TEXT:
      Serial.printf("[WebSocket] Received: %s\n", payload);
      break;
      
    case WStype_BIN:
      Serial.printf("[WebSocket] Received binary (%u bytes)\n", length);
      break;
      
    case WStype_ERROR:
      Serial.println("[WebSocket] ✗ Error occurred");
      break;
      
    case WStype_PING:
      Serial.println("[WebSocket] Ping received");
      break;
      
    case WStype_PONG:
      Serial.println("[WebSocket] Pong received");
      break;
  }
}

// ==================== Sensor Setup ====================
void setupSensor() {
  Serial.println("\n[Sensor] Initializing MAX30102...");
  
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[Sensor] ✗ MAX30102 not found!");
    Serial.println("[Sensor] Check connections:");
    Serial.println("         - SDA to GPIO 21");
    Serial.println("         - SCL to GPIO 22");
    Serial.println("         - VIN to 3.3V");
    Serial.println("         - GND to GND");
    return;
  }
  
  // Configure sensor
  byte ledBrightness = 50;
  byte sampleAverage = 4;
  byte ledMode = 2;
  byte sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;
  
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
  particleSensor.setPulseAmplitudeGreen(0);
  particleSensor.enableDIETEMPRDY();
  
  sensorReady = true;
  Serial.println("[Sensor] ✓ MAX30102 initialized");
  Serial.println("[Sensor] Place finger on sensor for readings");
}

// ==================== FPGA Setup ====================
void setupFPGA() {
  Serial.println("\n[FPGA] Initializing UART communication...");
  FPGASerial.begin(BAUD_RATE, SERIAL_8N1, FPGA_RX_PIN, FPGA_TX_PIN);
  fpgaReady = true;
  Serial.printf("[FPGA] ✓ UART initialized (115200 baud, RX=%d, TX=%d)\n", FPGA_RX_PIN, FPGA_TX_PIN);
}

// ==================== Read Sensor Data ====================
void readSensorData() {
  if (!sensorReady) return;
  
  uint32_t irValue = particleSensor.getIR();
  uint32_t redValue = particleSensor.getRed();
  
  // Check if finger is detected
  if (irValue < 5000) {
    beatsPerMinute = 0;
    beatAvg = 0;
    SpO2 = 0;
    return;
  }
  
  // Manual beat detection
  static uint32_t lastIR = 0;
  static uint32_t beforeLastIR = 0;
  static bool risingEdge = false;
  
  if (irValue > lastIR && lastIR > beforeLastIR) {
    risingEdge = true;
  }
  
  if (risingEdge && irValue < lastIR) {
    long currentTime = millis();
    long timeSinceLastBeat = currentTime - lastBeat;
    
    if (timeSinceLastBeat > 300 && timeSinceLastBeat < 2000) {
      beatsPerMinute = 60000.0 / timeSinceLastBeat;
      
      if (beatsPerMinute >= 40 && beatsPerMinute <= 200) {
        rates[rateSpot++] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;
        
        beatAvg = 0;
        for (byte x = 0; x < RATE_SIZE; x++) {
          beatAvg += rates[x];
        }
        beatAvg /= RATE_SIZE;
      }
    }
    lastBeat = currentTime;
    risingEdge = false;
  }
  
  beforeLastIR = lastIR;
  lastIR = irValue;
  
  // SpO2 calculation
  avered = avered * frate + (double)redValue * (1.0 - frate);
  aveir = aveir * frate + (double)irValue * (1.0 - frate);
  
  sumredrms += (redValue - avered) * (redValue - avered);
  sumirrms += (irValue - aveir) * (irValue - aveir);
  
  i++;
  
  if (i % 50 == 0) {
    double R = (sqrt(sumredrms) / avered) / (sqrt(sumirrms) / aveir);
    SpO2 = -23.3 * (R - 0.4) + 100;
    ESpO2 = FSpO2 * ESpO2 + (1.0 - FSpO2) * (double)SpO2;
    
    if (ESpO2 <= 105 && ESpO2 >= 70) {
      SpO2 = (int)ESpO2;
    } else if (i > 200) {
      SpO2 = (int)constrain(ESpO2, 85, 100);
    } else {
      SpO2 = 0;
    }
    
    sumredrms = 0.0;
    sumirrms = 0.0;
    i = 0;
  }
  
  // Store current readings
  currentSensorData.irValue = irValue;
  currentSensorData.redValue = redValue;
}

// ==================== Process Sensor Data ====================
void processSensorData() {
  float temperature = particleSensor.readTemperature();
  float perfusionIndex = ((float)currentSensorData.irValue / 50000.0) * 100.0;
  
  // Calculate signal quality (0-100)
  uint8_t quality = 0;
  if (currentSensorData.irValue > 5000) {
    quality = 30;
    if (beatAvg >= 40 && beatAvg <= 150) quality += 30;
    if (SpO2 >= 85 && SpO2 <= 100) quality += 20;
    if (perfusionIndex > 1.0) quality += 20;
  }
  
  // Pack data
  currentSensorData.timestamp = millis();
  currentSensorData.heartRate = (uint16_t)beatsPerMinute;
  currentSensorData.heartRateAvg = (uint16_t)beatAvg;
  currentSensorData.spo2 = (uint16_t)SpO2;
  currentSensorData.temperature = (uint16_t)(temperature * 100);
  currentSensorData.perfusionIndex = (uint16_t)(perfusionIndex * 100);
  currentSensorData.signalQuality = quality;
  
  // Copy to plain data buffer
  memcpy(plainData, &currentSensorData, sizeof(SensorData));
  
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║     SENSOR DATA PACKET               ║");
  Serial.println("╠══════════════════════════════════════╣");
  Serial.printf("║ Heart Rate:        %3d bpm          ║\n", beatAvg);
  Serial.printf("║ SpO2:              %3d %%            ║\n", SpO2);
  Serial.printf("║ Temperature:       %.2f °C         ║\n", temperature);
  Serial.printf("║ Signal Quality:    %3d/100         ║\n", quality);
  Serial.println("╚══════════════════════════════════════╝");
}

// ==================== Send to FPGA ====================
void sendToFPGA() {
  if (!fpgaReady) {
    Serial.println("[FPGA] ✗ FPGA not ready");
    return;
  }
  
  Serial.println("\n[FPGA] → Sending data for encryption...");
  FPGASerial.write(plainData, BLOCK_SIZE);
  waitingForFPGA = true;
  fpgaRxIndex = 0;
  Serial.println("[FPGA] ✓ 64 bytes sent to FPGA");
}

// ==================== Receive from FPGA ====================
void receiveFromFPGA() {
  while (FPGASerial.available() && fpgaRxIndex < BLOCK_SIZE) {
    encryptedData[fpgaRxIndex] = FPGASerial.read();
    fpgaRxIndex++;
  }
  
  if (fpgaRxIndex >= BLOCK_SIZE) {
    waitingForFPGA = false;
    Serial.println("[FPGA] ✓ Received 64 bytes encrypted data");
    
    // Print first 16 bytes as preview
    Serial.print("[FPGA] Encrypted (preview): ");
    for (int i = 0; i < 16; i++) {
      Serial.printf("%02X ", encryptedData[i]);
    }
    Serial.println("...");
    
    // Send to server
    sendToServer();
  }
}

// ==================== Send to Server ====================
void sendToServer() {
  if (!wsConnected) {
    Serial.println("[WebSocket] ✗ Not connected - cannot send data");
    return;
  }
  
  Serial.println("\n[WebSocket] → Sending encrypted data to server...");
  
  // Send binary data
  webSocket.sendBIN(encryptedData, BLOCK_SIZE);
  
  Serial.println("[WebSocket] ✓ Data sent successfully");
}
