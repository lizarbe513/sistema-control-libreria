<script lang="ts">
  import type { Vista } from '../estado.svelte';

  let { vista }: { vista: Vista } = $props();

  const TEXTOS: Partial<Record<Vista, { emoji: string; titulo: string; texto: string }>> = {
    vender: {
      emoji: '🛍️',
      titulo: 'Nueva venta',
      texto: 'Agregar libros (buscando o escaneando), elegir tipo de cliente (Público, Profesor o Mayorista), aplicar descuentos, cobrar con efectivo, tarjeta, Yape/Plin o transferencia, y ver el vuelto. Al terminar: ¡lluvia de corazones! 💕',
    },
    encargos: {
      emoji: '📦',
      titulo: 'Encargos',
      texto: 'Un tablero por estados (pendiente → pedido → llegó → avisado → entregado) con aviso por WhatsApp en un toque. Cuando llega un encargo, aparece como una carta con sello de cera. ✉️',
    },
    reportes: {
      emoji: '📊',
      titulo: 'Reportes',
      texto: 'Ventas por día, semana y mes, libros y categorías más vendidos, cuadre de caja por método de pago y libros sin movimiento.',
    },
    asistente: {
      emoji: '✨',
      titulo: 'Asistente',
      texto: '“Un cliente quiere algo de misterio para un chico de 15 años…”: el asistente recomienda libros de TU inventario, con estante y repisa. Usa Gemini (gratis) con Groq como respaldo.',
    },
  };
  const t = $derived(TEXTOS[vista]);
</script>

{#if t}
  <div class="pendiente" data-vacio>
    <div class="tarjeta caja">
      <span class="emoji">{t.emoji}</span>
      <h2>{t.titulo}</h2>
      <p>{t.texto}</p>
      <span class="nota">Esta pantalla se diseña en detalle en la fase de implementación 🌷</span>
    </div>
  </div>
{/if}

<style>
  .pendiente {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .caja {
    max-width: 520px;
    padding: 32px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    animation: entrar 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes entrar {
    from {
      transform: translateY(16px) scale(0.97);
      opacity: 0;
    }
  }
  .emoji {
    font-size: 54px;
    animation: flotar 3s ease-in-out infinite;
  }
  @keyframes flotar {
    50% {
      transform: translateY(-6px);
    }
  }
  h2 {
    margin: 0;
    font-weight: 800;
  }
  p {
    margin: 0;
    line-height: 1.55;
  }
  .nota {
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
