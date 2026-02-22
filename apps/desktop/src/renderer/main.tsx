import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../app.css';

// Restore theme preference before React mounts (prevents flash).
// Three-state: 'system' (default) | 'dark' | 'light'
const savedTheme = localStorage.getItem('gamelord:theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

const shouldBeDark =
  savedTheme === 'dark' ||
  (savedTheme !== 'light' && prefersDark); // 'system' or null → follow OS

document.documentElement.classList.toggle('dark', shouldBeDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
