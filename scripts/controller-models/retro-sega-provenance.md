# Genesis, Saturn, and arcade controller models

These are original procedural geometry authored for GameLord, distributed under the repository MIT license. They are visual recreations, not official manufacturer assets. No downloaded meshes or reference photographs are embedded.

| Asset | Visual target | Reference and reuse basis |
| --- | --- | --- |
| `models/retro/genesis.glb` | Sega Genesis six-button wired controller | [Evan-Amos photograph](https://commons.wikimedia.org/wiki/File:Sega-Genesis-6But-Cont.jpg), released into the public domain worldwide by its author |
| `models/retro/saturn.glb` | Black Sega Saturn Model 2 wired controller | [Evan-Amos photograph](https://commons.wikimedia.org/wiki/File:Sega-Saturn-Controller-NA-Mk-II-FL.jpg), released into the public domain worldwide by its author |
| `models/retro/arcade.glb` | Original generic six-button arcade control panel | Original arrangement and geometry, MIT. No claim to reproduce a specific cabinet or branded accessory |

The [SEGA wordmark](https://commons.wikimedia.org/wiki/File:SEGA_logo.svg) source is `logos/sega.svg`. Commons identifies it as public-domain simple text/geometric artwork, with the applicable Japan text-logo rationale. The [Saturn mark](https://commons.wikimedia.org/wiki/File:Sega_Saturn_Black_Logo.svg) source is `logos/saturn.svg`, the vertical source version uploaded May 18, 2022 at 14:58:27. Commons credits JustDanPatrick and marks the simple artwork public domain. Trademark rights remain with their owners. These marks identify the hardware being depicted and do not imply endorsement.

`flatten-saturn-logo.py` resolves SVG definitions, clipping masks, white knockouts, and transforms into `logos/saturn-flat.svg`. It rearranges the original word outlines into the controller's single-line wordmark below the planet. It requires Shapely only at authoring time. Neither fonts substituted for the marks nor raster logo textures are used.

## Reproduction

Run Blender 5.2 in background mode for each family:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/controller-models/retro-sega.py -- --family genesis --output /tmp/gamelord-retro-sega --render
```

Use `saturn` or `arcade` for the other models. Output includes GLB plus front, settings-size, and angled proof PNGs when `--render` is supplied. Source and local proof are retained outside the shipped assets. Only the GLBs belong in `packages/ui/components/GamepadArtwork/models/retro/`.

## Runtime articulation

Front faces positive Z, top is positive Y, and the root is `controller_root`. No glTF Y-up conversion is applied. Separate pivot nodes expose `gamepadButtonIndex` using Libretro IDs. D-pad direction child pivots expose `dpadDirection`, and their shared rocker exposes `controlRole: dpad`.

Genesis: A=1, B=0, C=8, X=10, Y=9, Z=11, Start=3, Mode=2. This follows [Genesis Plus GX joypad mapping](https://docs.libretro.com/library/genesis_plus_gx/#joypad).

Saturn: A=0, B=8, C=11, X=1, Y=9, Z=10, L=12, R=13, Start=3. This follows [Beetle Saturn joypad mapping](https://docs.libretro.com/library/beetle_saturn/#joypad). Saturn has no physical Select control.

Arcade: upper row 1/9/10, lower row 0/8/11, Coin=2, Start=3. Joystick pivots use directional IDs 4/5/6/7. This is a generic panel, so individual arcade core bindings can differ.

## Reference comparison and remaining limits

The original Sega [Mighty Morphin Power Rangers manual](https://www.retrogames.cz/manualy/Genesis/Mighty_Morphin_Power_Rangers_-_Genesis_-_Manual.pdf), printed page 4, depicts the Genesis six-button Arcade Pad. The original [Sega Saturn US manual](https://segaretro.org/images/d/d5/SegaSaturnUSManual.pdf), page 12, depicts the Model 2 control layout. These manufacturer diagrams guided overall width/height and control placement. They are not factory engineering drawings.

The reference pass corrected shell height, Genesis START placement, Saturn planet-to-wordmark proportion, d-pad direction marks, and Saturn START proportions. Saturn source planet outlines are scaled relative to the source word outlines to match the photographed controller print. Manual pixel comparisons and before/after renders are retained in the external review artifact `retro/sega/comparison.html` under the task evidence directory.

These models are not exact scanned replicas. Remaining differences include generic cap/START engraving letterforms, simplified recessed tooling, approximate local shell contours and shoulder shapes, missing small Saturn media symbols, missing underside labeling and screws, a shortened cable, and simplified polymer surface texture. Do not characterize the models as dimensionally exact or officially endorsed.

The independent visual audit identified a square-cross appearance in the first d-pads. Its root cause was a flat, separate cross extrusion over a circular backing mesh. The revised `dpad_molded_eight_way_disc` is one continuous circular surface with rounded cardinal ridges, concave diagonal sectors and a geometric center depression. It replaces both the separate cross and the flat center marking. Four triangle marks remain attached to directional pivot children. Both models retain the same rocker metadata and control IDs.
