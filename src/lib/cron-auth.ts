import { NextRequest, NextResponse } from "next/server";

/**
 * Verifica o header Authorization de uma requisição de cron contra CRON_SECRET.
 *
 * Fail-closed: se a env var não estiver configurada, REJEITA a requisição (500) em vez de
 * aceitar sem checagem. Antes, os dois crons (`notificacoes` e `monitoramento-datajud`) pulavam
 * a verificação inteira quando `CRON_SECRET` estava ausente — ou seja, "esqueceu de configurar a
 * variável" e "endpoint público sem autenticação" tinham o mesmo efeito prático. Um secret
 * ausente em produção deve bloquear o endpoint, não abri-lo.
 *
 * Retorna uma `NextResponse` de erro se a requisição deve ser bloqueada, ou `null` se pode
 * prosseguir normalmente.
 */
export function verificarCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "CRON_SECRET não configurado — bloqueando requisição de cron por segurança (fail-closed)."
    );
    return NextResponse.json(
      { erro: "Endpoint de cron não configurado corretamente (CRON_SECRET ausente)." },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  return null;
}
