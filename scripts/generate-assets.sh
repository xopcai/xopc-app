#!/usr/bin/env bash
# Generate Expo PNG assets from ../xopc/web/public/logo.svg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO_SRC="${ROOT}/../xopc/web/public/logo.svg"
ASSETS="${ROOT}/assets"
TMP="${ROOT}/scripts/.asset-gen-tmp"
if [[ ! -f "$LOGO_SRC" ]]; then
  echo "Missing logo: $LOGO_SRC" >&2
  exit 1
fi

mkdir -p "$TMP" "$ASSETS"

# Inner logo paths (strip outer <svg> wrapper).
LOGO_INNER="$(sed -n '/<title>xopc<\/title>/,/<\/svg>/p' "$LOGO_SRC" | sed '1d;$d')"

wrap_svg() {
  local size="$1"
  local pad="$2"
  local inner_size="$3"
  local bg="$4"
  local out="$5"

  cat >"$out" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
$(if [[ -n "$bg" ]]; then echo "  <rect width=\"${size}\" height=\"${size}\" fill=\"${bg}\"/>"; fi)
  <svg x="${pad}" y="${pad}" width="${inner_size}" height="${inner_size}" viewBox="14.5 14.5 71 71" fill="none">
${LOGO_INNER}
  </svg>
</svg>
EOF
}

RESVG=(pnpm dlx @resvg/resvg-js-cli)

render() {
  local svg="$1"
  local png="$2"
  "${RESVG[@]}" "$svg" "$png"
}

# canvas, logo fraction, background (empty = transparent)
gen() {
  local name="$1"
  local canvas="$2"
  local frac="$3"
  local bg="$4"
  local inner_size=$((canvas * frac / 100))
  local pad=$(((canvas - inner_size) / 2))
  local svg="${TMP}/${name}.svg"
  local png="${ASSETS}/${name}.png"

  wrap_svg "$canvas" "$pad" "$inner_size" "$bg" "$svg"
  render "$svg" "$png"
  echo "  ${name}.png (${canvas}x${canvas})"
}

echo "Generating assets from $LOGO_SRC"
gen icon 1024 72 "#ffffff"
gen adaptive-icon 1024 62 ""
gen splash-icon 1024 42 ""
gen favicon 48 82 "#ffffff"
echo "Done → $ASSETS"
