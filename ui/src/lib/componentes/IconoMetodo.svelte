<script lang="ts">
  // Icono de un método de pago: el de Yape es la insignia oficial; los demás, un emoji.
  import type { Metodo } from '../api';
  import yape from '../../assets/yape.png';
  import { METODOS } from '../ventas/carrito.svelte';

  let { metodo, tam = 22 }: { metodo: Metodo; tam?: number } = $props();
</script>

{#if metodo === 'yape_plin'}
  <img class="yape" src={yape} alt="" width={tam} height={tam} />
{:else}
  <span class="emoji" style:font-size="{tam * 0.95}px" aria-hidden="true">{METODOS[metodo].emoji}</span>
{/if}

<style>
  .yape {
    border-radius: 28%;
    vertical-align: middle;
    flex: none;
  }
  .emoji {
    line-height: 1;
    vertical-align: middle;
  }
</style>
