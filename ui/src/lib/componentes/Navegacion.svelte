<script lang="ts">
  import { app, type Vista } from '../estado.svelte';
  import Icono, { type NombreIcono } from './Icono.svelte';
  import Radio from './Radio.svelte';
  import SelectorFondo from './SelectorFondo.svelte';
  import { cerrarSesion, esDuena } from '../sesion.svelte';

  const ITEMS: { id: Vista; nombre: string; icono: NombreIcono; badge?: number }[] = [
    { id: 'inicio', nombre: 'Inicio', icono: 'inicio' },
    { id: 'buscar', nombre: 'Buscar', icono: 'buscar' },
    { id: 'libros', nombre: 'Libros', icono: 'libro' },
    { id: 'vender', nombre: 'Vender', icono: 'carrito' },
    { id: 'encargos', nombre: 'Encargos', icono: 'encargos' },
    { id: 'reportes', nombre: 'Reportes', icono: 'reportes' },
    { id: 'asistente', nombre: 'Asistente', icono: 'asistente' },
    { id: 'tienda', nombre: 'Mi tienda', icono: 'estante' },
    { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' },
  ];

  // Con poca altura la radio se reduce a su botón para que el menú y el perfil quepan.
  let alto = $state(window.innerHeight);
</script>

<svelte:window bind:innerHeight={alto} />

<div class="lateral">
  <Radio compacta={alto < 800} />

  <nav class="vidrio menu">
    <div class="items">
      <div class="marca">
        <span class="logo">📚</span>
        <div>
          <strong>SIGLO XXI</strong>
          <span>Librería</span>
        </div>
      </div>
      {#each ITEMS as item}
        <button class="item" class:activo={app.vista === item.id} onclick={() => (app.vista = item.id)} aria-current={app.vista === item.id ? 'page' : undefined}>
          <Icono nombre={item.icono} tam={20} />
          <span>{item.nombre}</span>
          {#if item.badge}<span class="badge">{item.badge}</span>{/if}
        </button>
      {/each}
    </div>

    <div class="pie">
      <div class="avatar">{app.usuario[0] ?? '🌸'}</div>
      <div class="quien">
        <strong>{app.usuario}</strong>
        <span>{esDuena() ? 'Dueña' : 'Vendedor/a'}</span>
      </div>
      <SelectorFondo />
      <button class="salir" onclick={cerrarSesion} title="Cerrar sesión" aria-label="Cerrar sesión"><Icono nombre="salir" tam={18} /></button>
    </div>
  </nav>
</div>

<style>
  .lateral {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .menu {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 12px 12px;
    min-height: 0;
  }
  /* solo esto se desplaza si no cabe: el perfil de abajo siempre queda a la vista */
  .items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .marca {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 14px;
  }
  .logo {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--primary-soft);
    display: grid;
    place-items: center;
    font-size: 19px;
  }
  .marca div {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  .marca strong {
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .marca span {
    font-size: 12px;
    color: var(--muted);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 16px;
    font-weight: 700;
    color: var(--muted);
    transition:
      background 0.2s,
      color 0.2s,
      transform 0.15s;
  }
  .item:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .item.activo {
    background: var(--primary);
    color: var(--on-primary);
    box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 35%, transparent);
  }
  .item:active {
    transform: scale(0.97);
  }
  .badge {
    margin-left: auto;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--primary-soft);
    color: var(--primary-strong);
    font-size: 12px;
    display: grid;
    place-items: center;
  }
  .item.activo .badge {
    background: rgba(255, 255, 255, 0.3);
    color: var(--on-primary);
  }
  .salir {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--muted);
    flex: none;
    transition: background 0.2s, color 0.2s;
  }
  .salir:hover {
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .pie {
    flex: none;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 6px 0;
    border-top: 1px solid var(--linea);
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .quien {
    display: flex;
    flex-direction: column;
    flex: 1;
    line-height: 1.15;
  }
  .quien span {
    font-size: 12px;
    color: var(--muted);
  }
</style>
