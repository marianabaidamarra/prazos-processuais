import { describe, it, expect } from "vitest";
import { decomporNumeroCnj, resolverEndpointDatajud } from "./datajud";

describe("decomporNumeroCnj", () => {
  it("decompõe um número CNJ válido nos componentes oficiais", () => {
    expect(decomporNumeroCnj("0004812-24.2019.8.26.0001")).toEqual({
      numero: "0004812",
      dv: "24",
      ano: "2019",
      segmento: "8",
      tribunal: "26",
      orgao: "0001",
    });
  });

  it("retorna null para número com quantidade errada de dígitos", () => {
    expect(decomporNumeroCnj("123-45")).toBeNull();
  });
});

describe("resolverEndpointDatajud", () => {
  it("resolve tribunal estadual (TJSP) para o slug correto", () => {
    expect(resolverEndpointDatajud("0004812-24.2019.8.26.0001")).toBe(
      "https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search"
    );
  });

  it("resolve tribunal federal (TRF3) para o slug correto", () => {
    expect(resolverEndpointDatajud("5019331-17.2025.4.03.6100")).toBe(
      "https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search"
    );
  });

  it("resolve tribunal eleitoral com slug hifenizado (confirmado ao vivo contra a API — a variante sem hífen retorna 404)", () => {
    // segmento 6 = eleitoral, tribunal 26 = SP
    expect(resolverEndpointDatajud("0000000-00.2024.6.26.0000")).toBe(
      "https://api-publica.datajud.cnj.jus.br/api_publica_tre-sp/_search"
    );
  });

  it("resolve STJ", () => {
    expect(resolverEndpointDatajud("0000000-00.2024.3.00.0000")).toBe(
      "https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search"
    );
  });

  it("lança erro explícito e específico para STF (segmento 1) — não coberto pela API pública do DataJud", () => {
    expect(() => resolverEndpointDatajud("0000000-00.2024.1.00.0000")).toThrow(/STF/);
  });

  it("lança erro explícito (não silencioso) para segmento/tribunal fora da tabela", () => {
    expect(() => resolverEndpointDatajud("0000000-00.2024.4.99.0000")).toThrow(
      /Não há mapeamento/
    );
  });
});
