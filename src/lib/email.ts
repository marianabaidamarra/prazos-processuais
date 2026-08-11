import { Resend } from "resend";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY não configurado. Crie uma conta grátis em https://resend.com.");
  }
  return new Resend(key);
}

export interface AlertaPrazoEmail {
  destinatario: string;
  processoNumeroCnj: string;
  prazoTipo: string;
  prazoDescricao?: string | null;
  dataFinal: Date;
  diasRestantes: number;
}

export async function enviarAlertaPrazo(dados: AlertaPrazoEmail): Promise<{ ok: boolean; erro?: string }> {
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? "alertas@example.com";

  const urgenciaTexto =
    dados.diasRestantes <= 0
      ? "VENCE HOJE"
      : dados.diasRestantes === 1
        ? "vence amanhã"
        : `vence em ${dados.diasRestantes} dias`;

  const dataFormatada = dados.dataFinal.toLocaleDateString("pt-BR", { timeZone: "UTC" });

  try {
    await client().emails.send({
      from,
      to: dados.destinatario,
      subject: `⏰ Prazo processual ${urgenciaTexto} — processo ${dados.processoNumeroCnj}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <h2>Alerta de prazo processual</h2>
          <p><strong>Processo:</strong> ${dados.processoNumeroCnj}</p>
          <p><strong>Tipo de prazo:</strong> ${dados.prazoTipo}</p>
          ${dados.prazoDescricao ? `<p><strong>Descrição:</strong> ${dados.prazoDescricao}</p>` : ""}
          <p><strong>Data final:</strong> ${dataFormatada} (${urgenciaTexto})</p>
          <p style="color:#888; font-size: 12px; margin-top: 24px;">
            Este é um alerta automático. Confira sempre o prazo diretamente no
            processo antes de tomar qualquer decisão baseada apenas neste e-mail.
          </p>
        </div>
      `,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
