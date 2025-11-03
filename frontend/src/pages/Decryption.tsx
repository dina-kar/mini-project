import { useMemo, useState, type CSSProperties } from 'react'
import { decode as b64decode } from '@stablelib/base64'
import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex'
import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305'

type Encoding = 'hex' | 'base64'

function bytesToHex(bytes: Uint8Array) {
  return hexEncode(bytes)
}

function safeDecode(input: string, enc: Encoding) {
  try {
    const clean = input.trim()
    if (!clean) return new Uint8Array()
    return enc === 'hex' ? hexDecode(clean) : b64decode(clean)
  } catch {
    return null
  }
}

function tryJsonParse(bytes: Uint8Array) {
  try {
    const text = new TextDecoder().decode(bytes)
    return { text, json: JSON.parse(text) }
  } catch {
    try {
      const text = new TextDecoder().decode(bytes)
      return { text }
    } catch {
      return null
    }
  }
}

const sample = {
  note: 'Sample only. Replace with your payload to verify decryption.',
  encoding: 'hex' as Encoding,
  // 32-byte key, 12-byte nonce, small JSON ciphertext with tag
  key: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  nonce: '000000000000000000000002',
  // These are placeholders; users should paste real values from backend
  ciphertext: '',
  tag: '',
}

export default function Decryption() {
  const [encoding, setEncoding] = useState<Encoding>(sample.encoding)
  const [keyStr, setKeyStr] = useState(sample.key)
  const [nonceStr, setNonceStr] = useState(sample.nonce)
  const [cipherStr, setCipherStr] = useState(sample.ciphertext)
  const [tagStr, setTagStr] = useState(sample.tag)
  const [aadStr, setAadStr] = useState('')

  const decoded = useMemo(() => {
    const key = safeDecode(keyStr, encoding)
    const nonce = safeDecode(nonceStr, encoding)
    const ciphertext = safeDecode(cipherStr, encoding)
    const tag = safeDecode(tagStr, encoding)
    const aad = new TextEncoder().encode(aadStr)
    return { key, nonce, ciphertext, tag, aad }
  }, [keyStr, nonceStr, cipherStr, tagStr, aadStr, encoding])

  const decryption = useMemo(() => {
    const errors: string[] = []
    const { key, nonce, ciphertext, tag, aad } = decoded
    if (!key || !nonce || !ciphertext || !tag) {
      errors.push('Invalid encoding in one or more fields (key, nonce, ciphertext, tag).')
      return { ok: false as const, errors }
    }
    if (key.length !== 32) errors.push(`Key must be 32 bytes, got ${key.length}.`)
    if (nonce.length !== 12) errors.push(`Nonce must be 12 bytes, got ${nonce.length}.`)
    if (ciphertext.length === 0) errors.push('Ciphertext is empty.')
    if (tag.length !== 16) errors.push(`Auth tag must be 16 bytes, got ${tag.length}.`)
    if (errors.length) return { ok: false as const, errors }

    try {
      const aead = new ChaCha20Poly1305(key)
      const combined = new Uint8Array(ciphertext.length + tag.length)
      combined.set(ciphertext, 0)
      combined.set(tag, ciphertext.length)
      const plaintext = aead.open(nonce, combined, aad)
      if (!plaintext) {
        return { ok: false as const, errors: ['Authentication failed: tag mismatch.'] }
      }
      const parsed = tryJsonParse(plaintext)
      return { ok: true as const, plaintext, parsed }
    } catch (e) {
      return { ok: false as const, errors: ['Decryption error: ' + (e as Error).message] }
    }
  }, [decoded])

  return (
    <div className="content" style={{ maxWidth: 1200 }}>
      <h2 style={{ marginBottom: '1rem' }}>Decryption Visualizer</h2>
      <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>
        Inspect ChaCha20-Poly1305 decryption step-by-step. Provide key, nonce, ciphertext, and tag in hex or base64.
      </p>

      <div className="info-card" style={{ marginBottom: '1rem' }}>
        <div className="info-label">Encoding</div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="radio" name="enc" checked={encoding==='hex'} onChange={() => setEncoding('hex')} />
            Hex
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="radio" name="enc" checked={encoding==='base64'} onChange={() => setEncoding('base64')} />
            Base64
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="info-card">
          <div className="info-label">Key (32 bytes)</div>
          <textarea value={keyStr} onChange={e=>setKeyStr(e.target.value)} rows={2} style={taStyle} placeholder="32-byte key" />
          <Meta decoded={decoded.key} />
        </div>
        <div className="info-card">
          <div className="info-label">Nonce (12 bytes)</div>
          <textarea value={nonceStr} onChange={e=>setNonceStr(e.target.value)} rows={2} style={taStyle} placeholder="12-byte nonce" />
          <Meta decoded={decoded.nonce} />
        </div>
        <div className="info-card">
          <div className="info-label">Ciphertext</div>
          <textarea value={cipherStr} onChange={e=>setCipherStr(e.target.value)} rows={3} style={taStyle} placeholder="Ciphertext" />
          <Meta decoded={decoded.ciphertext} />
        </div>
        <div className="info-card">
          <div className="info-label">Auth Tag (Poly1305)</div>
          <textarea value={tagStr} onChange={e=>setTagStr(e.target.value)} rows={2} style={taStyle} placeholder="16-byte tag" />
          <Meta decoded={decoded.tag} />
        </div>
        <div className="info-card">
          <div className="info-label">AAD (optional, UTF-8)</div>
          <textarea value={aadStr} onChange={e=>setAadStr(e.target.value)} rows={2} style={taStyle} placeholder="Additional Authenticated Data" />
          <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Length: {new TextEncoder().encode(aadStr).length} bytes</div>
        </div>
      </div>

      <div className="info-card" style={{ marginBottom: '1.5rem' }}>
        <div className="info-label">Operations</div>
        <ol style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
          <li>Decode inputs from {encoding.toUpperCase()} to bytes</li>
          <li>Initialize ChaCha20-Poly1305 with 256-bit key</li>
          <li>Derive Poly1305 one-time key from ChaCha20 block 0</li>
          <li>Authenticate AAD and ciphertext with Poly1305 to verify the tag</li>
          <li>Generate keystream from ChaCha20 (counter starting at 1) and XOR with ciphertext</li>
          <li>Produce plaintext; attempt to parse as UTF-8 and JSON</li>
        </ol>
      </div>

      {decryption.ok ? (
        <div className="info-card" style={{ borderColor: '#22c55e' }}>
          <div className="info-label">Decryption Result</div>
          <div className="info-value" style={{ fontSize: 14, fontWeight: 400 }}>
            <div style={{ marginBottom: 8, color: '#22c55e' }}>Authentication succeeded ✓</div>
            <div style={{ marginBottom: 8 }}>
              Plaintext (hex): <code>{bytesToHex(decryption.plaintext!)}</code>
            </div>
            {decryption.parsed && (
              <div>
                <div style={{ marginBottom: 4 }}>Plaintext (utf-8):</div>
                <pre style={preStyle}>{decryption.parsed.text}</pre>
                {'json' in decryption.parsed && (
                  <>
                    <div style={{ marginTop: 8, marginBottom: 4 }}>Parsed JSON:</div>
                    <pre style={preStyle}>{JSON.stringify((decryption.parsed as any).json, null, 2)}</pre>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="info-card" style={{ borderColor: '#ef4444' }}>
          <div className="info-label">Issues</div>
          <ul style={{ color: '#bbb', paddingLeft: '1.25rem' }}>
            {decryption.errors?.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            Tip: ensure key=32 bytes, nonce=12 bytes, tag=16 bytes; if your backend sends combined cipher+tag, split them.
          </div>
        </div>
      )}
    </div>
  )
}

function Meta({ decoded }: { decoded: Uint8Array | null }) {
  if (decoded === null) {
    return <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>Invalid {`format`}</div>
  }
  return <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Length: {decoded?.length ?? 0} bytes</div>
}

const taStyle: CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: '#0f0f0f',
  color: '#fff',
  border: '1px solid #333',
  borderRadius: 8,
  resize: 'vertical',
}

const preStyle: CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '0.75rem',
  overflowX: 'auto',
  fontSize: 13,
  lineHeight: 1.5,
}
