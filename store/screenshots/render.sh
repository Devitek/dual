#!/usr/bin/env bash
# Rendu des captures Play : HTML (store/screenshots/src) -> PNG, aux 3 tailles
# Play Store — phone 1080x2160, 7" 1200x1920, 10" 1600x2560 — via Chrome headless.
#
# Usage :
#   store/screenshots/render.sh                 # rend TOUS les .html, 3 tailles
#   store/screenshots/render.sh free_en photo_en   # rend des écrans précis
#   CHROME=chromium store/screenshots/render.sh    # binaire Chrome alternatif
#
# Sorties : store/screenshots/<nom>.<phone|seven|ten>.png (gitignorés → aperçu).
# Ensuite, copier les PNG validés dans
#   fastlane/metadata/android/<locale>/images/{phone,sevenInch,tenInch}Screenshots/
# (numérotés 1.png, 2.png… dans l'ordre d'affichage voulu), puis pousser via le
# workflow « Store Metadata ».
set -euo pipefail

SRC="store/screenshots/src"
OUT="store/screenshots"
CHROME="${CHROME:-google-chrome}"

# tailles Play (largeur,hauteur)
render_one() {
  local html="$1" size="$2" out="$3"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --window-size="$size" --screenshot="$out" "file://$PWD/$SRC/$html" >/dev/null 2>&1
}

mkdir -p "$OUT"

if [ "$#" -gt 0 ]; then
  screens=("$@")
else
  screens=()
  while IFS= read -r f; do screens+=("$(basename "$f" .html)"); done \
    < <(find "$SRC" -maxdepth 1 -name '*.html' | sort)
fi

for s in "${screens[@]}"; do
  render_one "$s.html" "1080,2160" "$OUT/$s.phone.png"
  render_one "$s.html" "1200,1920" "$OUT/$s.seven.png"
  render_one "$s.html" "1600,2560" "$OUT/$s.ten.png"
  echo "rendered $s (phone/seven/ten)"
done
