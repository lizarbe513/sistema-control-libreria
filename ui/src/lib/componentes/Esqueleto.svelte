<script lang="ts">
  /** Bloques grises que imitan la estructura de lo que se está cargando. */
  let { n = 4, alto = 64 }: { n?: number; alto?: number } = $props();
</script>

<div class="esqueleto" role="status" aria-label="Cargando">
  {#each { length: n } as _}
    <div class="bloque" style:height="{alto}px" aria-hidden="true"></div>
  {/each}
</div>

<style>
  .esqueleto {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bloque {
    border-radius: var(--r-tarjeta);
    background: linear-gradient(
      100deg,
      var(--surface-glass) 30%,
      color-mix(in srgb, var(--primary-soft) 70%, var(--surface)) 50%,
      var(--surface-glass) 70%
    );
    background-size: 220% 100%;
    animation: brillo 1.4s ease-in-out infinite;
  }
  @keyframes brillo {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }
</style>
