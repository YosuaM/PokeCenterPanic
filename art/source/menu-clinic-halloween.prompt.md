# Halloween menu background

Source: `menu-clinic-halloween.png`. Runtime: `../../apps/client/public/assets/original/menu-clinic-halloween.webp`.

The existing `menu-clinic-night.webp` is the style reference. Pokébonk is a mood and animation reference only; none of its assets or code are included. Pokémon identity remains the property of its respective rights holders.

## Prompt

Use case: stylized-concept
Asset type: 16:9 game main-menu background, high quality detailed pixel-art illustration.
Input image: style reference only: existing original cozy clinic exterior.
Primary request: create a new Halloween night exterior of a recognizable Pokémon Center, keeping the lush detailed pixel-art style and welcoming illuminated red-roofed clinic from the reference. A magical spooky yet cozy scene, violet moonlit sky, full moon, crooked autumn trees, carved glowing pumpkins, small purple luminous mushrooms and a cobbled path, subtle low ground mist. Rich dark indigo, lavender and warm amber lights. No characters baked into the image.
Composition is critical for UI: a logo covers the middle-left and a form covers middle-right, so position the clinic in the UPPER CENTER (building center x=52%, roof begins y=18%, front entrance ends y=62%). Building relatively tall, clearly visible roof and glowing circular Poké Ball sign above its entrance. Moon at x=70%, y=18%. Path leads from bottom center to clinic. Leftmost and rightmost thirds have dark forest framing. Distant layered forest silhouettes. Dense lovely pixel details at the edges. Keep central building unobscured by trees. Wide landscape 1920x1080 composition. No writing, no labels, no UI, no watermark. Fresh original scene, do not copy any other website artwork.

## Export

```sh
cwebp -q 90 art/source/menu-clinic-halloween.png -o apps/client/public/assets/original/menu-clinic-halloween.webp
```
