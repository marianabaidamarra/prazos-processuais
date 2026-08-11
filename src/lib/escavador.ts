import crypto from "node:crypto";

const ESCAVADOR_BASE_URL = "https://api.escavador.com/api/v2";

function token(): string {
  const t = process.env.ESCAVADOR_API_TOKEN;
  if (!t) {
    throw new Error(
      "ESCAVADOR_API_TOKEN não configurado. Cadastre-se em https://api.escavador.com e gere um token."
    );
  }
  return t;
}

/**
 * Solicita o monitoramento contínuo (webhook) de um processo pelo número CNJ.
 * Consulte a doc oficial (https://api.escavador.com/v2/docs/monitoramento-de-processos)
 * caso o endpoint/payload mude — a API do Escavador evolui com certa frequência.
 */
export async function registrarMonitoramentoProcesso(numeroCnj: string): Promise<{
  ok: boolean;
  escavadorProcessoId?: string;
  raw: unknown;
}> {
  const resp = await fetch(`${ESCAVADOR_BASE_URL}/monitoramentos/processos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numero_cnj: numeroCnj }),
  });

  const raw = await resp.json().catch(() => null);

  if (!resp.ok) {
    return { ok: false, raw };
  }

  const escavadorProcessoId =
    (raw as { id?: string | number } | null)?.id !== undefined
      ? String((raw as { id?: string | number }).id)
      : undefined;

  return { ok: true, escavadorProcessoId, raw };
}

export async function cancelarMonitoramentoProcesso(escavadorProcessoId: string): Promise<boolean> {
  const resp = await fetch(
    `${ESCAVADOR_BASE_URL}/monitoramentos/processos/${escavadorProcessoId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    }
  );
  return resp.ok;
}

/**
 * Verifica a assinatura HMAC do webhook do Escavador, se configurada
 * (ESCAVADOR_WEBHOOK_SECRET). Sem isso, qualquer requisição poderia forjar
 * eventos — sempre configure o secret em produção.
 */
export function verificarAssinaturaWebhook(payloadBruto: string, assinaturaRecebida: string | null): boolean {
  const secret = process.env.ESCAVADOR_WEBHOOK_SECRET;
  if (!secret) {
    // Sem secret configurado: aceita, mas registra aviso — só recomendado em desenvolvimento.
    console.warn(
      "ESCAVADOR_WEBHOOK_SECRET não configurado — aceitando webhook sem verificação de assinatura."
    );
    return true;
  }
  if (!assinaturaRecebida) return false;

  const esperada = crypto.createHmac("sha256", secret).update(payloadBruto).digest("hex");

  const a = Buffer.from(esperada);
  const b = Buffer.from(assinaturaRecebida);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
