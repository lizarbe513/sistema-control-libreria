<script lang="ts">
  // «¡Llegó!»: cuando entra stock de un libro que algún cliente encargó, aparece una carta con sello de cera.
  // También pregunta, al dar de alta un libro nuevo, si es el que encargaron con un título parecido.
  import { fade, scale } from 'svelte/transition';
  import { api, type Encargo } from '../api';
  import { soles } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { encargosCambio, encargosUI, ESTADOS, type Carta } from '../encargos.svelte';

  let { carta }: { carta: Carta } = $props();

  // el sobre se abre (sello, solapa) y luego se despliega la carta
  let abierta = $state(false);
  $effect(() => {
    const t = setTimeout(() => (abierta = true), app.calma.animaciones ? 1400 : 0);
    return () => clearTimeout(t);
  });

  // copia propia: cada fila se actualiza al marcarla (App la vuelve a crear si llega otra carta)
  // svelte-ignore state_referenced_locally
  let filas = $state<Encargo[]>($state.snapshot(carta.encargos) as Encargo[]);
  let ocupado = $state<number | null>(null);

  function cerrar() {
    encargosUI.carta = null;
  }

  async function paso(i: number, accion: () => Promise<Encargo>) {
    ocupado = filas[i].id;
    try {
      filas[i] = await accion();
      encargosCambio();
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      ocupado = null;
    }
  }

  const marcarLlego = (i: number) => paso(i, () => api.estadoEncargo(filas[i].id, 'llego'));
  const enlazar = (i: number) =>
    paso(i, async () => {
      const e = await api.enlazarLibroEncargo(filas[i].id, carta.libro.id);
      return e.stock && e.stock > 0 && (e.estado === 'pendiente' || e.estado === 'pedido') ? api.estadoEncargo(e.id, 'llego') : e;
    });
  const avisarle = (i: number) =>
    paso(i, async () => {
      if (filas[i].estado === 'pendiente' || filas[i].estado === 'pedido') await api.estadoEncargo(filas[i].id, 'llego');
      return (await api.avisarWhatsapp(filas[i].id)).encargo;
    });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && cerrar()} />

<div class="fondo" role="presentation" onclick={(e) => e.target === e.currentTarget && cerrar()} transition:fade={{ duration: 160 }}>
  <div class="escena" class:abierta class:quieta={!app.calma.animaciones}>
    <div class="sobre" aria-hidden="true">
      <div class="espalda"></div>
      <div class="hoja-asoma"></div>
      <div class="bolsillo"></div>
      <div class="solapa"></div>
      <div class="sello"><span>❀</span></div>
    </div>

    {#if abierta}
      <div class="carta" role="dialog" aria-label="Llegó un encargo" in:scale={{ start: 0.6, duration: 380 }}>
        {#if carta.tipo === 'llego'}
          <h2>¡Llegó «{carta.libro.titulo}»! 📬</h2>
          <p class="sub">{filas.length === 1 ? 'Un cliente lo estaba esperando:' : `${filas.length} clientes lo estaban esperando:`}</p>
        {:else}
          <h2>¿Es el libro que encargaron? 💌</h2>
          <p class="sub">«{carta.libro.titulo}» se parece a {filas.length === 1 ? 'este encargo' : 'estos encargos'}:</p>
        {/if}

        <ul>
          {#each filas as e, i (e.id)}
            <li>
              <div class="quien">
                <strong>{e.cliente}</strong>
                <small>
                  {[carta.tipo === 'coincidencia' ? `pidió «${e.titulo}»` : '', e.telefono || 'sin teléfono', e.adelantoCent ? `adelanto ${soles(e.adelantoCent)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <span class="estado" style:background={ESTADOS[e.estado].color}>{ESTADOS[e.estado].emoji} {ESTADOS[e.estado].nombre}</span>
              <div class="acciones">
                {#if carta.tipo === 'coincidencia' && e.libroId !== carta.libro.id}
                  <button class="btn btn-suave chico" disabled={ocupado === e.id} onclick={() => enlazar(i)}>Sí, es este</button>
                {:else}
                  {#if e.estado === 'pendiente' || e.estado === 'pedido'}
                    <button class="btn btn-suave chico" disabled={ocupado === e.id} onclick={() => marcarLlego(i)}>Marcar como llegó</button>
                  {/if}
                  {#if e.estado !== 'avisado' && e.telefono}
                    <button class="btn btn-primario chico" disabled={ocupado === e.id} onclick={() => avisarle(i)}>📲 Avisar por WhatsApp</button>
                  {:else if e.estado === 'avisado'}
                    <span class="hecho">Avisado ✓</span>
                  {/if}
                {/if}
              </div>
            </li>
          {/each}
        </ul>

        <footer>
          <button class="enlace" onclick={() => ((app.vista = 'encargos'), cerrar())}>Ver el tablero de encargos</button>
          <button class="btn btn-blanco" onclick={cerrar}>Listo</button>
        </footer>
      </div>
    {/if}
  </div>
</div>

<style>
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 75;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--text) 30%, transparent);
    padding: 16px;
  }
  .escena {
    position: relative;
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* ── el sobre ── */
  .sobre {
    position: relative;
    width: 300px;
    height: 190px;
    perspective: 700px;
    transition: transform 0.5s ease, opacity 0.5s ease;
  }
  .abierta .sobre {
    transform: scale(0.42) translateY(60px);
    opacity: 0.9;
    position: absolute;
    bottom: -88px;
  }
  .espalda,
  .bolsillo {
    position: absolute;
    inset: 0;
    border-radius: 10px;
  }
  .espalda {
    background: #ecd5b4;
    box-shadow: 0 18px 40px rgba(90, 40, 30, 0.3);
  }
  .bolsillo {
    background:
      linear-gradient(to top right, #f6e4c8 49.5%, transparent 50%) left / 50% 100% no-repeat,
      linear-gradient(to top left, #f3dfc0 49.5%, transparent 50%) right / 50% 100% no-repeat;
    z-index: 2;
  }
  .hoja-asoma {
    position: absolute;
    left: 18px;
    right: 18px;
    top: 14px;
    height: 150px;
    background: #fffdf8;
    border-radius: 6px;
    z-index: 1;
    animation: asoma 0.6s 0.95s ease-out both;
  }
  .solapa {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 112px;
    background: #e9cfa9;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
    transform-origin: top;
    z-index: 3;
    animation: abrir 0.55s 0.55s ease-in-out both;
  }
  .sello {
    position: absolute;
    left: 50%;
    top: 84px;
    width: 54px;
    height: 54px;
    margin-left: -27px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #e0566c, #a3192f 60%, #7c0f22);
    box-shadow:
      0 0 0 4px #b0243f,
      0 4px 8px rgba(80, 10, 20, 0.45);
    display: grid;
    place-items: center;
    color: #f7c1cb;
    font-size: 24px;
    z-index: 4;
    animation: romper 0.45s 0.35s ease-in both;
  }
  .sello span {
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
  }
  @keyframes romper {
    from {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
    40% {
      transform: scale(1.15) rotate(-8deg);
    }
    to {
      transform: scale(0.2) rotate(40deg) translateY(30px);
      opacity: 0;
    }
  }
  @keyframes abrir {
    to {
      transform: rotateX(180deg);
      z-index: 0;
    }
  }
  @keyframes asoma {
    to {
      transform: translateY(-70px);
    }
  }
  .quieta .sello,
  .quieta .solapa,
  .quieta .hoja-asoma {
    animation: none;
  }
  .quieta .sello {
    opacity: 0;
  }
  /* ── la carta ── */
  .carta {
    position: relative;
    z-index: 5;
    width: 100%;
    max-height: calc(100vh - 120px);
    overflow: auto;
    box-sizing: border-box;
    padding: 22px 24px;
    border-radius: 14px;
    background:
      repeating-linear-gradient(#fffdf8 0 27px, #f3e7dc 27px 28px),
      #fffdf8;
    color: #3d2f2a;
    box-shadow: 0 24px 60px rgba(90, 40, 50, 0.35);
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 40px;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  .sub {
    margin: 0;
    color: #7d6a62;
    font-weight: 700;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid #f0e2d6;
  }
  .quien {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .quien small {
    color: #7d6a62;
  }
  .estado {
    align-self: start;
    font-size: 12px;
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
  }
  .acciones {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .chico {
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
  .hecho {
    font-weight: 800;
    color: #2f8a5c;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
</style>
