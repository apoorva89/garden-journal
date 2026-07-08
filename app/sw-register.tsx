'use client';
import { useEffect, useState } from 'react';
import { BASE_PATH } from '../base-path.mjs';

interface SwMsg {
  url: string;
  cached: boolean;
  mode: string;
}

export default function ServiceWorkerRegistration() {
  const [msgs, setMsgs] = useState<SwMsg[]>([]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(BASE_PATH + '/sw.js');
    }

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SW_DEBUG') return;
      const path = (() => {
        try { return new URL(event.data.url).pathname; } catch { return event.data.url; }
      })();
      setMsgs((prev) => [...prev.slice(-29), { url: path, cached: event.data.cached, mode: event.data.mode }]);
    };

    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  if (msgs.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 72,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: 10,
        padding: '6px 8px',
        maxHeight: 180,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#94a3b8', fontSize: 9 }}>SW fetch log (green = cached)</span>
        <button
          onClick={() => setMsgs([])}
          style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
        >
          ✕
        </button>
      </div>
      {msgs.map((m, i) => (
        <div key={i} style={{ color: m.cached ? '#4ade80' : '#f87171', wordBreak: 'break-all' }}>
          {m.cached ? '✓' : '✗'} [{m.mode}] {m.url}
        </div>
      ))}
    </div>
  );
}
