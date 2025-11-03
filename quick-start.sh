#!/bin/bash

# Quick Start Script for Biomedical Sensor System

echo "╔═══════════════════════════════════════════════╗"
echo "║   Biomedical Sensor System - Quick Start     ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📦 Installing dependencies..."
echo ""

# Install backend dependencies
echo "→ Installing backend packages..."
cd backend
pnpm install
if [ $? -ne 0 ]; then
    echo "❌ Backend installation failed"
    exit 1
fi
cd ..

# Install frontend dependencies
echo "→ Installing frontend packages..."
cd frontend/heart-rate-monitor
pnpm install
if [ $? -ne 0 ]; then
    echo "❌ Frontend installation failed"
    exit 1
fi
cd ../..

echo ""
echo "✅ Installation complete!"
echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   Next Steps:                                 ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "1️⃣  Start the backend server:"
echo "   cd backend && pnpm start"
echo ""
echo "2️⃣  Start the frontend (in a new terminal):"
echo "   cd frontend/heart-rate-monitor && pnpm dev"
echo ""
echo "3️⃣  Configure and upload ESP32 code:"
echo "   - Open esp_32_web.ino in Arduino IDE"
echo "   - Update WiFi credentials and server IP"
echo "   - Upload to ESP32"
echo ""
echo "4️⃣  Open browser to http://localhost:5173"
echo "   - Connect to WebSocket server"
echo "   - Place finger on MAX30102 sensor"
echo "   - View real-time data!"
echo ""
echo "📚 For more details, see README.md"
echo ""
