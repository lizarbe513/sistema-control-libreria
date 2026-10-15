// Botón o gesto «atrás» del teléfono: primero cierra lo que esté abierto encima (ficha, cobro, cajones…), luego
// vuelve al panel anterior y, en Inicio, pide tocar dos veces para salir. Así «atrás» ya no cierra la app de golpe.
import { app, avisar, type Vista } from './estado.svelte';

const capas: (() => void)[] = [];

/** Registra algo que se cierra con «atrás». Devuelve la función para quitarlo (al cerrarse por su cuenta). */
export function alAtras(cerrar: () => void): () => void {
  capas.push(cerrar);
  return () => {
    const i = capas.lastIndexOf(cerrar);
    if (i >= 0) capas.splice(i, 1);
  };
}

const historial: Vista[] = [];
let actual: Vista = 'inicio';
let volviendo = false;

/** Cada cambio de panel queda anotado para poder volver. */
export function anotarVista(nueva: Vista) {
  if (volviendo) {
    volviendo = false;
  } else if (nueva !== actual) {
    historial.push(actual);
    if (historial.length > 30) historial.shift();
  }
  actual = nueva;
}

let ultimoToque = 0;

export async function atras() {
  const cerrar = capas.pop();
  if (cerrar) return cerrar();
  const previa = historial.pop();
  if (previa) {
    volviendo = true;
    app.vista = previa;
    return;
  }
  if (app.vista !== 'inicio') {
    volviendo = true;
    app.vista = 'inicio';
    return;
  }
  const ahora = Date.now();
  if (ahora - ultimoToque < 2000) {
    const { exit } = await import('@tauri-apps/api/app');
    await exit(0);
  } else {
    ultimoToque = ahora;
    avisar('Toca atrás otra vez para salir');
  }
}

let escuchando = false;

/** En la app de Android escucha el botón «atrás». En un navegador de pruebas queda en `window.__atras`. */
export async function escucharAtras() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  if ('__TAURI_INTERNALS__' in window && /Android/i.test(navigator.userAgent)) {
    const { onBackButtonPress } = await import('@tauri-apps/api/app');
    await onBackButtonPress(() => void atras());
  } else if (import.meta.env.DEV) {
    Object.assign(window, { __atras: atras });
  }
}
