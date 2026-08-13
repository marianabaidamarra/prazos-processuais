import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { verificarCronSecret } from "./cron-auth";

function reqCom(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new NextRequest("https://example.com/api/cron/teste", { headers });
}

describe("verificarCronSecret", () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalEnv;
  });

  it("fail-closed: bloqueia (500) quando CRON_SECRET não está configurado, mesmo sem header algum", async () => {
    delete process.env.CRON_SECRET;
    const resposta = verificarCronSecret(reqCom());
    expect(resposta).not.toBeNull();
    expect(resposta!.status).toBe(500);
  });

  it("bloqueia (401) quando o secret está configurado mas o header não bate", () => {
    process.env.CRON_SECRET = "segredo-correto";
    const resposta = verificarCronSecret(reqCom("Bearer segredo-errado"));
    expect(resposta).not.toBeNull();
    expect(resposta!.status).toBe(401);
  });

  it("bloqueia (401) quando o secret está configurado mas nenhum header é enviado", () => {
    process.env.CRON_SECRET = "segredo-correto";
    const resposta = verificarCronSecret(reqCom());
    expect(resposta).not.toBeNull();
    expect(resposta!.status).toBe(401);
  });

  it("libera (retorna null) quando o header bate com o secret configurado", () => {
    process.env.CRON_SECRET = "segredo-correto";
    const resposta = verificarCronSecret(reqCom("Bearer segredo-correto"));
    expect(resposta).toBeNull();
  });
});
