// Backend de demostración: corre en el navegador (npm run dev) y en las pruebas automáticas.
// Imita las reglas del backend real (validaciones, roles, límite de intentos). Nada se cifra:
// es solo para ver y probar la interfaz.
import { LIBROS_DEMO } from '../datos';
import { buscarEn } from '../busqueda';
import { calcular, montoDescuento, precioConMargen, redondeoEfectivo } from '../ventas/calculo';
import type { Tienda } from '../tienda/modelo';
import type { Api } from './contrato';
import type {
  CategoriaApi,
  Cliente,
  ClienteEntrada,
  CodigoVinculo,
  EstadoCelulares,
  EstadoRespaldos,
  ResultadoRespaldo,
  Respaldo,
  TipoRespaldo,
  ConsultaReporte,
  Reporte,
  TipoCsv,
  Encargo,
  EncargoEntrada,
  EstadoEncargo,
  FichaCliente,
  Descuento,
  Metodo,
  DatosConfiguracion,
  EstadoInicial,
  Filtros,
  LibroApi,
  LibroEntrada,
  PlantillaApi,
  PlantillasApi,
  ResultadoLinea,
  ResumenInventario,
  ResumenVentas,
  Rol,
  Sugerencia,
  TipoCliente,
  TipoEntrada,
  Usuaria,
  Venta,
  VentaEntrada,
} from './tipos';

const CATEGORIAS_DEMO: CategoriaApi[] = [
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

/** ISBN-13 normalizado (acepta ISBN-10) o null. Igual que `isbn::normalizar` en Rust. */
export function normalizarIsbn(entrada: string): string | null {
  const t = entrada.replace(/[\s\-\u2010-\u2015]/g, '').toUpperCase();
  const c13 = (d: string) => (10 - ([...d].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  if (/^\d{13}$/.test(t)) return c13(t.slice(0, 12)) === Number(t[12]) ? t : null;
  if (/^\d{9}[\dX]$/.test(t)) {
    const s = [...t].reduce((a, c, i) => a + (10 - i) * (c === 'X' ? 10 : Number(c)), 0);
    if (s % 11) return null;
    const doce = `978${t.slice(0, 9)}`;
    return doce + c13(doce);
  }
  return null;
}

/** Una portada de ejemplo (dibujada) para los resultados de la demostración. */
function portadaDemo(titulo: string, color: string) {
  const t = titulo.replace(/&/g, 'y').replace(/</g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="${color}"/><rect x="18" y="18" width="264" height="414" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4"/><text x="150" y="215" font-family="sans-serif" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">${t.slice(0, 18)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Libros conocidos para la búsqueda en línea de la demostración (sin internet). */
const CATALOGO_DEMO: Omit<ResultadoLinea, 'portadaUrl' | 'fuente'>[] = [
  { titulo: 'El Principito', autor: 'Antoine de Saint-Exupéry', editorial: 'Salamandra', anio: 1943, isbn: '9788498381146', espanol: true },
  { titulo: 'El Principito', autor: 'Antoine de Saint-Exupéry', editorial: 'Emecé', anio: 1999, isbn: '9788478884384', espanol: true },
  { titulo: 'The Little Prince', autor: 'Antoine de Saint-Exupéry', editorial: 'Harcourt', anio: 1943, isbn: '9780156012195', espanol: false },
  { titulo: 'La ciudad y los perros', autor: 'Mario Vargas Llosa', editorial: 'Alfaguara', anio: 1963, isbn: null, espanol: true },
  { titulo: 'Conversación en La Catedral', autor: 'Mario Vargas Llosa', editorial: 'Alfaguara', anio: 1969, isbn: null, espanol: true },
  { titulo: 'Los ríos profundos', autor: 'José María Arguedas', editorial: 'Losada', anio: 1958, isbn: null, espanol: true },
  { titulo: 'Padre Rico, Padre Pobre', autor: 'Robert T. Kiyosaki', editorial: 'Debolsillo', anio: 1997, isbn: null, espanol: true },
  { titulo: 'Paco Yunque', autor: 'César Vallejo', editorial: 'Bruño', anio: 1931, isbn: null, espanol: true },
];

/** Datos de ejemplo para la búsqueda por ISBN del modo demostración (sin internet). */
const ISBN_DEMO: Record<string, Omit<Sugerencia, 'isbn' | 'fuente'>> = {
  '9788437604947': {
    titulo: 'Cien años de soledad',
    autor: 'Gabriel García Márquez',
    editorial: 'Cátedra',
    anio: 2007,
    sinopsis: 'La saga de los Buendía en Macondo, donde lo real y lo maravilloso conviven.',
    portadaUrl: null,
  },
  '9780140328721': {
    titulo: 'Fantastic Mr Fox',
    autor: 'Roald Dahl',
    editorial: 'Puffin',
    anio: 1988,
    sinopsis: 'Un zorro astuto burla a tres granjeros malhumorados.',
    portadaUrl: null,
  },
};

interface UsuariaDemo extends Usuaria {
  pin: string;
}
interface Datos {
  configurada: boolean;
  bloqueada: boolean;
  carpeta: string;
  contrasena: string;
  tienda: string;
  usuarias: UsuariaDemo[];
  libros?: (LibroApi & { activo?: boolean })[];
  mapa?: Tienda | null;
  plantillas?: PlantillaApi[];
  defecto?: string | null;
  vendedoresEditan?: boolean;
  ventas?: Venta[];
  tipos?: TipoCliente[];
  tope?: number;
  clientes?: Cliente[];
  qrPago?: string | null;
  encargos?: EncargoDemo[];
  encargoPagos?: { encargoId: number; metodo: Metodo; montoCent: number; fecha: string }[];
  plantillaWhatsapp?: string | null;
  margen?: number;
  respaldoExterno?: string | null;
  respaldoConservar?: number;
  celularesActivo?: boolean;
  celulares?: { id: number; nombre: string; creado: string; ultimoUso: string | null; revocado: boolean }[];
}

type EncargoDemo = Omit<Encargo, 'cliente' | 'telefono' | 'adelantoCent' | 'precioCent' | 'stock' | 'portada' | 'colorTapa' | 'formato' | 'categoria'>;

const PLANTILLA_DEFECTO =
  '¡Hola, {cliente}! 📚 Te escribimos de la librería {tienda}. Ya llegó tu encargo: «{libro}». Te lo tenemos separado para cuando puedas pasar a recogerlo. {saldo}¡Te esperamos! 💕';


const CLAVE = 'demo-libreria';
const SUGERIDA = 'C:\\Users\\Tienda\\Documents\\Librería SIGLO XXI';
const espera = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export class ApiDemo implements Api {
  readonly esDemo = true;
  private d: Datos;
  private sesion: UsuariaDemo | null = null;
  private fallos = new Map<number, { n: number; hasta: number }>();

  constructor() {
    let guardado: Datos | null = null;
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    } catch {
      /* sin almacenamiento */
    }
    this.d = guardado ?? { configurada: false, bloqueada: false, carpeta: '', contrasena: '', tienda: '', usuarias: [] };
    if (!this.d.libros) {
      this.d.libros = structuredClone(LIBROS_DEMO);
      // El Principito con ISBN, para probar la búsqueda por código
      Object.assign(this.d.libros[0], { isbn: '9788498381146', codigo: '9788498381146' });
    }
  }

  private get libros() {
    return (this.d.libros ?? []).filter((l) => l.activo !== false);
  }

  private exigirSesion() {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    return this.sesion;
  }

  private exigirEditar() {
    const u = this.exigirSesion();
    if (u.rol !== 'duena' && !this.d.vendedoresEditan) throw new Error('No tienes permiso para agregar o editar libros (pídeselo a la Dueña)');
    return u;
  }

  /** Copia para entregar: sin costo si quien consulta no es la Dueña. */
  private entregar(l: LibroApi): LibroApi {
    const c = structuredClone(l) as LibroApi & { activo?: boolean };
    delete c.activo;
    if (this.sesion?.rol !== 'duena') c.costoCent = null;
    return c;
  }

  private buscarId(id: number) {
    const l = this.libros.find((x) => x.id === id);
    if (!l) throw new Error('No se encontró ese libro');
    return l;
  }

  private persistir() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(this.d));
    } catch {
      /* sin almacenamiento */
    }
  }

  private publica(u: UsuariaDemo): Usuaria {
    const { pin: _pin, ...resto } = u;
    return structuredClone(resto);
  }

  private estado(): EstadoInicial {
    const base = { carpeta: null, carpetaSugerida: SUGERIDA, tienda: null, usuaria: null, llavero: true };
    if (!this.d.configurada) return { ...base, fase: 'configurar' };
    if (this.d.bloqueada) return { ...base, fase: 'desbloquear', carpeta: this.d.carpeta, tienda: this.d.tienda };
    return {
      ...base,
      fase: this.sesion ? 'sesion' : 'entrar',
      carpeta: this.d.carpeta,
      tienda: this.d.tienda,
      usuaria: this.sesion ? this.publica(this.sesion) : null,
    };
  }

  private validarPin(pin: string) {
    if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 6 números');
  }

  private exigirDuena(accion: string) {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    if (this.sesion.rol !== 'duena') throw new Error(`No tienes permiso para ${accion}`);
  }

  async estadoInicial() {
    await espera(60);
    return this.estado();
  }

  async configurar(x: DatosConfiguracion) {
    await espera(500);
    if (this.d.configurada) throw new Error('La librería ya está configurada');
    if ([...x.contrasena].length < 8) throw new Error('La contraseña maestra debe tener al menos 8 caracteres');
    if (!x.tienda.trim()) throw new Error('Escribe el nombre de la tienda');
    if (!x.nombre.trim()) throw new Error('Escribe un nombre (hasta 40 letras)');
    this.validarPin(x.pin);
    const duena: UsuariaDemo = { id: 1, nombre: x.nombre.trim(), rol: 'duena', avatar: '', preferencias: {}, pin: x.pin };
    // el inventario de ejemplo se conserva (es una demostración)
    this.d = { ...this.d, configurada: true, bloqueada: false, carpeta: x.carpeta, contrasena: x.contrasena, tienda: x.tienda.trim(), usuarias: [duena] };
    this.sesion = duena;
    this.persistir();
    return this.estado();
  }

  async abrirCarpeta(_carpeta: string, contrasena: string) {
    await espera(400);
    if (!this.d.configurada) throw new Error('Esa carpeta no tiene datos de la librería');
    if (contrasena !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.d.bloqueada = false;
    this.persistir();
    return this.estado();
  }

  async desbloquear(contrasena: string) {
    await espera(400);
    if (contrasena !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.d.bloqueada = false;
    this.persistir();
    return this.estado();
  }

  async elegirCarpeta(inicial?: string) {
    return inicial ?? SUGERIDA;
  }

  async usuarias() {
    await espera(60);
    return this.d.usuarias.map((u) => ({ ...this.publica(u), preferencias: {} }));
  }

  async iniciarSesion(id: number, pin: string) {
    await espera(250);
    const f = this.fallos.get(id);
    if (f && f.hasta > Date.now()) throw new Error(`Demasiados intentos. Espera ${Math.ceil((f.hasta - Date.now()) / 1000)} segundos y vuelve a probar.`);
    const u = this.d.usuarias.find((x) => x.id === id);
    if (!u) throw new Error('No se encontró a esa persona');
    if (u.pin !== pin) {
      const n = (f && f.hasta <= Date.now() && f.hasta > 0 ? 0 : (f?.n ?? 0)) + 1;
      this.fallos.set(id, { n, hasta: n >= 5 ? Date.now() + 30_000 : 0 });
      if (n >= 5) throw new Error('Demasiados intentos. Espera 30 segundos y vuelve a probar.');
      throw new Error('PIN incorrecto');
    }
    this.fallos.delete(id);
    this.sesion = u;
    return this.publica(u);
  }

  async cerrarSesion() {
    this.sesion = null;
  }

  async guardarPreferencias(cambios: Record<string, unknown>) {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    Object.assign(this.sesion.preferencias, JSON.parse(JSON.stringify(cambios)));
    this.persistir();
    return structuredClone(this.sesion.preferencias);
  }

  async crearUsuaria(nombre: string, rol: Rol, pin: string) {
    await espera();
    this.exigirDuena('crear cuentas');
    const n = nombre.trim();
    if (!n || [...n].length > 40) throw new Error('Escribe un nombre (hasta 40 letras)');
    this.validarPin(pin);
    if (this.d.usuarias.some((u) => u.nombre.toLowerCase() === n.toLowerCase())) throw new Error(`Ya hay alguien llamado «${n}»`);
    const u: UsuariaDemo = { id: Math.max(0, ...this.d.usuarias.map((x) => x.id)) + 1, nombre: n, rol, avatar: '', preferencias: {}, pin };
    this.d.usuarias.push(u);
    this.persistir();
    return this.publica(u);
  }

  async cambiarPin(id: number, pin: string) {
    await espera();
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    if (this.sesion.id !== id && this.sesion.rol !== 'duena') throw new Error('No tienes permiso para cambiar el PIN de otra persona');
    this.validarPin(pin);
    const u = this.d.usuarias.find((x) => x.id === id);
    if (!u) throw new Error('No se encontró a esa persona');
    u.pin = pin;
    this.persistir();
  }

  // ── inventario ──
  async categorias() {
    this.exigirSesion();
    return structuredClone(CATEGORIAS_DEMO);
  }

  async buscarLibros(consulta: string, f: Filtros = {}) {
    await espera(40);
    this.exigirSesion();
    const acepta = (l: LibroApi) =>
      (!f.categoria || l.categoria === f.categoria) &&
      (!f.soloConStock || l.stock > 0) &&
      (!f.stockBajo || l.stock <= l.stockMinimo) &&
      (!f.sinUbicacion || !l.ubicacion) &&
      (f.precioMin == null || l.precioCent >= f.precioMin) &&
      (f.precioMax == null || l.precioCent <= f.precioMax);
    const limite = Math.min(f.limite ?? 100, 500);
    const t = consulta.trim();
    const isbn = normalizarIsbn(t);
    const porCodigo = this.libros.find((l) => (isbn && l.isbn === isbn) || l.codigo.toLowerCase() === t.toLowerCase());
    if (porCodigo) return [this.entregar(porCodigo)];
    const nombreCat = (c: string) => CATEGORIAS_DEMO.find((x) => x.clave === c)?.nombre ?? '';
    const base = this.libros.filter(acepta);
    const lista = t
      ? buscarEn(base, t, (l) => ({ titulo: l.titulo, resto: `${l.autor} ${l.editorial} ${nombreCat(l.categoria)} ${l.etiquetas.join(' ')}`, stock: l.stock }))
      : [...base].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    return lista.slice(0, limite).map((l) => this.entregar(l));
  }

  async libro(id: number) {
    this.exigirSesion();
    return this.entregar(this.buscarId(id));
  }

  async guardarLibro(entrada: LibroEntrada) {
    await espera(150);
    // copia simple: así se comporta como el backend real, que recibe JSON
    const e: LibroEntrada = JSON.parse(JSON.stringify(entrada));
    const yo = this.exigirEditar();
    const titulo = e.titulo.trim();
    if (!titulo) throw new Error('Escribe el título del libro');
    if (e.precioCent < 0 || (e.costoCent ?? 0) < 0) throw new Error('Los precios no pueden ser negativos');
    if ((e.stock ?? 0) < 0 || (e.stockMinimo ?? 0) < 0) throw new Error('El stock no puede ser negativo');
    if (e.anio != null && (e.anio < 1400 || e.anio > 2100)) throw new Error('Revisa el año de publicación');
    if (!CATEGORIAS_DEMO.some((c) => c.clave === e.categoria)) throw new Error('Elige una categoría');
    if (e.ubicacion && (!e.ubicacion.estante.trim() || e.ubicacion.tramo < 1 || e.ubicacion.repisa < 1))
      throw new Error('Elige el estante, tramo y repisa en la tienda');
    let isbn: string | null = null;
    if (e.isbn?.trim()) {
      isbn = normalizarIsbn(e.isbn);
      if (!isbn) throw new Error('Ese ISBN no es válido. Revisa los números.');
      const otro = this.libros.find((l) => l.isbn === isbn && l.id !== e.id);
      if (otro) throw new Error(`Ya existe un libro con ese ISBN: «${otro.titulo}»`);
    }
    const etiquetas = [...new Map((e.etiquetas ?? []).map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];
    const comun = {
      isbn,
      titulo,
      autor: e.autor.trim(),
      editorial: e.editorial.trim(),
      anio: e.anio ?? null,
      sinopsis: e.sinopsis.trim(),
      categoria: e.categoria,
      precioCent: e.precioCent,
      stockMinimo: e.stockMinimo ?? 1,
      ubicacion: e.ubicacion ?? null,
      etiquetas,
      formato: e.formato ?? 'normal',
      actualizado: new Date().toISOString(),
    };
    let l: LibroApi;
    if (e.id == null) {
      const id = Math.max(0, ...(this.d.libros ?? []).map((x) => x.id)) + 1;
      l = {
        ...comun,
        id,
        codigo: isbn ?? `SXXI-${String(id).padStart(6, '0')}`,
        portada: null,
        colorTapa: e.colorTapa ?? ['#6FA8DC', '#E9B949', '#5DBB8A', '#F27A9B', '#7E57C2'][id % 5],
        costoCent: yo.rol === 'duena' ? (e.costoCent ?? 0) : 0,
        stock: e.stock ?? 0,
      };
      this.d.libros!.push(l);
    } else {
      l = this.buscarId(e.id);
      const costo = yo.rol === 'duena' ? (e.costoCent ?? l.costoCent) : l.costoCent;
      Object.assign(l, comun, { costoCent: costo, codigo: isbn ?? (l.codigo.startsWith('SXXI-') ? l.codigo : `SXXI-${String(l.id).padStart(6, '0')}`) });
      if (e.colorTapa) l.colorTapa = e.colorTapa;
    }
    this.persistir();
    return this.entregar(l);
  }

  async desactivarLibro(id: number) {
    this.exigirDuena('dar de baja libros');
    const l = this.buscarId(id) as LibroApi & { activo?: boolean };
    l.activo = false;
    l.isbn = null;
    this.persistir();
  }

  async ajustarStock(id: number, delta: number, motivo: 'ingreso' | 'ajuste') {
    this.exigirEditar();
    if (!delta) throw new Error('Indica cuántos ejemplares sumar o restar');
    if (motivo !== 'ingreso' && motivo !== 'ajuste') throw new Error('Motivo de ajuste desconocido');
    const l = this.buscarId(id);
    if (l.stock + delta < 0) throw new Error(`Solo hay ${l.stock} en stock: no puede quedar negativo`);
    l.stock += delta;
    this.persistir();
    return this.entregar(l);
  }

  async resumenInventario(): Promise<ResumenInventario> {
    this.exigirSesion();
    const ls = this.libros;
    return {
      contadores: {
        libros: ls.length,
        unidades: ls.reduce((s, l) => s + l.stock, 0),
        sinStock: ls.filter((l) => l.stock === 0).length,
        stockBajo: ls.filter((l) => l.stock > 0 && l.stock <= l.stockMinimo).length,
        sinUbicacion: ls.filter((l) => !l.ubicacion).length,
      },
      stockBajo: ls
        .filter((l) => l.stock <= l.stockMinimo)
        .sort((a, b) => a.stock - b.stock || a.titulo.localeCompare(b.titulo))
        .slice(0, 8)
        .map((l) => this.entregar(l)),
    };
  }

  async consultarIsbn(entrada: string): Promise<Sugerencia> {
    await espera(500);
    const isbn = normalizarIsbn(entrada);
    if (!isbn) throw new Error('Ese ISBN no es válido. Revisa los números.');
    const d = ISBN_DEMO[isbn];
    if (!d) throw new Error('En el modo demostración solo hay datos de ejemplo para algunos ISBN (prueba 9788437604947).');
    return { isbn, ...d, fuente: 'Ejemplo (modo demostración)' };
  }

  async buscarEnLinea(titulo: string, autor: string): Promise<ResultadoLinea[]> {
    await espera(600);
    this.exigirEditar();
    if (titulo.trim().length < 2 && autor.trim().length < 2) throw new Error('Escribe al menos el título o el autor');
    const colores = ['#F27A9B', '#6FA8DC', '#5DBB8A', '#E9B949', '#9B87E0'];
    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = (t: string) => norm(t).split(/\s+/).filter(Boolean);
    const qt = q(titulo);
    const qa = q(autor);
    return CATALOGO_DEMO.filter((c) => qt.every((w) => norm(c.titulo).includes(w)) && qa.every((w) => norm(c.autor).includes(w))).map((c, i) => ({
      ...c,
      portadaUrl: i === 1 ? null : portadaDemo(c.titulo, colores[i % colores.length]), // uno sin portada, para probar ese caso
      fuente: 'Ejemplo (modo demostración)',
    }));
  }

  async portadaDesdeUrl(id: number, url: string) {
    this.exigirEditar();
    const l = this.buscarId(id);
    l.portada = url;
    this.persistir();
    return this.entregar(l);
  }

  async portadaDesdeArchivo(id: number, origen: string) {
    return this.portadaDesdeUrl(id, origen);
  }

  async quitarPortada(id: number) {
    this.exigirEditar();
    const l = this.buscarId(id);
    l.portada = null;
    this.persistir();
    return this.entregar(l);
  }

  elegirImagen(): Promise<string | null> {
    // en el navegador: un selector de archivo y la imagen como dataURL
    return new Promise((resolver) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolver(null);
        const r = new FileReader();
        r.onload = () => resolver(String(r.result));
        r.onerror = () => resolver(null);
        r.readAsDataURL(f);
      };
      input.click();
    });
  }

  urlPortada(archivo: string) {
    return archivo;
  }

  async prepararPortadas() {}

  async permisoVendedoresEditan(valor?: boolean) {
    this.exigirSesion();
    if (valor !== undefined) {
      this.exigirDuena('cambiar los permisos');
      this.d.vendedoresEditan = valor;
      this.persistir();
    }
    return !!this.d.vendedoresEditan;
  }

  // ── tienda ──
  async cargarTienda() {
    this.exigirSesion();
    return this.d.mapa ? structuredClone(this.d.mapa) : null;
  }

  async guardarTienda(t: Tienda) {
    this.exigirDuena('diseñar la tienda');
    this.d.mapa = JSON.parse(JSON.stringify(t));
    this.persistir();
  }

  async plantillas(): Promise<PlantillasApi> {
    this.exigirSesion();
    return { lista: structuredClone(this.d.plantillas ?? []), defecto: this.d.defecto ?? null };
  }

  async guardarPlantilla(nombre: string, t: Tienda) {
    this.exigirDuena('guardar plantillas de la tienda');
    const p: PlantillaApi = { id: `p${Date.now().toString(36)}`, nombre: nombre.trim() || 'Mi plantilla', tienda: JSON.parse(JSON.stringify(t)) };
    this.d.plantillas = [...(this.d.plantillas ?? []), p];
    this.persistir();
    return structuredClone(p);
  }

  async borrarPlantilla(id: string) {
    this.exigirDuena('borrar plantillas');
    this.d.plantillas = (this.d.plantillas ?? []).filter((p) => p.id !== id);
    if (this.d.defecto === id) this.d.defecto = null;
    this.persistir();
  }

  async fijarPlantillaDefecto(id: string | null) {
    this.exigirDuena('cambiar la plantilla por defecto');
    this.d.defecto = id;
    this.persistir();
  }

  // ── ventas ──
  private get tipos() {
    return (this.d.tipos ??= [
      { id: 1, nombre: 'Público', descuentoPct: 0, activo: true },
      { id: 2, nombre: 'Profesor', descuentoPct: 15, activo: true },
      { id: 3, nombre: 'Mayorista', descuentoPct: 25, activo: true },
    ]);
  }

  async registrarVenta(e: VentaEntrada) {
    const yo = this.exigirSesion();
    if (!e.items.length) throw new Error('Agrega al menos un libro a la venta');
    if (e.items.some((i) => i.cantidad <= 0)) throw new Error('La cantidad debe ser al menos 1');
    const tipo = this.tipos.find((t) => t.id === e.tipoClienteId && t.activo);
    if (!tipo) throw new Error('No se encontró ese tipo de cliente');
    const libros = e.items.map((i) => {
      const l = this.libros.find((x) => x.id === i.libroId);
      if (!l) throw new Error('No se encontró uno de los libros');
      return l;
    });
    const lineas = e.items.map((i, k) => ({ precioCent: libros[k].precioCent, cantidad: i.cantidad, descuento: i.descuento }));
    const calc = calcular(lineas, tipo.descuentoPct, e.descuento);
    if (yo.rol !== 'duena') {
      const tope = this.d.tope ?? 10;
      const pasa = (base: number, d?: Descuento | null) => montoDescuento(base, d) * 100 > base * tope;
      const base = calc.lineas.reduce((s, l) => s + l.totalCent, 0);
      if (lineas.some((l) => pasa(l.precioCent * l.cantidad, l.descuento)) || pasa(base, e.descuento))
        throw new Error(`Los descuentos a mano llegan hasta ${tope} % sin la Dueña`);
    }
    const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
    let encargo: EncargoDemo | undefined;
    if (e.encargoId) {
      encargo = (this.d.encargos ?? []).find((x) => x.id === e.encargoId);
      if (!encargo) throw new Error('No se encontró ese encargo');
      if (encargo.estado === 'entregado' || encargo.estado === 'cancelado') throw new Error(`Ese encargo ya está ${encargo.estado}`);
      e = { ...e, clienteId: e.clienteId ?? encargo.clienteId };
    }
    const adelanto = encargo ? this.adelanto(encargo.id) : 0;
    if (adelanto > calc.totalPrevioCent) throw new Error(`El adelanto (${soles(adelanto)}) es mayor que el total de la venta (${soles(calc.totalPrevioCent)})`);
    if (!e.pagos.length && adelanto < calc.totalPrevioCent) throw new Error('Agrega al menos un pago');
    if (e.pagos.some((p) => p.montoCent <= 0)) throw new Error('Cada pago debe ser de más de S/ 0.00');
    const redondeo = redondeoEfectivo(calc.totalPrevioCent, adelanto, e.pagos);
    const total = calc.totalPrevioCent - redondeo;
    const pagado = e.pagos.reduce((s, p) => s + p.montoCent, 0) + adelanto;
    if (pagado < total) throw new Error(`Faltan ${soles(total - pagado)} por cobrar`);
    if (pagado > total) throw new Error(`Los pagos suman ${soles(pagado - total)} más que el total`);
    if (e.pagos.some((p) => p.recibidoCent != null && (p.metodo !== 'efectivo' || p.recibidoCent < p.montoCent)))
      throw new Error('Lo recibido en efectivo no puede ser menos que el monto del pago');
    // el stock se valida antes de tocar nada (en Rust, la transacción se deshace)
    e.items.forEach((i, k) => {
      if (libros[k].stock < i.cantidad) throw new Error(`Solo hay ${libros[k].stock} de «${libros[k].titulo}» en stock: no puede quedar negativo`);
    });
    e.items.forEach((i, k) => (libros[k].stock -= i.cantidad));
    const ventas = (this.d.ventas ??= []);
    const cliente = e.clienteId ? (this.d.clientes ?? []).find((c) => c.id === e.clienteId) : undefined;
    if (e.clienteId && !cliente) throw new Error('No se encontró ese cliente');
    const nombreCliente = e.clienteNombre?.trim() || cliente?.nombre || 'Cliente';
    if ([...nombreCliente].length > 80) throw new Error('El nombre del cliente es demasiado largo (máximo 80 letras)');
    const venta: Venta = {
      id: Math.max(0, ...ventas.map((v) => v.id)) + 1,
      fecha: new Date().toISOString(),
      usuarioId: yo.id,
      vendedora: yo.nombre,
      clienteId: cliente?.id ?? null,
      cliente: nombreCliente,
      tipoNombre: tipo.nombre,
      tipoPct: tipo.descuentoPct,
      subtotalCent: calc.subtotalCent,
      descuentoCent: calc.descuentoCent,
      redondeoCent: redondeo,
      totalCent: total,
      anulada: false,
      anuladaFecha: null,
      motivoAnulacion: '',
      encargoId: encargo?.id ?? null,
      adelantoCent: adelanto,
      items: e.items.map((i, k) => ({
        libroId: i.libroId,
        titulo: libros[k].titulo,
        cantidad: i.cantidad,
        precioUnitCent: libros[k].precioCent,
        descuentoCent: calc.lineas[k].descuentoCent,
        totalCent: calc.lineas[k].totalCent,
      })),
      pagos: e.pagos.map((p) =>
        p.metodo === 'efectivo'
          ? { metodo: p.metodo, montoCent: p.montoCent, recibidoCent: p.recibidoCent ?? p.montoCent, vueltoCent: (p.recibidoCent ?? p.montoCent) - p.montoCent }
          : { metodo: p.metodo, montoCent: p.montoCent, recibidoCent: null, vueltoCent: null },
      ),
    };
    ventas.push(venta);
    if (encargo) Object.assign(encargo, { estado: 'entregado', ventaId: venta.id, fechaCierre: venta.fecha, actualizado: venta.fecha });
    this.persistir();
    return structuredClone(venta);
  }

  async anularVenta(id: number, motivo: string) {
    this.exigirDuena('anular ventas');
    if (!motivo.trim()) throw new Error('Escribe el motivo de la anulación');
    const v = (this.d.ventas ?? []).find((x) => x.id === id);
    if (!v) throw new Error('No se encontró esa venta');
    if (v.anulada) throw new Error('Esta venta ya estaba anulada');
    v.anulada = true;
    v.anuladaFecha = new Date().toISOString();
    v.motivoAnulacion = motivo.trim();
    for (const i of v.items) {
      const l = (this.d.libros ?? []).find((x) => x.id === i.libroId);
      if (l) l.stock += i.cantidad;
    }
    const enc = (this.d.encargos ?? []).find((x) => x.ventaId === v.id);
    if (enc) Object.assign(enc, { estado: 'avisado', ventaId: null, fechaCierre: null, actualizado: new Date().toISOString() });
    this.persistir();
    return structuredClone(v);
  }

  async ventas(desde: string, hasta: string) {
    this.exigirSesion();
    return (this.d.ventas ?? [])
      .filter((v) => v.fecha >= desde && v.fecha < hasta)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id))
      .map((v) => structuredClone(v));
  }

  async resumenVentas(desde: string, hasta: string): Promise<ResumenVentas> {
    this.exigirSesion();
    const del = (this.d.ventas ?? []).filter((v) => v.fecha >= desde && v.fecha < hasta);
    const ok = del.filter((v) => !v.anulada);
    const por = new Map<Metodo, number>();
    for (const p of ok.flatMap((v) => v.pagos)) por.set(p.metodo, (por.get(p.metodo) ?? 0) + p.montoCent);
    const adelantos = (this.d.encargoPagos ?? []).filter((p) => p.fecha >= desde && p.fecha < hasta);
    for (const p of adelantos) por.set(p.metodo, (por.get(p.metodo) ?? 0) + p.montoCent);
    for (const [m, v] of por) if (!v) por.delete(m);
    return {
      adelantosCent: adelantos.reduce((s, p) => s + p.montoCent, 0),
      ventas: ok.length,
      anuladas: del.length - ok.length,
      unidades: ok.reduce((s, v) => s + v.items.reduce((n, i) => n + i.cantidad, 0), 0),
      totalCent: ok.reduce((s, v) => s + v.totalCent, 0),
      porMetodo: [...por].sort(([a], [b]) => a.localeCompare(b)).map(([metodo, montoCent]) => ({ metodo, montoCent })),
    };
  }

  async tiposCliente(todos = false) {
    this.exigirSesion();
    return this.tipos.filter((t) => todos || t.activo).map((t) => ({ ...t }));
  }

  async guardarTipoCliente(e: TipoEntrada) {
    this.exigirDuena('cambiar los tipos de cliente');
    const nombre = e.nombre.trim();
    if (!nombre) throw new Error('Escribe el nombre del tipo de cliente');
    if (e.descuentoPct < 0 || e.descuentoPct > 100) throw new Error('El descuento debe estar entre 0 % y 100 %');
    const tipos = this.tipos;
    const antes = structuredClone(tipos);
    if (e.id) {
      const t = tipos.find((x) => x.id === e.id);
      if (!t) throw new Error('No se encontró ese tipo de cliente');
      Object.assign(t, { nombre, descuentoPct: e.descuentoPct, activo: e.activo });
    } else tipos.push({ id: Math.max(0, ...tipos.map((t) => t.id)) + 1, nombre, descuentoPct: e.descuentoPct, activo: e.activo });
    if (!tipos.some((t) => t.activo)) {
      this.d.tipos = antes;
      throw new Error('Debe quedar al menos un tipo de cliente activo');
    }
    this.persistir();
    return this.tipos.map((t) => ({ ...t }));
  }

  async topeDescuento(valor?: number) {
    this.exigirSesion();
    if (valor !== undefined) {
      this.exigirDuena('cambiar el tope de descuento');
      if (valor < 0 || valor > 100) throw new Error('El tope debe estar entre 0 % y 100 %');
      this.d.tope = valor;
      this.persistir();
    }
    return this.d.tope ?? 10;
  }

  async buscarClientes(texto: string) {
    this.exigirSesion();
    const q = texto.trim().toLowerCase();
    return (this.d.clientes ?? [])
      .filter((c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q) || (q.replace(/\D/g, '').length >= 3 && c.telefono.replace(/\D/g, '').includes(q.replace(/\D/g, ''))))
      .slice(-30)
      .reverse();
  }

  async crearCliente(e: ClienteEntrada) {
    return this.guardarCliente({ ...e, id: null });
  }

  async guardarCliente(e: ClienteEntrada) {
    this.exigirSesion();
    return { ...this.guardarClienteSinSesion(e) };
  }

  private guardarClienteSinSesion(e: ClienteEntrada): Cliente {
    const nombre = e.nombre.trim();
    if (!nombre) throw new Error('Escribe el nombre del cliente');
    if ([...nombre].length > 80) throw new Error('El nombre es demasiado largo (máximo 80 letras)');
    const telefono = (e.telefono ?? '').trim();
    const n = telefono.replace(/\D/g, '').length;
    if (telefono && (n < 6 || n > 15)) throw new Error('El teléfono debe tener entre 6 y 15 números');
    const correo = (e.correo ?? '').trim();
    if (correo && !/^[^@\s]+@[^@\s.][^@\s]*\.[^@\s.]+$/.test(correo)) throw new Error('Ese correo no parece válido');
    const cs = (this.d.clientes ??= []);
    const datos = { nombre, telefono, correo, tipoClienteId: e.tipoClienteId ?? null, notas: (e.notas ?? '').trim() };
    let c: Cliente;
    if (e.id) {
      const x = cs.find((k) => k.id === e.id);
      if (!x) throw new Error('No se encontró ese cliente');
      c = Object.assign(x, datos);
    } else {
      c = { id: Math.max(0, ...cs.map((x) => x.id)) + 1, ...datos };
      cs.push(c);
    }
    this.persistir();
    return c;
  }

  async qrPago() {
    this.exigirSesion();
    return this.d.qrPago ?? null;
  }

  async guardarQrPago(origen: string) {
    this.exigirDuena('cambiar el QR de pago');
    if (!origen.startsWith('data:image/')) throw new Error('Ese archivo no es una imagen compatible (PNG, JPG, WebP o GIF)');
    this.d.qrPago = origen;
    this.persistir();
    return origen;
  }

  async quitarQrPago() {
    this.exigirDuena('cambiar el QR de pago');
    this.d.qrPago = null;
    this.persistir();
  }

  // ── encargos ──
  private adelanto(id: number) {
    return (this.d.encargoPagos ?? []).filter((p) => p.encargoId === id).reduce((s, p) => s + p.montoCent, 0);
  }

  private entregarEncargo(e: EncargoDemo): Encargo {
    const c = (this.d.clientes ?? []).find((x) => x.id === e.clienteId);
    const l = e.libroId ? (this.d.libros ?? []).find((x) => x.id === e.libroId) : undefined;
    return structuredClone({
      ...e,
      cliente: c?.nombre ?? 'Cliente',
      telefono: c?.telefono ?? '',
      adelantoCent: this.adelanto(e.id),
      precioCent: l?.precioCent ?? null,
      stock: l?.stock ?? null,
      portada: l?.portada ?? null,
      colorTapa: l?.colorTapa ?? null,
      formato: l?.formato ?? null,
      categoria: l?.categoria ?? null,
    });
  }

  private encargoId(id: number) {
    const e = (this.d.encargos ?? []).find((x) => x.id === id);
    if (!e) throw new Error('No se encontró ese encargo');
    return e;
  }

  async encargos(activos: boolean) {
    this.exigirSesion();
    const cerr = (e: EncargoDemo) => e.estado === 'entregado' || e.estado === 'cancelado';
    const l = (this.d.encargos ?? []).filter((e) => (activos ? !cerr(e) : cerr(e)));
    if (activos) l.sort((a, b) => a.creado.localeCompare(b.creado) || a.id - b.id);
    else l.sort((a, b) => (b.fechaCierre ?? '').localeCompare(a.fechaCierre ?? '') || b.id - a.id);
    return l.slice(0, activos ? undefined : 100).map((e) => this.entregarEncargo(e));
  }

  async crearEncargo(e: EncargoEntrada) {
    const yo = this.exigirSesion();
    const cantidad = e.cantidad ?? 1;
    if (cantidad < 1 || cantidad > 999) throw new Error('La cantidad debe ser al menos 1');
    if (e.adelanto && e.adelanto.montoCent <= 0) throw new Error('El adelanto debe ser de más de S/ 0.00');
    if ((e.costoCent ?? 0) < 0 || (e.precioAcordadoCent ?? 0) < 0) throw new Error('El costo y el precio no pueden ser negativos');
    if (e.portadaUrl && !/^(https?:\/\/|data:image\/)/.test(e.portadaUrl)) throw new Error('Dirección de portada no válida');
    let titulo = e.titulo.trim();
    let autor = (e.autor ?? '').trim();
    if (e.libroId) {
      const l = this.libros.find((x) => x.id === e.libroId);
      if (!l) throw new Error('No se encontró ese libro');
      titulo ||= l.titulo;
      autor ||= l.autor;
    }
    if (!titulo) throw new Error('Escribe qué libro encarga el cliente');
    let clienteId: number;
    if (e.clienteId) {
      if (!(this.d.clientes ?? []).some((c) => c.id === e.clienteId)) throw new Error('No se encontró ese cliente');
      clienteId = e.clienteId;
    } else if (e.cliente) clienteId = this.guardarClienteSinSesion({ ...e.cliente, id: null }).id;
    else throw new Error('Elige o registra al cliente que hace el encargo');
    const es = (this.d.encargos ??= []);
    const ahora = new Date().toISOString();
    const nuevo: EncargoDemo = {
      id: Math.max(0, ...es.map((x) => x.id)) + 1,
      clienteId,
      libroId: e.libroId ?? null,
      titulo,
      autor,
      cantidad,
      estado: 'pendiente',
      notas: (e.notas ?? '').trim(),
      creado: ahora,
      actualizado: ahora,
      fechaPedido: null,
      fechaLlego: null,
      fechaAviso: null,
      fechaCierre: null,
      ventaId: null,
      costoCent: e.costoCent ?? null,
      precioAcordadoCent: e.precioAcordadoCent ?? (e.costoCent != null ? precioConMargen(e.costoCent, this.d.margen ?? 30) : null),
      portadaUrl: e.libroId ? null : (e.portadaUrl ?? null),
    };
    es.push(nuevo);
    if (e.adelanto) (this.d.encargoPagos ??= []).push({ encargoId: nuevo.id, metodo: e.adelanto.metodo, montoCent: e.adelanto.montoCent, fecha: ahora });
    void yo;
    this.persistir();
    return this.entregarEncargo(nuevo);
  }

  async estadoEncargo(id: number, nuevo: EstadoEncargo, devolverAdelanto = false) {
    this.exigirSesion();
    if (nuevo === 'entregado') throw new Error('Para entregar un encargo, usa «Vender y entregar»');
    const e = this.encargoId(id);
    if (e.estado === 'entregado' || e.estado === 'cancelado') throw new Error(`Ese encargo ya está ${e.estado}`);
    const ahora = new Date().toISOString();
    e.estado = nuevo;
    e.actualizado = ahora;
    if (nuevo === 'pedido') e.fechaPedido = ahora;
    if (nuevo === 'llego') e.fechaLlego = ahora;
    if (nuevo === 'avisado') e.fechaAviso = ahora;
    if (nuevo === 'cancelado') {
      e.fechaCierre = ahora;
      if (devolverAdelanto) {
        const por = new Map<Metodo, number>();
        for (const p of (this.d.encargoPagos ?? []).filter((p) => p.encargoId === id)) por.set(p.metodo, (por.get(p.metodo) ?? 0) + p.montoCent);
        for (const [metodo, monto] of por) if (monto > 0) this.d.encargoPagos!.push({ encargoId: id, metodo, montoCent: -monto, fecha: ahora });
      }
    }
    this.persistir();
    return this.entregarEncargo(e);
  }

  async enlazarLibroEncargo(id: number, libroId: number) {
    this.exigirSesion();
    const e = this.encargoId(id);
    if (e.estado === 'entregado' || e.estado === 'cancelado') throw new Error('Ese encargo ya no está activo');
    const l = this.libros.find((x) => x.id === libroId);
    if (!l) throw new Error('No se encontró ese libro');
    Object.assign(e, { libroId, titulo: l.titulo, autor: l.autor || e.autor, actualizado: new Date().toISOString() });
    this.persistir();
    return this.entregarEncargo(e);
  }

  private porLibro(libroId: number, estados: EstadoEncargo[]) {
    this.exigirSesion();
    return (this.d.encargos ?? []).filter((e) => e.libroId === libroId && estados.includes(e.estado)).map((e) => this.entregarEncargo(e));
  }
  async encargosEsperando(libroId: number) {
    return this.porLibro(libroId, ['pendiente', 'pedido']);
  }
  async encargosApartados(libroId: number) {
    return this.porLibro(libroId, ['llego', 'avisado']);
  }

  async encargosCoincidencias(titulo: string) {
    this.exigirSesion();
    const clave = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const b = clave(titulo);
    if (b.length < 3) return [];
    return (this.d.encargos ?? [])
      .filter((e) => !e.libroId && e.estado !== 'entregado' && e.estado !== 'cancelado')
      .filter((e) => {
        const k = clave(e.titulo);
        return k === b || (k.length >= 5 && b.includes(k)) || (b.length >= 5 && k.includes(b));
      })
      .map((e) => this.entregarEncargo(e));
  }

  async fichaCliente(id: number): Promise<FichaCliente> {
    this.exigirSesion();
    const cliente = (this.d.clientes ?? []).find((c) => c.id === id);
    if (!cliente) throw new Error('No se encontró ese cliente');
    const compras = (this.d.ventas ?? [])
      .filter((v) => v.clienteId === id && !v.anulada)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((v) => ({ ventaId: v.id, fecha: v.fecha, totalCent: v.totalCent, libros: v.items.map((i) => (i.cantidad > 1 ? `${i.cantidad}× ` : '') + i.titulo).join(', ') }));
    const encargos = (this.d.encargos ?? [])
      .filter((e) => e.clienteId === id)
      .sort((a, b) => b.creado.localeCompare(a.creado))
      .map((e) => ({ id: e.id, titulo: e.titulo, estado: e.estado, creado: e.creado }));
    return { cliente: { ...cliente }, compras, encargos, totalCompradoCent: compras.reduce((s, c) => s + c.totalCent, 0) };
  }

  async plantillaWhatsapp(texto?: string) {
    this.exigirSesion();
    if (texto !== undefined) {
      this.exigirDuena('cambiar el mensaje de WhatsApp');
      if ([...texto].length > 1000) throw new Error('El mensaje es demasiado largo (máximo 1000 letras)');
      this.d.plantillaWhatsapp = texto.trim() || null;
      this.persistir();
    }
    return this.d.plantillaWhatsapp || PLANTILLA_DEFECTO;
  }

  async avisarWhatsapp(id: number) {
    this.exigirSesion();
    const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
    let e = this.entregarEncargo(this.encargoId(id));
    const base = e.precioAcordadoCent ?? e.precioCent;
    const total = base != null ? base * e.cantidad - e.adelantoCent : null;
    const saldo =
      total != null && total > 0 ? `Saldo a pagar: ${soles(total)}. ` : total != null && e.adelantoCent > 0 ? 'Ya está pagado por completo. ' : e.adelantoCent > 0 ? `Ya dejaste ${soles(e.adelantoCent)} de adelanto. ` : '';
    const texto = (await this.plantillaWhatsapp())
      .replaceAll('{cliente}', e.cliente.split(/\s+/)[0] ?? e.cliente)
      .replaceAll('{libro}', e.titulo)
      .replaceAll('{tienda}', this.d.tienda || 'SIGLO XXI')
      .replaceAll('{saldo}', saldo);
    let num = e.telefono.replace(/\D/g, '');
    if (num.length === 9 && num.startsWith('9')) num = `51${num}`;
    if (num.length < 8) throw new Error('Este cliente no tiene un teléfono válido para WhatsApp: agrégalo en su ficha');
    const url = `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
    if (e.estado === 'llego') e = await this.estadoEncargo(id, 'avisado');
    window.open(url, '_blank', 'noopener');
    return { encargo: e, url };
  }

  async margenEncargos(valor?: number) {
    this.exigirSesion();
    if (valor !== undefined) {
      this.exigirDuena('cambiar el margen de ganancia');
      if (valor < 0 || valor > 500) throw new Error('El margen debe estar entre 0 % y 500 %');
      this.d.margen = valor;
      this.persistir();
    }
    return this.d.margen ?? 30;
  }

  // ── reportes (el cálculo real vive en Rust; esto es una versión sencilla para ver la interfaz) ──
  private ventasDe(c: ConsultaReporte) {
    return (this.d.ventas ?? []).filter((v) => v.fecha >= c.desde && v.fecha < c.hasta);
  }

  async reporte(c: ConsultaReporte): Promise<Reporte> {
    const yo = this.exigirSesion();
    if (yo.rol !== 'duena') throw new Error('No tienes permiso para ver los reportes');
    if (c.desde >= c.hasta) throw new Error('El período no es válido: «desde» debe ser antes que «hasta»');
    const todas = this.ventasDe(c);
    const ok = todas.filter((v) => !v.anulada);
    const local = (iso: string) => new Date(new Date(iso).getTime() + c.tzMin * 60000).toISOString();
    const clave = (iso: string) => local(iso).slice(0, c.agrupar === 'dia' ? 10 : 7);
    const costoDe = (libroId: number) => (this.d.libros ?? []).find((l) => l.id === libroId)?.costoCent ?? 0;
    const costoVenta = (v: Venta) => v.items.reduce((s, i) => s + costoDe(i.libroId) * i.cantidad, 0);
    // serie con los períodos vacíos en cero
    const claves: string[] = [];
    for (let t = new Date(c.desde).getTime(); t < new Date(c.hasta).getTime() + 86_400_000; t += 86_400_000) {
      const k = clave(new Date(t).toISOString());
      if (!claves.includes(k) && local(new Date(t).toISOString()) < local(c.hasta) ) claves.push(k);
    }
    const serie = claves.sort().map((k) => {
      const vs = ok.filter((v) => clave(v.fecha) === k);
      const total = vs.reduce((s, v) => s + v.totalCent, 0);
      return { etiqueta: k, ventas: vs.length, unidades: vs.reduce((s, v) => s + v.items.reduce((n, i) => n + i.cantidad, 0), 0), totalCent: total, gananciaCent: total - vs.reduce((s, v) => s + costoVenta(v), 0) };
    });
    const total = ok.reduce((s, v) => s + v.totalCent, 0);
    const resumen = await this.resumenVentas(c.desde, c.hasta);
    const porLibro = new Map<number, { titulo: string; unidades: number; totalCent: number; costo: number }>();
    for (const v of ok) for (const i of v.items) {
      const x = porLibro.get(i.libroId) ?? { titulo: i.titulo, unidades: 0, totalCent: 0, costo: 0 };
      x.unidades += i.cantidad;
      x.totalCent += i.totalCent;
      x.costo += costoDe(i.libroId) * i.cantidad;
      porLibro.set(i.libroId, x);
    }
    const masVendidos = [...porLibro].map(([libroId, x]) => ({ libroId, titulo: x.titulo, unidades: x.unidades, totalCent: x.totalCent, gananciaCent: x.totalCent - x.costo })).sort((a, b) => b.unidades - a.unidades || b.totalCent - a.totalCent).slice(0, 10);
    const porCat = new Map<string, { unidades: number; totalCent: number }>();
    for (const v of ok) for (const i of v.items) {
      const k = (this.d.libros ?? []).find((l) => l.id === i.libroId)?.categoria ?? 'otros';
      const x = porCat.get(k) ?? { unidades: 0, totalCent: 0 };
      x.unidades += i.cantidad;
      x.totalCent += i.totalCent;
      porCat.set(k, x);
    }
    const categorias = [...porCat].map(([k, x]) => ({ clave: k, nombre: CATEGORIAS_DEMO.find((q) => q.clave === k)?.nombre ?? k, color: CATEGORIAS_DEMO.find((q) => q.clave === k)?.color ?? '#eee', ...x })).sort((a, b) => b.totalCent - a.totalCent);
    const agrupar = (f: (v: Venta) => string) => {
      const m = new Map<string, { ventas: number; totalCent: number }>();
      for (const v of ok) {
        const x = m.get(f(v)) ?? { ventas: 0, totalCent: 0 };
        x.ventas++;
        x.totalCent += v.totalCent;
        m.set(f(v), x);
      }
      return [...m].map(([nombre, x]) => ({ nombre, ...x })).sort((a, b) => b.totalCent - a.totalCent);
    };
    const corte = new Date(new Date(c.ahora).getTime() - c.diasSinMov * 86_400_000).toISOString();
    const ultimaVenta = (id: number) => (this.d.ventas ?? []).filter((v) => !v.anulada && v.items.some((i) => i.libroId === id)).map((v) => v.fecha).sort().at(-1) ?? '';
    const sin = this.libros
      .filter((l) => l.stock > 0)
      .map((l) => ({ l, ref: [ultimaVenta(l.id), l.actualizado].sort().at(-1)! }))
      .filter((x) => x.ref < corte)
      .sort((a, b) => (a.ref < b.ref ? -1 : 1));
    return {
      totales: {
        ventas: ok.length,
        anuladas: todas.length - ok.length,
        unidades: ok.reduce((s, v) => s + v.items.reduce((n, i) => n + i.cantidad, 0), 0),
        totalCent: total,
        gananciaCent: total - ok.reduce((s, v) => s + costoVenta(v), 0),
        descuentosCent: ok.reduce((s, v) => s + v.descuentoCent, 0),
        redondeoCent: ok.reduce((s, v) => s + v.redondeoCent, 0),
        ticketPromedioCent: ok.length ? Math.floor(total / ok.length) : 0,
        adelantosCent: resumen.adelantosCent,
      },
      serie,
      caja: resumen.porMetodo,
      masVendidos,
      categorias,
      porTipo: agrupar((v) => v.tipoNombre),
      porVendedora: agrupar((v) => v.vendedora),
      sinMovimiento: sin.slice(0, 50).map(({ l, ref }) => ({ libroId: l.id, titulo: l.titulo, autor: l.autor, categoria: CATEGORIAS_DEMO.find((q) => q.clave === l.categoria)?.nombre ?? l.categoria, stock: l.stock, costoCent: l.costoCent ?? 0, precioCent: l.precioCent, dias: Math.floor((new Date(c.ahora).getTime() - new Date(ref).getTime()) / 86_400_000) })),
      sinMovimientoTotal: sin.length,
      inmovilizadoCent: sin.reduce((s, x) => s + x.l.stock * (x.l.costoCent ?? 0), 0),
    };
  }

  async exportarReporte(tipo: TipoCsv, c: ConsultaReporte, nombreSugerido: string) {
    const r = await this.reporte(c);
    const campo = (t: string) => {
      const v = /^[=+\-@]/.test(t) ? `'${t}` : t;
      return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
    };
    const s = (n: number) => (n / 100).toFixed(2);
    const filas: string[][] =
      tipo === 'ventas'
        ? [['Venta', 'Fecha', 'Estado', 'Vendedora', 'Cliente', 'Libro', 'Cantidad', 'Total del ítem', 'Total de la venta'], ...this.ventasDe(c).flatMap((v) => v.items.map((i) => [String(v.id), v.fecha, v.anulada ? 'Anulada' : 'Vigente', v.vendedora, v.cliente, i.titulo, String(i.cantidad), s(i.totalCent), s(v.totalCent)]))]
        : tipo === 'mas_vendidos'
          ? [['Posición', 'Libro', 'Unidades', 'Vendido', 'Ganancia estimada'], ...r.masVendidos.map((l, k) => [String(k + 1), l.titulo, String(l.unidades), s(l.totalCent), s(l.gananciaCent)])]
          : tipo === 'sin_movimiento'
            ? [['Libro', 'Autor', 'Categoría', 'Stock', 'Costo unitario', 'Precio', 'Días sin movimiento'], ...r.sinMovimiento.map((l) => [l.titulo, l.autor, l.categoria, String(l.stock), s(l.costoCent), s(l.precioCent), String(l.dias)])]
            : [['Método de pago', 'Monto cobrado'], ...r.caja.map((p) => [p.metodo, s(p.montoCent)])];
    const csv = '\uFEFF' + filas.map((f) => f.map(campo).join(',')).join('\r\n') + '\r\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nombreSugerido;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return nombreSugerido;
  }

  // ── respaldos (en la demostración son copias de los datos guardadas en el navegador) ──
  private copias(): { archivo: string; fecha: string; tipo: TipoRespaldo; datos: string }[] {
    try {
      return JSON.parse(localStorage.getItem('demo-respaldos') ?? '[]');
    } catch {
      return [];
    }
  }

  private guardarCopias(c: ReturnType<ApiDemo['copias']>) {
    try {
      localStorage.setItem('demo-respaldos', JSON.stringify(c));
    } catch {
      throw new Error('No hay espacio en el navegador para otro respaldo de demostración');
    }
  }

  private tomarCopia(tipo: TipoRespaldo): Respaldo {
    const fecha = new Date().toISOString();
    const archivo = `respaldo-${fecha.replace(/[-:]/g, '').slice(0, 15)}Z-${tipo}.zip`;
    const datos = JSON.stringify(this.d);
    const todas = [...this.copias(), { archivo, fecha, tipo, datos }];
    // retención: los últimos 14 automáticos; manuales y de seguridad se quedan
    const autos = todas.filter((x) => x.tipo === 'auto').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(14);
    this.guardarCopias(todas.filter((x) => !autos.includes(x)).slice(-12));
    return { archivo, ruta: archivo, bytes: datos.length, fecha, tipo };
  }

  async estadoRespaldos(): Promise<EstadoRespaldos> {
    this.exigirDuena('ver los respaldos');
    const interno = this.copias().map(({ archivo, fecha, tipo, datos }) => ({ archivo, ruta: archivo, bytes: datos.length, fecha, tipo })).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const externo = this.d.respaldoExterno ?? null;
    return {
      configuracion: { externo, conservar: this.d.respaldoConservar ?? 14, ultimoAuto: interno.find((r) => r.tipo === 'auto')?.fecha ?? null },
      externoDisponible: !!externo,
      carpetaInterna: 'Respaldos (demostración)',
      interno,
      externo: externo ? interno : [],
    };
  }

  async configurarRespaldos(externo: string | null, conservar: number) {
    this.exigirDuena('cambiar los respaldos');
    if (conservar < 3 || conservar > 60) throw new Error('Conservar entre 3 y 60 respaldos');
    this.d.respaldoExterno = externo;
    this.d.respaldoConservar = conservar;
    this.persistir();
    return this.estadoRespaldos();
  }

  async crearRespaldo(destino?: string | null): Promise<ResultadoRespaldo> {
    this.exigirDuena('hacer respaldos');
    await espera(300);
    void destino;
    return { respaldo: this.tomarCopia('manual'), aviso: null };
  }

  async mostrarRespaldos() {
    throw new Error('En la demostración los respaldos viven en el navegador');
  }

  async elegirRespaldo() {
    return this.copias().sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.archivo ?? null;
  }

  async restaurarRespaldo(zip: string, contrasena: string) {
    this.exigirDuena('restaurar un respaldo');
    await espera(500);
    const c = this.copias().find((x) => x.archivo === zip);
    if (!c) throw new Error('No se pudo abrir ese archivo');
    const datos = JSON.parse(c.datos) as Datos;
    if (contrasena !== datos.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.tomarCopia('seguridad');
    this.d = datos;
    this.sesion = null;
    this.persistir();
    return this.estado();
  }

  async restaurarNuevo(zip: string, _carpeta: string, contrasena: string) {
    await espera(500);
    const c = this.copias().find((x) => x.archivo === zip);
    if (!c) throw new Error('No se pudo abrir ese archivo');
    const datos = JSON.parse(c.datos) as Datos;
    if (contrasena !== datos.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.d = datos;
    this.sesion = null;
    this.persistir();
    return this.estado();
  }

  async cambiarContrasena(actual: string, nueva: string) {
    this.exigirDuena('cambiar la contraseña maestra');
    await espera(500);
    if (actual !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    if ([...nueva].length < 8) throw new Error('La contraseña nueva debe tener al menos 8 caracteres');
    this.tomarCopia('seguridad');
    this.d.contrasena = nueva;
    this.persistir();
    return true;
  }

  async recuperarPin(id: number, contrasena: string, pinNuevo: string) {
    await espera(400);
    if (contrasena !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    const u = this.d.usuarias.find((x) => x.id === id);
    if (!u) throw new Error('No se encontró a esa persona');
    if (u.rol !== 'duena') throw new Error('Restablecer ese PIN con la contraseña maestra: se lo cambia la Dueña');
    this.validarPin(pinNuevo);
    u.pin = pinNuevo;
    this.fallos.delete(id);
    this.persistir();
  }

  // ── celulares (simulado: en la demostración no hay servidor) ──
  async estadoCelulares(): Promise<EstadoCelulares> {
    this.exigirDuena('conectar celulares');
    const activo = !!this.d.celularesActivo;
    return { activo, corriendo: activo, puerto: activo ? 47321 : null, direcciones: ['192.168.1.34'], dispositivos: [...(this.d.celulares ?? [])].sort((a, b) => Number(a.revocado) - Number(b.revocado) || b.id - a.id) };
  }

  async activarCelulares(activo: boolean) {
    this.exigirDuena('conectar celulares');
    this.d.celularesActivo = activo;
    this.persistir();
    return this.estadoCelulares();
  }

  async codigoCelular(): Promise<CodigoVinculo> {
    this.exigirDuena('conectar celulares');
    if (!this.d.celularesActivo) throw new Error('Primero enciende «Conectar celulares»');
    const codigo = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    // un «QR» de mentira (cuadritos) solo para ver cómo queda la pantalla
    let celdas = '';
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if ((x * 7 + y * 13 + codigo.charCodeAt((x + y) % 8)) % 3 === 0) celdas += `<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`;
    return { codigo, segundos: 300, texto: `siglo://vincular?h=192.168.1.34&p=47321&c=${codigo}&f=demo&n=${encodeURIComponent(this.d.tienda || 'SIGLO XXI')}`, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges"><rect width="25" height="25" fill="#fff"/><g fill="#000">${celdas}</g></svg>` };
  }

  async desconectarCelular(id: number) {
    this.exigirDuena('conectar celulares');
    const c = (this.d.celulares ?? []).find((x) => x.id === id);
    if (!c || c.revocado) throw new Error('No se encontró ese celular');
    c.revocado = true;
    this.persistir();
    return this.estadoCelulares();
  }
}
