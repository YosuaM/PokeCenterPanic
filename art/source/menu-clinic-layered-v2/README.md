# Twilight clinic — layered v2

New art variant based on `../menu-clinic-night.png`, prepared for animation. This pack now supplies the live menu through WebP runtime exports. It intentionally changes the clinic scale and foreground arrangement; existing sprite routes and chimney coordinates must not be reused without adjustment.

Open `menu-clinic-layered-v2.ora` as a layered OpenRaster document, or import the six PNGs listed in `layers.json` at (0, 0). Every layer has a 1672 × 941 canvas. `preview.png` shows their normal source-over composition. `prompts.md` records the generation prompts and registration adjustments.

## Back-to-front order

| Order | File / insertion plane | Purpose |
|---|---|---|
| 1 | `01-landscape.png` | Opaque cloudless sky, mountains, distant forest, town and lake; no clinic or framing trees. |
| 2 | `02-clouds-painted.png` | Three muted, irregular painted cloud banks, independently movable. |
| 3 | Distant flying Pokémon | Draw here to pass behind the rear grove, clinic and foreground trees. |
| 4 | `02b-rear-trees.png` | Rear pine grove behind the clinic; its moving branches cover Lugia. |
| 5 | `03-clinic-ground.png` | Clinic, chimney, terrace, garden, lights, fences and path, with transparent surrounding space. |
| 6 | Near flying / walking Pokémon | Draw here to appear in front of the clinic/path and behind framing trees. |
| 7 | `04-foreground-trees.png` | Left and right tree silhouettes, transparent through the central view and branch gaps. |
| 8 | `05-smoke.png` | Independent smoke plume, aligned to the chimney near (250, 160). |

## Animation handoff

- Apply one shared cover transform to all layers and character coordinates. Do not crop each layer to its own opaque bounds.
- Clouds loop continuously toward the right, covering the full artwork width every 170, 270 and 420 seconds for the three bands. Draw two identical copies at x = offset − 1672 and x = offset, where offset wraps modulo 1672. The prepared tile has 16 completely transparent columns at each side, complete cloud silhouettes and a natural clear-sky gap between banks. No reversal or crossfade is needed.
- Smoke is a single transparent plume, not a frame sequence. Animate copies upward and left, expand around the chimney anchor, and fade them out; fade new copies in to avoid popping.
- Pokémon occlusion comes from drawing the tree layer after the sprites. No skyline/color-selection mask is needed. The image edges retain antialiased alpha; broad interiors are nearly opaque.
- The rear and foreground tree layers each use local deformation masks in `menuTreeWind.ts`. Eight disjoint patches gently flex crowns and branch tips while pinning attachment points and patch borders. Displacement stays below twelve artwork pixels; trunks and architecture stay fixed. Replacing RGBA patches before drawing keeps occlusion aligned with moving silhouettes.
- Lights and garden plants remain painted in the clinic layer. Additional light glows can be rendered above it; independently moving individual plants needs another asset pass.
- Clinic entrance is approximately (563, 615), steps reach approximately (565, 675), and the path exits near (525, 940). These are visual guide points, not verified walking routes.
- Retain a composed still for reduced motion and loading failure when integrating this pack.

## Verification

- Inspected the composed preview and all six individual layers.
- All six PNGs have the same 1672 × 941 canvas; the landscape is fully opaque and the other five contain true alpha transparency.
- Registered smoke tip against the chimney; checked that sky and scene do not remain as rectangular patches in the transparent layers.
- Verified the OpenRaster archive, stack order, embedded image bytes and merged preview. The initial asset-only verification did not cover animation. Runtime integration adds automated loading, motion, draw-order, alpha-occlusion and lifecycle checks; the game menu is visually reviewed separately.

The runtime uses this composition and updated character routes; existing source artwork is preserved and no dependencies were added. No characters or third-party sprites are embedded.

## Runtime exports

Files in `../../../apps/client/public/assets/original/menu-clinic-layered-v2/` use WebP quality 90 and alpha quality 100. The numbered source names are preserved, and `preview.webp` provides the still fallback. Re-export from the repository root:

```sh
for name in 01-landscape 02-clouds-painted 02b-rear-trees 03-clinic-ground 04-foreground-trees 05-smoke preview; do
  cwebp -quiet -q 90 -alpha_q 100 "art/source/menu-clinic-layered-v2/$name.png" -o "apps/client/public/assets/original/menu-clinic-layered-v2/$name.webp"
done
```

The live renderer draws the cloud tile at native size, with adjacent copies per band and constant translations of 1672/170, 1672/270 and 1672/420 pixels per second. It crops smoke to (145, 5, 140, 158), emits six copies over an eight-second cycle and preserves the (250, 160) anchor. Rear-tree, foreground-tree and clinic alpha values of 240 or more become 255 during preparation, preventing sprites from bleeding through nearly opaque interiors. Source PNGs and the editable document retain their original alpha. The runtime is a moving variation of the composed preview, not a frame-identical still.

The original `02-clouds.png` and brighter `02-clouds-loop.png` are retained as earlier variants; the editable document, manifest and preview now use `02-clouds-painted.png`. Native raster verification confirmed transparent gutters and exact pixel equality between the loop reset and a one-pixel circular translation. The current preparation prompt, band coordinates and export adjustments are in `cloud-style.prompt.md`; the earlier looping variant is documented in `cloud-loop.prompt.md`.

The rear grove is an independent registered overlay. Its source and placement are documented in `rear-trees.prompt.md`. Flying Pokémon render before it; ground Pokémon render after it and the clinic. The composed fallback and editable document include the grove.
