<script lang="ts">
  // Leer el título de una portada sin salir de la app: cámara en vivo → foto → se marca con el dedo el título (y, si se
  // quiere, el autor) → solo ese recorte se lee en el teléfono. Así no se cuelan subtítulos, editorial ni frases.
  import { onDestroy, onMount, tick } from 'svelte';
  import { alAtras } from '../atras.svelte';
  import { avisarLectura, reconocer } from '../escaner';

  let { onListo, onCerrar }: { onListo: (r: { titulo: string; autor: string }) => void; onCerrar: () => void } = $props();

  type Rect = { x: number; y: number; w: number; h: number };
  type Campo = 'titulo' | 'autor';

  let etapa = $state<'camara' | 'foto'>('camara');
  let error = $state('');

  // ── cámara en vivo ──
  let video = $state<HTMLVideoElement>();
  let flujo: MediaStream | null = null;
  let linterna = $state<boolean | null>(null); // null: la cámara no tiene linterna

  async function abrirCamara() {
    error = '';
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (etapa !== 'camara' || !video) return apagarCamara();
      video.srcObject = flujo;
      await video.play().catch(() => {});
      const pista = flujo.getVideoTracks()[0];
      const cap = (pista?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      linterna = cap.torch ? false : null;
    } catch (e) {
      error = `No se pudo abrir la cámara: ${(e as Error).message || 'sin permiso'}`;
    }
  }

  function apagarCamara() {
    flujo?.getTracks().forEach((t) => t.stop());
    flujo = null;
    if (video) video.srcObject = null;
  }

  async function alternarLinterna() {
    const pista = flujo?.getVideoTracks()[0];
    if (!pista || linterna === null) return;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !linterna } as MediaTrackConstraintSet] });
      linterna = !linterna;
    } catch {
      linterna = null;
    }
  }

  // ── foto congelada ──
  let lienzoFoto: HTMLCanvasElement | null = null;
  let foto = $state('');
  let fw = $state(1);
  let fh = $state(1);

  function disparar() {
    if (!video || !video.videoWidth) return;
    // la foto es exactamente lo que se veía (el video llena la pantalla recortando los bordes)
    const [vw, vh] = [video.videoWidth, video.videoHeight];
    const e = Math.max(video.clientWidth / vw, video.clientHeight / vh) || 1;
    const sw = Math.min(vw, video.clientWidth / e);
    const sh = Math.min(vh, video.clientHeight / e);
    const k = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    c.getContext('2d')!.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    lienzoFoto = c;
    fw = c.width;
    fh = c.height;
    foto = c.toDataURL('image/jpeg', 0.9);
    apagarCamara();
    sel = null;
    campo = titulo ? 'autor' : 'titulo';
    etapa = 'foto';
  }

  async function otraFoto() {
    etapa = 'camara';
    foto = '';
    sel = null;
    error = '';
    await tick(); // espera a que vuelva a existir el <video>
    await abrirCamara();
  }

  // ── selección con el dedo (en píxeles de la foto) ──
  let sel = $state<Rect | null>(null);
  let cw = $state(0);
  let ch = $state(0);
  const k = $derived(cw && ch ? Math.min(cw / fw, ch / fh) : 1);
  const ox = $derived((cw - fw * k) / 2);
  const oy = $derived((ch - fh * k) / 2);
  let capa = $state<HTMLDivElement>();

  type Arrastre = { tipo: 'nuevo'; x0: number; y0: number } | { tipo: 'asa'; fija: { x: number; y: number } };
  let arrastre: Arrastre | null = null;

  function aFoto(e: PointerEvent) {
    const r = capa!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(fw, (e.clientX - r.left - ox) / k)),
      y: Math.max(0, Math.min(fh, (e.clientY - r.top - oy) / k)),
    };
  }

  const esquinas = (s: Rect) => [
    { x: s.x, y: s.y },
    { x: s.x + s.w, y: s.y },
    { x: s.x, y: s.y + s.h },
    { x: s.x + s.w, y: s.y + s.h },
  ];

  function bajar(e: PointerEvent) {
    if (leyendo) return;
    capa!.setPointerCapture(e.pointerId);
    const p = aFoto(e);
    // ¿tocó una asa? (28 px de pantalla alrededor de cada esquina)
    if (sel) {
      const es = esquinas(sel);
      const d = es.map((q) => Math.hypot(q.x - p.x, q.y - p.y) * k);
      const i = d.indexOf(Math.min(...d)); // la más cercana: en una franja bajita las asas quedan juntas
      if (d[i] < 28) {
        arrastre = { tipo: 'asa', fija: es[3 - i] };
        return;
      }
    }
    arrastre = { tipo: 'nuevo', x0: p.x, y0: p.y };
    sel = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  function mover(e: PointerEvent) {
    if (!arrastre) return;
    const p = aFoto(e);
    const a = arrastre.tipo === 'nuevo' ? { x: arrastre.x0, y: arrastre.y0 } : arrastre.fija;
    sel = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
  }

  function soltar() {
    arrastre = null;
    if (sel && (sel.w * k < 12 || sel.h * k < 8)) sel = null; // un toque sin arrastrar no es una selección
  }

  // ── lectura de lo marcado ──
  let campo = $state<Campo>('titulo');
  let titulo = $state('');
  let autor = $state('');
  let leyendo = $state(false);

  /** Recorta lo marcado y lo agranda si es chico (ML Kit lee mejor letras de buen tamaño). */
  function recorte(s: Rect): string {
    const u = Math.max(1, Math.min(4, 900 / Math.max(s.w, s.h)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(s.w * u));
    c.height = Math.max(1, Math.round(s.h * u));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(lienzoFoto!, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92);
  }

  async function leerSeleccion() {
    if (!sel || !lienzoFoto || leyendo) return;
    leyendo = true;
    error = '';
    try {
      const texto = (await reconocer(recorte(sel))).trim();
      if (!texto) {
        avisarLectura(false);
        error = 'No leí texto ahí. Marca solo las letras, con buena luz, y prueba otra vez.';
        return;
      }
      avisarLectura();
      if (campo === 'titulo') {
        titulo = texto;
        campo = 'autor';
      } else {
        autor = texto;
      }
      sel = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      leyendo = false;
    }
  }

  function buscar() {
    if (!titulo.trim() && !autor.trim()) return;
    onListo({ titulo: titulo.trim(), autor: autor.trim() });
  }

  onMount(() => void abrirCamara());
  onDestroy(apagarCamara);

  // «atrás»: desde la foto vuelve a la cámara; desde la cámara cierra
  $effect(() => {
    const e = etapa;
    return alAtras(() => (e === 'foto' ? void otraFoto() : onCerrar()));
  });
</script>

<div class="lector" data-testid="lector-titulo">
  {#if etapa === 'camara'}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted class="vivo" data-testid="camara-vivo"></video>
    <div class="guia" aria-hidden="true"><span class="marco"></span></div>
    <p class="indicacion">Encuadra la portada y toma la foto. Luego marcas con el dedo el título.</p>
    {#if error}<p class="error flotante" role="alert">{error}</p>{/if}
    <div class="barra">
      <button class="redondo" onclick={onCerrar} aria-label="Cerrar la cámara">✕</button>
      <button class="disparo" onclick={disparar} aria-label="Tomar la foto" data-testid="disparar"><span></span></button>
      <button class="redondo" class:encendida={linterna} onclick={alternarLinterna} disabled={linterna === null} aria-label="Linterna">🔦</button>
    </div>
  {:else}
    <div class="arriba">
      <button class="redondo" onclick={otraFoto} aria-label="Otra foto">↺</button>
      <p class="indicacion fija">
        {campo === 'titulo' ? 'Marca con el dedo el título' : titulo ? 'Si quieres, marca también el autor' : 'Marca con el dedo el autor'}
      </p>
    </div>
    <div class="lienzo" bind:clientWidth={cw} bind:clientHeight={ch}>
      <img src={foto} alt="Foto de la portada" style:left="{ox}px" style:top="{oy}px" style:width="{fw * k}px" style:height="{fh * k}px" />
      <svg viewBox="0 0 {fw} {fh}" style:left="{ox}px" style:top="{oy}px" style:width="{fw * k}px" style:height="{fh * k}px" aria-hidden="true">
        {#if sel}
          <path d="M0 0H{fw}V{fh}H0Z M{sel.x} {sel.y}V{sel.y + sel.h}H{sel.x + sel.w}V{sel.y}Z" fill="rgba(0,0,0,0.5)" fill-rule="evenodd" />
          <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="none" stroke="#fff" stroke-width={2.5 / k} rx={6 / k} />
          {#each esquinas(sel) as q, i (i)}<circle cx={q.x} cy={q.y} r={9 / k} fill="var(--primary)" stroke="#fff" stroke-width={2.5 / k} />{/each}
        {/if}
      </svg>
      <div class="capa" bind:this={capa} onpointerdown={bajar} onpointermove={mover} onpointerup={soltar} onpointercancel={soltar} data-testid="capa-seleccion" role="presentation"></div>
    </div>
    <div class="panel">
      <div class="campos">
        <div class="selector" role="tablist" aria-label="Qué estoy marcando">
          <button role="tab" aria-selected={campo === 'titulo'} class:activo={campo === 'titulo'} onclick={() => (campo = 'titulo')}>Título</button>
          <button role="tab" aria-selected={campo === 'autor'} class:activo={campo === 'autor'} onclick={() => (campo = 'autor')}>Autor</button>
        </div>
        <label class:activo={campo === 'titulo'}>Título<input bind:value={titulo} aria-label="Título leído" placeholder="Marca el título y toca «Leer»" /></label>
        <label class:activo={campo === 'autor'}>Autor<input bind:value={autor} aria-label="Autor leído" placeholder="(opcional)" /></label>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="acciones">
        <button class="btn btn-suave" onclick={leerSeleccion} disabled={!sel || leyendo} data-testid="leer-seleccion">
          {leyendo ? 'Leyendo…' : sel ? `🔤 Leer ${campo === 'titulo' ? 'el título' : 'el autor'}` : 'Marca el texto en la foto'}
        </button>
        <button class="btn btn-primario" onclick={buscar} disabled={(!titulo.trim() && !autor.trim()) || leyendo} data-testid="buscar-leido">🔎 Buscar en internet</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .lector {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    background: #000;
    color: #fff;
  }
  .vivo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .guia {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .marco {
    width: min(80%, 340px);
    aspect-ratio: 2 / 3;
    max-height: 62%;
    border-radius: 18px;
    border: 3px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.25);
  }
  .indicacion {
    position: absolute;
    top: 18px;
    left: 16px;
    right: 16px;
    margin: 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.55);
    font-weight: 700;
    font-size: 14px;
    text-align: center;
  }
  .indicacion.fija {
    position: static;
    flex: 1;
  }
  .barra {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 18px 28px calc(24px + env(safe-area-inset-bottom));
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  }
  .redondo {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    display: grid;
    place-items: center;
  }
  .redondo:disabled {
    opacity: 0.3;
  }
  .redondo.encendida {
    background: var(--yellow, #ffd86b);
  }
  .disparo {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    border: 5px solid #fff;
    display: grid;
    place-items: center;
    background: transparent;
  }
  .disparo span {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.12s;
  }
  .disparo:active span {
    transform: scale(0.88);
  }
  .arriba {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
  }
  .lienzo {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .lienzo img,
  .lienzo svg {
    position: absolute;
    pointer-events: none;
  }
  .capa {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .panel {
    padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
    background: var(--surface);
    color: var(--text);
    border-radius: 22px 22px 0 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .campos {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .selector {
    display: flex;
    gap: 6px;
  }
  .selector button {
    flex: 1;
    height: 34px;
    border-radius: 10px;
    background: var(--surface-2);
    font-weight: 800;
    color: var(--muted);
  }
  .selector button.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }
  label.activo {
    color: var(--primary-strong);
  }
  input {
    height: 40px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    font-weight: 700;
    color: var(--text);
  }
  label.activo input {
    border-color: var(--primary);
  }
  .acciones {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, #e0405f 16%, var(--surface));
    color: #b0243f;
    font-weight: 700;
    font-size: 13px;
  }
  .error.flotante {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 50%;
  }
</style>
