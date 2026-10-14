<script lang="ts">
  import { avisar } from '../../estado.svelte';
  import { compartimentos, infoTipo, letraDe, tipoDeEstante } from '../../tienda/modelo';
  import { LIMITES, medidasDe, tienda, type Medidas } from '../../tienda/tienda.svelte';

  let { seleccionado = $bindable(), onNivel }: { seleccionado: string | null; onNivel: (alto: number) => void } = $props();

  let pestana = $state<'estantes' | 'tienda'>('estantes');
  const t = $derived(tienda.datos);

  const resumen = $derived(
    t.estantes.map((e) => {
      const tipo = tipoDeEstante(t, e.id);
      const term = tipo ? infoTipo(tipo).terminos : undefined;
      const tr = compartimentos(t, e.id);
      let detalle = 'vacío: coloca bloques';
      if (tr.length) {
        if (typeof term === 'object') {
          const reps = tr.reduce((n, x) => n + x.repisas.length, 0);
          detalle = `${tr.length} ${term[0].toLowerCase()}s · ${reps} ${term[1].toLowerCase()}s`;
        } else detalle = infoTipo(tipo!).nombre;
      }
      return { ...e, detalle, letra: tipo === 'estanteria' ? letraDe(e) : '' };
    }),
  );

  // medidas (borrador editable; se sincroniza si la tienda cambia, p. ej. al deshacer)
  let medidas = $state<Medidas>(medidasDe(tienda.datos));
  $effect(() => {
    medidas = medidasDe(tienda.datos);
  });

  function limpias(): Medidas {
    const m: Medidas = { ...medidas };
    for (const k of Object.keys(LIMITES) as (keyof Medidas)[]) {
      const [min, max] = LIMITES[k];
      m[k] = Math.max(min, Math.min(max, Math.round(Number(m[k]) || min)));
    }
    return m;
  }

  function aplicarMedidas() {
    const m = limpias();
    const fuera = tienda.fueraCon(m);
    if (fuera && !confirm(`Con estas medidas quedan fuera ${fuera} bloques y se quitarán. ¿Continuar?`)) return;
    tienda.redimensionar(m);
    onNivel(m.alto);
    avisar(`Tienda de ${m.ancho / 2} × ${m.largo / 2} m`);
  }

  function nuevaVacia() {
    const m = limpias();
    if (!confirm(`¿Borrar todo el maquetado y empezar con una base vacía de ${m.ancho / 2} × ${m.largo / 2} m? (Se puede deshacer con Ctrl+Z)`)) return;
    tienda.vaciar(m);
    seleccionado = null;
    onNivel(m.alto);
    avisar('Base vacía lista: ¡a construir! 🧱');
  }

  async function guardarComo() {
    const nombre = prompt('Nombre de la plantilla:', 'Mi tienda');
    if (nombre === null) return;
    try {
      const p = await tienda.guardarPlantilla(nombre);
      avisar(`Plantilla «${p.nombre}» guardada`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  function cargar(id: string, nombre: string) {
    if (!confirm(`¿Cargar «${nombre}»? Reemplaza la tienda actual (se puede deshacer).`)) return;
    tienda.cargarPlantilla(id);
    seleccionado = null;
    onNivel(tienda.datos.alto);
  }

  function borrarPlantilla(id: string, nombre: string) {
    if (confirm(`¿Borrar la plantilla «${nombre}»?`)) tienda.borrarPlantilla(id).catch((e: Error) => avisar(e.message));
  }
</script>

<div class="pestanas" role="tablist">
  <button role="tab" aria-selected={pestana === 'estantes'} class:activa={pestana === 'estantes'} onclick={() => (pestana = 'estantes')}>📚 Estantes</button>
  <button role="tab" aria-selected={pestana === 'tienda'} class:activa={pestana === 'tienda'} onclick={() => (pestana = 'tienda')}>🏪 Tienda</button>
</div>

{#if pestana === 'estantes'}
  <p class="atenuado">Toca uno para elegirlo, o usa 👆 Seleccionar (V) sobre la tienda.</p>
  <ul>
    {#each resumen as e (e.id)}
      <li>
        <button class="fila" class:activo={seleccionado === e.id} onclick={() => (seleccionado = seleccionado === e.id ? null : e.id)} style:--f={e.fuerte} style:--c={e.color}>
          <span class="chip-letra">{e.letra || '·'}</span>
          <span class="textos">
            <strong>{e.titulo}</strong>
            <small>{e.tema || 'sin tema'} · {e.detalle}</small>
          </span>
        </button>
      </li>
    {:else}
      <p class="atenuado">Aún no hay estantes. Pon estanterías, cajas, mesitas o puertas: un relleno crea un estante nuevo.</p>
    {/each}
  </ul>
{:else}
  <section>
    <h3>Medidas <span class="atenuado">{t.ancho / 2} × {t.fachada / 2} m</span></h3>
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
    <div class="botones">
      <button class="btn btn-suave" onclick={aplicarMedidas}>Aplicar medidas</button>
      <button class="btn btn-blanco peligro" onclick={nuevaVacia}>🧹 Nueva tienda vacía</button>
    </div>
  </section>

  <section>
    <h3>Plantillas</h3>
    <button class="btn btn-suave" onclick={guardarComo}>💾 Guardar la actual como plantilla…</button>
    <ul class="plantillas">
      {#each tienda.plantillas as p (p.id)}
        <li>
          <button
            class="estrella"
            class:activa={tienda.plantillaDefecto === p.id}
            onclick={() => tienda.marcarDefecto(p.id).catch((e: Error) => avisar(e.message))}
            title={tienda.plantillaDefecto === p.id ? 'Plantilla por defecto' : 'Marcar como por defecto'}
            aria-label="Por defecto">{tienda.plantillaDefecto === p.id ? '★' : '☆'}</button
          >
          <span class="nombre">{p.nombre}</span>
          <button class="mini" onclick={() => cargar(p.id, p.nombre)}>Cargar</button>
          {#if p.tienda}
            <button class="mini quitar" onclick={() => borrarPlantilla(p.id, p.nombre)} aria-label="Borrar plantilla">✕</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="atenuado">★ = se carga al empezar y con «Restaurar».</p>
    <button class="btn btn-blanco" onclick={() => confirm('¿Volver a la plantilla por defecto?') && (tienda.restaurar(), onNivel(tienda.datos.alto))}>↺ Restaurar plantilla por defecto</button>
  </section>
{/if}

<style>
  .pestanas {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .pestanas button {
    flex: 1;
    padding: 7px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 13px;
  }
  .pestanas button.activa {
    background: var(--surface);
    color: var(--primary-strong);
    box-shadow: var(--sombra-suave);
  }
  p {
    margin: 0;
    font-size: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }
  .fila {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 14px;
    background: var(--surface);
    border: 2px solid transparent;
    text-align: left;
  }
  .fila.activo {
    border-color: var(--f);
  }
  .chip-letra {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--f);
    color: #fff;
    font-weight: 800;
    display: grid;
    place-items: center;
    flex: none;
  }
  .textos {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .textos small {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: var(--surface);
  }
  h3 {
    margin: 0;
    font-size: 15px;
    display: flex;
    justify-content: space-between;
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
  .campos input {
    width: 64px;
    font: inherit;
    font-weight: 800;
    border: 2px solid var(--linea);
    border-radius: 10px;
    padding: 3px 6px;
    background: var(--surface);
    color: var(--text);
  }
  .campos small {
    color: var(--muted);
    font-size: 11px;
  }
  .botones {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .btn {
    font-size: 13px;
  }
  .peligro {
    color: #c0392b;
  }
  .plantillas li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .estrella {
    font-size: 18px;
    color: var(--muted);
  }
  .estrella.activa {
    color: #e9b949;
  }
  .nombre {
    flex: 1;
    font-weight: 700;
    font-size: 13px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--primary-strong);
  }
  .mini.quitar {
    color: var(--muted);
    padding: 4px 8px;
  }
</style>
