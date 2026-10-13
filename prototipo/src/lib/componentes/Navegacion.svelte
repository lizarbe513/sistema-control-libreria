<script lang="ts">
  import { app, type Vista } from '../estado.svelte';
  import Icono, { type NombreIcono } from './Icono.svelte';
  import Radio from './Radio.svelte';
  import SelectorFondo from './SelectorFondo.svelte';

  const ITEMS: { id: Vista; nombre: string; icono: NombreIcono; badge?: number }[] = [
    { id: 'inicio', nombre: 'Inicio', icono: 'inicio' },
    { id: 'buscar', nombre: 'Buscar', icono: 'buscar' },
    { id: 'vender', nombre: 'Vender', icono: 'carrito' },
    { id: 'encargos', nombre: 'Encargos', icono: 'encargos', badge: 3 },
    { id: 'reportes', nombre: 'Reportes', icono: 'reportes' },
    { id: 'asistente', nombre: 'Asistente', icono: 'asistente' },
    { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' },
  ];
</script>

<div class="lateral">
  <Radio />

  <nav class="vidrio menu">
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

    <div class="pie">
      <div class="avatar">{app.usuario[0] ?? '🌸'}</div>
      <div class="quien">
        <strong>{app.usuario}</strong>
        <span>Dueña</span>
      </div>
      <SelectorFondo />
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
  .pie {
    margin-top: auto;
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
