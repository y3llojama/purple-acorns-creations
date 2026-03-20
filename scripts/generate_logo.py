#!/usr/bin/env python3
"""
Generate ./logo/logo.jpg and ./logo/logo.svg from a source PNG.
Produces a circular-cropped logo at 2x+ the original size.

Usage: python3 scripts/generate_logo.py <source.png>
"""

import sys
import os
import base64
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("image3.png")
OUT_DIR = Path("logo")
OUT_DIR.mkdir(exist_ok=True)

# Load source and compute target size (at least 2x, round up to 2048)
src = Image.open(SRC).convert("RGBA")
w, h = src.size
side = max(w, h)
target = max(side * 2, 2048)

# Resize with high-quality Lanczos resampling
scaled = src.resize((target, target), Image.LANCZOS)

# --- Circular mask ---
mask = Image.new("L", (target, target), 0)
draw = ImageDraw.Draw(mask)
draw.ellipse((0, 0, target, target), fill=255)

# --- PNG: circle with transparent outside (RGBA) ---
# JPG does not support transparency, so we output PNG for the transparent version
# and also write a .jpg alias with white background for compatibility
rgba_out = Image.new("RGBA", (target, target), (0, 0, 0, 0))  # fully transparent
rgba_out.paste(scaled, mask=mask)
png_path = OUT_DIR / "logo.png"
rgba_out.save(png_path, "PNG", optimize=True)
print(f"Saved {png_path}  ({target}x{target}px, transparent outside circle)")

# JPG fallback with white background (JPG cannot be transparent)
jpg_bg = Image.new("RGB", (target, target), (255, 255, 255))
jpg_bg.paste(scaled.convert("RGB"), mask=mask)
jpg_path = OUT_DIR / "logo.jpg"
jpg_bg.save(jpg_path, "JPEG", quality=97, optimize=True)
print(f"Saved {jpg_path}  ({target}x{target}px, white background fallback)")

# --- SVG: embed PNG as base64, use clipPath for circle ---
# Re-encode the scaled RGBA PNG to embed in SVG
import io
png_buf = io.BytesIO()
scaled.save(png_buf, "PNG")
b64 = base64.b64encode(png_buf.getvalue()).decode("ascii")

svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="{target}"
  height="{target}"
  viewBox="0 0 {target} {target}"
>
  <defs>
    <clipPath id="circleClip">
      <circle cx="{target // 2}" cy="{target // 2}" r="{target // 2}" />
    </clipPath>
  </defs>
  <circle
    cx="{target // 2}"
    cy="{target // 2}"
    r="{target // 2}"
    fill="white"
  />
  <image
    href="data:image/png;base64,{b64}"
    x="0"
    y="0"
    width="{target}"
    height="{target}"
    clip-path="url(#circleClip)"
    preserveAspectRatio="xMidYMid meet"
  />
</svg>
"""

svg_path = OUT_DIR / "logo.svg"
svg_path.write_text(svg, encoding="utf-8")
print(f"Saved {svg_path}  ({target}x{target} viewBox)")
