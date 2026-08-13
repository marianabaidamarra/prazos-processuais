/**
 * Cliente para a API pública do DataJud (CNJ).
 * Documentação oficial: https://datajud-wiki.cnj.jus.br/api-publica/
 *
 * IMPORTANTE — defasagem: a API do DataJud NÃO é tempo real. Os índices de cada tribunal são
 * atualizados com defasagem de T+1 a T+7 dias dependendo do tribunal. Isso precisa ficar visível
 * para quem usa o sistema (ver `ultimaVerificacaoDatajud` no model Process e a UI do dashboard) —
 * nunca deve passar a impressão de monitoramento instantâneo.
 *
 * Autenticação: a chave pública documentada pelo CNJ é a mesma para todos (não é uma credencial
 * pessoal) — fica em `DATAJUD_API_KEY` para poder ser trocada sem redeploy de código caso o CNJ
 * rotacione. Se a API responder 401/403, é sinal dessa rotação: o chamador (cron) deve tratar
 * isso como alerta visível (log + e-mail), nunca falhar silenciosamente todo dia sem ninguém notar.
 */

const DATAJUD_BASE_URL = "https://api-publica.datajud.cnj.jus.br";

function getApiKey(): string {
  const key = process.env.DATAJUD_API_KEY;
  if (!key) {
    throw new Error(
      "DATAJUD_API_KEY não configurada. Veja a chave pública documentada em https://datajud-wiki.cnj.jus.br/api-publica/acesso/"
    );
  }
  return key;
}

/**
 * Mapa de segmento de justiça (dígito "J" do número CNJ) + código de tribunal (dígitos "TR")
 * para o slug do endpoint DataJud (`api_publica_<slug>`), construído a partir da Tabela de
 * Órgãos do Poder Judiciário (Resolução CNJ 65/2008). Cobre os segmentos mais comuns no dia a
 * dia de um escritório (Estadual, Federal, Trabalho, Eleitoral) mais STJ.
 *
 * Se um processo cair fora daqui, `resolverEndpointDatajud` lança erro explícito em vez de
 * tentar adivinhar — a tabela deve crescer com casos reais, não com suposições antecipadas.
 */
const TRIBUNAIS_ESTADUAIS: Record<string, string> = {
  "01": "tjac", "02": "tjal", "03": "tjap", "04": "tjam", "05": "tjba",
  "06": "tjce", "07": "tjdft", "08": "tjes", "09": "tjgo", "10": "tjma",
  "11": "tjmt", "12": "tjms", "13": "tjmg", "14": "tjpa", "15": "tjpb",
  "16": "tjpr", "17": "tjpe", "18": "tjpi", "19": "tjrj", "20": "tjrn",
  "21": "tjrs", "22": "tjro", "23": "tjrr", "24": "tjsc", "25": "tjse",
  "26": "tjsp", "27": "tjto",
};

const TRIBUNAIS_FEDERAIS: Record<string, string> = {
  "01": "trf1", "02": "trf2", "03": "trf3", "04": "trf4", "05": "trf5", "06": "trf6",
};

const TRIBUNAIS_TRABALHO: Record<string, string> = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => [String(i + 1).padStart(2, "0"), `trt${i + 1}`])
);

const TRIBUNAIS_ELEITORAIS: Record<string, string> = {
  "01": "tre-ac", "02": "tre-al", "03": "tre-ap", "04": "tre-am", "05": "tre-ba",
  "06": "tre-ce", "07": "tre-df", "08": "tre-es", "09": "tre-go", "10": "tre-ma",
  "11": "tre-mt", "12": "tre-ms", "13": "tre-mg", "14": "tre-pa", "15": "tre-pb",
  "16": "tre-pr", "17": "tre-pe", "18": "tre-pi", "19": "tre-rj", "20": "tre-rn",
  "21": "tre-rs", "22": "tre-ro", "23": "tre-rr", "24": "tre-sc", "25": "tre-se",
  "26": "tre-sp", "27": "tre-to",
};

export interface CnjDecomposto {
  numero: string;
  dv: string;
  ano: string;
  segmento: string;
  tribunal: string;
  orgao: string;
}

/** Decompõe um número CNJ (com ou sem máscara) nos seus componentes oficiais. */
export function decomporNumeroCnj(numeroCnj: string): CnjDecomposto | null {
  const limpo = numeroCnj.replace(/\D/g, "");
  if (limpo.length !== 20) return null;
  return {
    numero: limpo.slice(0, 7),
    dv: limpo.slice(7, 9),
    ano: limpo.slice(9, 13),
    segmento: limpo.slice(13, 14),
    tribunal: limpo.slice(14, 16),
    orgao: limpo.slice(16, 20),
  };
}

/** Resolve a URL do endpoint DataJud para um número CNJ, ou lança erro explícito se não souber mapear. */
export function resolverEndpointDatajud(numeroCnj: string): string {
  const partes = decomporNumeroCnj(numeroCnj);
  if (!partes) {
    throw new Error(`Número CNJ inválido (esperado 20 dígitos): ${numeroCnj}`);
  }

  let slug: string | undefined;
  switch (partes.segmento) {
    case "3":
      slug = "stj";
      break;
    case "4":
      slug = TRIBUNAIS_FEDERAIS[partes.tribunal];
      break;
    case "5":
      slug = TRIBUNAIS_TRABALHO[partes.tribunal];
      break;
    case "6":
      slug = TRIBUNAIS_ELEITORAIS[partes.tribunal];
      break;
    case "8":
      slug = TRIBUNAIS_ESTADUAIS[partes.tribunal];
      break;
    default:
      slug = undefined;
  }

  if (!slug) {
    throw new Error(
      `Não há mapeamento para o segmento/tribunal do processo ${numeroCnj} ` +
        `(segmento=${partes.segmento}, tribunal=${partes.tribunal}). ` +
        `Tabela precisa ser expandida em src/lib/datajud.ts.`
    );
  }
  return `${DATAJUD_BASE_URL}/api_publica_${slug}/_search`;
}

export interface MovimentoDatajud {
  codigo: number | string;
  nome: string;
  dataHora: string;
  complementosTabelados?: unknown[];
}

export interface ResultadoConsultaDatajud {
  ok: boolean;
  movimentos: MovimentoDatajud[];
  erro?: string;
  /** true quando a API rejeitou a chave (401/403) — sinal de possível rotação pelo CNJ. */
  chaveRotacionada?: boolean;
}

/**
 * Consulta o DataJud por número de processo (CNJ) e retorna os movimentos já publicados.
 * Nunca lança — erros de rede, chave rejeitada, ou processo fora da tabela de endpoints
 * voltam como `{ ok: false, erro }` para o chamador decidir como logar/alertar.
 */
export async function consultarProcessoDatajud(numeroCnj: string): Promise<ResultadoConsultaDatajud> {
  let endpoint: string;
  try {
    endpoint = resolverEndpointDatajud(numeroCnj);
  } catch (e) {
    return { ok: false, movimentos: [], erro: e instanceof Error ? e.message : String(e) };
  }

  const numeroLimpo = numeroCnj.replace(/\D/g, "");

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `APIKey ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { match: { numeroProcesso: numeroLimpo } },
      }),
    });
  } catch (e) {
    return {
      ok: false,
      movimentos: [],
      erro: `Falha de rede ao consultar DataJud (${endpoint}): ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      movimentos: [],
      erro: `DataJud recusou a chave de API (status ${res.status}) para ${numeroCnj} — provável rotação de chave pelo CNJ. Veja https://datajud-wiki.cnj.jus.br/api-publica/acesso/ e atualize DATAJUD_API_KEY.`,
      chaveRotacionada: true,
    };
  }
  if (!res.ok) {
    return { ok: false, movimentos: [], erro: `DataJud retornou status ${res.status} para ${numeroCnj} (${endpoint})` };
  }

  const data = await res.json().catch(() => null);
  const hits = data?.hits?.hits ?? [];
  if (hits.length === 0) {
    // Processo ainda não indexado no DataJud (comum para processos muito recentes ou muito
    // antigos) — não é erro, só não há nada para trazer ainda.
    return { ok: true, movimentos: [] };
  }

  const fonte = hits[0]?._source;
  const movimentosBrutos: unknown[] = Array.isArray(fonte?.movimentos) ? fonte.movimentos : [];

  const movimentos: MovimentoDatajud[] = movimentosBrutos
    .map((m) => {
      const mov = m as Record<string, unknown>;
      return {
        codigo: mov?.codigo as number | string,
        nome: mov?.nome as string,
        dataHora: mov?.dataHora as string,
        complementosTabelados: mov?.complementosTabelados as unknown[] | undefined,
      };
    })
    .filter((m) => m.codigo !== undefined && m.dataHora);

  return { ok: true, movimentos };
}
