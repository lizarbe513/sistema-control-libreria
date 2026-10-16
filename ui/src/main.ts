import { mount } from 'svelte';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './app.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;

// En la versión instalada no hay menú del navegador (Atrás, Recargar, Inspeccionar); en los campos de texto se conserva para copiar y pegar.
if (import.meta.env.PROD) {
  addEventListener('contextmenu', (e) => {
    if (!(e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]'))) e.preventDefault();
  });
}
