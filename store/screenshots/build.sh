#!/usr/bin/env bash
# Génère TOUTES les captures Play dans fastlane/.../images/*Screenshots/ (JPEG),
# à partir des sources HTML (store/screenshots/src) : Chrome headless -> PNG ->
# ImageMagick -> JPEG (léger, accepté par Play). Idempotent (purge + régénère).
#
# Ordre d'affichage = ORDER ci-dessous (numérotation 1..N).
# Dépendances : google-chrome (ou CHROME=…), magick (ImageMagick).
# Usage : store/screenshots/build.sh
set -euo pipefail

SRC="store/screenshots/src"
META="fastlane/metadata/android"
CHROME="${CHROME:-google-chrome}"
MAGICK="${MAGICK:-magick}"
QUALITY="${QUALITY:-88}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Ordre des captures (noms de base des .html).
ORDER=( photo free screen1 screen3 screen2 screen4 )
# "lang:suffixe_fichier:dossier_fastlane"
LOCALES=( "fr::fr-FR" "en:_en:en-US" "es:_es:es-ES" "de:_de:de-DE" "pt:_pt:pt-BR" "it:_it:it-IT" )
# "sous-dossier_fastlane:LARGEURxHAUTEUR"
SIZES=( "phoneScreenshots:1080,2160" "sevenInchScreenshots:1200,1920" "tenInchScreenshots:1600,2560" )

shot() {
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-sandbox \
    --force-device-scale-factor=1 --window-size="$2" --screenshot="$3" \
    "file://$PWD/$SRC/$1" >/dev/null 2>&1
}

for locentry in "${LOCALES[@]}"; do
  IFS=':' read -r lang suffix dir <<< "$locentry"
  for szentry in "${SIZES[@]}"; do
    IFS=':' read -r szdir szval <<< "$szentry"
    out="$META/$dir/images/$szdir"
    mkdir -p "$out"
    rm -f "$out"/*.png "$out"/*.jpg
    n=1
    for scr in "${ORDER[@]}"; do
      png="$TMP/${scr}${suffix}.${szdir}.png"
      shot "${scr}${suffix}.html" "$szval" "$png"
      "$MAGICK" "$png" -strip -interlace Plane -quality "$QUALITY" "$out/$n.jpg"
      n=$((n + 1))
    done
    echo "$dir/$szdir: $((n - 1)) captures"
  done
done
echo "OK — captures régénérées (JPEG) dans $META/*/images/*Screenshots/"
