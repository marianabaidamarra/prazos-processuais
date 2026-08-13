/**
 * Heurística simples para sinalizar que uma movimentação PODE ter gerado um
 * prazo processual, com base em palavras-chave comuns. Não calcula o prazo
 * automaticamente (o número de dias e o tipo variam por ato processual e
 * exigem leitura humana) — apenas marca `prazoSugeridoDetectado = true` para
 * que a movimentação apareça destacada no dashboard para revisão manual.
 *
 * Esta versão por regex funciona bem em cima de texto livre (ex: narrativa de
 * webhook do Escavador, lançamento manual). Movimentações vindas do DataJud
 * usam nomes curtos e padronizados da Tabela Processual Unificada (TPU) — para
 * essas, use `detectarPossivelPrazoPorCodigoTpu` abaixo, que consulta o código
 * numérico do movimento em vez de tentar casar regex contra o nome oficial.
 */

import { consultarCodigoTPU, codigoPodeSerGatilhoDePrazo, codigoIndicaFalhaDeComunicacao } from "./tpu-codigos";

const PALAVRAS_CHAVE_PRAZO: Array<{ termo: RegExp; tipoSugerido: string }> = [
  { termo: /intima[çc][ãa]o|intimad[oa]/i, tipoSugerido: "outro" },
  { termo: /cita[çc][ãa]o|citad[oa]/i, tipoSugerido: "contestacao" },
  { termo: /contesta[çc][ãa]o/i, tipoSugerido: "contestacao" },
  { termo: /apela[çc][ãa]o/i, tipoSugerido: "recurso" },
  { termo: /recurso (de|ordin[áa]rio|especial|extraordin[áa]rio)/i, tipoSugerido: "recurso" },
  { termo: /embargos de declara[çc][ãa]o/i, tipoSugerido: "embargos" },
  { termo: /embargos [àa] execu[çc][ãa]o/i, tipoSugerido: "embargos" },
  { termo: /manifesta[çc][ãa]o/i, tipoSugerido: "manifestacao" },
  { termo: /impugna[çc][ãa]o/i, tipoSugerido: "manifestacao" },
  { termo: /r[ée]plica/i, tipoSugerido: "manifestacao" },
  { termo: /prazo de \d+ dias/i, tipoSugerido: "outro" },
  { termo: /audi[êe]ncia designada/i, tipoSugerido: "outro" },
];

export function detectarPossivelPrazo(conteudo: string): {
  detectado: boolean;
  tipoSugerido?: string;
} {
  for (const { termo, tipoSugerido } of PALAVRAS_CHAVE_PRAZO) {
    if (termo.test(conteudo)) {
      return { detectado: true, tipoSugerido };
    }
  }
  return { detectado: false };
}

/**
 * Classifica uma movimentação do DataJud pelo código da TPU. Trata explicitamente três casos:
 * - `bloqueado`: falha de comunicação (ex: código 14961) — NUNCA deve disparar contagem de prazo,
 *   mesmo que o texto pareça relacionado a intimação.
 * - `conferenciaCruzada`: resultado de auditoria (ex: código 1051, Decurso de Prazo) — é uma
 *   conferência de que um prazo JÁ passou, não um gatilho de novo prazo.
 * - `detectado`: as demais categorias de gatilho (`gatilho_provavel`, `gatilho_possivel`,
 *   `possivel_gatilho_secundario`) — candidato a novo prazo, ainda exige revisão manual.
 *
 * Códigos fora da tabela catalogada (`tpu-codigos-referencia.json`) retornam tudo `false`, mas
 * o chamador (cron do DataJud) deve logar esses códigos para irmos expandindo a tabela com
 * dados reais em produção, em vez de tentar prever todos de antemão.
 */
export function detectarPossivelPrazoPorCodigoTpu(codigo: number | string): {
  detectado: boolean;
  bloqueado: boolean;
  conferenciaCruzada: boolean;
  categoriaConhecida: boolean;
  categoria: string;
  nomeConhecido?: string;
} {
  const entrada = consultarCodigoTPU(codigo);
  const bloqueado = codigoIndicaFalhaDeComunicacao(codigo);
  const conferenciaCruzada = entrada?.categoria_prazo === "resultado_auditoria";
  return {
    detectado: !bloqueado && !conferenciaCruzada && codigoPodeSerGatilhoDePrazo(codigo),
    bloqueado,
    conferenciaCruzada,
    categoriaConhecida: entrada !== undefined,
    categoria: entrada?.categoria_prazo ?? "",
    nomeConhecido: entrada?.nome,
  };
}
