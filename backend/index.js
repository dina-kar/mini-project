const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');

// ==================== Configuration ====================
const PORT = process.env.PORT || 8080;
const BLOCK_SIZE = 64;

// ==================== ChaCha20 Decryption ====================
// ChaCha20 implementation for decrypting data from FPGA
function ROTL32(v, n) {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function QUARTERROUND(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] ^= x[a]; x[d] = ROTL32(x[d], 16);
  x[c] = (x[c] + x[d]) >>> 0; x[b] ^= x[c]; x[b] = ROTL32(x[b], 12);
  x[a] = (x[a] + x[b]) >>> 0; x[d] ^= x[a]; x[d] = ROTL32(x[d], 8);
  x[c] = (x[c] + x[d]) >>> 0; x[b] ^= x[c]; x[b] = ROTL32(x[b], 7);
}

function chacha20Block(output, input) {
  const x = new Uint32Array(16);
  
  for (let i = 0; i < 16; i++) {
    x[i] = input[i];
  }
  
  for (let i = 0; i < 10; i++) {
    // Column rounds
    QUARTERROUND(x, 0, 4, 8, 12);
    QUARTERROUND(x, 1, 5, 9, 13);
    QUARTERROUND(x, 2, 6, 10, 14);
    QUARTERROUND(x, 3, 7, 11, 15);
    
    // Diagonal rounds
    QUARTERROUND(x, 0, 5, 10, 15);
    QUARTERROUND(x, 1, 6, 11, 12);
    QUARTERROUND(x, 2, 7, 8, 13);
    QUARTERROUND(x, 3, 4, 9, 14);
  }
  
  for (let i = 0; i < 16; i++) {
    output[i] = (x[i] + input[i]) >>> 0;
  }
}

function chacha20Decrypt(ciphertext, key, nonce, counter) {
  const state = new Uint32Array(16);
  const keystream = new Uint32Array(16);
  
  // Constants "expand 32-byte k"
  state[0] = 0x61707865;
  state[1] = 0x3320646e;
  state[2] = 0x79622d32;
  state[3] = 0x6b206574;
  
  // Key (256-bit)
  for (let i = 0; i < 8; i++) {
    state[4 + i] = (key[i*4 + 0] << 0) |
                   (key[i*4 + 1] << 8) |
                   (key[i*4 + 2] << 16) |
                   (key[i*4 + 3] << 24);
  }
  
  // Counter
  state[12] = counter;
  state[13] = 0;
  
  // Nonce
  state[14] = (nonce[0] << 0) | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24);
  state[15] = (nonce[4] << 0) | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24);
  
  // Generate keystream
  chacha20Block(keystream, state);
  
  // XOR ciphertext with keystream
  const plaintext = Buffer.alloc(ciphertext.length);
  const keystreamBytes = Buffer.from(keystream.buffer);
  
  for (let i = 0; i < ciphertext.length && i < 64; i++) {
    plaintext[i] = ciphertext[i] ^ keystreamBytes[i];
  }
  
  return plaintext;
}

// ==================== Sensor Data Parser ====================
function parseSensorData(buffer) {
  if (buffer.length < 64) {
    throw new Error('Invalid buffer size');
  }
  
  // Parse the packed structure
  // ESP32 uses little-endian for multi-byte values
  const timestamp = buffer.readUInt32LE(0);
  const heartRate = buffer.readUInt16LE(4);
  const heartRateAvg = buffer.readUInt16LE(6);
  const spo2 = buffer.readUInt16LE(8);
  const temperature = buffer.readUInt16LE(10);
  const irValue = buffer.readUInt32LE(12);
  const redValue = buffer.readUInt32LE(16);
  const perfusionIndex = buffer.readUInt16LE(20);
  const signalQuality = buffer.readUInt8(22);
  
  // Debug log raw values
  console.log('[Debug] Raw values:');
  console.log(`  timestamp: ${timestamp}`);
  console.log(`  heartRate: ${heartRate}`);
  console.log(`  heartRateAvg: ${heartRateAvg}`);
  console.log(`  spo2: ${spo2}`);
  console.log(`  temperature: ${temperature} (raw), ${temperature / 100.0} (converted)`);
  console.log(`  irValue: ${irValue}`);
  console.log(`  redValue: ${redValue}`);
  console.log(`  perfusionIndex: ${perfusionIndex} (raw), ${perfusionIndex / 100.0} (converted)`);
  console.log(`  signalQuality: ${signalQuality}`);
  
  return {
    timestamp,
    heartRate,
    heartRateAvg,
    spo2,
    temperature: temperature / 100.0,  // Convert back from stored format
    irValue,
    redValue,
    perfusionIndex: perfusionIndex / 100.0,
    signalQuality,
    receivedAt: new Date().toISOString()
  };
}

// ==================== Express & WebSocket Server ====================
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();
let blockCounter = 0;

// ChaCha20 key and nonce (matching ESP32/FPGA)
const key = Buffer.alloc(32, 0);  // All-zero key
const nonce = Buffer.alloc(8, 0); // All-zero nonce

console.log('╔═══════════════════════════════════════════════╗');
console.log('║   Biomedical Sensor WebSocket Server         ║');
console.log('║   ChaCha20 Decryption & Real-time Display    ║');
console.log('╚═══════════════════════════════════════════════╝\n');

// ==================== HTTP Routes ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connectedClients: clients.size,
    blockCounter,
    serverTime: new Date().toISOString()
  });
});

// ==================== WebSocket Connection Handler ====================
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`[WebSocket] ✓ New client connected from ${clientIP}`);
  console.log(`[WebSocket] Total clients: ${clients.size + 1}`);
  
  clients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Biomedical Sensor Server',
    serverTime: new Date().toISOString()
  }));
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      // Check if it's binary data (encrypted sensor data from ESP32)
      if (Buffer.isBuffer(data) && data.length === BLOCK_SIZE) {
        console.log('\n╔══════════════════════════════════════════════╗');
        console.log('║   ENCRYPTED DATA RECEIVED FROM ESP32        ║');
        console.log('╚══════════════════════════════════════════════╝');
        
        console.log(`[Data] Received ${data.length} bytes of encrypted data`);
        console.log(`[Data] First 16 bytes: ${data.slice(0, 16).toString('hex')}`);
        
        // Decrypt data using ChaCha20
        console.log('[Decrypt] Decrypting with ChaCha20...');
        const decryptedData = chacha20Decrypt(data, key, nonce, blockCounter);
        blockCounter++;
        
        console.log('[Decrypt] ✓ Decryption complete');
        console.log(`[Decrypt] Counter: ${blockCounter}`);
        console.log(`[Decrypt] First 23 bytes (hex): ${decryptedData.slice(0, 23).toString('hex')}`);
        
        // Parse sensor data
        try {
          const sensorData = parseSensorData(decryptedData);
          
          console.log('\n╔══════════════════════════════════════════════╗');
          console.log('║        DECRYPTED SENSOR DATA                 ║');
          console.log('╠══════════════════════════════════════════════╣');
          console.log(`║ ❤️  Heart Rate:        ${String(sensorData.heartRateAvg).padStart(3)} bpm            ║`);
          console.log(`║ 🫁 SpO2:               ${String(sensorData.spo2).padStart(3)} %              ║`);
          console.log(`║ 🌡️  Temperature:       ${sensorData.temperature.toFixed(2)} °C          ║`);
          console.log(`║ 📊 Signal Quality:     ${String(sensorData.signalQuality).padStart(3)}/100           ║`);
          console.log('╚══════════════════════════════════════════════╝\n');
          
          // Broadcast to all connected web clients
          const message = JSON.stringify({
            type: 'sensorData',
            data: sensorData,
            encrypted: {
              ciphertext: data.toString('hex'),
              plaintext: decryptedData.slice(0, 23).toString('hex'),
              blockCounter: blockCounter - 1
            }
          });
          
          let broadcastCount = 0;
          clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(message);
              broadcastCount++;
            }
          });
          
          // Also send back to ESP32 as confirmation
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
          
          console.log(`[Broadcast] ✓ Data sent to ${broadcastCount + 1} client(s)`);
          
        } catch (parseError) {
          console.error('[Error] Failed to parse sensor data:', parseError.message);
        }
      } 
      // Handle JSON messages
      else {
        try {
          const message = JSON.parse(data.toString());
          console.log(`[Message] Received from client: ${JSON.stringify(message)}`);
          
          if (message.type === 'hello') {
            console.log(`[Info] Device identified: ${message.device || 'Unknown'}`);
          }
        } catch (jsonError) {
          console.log(`[Message] Received text: ${data.toString().substring(0, 100)}`);
        }
      }
    } catch (error) {
      console.error('[Error] Error processing message:', error.message);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WebSocket] ✗ Client disconnected from ${clientIP}`);
    console.log(`[WebSocket] Remaining clients: ${clients.size}`);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error.message);
  });
});

// ==================== Start Server ====================
server.listen(PORT, () => {
  console.log(`[Server] ✓ HTTP server listening on port ${PORT}`);
  console.log(`[Server] ✓ WebSocket server ready`);
  console.log(`[Server] URL: ws://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`\n[Server] Waiting for ESP32 connection...\n`);
});

// ==================== Graceful Shutdown ====================
process.on('SIGINT', () => {
  console.log('\n\n[Server] Shutting down gracefully...');
  
  // Close all client connections
  clients.forEach(client => {
    client.close();
  });
  
  // Close server
  server.close(() => {
    console.log('[Server] ✓ Server closed');
    process.exit(0);
  });
});
