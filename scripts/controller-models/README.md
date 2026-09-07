# Articulated retro hardware

The thirteen GLBs in `packages/ui/components/GamepadArtwork/models/retro` are reference-informed Blender recreations for the supported game systems. The models depict NES, SNES, Genesis, Game Boy, Game Boy Color, Game Boy Advance, Nintendo 64, original PlayStation DualShock, PSP-1000, original Nintendo DS, Saturn, GameCube, and a generic six-button arcade panel.

Controller geometry is original MIT-licensed work. Some manufacturer marks use public-domain vector artwork. See the accompanying provenance documents for sources, hardware revisions, and known approximations. Trademark rights remain with their owners. Reference photographs are not embedded in the application assets.

## Generate

Blender is an authoring dependency only. Application builds consume the checked-in GLBs.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/controller-models/retro-nintendo.py -- --family snes --output packages/ui/components/GamepadArtwork/models/retro --proof /tmp/gamelord-model-proof
```

| Generator | Families | Proof option |
| --- | --- | --- |
| `retro-nintendo.py` | `nes`, `snes`, `gb`, `gbc`, `gba` | `--proof /absolute/artifact/directory` |
| `retro-nintendo-advanced.py` | `n64`, `gamecube`, `nds` | `--render` |
| `retro-sega.py` | `genesis`, `saturn`, `arcade` | `--render` |
| `retro-sony.py` | `psx`, `psp` | `--render` |

For generators with `--render`, direct `--output` outside the repository when producing review images and Blender files, then copy only the GLB into the application. Do not commit proof images or Blender backups. Logo preprocessing helpers are authoring tools and may require additional Python packages documented in their source.

## Coordinate and articulation contract

The export preserves front +Z, top +Y, and right +X. The runtime fits the selected model to its viewport. Moving pivots carry semantic glTF extras rather than relying on hardware-specific node names:

- `gamepadButtonIndex` or `buttonIndex`: the emulated system target, using Libretro IDs. These are not physical browser gamepad indices.
- `axisIndices`: stick axes. `axisMode: translate` describes the PSP sliding nub.
- `controlRole: dpad` and `dpadDirection`: shared directional rocker and its targets.
- `pressDepth` and `hingeAxis`: optional motion parameters.

N64 C targets use virtual IDs 16–19 and become right-stick input. GameCube half-trigger targets 14–15 share visible trigger geometry with full targets 12–13. `retroSystems.ts` defines each system's controls and converts saved physical mappings into the displayed state.

Legends attached to moving controls move with their caps. The runtime preserves authored rest rotations, applies motion relative to them, and distinguishes remap highlighting from physical depression. Rendering is on demand, including settling frames after input changes.

## Validate

```sh
python3 scripts/controller-models/validate.py
```

The validator checks GLB structure, semantic control coverage, finite transforms, embedded resources, and per-asset limits of 2 MB and 80,000 triangles. It requires neither Blender nor Three.js. Browser stories verify articulation, remapping, system selection, and context recovery. Visual accuracy also requires inspecting the rendered asset beside references for the documented hardware revision.
