<script lang="ts">
  import type { Libro } from '../datos';
  import { infoTipo, resolver, textoPosicion } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';
  import Icono from './Icono.svelte';
  import Tienda3D from './Tienda3D.svelte';

  let { libro }: { libro: Libro } = $props();
  const u = $derived(resolver(tienda.datos, libro.ubicacion));
  const terminos = $derived(u ? infoTipo(u.tipo).terminos : undefined);
  const simple = $derived(typeof terminos !== 'object');
</script>

<section class="ubicacion" style:--c={u?.info.color ?? 'var(--surface-2)'} style:--f={u?.info.fuerte ?? 'var(--primary)'}>
  <div class="cabecera">
    <div class="pin"><Icono nombre="pin" tam={22} /></div>
    {#if u}
      <div class="texto">
        <span class="donde">Está en</span>
        <strong class="grande">{u.info.titulo.toUpperCase()}</strong>
        <span class="repisa">{textoPosicion(u)}</span>
        {#if typeof terminos === 'object'}
          <small class="nota">{terminos[1].toLowerCase()} contada desde arriba</small>
        {/if}
        {#if u.info.tema}<span class="nombre">{u.info.tema}</span>{/if}
      </div>
      {#if !simple}
        <!-- mini estante: qué repisa (contando desde arriba) -->
        <div class="repisas" aria-label={`Repisa ${u.repisa} de ${u.repisas}, contando desde arriba`}>
          {#each Array.from({ length: u.repisas }, (_, i) => i + 1) as n}
            <span class:esta={n === u.repisa}></span>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="texto">
        <span class="donde">Ubicación</span>
        <strong class="medio">Sin asignar</strong>
        <span class="nombre">Ubicación por revisar: ese estante o compartimento ya no existe en «Mi tienda».</span>
      </div>
    {/if}
  </div>
  <Tienda3D ubicacion={u} />
</section>

<style>
  .ubicacion {
    background: color-mix(in srgb, var(--c) 70%, var(--surface));
    border-radius: var(--r-tarjeta);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  :global([data-tema='noche']) .ubicacion {
    background: color-mix(in srgb, var(--f) 22%, var(--surface));
  }
  .cabecera {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pin {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: var(--f);
    color: #fff;
    display: grid;
    place-items: center;
    flex: none;
    animation: saltito 2.4s ease-in-out infinite;
  }
  @keyframes saltito {
    0%,
    70%,
    100% {
      transform: translateY(0);
    }
    80% {
      transform: translateY(-5px);
    }
    90% {
      transform: translateY(0);
    }
  }
  .texto {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .donde {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: color-mix(in srgb, var(--f) 80%, #000);
  }
  :global([data-tema='noche']) .donde {
    color: var(--f);
  }
  .grande {
    font-size: 30px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: 0.02em;
  }
  .medio {
    font-size: 22px;
    font-weight: 800;
  }
  .repisa {
    font-size: 18px;
    font-weight: 800;
  }
  .nota {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
  }
  .nombre {
    font-size: 13px;
    color: var(--muted);
  }
  .repisas {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px;
    border-radius: 8px;
    background: var(--surface);
    border: 2px solid var(--f);
    flex: none;
  }
  .repisas span {
    width: 26px;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--f) 25%, transparent);
  }
  .repisas span.esta {
    background: var(--f);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--f) 30%, transparent);
  }
</style>
