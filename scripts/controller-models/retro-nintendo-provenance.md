# Retro Nintendo model provenance and accuracy review

Status: original articulated meshes exported and metadata checked. Front, angled and rear proofs inspected. The second pass adds manual-verified component locations and rear geometry. Independent visual review remains the release gate. These are reference-based recreations, not manufacturer CAD or manufacturer-licensed assets. Do not call them perfectly accurate.

## Authorship and reuse

All enclosure and control geometry is authored procedurally in `retro-nintendo.py` for GameLord and distributed under the repository MIT license. No third-party 3D mesh or photograph is embedded in the GLBs. Reference photographs remain outside the repository and are used only to inspect original hardware.

The following supplied vector wordmarks are converted to thin mesh geometry. Their Commons source pages identify them as public-domain simple text/geometric logos (PD-textlogo). Trademark rights remain with Nintendo. The MIT claim applies to our geometry and code, not to Nintendo's marks.

| File | Source page | Attribution |
| --- | --- | --- |
| `logos/nintendo.svg` | https://commons.wikimedia.org/wiki/File:Nintendo_logo.svg | Nintendo, source Nintendo.com. Download https://upload.wikimedia.org/wikipedia/commons/5/51/Nintendo_logo.svg |
| `logos/super-nintendo.svg` | https://commons.wikimedia.org/wiki/File:Super_Nintendo_Entertainment_System_logo.svg | Apollolux vector recreation, Nintendo wordmark. |
| `logos/gameboy.svg` | https://commons.wikimedia.org/wiki/File:Gameboy_logo.svg | Nintendo, vector conversion by Nmnogueira, later original-source version by JaJaWa. Only GAME BOY portion used. |
| `logos/gbc.svg` | https://commons.wikimedia.org/wiki/File:Game_Boy_Color_logo.svg | Nintendo wordmark. Five COLOR letter paths used with their respective colors. |
| `logos/gba.svg` | https://commons.wikimedia.org/wiki/File:Game_Boy_Advance_logo.svg | Nintendo wordmark, vector conversion by Nuno Nogueira (Nmnogueira). White letter elements used, blue background omitted. |

## Exact hardware choices and photograph references

| Asset | Hardware | References |
| --- | --- | --- |
| `nes.glb` | Original rectangular NES-004, US | https://commons.wikimedia.org/wiki/File:Nintendo-Entertainment-System-NES-Controller-FL.jpg . Evan-Amos photograph of original Nintendo controller. |
| `snes.glb` | SNS-005, US purple controls | https://www.retrofixes.com/products/snes-oem-original-controller . Photo https://www.retrofixes.com/cdn/shop/products/snes_controller_oem_original_retrofixes.jpg . Earlier straight-on SNS-102 photo used for common shell/control geometry only: https://stoneagegamer.com/original-controller-for-super-nes.html . Revision distinction crosschecked at https://retrorgb.com/sns-102-controller-tear-down.html . |
| `gb.glb` | DMG-01 original grey | https://gbhwdb.gekkio.fi/consoles/dmg . Actual hardware photograph https://gbhwdb.gekkio.fi/static/dmg/G01100292_01_front.jpg . |
| `gbc.glb` | CGB-001, solid Grape | https://gbhwdb.gekkio.fi/consoles/cgb/ . C10203977 Japanese Grape reference https://gbhwdb.gekkio.fi/static/cgb/C10203977_01_front.jpg . Atomic Purple Commons image was supplementary geometry reference, not the target color. |
| `gba.glb` | AGB-001, original landscape Indigo | https://commons.wikimedia.org/wiki/File:Nintendo-Game-Boy-Advance-Purple-FL.jpg . Evan-Amos original hardware photograph. |

These are photographs of official hardware. They are not all photographs published by Nintendo. No scan, caliper measurements, or manufacturer engineering drawings were available. Perspective and aged plastic limit exact numeric comparisons.

## Proportion checks and remaining differences

Ratios below describe the authored model. Photo comparisons are visual estimates unless otherwise noted. They do not establish a precision tolerance.

| Model | Authored main-shell proportions | Checked against reference | Remaining accuracy limitations |
| --- | --- | --- | --- |
| NES | Width 2, height 0.87, width/height 2.30. A/B centers 0.32 apart, 16% of shell width. D-pad width 20% of shell. | Rectangular grey frame, black face panel, four grey center stripes, red plain Nintendo wordmark, B left/A right, horizontal Select/Start. | Rear screws, molded rear text, full cable and plug not modeled. Printed small legends use substitute type geometry. |
| SNES | Width about 2, main-shell height about 0.85, width/height about 2.35. Face controls X/Y lavender concave and A/B purple convex. D-pad width 17.8% of shell. | SNS-005 SUPER NINTENDO stamp, US button ordering/colors, two diagonal control insets, tilted Select/Start and L/R. | Shell outline is sampled from photographs, not measured. Shoulder curvature and relief remain approximate. Rear screws, small molded details, full cable/connector omitted. |
| GB | Width 2, height 3.29, height/width 1.645. LCD 1.15 by 1.035, aspect 1.111. | Tall DMG form, grey bezel, olive screen, burgundy A/B, large lower-right radius, six angled speaker vents, blue Nintendo/GAME BOY. | Screen/bezel placement and side ports remain approximate. Original photograph is aged and missing bezel paint. Rear cover, grip ribs, screw seats and a boolean-cut cartridge opening are included. Fine molded regulatory text and side-control dimensions remain approximate. |
| GBC | Width about 2, height 3.42, height/width 1.71. LCD aspect about 1.10. | Solid Grape CGB reference, black lens, grey unlit display, colored COLOR glyphs, controls, curved lower shell, perforated speaker. | Bezel's bowed lower edge is simplified. POWER print and wave marks, infrared window, right-side switch, left-side wheel, bottom jacks, rear cover and cartridge recess are included. Fine factory markings and bezel curvature remain approximate. |
| GBA | Width about 2.16, height about 1.21, width/height about 1.79. LCD 0.96 by 0.64, aspect 1.5. | Original landscape Indigo enclosure, central lens, pale controls, small round Start/Select on left, six speaker slots right, L/R at top. | Main-shell silhouette is photograph-derived. Curved shoulder wings, extension socket, accessory attachment slots, bottom power/audio controls, wrist strap recess, rear battery cover and cartridge seat are included. Fine debossed lettering and internal port geometry remain approximate. |

Observed render defects corrected during review: Nintendo SVG initially included only the first path, then omitted its polygon-based letters. Both were fixed by combining all elements with their transformations. Initial SNES reference was SNS-102 and has been replaced with the requested SNS-005 logotype. NES wordmark oval was removed. Initial GBC LCD color, button labeling, font shapes and enclosure curvature were corrected. Long sparse curve segments caused GBC outline overshoot, fixed with additional side/top control points.

## Articulation and verification

Coordinates preserve +X right, +Y up, +Z front. Root extras state hardware revision and libretro indexing. Each face/control pivot has `gamepadButtonIndex`. The D-pad shares `controlRole: dpad`, with four direction child pivots. GBC and GBA cap lettering is parented to its cap.

Expected libretro IDs: all models B0, Select2, Start3, Up4, Down5, Left6, Right7, A8. SNES additionally Y1, X9, L10, R11. GBA additionally L10, R11.

Build using Blender 5.2.1 LTS:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/controller-models/retro-nintendo.py -- --family snes --output packages/ui/components/GamepadArtwork/models/retro --proof /absolute/proof/path
```

Proof artifacts are written to the directory supplied through `--proof`. Each asset has a front render and a 440-pixel proof. `comparison.html` puts each original-hardware reference beside the model. `validation.json` records file sizes, hashes, exact unique control IDs and embedded-resource validation. Runtime browser interaction verification belongs to the integrating task.

## Second detail pass: manual and rear references

- Nintendo Game Boy Advance instruction booklet, component diagram on printed page 7 (PDF page 3): https://www.nintendo.com/eu/media/downloads/support_1/game_boy_advance_4/GBA_Manual_UK_DE_FR.pdf . Used for top EXT socket and attachment slots, bottom switch/headphone/volume order, shoulder silhouette, rear cover latch and wrist strap placement.
- Original Nintendo CGB-USA instruction booklet scan: https://www.manualslib.com/manual/4222938/Nintendo-Game-Boy-Color.html . Used for right-side power switch, left-side volume and EXT connector, top infrared window and bottom DC/headphone locations.
- DMG rear: https://gbhwdb.gekkio.fi/static/dmg/G01100292_02_back.jpg . Photo has the battery cover removed, so opening dimensions guide the authored closed cover.
- CGB Grape rear: https://gbhwdb.gekkio.fi/static/cgb/C10203977_02_back.jpg . Used for cover dimensions/latch, cartridge channel and screw/label placement.
- AGB Indigo rear: https://gbhwdb.gekkio.fi/static/agb/AH10045235_02_back.jpg . Used for battery cover/latch, label footprint, screw recesses and shoulder contours.
- Game Boy hardware database photographs are by Gekkio and contributors, licensed CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ . They are external reference/proof materials, not textures inside the model.

The previous handheld depth was roughly half the hardware's depth. The new enclosure depths are approximately 0.705 model units for DMG (width 2), 0.685 for CGB (width 2), and 0.365 for AGB (width about 2.16). The cartridge seats use real Boolean openings in the rear enclosure. No unique serial number is copied or invented.

Additional proof files are `gb-angled.png`, `gb-rear.png`, `gbc-angled.png`, `gbc-rear.png`, `gba-angled.png`, `gba-rear.png`, and `snes-angled.png`. The camera uses explicit world +Y up so inspection matches the runtime axes.

The D-pad center dish is a physical shallow Boolean recess, not a decal. SNES shoulder contours follow the upper shell at the outer ends, and its rear shell depth is approximately 0.325 model units including the front face.
