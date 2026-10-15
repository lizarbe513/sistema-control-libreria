// Genera latest-android.json: lo que la app del celular lee para saber si hay una versión nueva del APK.
// Uso: node scripts/latest-android-json.mjs <version> <archivo.apk> <url-del-apk> [notas]
import crypto from 'node:crypto';
import fs from 'node:fs';
const [version, apk, url, notas] = process.argv.slice(2);
if (!version || !apk || !url) {
  console.error('Uso: latest-android-json.mjs <version> <apk> <url> [notas]');
  process.exit(1);
}
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(
  'latest-android.json',
  JSON.stringify({ version, notes: notas || `Versión ${version}`, pub_date: new Date().toISOString(), apk: url, sha256 }, null, 2) + '\n',
);
console.log(`latest-android.json listo para la versión ${version}`);
