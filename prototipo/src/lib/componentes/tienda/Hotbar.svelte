<script lang="ts" module>
  export type Modo = 'construir' | 'borrar' | 'seleccionar';
</script>

<script lang="ts">
  import { infoTipo, type TipoBloque } from '../../tienda/modelo';
  import { icono } from '../../tienda/iconos';

  let {
    ranuras = $bindable(),
    elegida = $bindable(),
    modo = $bindable(),
    relleno = $bindable(),
    destello = -1,
    onInventario,
  }: {
    ranuras: (TipoBloque | null)[];
    elegida: number;
    modo: Modo;
    relleno: boolean;
    destello?: number;
    onInventario: () => void;
  } = $props();

  const HERRAMIENTAS: { id: Exclude<Modo, 'construir'>; nombre: string; emoji: string; tecla: string }[] = [
    { id: 'borrar', nombre: 'Borrador', emoji: '🧽', tecla: 'X' },
    { id: 'seleccionar', nombre: 'Seleccionar estante', emoji: '👆', tecla: 'V' },
  ];

  /** Las herramientas son interruptores: volver a pulsar regresa a construir. */
  function alternar(m: Exclude<Modo, 'construir'>) {
    modo = modo === m ? 'construir' : m;
  }

  function vaciar(e: MouseEvent, i: number) {
    e.preventDefault();
    ranuras[i] = null;
  }
</script>

<div class="hotbar" role="toolbar" aria-label="Bloques y herramientas">
  <button class="ranura inv" onclick={onInventario} title="Inventario (E)">
    <span class="emoji">🎒</span>
    <span class="tecla">E</span>
  </button>
  <span class="sep"></span>
  {#each ranuras as tipo, i}
    <button
      class="ranura"
      class:activa={elegida === i && modo === 'construir'}
      class:destello={destello === i}
      onclick={() => {
        elegida = i;
        modo = 'construir';
      }}
      oncontextmenu={(e) => vaciar(e, i)}
      title={tipo ? `${infoTipo(tipo).nombre} (clic derecho: vaciar)` : 'Ranura vacía: abre el inventario (E)'}
    >
      <span class="num">{i + 1}</span>
      {#if tipo}
        {@const url = icono(tipo)}
        {#if url}<img src={url} alt={infoTipo(tipo).nombre} />{:else}<span class="emoji">{infoTipo(tipo).emoji}</span>{/if}
      {/if}
    </button>
  {/each}
  <span class="sep"></span>
  {#each HERRAMIENTAS as h}
    <button class="ranura herramienta" class:activa={modo === h.id} onclick={() => alternar(h.id)} title="{h.nombre} ({h.tecla})" aria-pressed={modo === h.id}>
      <span class="emoji">{h.emoji}</span>
      <span class="tecla">{h.tecla}</span>
    </button>
  {/each}
  <button class="ranura herramienta" class:activa={relleno} onclick={() => (relleno = !relleno)} title="Relleno de punta a punta (F)" aria-pressed={relleno}>
    <span class="emoji">▦</span>
    <span class="tecla">F</span>
  </button>
</div>

<style>
  .hotbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    box-shadow: var(--sombra);
    pointer-events: auto;
  }
  .sep {
    width: 2px;
    height: 40px;
    border-radius: 1px;
    background: var(--linea);
    margin: 0 3px;
  }
  .ranura {
    position: relative;
    width: 50px;
    height: 50px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    border: 2px solid transparent;
    background: var(--surface-2);
    transition:
      transform 0.15s,
      border-color 0.2s,
      background 0.2s;
  }
  .ranura:hover {
    transform: translateY(-2px);
  }
  .ranura.activa {
    border-color: var(--primary);
    background: var(--primary-soft);
    transform: translateY(-4px);
  }
  .ranura.herramienta.activa {
    border-color: #e0607a;
    background: color-mix(in srgb, #e0607a 18%, var(--surface));
  }
  .ranura.destello {
    animation: pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes pop {
    40% {
      transform: translateY(-10px) scale(1.15);
    }
  }
  img {
    width: 42px;
    height: 42px;
    pointer-events: none;
  }
  .num,
  .tecla {
    position: absolute;
    top: 2px;
    left: 6px;
    font-size: 10px;
    font-weight: 800;
    color: var(--muted);
  }
  .tecla {
    left: auto;
    right: 6px;
    top: auto;
    bottom: 2px;
  }
  .emoji {
    font-size: 21px;
    line-height: 1;
  }
  .inv {
    background: color-mix(in srgb, var(--yellow) 70%, var(--surface));
  }
</style>
