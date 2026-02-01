import React from 'react'
import { createRoot } from 'react-dom/client'
import { GameWindow } from './components/GameWindow'
import '../app.css'

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <GameWindow />
    </React.StrictMode>
  )
}
