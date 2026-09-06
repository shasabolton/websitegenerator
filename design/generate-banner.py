"""Generate Contraption Cart shop banner SVG for Banner Buzz print upload."""
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "design/cart logo.svg"
OUT_PATH = ROOT / "design/contraption-cart-banner-2000x400.svg"

TRIM_W, TRIM_H = 2000, 400
BLEED = 12
SAFE = 25
CANVAS_W = TRIM_W + 2 * BLEED
CANVAS_H = TRIM_H + 2 * BLEED

BG = "#D4BC4A"
BG_DEEP = "#C4A83A"
TEXT = "#1F1608"
SUBTEXT = "#3D3018"
ACCENT = "#B83232"
ORNAMENT = "#5C4A20"
FRAME = "#1F1608"


def gear(cx: float, cy: float, r: float, teeth: int = 8, opacity: float = 0.22) -> str:
    parts = []
    for i in range(teeth):
        a0 = (i / teeth) * 2 * math.pi
        a1 = ((i + 0.35) / teeth) * 2 * math.pi
        a2 = ((i + 0.5) / teeth) * 2 * math.pi
        a3 = ((i + 0.85) / teeth) * 2 * math.pi
        r_outer = r
        r_inner = r * 0.72
        pts = [
            (cx + r_inner * math.cos(a0), cy + r_inner * math.sin(a0)),
            (cx + r_outer * math.cos(a1), cy + r_outer * math.sin(a1)),
            (cx + r_outer * math.cos(a2), cy + r_outer * math.sin(a2)),
            (cx + r_inner * math.cos(a3), cy + r_inner * math.sin(a3)),
        ]
        parts.append(
            "M %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z"
            % (*pts[0], *pts[1], *pts[2], *pts[3])
        )
    path = " ".join(parts)
    hole_r = r * 0.28
    inner_r = r * 0.55
    return f"""<g opacity="{opacity}" fill="none" stroke="{ORNAMENT}" stroke-width="2.2" stroke-linejoin="round">
    <path d="{path}"/>
    <circle cx="{cx:.2f}" cy="{cy:.2f}" r="{inner_r:.2f}"/>
    <circle cx="{cx:.2f}" cy="{cy:.2f}" r="{hole_r:.2f}" fill="{BG}" stroke="{ORNAMENT}" stroke-width="2.2"/>
  </g>"""


def squiggle(x: float, y: float, length: float, amplitude: float = 4, waves: float = 3) -> str:
    steps = 24
    pts = []
    for i in range(steps + 1):
        t = i / steps
        px = x + t * length
        py = y + amplitude * math.sin(t * waves * 2 * math.pi)
        pts.append(f"{px:.2f},{py:.2f}")
    return f'<path d="M {" L ".join(pts)}" fill="none" stroke="{ACCENT}" stroke-width="3" stroke-linecap="round"/>'


def divider(cx: float, cy: float, half_width: float = 90) -> str:
    return f"""<g stroke="{ORNAMENT}" stroke-width="1.8" fill="{ORNAMENT}">
    <line x1="{cx - half_width:.1f}" y1="{cy:.1f}" x2="{cx - 18:.1f}" y2="{cy:.1f}"/>
    <polygon points="{cx:.1f},{cy - 4:.1f} {cx + 10:.1f},{cy:.1f} {cx:.1f},{cy + 4:.1f} {cx - 10:.1f},{cy:.1f}"/>
    <line x1="{cx + 18:.1f}" y1="{cy:.1f}" x2="{cx + half_width:.1f}" y2="{cy:.1f}"/>
  </g>"""


def load_cart_logo() -> str:
    raw = LOGO_PATH.read_text(encoding="utf-8")
    match = re.search(r'<g id="cart">(.*?)</g>\s*</g>\s*</svg>', raw, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find cart group in {LOGO_PATH}")
    inner = match.group(1)
    inner = inner.replace('class="s0"', f'fill="{TEXT}"')
    inner = re.sub(r'\s+class="s0"', f' fill="{TEXT}"', inner)
    return inner


def defs_block() -> str:
    return f"""<defs>
    <radialGradient id="bgGlow" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="#E2CF6A"/>
      <stop offset="55%" stop-color="{BG}"/>
      <stop offset="100%" stop-color="{BG_DEEP}"/>
    </radialGradient>
    <filter id="paperTexture" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" seed="8" result="noise"/>
      <feColorMatrix in="noise" type="matrix"
        values="0 0 0 0 0.72  0 0 0 0 0.62  0 0 0 0 0.28  0 0 0 0.10 0" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="multiply"/>
    </filter>
    <filter id="vignette" x="-10%" y="-20%" width="120%" height="140%">
      <feGaussianBlur stdDeviation="18" result="blur"/>
      <feComponentTransfer in="blur">
        <feFuncA type="linear" slope="0.55"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="blur" mode="multiply"/>
    </filter>
    <filter id="titleShadow" x="-5%" y="-20%" width="110%" height="160%">
      <feDropShadow dx="1.8" dy="2.2" stdDeviation="1.6" flood-color="{TEXT}" flood-opacity="0.28"/>
    </filter>
    <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="3" dy="4" stdDeviation="4" flood-color="{TEXT}" flood-opacity="0.22"/>
    </filter>
  </defs>"""


def frame_block(ox: float, oy: float) -> str:
    inset = 10
    outer = f"""<rect x="{ox + inset:.1f}" y="{oy + inset:.1f}"
      width="{TRIM_W - 2 * inset:.1f}" height="{TRIM_H - 2 * inset:.1f}"
      fill="none" stroke="{FRAME}" stroke-width="2.4"/>"""
    inner = f"""<rect x="{ox + inset + 5:.1f}" y="{oy + inset + 5:.1f}"
      width="{TRIM_W - 2 * inset - 10:.1f}" height="{TRIM_H - 2 * inset - 10:.1f}"
      fill="none" stroke="{FRAME}" stroke-width="1.1"/>"""
    return outer + "\n    " + inner


def main() -> None:
    cart_paths = load_cart_logo()

    ox, oy = BLEED, BLEED
    text_cx = ox + TRIM_W * 0.36
    title_y = oy + 128
    sub_y = oy + 230
    cta_y = oy + 318

    logo_height = 300
    logo_scale = logo_height / 1000
    logo_width = 1000 * logo_scale
    logo_x = ox + TRIM_W - SAFE - logo_width + 8
    logo_y = oy + (TRIM_H - logo_height) / 2

    ornaments = [
        gear(ox + 58, oy + 58, 34),
        gear(ox + 108, oy + 58, 22, opacity=0.18),
        gear(ox + 58, oy + 108, 22, opacity=0.18),
        gear(ox + TRIM_W - 58, oy + 58, 30),
        gear(ox + TRIM_W - 108, oy + 58, 20, opacity=0.18),
        gear(ox + 58, oy + TRIM_H - 58, 28),
        gear(ox + 108, oy + TRIM_H - 58, 20, opacity=0.18),
        gear(ox + TRIM_W - 58, oy + TRIM_H - 58, 32),
    ]

    squiggle_len = 52
    squiggle_y = cta_y - 10
    squiggle_gap = 118
    squiggles = [
        squiggle(text_cx - squiggle_gap - squiggle_len, squiggle_y, squiggle_len),
        squiggle(text_cx + squiggle_gap, squiggle_y, squiggle_len),
    ]

    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="{CANVAS_W}mm" height="{CANVAS_H}mm"
     viewBox="0 0 {CANVAS_W:.1f} {CANVAS_H:.1f}">

  <title>Contraption Cart Shop Banner</title>
  <desc>2000x400mm trim with 12mm bleed. Delete the guides group before print export.</desc>

  {defs_block()}

  <g id="background">
    <rect x="0" y="0" width="{CANVAS_W:.1f}" height="{CANVAS_H:.1f}" fill="url(#bgGlow)" filter="url(#paperTexture)"/>
    <rect x="{ox:.1f}" y="{oy:.1f}" width="{TRIM_W:.1f}" height="{TRIM_H:.1f}" fill="url(#bgGlow)" filter="url(#vignette)" opacity="0.35"/>
  </g>

  <g id="ornaments" aria-hidden="true">
    {chr(10).join("    " + o for o in ornaments)}
  </g>

  <g id="frame">
    {frame_block(ox, oy)}
  </g>

  <g id="content">
    <g id="text-block">
      <text x="{text_cx:.1f}" y="{title_y:.1f}" text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="82" font-weight="700"
            letter-spacing="5" fill="{TEXT}" filter="url(#titleShadow)">CONTRAPTION CART</text>

      {divider(text_cx, sub_y - 8, half_width=155)}

      <text x="{text_cx:.1f}" y="{sub_y:.1f}" text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="400"
            letter-spacing="2" fill="{SUBTEXT}">Moving sculpture, puzzles &amp; magic</text>

      <text x="{text_cx:.1f}" y="{cta_y:.1f}" text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="48" font-weight="700"
            letter-spacing="4" fill="{ACCENT}">COME PLAY</text>
    </g>

    <g id="cta-squiggles" aria-hidden="true">
      {chr(10).join("      " + s for s in squiggles)}
    </g>

    <g id="logo" transform="translate({logo_x:.2f},{logo_y:.2f}) scale({logo_scale:.4f})" filter="url(#logoShadow)">
      {cart_paths}
    </g>
  </g>

  <g id="guides" opacity="0.55">
    <rect x="{BLEED:.1f}" y="{BLEED:.1f}" width="{TRIM_W:.1f}" height="{TRIM_H:.1f}"
          fill="none" stroke="#0066FF" stroke-width="0.6" stroke-dasharray="8 6"/>
    <rect x="{BLEED + SAFE:.1f}" y="{BLEED + SAFE:.1f}" width="{TRIM_W - 2 * SAFE:.1f}" height="{TRIM_H - 2 * SAFE:.1f}"
          fill="none" stroke="#00AA44" stroke-width="0.6" stroke-dasharray="6 5"/>
    <text x="{BLEED + 8:.1f}" y="{BLEED + 14:.1f}" font-family="Arial, sans-serif" font-size="9" fill="#0066FF">Trim (2000 x 400 mm)</text>
    <text x="{BLEED + SAFE + 4:.1f}" y="{BLEED + SAFE + 12:.1f}" font-family="Arial, sans-serif" font-size="8" fill="#00AA44">Safe zone (25 mm)</text>
  </g>
</svg>
"""

    OUT_PATH.write_text(svg, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
