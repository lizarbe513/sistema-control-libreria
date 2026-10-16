<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import AppMovil from './lib/componentes/AppMovil.svelte';
  import FondoAnimado from './lib/componentes/FondoAnimado.svelte';
  import Libreta from './lib/componentes/Libreta.svelte';
  import Navegacion from './lib/componentes/Navegacion.svelte';
  import PanelLibro from './lib/componentes/PanelLibro.svelte';
  import { app, avisar, fondoEfectivo } from './lib/estado.svelte';
  import { motor } from './lib/fondo/motor';
  import { fuentesListas, limpiarCache } from './lib/portada';
  import Ajustes from './lib/vistas/Ajustes.svelte';
  import Buscar from './lib/vistas/Buscar.svelte';
  import EditorTienda from './lib/vistas/EditorTienda.svelte';
  import Libros from './lib/vistas/Libros.svelte';
  import Inicio from './lib/vistas/Inicio.svelte';
  import CartaLlego from './lib/componentes/CartaLlego.svelte';
  import { encargosUI } from './lib/encargos.svelte';
  import Encargos from './lib/vistas/Encargos.svelte';
  import Reportes from './lib/vistas/Reportes.svelte';
  import Pendiente from './lib/vistas/Pendiente.svelte';
  import Asistente from './lib/vistas/Asistente.svelte';
  import AvisoActualizacion from './lib/componentes/AvisoActualizacion.svelte';
  import Vender from './lib/vistas/Vender.svelte';
  import Bienvenida from './lib/acceso/Bienvenida.svelte';
  import Desbloquear from './lib/acceso/Desbloquear.svelte';
  import Entrar from './lib/acceso/Entrar.svelte';
  import SinConexion from './lib/acceso/SinConexion.svelte';
  import Vincular from './lib/acceso/Vincular.svelte';
  import { arrancar, sesion } from './lib/sesion.svelte';

  let ancho = $state(window.innerWidth);
  let listo = $state(false);
  const movil = $derived(ancho < 760);

  onMount(() => {
    Promise.all([fuentesListas, arrancar()]).then(() => {
      limpiarCache();
      listo = true;
    });
    const reloj = setInterval(() => (app.hora = new Date().getHours()), 60_000);

    // Errores que no pasan por el render (promesas, eventos): se avisan en vez de pasar en silencio.
    const alError = (e: ErrorEvent) => avisar(`Error: ${e.message}`);
    const alRechazo = (e: PromiseRejectionEvent) => avisar(`Error: ${e.reason?.message ?? e.reason}`);
    // shortcut: tras un aviso de Windows (UAC) el visor puede quedar sin repintar; se fuerza un cuadro al volver, confirmar en Windows.
    const repintar = () => {
      const raiz = document.getElementById('app');
      if (!raiz) return;
      raiz.style.opacity = '0.999';
      requestAnimationFrame(() => (raiz.style.opacity = ''));
    };
    window.addEventListener('error', alError);
    window.addEventListener('unhandledrejection', alRechazo);
    window.addEventListener('focus', repintar);
    document.addEventListener('visibilitychange', repintar);
    return () => {
      clearInterval(reloj);
      window.removeEventListener('error', alError);
      window.removeEventListener('unhandledrejection', alRechazo);
      window.removeEventListener('focus', repintar);
      document.removeEventListener('visibilitychange', repintar);
    };
  });

  const detalle = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // Tema nocturno con el cielo estrellado; el fondo quieto usa una imagen CSS.
  $effect(() => {
    const f = fondoEfectivo();
    document.documentElement.dataset.tema = f === 'cielo' || f === 'quietonoche' ? 'noche' : 'dia';
    document.documentElement.dataset.fondo = f;
    document.documentElement.toggleAttribute('data-rendimiento', app.calma.rendimiento);
  });

  // El fondo solo recibe clics en zonas vacías: el lienzo o contenedores marcados con data-vacio.
  const esVacio = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === 'CANVAS' ? t.classList.contains('fondo') : t.dataset.vacio !== undefined);

  function presionar(e: PointerEvent) {
    if (esVacio(e.target)) motor()?.punteroPresionado(e.clientX, e.clientY);
  }
  function mover(e: PointerEvent) {
    motor()?.punteroMovido(e.clientX, e.clientY);
  }
  function soltar(e: PointerEvent) {
    motor()?.punteroSoltado(e.clientX, e.clientY);
  }
</script>

<svelte:window bind:innerWidth={ancho} onpointerdown={presionar} onpointermove={mover} onpointerup={soltar} />

<FondoAnimado />

<svelte:boundary onerror={(e) => console.error(e)}>
{#if !listo || sesion.cargando}
  <div class="cargando">📚</div>
{:else if sesion.error}
  <div class="cargando error-arranque">
    <p>😿 No se pudo iniciar la librería:<br /><strong>{sesion.error}</strong></p>
  </div>
{:else if sesion.estado?.fase === 'configurar'}
  <Bienvenida />
{:else if sesion.estado?.fase === 'desbloquear'}
  <Desbloquear />
{:else if sesion.estado?.fase === 'vincular'}
  <Vincular />
{:else if sesion.estado?.fase === 'sinConexion'}
  <SinConexion />
{:else if sesion.estado?.fase === 'entrar' || !sesion.usuaria}
  <Entrar />
{:else if movil}
  <AppMovil />
{:else}
  <div class="shell escritorio" class:con-panel={app.vista === 'buscar'} class:enfoque={app.enfoque && app.vista === 'tienda'} data-vacio>
    <Navegacion />
    <main class="centro" data-vacio>
      {#key app.vista}
        <div class="vista" in:fly={{ y: 14, duration: 350 }} data-vacio>
          <svelte:boundary onerror={(e) => console.error(e)}>
          {#if app.vista === 'inicio'}
            <Inicio />
          {:else if app.vista === 'buscar'}
            <Buscar />
          {:else if app.vista === 'libros'}
            <Libros />
          {:else if app.vista === 'vender'}
            <Vender />
          {:else if app.vista === 'encargos'}
            <Encargos />
          {:else if app.vista === 'reportes'}
            <Reportes />
          {:else if app.vista === 'asistente'}
            <Asistente />
          {:else if app.vista === 'ajustes'}
            <Ajustes />
          {:else if app.vista === 'tienda'}
            <EditorTienda />
          {:else}
            <Pendiente vista={app.vista} />
          {/if}
          {#snippet failed(error, reset)}
            <div class="fallo vidrio">
              <p>😿 Algo falló en esta pantalla.</p>
              <small>{detalle(error)}</small>
              <button class="btn btn-primario" onclick={reset}>Reintentar</button>
            </div>
          {/snippet}
          </svelte:boundary>
        </div>
      {/key}
    </main>
    {#if app.vista === 'buscar'}
      <aside class="panel vidrio" in:fly={{ x: 40, duration: 400 }}>
        <PanelLibro libro={app.seleccionado} />
      </aside>
    {/if}
  </div>
  {#if !(app.enfoque && app.vista === 'tienda')}<Libreta />{/if}
{/if}
{#snippet failed(error, reset)}
  <div class="cargando error-arranque">
    <p>😿 Algo falló en la interfaz:<br /><strong>{detalle(error)}</strong></p>
    <button class="btn btn-primario" onclick={reset}>Reintentar</button>
  </div>
{/snippet}
</svelte:boundary>

{#if encargosUI.carta && sesion.usuaria}
  {#key encargosUI.carta}<CartaLlego carta={encargosUI.carta} />{/key}
{/if}

{#if sesion.usuaria}<AvisoActualizacion />{/if}

{#if app.toast}
  <div class="toast" transition:fly={{ y: 30, duration: 300 }} role="status">{app.toast}</div>
{/if}

<style>
  .escritorio {
    position: relative;
    z-index: 1;
    height: 100%;
    display: grid;
    grid-template-columns: 268px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr); /* sin esto la fila crece con el menú y el perfil se sale de la pantalla */
    gap: 18px;
    padding: 18px 18px 18px 30px;
  }
  /* modo enfoque: solo la bibliotecaria y su biblioteca */
  .escritorio.enfoque {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    gap: 0;
  }
  .escritorio.enfoque > :global(.lateral) {
    display: none;
  }
  .escritorio.enfoque .centro {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .escritorio.con-panel {
    grid-template-columns: 268px minmax(0, 1fr) minmax(340px, 400px);
  }
  .centro {
    min-height: 0;
    overflow-y: auto;
    padding: 4px 6px;
    margin: -4px -6px;
  }
  .vista {
    min-height: 100%;
  }
  .panel {
    min-height: 0;
    overflow-y: auto;
    padding: 18px;
  }
  .cargando {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 48px;
    animation: latir 1s ease-in-out infinite;
    z-index: 2;
  }
  @keyframes latir {
    50% {
      transform: scale(1.12);
    }
  }
  .error-arranque {
    font-size: 16px;
    text-align: center;
    animation: none;
    padding: 24px;
  }
  .fallo {
    margin: 40px auto;
    max-width: 460px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .fallo small {
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    translate: -50% 0;
    z-index: 60;
    padding: 12px 22px;
    border-radius: 999px;
    background: var(--text);
    color: var(--bg);
    font-weight: 700;
    box-shadow: var(--sombra);
    max-width: calc(100vw - 32px);
  }
  /* en el celular, por encima de la barra inferior */
  @media (max-width: 759px) {
    .toast {
      bottom: 100px;
      text-align: center;
    }
  }
</style>
