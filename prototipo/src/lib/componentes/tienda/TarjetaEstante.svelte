<script lang="ts">
  import { fly } from 'svelte/transition';
  import { PALETA, compartimentos, infoTipo, letraDe, tipoDeEstante, type Estante } from '../../tienda/modelo';
  import { tienda } from '../../tienda/tienda.svelte';

  let {
    estante,
    puedeSeparar,
    uniendo,
    onUnir,
    onSeparar,
    onBorrar,
    onCerrar,
  }: {
    estante: Estante;
    puedeSeparar: boolean;
    uniendo: boolean;
    onUnir: () => void;
    onSeparar: () => void;
    onBorrar: () => void;
    onCerrar: () => void;
  } = $props();

  const tipo = $derived(tipoDeEstante(tienda.datos, estante.id));
  const terminos = $derived(tipo ? infoTipo(tipo).terminos : undefined);
  const tramos = $derived(compartimentos(tienda.datos, estante.id));
  const resumen = $derived.by(() => {
    if (typeof terminos !== 'object') return infoTipo(tipo ?? 'caja').nombre;
    const repisas = tramos.reduce((n, t) => n + t.repisas.length, 0);
    return `${tramos.length} ${terminos[0].toLowerCase()}${tramos.length === 1 ? '' : 's'} · ${repisas} ${terminos[1].toLowerCase()}${repisas === 1 ? '' : 's'}`;
  });
  const esLetra = $derived(tipo === 'estanteria');
</script>

<div class="tarjeta-estante vidrio" transition:fly={{ x: 30, duration: 250 }} style:--f={estante.fuerte} style:--c={estante.color}>
  <header>
    {#if esLetra}
      <label class="letra" title="Letra del estante">
        <input
          value={letraDe(estante)}
          maxlength="3"
          onchange={(e) => tienda.asignarLetra(estante.id, e.currentTarget.value)}
          aria-label="Letra del estante"
        />
      </label>
    {/if}
    <div class="titulos">
      <input class="titulo" value={estante.titulo} onchange={(e) => tienda.editarEstante(estante.id, { titulo: e.currentTarget.value || estante.titulo })} aria-label="Nombre" />
      <input class="tema" value={estante.tema} placeholder="¿Qué libros guarda?" onchange={(e) => tienda.editarEstante(estante.id, { tema: e.currentTarget.value })} aria-label="Tema" />
    </div>
    <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
  </header>

  <div class="colores" role="radiogroup" aria-label="Color">
    {#each PALETA as [c, f]}
      <button
        class="color"
        class:activo={estante.color === c}
        style:background={c}
        style:border-color={f}
        onclick={() => tienda.editarEstante(estante.id, { color: c, fuerte: f })}
        aria-label="Color"
        role="radio"
        aria-checked={estante.color === c}
      ></button>
    {/each}
  </div>

  <p class="resumen">{resumen}</p>
  {#if typeof terminos === 'object'}
    <p class="pista">Usa ✂️ <b>Dividir</b> (D) para cambiar el tamaño de los {terminos[0].toLowerCase()}s y {terminos[1].toLowerCase()}s.</p>
  {/if}

  <div class="acciones">
    <button class="btn btn-blanco" class:activo={uniendo} onclick={onUnir}>{uniendo ? 'Haz clic en otro estante…' : '🔗 Unir con…'}</button>
    <button class="btn btn-blanco" onclick={onSeparar} disabled={!puedeSeparar} title="Parte el estante desde la columna que tocaste">✂️ Separar desde aquí</button>
    <button class="btn btn-blanco peligro" onclick={onBorrar}>🗑️ Borrar estante</button>
  </div>
</div>

<style>
  .tarjeta-estante {
    position: absolute;
    top: 70px;
    left: 14px;
    width: 290px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface);
    border-top: 6px solid var(--f);
    z-index: 5;
  }
  header {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .letra input {
    width: 58px;
    height: 58px;
    border-radius: 16px;
    border: none;
    background: var(--f);
    color: #fff;
    font: inherit;
    font-size: 28px;
    font-weight: 800;
    text-align: center;
    text-transform: uppercase;
  }
  .letra input:focus {
    outline: 3px solid color-mix(in srgb, var(--f) 45%, transparent);
  }
  .titulos {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .titulos input {
    font: inherit;
    border: none;
    background: transparent;
    color: var(--text);
    padding: 0;
    min-width: 0;
  }
  .titulo {
    font-weight: 800;
    font-size: 16px;
  }
  .tema {
    font-size: 13px;
    color: var(--muted) !important;
  }
  .titulos input:focus {
    outline: none;
    text-decoration: underline dotted var(--primary);
  }
  .cerrar {
    align-self: flex-start;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-2);
    font-weight: 800;
    font-size: 12px;
  }
  .colores {
    display: flex;
    gap: 6px;
  }
  .color {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid;
  }
  .color.activo {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  p {
    margin: 0;
    font-size: 13px;
  }
  .resumen {
    font-weight: 800;
  }
  .pista {
    color: var(--muted);
    font-size: 12px;
  }
  .acciones {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .acciones .btn {
    justify-content: flex-start;
    font-size: 13px;
  }
  .acciones .btn.activo {
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .acciones .btn:disabled {
    opacity: 0.45;
  }
  .peligro {
    color: #c0392b;
  }
</style>
