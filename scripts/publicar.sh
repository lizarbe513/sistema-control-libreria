#!/usr/bin/env bash
# (Respaldo manual: GitHub Actions ya publica solo al etiquetar, si está el secreto VERSIONES_TOKEN.)
# Publica una versión: toma el instalador y el APK que compiló GitHub Actions (etiqueta v<version>) y crea el Release en el
# repositorio público de versiones, con el instalador firmado y latest.json (de ahí se actualizan las apps).
# Uso: scripts/publicar.sh 1.0.1 ["notas de la versión"]
set -euo pipefail
VERSION="${1:?Uso: scripts/publicar.sh <version> [notas]}"
NOTAS="${2:-Versión $VERSION}"
PRIVADO="lizarbe513/libreria-siglo-xxi"
PUBLICO="lizarbe513/libreria-siglo-xxi-versiones"
cd "$(dirname "$0")/.."

RUN=$(gh run list -R "$PRIVADO" --workflow version.yml --branch "v$VERSION" --status success --limit 1 --json databaseId -q '.[0].databaseId')
[ -n "$RUN" ] || { echo "No hay un build exitoso para v$VERSION. ¿Hiciste 'git tag v$VERSION && git push --tags' y terminó?" >&2; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
gh run download "$RUN" -R "$PRIVADO" -D "$TMP"
EXE=$(ls "$TMP"/instalador-*/*-setup.exe | head -1); SIG="$EXE.sig"
APK=$(ls "$TMP"/apk-*/*.apk | head -1)
BASE="https://github.com/$PUBLICO/releases/download/v$VERSION"
( cd "$TMP" && node "$OLDPWD/scripts/latest-json.mjs" "$VERSION" "$EXE" "$SIG" "$BASE/$(basename "$EXE")" "$NOTAS" \
  && node "$OLDPWD/scripts/latest-android-json.mjs" "$VERSION" "$APK" "$BASE/$(basename "$APK")" "$NOTAS" )

gh release create "v$VERSION" "$EXE" "$SIG" "$APK" "$TMP/latest.json" "$TMP/latest-android.json" -R "$PUBLICO" --title "Librería SIGLO XXI $VERSION" --notes "$NOTAS"
echo "Publicada: https://github.com/$PUBLICO/releases/tag/v$VERSION"
echo "Instalador: $BASE/$(basename "$EXE")"
