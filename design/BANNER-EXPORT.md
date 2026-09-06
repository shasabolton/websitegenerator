# Contraption Cart banner — print export guide

**File:** `contraption-cart-banner-2000x400.svg`  
**Trim size:** 2000 mm × 400 mm  
**Bleed:** 12 mm on all sides  
**Safe margin:** 25 mm (1") inside trim  

## Before upload to Banner Buzz

1. Open `contraption-cart-banner-2000x400.svg` in **Inkscape** (free) or **Adobe Illustrator**.
2. Delete the **`guides`** layer/group (blue trim line, green safe zone).
3. **Convert text to outlines** (Inkscape: Path → Object to Path; Illustrator: Type → Create Outlines).
4. Set document color mode to **CMYK**.
5. Export a single **PDF** with bleed included, or export **TIFF/JPG at 150 DPI** minimum:
   - 150 DPI → 11,811 × 2,362 px (trim)
   - 300 DPI → 23,622 × 4,725 px (trim)

## Regenerate

```bash
python design/generate-banner.py
```

## Layout

```
CONTRAPTION CART          [cart logo]
Moving sculpture, puzzles & magic
        COME PLAY
```

Parchment-style background with double border frame, corner gears, decorative dividers, and vector cart logo on the right.

**Logo source:** `design/cart logo.svg` (inlined as vector paths).
