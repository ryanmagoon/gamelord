# Nintendo N64, GameCube and original DS artwork

`retro-nintendo-advanced.py` generates the NUS-005 grey Nintendo 64 controller, DOL-003 indigo GameCube controller and NTR-001 silver Nintendo DS assets under `packages/ui/components/GamepadArtwork/models/retro/`.

## Original geometry and reuse

The meshes, control legends, materials and generator were authored for this repository and are covered by its MIT license. No downloaded hardware meshes, photographic textures or manual illustrations are embedded in the assets.

The N64 identification outline uses the existing `logos/nintendo.svg`. Its source is [Nintendo_logo.svg on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Nintendo_logo.svg), with [this original SVG file](https://upload.wikimedia.org/wikipedia/commons/5/51/Nintendo_logo.svg). The source page identifies Nintendo as author, Nintendo.com as source and PD-textlogo as the copyright status of the simple geometric/text logo. Trademark status remains with Nintendo. The generator imports all six paths and four transformed polygons, including inherited transforms. Reading only the first path would incorrectly render a single letter.

## Official hardware references

- [Nintendo Mario Tennis manual](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/nintendo_8/Manual_Nintendo64_MarioTennis_EN.pdf), PDF page 3: NUS-005 front control diagram, three grips, central analog stick, shoulder controls and rear Z location.
- [Original GameCube system manual](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/gcn101_manual_english?_a=DATC1RAAZAA0), PDF page 6: original DOL-003 controller photograph and component diagram. This reference corrected the upper shell arch, lower control lobes, control positions and face-button sizes.
- [GameCube controller instruction sheet](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/gcncontrol?_a=DATAg1AAZAA0): close photographs of the ribbed control-stick cap, octagonal gates and smooth C-stick dome.
- [Original Nintendo DS Operations Manual](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/ds_english?_a=DATC1RAAZAA0), PDF page 4, Components spread: NTR-001 control locations, speakers, hinge, microphone, cartridge/AC/audio connectors, stylus storage and battery cover. This is the original DS, not DS Lite.

### NTR-001 microphone audit

The original DS manual's callout **5** points to the MIC opening near the **front/lower-left of the touch screen, below the D-pad**. Callout **3** points to the power button near the upper-left/hinge area. The model places its `Microphone` opening at that front location. Moving it to the hinge based on a different DS revision would contradict the cited original manual.

### Analog-stick geometry audit

The analog controls are raised three-dimensional assemblies, not printed circles. N64 has one `leftStick`. GameCube has `leftStick` and `rightStick`. Each contains a separate 0.12-unit shaft. The ribbed N64/GameCube main-stick cap extends from local Z 0.1115 to 0.1485 relative to its articulation pivot, with raised concentric grip rings above it. The GameCube C-stick has a smooth ellipsoidal dome spanning local Z 0.066 to 0.144. The fixed octagonal gate and recessed cup are separate meshes below these controls.

A front orthographic view hides shaft length behind its cap. Angled review renders expose the shaft, raised cap and gate gap. These views were inspected against the official stick close-ups. Dimensions above describe the authored geometry, not claimed factory measurements.

## Shape and detail checks

- N64: three distinct grips, domed face and rolled perimeter, one octagonal-gated analog stick, blue A, green B, yellow C cluster, red Start, shoulder L/R, rear Z and Pak slot, rear screw recesses.
- GameCube: convex upper arch, separate lower control lobes, small red B and larger green A, individual kidney-shaped X/Y keys, purple shoulder Z, analog L/R, two gated analog assemblies, rear screw recesses.
- Original DS: chunky silver two-part hinged shell, two exact 4:3 LCD planes, upper speaker perforations, inset lower controls, Select/Start above ABXY, original front microphone, rear battery/DS-slot/AC/stylus details and front audio/mic/volume details.

These are reference-informed recreations. Manufacturer diagrams are not calibrated orthographic scans. Exact shell curvature, screw coordinates, connector internal pins, molded grain and non-N64 manufacturer typography remain approximate. Full cords and plugs are outside this compact controller artwork.

## Articulation and validation

The coordinate convention is +Z front, +Y top, +X right. The root is `controller_root`. Moving cap legends are children of their control pivot. `gamepadButtonIndex` and `buttonIndex` extras contain logical core IDs. Stick pivots expose `axisIndices`. The D-pad exposes `controlRole: dpad`, with directional child IDs 4–7.

N64 uses A0, B1, Start3, L10, R11, Z12, and virtual C IDs 16–19. The application translates virtual C inputs to the core's right-stick directions. GameCube uses B0, Y1, Start3, A8, X9, Z11, L12 and R13. DS uses B0, Y1, Select2, Start3, A8, X9, L10 and R11. Core identities follow the [Mupen64Plus](https://docs.libretro.com/library/mupen64plus/) and [Dolphin](https://docs.libretro.com/library/dolphin/) documentation.

Binary validation checks exact control-ID sets, moving geometry descendants, texture independence, fewer than 40,000 triangles and less than 1,000,000 bytes per asset. Front, 440-pixel, angled and rear views were inspected. Browser behavior and remapping integration require the application validation lane.

### GameCube stacked identification mark

The DOL-003 mark follows the original GameCube system manual controller photograph (PDF page 6), linked above. The smaller spaced NINTENDO line sits over the larger GAMECUBE line. The latter spans 0.46 model units, approximately 23 percent of the shell width. Both lines are original Blender text geometry, so no additional vector artwork or license is introduced. The layout and proportions follow the reference, while exact proprietary letter outlines remain approximate.
