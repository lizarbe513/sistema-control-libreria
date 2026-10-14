<script lang="ts">
  import { fly } from 'svelte/transition';
  import {
    columnas,
    compartimentos,
    infoTipo,
    iniciosDeTramo,
    tablasDe,
    tipoDeEstante,
    type Bloque,
    type Estante,
  } from '../../tienda/modelo';
  import { tienda } from '../../tienda/tienda.svelte';
  import ControlTramos from './ControlTramos.svelte';

  let {
    estante,
    onResaltar,
    onCerrar,
  }: {
    estante: Estante;
    /** Compartimento bajo el mouse (se resalta en la tienda 3D), o null. */
    onResaltar: (bloques: Bloque[] | null) => void;
    onCerrar: () => void;
  } = $props();

  const t = $derived(tienda.datos);
  const tipo = $derived(tipoDeEstante(t, estante.id) ?? 'estanteria');
  const terminos = $derived<[string, string] | string>(infoTipo(tipo).terminos ?? (['Tramo', 'Repisa'] as [string, string]));
  const nombres = $derived<[string, string]>(typeof terminos === 'object' ? terminos : ['Tramo', 'Repisa']);
  const siglas = $derived<[string, string]>([nombres[0].charAt(0), nombres[1].charAt(0)]);

  // el frente visto de cara: columnas de izquierda a derecha y filas de arriba abajo
  const cols = $derived(columnas(t, estante.id));
  const filas = $derived([...new Set(cols.flatMap((c) => c.bloques.map((b) => b.y)))].sort((a, b) => b - a));
  const tramos = $derived(compartimentos(t, estante.id));
  const inicios = $derived(iniciosDeTramo(estante, cols, tipo));
  const hayTabla = $derived(tablasDe(estante, t, tipo));

  const idxCol = $derived(new Map(cols.map((c, i) => [`${c.x},${c.z}`, i])));
  const idxFila = $derived(new Map(filas.map((y, i) => [y, i])));

  const PAD = 12;
  const celda = $derived(Math.max(22, Math.min(54, 520 / Math.max(1, cols.length), 280 / Math.max(1, filas.length))));
  const ancho = $derived(cols.length * celda + PAD * 2);
  const alto = $derived(filas.length * celda + PAD * 2);

  interface Cuadro {
    x: number;
    y: number;
    w: number;
    h: number;
    texto: string;
    bloques: Bloque[];
  }

  /** Cada compartimento como un rectángulo con su número. */
  const cuadros = $derived.by<Cuadro[]>(() => {
    const salida: Cuadro[] = [];
    tramos.forEach((tr, ti) => {
      tr.repisas.forEach((rep, ri) => {
        const cs = rep.map((b) => idxCol.get(`${b.x},${b.z}`)!);
        const fs = rep.map((b) => idxFila.get(b.y)!);
        const c0 = Math.min(...cs);
        const c1 = Math.max(...cs);
        const f0 = Math.min(...fs);
        const f1 = Math.max(...fs);
        salida.push({
          x: PAD + c0 * celda,
          y: PAD + f0 * celda,
          w: (c1 - c0 + 1) * celda,
          h: (f1 - f0 + 1) * celda,
          texto: typeof terminos === 'object' ? `${siglas[0]}${ti + 1}·${siglas[1]}${ri + 1}` : '',
          bloques: rep,
        });
      });
    });
    return salida;
  });

  // etiquetas flotantes en la escena (las gestiona el editor a través de este efecto)
  let sobre = $state<number | null>(null);
  $effect(() => {
    onResaltar(sobre === null ? null : (cuadros[sobre]?.bloques ?? null));
  });

  // separadores de tramo ya puestos (entre la columna i-1 y la i)
  const separadores = $derived(cols.map((c, i) => i > 0 && inicios.has(`${c.x},${c.z}`)));

  /** Tramo (índice espacial) de cada columna. */
  const tramoDe = $derived.by(() => {
    const r: number[] = [];
    let n = -1;
    cols.forEach((_, i) => {
      if (i === 0 || separadores[i]) n++;
      r.push(n);
    });
    return r;
  });
  const spans = $derived.by(() => {
    const s: { c0: number; c1: number }[] = [];
    tramoDe.forEach((n, i) => {
      if (!s[n]) s[n] = { c0: i, c1: i };
      s[n].c1 = i;
    });
    return s;
  });

  /** Uniones horizontales: entre la fila r y r+1, dentro de un tramo, si ambas existen en alguna columna. */
  const uniones = $derived.by(() => {
    const u: { x: number; y: number; w: number; yAbajo: number; hay: boolean; c0: number; c1: number }[] = [];
    for (const sp of spans) {
      const columnasDelTramo = cols.slice(sp.c0, sp.c1 + 1);
      for (let r = 0; r < filas.length - 1; r++) {
        const yAbajo = filas[r + 1];
        const existe = columnasDelTramo.some((c) => c.bloques.some((b) => b.y === yAbajo)) && columnasDelTramo.some((c) => c.bloques.some((b) => b.y === filas[r]));
        if (!existe) continue;
        u.push({
          x: PAD + sp.c0 * celda,
          y: PAD + (r + 1) * celda,
          w: (sp.c1 - sp.c0 + 1) * celda,
          yAbajo,
          hay: columnasDelTramo.some((c) => hayTabla(c.x, yAbajo, c.z)),
          c0: sp.c0,
          c1: sp.c1,
        });
      }
    }
    return u;
  });

  const orden = $derived(estante.orden ?? { tramos: 'izq', repisas: 'arriba' });
  const nTramos = $derived(tramos.length);
  const nRepisas = $derived(Math.max(0, ...tramos.map((x) => x.repisas.length)));
  const dividible = $derived(typeof terminos === 'object');

  function alternarSeparador(i: number) {
    tienda.alternarTramo(estante.id, cols[i].x, cols[i].z);
  }
  function alternarTabla(u: (typeof uniones)[number]) {
    tienda.alternarTabla(estante.id, u.yAbajo, cols.slice(u.c0, u.c1 + 1));
  }
</script>

<div class="organizar vidrio" transition:fly={{ x: -30, duration: 250 }} style:--f={estante.fuerte} style:--c={estante.color}>
  <header>
    <div>
      <strong>🗂️ Organizar «{estante.titulo}»</strong>
      <span class="atenuado">{nTramos} {nombres[0].toLowerCase()}{nTramos === 1 ? '' : 's'} · hasta {nRepisas} {nombres[1].toLowerCase()}{nRepisas === 1 ? '' : 's'} por {nombres[0].toLowerCase()}</span>
    </div>
    <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
  </header>

  {#if !dividible}
    <p class="aviso">Este mueble no se divide: toda la caja o mesita es un solo lugar.</p>
  {:else if !cols.length}
    <p class="aviso">Este estante no tiene bloques.</p>
  {:else}
    <p class="ayuda">
      Mira el estante <b>de frente</b>. Toca la línea entre dos columnas para separar o unir {nombres[0].toLowerCase()}s, y la línea entre dos filas para
      separar o unir {nombres[1].toLowerCase()}s. Pasa el mouse por un cuadro y verás dónde está en la tienda.
    </p>

    <div class="lienzo">
      <svg viewBox="0 0 {ancho} {alto}" width={ancho} height={alto} role="group" aria-label="Frente del estante">
        <!-- celdas (un bloque cada una) -->
        {#each cols as c, i (c.x + ',' + c.z)}
          {#each c.bloques as b (b.y)}
            <rect x={PAD + i * celda} y={PAD + idxFila.get(b.y)! * celda} width={celda} height={celda} class="bloque" />
          {/each}
        {/each}

        <!-- compartimentos -->
        {#each cuadros as q, i}
          <g class:sobre={sobre === i} onpointerenter={() => (sobre = i)} onpointerleave={() => (sobre = null)} role="presentation">
            <rect x={q.x + 3} y={q.y + 3} width={q.w - 6} height={q.h - 6} rx="8" class="compartimento" />
            <text x={q.x + q.w / 2} y={q.y + q.h / 2 + 5} class="numero">{q.texto}</text>
          </g>
        {/each}

        <!-- separadores y tablas existentes -->
        {#each separadores as hay, i}
          {#if hay}<line x1={PAD + i * celda} y1={PAD} x2={PAD + i * celda} y2={alto - PAD} class="sep" />{/if}
        {/each}
        {#each uniones as u}
          {#if u.hay}<line x1={u.x + 4} y1={u.y} x2={u.x + u.w - 4} y2={u.y} class="tabla" />{/if}
        {/each}

        <!-- zonas de clic -->
        {#each uniones as u}
          <rect x={u.x + 10} y={u.y - 9} width={Math.max(8, u.w - 20)} height="18" class="zona" class:hay={u.hay} onclick={() => alternarTabla(u)} role="button" tabindex="-1" aria-label="Separar o unir repisas" onkeydown={() => {}}>
            <title>{u.hay ? 'Quitar esta tabla' : 'Poner una tabla aquí'}</title>
          </rect>
        {/each}
        {#each cols as _, i}
          {#if i > 0}
            <rect x={PAD + i * celda - 9} y={PAD} width="18" height={alto - PAD * 2} class="zona vertical" class:hay={separadores[i]} onclick={() => alternarSeparador(i)} role="button" tabindex="-1" aria-label="Separar o unir tramos" onkeydown={() => {}}>
              <title>{separadores[i] ? 'Unir estos dos tramos' : 'Separar en dos tramos'}</title>
            </rect>
          {/if}
        {/each}

        <!-- flechas del orden -->
        <text x={ancho / 2} y={alto - 1} class="flecha">{orden.tramos === 'izq' ? '← 1 · 2 · 3 …' : '… 3 · 2 · 1 →'}</text>
      </svg>
    </div>

    <div class="grupo">
      <ControlTramos id={estante.id} />
    </div>
    <p class="ayuda">Las divisiones verticales separan cada repisa en tramos. Con «Sin divisiones» las repisas corren de lado a lado.</p>
    <div class="grupo">
      <span>{nombres[0]}s de</span>
      {#each [1, 2, 3, 4] as n}
        <button class="op" onclick={() => tienda.tramosCada(estante.id, n)}>{n} {n === 1 ? 'bloque' : 'bloques'}</button>
      {/each}
    </div>
    <div class="grupo">
      <span>{nombres[1]}s de</span>
      {#each [1, 2, 3] as n}
        <button class="op" onclick={() => tienda.repisasCada(estante.id, n)}>{n} {n === 1 ? 'bloque' : 'bloques'}</button>
      {/each}
      <button class="op" onclick={() => tienda.unCompartimento(estante.id)}>Todo junto</button>
    </div>

    <div class="grupo">
      <span>Numerar {nombres[0].toLowerCase()}s desde</span>
      <button class="op" class:activo={orden.tramos === 'izq'} onclick={() => tienda.fijarOrden(estante.id, { tramos: 'izq' })}>← la izquierda</button>
      <button class="op" class:activo={orden.tramos === 'der'} onclick={() => tienda.fijarOrden(estante.id, { tramos: 'der' })}>la derecha →</button>
    </div>
    <div class="grupo">
      <span>Numerar {nombres[1].toLowerCase()}s desde</span>
      <button class="op" class:activo={orden.repisas === 'arriba'} onclick={() => tienda.fijarOrden(estante.id, { repisas: 'arriba' })}>↓ arriba</button>
      <button class="op" class:activo={orden.repisas === 'abajo'} onclick={() => tienda.fijarOrden(estante.id, { repisas: 'abajo' })}>↑ abajo</button>
    </div>
  {/if}
</div>

<style>
  .organizar {
    position: absolute;
    top: 70px;
    left: 14px;
    width: min(600px, calc(100% - 28px));
    max-height: calc(100% - 190px);
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface);
    border-top: 6px solid var(--f);
    z-index: 8;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }
  header div {
    display: flex;
    flex-direction: column;
  }
  header strong {
    font-size: 16px;
  }
  .cerrar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-2);
    font-weight: 800;
    font-size: 12px;
  }
  p {
    margin: 0;
    font-size: 12px;
  }
  .ayuda {
    color: var(--muted);
  }
  .aviso {
    padding: 14px;
    border-radius: 12px;
    background: var(--surface-2);
    font-weight: 700;
    font-size: 13px;
  }
  .lienzo {
    overflow: auto;
    background: var(--surface-2);
    border-radius: 14px;
    display: flex;
    justify-content: center;
  }
  svg {
    display: block;
    max-width: none;
  }
  .bloque {
    fill: color-mix(in srgb, var(--c) 40%, #fff);
    stroke: color-mix(in srgb, var(--f) 20%, transparent);
    stroke-width: 1;
  }
  .compartimento {
    fill: color-mix(in srgb, var(--f) 28%, var(--surface));
    stroke: var(--f);
    stroke-width: 2;
    transition:
      fill 0.15s,
      stroke-width 0.15s;
  }
  g.sobre .compartimento {
    fill: color-mix(in srgb, var(--f) 55%, var(--surface));
    stroke-width: 3.5;
  }
  .numero {
    font-size: 13px;
    font-weight: 800;
    text-anchor: middle;
    fill: color-mix(in srgb, var(--f) 55%, #3d2a33);
    pointer-events: none;
  }
  .sep {
    stroke: var(--f);
    stroke-width: 5;
    stroke-linecap: round;
    pointer-events: none;
  }
  .tabla {
    stroke: var(--f);
    stroke-width: 5;
    stroke-linecap: round;
    pointer-events: none;
  }
  .zona {
    fill: transparent;
    cursor: pointer;
    transition: fill 0.15s;
  }
  .zona:hover {
    fill: color-mix(in srgb, var(--f) 35%, transparent);
  }
  .zona.hay:hover {
    fill: color-mix(in srgb, #e0405f 30%, transparent);
  }
  .flecha {
    font-size: 11px;
    font-weight: 800;
    text-anchor: middle;
    fill: var(--muted);
    pointer-events: none;
  }
  .grupo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
  }
  .grupo span {
    min-width: 150px;
  }
  .op {
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 2px solid transparent;
    font-weight: 700;
    font-size: 12px;
  }
  .op:hover {
    border-color: var(--f);
  }
  .op.activo {
    background: var(--f);
    color: #fff;
  }
</style>
