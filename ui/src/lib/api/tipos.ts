// Tipos compartidos con el backend (Rust → JSON).

export type Rol = 'duena' | 'vendedor';

export interface Usuaria {
  id: number;
  nombre: string;
  rol: Rol;
  avatar: string;
  preferencias: Record<string, unknown>;
}

export type Fase = 'configurar' | 'desbloquear' | 'entrar' | 'sesion';

export interface EstadoInicial {
  fase: Fase;
  carpeta: string | null;
  carpetaSugerida: string;
  tienda: string | null;
  usuaria: Usuaria | null;
  /** false si el equipo no tiene llavero: pedirá la contraseña maestra al abrir. */
  llavero: boolean;
}

export interface DatosConfiguracion {
  carpeta: string;
  contrasena: string;
  tienda: string;
  nombre: string;
  pin: string;
}

// ───── Hito 2: inventario, búsqueda y tienda ─────
import type { Tienda } from '../tienda/modelo';

export type Formato = 'normal' | 'grueso' | 'infantil' | 'delgado';

export interface UbicacionApi {
  estante: string;
  tramo: number;
  repisa: number;
}

/** Libro tal como lo entrega el backend (montos en céntimos). */
export interface LibroApi {
  id: number;
  isbn: string | null;
  codigo: string;
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  sinopsis: string;
  /** Archivo en portadas/ (Tauri) o URL (demo). */
  portada: string | null;
  colorTapa: string;
  formato: Formato;
  categoria: string;
  precioCent: number;
  /** null si quien consulta no ve costos. */
  costoCent: number | null;
  stock: number;
  stockMinimo: number;
  ubicacion: UbicacionApi | null;
  etiquetas: string[];
  actualizado: string;
}

export interface LibroEntrada {
  id?: number | null;
  isbn?: string | null;
  titulo: string;
  autor: string;
  editorial: string;
  anio?: number | null;
  sinopsis: string;
  categoria: string;
  precioCent: number;
  costoCent?: number | null;
  stock?: number;
  stockMinimo?: number;
  ubicacion?: UbicacionApi | null;
  etiquetas?: string[];
  colorTapa?: string | null;
  formato?: Formato | null;
}

export interface CategoriaApi {
  clave: string;
  nombre: string;
  color: string;
  patron: string;
}

export interface Filtros {
  categoria?: string | null;
  soloConStock?: boolean;
  stockBajo?: boolean;
  sinUbicacion?: boolean;
  precioMin?: number | null;
  precioMax?: number | null;
  limite?: number;
}

export interface Sugerencia {
  isbn: string;
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  sinopsis: string;
  portadaUrl: string | null;
  fuente: string;
}

export interface Contadores {
  libros: number;
  unidades: number;
  sinStock: number;
  stockBajo: number;
  sinUbicacion: number;
}

export interface ResumenInventario {
  contadores: Contadores;
  stockBajo: LibroApi[];
}

export interface PlantillaApi {
  id: string;
  nombre: string;
  tienda: Tienda;
}

export interface PlantillasApi {
  lista: PlantillaApi[];
  /** null = la incluida «SIGLO XXI (croquis)». */
  defecto: string | null;
}
