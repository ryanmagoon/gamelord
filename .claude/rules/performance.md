# Performance — Frame Rate is Sacred

Emulation frame pacing is a top-tier concern. Every code change — especially in the renderer, game window, and emulation loop — must be evaluated for its impact on consistent frame delivery. The app must look and feel smooth on 120Hz+ displays.

## Rules

- **No `backdrop-filter` or `backdrop-blur` in the game window.** These force expensive GPU compositing every frame and compete with the WebGL shader pipeline. Use solid or semi-transparent backgrounds instead. Backdrop effects are fine in the library UI where frame pacing doesn't matter.
- **No expensive CSS effects layered over the game canvas.** Avoid `box-shadow` animations, large `filter: blur()`, or CSS `transform` animations on elements that overlap the canvas during gameplay. Static transforms and opacity transitions are acceptable.
- **Renderer draws must be synced to `requestAnimationFrame`.** Never draw to WebGL directly from an IPC event handler. Buffer the latest frame and draw it in the next rAF callback to align with the display's vsync.
- **Emulation timing must not rely on `setTimeout`/`setInterval` precision.** These have ~4ms minimum granularity and jitter under load. The target architecture is a dedicated Worker thread with high-resolution timing (see P2 in `DEVELOPMENT_PLAN.md`).
- **Profile before adding multi-pass shaders.** Any shader preset with 3+ passes must be tested on integrated GPUs (e.g. Apple M-series) to confirm it maintains 60fps. Include lighter alternatives users can fall back to.
- **Measure, don't guess.** When in doubt about a change's performance impact, add a temporary FPS/frame-time counter and test with a real game running. Don't ship code that "should be fine" without verification.
- **Pause-state effects are exempt.** When the emulation loop is stopped (paused, menu open, etc.), the GPU is idle and expensive cosmetic effects (VHS distortion, scanline drift, static overlays) are fair game. The performance rules above apply to effects running *during active gameplay*.
