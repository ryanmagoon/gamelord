# Sony retro controller artwork provenance

These PSX and PSP GLBs are original geometry authored in Blender for GameLord. The source generator is `scripts/controller-models/retro-sony.py`. Mesh utility code follows the existing GameLord controller generators. No downloaded controller meshes, photographs, screenshots, or third-party model packages are embedded. The original source, controller geometry and procedural 128x128 normal grain are offered under the repository MIT license. Sony/PS/PSP marks use verified public-domain textlogo outlines with sources below. This is not a manufacturer-official asset license or endorsement. Existing Sony trademarks and hardware designs are not relicensed by the MIT geometry license.

## Visual references, accessed 2026-09-06

- Sony PlayStation SCPH-7500 official instruction manual, page 8 (original DualShock front controls and shoulder layout): https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps-docs/JA_SCPH-7500_WEB.pdf
- Sony PSP-1000 v2.80 official instruction manual, page 20 (front proportions, utility strip, single analog nub): https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/psp-docs/JA_PSP-1000-2.8_WEB.pdf
- Official manual index: https://www.playstation.com/ja-jp/support/hardware/manuals/

Manual PDFs and raster reference extracts here are review-only references, outside the repository. They must not be packaged into the app. Japanese font rendering warnings from local PDF conversion affected surrounding labels, not the hardware drawings used for visual inspection.

## Design decisions

PSX targets the grey original PlayStation DualShock, with the circular left/right control mounting, compact outward handles, separate directional caps, low center Select/Start and Analog controls, red analog indicator, four shoulder buttons and two domed sticks. It does not reuse the existing DualShock 4 mesh. The stick cap diameter is 1.77 times the face cap diameter. PSP targets PSP-1000, with the thick chassis/silver rail, 16:9 screen, narrow lower utility controls, single small nub beneath the D-pad, front status lamps, top perforations and rear UMD ring. Sony, PlayStation emblem/wordmark and PSP lettering use normalized vector outlines from verified PD-textlogo sources, converted into mesh geometry.

## Articulation

Front +Z, top +Y, right +X. `gamepadButtonIndex` uses Libretro IDs. `buttonIndex` aliases the same values for legacy picking. PSX includes IDs 0 through 15. PSP includes 0 through 11, with no invented L2/R2 or stick clicks. D-pad parent `controlRole: dpad` has four semantic child directions. PSX axisIndices are [0,1] and [2,3]. PSP leftStick has axisIndices [0,1], axisMode translate and axisTravel 0.022. Legends move with the button caps. Static utility controls without corresponding emulated input are not tagged as clickable controls.

## Reproduction

Run Blender 5.2.1 LTS:

```
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/controller-models/retro-sony.py -- --family psx --output /tmp/gamelord-sony-proof --render
```

Repeat with `--family psp`. Front renders are 1400x1000. Settings renders are 440x314. Oblique renders verify visible shell depth. Final script exports only the controller hierarchy with no cameras, lights, external texture URIs or render artifacts. PSX includes one original embedded PNG normal tile.

## Additional official color references and review findings

- Exact original grey DualShock appears at the lower right of the archived 1999 Sony advertisement on https://www.playstation.com/en-us/playstation-history/1994-ps-one/ (asset https://gmedia.playstation.com/is/image/SIEPDC/ps1-autheticdualshockad-image-block-03-en-11oct24). This is the exact-revision color reference in `comparison.html`.
- PSP-1000 official product photograph appears on https://www.playstation.com/en-us/playstation-history/2000-ps2-psp/ (asset https://gmedia.playstation.com/is/image/SIEPDC/ps2-PSPlarge-image-block-01-en-18nov24).
- The standalone DualShock image from the official 30th-anniversary timeline and 2010 controller-evolution blog showed later PSone branding on inspection. Those were rejected as exact original-grey color/label references. They remain in the external evidence directory only to document the source mismatch.
- PSP manual pages 21 and 22 were inspected for top USB, IR, UMD-open slide, rear UMD ring, bottom headphone/remote and DC input details.
- The comparison records non-CAD ratio checks and remaining approximations. The final detail pass replaces generic logo lettering, adds the PlayStation emblem, adds original grain on matte PSX surfaces and adds PSP WLAN/Power-Hold side slides. Exact manufacturing dimensions and hidden rear molding remain approximations. No claim of perfect reproduction is supported.

## Logo outline rights, final detail pass

Source pages accessed 2026-09-06 and explicitly marked public domain / PD-textlogo. These are copyright classifications for the simple text/logo outlines, not trademark licenses or manufacturer endorsement. Raw downloaded SVGs and deterministic flattened copies are under scripts/controller-models/logos. PSP uses only its three large PSP-letter paths, excluding caption/TM artwork. PlayStation emblem uses its first three contours, excluding the registration symbol.

- Sony: https://commons.wikimedia.org/wiki/File:Sony_logo.svg (Yasuo Kuroki / Sony). Raw source https://upload.wikimedia.org/wikipedia/commons/c/ca/Sony_logo.svg
- PSP: https://commons.wikimedia.org/wiki/File:PSP_Logo.svg (Afrank99). Raw source https://upload.wikimedia.org/wikipedia/commons/0/0e/PSP_Logo.svg
- PlayStation emblem: https://commons.wikimedia.org/wiki/File:PlayStation_logo.svg (Sony Interactive Entertainment). Raw source https://upload.wikimedia.org/wikipedia/commons/0/00/PlayStation_logo.svg
- PlayStation wordmark: https://commons.wikimedia.org/wiki/File:PlayStation_Wordmark.svg (Sony Computer Entertainment, vector from earlier bitmap). Raw source https://upload.wikimedia.org/wikipedia/commons/9/94/PlayStation_Wordmark.svg

Flat SVGs sample curved source segments at 12 intervals. This is a deterministic geometric conversion, not a new logo redesign. Original controller geometry has no third-party model dependency. The procedural grain uses a fixed seed and is generated within the Blender script.
