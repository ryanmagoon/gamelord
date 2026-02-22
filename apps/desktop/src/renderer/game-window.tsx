import React from 'react'
import { createRoot } from 'react-dom/client'
import { GameWindow } from './components/GameWindow'
import { DevAgentation } from './components/DevAgentation'
import '../game-window.css'

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <GameWindow />
      <DevAgentation />
    </React.StrictMode>
  )
}
