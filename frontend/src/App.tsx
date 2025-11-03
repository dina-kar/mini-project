import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Decryption from './pages/Decryption'
import './App.css'

function App() {
  return (
    <div className="app">
      <div className="header" style={{ justifyContent: 'space-between' }}>
        <div className="title">
          <h1>Health Monitor</h1>
          <p>Real-time biometric tracking</p>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/decryption" className={({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`}>Decryption</NavLink>
        </nav>
      </div>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/decryption" element={<Decryption />} />
      </Routes>
    </div>
  )
}

export default App
