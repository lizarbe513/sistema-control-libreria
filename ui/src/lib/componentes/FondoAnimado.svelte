<script lang="ts">
  import { onMount } from 'svelte';
  import { app, fondoEfectivo } from '../estado.svelte';
  import { Motor, registrarMotor } from '../fondo/motor';

  let fondo: HTMLCanvasElement;
  let capa: HTMLCanvasElement;
  let m: Motor | null = $state(null);

  onMount(() => {
    const motor = new Motor(fondo, capa);
    registrarMotor(motor);
    m = motor;
    const alRedimensionar = () => motor.redimensionar();
    window.addEventListener('resize', alRedimensionar);
    return () => {
      window.removeEventListener('resize', alRedimensionar);
      registrarMotor(null);
      motor.destruir();
    };
  });

  // Re-sincroniza al cambiar de fondo, la calidad o la radio.
  $effect(() => {
    fondoEfectivo();
    void app.calma.rendimiento;
    void app.radio.sonando;
    void app.calma.petalosRadio;
    void app.enfoque;
    m?.sincronizar();
  });
</script>

<canvas bind:this={fondo} class="fondo" aria-hidden="true"></canvas>
<canvas bind:this={capa} class="capa" aria-hidden="true"></canvas>

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    display: block;
  }
  .fondo {
    z-index: 0;
    transition: opacity 0.6s ease;
  }
  /* Pétalos de la radio: por encima de todo, sin bloquear clics */
  .capa {
    z-index: 50;
    pointer-events: none;
  }
</style>
