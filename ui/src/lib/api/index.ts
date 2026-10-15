// Elige el backend: el real dentro de la app Tauri, el de demostración en el navegador.
import type { Api } from './contrato';
import { ApiDemo } from './demo';
import { ApiLan } from './lan';
import { ApiTauri } from './tauri';

export type { Api } from './contrato';
export * from './tipos';

const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// La app del celular (Android) habla con el PC. En un navegador de pruebas se activa con «?celular» en la dirección.
const modoCelular = (() => {
  if (typeof window === 'undefined') return false;
  if (enTauri) return /Android/i.test(navigator.userAgent);
  try {
    if (new URLSearchParams(location.search).has('celular')) localStorage.setItem('modo-celular', '1');
    return localStorage.getItem('modo-celular') === '1';
  } catch {
    return false;
  }
})();

export const api: Api = modoCelular ? new ApiLan() : enTauri ? new ApiTauri() : new ApiDemo();
