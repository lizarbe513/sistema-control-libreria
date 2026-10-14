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

/** Un libro encontrado en internet por título o autor. */
export interface ResultadoLinea {
  titulo: string;
  autor: string;
  editorial: string;
  anio: number | null;
  isbn: string | null;
  portadaUrl: string | null;
  espanol: boolean;
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

// ── ventas ──
export type Descuento = { tipo: 'pct' | 'monto'; valor: number };
export type Metodo = 'efectivo' | 'tarjeta' | 'yape_plin' | 'transferencia';

export interface ItemEntrada {
  libroId: number;
  cantidad: number;
  descuento?: Descuento | null;
}
export interface PagoEntrada {
  metodo: Metodo;
  /** Lo que aporta al total (en efectivo, sin contar el vuelto). */
  montoCent: number;
  /** Solo efectivo: lo que entregó el cliente. */
  recibidoCent?: number | null;
}
export interface VentaEntrada {
  items: ItemEntrada[];
  tipoClienteId: number;
  clienteId?: number | null;
  descuento?: Descuento | null;
  pagos: PagoEntrada[];
}
export interface ItemVenta {
  libroId: number;
  titulo: string;
  cantidad: number;
  precioUnitCent: number;
  descuentoCent: number;
  totalCent: number;
}
export interface PagoVenta {
  metodo: Metodo;
  montoCent: number;
  recibidoCent: number | null;
  vueltoCent: number | null;
}
export interface Venta {
  id: number;
  /** Instante ISO en UTC. */
  fecha: string;
  usuarioId: number;
  vendedora: string;
  clienteId: number | null;
  cliente: string | null;
  tipoNombre: string;
  tipoPct: number;
  subtotalCent: number;
  descuentoCent: number;
  redondeoCent: number;
  totalCent: number;
  anulada: boolean;
  anuladaFecha: string | null;
  motivoAnulacion: string;
  items: ItemVenta[];
  pagos: PagoVenta[];
}
export interface TipoCliente {
  id: number;
  nombre: string;
  descuentoPct: number;
  activo: boolean;
}
export interface TipoEntrada {
  id?: number | null;
  nombre: string;
  descuentoPct: number;
  activo: boolean;
}
export interface ResumenVentas {
  ventas: number;
  anuladas: number;
  unidades: number;
  totalCent: number;
  porMetodo: { metodo: Metodo; montoCent: number }[];
}
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  tipoClienteId: number | null;
}
export interface ClienteEntrada {
  nombre: string;
  telefono?: string;
  tipoClienteId?: number | null;
}
