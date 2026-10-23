# Rear pine grove

Created with the built-in image tool. Style reference: `../menu-clinic-night.png`; placement reference: the existing `preview.png` before adding this grove. Raw output: `02b-rear-trees-source.png`.

## Prompt

Use case: stylized-concept. Generate a transparent game background layer of a pine grove BEHIND a house. Reference image 1 is the original twilight illustration: match the pine trees directly behind its clinic roof, their jagged hand-painted pixel-art clusters, irregular branches, dark navy/petrol blue-green needles and purple night shadows. Reference image 2 is the current scene into which this layer will be inserted; it shows the exact placement of the clinic and open valley. Output ONLY the rear grove, no house, sky, mountains, lake, ground, smoke, clouds, foreground trees or other objects. Canvas 1672x941, real transparent alpha. Composition registered to image 2: a cluster of 9-12 slender pines across x90..830, tallest tips around y65..120 on the left and center, other tips y140..250, tapering rightward to two shorter pines around x860 y330 and x940 y425. Tree trunks and lower branches extend down to y630 behind the house, obscured when the clinic overlay is composited. Leave x1000..1672 COMPLETELY transparent and most of y0..55 transparent. Keep tops asymmetrical and natural, no geometrically perfect triangles. Small visible sky gaps between branches; tree interiors fully opaque. This is a modest middle-distance grove immediately behind the roof, not large foreground framing trees. Preserve an open view of the valley on the right. Match the precise illustrated pixel texture and restrained dark palette of the reference. No black rectangle or checkerboard baked into the art. No labels. Produce the full registered layer.

## Registration

The output was registered at 1254 × 706, top-left aligned on the shared 1672 × 941 canvas, preserving transparency. This positions the tallest pines above the left roof and tapers into the valley. Final source: `02b-rear-trees.png`; runtime: `apps/client/public/assets/original/menu-clinic-layered-v2/02b-rear-trees.webp` (quality 90, alpha quality 100).

Draw after flying Pokémon and before the clinic, at (0, 0). Runtime preparation makes near-opaque interiors solid while retaining branch gaps and soft edges, using the same occluder preparation as the clinic and foreground trees. The grove is static. Lugia passes behind it; walkers remain in front of it and the clinic, but behind foreground trees.
