'use client';
import { useEffect } from 'react';
import { BASE_PATH } from '../base-path.mjs';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(BASE_PATH + '/sw.js');
    }
  }, []);
  return null;
}
