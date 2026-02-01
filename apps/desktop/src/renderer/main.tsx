import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../app.css';

// Restore theme preference (default: dark)
const savedTheme = localStorage.getItem('gamelord:theme');
if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} // else keep the dark class from index.html

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);