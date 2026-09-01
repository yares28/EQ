---
version: "1.0"
name: EQ-design-system
description: Premium compensation decision tool. Warm paper inner surfaces, slate bento home, ink typography, one bottle-green accent. No gradients.

colors:
  hub-surround: "#d8dee6"
  canvas: "#f6f4f1"
  card: "#ffffff"
  ink: "#1a1917"
  body: "#3f3f3f"
  muted: "#6a6a6a"
  hairline: "#ddd6cc"
  accent: "#24382e"
  on-accent: "#f6f4f1"
  on-ink: "#ffffff"
  success: "#3d5c4a"
  warning: "#8a6b3d"
  destructive: "#8b3a32"

typography:
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
  display: "28px / 600"
  title: "22px / 600"
  section: "16px / 600"
  body: "16px / 400"
  caption: "13px / 400"
  metric-display: "56px / 600"

rounded:
  sm: "8px"
  md: "14px"
  lg: "20px"
  pill: "9999px"

spacing:
  nav-height: "80px"
  section: "64px"
  tile-gap: "16px"

icons:
  library: "@phosphor-icons/react"
  nav-weight: light
  inline-weight: regular
  sizes:
    inline: 16
    nav: 18
    tile: 20

elevation:
  tile-hover: "0 0 0 1px rgba(26,25,23,0.06), 0 4px 12px rgba(26,25,23,0.08)"
---

## Rules

1. Scarce accent — bottle green on one home tile and rare status only.
2. Primary CTA — ink pill, white label, fully rounded.
3. No body grid, wash gradient, shimmer, or glass on data pages.
4. Modest weights — no `font-black` on titles; display caps at 600.
5. Icons inherit `currentColor`; one corner icon per bento tile max.
