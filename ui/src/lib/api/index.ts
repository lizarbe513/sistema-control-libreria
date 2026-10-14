// Elige el backend: el real dentro de la app Tauri, el de demostración en el navegador.
import type { Api } from './contrato';
import { ApiDemo } from './demo';
import { ApiTauri } from './tauri';

export type { Api } from './contrato';
export * from './tipos';

const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const api: Api = enTauri ? new ApiTauri() : new ApiDemo();
