import tpuCodigosRaw from "./data/tpu-codigos-referencia.json";

/**
 * Referência de códigos de movimento da Tabela Processual Unificada (TPU) do
 * CNJ, catalogados a partir de amostragem real via API pública do DataJud
 * (~240 processos de 9 tribunais: TJSP, TRF3, TJRJ, TRT2, STJ, TST, TRF1,
 * TJMG, TRT15) — NÃO é a tabela oficial completa (que tem milhares de
 * entradas cobrindo todas as áreas). Ponto de partida validado, não
 * definitivo. Levantamento feito em 11/08 durante a fase de pesquisa do
 * monitoramento automático via DataJud (ainda não implementado — ver
 * `src/lib/escavador.ts` para o estado do monitoramento dormente).
 *
 * Quando o `datajud.ts` for implementado, todo código que aparecer numa
 * movimentação real e NÃO estiver aqui deve ser logado (não descartado
 * silenciosamente), para ir expandindo esta tabela com dados reais dos
 * processos monitorados ao longo do tempo, em vez de tentar prever tudo de
 * antemão.
 *
 * ATENÇÃO especial ao código 1061 (Disponibilização no DJe): antes de usar a
 * data desse evento diretamente como `dataIntimacao` de um Prazo, confirmar
 * com uma leitura fresca da Lei 11.419/2006 art. 4º c/c CPC art. 224 §§2º-4º
 * se a contagem tem 1 ou 2 saltos de dia útil entre a disponibilização e o
 * início efetivo do prazo — isso ainda não foi confirmado com certeza e é
 * exatamente o tipo de erro de "1 dia útil" que este sistema existe para
 * evitar.
 */

export type CategoriaPrazoTPU =
  | "gatilho_provavel"
  | "gatilho_possivel"
  | "possivel_gatilho_secundario"
  | "preparatorio"
  | "sinal_negativo"
  | "resultado_auditoria"
  | "citacao_especifica"
  | ""; // maioria dos códigos comuns (recursos, decisões de mérito, distribuição etc.) — não relevantes p/ disparo de prazo

export interface CodigoTPU {
  codigo: string;
  nome: string;
  categoria_prazo: CategoriaPrazoTPU;
  observacao: string;
}

export const TPU_CODIGOS: CodigoTPU[] = tpuCodigosRaw as CodigoTPU[];

const TPU_POR_CODIGO = new Map<string, CodigoTPU>(TPU_CODIGOS.map((c) => [c.codigo, c]));

/** Consulta um código de movimento da TPU pela referência catalogada. */
export function consultarCodigoTPU(codigo: string | number): CodigoTPU | undefined {
  return TPU_POR_CODIGO.get(String(codigo));
}

/**
 * Categorias que indicam que a movimentação PODE ter disparado um prazo e
 * merece virar um `prazoSugeridoDetectado = true` (revisão manual) quando o
 * monitoramento automático via DataJud for implementado. Não inclui
 * `sinal_negativo` (comunicação falhou) nem `resultado_auditoria` (já é
 * resultado, não gatilho) de propósito.
 */
const CATEGORIAS_GATILHO = new Set<CategoriaPrazoTPU>([
  "gatilho_provavel",
  "gatilho_possivel",
  "possivel_gatilho_secundario",
]);

export function codigoPodeSerGatilhoDePrazo(codigo: string | number): boolean {
  const entrada = consultarCodigoTPU(codigo);
  return entrada ? CATEGORIAS_GATILHO.has(entrada.categoria_prazo) : false;
}

/** true quando o código indica que uma tentativa de comunicação/intimação falhou. */
export function codigoIndicaFalhaDeComunicacao(codigo: string | number): boolean {
  return consultarCodigoTPU(codigo)?.categoria_prazo === "sinal_negativo";
}
