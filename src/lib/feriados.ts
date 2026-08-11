/**
 * Cálculo de feriados nacionais e datas móveis para uso no cálculo de prazos processuais.
 *
 * IMPORTANTE: cobre feriados NACIONAIS + recesso forense nacional (CPC art. 220).
 * Tribunais estaduais/locais podem ter feriados adicionais (ex: aniversário da
 * cidade-sede, feriados estaduais). Esses devem ser cadastrados manualmente na
 * tabela `Feriado` (campo `abrangencia`) — o cálculo automático NÃO os conhece
 * de antemão. Sempre confira prazos críticos manualmente.
 */

// Algoritmo de Gauss/Meeus para calcular o Domingo de Páscoa (calendário gregoriano).
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Feriados nacionais fixos (dia/mês). Lei 14.759/2023 incluiu 20/11 como feriado nacional. */
const FERIADOS_FIXOS: Array<{ mes: number; dia: number; nome: string }> = [
  { mes: 1, dia: 1, nome: "Confraternização Universal" },
  { mes: 4, dia: 21, nome: "Tiradentes" },
  { mes: 5, dia: 1, nome: "Dia do Trabalho" },
  { mes: 9, dia: 7, nome: "Independência do Brasil" },
  { mes: 10, dia: 12, nome: "Nossa Senhora Aparecida" },
  { mes: 11, dia: 2, nome: "Finados" },
  { mes: 11, dia: 15, nome: "Proclamação da República" },
  { mes: 11, dia: 20, nome: "Dia Nacional de Zumbi e da Consciência Negra" },
  { mes: 12, dia: 25, nome: "Natal" },
];

/** Feriados nacionais forenses adicionais comumente observados no Judiciário (ex: art. 62 da Lei 5.010/66 p/ Justiça Federal varia; aqui mantemos apenas os de abrangência nacional consolidada). */
export function feriadosNacionais(ano: number): Map<string, string> {
  const mapa = new Map<string, string>();

  for (const f of FERIADOS_FIXOS) {
    const d = new Date(Date.UTC(ano, f.mes - 1, f.dia));
    mapa.set(toKey(d), f.nome);
  }

  const pascoa = calcularPascoa(ano);
  const sextaSanta = addDias(pascoa, -2);
  const carnavalSegunda = addDias(pascoa, -48);
  const carnavalTerca = addDias(pascoa, -47);
  const corpusChristi = addDias(pascoa, 60);

  mapa.set(toKey(sextaSanta), "Sexta-feira Santa");
  mapa.set(toKey(carnavalSegunda), "Carnaval (segunda-feira, ponto facultativo forense)");
  mapa.set(toKey(carnavalTerca), "Carnaval (terça-feira, ponto facultativo forense)");
  mapa.set(toKey(corpusChristi), "Corpus Christi (ponto facultativo forense)");

  return mapa;
}

/**
 * Recesso forense nacional: 20/dez a 20/jan (CPC art. 220), com suspensão de prazos
 * (não é bem "feriado" — é dia sem expediente forense em muitos tribunais e período
 * de suspensão de prazos por força de lei em todos).
 */
export function estaNoRecessoForense(data: Date): boolean {
  const mes = data.getUTCMonth() + 1;
  const dia = data.getUTCDate();
  if (mes === 12 && dia >= 20) return true;
  if (mes === 1 && dia <= 20) return true;
  return false;
}

export function ehFimDeSemana(data: Date): boolean {
  const dow = data.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Verifica se uma data é dia útil forense, considerando fins de semana, feriados
 * nacionais e recesso forense (CPC art. 220), além de feriados extras informados
 * (ex: feriados estaduais/municipais cadastrados manualmente no banco).
 */
export function ehDiaUtilForense(
  data: Date,
  feriadosExtras: Set<string> = new Set()
): boolean {
  if (ehFimDeSemana(data)) return false;
  if (estaNoRecessoForense(data)) return false;

  const ano = data.getUTCFullYear();
  const nacionais = feriadosNacionais(ano);
  const key = toKey(data);
  if (nacionais.has(key)) return false;
  if (feriadosExtras.has(key)) return false;

  return true;
}
