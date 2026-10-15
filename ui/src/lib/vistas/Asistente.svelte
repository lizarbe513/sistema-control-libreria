<script lang="ts">
  // Asistente de IA: pregunta por libros, el estado de la tienda, ventas (la Dueña) o pide que redacte un mensaje.
  // Responde con los datos reales de la tienda; los libros citados aparecen como fichas con su ubicación.
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import Icono from '../componentes/Icono.svelte';
  import { soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { bloques, chat, irA, nombreDestino, nuevaConversacion, preguntar, reintentar, revisarDueno, type MensajeAsistente } from '../asistente.svelte';
  import { abrirNuevoEncargo } from '../encargos.svelte';
  import type { ResultadoLinea } from '../api';
  import TarjetaAccion from '../componentes/TarjetaAccion.svelte';
  import { miniatura } from '../portada';
  import { esDuena } from '../sesion.svelte';
  import { resolver, textoCorto } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';

  let { movil = false }: { movil?: boolean } = $props();

  revisarDueno();

  const SUGERENCIAS = $derived([
    '¿Cómo va la tienda hoy?',
    ...(esDuena() ? ['¿Cómo van las ventas y la ganancia de este mes?'] : []),
    '¿Qué libros se agotaron?',
    'Algo de misterio para un chico de 15 que le gustó Harry Potter',
    '¿Qué debería reponer?',
    'Recomiéndame una novela de ciencia ficción que no tengamos',
    '¿Qué encargos hay pendientes?',
    'Escribe un mensaje para avisar a los clientes de las novedades',
  ]);

  let texto = $state('');
  let lista = $state<HTMLDivElement>();

  async function enviar(t = texto) {
    if (!t.trim() || chat.pensando) return;
    texto = '';
    const p = preguntar(t);
    await bajar();
    await p;
    await bajar();
  }

  async function bajar() {
    await tick();
    lista?.scrollTo({ top: lista.scrollHeight, behavior: 'smooth' });
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  function abrir(l: Libro) {
    app.seleccionado = l;
    if (movil) app.fichaMovil = true;
    else app.vista = 'buscar';
  }

  async function copiar(t: string) {
    // las fichas se copian como el título del libro
    const limpio = t.replace(/\[\[libro:(\d+)\]\]/g, (_, id) => {
      const l = chat.mensajes.flatMap((m) => m.libros ?? []).find((x) => x.id === Number(id));
      return l ? `«${l.titulo}»` : '';
    });
    try {
      await navigator.clipboard.writeText(limpio.replace(/\*\*/g, ''));
      avisar(limpio.includes('{cliente}') ? 'Copiado. Cambia {cliente} por el nombre al enviarlo' : 'Copiado');
    } catch {
      avisar('No se pudo copiar');
    }
  }

  const libroDe = (m: { libros?: Libro[] }, id: number) => m.libros?.find((l) => l.id === id);
  const webDe = (m: MensajeAsistente, ref: string) => m.externos?.find((x) => x.referencia === ref)?.resultado;

  /** Portadas de internet que no cargaron: se muestra un libro de relleno. */
  let rotas = $state(new Set<string>());

  function encargar(r: ResultadoLinea) {
    abrirNuevoEncargo({ titulo: r.titulo, autor: r.autor, resultado: r });
  }
</script>

<div class="chat-ia" class:movil data-vacio>
  <header>
    <div>
      <h1>Asistente</h1>
      <p class="atenuado">Lee la tienda por ti: libros, stock{esDuena() ? ', ventas y ganancias' : ''}. Pregúntale con tus palabras.</p>
    </div>
    {#if chat.mensajes.length}
      <button class="btn btn-blanco" onclick={nuevaConversacion} data-testid="nueva-conversacion">Nueva conversación</button>
    {/if}
  </header>

  <div class="mensajes" bind:this={lista} data-testid="mensajes">
    {#if !chat.mensajes.length}
      <div class="bienvenida" in:fly={{ y: 10, duration: 300 }}>
        <span class="ico"><Icono nombre="asistente" tam={30} /></span>
        <p>Hola, soy la asistente de la librería. Prueba con:</p>
        <div class="sugerencias">
          {#each SUGERENCIAS as s (s)}<button class="chip" onclick={() => enviar(s)}>{s}</button>{/each}
        </div>
        <small class="atenuado">Los datos de tus clientes nunca se envían a la IA. La conversación no se guarda.</small>
      </div>
    {/if}

    {#each chat.mensajes as m, i (i)}
      <div class="fila {m.rol}" in:fly={{ y: 8, duration: 220 }}>
        <div class="burbuja" class:error={m.error} class:nota={m.nota} data-testid={m.nota ? 'nota' : `burbuja-${m.rol}`}>
          {#each bloques(m.texto) as b, j (j)}
            <p class:vineta={b.vineta}>
              {#each b.trozos as t, k (k)}
                {#if t.tipo === 'libro'}
                  {@const l = libroDe(m, t.id)}
                  {#if l}<button class="cita" onclick={() => abrir(l)}>📖 {l.titulo}</button>{/if}
                {:else if t.tipo === 'web'}
                  {@const w = webDe(m, t.ref)}
                  {#if w}<span class="cita web">🌐 {w.titulo}</span>{/if}
                {:else if t.tipo === 'accion'}
                  <span class="cita accion">👇 ver la tarjeta</span>
                {:else if t.tipo === 'ir'}
                  <button class="cita ir" onclick={() => irA(t.ref)} data-testid="enlace-ir">{nombreDestino(t.ref)} →</button>
                {:else if t.tipo === 'negrita'}<strong>{t.texto}</strong>{:else if t.tipo === 'texto'}{t.texto}{/if}
              {/each}
            </p>
          {/each}
          {#if m.libros?.length}
            <div class="fichas">
              {#each m.libros as l (l.id)}
                {@const u = l.ubicacion ? resolver(tienda.datos, l.ubicacion) : null}
                <button class="ficha tarjeta" class:agotado={l.stock === 0} onclick={() => abrir(l)} data-testid="ficha-libro">
                  <img src={l.portada ?? miniatura(l)} alt="" />
                  <span class="datos">
                    <strong>{l.titulo}</strong>
                    <small>{l.autor}</small>
                    <span class="linea">
                      <b>{soles(l.precio)}</b>
                      {#if l.stock > 0}<span class="stock">Stock {l.stock}</span>{:else}<span class="sin">Agotado</span>{/if}
                    </span>
                    {#if u}<span class="ubic" style:background={u.info.color} style:color={u.info.fuerte}>📍 {textoCorto(u)}</span>{/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
          {#if m.externos?.length}
            <div class="fichas">
              {#each m.externos as x (x.referencia)}
                <div class="ficha tarjeta externa" data-testid="ficha-web">
                  {#if x.resultado.portadaUrl && !rotas.has(x.referencia)}
                    <img src={x.resultado.portadaUrl} alt="" loading="lazy" onerror={() => (rotas = new Set([...rotas, x.referencia]))} />
                  {:else}<span class="sin-portada">📖</span>{/if}
                  <span class="datos">
                    <strong>{x.resultado.titulo}</strong>
                    <small>{[x.resultado.autor, x.resultado.editorial, x.resultado.anio].filter(Boolean).join(' · ')}</small>
                    <span class="etiqueta-web">🌐 No está en la tienda</span>
                    <button class="btn btn-primario mini" onclick={() => encargar(x.resultado)} data-testid="encargar-web">Encargar</button>
                  </span>
                </div>
              {/each}
            </div>
          {/if}
          {#each m.acciones ?? [] as a (a.id)}
            <TarjetaAccion tarjeta={a} />
          {/each}
          {#if m.rol === 'asistente' && !m.nota}
            <div class="pie">
              {#if m.error}
                <button class="enlace" onclick={reintentar}>Reintentar</button>
              {:else}
                <button class="enlace" onclick={() => copiar(m.texto)}>Copiar</button>
                {#if m.proveedor}<small class="atenuado">· {m.proveedor}</small>{/if}
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}

    {#if chat.pensando}
      <div class="fila asistente">
        <div class="burbuja pensando" aria-label="Pensando"><span></span><span></span><span></span></div>
      </div>
    {/if}
  </div>

  <form class="escribir" onsubmit={(e) => (e.preventDefault(), enviar())}>
    <textarea bind:value={texto} onkeydown={tecla} rows="1" placeholder="Escribe tu pregunta…" aria-label="Pregunta para el asistente"></textarea>
    <button class="btn btn-primario" disabled={!texto.trim() || chat.pensando} aria-label="Enviar">Enviar</button>
  </form>
</div>

<style>
  .chat-ia {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }
  .chat-ia.movil {
    height: calc(100dvh - 190px);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  h1 {
    margin: 0;
  }
  header p {
    margin: 2px 0 0;
  }
  .mensajes {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 2px 8px;
  }
  .bienvenida {
    margin: auto;
    max-width: 560px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .ico {
    width: 60px;
    height: 60px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .bienvenida p {
    margin: 0;
    font-weight: 700;
  }
  .sugerencias {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .chip {
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    font-weight: 700;
    font-size: 13px;
    text-align: left;
  }
  .fila {
    display: flex;
  }
  .fila.usuaria {
    justify-content: flex-end;
  }
  .burbuja {
    max-width: min(720px, 88%);
    padding: 10px 14px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
    line-height: 1.45;
    font-size: 14px;
  }
  .usuaria .burbuja {
    background: var(--primary);
    color: var(--on-primary);
    border-bottom-right-radius: 6px;
  }
  .fila.asistente .burbuja {
    border-bottom-left-radius: 6px;
  }
  .burbuja.error {
    background: color-mix(in srgb, #e0405f 12%, var(--surface));
    color: #9c1f3a;
  }
  .burbuja p {
    margin: 0 0 6px;
  }
  .burbuja p:last-of-type {
    margin-bottom: 0;
  }
  .burbuja p.vineta {
    padding-left: 16px;
    position: relative;
  }
  .burbuja p.vineta::before {
    content: '•';
    position: absolute;
    left: 3px;
    color: var(--primary);
    font-weight: 800;
  }
  .burbuja.nota {
    background: color-mix(in srgb, #5dbb8a 16%, var(--surface));
    color: #23704a;
    font-weight: 700;
    font-size: 13px;
    box-shadow: none;
  }
  .cita.web {
    background: color-mix(in srgb, #7aa7e8 22%, var(--surface));
    color: #2c5a99;
  }
  .cita.accion {
    background: var(--surface-2);
    color: var(--muted);
  }
  .cita.ir {
    background: var(--primary);
    color: var(--on-primary);
  }
  .externa {
    cursor: default;
  }
  .sin-portada {
    width: 44px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: var(--surface-2);
    flex: none;
  }
  .etiqueta-web {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 800;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, #7aa7e8 22%, var(--surface));
    color: #2c5a99;
  }
  .mini {
    align-self: flex-start;
    margin-top: 4px;
    padding: 4px 14px;
    font-size: 12px;
  }
  .cita {
    display: inline;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--primary-soft);
    color: var(--primary-strong);
    font-weight: 800;
    font-size: inherit;
  }
  .fichas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .ficha {
    display: flex;
    gap: 10px;
    padding: 8px;
    border-radius: 14px;
    text-align: left;
    align-items: center;
  }
  .ficha.agotado {
    opacity: 0.6;
    filter: grayscale(0.7);
  }
  .ficha img {
    background: var(--surface-2);
    width: 44px;
    height: 64px;
    object-fit: cover;
    border-radius: 5px;
    flex: none;
  }
  .datos {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .datos strong {
    font-size: 13px;
    line-height: 1.2;
  }
  .datos small {
    color: var(--muted);
    font-size: 11px;
  }
  .linea {
    display: flex;
    gap: 8px;
    font-size: 12px;
    align-items: center;
  }
  .stock {
    color: #2f8a5c;
    font-weight: 800;
  }
  .sin {
    color: #b0243f;
    font-weight: 800;
  }
  .ubic {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 800;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .pie {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
    font-size: 12px;
  }
  .enlace {
    font-weight: 800;
    color: var(--primary-strong);
    font-size: 12px;
  }
  .pensando {
    display: flex;
    gap: 5px;
    padding: 14px 16px;
  }
  .pensando span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary);
    animation: punto 1s infinite ease-in-out;
  }
  .pensando span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .pensando span:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes punto {
    50% {
      transform: translateY(-5px);
      opacity: 0.5;
    }
  }
  .escribir {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  textarea {
    flex: 1;
    resize: none;
    max-height: 140px;
    font: inherit;
    font-weight: 600;
    padding: 12px 14px;
    border-radius: 16px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
    field-sizing: content;
  }
  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
</style>
