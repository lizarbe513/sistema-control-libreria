<script lang="ts">
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, avisar, type Vista } from '../estado.svelte';
  import Ajustes from '../vistas/Ajustes.svelte';
  import Buscar from '../vistas/Buscar.svelte';
  import Inicio from '../vistas/Inicio.svelte';
  import Pendiente from '../vistas/Pendiente.svelte';
  import Icono, { type NombreIcono } from './Icono.svelte';
  import PanelLibro from './PanelLibro.svelte';
  import Radio from './Radio.svelte';

  const TABS: { id: Vista; nombre: string; icono: NombreIcono }[] = [
    { id: 'inicio', nombre: 'Inicio', icono: 'inicio' },
    { id: 'buscar', nombre: 'Buscar', icono: 'buscar' },
    { id: 'vender', nombre: 'Venta', icono: 'mas' },
    { id: 'encargos', nombre: 'Encargos', icono: 'encargos' },
    { id: 'ajustes', nombre: 'Perfil', icono: 'usuario' },
  ];
</script>

<div class="movil shell" data-vacio>
  <header class="cabecera" data-vacio>
    <div class="avatar">{app.usuario[0] ?? '🌸'}</div>
    <div class="hola">
      <span>Librería SIGLO XXI</span>
      <strong>Hola, {app.usuario} 🌸</strong>
    </div>
    <Radio compacta />
    <button class="escaner" onclick={() => avisar('📷 En la app, aquí se escanea el ISBN con la cámara')} aria-label="Escanear libro">
      <Icono nombre="camara" tam={22} />
    </button>
  </header>

  <main class="contenido" data-vacio>
    {#if app.vista === 'inicio'}
      <Inicio movil />
    {:else if app.vista === 'buscar'}
      <Buscar movil />
    {:else if app.vista === 'ajustes'}
      <Ajustes />
    {:else}
      <Pendiente vista={app.vista} />
    {/if}
  </main>

  <nav class="barra-inferior">
    {#each TABS as tab}
      {#if tab.id === 'vender'}
        <button class="central" onclick={() => (app.vista = 'vender')} aria-label="Nueva venta">
          <Icono nombre="mas" tam={28} grosor={2.6} />
        </button>
      {:else}
        <button class="tab" class:activo={app.vista === tab.id} onclick={() => (app.vista = tab.id)}>
          <Icono nombre={tab.icono} tam={22} />
          <span>{tab.nombre}</span>
        </button>
      {/if}
    {/each}
  </nav>

  {#if app.fichaMovil && app.seleccionado}
    <div class="ficha" transition:fly={{ y: 600, duration: 450, easing: cubicOut, opacity: 1 }}>
      <button class="cerrar" onclick={() => (app.fichaMovil = false)} aria-label="Cerrar ficha"><Icono nombre="izquierda" tam={22} /></button>
      <PanelLibro libro={app.seleccionado} />
    </div>
  {/if}
</div>

<style>
  .movil {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 8px;
  }
  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-soft), var(--lilac));
    color: var(--primary-strong);
    font-weight: 800;
    display: grid;
    place-items: center;
    flex: none;
  }
  .hola {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
  }
  .hola span {
    font-size: 11px;
    color: var(--muted);
    font-weight: 700;
  }
  .escaner {
    width: 46px;
    height: 46px;
    border-radius: 16px;
    background: var(--primary);
    color: var(--on-primary);
    display: grid;
    place-items: center;
    box-shadow: 0 8px 16px color-mix(in srgb, var(--primary) 40%, transparent);
  }
  .contenido {
    flex: 1;
    overflow-y: auto;
    padding: 4px 16px 110px;
  }
  .barra-inferior {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    border-radius: 28px;
    background: var(--surface);
    box-shadow: 0 -4px 30px rgba(242, 122, 155, 0.18);
    z-index: 5;
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    padding: 6px 10px;
    border-radius: 16px;
    transition: color 0.2s, background 0.2s;
  }
  .tab.activo {
    color: var(--primary);
    background: var(--surface-2);
  }
  .central {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    display: grid;
    place-items: center;
    margin-top: -26px;
    box-shadow:
      0 10px 22px color-mix(in srgb, var(--primary) 45%, transparent),
      0 0 0 6px var(--surface);
    transition: transform 0.15s;
  }
  .central:active {
    transform: scale(0.92);
  }
  .ficha {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    padding: 64px 16px 30px;
    background: var(--surface-glass);
    backdrop-filter: blur(22px);
    -webkit-backdrop-filter: blur(22px);
  }
  .cerrar {
    position: absolute;
    top: 14px;
    left: 16px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary-strong);
    display: grid;
    place-items: center;
  }
</style>
