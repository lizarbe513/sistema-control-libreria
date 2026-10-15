<script lang="ts">
  // Celular: lo que no cabe en la barra inferior (Libros, Reportes, Clientes, Ajustes).
  import Icono, { type NombreIcono } from '../componentes/Icono.svelte';
  import { app, type Vista } from '../estado.svelte';
  import { encargosUI } from '../encargos.svelte';
  import { esDuena } from '../sesion.svelte';

  const tarjetas = $derived<{ vista: Vista; nombre: string; detalle: string; icono: NombreIcono; antes?: () => void }[]>([
    { vista: 'asistente', nombre: 'Asistente', detalle: 'Pregúntale por libros, stock y ventas', icono: 'asistente' },
    { vista: 'libros', nombre: 'Libros', detalle: 'Todo el inventario, stock y edición', icono: 'libro' },
    { vista: 'encargos', nombre: 'Clientes', detalle: 'Fichas, compras y encargos', icono: 'usuario', antes: () => (encargosUI.pestana = 'clientes') },
    ...(esDuena() ? [{ vista: 'reportes' as Vista, nombre: 'Reportes', detalle: 'Ventas, caja y lo más vendido', icono: 'reportes' as NombreIcono }] : []),
    { vista: 'ajustes', nombre: 'Ajustes y perfil', detalle: 'Tu PIN, fondo, sonido, cerrar sesión', icono: 'ajustes' },
  ]);
</script>

<div class="mas" data-vacio>
  <h1>Más</h1>
  <div class="rejilla">
    {#each tarjetas as t (t.nombre)}
      <button
        class="tarjeta opcion"
        onclick={() => {
          t.antes?.();
          app.vista = t.vista;
        }}
      >
        <span class="ico"><Icono nombre={t.icono} tam={26} /></span>
        <strong>{t.nombre}</strong>
        <small>{t.detalle}</small>
      </button>
    {/each}
  </div>
</div>

<style>
  .mas {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 4px 24px;
  }
  h1 {
    margin: 0;
    font-size: 28px;
  }
  .rejilla {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .opcion {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 16px 14px;
    text-align: left;
    min-height: 120px;
  }
  .ico {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    color: var(--primary-strong);
    margin-bottom: 4px;
  }
  small {
    color: var(--muted);
    font-weight: 600;
    font-size: 12.5px;
  }
</style>
