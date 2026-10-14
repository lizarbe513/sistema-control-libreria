<script lang="ts">
  import { onMount } from 'svelte';
  import { avisar } from '../estado.svelte';
  import { EscenaTienda } from '../tienda/escena';
  import { PALETA, TIPOS, columnas, infoTipo, ubicacionDe, type Bloque, type TipoBloque } from '../tienda/modelo';
  import { LIMITES, medidasDe, tienda, type Medidas } from '../tienda/tienda.svelte';
  import Icono from '../componentes/Icono.svelte';

  type Herramienta = TipoBloque | 'borrar';

  let contenedor: HTMLDivElement = $state()!;
  let canvas: HTMLCanvasElement = $state()!;
  let escena: EscenaTienda | null = $state(null);
  let sinWebGL = $state(false);

  let herramienta = $state<Herramienta>('estanteria');
  let giroExtra = $state(0);
  let estanteActivo = $state<string | null>('A');
  let nivel = $state(tienda.datos.alto - 1);
  let info = $state<{ x: number; y: number; texto: string } | null>(null);

  // relleno de punta a punta: primer clic marca una esquina, el segundo llena la caja
  type Celda = [number, number, number];
  let relleno = $state(false);
  let esquina = $state<Celda | null>(null);
  let alturaRelleno = $state(1);
  const MAX_RELLENO = 6000;

  // medidas (borrador editable; se sincroniza si la tienda cambia, p. ej. al deshacer)
  let medidas = $state<Medidas>(medidasDe(tienda.datos));
  $effect(() => {
    medidas = medidasDe(tienda.datos);
  });
  $effect(() => {
    if (nivel > tienda.datos.alto - 1) nivel = tienda.datos.alto - 1;
  });

  const t = $derived(tienda.datos);
  const resumen = $derived(
    t.estantes.map((e) => {
      const cols = columnas(t, e.id);
      const bloques = cols.reduce((n, c) => n + c.bloques.length, 0);
      const esCaja = cols[0]?.bloques[0]?.tipo === 'caja';
      const detalle = !cols.length
        ? 'vacío: coloca bloques'
        : esCaja
          ? `${bloques} bloque${bloques === 1 ? '' : 's'}`
          : `${cols.length} tramo${cols.length === 1 ? '' : 's'} · ${Math.max(...cols.map((c) => c.bloques.length))} repisas`;
      return { ...e, detalle };
    }),
  );

  onMount(() => {
    try {
      escena = new EscenaTienda(canvas, contenedor, 'editor');
    } catch {
      sinWebGL = true;
    }
    return () => {
      escena?.destruir();
      escena = null;
    };
  });

  $effect(() => {
    escena?.cargar(tienda.datos, nivel);
  });

  // ───────── colocar / quitar ─────────

  /** Rotación que mira hacia la cámara (como en Minecraft) + los giros extra con R. */
  function rotHaciaCamara(x: number, z: number) {
    if (!escena) return 0;
    const dx = escena.camara.position.x - (x + 0.5);
    const dz = escena.camara.position.z - (z + 0.5);
    const base = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? 0 : 2) : dx < 0 ? 1 : 3;
    return (base + giroExtra) % 4;
  }

  function nuevoBloque([x, y, z]: [number, number, number], tipo: TipoBloque): Bloque {
    const i = infoTipo(tipo);
    const b: Bloque = { x, y, z, tipo, rot: i.rota ? rotHaciaCamara(x, z) : 0 };
    if (i.guardaLibros) b.estante = estanteParaColocar(tipo);
    return b;
  }

  function estanteParaColocar(tipo: TipoBloque) {
    if (estanteActivo && t.estantes.some((e) => e.id === estanteActivo)) return estanteActivo;
    const e = tienda.crearEstante(tipo);
    estanteActivo = e.id;
    avisar(`Nuevo: ${e.titulo}`);
    return e.id;
  }

  function linea(a: [number, number, number], b: [number, number, number]): [number, number, number][] {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const celdas: [number, number, number][] = [];
    if (Math.abs(dx) >= Math.abs(dz)) {
      for (let i = 0; i <= Math.abs(dx); i++) celdas.push([a[0] + i * Math.sign(dx), a[1], a[2]]);
    } else {
      for (let i = 0; i <= Math.abs(dz); i++) celdas.push([a[0], a[1], a[2] + i * Math.sign(dz)]);
    }
    return celdas;
  }

  /** Celda objetivo según la herramienta: el bloque apuntado (borrar) o la celda vacía (poner). */
  function objetivo(a: { bloque: Bloque | null; celda: Celda | null }): Celda | null {
    if (herramienta === 'borrar') return a.bloque ? [a.bloque.x, a.bloque.y, a.bloque.z] : null;
    return a.celda;
  }

  /** Esquina opuesta de la caja: misma huella que el cursor; la altura sube al poner y baja al borrar. */
  const opuesta = (inicio: Celda, c: Celda): Celda => [
    c[0],
    herramienta === 'borrar' ? Math.max(0, inicio[1] - alturaRelleno + 1) : inicio[1] + alturaRelleno - 1,
    c[2],
  ];

  function rellenar(a: Celda, b: Celda) {
    const tipo = herramienta;
    if (tipo === 'borrar') {
      const n = tienda.quitarCaja(a, b);
      avisar(n ? `Quitados ${n} bloques` : 'No había bloques ahí');
      return;
    }
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const [z0, z1] = [Math.min(a[2], b[2]), Math.max(a[2], b[2])];
    const total = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (total > MAX_RELLENO) {
      avisar(`Demasiado grande (${total} bloques). Máximo ${MAX_RELLENO}.`);
      return;
    }
    const nuevos: Bloque[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) nuevos.push(nuevoBloque([x, y, z], tipo));
    const n = tienda.colocar(nuevos);
    avisar(n ? `Colocados ${n} bloques` : 'Ese espacio ya estaba lleno');
  }

  function alternarRelleno() {
    relleno = !relleno;
    esquina = null;
  }

  function aplicarMedidas() {
    const m: Medidas = { ...medidas };
    for (const k of Object.keys(LIMITES) as (keyof Medidas)[]) {
      const [min, max] = LIMITES[k];
      m[k] = Math.max(min, Math.min(max, Math.round(Number(m[k]) || min)));
    }
    const fuera = tienda.fueraCon(m);
    if (fuera && !confirm(`Con estas medidas quedan fuera ${fuera} bloques y se quitarán. ¿Continuar?`)) return;
    tienda.redimensionar(m);
    nivel = m.alto - 1;
    avisar(`Tienda de ${m.ancho / 2} × ${m.largo / 2} m`);
  }

  // ───────── puntero ─────────

  let inicio: { x: number; y: number; boton: number; celda: [number, number, number] | null; fila: boolean } | null = null;

  function mover(e: PointerEvent) {
    if (!escena) return;
    const a = escena.apuntar(e.clientX, e.clientY);
    const h = herramienta;
    const borrar = h === 'borrar';
    const color = h === 'borrar' ? '' : infoTipo(h).color;
    const c = objetivo(a);
    if (relleno && esquina) escena.fijarFantasma(esquina, color, borrar, c ? opuesta(esquina, c) : esquina);
    else if (relleno && c) escena.fijarFantasma(c, color, borrar, opuesta(c, c));
    else escena.fijarFantasma(c, color, borrar);

    const u = a.bloque ? ubicacionDe(t, a.bloque) : null;
    const r = contenedor.getBoundingClientRect();
    info = a.bloque
      ? {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          texto: u
            ? u.bloque.tipo === 'caja'
              ? u.info.titulo
              : `${u.info.titulo} · tramo ${u.tramo} · repisa ${u.repisa}`
            : infoTipo(a.bloque.tipo).nombre,
        }
      : null;
  }

  function presionar(e: PointerEvent) {
    if (!escena || (e.button !== 0 && e.button !== 2)) return;
    const a = escena.apuntar(e.clientX, e.clientY);
    inicio = { x: e.clientX, y: e.clientY, boton: e.button, celda: a.celda, fila: e.button === 0 && e.shiftKey };
  }

  function soltar(e: PointerEvent) {
    if (!escena || !inicio || e.button !== inicio.boton) return;
    const quieto = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < 6;
    const a = escena.apuntar(e.clientX, e.clientY);
    if (inicio.boton === 2) {
      if (quieto && relleno && esquina) esquina = null; // clic derecho cancela la esquina
      else if (quieto && a.bloque) tienda.quitar(a.bloque.x, a.bloque.y, a.bloque.z);
    } else if (relleno) {
      const c = objetivo(a);
      if (quieto && c) {
        if (!esquina) esquina = c;
        else {
          rellenar(esquina, opuesta(esquina, c));
          esquina = null;
        }
      }
    } else if (herramienta === 'borrar') {
      if (a.bloque) tienda.quitar(a.bloque.x, a.bloque.y, a.bloque.z);
    } else if (inicio.fila && inicio.celda && a.celda) {
      const tipo = herramienta;
      tienda.colocar(linea(inicio.celda, [a.celda[0], inicio.celda[1], a.celda[2]]).map((c) => nuevoBloque(c, tipo)));
    } else if (quieto && a.celda) {
      tienda.colocar([nuevoBloque(a.celda, herramienta)]);
    }
    inicio = null;
    mover(e);
  }

  function tecla(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) tienda.rehacer();
      else tienda.deshacer();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      tienda.rehacer();
    } else if (!ctrl && e.key >= '1' && e.key <= '9') {
      const n = Number(e.key);
      herramienta = n === 9 ? 'borrar' : TIPOS[n - 1].id;
    } else if (!ctrl && e.key.toLowerCase() === 'f') {
      alternarRelleno();
    } else if (e.key === 'Escape' && esquina) {
      esquina = null;
      escena?.fijarFantasma(null);
    } else if (!ctrl && e.key.toLowerCase() === 'r') {
      giroExtra = (giroExtra + 1) % 4;
    }
  }

  function restaurar() {
    if (confirm('¿Volver a la plantilla de SIGLO XXI? Se perderán los cambios de la tienda.')) {
      tienda.restaurar();
      estanteActivo = 'A';
      avisar('Plantilla restaurada');
    }
  }

  function nuevo() {
    const tipo: TipoBloque = herramienta === 'caja' || herramienta === 'exterior' ? herramienta : 'estanteria';
    const e = tienda.crearEstante(tipo);
    estanteActivo = e.id;
    if (herramienta !== tipo) herramienta = tipo;
  }

  function cambiarColor(id: string, actual: string) {
    const i = PALETA.findIndex(([c]) => c === actual);
    const [color, fuerte] = PALETA[(i + 1) % PALETA.length];
    tienda.editarEstante(id, { color, fuerte });
  }

  function borrar(id: string, titulo: string) {
    if (confirm(`¿Borrar «${titulo}» y todos sus bloques?`)) {
      tienda.borrarEstante(id);
      if (estanteActivo === id) estanteActivo = null;
    }
  }
</script>

<svelte:window onkeydown={tecla} />

<div class="editor">
  <div class="escenario vidrio" bind:this={contenedor}>
    {#if sinWebGL}
      <p class="aviso">Este equipo no tiene WebGL; el editor 3D no está disponible.</p>
    {/if}
    <canvas
      bind:this={canvas}
      onpointermove={mover}
      onpointerdown={presionar}
      onpointerup={soltar}
      onpointerleave={() => {
        escena?.fijarFantasma(null);
        info = null;
      }}
      oncontextmenu={(e) => e.preventDefault()}
    ></canvas>

    <div class="barra-sup">
      <h1>Mi tienda</h1>
      <button class="btn btn-blanco" onclick={() => escena?.vistaGeneral()}>Vista general</button>
      <button class="btn btn-blanco" onclick={() => escena?.vistaPlanta()}>Vista de planta</button>
      <button class="btn btn-blanco icono" onclick={() => tienda.deshacer()} disabled={!tienda.puedeDeshacer} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
      <button class="btn btn-blanco icono" onclick={() => tienda.rehacer()} disabled={!tienda.puedeRehacer} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">↷</button>
      <button class="btn relleno" class:btn-primario={relleno} class:btn-blanco={!relleno} onclick={alternarRelleno} title="Rellenar de punta a punta (F)">
        ▦ Relleno{relleno ? (esquina ? ' · marca la otra punta' : ' · marca una punta') : ''}
      </button>
      {#if relleno}
        <label class="altura">
          <span>Altura</span>
          <input type="number" min="1" max={t.alto} bind:value={alturaRelleno} />
        </label>
      {/if}
      <label class="nivel">
        <span>Altura visible</span>
        <input type="range" min="0" max={t.alto - 1} bind:value={nivel} />
        <strong>{nivel + 1}</strong>
      </label>
    </div>

    {#if info}
      <div class="etiqueta" style:left="{info.x + 14}px" style:top="{info.y + 14}px">{info.texto}</div>
    {/if}

    <div class="abajo">
      <div class="hotbar" role="toolbar" aria-label="Bloques">
        {#each TIPOS as tipo, i}
          <button class="ranura" class:activa={herramienta === tipo.id} onclick={() => (herramienta = tipo.id)} title={tipo.nombre}>
            <span class="num">{i + 1}</span>
            <span class="emoji">{tipo.emoji}</span>
            <span class="nombre">{tipo.nombre}</span>
          </button>
        {/each}
        <button class="ranura" class:activa={herramienta === 'borrar'} onclick={() => (herramienta = 'borrar')} title="Borrador">
          <span class="num">9</span>
          <span class="emoji">🧽</span>
          <span class="nombre">Borrador</span>
        </button>
      </div>
      <p class="ayuda">
        <b>Clic</b> poner · <b>Clic derecho</b> quitar · <b>Arrastrar con clic derecho</b> girar · <b>Rueda</b> zoom ·
        <b>R</b> rotar ({['↓', '←', '↑', '→'][giroExtra]}) · <b>Shift + arrastrar</b> una fila · <b>F</b> relleno de punta a punta
      </p>
    </div>
  </div>

  <aside class="panel vidrio">
    <details class="medidas">
      <summary><strong>Medidas de la tienda</strong> <span class="atenuado">{t.ancho / 2} × {t.fachada / 2} m</span></summary>
      <p class="atenuado">En cuadros de 0,5 m. La vereda se mueve junto con la fachada.</p>
      <div class="campos">
        {#each [['ancho', 'Ancho'], ['largo', 'Largo (interior)'], ['vereda', 'Vereda'], ['alto', 'Alto']] as const as [k, nombre]}
          <label>
            <span>{nombre}</span>
            <input type="number" min={LIMITES[k][0]} max={LIMITES[k][1]} bind:value={medidas[k]} />
            <small>{(Number(medidas[k]) || 0) / 2} m</small>
          </label>
        {/each}
      </div>
      <button class="btn btn-suave" onclick={aplicarMedidas}>Aplicar medidas</button>
    </details>

    <div class="cab">
      <h2 class="titulo-seccion">Estantes</h2>
      <button class="btn btn-suave" onclick={nuevo}><Icono nombre="mas" tam={16} /> Nuevo</button>
    </div>
    <p class="atenuado">Las estanterías, cajas y repisas que coloques se suman al estante elegido.</p>
    <ul>
      {#each resumen as e (e.id)}
        <li class:activo={estanteActivo === e.id}>
          <button class="punto" style:background={e.color} style:border-color={e.fuerte} onclick={() => cambiarColor(e.id, e.color)} title="Cambiar color" aria-label="Cambiar color"></button>
          <div class="elegir" onfocusin={() => (estanteActivo = e.id)}>
            <input value={e.titulo} onchange={(ev) => tienda.editarEstante(e.id, { titulo: ev.currentTarget.value || e.titulo })} aria-label="Nombre" />
            <input class="tema" value={e.tema} placeholder="¿Qué libros guarda?" onchange={(ev) => tienda.editarEstante(e.id, { tema: ev.currentTarget.value })} aria-label="Tema" />
            <button class="usar" onclick={() => (estanteActivo = e.id)}>
              {e.detalle}{estanteActivo === e.id ? ' · en uso' : ' · usar'}
            </button>
          </div>
          <button class="quitar" onclick={() => borrar(e.id, e.titulo)} aria-label="Borrar estante" title="Borrar estante"><Icono nombre="cerrar" tam={14} /></button>
        </li>
      {/each}
    </ul>
    <button class="btn btn-blanco restaurar" onclick={restaurar}>Restaurar plantilla SIGLO XXI</button>
  </aside>
</div>

<style>
  .editor {
    height: calc(100vh - 36px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 16px;
  }
  .escenario {
    position: relative;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 20%, #fffafc, color-mix(in srgb, var(--primary-soft) 60%, var(--surface)));
  }
  :global([data-tema='noche']) .escenario {
    background: radial-gradient(ellipse at 50% 20%, #5a4b7e, #2c2648);
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
  .aviso {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  .barra-sup {
    position: absolute;
    top: 14px;
    left: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    pointer-events: none;
  }
  .barra-sup > * {
    pointer-events: auto;
  }
  h1 {
    font-size: 20px;
    margin: 0 4px 0 0;
    font-weight: 800;
    padding: 6px 16px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  .btn.icono {
    width: 40px;
    padding: 0;
    font-size: 18px;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .relleno {
    font-size: 14px;
  }
  .altura {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
    font-weight: 700;
    box-shadow: var(--sombra-suave);
  }
  .altura input,
  .campos input {
    width: 56px;
    font: inherit;
    font-weight: 800;
    border: 2px solid var(--linea);
    border-radius: 10px;
    padding: 3px 6px;
    background: var(--surface);
    color: var(--text);
  }
  .medidas {
    background: var(--surface);
    border-radius: 14px;
    padding: 10px 12px;
  }
  .medidas summary {
    cursor: pointer;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .medidas[open] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .campos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .campos label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-weight: 700;
  }
  .campos small {
    color: var(--muted);
    font-size: 11px;
  }
  .nivel {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 13px;
    font-weight: 700;
    box-shadow: var(--sombra-suave);
  }
  .nivel input {
    accent-color: var(--primary);
    width: 110px;
  }
  .etiqueta {
    position: absolute;
    pointer-events: none;
    padding: 5px 10px;
    border-radius: 10px;
    background: var(--text);
    color: var(--bg);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .abajo {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .hotbar {
    display: flex;
    gap: 6px;
    padding: 6px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    box-shadow: var(--sombra);
    pointer-events: auto;
  }
  .ranura {
    position: relative;
    width: 62px;
    height: 62px;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 2px solid transparent;
    background: var(--surface-2);
    transition: transform 0.15s, border-color 0.2s;
  }
  .ranura:hover {
    transform: translateY(-2px);
  }
  .ranura.activa {
    border-color: var(--primary);
    background: var(--primary-soft);
    transform: translateY(-4px);
  }
  .num {
    position: absolute;
    top: 3px;
    left: 6px;
    font-size: 10px;
    font-weight: 800;
    color: var(--muted);
  }
  .emoji {
    font-size: 22px;
    line-height: 1;
  }
  .ranura .nombre {
    font-size: 9px;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
    max-width: 58px;
  }
  .ayuda {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    padding: 3px 12px;
    border-radius: 999px;
  }
  .panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
  }
  .cab {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel p {
    margin: 0;
    font-size: 13px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 14px;
    background: var(--surface);
    border: 2px solid transparent;
  }
  li.activo {
    border-color: var(--primary);
  }
  .punto {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid;
    flex: none;
  }
  .elegir {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
  }
  .elegir input {
    font: inherit;
    font-weight: 800;
    font-size: 14px;
    border: none;
    background: transparent;
    color: var(--text);
    padding: 0;
    min-width: 0;
  }
  .elegir input.tema {
    font-weight: 600;
    font-size: 12px;
    color: var(--muted);
  }
  .elegir input:focus {
    outline: none;
    text-decoration: underline dotted var(--primary);
  }
  .usar {
    text-align: left;
    padding: 0;
    font-size: 11px;
    color: var(--muted);
  }
  .quitar {
    color: var(--muted);
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
  }
  .quitar:hover {
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .restaurar {
    font-size: 13px;
  }
</style>
