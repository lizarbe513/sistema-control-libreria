// Períodos de los reportes: se eligen en días locales y viajan como instantes UTC [desde, hasta).
import type { Agrupar, ConsultaReporte } from '../api';

export type Preset = 'hoy' | 'ayer' | 'semana' | 'mes' | '30dias' | 'anio' | 'personalizado';

export const PRESETS: { id: Preset; nombre: string }[] = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'ayer', nombre: 'Ayer' },
  { id: 'semana', nombre: 'Esta semana' },
  { id: 'mes', nombre: 'Este mes' },
  { id: '30dias', nombre: 'Últimos 30 días' },
  { id: 'anio', nombre: 'Este año' },
  { id: 'personalizado', nombre: 'Elegir fechas…' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const aDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deDia = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Primer y último día (inclusive) del preset, en días locales «aaaa-mm-dd». */
export function diasDe(p: Preset, ahora = new Date()): [string, string] {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  switch (p) {
    case 'ayer':
      return [aDia(sumarDias(hoy, -1)), aDia(sumarDias(hoy, -1))];
    case 'semana': {
      const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7));
      return [aDia(lunes), aDia(sumarDias(lunes, 6))];
    }
    case 'mes':
      return [aDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), aDia(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))];
    case '30dias':
      return [aDia(sumarDias(hoy, -29)), aDia(hoy)];
    case 'anio':
      return [aDia(new Date(hoy.getFullYear(), 0, 1)), aDia(new Date(hoy.getFullYear(), 11, 31))];
    default:
      return [aDia(hoy), aDia(hoy)];
  }
}

/** Por día, salvo períodos largos (un año): por mes. */
export function agruparPara(desde: string, hasta: string): Agrupar {
  const dias = (deDia(hasta).getTime() - deDia(desde).getTime()) / 86_400_000 + 1;
  return dias > 92 ? 'mes' : 'dia';
}

export function consulta(desde: string, hasta: string, diasSinMov: number, ahora = new Date()): ConsultaReporte {
  return {
    desde: deDia(desde).toISOString(),
    hasta: sumarDias(deDia(hasta), 1).toISOString(),
    tzMin: -ahora.getTimezoneOffset(),
    agrupar: agruparPara(desde, hasta),
    diasSinMov,
    ahora: ahora.toISOString(),
  };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** «14 oct» o «oct 2026», para el eje del gráfico. */
export function etiquetaCorta(e: string): string {
  const [y, m, d] = e.split('-').map(Number);
  return d ? `${d} ${MESES[m - 1]}` : `${MESES[m - 1]} ${y}`;
}

export function etiquetaLarga(e: string): string {
  const [y, m, d] = e.split('-').map(Number);
  return d ? `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} ${MESES[m - 1]} ${y}` : `${MESES[m - 1]} ${y}`;
}
