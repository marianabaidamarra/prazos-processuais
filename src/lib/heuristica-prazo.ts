/**
 * Heurística simples para sinalizar que uma movimentação PODE ter gerado um
 * prazo processual, com base em palavras-chave comuns. Não calcula o prazo
 * automaticamente (o número de dias e o tipo variam por ato processual e
 * exigem leitura humana) — apenas marca `prazoSugeridoDetectado = true` para
 * que a movimentação apareça destacada no dashboard para revisão manual.
 */

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
