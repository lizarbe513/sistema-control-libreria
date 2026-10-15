<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { alAtras, anotarVista, escucharAtras } from '../atras.svelte';
  import { app, type Vista } from '../estado.svelte';
  import Ajustes from '../vistas/Ajustes.svelte';
  import Buscar from '../vistas/Buscar.svelte';
  import Inicio from '../vistas/Inicio.svelte';
  import Libros from '../vistas/Libros.svelte';
  import Mas from '../vistas/Mas.svelte';
  import Pendiente from '../vistas/Pendiente.svelte';
  import Escanear from '../vistas/Escanear.svelte';
  import Vender from '../vistas/Vender.svelte';
  import Encargos from '../vistas/Encargos.svelte';
  import Reportes from '../vistas/Reportes.svelte';
  import Icono, { type NombreIcono } from './Icono.svelte';
  import PanelLibro from './PanelLibro.svelte';
  import Radio from './Radio.svelte';

  const TABS: { id: Vista; nombre: string; icono: NombreIcono }[] = [
    { id: 'inicio', nombre: 'Inicio', icono: 'inicio' },
    { id: 'buscar', nombre: 'Buscar', icono: 'buscar' },
    { id: 'vender', nombre: 'Venta', icono: 'mas' },
    { id: 'encargos', nombre: 'Encargos', icono: 'encargos' },
    { id: 'mas', nombre: 'Más', icono: 'menu' },
  ];
  const ORDEN = TABS.map((t) => t.id);

  onMount(() => void escucharAtras());

  // dirección de la animación al cambiar de panel (deslizando o con la barra)
  let direccion = $state(0);
  let previa: Vista = app.vista;
  $effect(() => {
    const v = app.vista;
    const [a, b] = [ORDEN.indexOf(previa), ORDEN.indexOf(v)];
    direccion = a >= 0 && b >= 0 ? Math.sign(b - a) : 0;
    previa = v;
    anotarVista(v);
  });

  // la ficha abierta se cierra con «atrás»
  $effect(() => {
    if (app.fichaMovil) return alAtras(() => (app.fichaMovil = false));
  });

  // ── deslizar entre paneles ──
  let inicio: { x: number; y: number; t: number } | null = null;
  function tocar(e: TouchEvent) {
    const objetivo = e.target as HTMLElement;
    if (e.touches.length !== 1 || app.fichaMovil || objetivo.closest('input, textarea, select, canvas, [data-sin-deslizar], .cajon, [role="dialog"]')) {
      inicio = null;
      return;
    }
    inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }
  function soltar(e: TouchEvent) {
    if (!inicio) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - inicio.x;
    const dy = t.clientY - inicio.y;
    const rapido = Date.now() - inicio.t < 600;
    inicio = null;
    const i = ORDEN.indexOf(app.vista);
    if (i < 0 || !rapido || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const siguiente = ORDEN[i + (dx < 0 ? 1 : -1)];
    if (siguiente) app.vista = siguiente;
  }
</script>

<div class="movil shell" data-vacio>
  <header class="cabecera" data-vacio>
    <div class="avatar">{app.usuario[0] ?? '🌸'}</div>
    <div class="hola">
      <span>Librería SIGLO XXI</span>
      <strong>Hola, {app.usuario} 🌸</strong>
    </div>
    <Radio compacta />
    <button class="escaner" onclick={() => (app.vista = 'escanear')} aria-label="Escanear libro">
      <Icono nombre="camara" tam={22} />
    </button>
  </header>

  <main class="contenido" data-vacio ontouchstart={tocar} ontouchend={soltar}>
    {#key app.vista}
      <div class="panel" in:fly={{ x: direccion * 50, duration: direccion ? 260 : 0, easing: cubicOut, opacity: 0.2 }} data-vacio>
        {#if app.vista === 'inicio'}
          <Inicio movil />
        {:else if app.vista === 'buscar'}
          <Buscar movil />
        {:else if app.vista === 'vender'}
          <Vender movil />
        {:else if app.vista === 'encargos'}
          <Encargos movil />
        {:else if app.vista === 'reportes'}
          <Reportes movil />
        {:else if app.vista === 'libros'}
          <Libros />
        {:else if app.vista === 'mas'}
          <Mas />
        {:else if app.vista === 'ajustes'}
          <Ajustes />
        {:else if app.vista === 'escanear'}
          <Escanear />
        {:else}
          <Pendiente vista={app.vista} />
        {/if}
      </div>
    {/key}
  </main>

  <nav class="barra-inferior">
    {#each TABS as tab}
      {#if tab.id === 'vender'}
        <button class="central" onclick={() => (app.vista = 'vender')} aria-label="Nueva venta">
          <Icono nombre="mas" tam={28} grosor={2.6} />
        </button>
      {:else}
        <button class="tab" class:activo={app.vista === tab.id || (tab.id === 'mas' && ['libros', 'reportes', 'ajustes'].includes(app.vista))} onclick={() => (app.vista = tab.id)}>
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
