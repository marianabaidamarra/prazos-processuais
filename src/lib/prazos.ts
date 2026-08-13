import { ehDiaUtilForense, estaNoRecessoForense } from "./feriados";

function addDias(data: Date, dias: number): Date {
  const d = new Date(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

/** Normaliza para meia-noite UTC, evitando problemas de fuso na contagem de dias. */
export function normalizarData(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
}

const FORMATADOR_DIA_SAO_PAULO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Retorna o dia civil atual em America/Sao_Paulo (Brasília), normalizado para meia-noite UTC —
 * mesma representação usada em todo o resto do sistema para "datas puras" (sem hora).
 *
 * IMPORTANTE: nunca derivar "hoje" a partir de getUTCFullYear/Month/Date de `new Date()`
 * diretamente (ex: `normalizarData(new Date())`) — isso reflete o dia civil em UTC, não em
 * Brasília. Entre 21h e 23h59 de Brasília (horário de verão à parte, Brasília é sempre UTC-3),
 * o dia UTC já virou o seguinte, fazendo um prazo aparecer como VENCIDO horas antes de vencer
 * de fato. Esta função existe para ser o único ponto de conversão "agora" → "hoje" do sistema.
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): Date {
  const partes = FORMATADOR_DIA_SAO_PAULO.formatToParts(agora);
  const mapa: Record<string, string> = {};
  for (const parte of partes) {
    if (parte.type !== "literal") mapa[parte.type] = parte.value;
  }
  return new Date(Date.UTC(Number(mapa.year), Number(mapa.month) - 1, Number(mapa.day)));
}

function proximoDiaUtilOuIgual(data: Date, feriadosExtras: Set<string>): Date {
  let cursor = data;
  while (!ehDiaUtilForense(cursor, feriadosExtras)) {
    cursor = addDias(cursor, 1);
  }
  return cursor;
}

export interface OpcoesCalculoPrazo {
  dataIntimacao: Date;
  diasPrazo: number;
  /** true = conta apenas dias úteis (padrão em processo eletrônico, CPC art. 219). */
  contagemEmDiasUteis?: boolean;
  /** feriados locais/estaduais adicionais no formato "YYYY-MM-DD", vindos do cadastro manual. */
  feriadosExtras?: Set<string>;
}

/**
 * Calcula a data final de um prazo processual conforme as regras gerais do CPC:
 *  - art. 224: exclui o dia do começo, inclui o dia do vencimento;
 *  - art. 219: em processo eletrônico, conta-se somente em dias úteis;
 *  - art. 220: suspende a contagem durante o recesso forense (20/dez a 20/jan);
 *  - se a intimação ocorrer durante o recesso, considera-se feita no primeiro
 *    dia útil seguinte ao fim do recesso.
 *
 * ATENÇÃO: cobre feriados nacionais e o recesso forense nacional. Feriados
 * estaduais/municipais do tribunal específico devem ser cadastrados em
 * `feriadosExtras` (tabela Feriado) para maior precisão. SEMPRE confira
 * prazos críticos manualmente — esta é uma ferramenta de apoio, não substitui
 * a conferência profissional.
 */
export function calcularDataFinalPrazo(opcoes: OpcoesCalculoPrazo): Date {
  const {
    dataIntimacao,
    diasPrazo,
    contagemEmDiasUteis = true,
    feriadosExtras = new Set<string>(),
  } = opcoes;

  let base = normalizarData(dataIntimacao);

  // Se a intimação ocorreu durante o recesso forense, considera-se feita no
  // primeiro dia útil seguinte (CPC art. 220, §2º).
  if (estaNoRecessoForense(base)) {
    base = proximoDiaUtilOuIgual(base, feriadosExtras);
  }

  if (contagemEmDiasUteis) {
    let cursor = addDias(base, 1); // exclui o dia do começo (art. 224)
    let diasContados = 0;
    // salvaguarda contra loop infinito em caso de configuração inválida
    let iteracoes = 0;
    const maxIteracoes = (diasPrazo + 1) * 20 + 400;

    while (diasContados < diasPrazo) {
      if (ehDiaUtilForense(cursor, feriadosExtras)) {
        diasContados++;
        if (diasContados === diasPrazo) break;
      }
      cursor = addDias(cursor, 1);
      iteracoes++;
      if (iteracoes > maxIteracoes) {
        throw new Error("Falha ao calcular prazo: número de iterações excedido.");
      }
    }
    return cursor;
  }

  // Contagem em dias corridos (ex.: prazos de natureza material/civil, não processual).
  let cursor = addDias(base, diasPrazo);
  cursor = proximoDiaUtilOuIgual(cursor, feriadosExtras);
  return cursor;
}

export type UrgenciaPrazo = "vencido" | "hoje" | "critico" | "atencao" | "tranquilo";

/**
 * Classifica a urgência de um prazo a partir de hoje, para colorir o dashboard.
 *  - vencido: data final já passou e não foi cumprido
 *  - hoje: vence hoje
 *  - critico: vence em até 2 dias
 *  - atencao: vence em até 7 dias
 *  - tranquilo: mais de 7 dias
 */
export function classificarUrgencia(dataFinal: Date, hoje: Date = hojeEmSaoPaulo()): UrgenciaPrazo {
  const hojeNorm = normalizarData(hoje);
  const finalNorm = normalizarData(dataFinal);
  const diffDias = Math.round((finalNorm.getTime() - hojeNorm.getTime()) / 86_400_000);

  if (diffDias < 0) return "vencido";
  if (diffDias === 0) return "hoje";
  if (diffDias <= 2) return "critico";
  if (diffDias <= 7) return "atencao";
  return "tranquilo";
}
