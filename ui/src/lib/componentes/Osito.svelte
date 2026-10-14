<script lang="ts">
  // El Osito de la librería: lleva un moño al cuello y una bolsa de papel con dos libros, y camina hacia la derecha.
  // `mono`: dibujo de una sola tinta (toma el color del texto) para los papelitos de venta.
  let { mono = false, camina = true, tam = 160 }: { mono?: boolean; camina?: boolean; tam?: number } = $props();
</script>

<svg class="osito" class:mono class:camina width={tam} height={tam * 1.1} viewBox="0 0 200 220" role="img" aria-label="Osito con una bolsa de libros">
  <g class="todo">
    <!-- patas -->
    <g class="pata a"><rect x="76" y="148" width="24" height="42" rx="12" /><ellipse cx="92" cy="192" rx="17" ry="8" class="pie" /></g>
    <g class="pata b"><rect x="106" y="148" width="24" height="42" rx="12" /><ellipse cx="124" cy="192" rx="17" ry="8" class="pie" /></g>
    <!-- cuerpo -->
    <ellipse cx="102" cy="126" rx="42" ry="44" class="cuerpo" />
    <ellipse cx="108" cy="134" rx="25" ry="30" class="panza" />
    <!-- cabeza -->
    <circle cx="86" cy="42" r="14" class="cuerpo" /><circle cx="86" cy="43" r="7" class="oreja" />
    <circle cx="132" cy="42" r="14" class="cuerpo" /><circle cx="132" cy="43" r="7" class="oreja" />
    <circle cx="109" cy="72" r="38" class="cuerpo" />
    <ellipse cx="130" cy="82" rx="17" ry="13" class="panza" />
    <ellipse cx="141" cy="76" rx="6" ry="4.5" class="nariz" />
    <circle cx="120" cy="64" r="4" class="ojo" /><circle cx="121.3" cy="62.7" r="1.3" class="brillo" />
    <circle cx="103" cy="82" r="6" class="mejilla" />
    <path d="M130 88 q6 6 13 -1" class="boca" />
    <!-- moño -->
    <g class="mono-moño">
      <path d="M104 111 L84 100 L84 122 Z" class="moño" /><path d="M104 111 L126 100 L126 122 Z" class="moño" /><circle cx="105" cy="111" r="6" class="nudo" />
    </g>
    <!-- bolsa de papel con dos libros -->
    <g class="bolsa">
      <g class="libros">
        <rect x="127" y="92" width="14" height="40" rx="2" class="libro l1" transform="rotate(-9 134 132)" />
        <rect x="143" y="86" width="14" height="46" rx="2" class="libro l2" transform="rotate(7 150 132)" />
        <path d="M130 100 h8 M146 96 h8" class="lomo" />
      </g>
      <path d="M118 120 L172 120 L168 180 L122 180 Z" class="papel" />
      <path d="M118 120 L172 120 L170 130 L120 130 Z" class="borde-bolsa" />
      <path d="M145 130 L145 180" class="pliegue" />
      <path d="M135 126 q10 -12 20 0" class="asa" />
    </g>
    <!-- brazo que sostiene la bolsa -->
    <ellipse cx="124" cy="138" rx="17" ry="10" class="cuerpo brazo" transform="rotate(-18 124 138)" />
  </g>
</svg>

<style>
  .osito {
    --cuerpo: #c99a6b;
    --oscuro: #8a5a32;
    --panza: #f1dcb9;
    --papel: #deb97f;
    --asa: #b98a4f;
    --moño: #f27a9b;
    --nudo: #e0537a;
    --libro1: #6fa8dc;
    --libro2: #f2c14e;
    overflow: visible;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .osito :global(*) {
    stroke: var(--oscuro);
    stroke-width: 2.4;
  }
  .cuerpo {
    fill: var(--cuerpo);
  }
  .pata rect,
  .pie {
    fill: var(--cuerpo);
  }
  .panza {
    fill: var(--panza);
  }
  .oreja,
  .mejilla {
    fill: #f6b5c4;
    stroke: none;
  }
  .nariz,
  .ojo {
    fill: #4a2f1d;
  }
  .brillo {
    fill: #fff;
    stroke: none;
  }
  .boca {
    fill: none;
  }
  .moño,
  .nudo {
    fill: var(--moño);
  }
  .nudo {
    fill: var(--nudo);
  }
  .papel {
    fill: var(--papel);
  }
  .borde-bolsa {
    fill: var(--asa);
  }
  .pliegue,
  .asa,
  .lomo {
    fill: none;
  }
  .l1 {
    fill: var(--libro1);
  }
  .l2 {
    fill: var(--libro2);
  }
  .lomo {
    stroke: #fff;
    stroke-width: 2;
    opacity: 0.8;
  }

  /* una sola tinta */
  .mono {
    --cuerpo: transparent;
    --panza: transparent;
    --papel: transparent;
    --asa: transparent;
    --moño: transparent;
    --nudo: currentColor;
    --libro1: transparent;
    --libro2: transparent;
    --oscuro: currentColor;
  }
  .mono .oreja,
  .mono .mejilla,
  .mono .brillo {
    fill: none;
  }
  .mono .lomo {
    stroke: currentColor;
  }
  .mono .nariz,
  .mono .ojo {
    fill: currentColor;
  }

  /* camina hacia la derecha: rebote del cuerpo y patas alternadas */
  .camina .todo {
    animation: rebote 0.7s ease-in-out infinite;
    transform-origin: 100px 190px;
  }
  .camina .pata {
    transform-box: fill-box;
    transform-origin: 50% 8%;
    animation: paso 0.7s ease-in-out infinite;
  }
  .camina .pata.b {
    animation-delay: -0.35s;
  }
  .camina .brazo {
    animation: brazo 0.7s ease-in-out infinite;
  }
  @keyframes rebote {
    0%,
    50%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    25%,
    75% {
      transform: translateY(-5px) rotate(1.5deg);
    }
  }
  @keyframes paso {
    0%,
    100% {
      transform: rotate(-16deg);
    }
    50% {
      transform: rotate(16deg);
    }
  }
  @keyframes brazo {
    50% {
      transform: translateY(-2px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .camina .todo,
    .camina .pata,
    .camina .brazo {
      animation: none;
    }
  }
</style>
