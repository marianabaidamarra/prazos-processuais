import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { verificarAssinaturaWebhook } from "./escavador";

describe("verificarAssinaturaWebhook", () => {
  const originalEnv = process.env.ESCAVADOR_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ESCAVADOR_WEBHOOK_SECRET;
    else process.env.ESCAVADOR_WEBHOOK_SECRET = originalEnv;
  });

  it("fail-closed: rejeita quando ESCAVADOR_WEBHOOK_SECRET não está configurado, mesmo sem assinatura", () => {
    delete process.env.ESCAVADOR_WEBHOOK_SECRET;
    expect(verificarAssinaturaWebhook('{"evento":"teste"}', null)).toBe(false);
  });

  it("rejeita quando o secret está configurado mas nenhuma assinatura foi enviada", () => {
    process.env.ESCAVADOR_WEBHOOK_SECRET = "segredo";
    expect(verificarAssinaturaWebhook('{"evento":"teste"}', null)).toBe(false);
  });

  it("rejeita quando a assinatura não bate com o HMAC esperado", () => {
    process.env.ESCAVADOR_WEBHOOK_SECRET = "segredo";
    expect(verificarAssinaturaWebhook('{"evento":"teste"}', "assinatura-forjada")).toBe(false);
  });

  it("aceita quando a assinatura HMAC bate com o secret configurado", () => {
    process.env.ESCAVADOR_WEBHOOK_SECRET = "segredo";
    const payload = '{"evento":"teste"}';
    const assinaturaValida = crypto.createHmac("sha256", "segredo").update(payload).digest("hex");
    expect(verificarAssinaturaWebhook(payload, assinaturaValida)).toBe(true);
  });
});
