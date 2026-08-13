import { describe, it, expect } from "vitest";
import { calcularDataFinalPrazo, classificarUrgencia, hojeEmSaoPaulo } from "./prazos";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe("calcularDataFinalPrazo", () => {
  it("conta 5 dias úteis a partir de uma segunda-feira sem feriados", () => {
    // intimação numa segunda (2026-08-10) -> conta a partir de terça
    const resultado = calcularDataFinalPrazo({
      dataIntimacao: d("2026-08-10"), // segunda-feira
      diasPrazo: 5,
      contagemEmDiasUteis: true,
    });
    // ter,qua,qui,sex,seg(17) = 5 dias úteis
    expect(fmt(resultado)).toBe("2026-08-17");
  });

  it("pula fim de semana na contagem em dias úteis", () => {
    // intimação numa quinta (2026-08-13) + 3 dias úteis -> sex, (pula sáb/dom), seg, ter
    const resultado = calcularDataFinalPrazo({
      dataIntimacao: d("2026-08-13"), // quinta-feira
      diasPrazo: 3,
      contagemEmDiasUteis: true,
    });
    expect(fmt(resultado)).toBe("2026-08-18"); // terça
  });

  it("pula feriado nacional fixo (7 de setembro) na contagem em dias úteis", () => {
    // intimação em 2026-09-04 (sexta), 3 dias úteis: seg 07/set é feriado -> pula
    const resultado = calcularDataFinalPrazo({
      dataIntimacao: d("2026-09-04"), // sexta-feira
      diasPrazo: 3,
      contagemEmDiasUteis: true,
    });
    // seg(07, feriado, pula), ter(08)=1, qua(09)=2, qui(10)=3
    expect(fmt(resultado)).toBe("2026-09-10");
  });

  it("suspende contagem durante o recesso forense (20/dez a 20/jan)", () => {
    // intimação em 2026-12-15 (terça), 10 dias úteis -> deve pular todo o recesso.
    // Data exata calculada manualmente: contam-se 3 dias úteis antes do recesso começar em 20/12
    // (16, 17, 18/dez — qua/qui/sex; 19/dez é sábado). Faltam 7 dias úteis, que só voltam a contar
    // em 21/jan/2027 (quinta, primeiro dia útil após o recesso 20/dez-20/jan): 21, 22/jan (2),
    // pula o fim de semana 23-24/jan, depois 25, 26, 27, 28, 29/jan (mais 5) = 7 dias úteis,
    // completando os 10 em 29/jan/2027 (sexta).
    const resultado = calcularDataFinalPrazo({
      dataIntimacao: d("2026-12-15"),
      diasPrazo: 10,
      contagemEmDiasUteis: true,
    });
    expect(fmt(resultado)).toBe("2027-01-29");
  });

  it("considera intimação feita no recesso como feita no primeiro dia útil seguinte", () => {
    // intimação em 2026-12-25 (dentro do recesso) -> equivalente a considerar feita em 21/jan/2027
    const comRecesso = calcularDataFinalPrazo({
      dataIntimacao: d("2026-12-25"),
      diasPrazo: 5,
      contagemEmDiasUteis: true,
    });
    const baseEquivalente = calcularDataFinalPrazo({
      dataIntimacao: d("2027-01-20"), // véspera do fim do recesso; a lib ajusta internamente
      diasPrazo: 5,
      contagemEmDiasUteis: true,
    });
    expect(fmt(comRecesso)).toBe(fmt(baseEquivalente));
  });

  it("contagem em dias corridos prorroga se cair em dia não útil", () => {
    // intimação em 2026-08-10 (segunda), 5 dias corridos -> cai em sábado 15/08, prorroga para segunda 17/08
    const resultado = calcularDataFinalPrazo({
      dataIntimacao: d("2026-08-10"),
      diasPrazo: 5,
      contagemEmDiasUteis: false,
    });
    expect(fmt(resultado)).toBe("2026-08-17");
  });
});

describe("classificarUrgencia", () => {
  it("classifica prazo vencido", () => {
    expect(classificarUrgencia(d("2026-08-01"), d("2026-08-10"))).toBe("vencido");
  });
  it("classifica prazo de hoje", () => {
    expect(classificarUrgencia(d("2026-08-10"), d("2026-08-10"))).toBe("hoje");
  });
  it("classifica prazo crítico (<=2 dias)", () => {
    expect(classificarUrgencia(d("2026-08-12"), d("2026-08-10"))).toBe("critico");
  });
  it("classifica prazo de atenção (<=7 dias)", () => {
    expect(classificarUrgencia(d("2026-08-16"), d("2026-08-10"))).toBe("atencao");
  });
  it("classifica prazo tranquilo (>7 dias)", () => {
    expect(classificarUrgencia(d("2026-08-25"), d("2026-08-10"))).toBe("tranquilo");
  });
});

describe("hojeEmSaoPaulo", () => {
  it("usa o dia civil de Brasília, não o de UTC, quando já é o dia seguinte em UTC", () => {
    // 2026-08-10 22h em Brasília (UTC-3) = 2026-08-11 01h UTC — o bug antigo (normalizarData(new
    // Date()), que lê getUTCFullYear/Month/Date) leria isso como já sendo dia 11.
    const agora = new Date("2026-08-11T01:00:00.000Z");
    expect(fmt(hojeEmSaoPaulo(agora))).toBe("2026-08-10");
  });

  it("bate com o dia civil de UTC quando os fusos ainda coincidem (manhã em Brasília)", () => {
    // 2026-08-10 10h em Brasília = 2026-08-10 13h UTC — mesmo dia nos dois fusos.
    const agora = new Date("2026-08-10T13:00:00.000Z");
    expect(fmt(hojeEmSaoPaulo(agora))).toBe("2026-08-10");
  });
});

describe("classificarUrgencia — fronteira de fuso horário (regressão)", () => {
  it("NÃO marca como vencido um prazo que vence hoje quando são 22h em Brasília", () => {
    // Prazo vence em 2026-08-10. "Agora" = 2026-08-10 22h em Brasília = 2026-08-11 01h UTC.
    // Com o bug antigo (dia civil em UTC), "hoje" seria lido como 2026-08-11 e o prazo
    // apareceria como VENCIDO — mesmo faltando 2h para o fim do dia em Brasília.
    const dataFinal = d("2026-08-10");
    const hoje = hojeEmSaoPaulo(new Date("2026-08-11T01:00:00.000Z"));
    expect(classificarUrgencia(dataFinal, hoje)).toBe("hoje");
  });
});
