// Acción de Svelte: mueve el elemento a <body>. Sirve para ventanas modales dentro de tarjetas con `backdrop-filter`,
// que convierte en «contenedor» a los elementos `position: fixed` y los deja recortados a la tarjeta.
export function portal(nodo: HTMLElement) {
  document.body.appendChild(nodo);
  return { destroy: () => nodo.remove() };
}
