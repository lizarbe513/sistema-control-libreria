// Categorías de libros: vienen de la base (la Dueña puede crear más). Este registro reactivo guarda su nombre, color y
// patrón para pintar chips, portadas generadas y filtros. Arranca con las del folleto por si aún no cargó la base.
import type { CategoriaApi } from './api/tipos';
import type { Categoria, Patron } from './datos';

const PATRONES: Patron[] = ['marco', 'rayos', 'confeti', 'dorado', 'cuadricula', 'andino', 'ondas'];

const INICIALES: CategoriaApi[] = [
  { clave: 'literarias', nombre: 'Obras literarias', color: '#E9E3FB', patron: 'marco' },
  { clave: 'diccionarios', nombre: 'Diccionarios', color: '#DDEFFB', patron: 'dorado' },
  { clave: 'biblias', nombre: 'Biblias', color: '#DDEFFB', patron: 'dorado' },
  { clave: 'autoayuda', nombre: 'Autoayuda', color: '#FCEFC7', patron: 'rayos' },
  { clave: 'ninos', nombre: 'Cuentos para niños', color: '#FBD3DE', patron: 'confeti' },
  { clave: 'regionales', nombre: 'Cuentos regionales', color: '#FDE2D0', patron: 'andino' },
  { clave: 'preu', nombre: 'Pre-universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  { clave: 'universitarios', nombre: 'Universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  { clave: 'otros', nombre: 'Otros', color: '#F1ECEE', patron: 'ondas' },
];

const aCategoria = (c: CategoriaApi): Categoria => ({
  id: c.clave,
  nombre: c.nombre,
  color: c.color,
  patron: (PATRONES as string[]).includes(c.patron) ? (c.patron as Patron) : 'ondas',
});

export const CATEGORIAS: Record<string, Categoria> = $state(Object.fromEntries(INICIALES.map((c) => [c.clave, aCategoria(c)])));

/** Reemplaza el registro con las categorías de la base (en su orden). */
export function fijarCategorias(lista: CategoriaApi[]) {
  for (const k of Object.keys(CATEGORIAS)) if (!lista.some((c) => c.clave === k)) delete CATEGORIAS[k];
  for (const c of lista) CATEGORIAS[c.clave] = aCategoria(c);
}

const RESERVA: Categoria = { id: 'otros', nombre: 'Otros', color: '#F1ECEE', patron: 'ondas' };

/** La categoría de una clave (si se borró o no cargó, una neutra para no romper la vista). */
export const cat = (clave: string): Categoria => CATEGORIAS[clave] ?? CATEGORIAS.otros ?? RESERVA;

export const CATEGORIAS_INICIALES = INICIALES;
