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

interface ChartDataPoint {
  time: string
  hr: number
  spo2: number
}

function App() {
  const [sensorData, setSensorData] = useState<SensorData | null>(null)
  const [connected, setConnected] = useState(false)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  // Default to localhost for development, change to your Render URL for production
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

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="title">
          <h1>Health Monitor</h1>
          <p>Real-time biometric tracking</p>
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
          <div className="primary-metrics">
            <div className={`metric ${getStatus(sensorData.heartRateAvg, 'hr')}`}>
              <div className="label">Heart Rate</div>
              <div className="value">
                {sensorData.heartRateAvg}
                <span>bpm</span>
              </div>
            </div>

            <div className={`metric ${getStatus(sensorData.spo2, 'spo2')}`}>
              <div className="label">Blood Oxygen</div>
              <div className="value">
                {sensorData.spo2}
                <span>%</span>
              </div>
            </div>

            <div className="metric">
              <div className="label">Temperature</div>
              <div className="value">
                {sensorData.temperature.toFixed(1)}
                <span>°C</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="chart-section">
            <h3>Trends</h3>
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

          {/* Secondary Metrics */}
          <div className="secondary-metrics">
            <div className="info-card">
              <div className="info-label">Signal Quality</div>
              <div className="info-value">{sensorData.signalQuality}/100</div>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${sensorData.signalQuality}%` }}
                />
              </div>
            </div>

            <div className="info-card">
              <div className="info-label">Perfusion Index</div>
              <div className="info-value">{sensorData.perfusionIndex.toFixed(2)}%</div>
            </div>

            <div className="info-card">
              <div className="info-label">Last Update</div>
              <div className="info-value">
                {new Date(sensorData.receivedAt).toLocaleTimeString()}
              </div>
            </div>

            <div className="info-card">
              <div className="info-label">Security</div>
              <div className="info-value">🔒 ChaCha20</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
