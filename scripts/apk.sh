#!/usr/bin/env bash
# Compila la app del celular (release), la alinea y la firma. Deja Libreria-SIGLO-XXI.apk en Descargas.
# La llave de firma vive FUERA del repositorio: ~/.android/siglo-xxi-release.jks (+ .pass con su contraseña).
# Las actualizaciones deben firmarse con la misma llave para instalarse encima de la versión anterior.
set -euo pipefail
cd "$(dirname "$0")/../app"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/27.2.12479018}"
BT="$ANDROID_HOME/build-tools/35.0.0"
LLAVE="$HOME/.android/siglo-xxi-release.jks"
CLAVE="$HOME/.android/siglo-xxi-release.pass"
[ -f "$LLAVE" ] && [ -f "$CLAVE" ] || { echo "Falta la llave de firma en ~/.android/" >&2; exit 1; }

cargo tauri android build --apk --target aarch64 --target armv7

SALIDA="$HOME/Descargas"; [ -d "$SALIDA" ] || SALIDA="$HOME/Downloads"; mkdir -p "$SALIDA"
SIN_FIRMA=$(ls -t src-tauri/gen/android/app/build/outputs/apk/universal/release/*-unsigned.apk | head -1)
ALINEADO=$(mktemp --suffix=.apk)
trap 'rm -f "$ALINEADO"' EXIT
"$BT/zipalign" -f -p 4 "$SIN_FIRMA" "$ALINEADO"
SIGLO_PASS="$(cat "$CLAVE")" "$BT/apksigner" sign --ks "$LLAVE" --ks-key-alias siglo-xxi \
  --ks-pass env:SIGLO_PASS --key-pass env:SIGLO_PASS --out "$SALIDA/Libreria-SIGLO-XXI.apk" "$ALINEADO" 2>&1 | grep -v '^WARNING' || true
"$BT/apksigner" verify "$SALIDA/Libreria-SIGLO-XXI.apk" 2>&1 | grep -v '^WARNING' || true
echo "Listo: $SALIDA/Libreria-SIGLO-XXI.apk ($(du -h "$SALIDA/Libreria-SIGLO-XXI.apk" | cut -f1))"
