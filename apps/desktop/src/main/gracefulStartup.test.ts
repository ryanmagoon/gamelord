// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Verifies that index.html contains the inline critical styles and meta tags
 * needed to prevent FOUC (flash of unstyled content) on cold launch.
 */
describe('graceful startup — index.html', () => {
  const htmlPath = path.resolve(__dirname, '../../index.html')
  const html = fs.readFileSync(htmlPath, 'utf-8')

  it('has color-scheme meta tag set to dark', () => {
    expect(html).toContain('<meta name="color-scheme" content="dark" />')
  })

  it('has inline body background matching the app dark theme', () => {
    expect(html).toMatch(/body\s*\{[^}]*background:\s*#0a0a0a/)
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
 * Verifies that App.tsx adds the .mounted class to #root after React mounts.
 */
describe('graceful startup — App component', () => {
  const appPath = path.resolve(__dirname, '../renderer/App.tsx')
  const appSource = fs.readFileSync(appPath, 'utf-8')

  it('adds the mounted class to #root after React mounts', () => {
    expect(appSource).toContain("classList.add('mounted')")
  })

  it('uses requestAnimationFrame inside useEffect to defer the class addition', () => {
    expect(appSource).toContain('requestAnimationFrame')
  })
})

/**
 * Verifies that the main process BrowserWindow is created hidden
 * and shown only on ready-to-show.
 */
describe('graceful startup — main process', () => {
  const mainPath = path.resolve(__dirname, '../main.ts')
  const mainSource = fs.readFileSync(mainPath, 'utf-8')

  it('creates BrowserWindow with show: false', () => {
    expect(mainSource).toMatch(/show:\s*false/)
  })

  it('sets backgroundColor to match the inline HTML background', () => {
    expect(mainSource).toContain("backgroundColor: '#0a0a0a'")
  })

  it('listens for ready-to-show to call mainWindow.show()', () => {
    expect(mainSource).toContain("'ready-to-show'")
    expect(mainSource).toContain('mainWindow.show()')
  })
})
