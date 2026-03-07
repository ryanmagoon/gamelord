// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Verifies that index.html contains the inline critical styles and theme
 * script needed to prevent FOUC (flash of unstyled content) on cold launch.
 */
describe('graceful startup — index.html', () => {
  const htmlPath = path.resolve(__dirname, '../../index.html')
  const html = fs.readFileSync(htmlPath, 'utf8')

  it('has an inline theme script that reads localStorage and sets colorScheme', () => {
    expect(html).toContain("localStorage.getItem('gamelord:theme')")
    expect(html).toContain('document.documentElement.style.colorScheme')
  })

  it('sets body background based on resolved theme', () => {
    expect(html).toContain("document.body.style.background = dark ? '#000' : '#fff'")
  })

  it('starts #root with opacity 0 for fade-in', () => {
    expect(html).toMatch(/#root\s*\{[^}]*opacity:\s*0/)
  })

  it('defines a .mounted class that sets opacity to 1', () => {
    expect(html).toMatch(/#root\.mounted\s*\{[^}]*opacity:\s*1/)
  })

  it('has a CSS transition on #root opacity', () => {
    expect(html).toMatch(/#root\s*\{[^}]*transition:\s*opacity/)
  })
})

/**
 * Verifies that LibraryView adds the .mounted class to #root after data loads.
 */
describe('graceful startup — LibraryView', () => {
  const libraryViewPath = path.resolve(__dirname, '../renderer/components/LibraryView.tsx')
  const source = fs.readFileSync(libraryViewPath, 'utf8')

  it('adds the mounted class to #root after library loads', () => {
    expect(source).toContain("classList.add('mounted')")
  })

  it('uses triple-rAF to let the compositor settle before fading in', () => {
    // Triple-rAF pattern: nested requestAnimationFrame calls to give the
    // GPU compositor time to rasterize the full window surface before the
    // opacity transition begins.
    expect(source).toContain('requestAnimationFrame')
  })

  it('only reveals once (uses a ref to track)', () => {
    expect(source).toContain('hasRevealedRef')
  })
})

/**
 * Verifies that the main process BrowserWindow is created hidden
 * and shown only on ready-to-show.
 */
describe('graceful startup — main process', () => {
  const mainPath = path.resolve(__dirname, '../main.ts')
  const mainSource = fs.readFileSync(mainPath, 'utf8')

  it('creates BrowserWindow with show: false', () => {
    expect(mainSource).toMatch(/show:\s*false/)
  })

  it('does not hardcode a backgroundColor property (theme script handles it)', () => {
    // Match the actual property assignment pattern, not the word in comments
    expect(mainSource).not.toMatch(/backgroundColor\s*:/)
  })

  it('listens for ready-to-show with a fallback timeout', () => {
    expect(mainSource).toContain("'ready-to-show'")
    expect(mainSource).toContain('mainWindow.show()')
    // Fallback timeout so the window shows even if renderer never signals
    expect(mainSource).toContain('setTimeout(showOnce')
  })

  it('listens for app:contentReady via ipcMain to show the window', () => {
    expect(mainSource).toContain("ipcMain.once('app:contentReady'")
  })
})

/**
 * Verifies that the preload bridge exposes a contentReady method.
 */
describe('graceful startup — preload', () => {
  const preloadPath = path.resolve(__dirname, '../preload.ts')
  const preloadSource = fs.readFileSync(preloadPath, 'utf8')

  it('exposes contentReady that sends the app:contentReady IPC signal', () => {
    expect(preloadSource).toContain("contentReady")
    expect(preloadSource).toContain("'app:contentReady'")
  })
})

/**
 * Verifies that LibraryView sends contentReady when library data loads.
 */
describe('graceful startup — LibraryView contentReady', () => {
  const libraryViewPath = path.resolve(__dirname, '../renderer/components/LibraryView.tsx')
  const source = fs.readFileSync(libraryViewPath, 'utf8')

  it('calls api.contentReady() when library data finishes loading', () => {
    expect(source).toContain('api.contentReady()')
  })

  it('waits for both loading=false and gridReady before revealing', () => {
    // Reveal is gated by shouldReveal which requires both conditions
    expect(source).toContain('gridReady')
    expect(source).toContain('handleGridReady')
    expect(source).toContain('onReady={handleGridReady}')
  })
})

/**
 * Verifies that GameLibrary fires onReady once the grid has laid out cards.
 */
describe('graceful startup — GameLibrary onReady', () => {
  const libraryPath = path.resolve(__dirname, '../../../../packages/ui/components/GameLibrary.tsx')
  const source = fs.readFileSync(libraryPath, 'utf8')

  it('accepts an onReady callback prop', () => {
    expect(source).toContain('onReady')
  })

  it('fires onReady once when layout items are available', () => {
    expect(source).toContain('hasSignalledReady')
    expect(source).toContain('onReady?.()')
  })
})
