// Genera latest.json: lo que la app del PC lee para saber si hay una versión nueva y de dónde bajarla.
// Uso: node scripts/latest-json.mjs <version> <instalador.exe> <instalador.exe.sig> <url-del-instalador> [notas]
import fs from 'node:fs';
const [version, exe, sig, url, notas] = process.argv.slice(2);
if (!version || !exe || !sig || !url) {
  console.error('Uso: latest-json.mjs <version> <exe> <sig> <url> [notas]');
  process.exit(1);
}
const firma = fs.readFileSync(sig, 'utf8').trim();
const json = {
  version,
  notes: notas || `Versión ${version}`,
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature: firma, url } },
};
fs.writeFileSync('latest.json', JSON.stringify(json, null, 2) + '\n');
console.log(`latest.json listo para la versión ${version}`);
