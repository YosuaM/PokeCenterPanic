# Menu atmosphere clean plate

Source: `menu-clinic-clean-plate.png` (1672 × 941).
Runtime: `../../apps/client/public/assets/original/menu-clinic-clean-plate.webp`.
Input: the unchanged `menu-clinic-night.png` illustration.
Mode: built-in image editing, opaque output.

The renderer uses localized patches behind original-pixel cloud and smoke layers. It preserves the original building, composition and still-image fallback. Plant areas of the clean plate are unused; separate local foliage layers sample the original image and deform only authored stem/branch masks with pinned roots and borders. Clouds drift behind foreground branches, smoke rises and fades, and lamps receive restrained warm halos. Rendering pauses outside visible menu screens and respects reduced motion.

## Edit prompt

```text
EDIT TARGET: the supplied original 1672x941 pixel-art clinic illustration. Produce a precise CLEAN PLATE for animation, with identical dimensions, framing, camera, colors, composition and artwork everywhere except the requested removals. This is not a redesign. Keep all architecture, trees, mountains, sky gradients, stars, path, walls, fences and lamps in their exact original places. Remove ONLY (1) all pink/lavender clouds from the sky, filling with the same continuous blue twilight sky gradient, preserving stars; (2) the short pale smoke plume immediately above the brick chimney near x225 y218, reconstructing the pine trees behind it, keep the chimney itself unchanged; (3) the small daisy/grass clump in the foreground near x240 y840 (rough bounds x174..324 y790..885), replacing it with plausible darker ground greenery behind it; (4) the pink flowering bush near x760 y740 (bounds x682..851 y682..791), replacing just that bush with the underlying dark green foliage; (5) the planter flowering bush near x326 y593 (bounds x251..394 y565..613), replace only flowers/leaves with the shadowed planter/foliage behind; (6) the flowering bush near x660 y592 (bounds x598..734 y561..630), replace only flowers/leaves with the dark foliage/stone behind. Preserve the flowers elsewhere and the same pixel cluster scale and detailing. No added objects, no moving anything, no relighting, no blur, no new style, no text. This output will be used ONLY as small hidden patches behind independently animated copies of the original clouds and plant clumps. Original artwork fidelity is paramount.
```

## Export

```sh
cwebp -quiet -q 93 art/source/menu-clinic-clean-plate.png -o apps/client/public/assets/original/menu-clinic-clean-plate.webp
```
