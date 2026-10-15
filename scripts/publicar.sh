#!/usr/bin/env bash
# Publica una versión: toma el instalador que compiló GitHub Actions (etiqueta v<version>) y crea el Release en el
# repositorio público de versiones, con el instalador firmado y latest.json (de ahí se actualizan las apps).
# Uso: scripts/publicar.sh 1.0.1 ["notas de la versión"]
set -euo pipefail
VERSION="${1:?Uso: scripts/publicar.sh <version> [notas]}"
NOTAS="${2:-Versión $VERSION}"
PRIVADO="lizarbe513/libreria-siglo-xxi"
PUBLICO="lizarbe513/libreria-siglo-xxi-versiones"
cd "$(dirname "$0")/.."

RUN=$(gh run list -R "$PRIVADO" --workflow windows.yml --branch "v$VERSION" --status success --limit 1 --json databaseId -q '.[0].databaseId')
[ -n "$RUN" ] || { echo "No hay un build exitoso para v$VERSION. ¿Hiciste 'git tag v$VERSION && git push --tags' y terminó?" >&2; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
gh run download "$RUN" -R "$PRIVADO" -D "$TMP"
EXE=$(ls "$TMP"/*/*-setup.exe | head -1); SIG="$EXE.sig"
NOMBRE=$(basename "$EXE")
URL="https://github.com/$PUBLICO/releases/download/v$VERSION/$NOMBRE"
( cd "$TMP" && node "$OLDPWD/scripts/latest-json.mjs" "$VERSION" "$EXE" "$SIG" "$URL" "$NOTAS" )

gh release create "v$VERSION" "$EXE" "$SIG" "$TMP/latest.json" -R "$PUBLICO" --title "Librería SIGLO XXI $VERSION" --notes "$NOTAS"
echo "Publicada: https://github.com/$PUBLICO/releases/tag/v$VERSION"
echo "Descarga: $URL"
