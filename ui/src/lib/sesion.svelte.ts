// Sesión: qué fase muestra la app (configurar, desbloquear, entrar o la tienda) y quién atiende.
import { api, type EstadoInicial, type Usuaria } from './api';
import { aplicarPreferencias, app, avisar, olvidarPreferencias, registrarGuardadoPreferencias } from './estado.svelte';
import { borrador, prepararInventario } from './inventario.svelte';
import { carrito, prepararVentas, vaciar } from './ventas/carrito.svelte';
import { tienda } from './tienda/tienda.svelte';

export const sesion = $state({
  cargando: true,
  error: '' as string,
  estado: null as EstadoInicial | null,
  usuaria: null as Usuaria | null,
});

// Las preferencias que cambian se envían al backend, agrupadas cada medio segundo.
let pendientes: Record<string, unknown> = {};
let espera: ReturnType<typeof setTimeout> | undefined;
registrarGuardadoPreferencias((clave, valor) => {
  if (!sesion.usuaria) return;
  pendientes[clave] = valor;
  clearTimeout(espera);
  espera = setTimeout(() => {
    const lote = pendientes;
    pendientes = {};
    api.guardarPreferencias(lote).catch((e: Error) => avisar(`No se guardaron tus preferencias: ${e.message}`));
  }, 500);
});

export const esDuena = () => sesion.usuaria?.rol === 'duena';

export async function arrancar() {
  sesion.cargando = true;
  try {
    aplicarEstado(await api.estadoInicial());
  } catch (e) {
    sesion.error = (e as Error).message;
  } finally {
    sesion.cargando = false;
  }
}

/** Aplica la respuesta del backend (tras configurar, desbloquear o abrir una carpeta). */
export function aplicarEstado(e: EstadoInicial) {
  sesion.estado = e;
  if (e.usuaria) entrarCon(e.usuaria);
  else sesion.usuaria = null;
  if (!e.llavero) avisar('Este equipo no tiene llavero: pedirá la contraseña maestra cada vez que se abra');
}

export function entrarCon(u: Usuaria) {
  sesion.usuaria = u;
  app.usuario = u.nombre;
  aplicarPreferencias(u.preferencias);
  if (sesion.estado) sesion.estado = { ...sesion.estado, fase: 'sesion', usuaria: u };
  // datos que necesitan sesión: portadas, categorías y la tienda en bloques
  Promise.all([prepararInventario(), prepararVentas(), tienda.sincronizar(u.rol === 'duena')]).catch((e: Error) =>
    avisar(`No se pudieron cargar los datos: ${e.message}`),
  );
}

export async function cerrarSesion() {
  clearTimeout(espera);
  if (Object.keys(pendientes).length) {
    await api.guardarPreferencias(pendientes).catch(() => {});
    pendientes = {};
  }
  await api.cerrarSesion();
  olvidarPreferencias();
  borrador.datos = null;
  vaciar();
  carrito.tipos = [];
  sesion.usuaria = null;
  app.usuario = '';
  app.vista = 'inicio';
  app.libretaAbierta = false;
  app.enfoque = false;
  if (sesion.estado) sesion.estado = { ...sesion.estado, fase: 'entrar', usuaria: null };
}
