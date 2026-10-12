<script lang="ts">
  import { estantePorId, type Libro } from '../datos';
  import Icono from './Icono.svelte';
  import MapaTienda from './MapaTienda.svelte';

  let { libro }: { libro: Libro } = $props();
  const estante = $derived(estantePorId(libro.estante));
</script>

<section class="ubicacion" style:--c={estante.color} style:--f={estante.fuerte}>
  <div class="cabecera">
    <div class="pin"><Icono nombre="pin" tam={22} /></div>
    <div class="texto">
      <span class="donde">Está en</span>
      <strong class="grande">ESTANTE {estante.id}</strong>
      <span class="repisa">Repisa {libro.repisa} <small>de {estante.repisas}, desde arriba</small></span>
      <span class="nombre">{estante.nombre}</span>
    </div>
    <!-- mini estante: qué repisa (contando desde arriba) -->
    <div class="repisas" aria-label={`Repisa ${libro.repisa} de ${estante.repisas}, contando desde arriba`}>
      {#each Array.from({ length: estante.repisas }, (_, i) => i + 1) as n}
        <span class:esta={n === libro.repisa}></span>
      {/each}
    </div>
  </div>
  <MapaTienda estanteId={estante.id} />
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
  .repisa {
    font-size: 18px;
    font-weight: 800;
  }
  .repisa small {
    font-size: 12px;
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
