import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './App.css'

interface SensorData {
  timestamp: number
  heartRate: number
  heartRateAvg: number
  spo2: number
  temperature: number
  irValue: number
  redValue: number
  perfusionIndex: number
  signalQuality: number
  receivedAt: string
}

interface EncryptionData {
  ciphertext: string
  plaintext: string
  blockCounter: number
}

interface ChartDataPoint {
  time: string
  hr: number
  spo2: number
}

function App() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null)
  const [encryptionData, setEncryptionData] = useState<EncryptionData | null>(null)
  const [connected, setConnected] = useState(false)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [wsUrl, setWsUrl] = useState('ws://localhost:8080')
  const wsRef = useRef<WebSocket | null>(null)
  const maxChartPoints = 15

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'sensorData') {
          const data: SensorData = message.data
          setSensorData(data)
          
          if (message.encrypted) {
            setEncryptionData(message.encrypted)
          }
          
          const timeStr = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          })
          
          setChartData(prev => {
            const newData = [...prev, {
              time: timeStr,
              hr: data.heartRateAvg,
              spo2: data.spo2
            }]
            return newData.slice(-maxChartPoints)
          })
        }
      } catch (error) {
        console.error('Error:', error)
      }
    }

    ws.onerror = () => setConnected(false)
    ws.onclose = () => setConnected(false)

    wsRef.current = ws
  }

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      setConnected(false)
    }
  }

  useEffect(() => {
    return () => disconnectWebSocket()
  }, [])

  const getStatus = (value: number, type: 'hr' | 'spo2') => {
    if (type === 'hr') {
      if (value >= 60 && value <= 100) return 'good'
      if (value >= 40 && value <= 120) return 'warning'
      return 'danger'
    } else {
      if (value >= 95) return 'good'
      if (value >= 90) return 'warning'
      return 'danger'
    }
  }

  const formatHex = (hex: string, bytesPerLine: number = 16) => {
    if (!hex) return []
    const bytes = hex.match(/.{1,2}/g) || []
    const lines = []
    for (let i = 0; i < bytes.length; i += bytesPerLine) {
      lines.push(bytes.slice(i, i + bytesPerLine).join(' '))
    }
    return lines
  }

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="title">
          <h1>🔒 Encrypted Health Monitor</h1>
          <p>Real-time biometric tracking with ChaCha20 encryption</p>
        </div>
        <div className="connection">
          <input
            type="text"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            disabled={connected}
            placeholder="ws://localhost:8080"
          />
          <button 
            onClick={connected ? disconnectWebSocket : connectWebSocket}
            className={connected ? 'disconnect' : 'connect'}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
          <div className={`status ${connected ? 'on' : 'off'}`}>
            {connected ? '● Online' : '○ Offline'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {!sensorData && connected && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Waiting for sensor data...</p>
        </div>
      )}

      {sensorData && (
        <div className="content">
          {/* Primary Metrics */}
          <div className="metrics-row">
            <div className={`metric-large ${getStatus(sensorData.heartRateAvg, 'hr')}`}>
              <div className="metric-header">
                <span className="icon">❤️</span>
                <span className="label">Heart Rate</span>
              </div>
              <div className="value">
                {sensorData.heartRateAvg}
                <span className="unit">bpm</span>
              </div>
              <div className="subtext">
                Instant: {sensorData.heartRate} bpm
              </div>
            </div>

            <div className={`metric-large ${getStatus(sensorData.spo2, 'spo2')}`}>
              <div className="metric-header">
                <span className="icon">🫁</span>
                <span className="label">Blood Oxygen</span>
              </div>
              <div className="value">
                {sensorData.spo2}
                <span className="unit">%</span>
              </div>
              <div className="subtext">
                {sensorData.spo2 >= 95 ? 'Normal' : sensorData.spo2 >= 90 ? 'Low' : 'Critical'}
              </div>
            </div>

            <div className="metric-large">
              <div className="metric-header">
                <span className="icon">🌡️</span>
                <span className="label">Temperature</span>
              </div>
              <div className="value">
                {sensorData.temperature.toFixed(1)}
                <span className="unit">°C</span>
              </div>
              <div className="subtext">
                {(sensorData.temperature * 9/5 + 32).toFixed(1)}°F
              </div>
            </div>

            <div className="metric-large">
              <div className="metric-header">
                <span className="icon">📊</span>
                <span className="label">Signal Quality</span>
              </div>
              <div className="value">
                {sensorData.signalQuality}
                <span className="unit">/100</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${sensorData.signalQuality}%` }}
                />
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="chart-section">
            <h3>📈 Real-time Trends</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis 
                  dataKey="time" 
                  stroke="#666" 
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  yAxisId="left"
                  stroke="#ef4444" 
                  style={{ fontSize: '12px' }}
                  domain={[40, 120]}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  stroke="#3b82f6" 
                  style={{ fontSize: '12px' }}
                  domain={[85, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="hr" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={false}
                  name="Heart Rate"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="spo2" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  name="SpO2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Encryption Details */}
          {encryptionData && (
            <div className="encryption-section">
              <h3>🔐 Encryption Details (ChaCha20 FPGA)</h3>
              <div className="encryption-grid">
                <div className="encryption-box">
                  <div className="box-header">
                    <span className="box-icon">🔓</span>
                    <span className="box-title">Plaintext (First 23 bytes)</span>
                  </div>
                  <div className="hex-data">
                    {formatHex(encryptionData.plaintext, 16).map((line, i) => (
                      <div key={i} className="hex-line">{line}</div>
                    ))}
                  </div>
                  <div className="box-footer">Sensor data before encryption</div>
                </div>

                <div className="encryption-arrow">
                  <div className="arrow-label">FPGA ChaCha20</div>
                  <div className="arrow">→</div>
                  <div className="arrow-detail">Block #{encryptionData.blockCounter}</div>
                </div>

                <div className="encryption-box">
                  <div className="box-header">
                    <span className="box-icon">🔒</span>
                    <span className="box-title">Ciphertext (64 bytes)</span>
                  </div>
                  <div className="hex-data encrypted">
                    {formatHex(encryptionData.ciphertext, 16).map((line, i) => (
                      <div key={i} className="hex-line">{line}</div>
                    ))}
                  </div>
                  <div className="box-footer">Encrypted data transmitted</div>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Metrics */}
          <div className="details-grid">
            <div className="detail-card">
              <div className="detail-label">💉 Perfusion Index</div>
              <div className="detail-value">{sensorData.perfusionIndex.toFixed(2)}%</div>
              <div className="detail-info">Blood flow quality</div>
            </div>

            <div className="detail-card">
              <div className="detail-label">🔴 IR Sensor</div>
              <div className="detail-value">{sensorData.irValue.toLocaleString()}</div>
              <div className="detail-info">Infrared reading</div>
            </div>

            <div className="detail-card">
              <div className="detail-label">🔴 Red Sensor</div>
              <div className="detail-value">{sensorData.redValue.toLocaleString()}</div>
              <div className="detail-info">Red light reading</div>
            </div>

            <div className="detail-card">
              <div className="detail-label">⏱️ Last Update</div>
              <div className="detail-value">
                {new Date(sensorData.receivedAt).toLocaleTimeString()}
              </div>
              <div className="detail-info">Server timestamp</div>
            </div>

            <div className="detail-card">
              <div className="detail-label">⚡ Device Time</div>
              <div className="detail-value">{(sensorData.timestamp / 1000).toFixed(1)}s</div>
              <div className="detail-info">Uptime</div>
            </div>

            <div className="detail-card">
              <div className="detail-label">� Encryption</div>
              <div className="detail-value">ChaCha20</div>
              <div className="detail-info">FPGA accelerated</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
