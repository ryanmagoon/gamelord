import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../app.css';

// Restore theme preference (default: dark)
const savedTheme = localStorage.getItem('gamelord:theme');
if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} // else keep the dark class from index.html

// Restore vibe preference (default: 'default')
const savedVibe = localStorage.getItem('gamelord:vibe');
if (savedVibe && savedVibe !== 'default') {
  document.documentElement.dataset.vibe = savedVibe;
  // Dark-only vibes (e.g. unc) force dark mode
  if (savedVibe === 'unc') {
    document.documentElement.classList.add('dark');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);