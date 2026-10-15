// Las tres formas de guardar libros desde el celular: escanear el ISBN, leer el título con la cámara o escribirlo.
import { app } from './estado.svelte';

export type ModoRegistro = 'isbn' | 'titulo' | 'mano';

export const registro = $state({ modo: 'isbn' as ModoRegistro });

export function registrar(modo: ModoRegistro) {
  registro.modo = modo;
  app.vista = 'escanear';
}
