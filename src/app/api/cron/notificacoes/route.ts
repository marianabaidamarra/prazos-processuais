import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarAlertaPrazo } from "@/lib/email";
import { normalizarData, hojeEmSaoPaulo } from "@/lib/prazos";
import { verificarCronSecret } from "@/lib/cron-auth";

/**
 * Job diário (configurado via Vercel Cron, ver vercel.json) que verifica prazos
 * pendentes e envia e-mail de alerta conforme `notifyDaysBefore` do usuário.
 * Protegido por CRON_SECRET — o Vercel Cron envia esse valor automaticamente
 * no header Authorization quando configurado nas variáveis de ambiente.
 */
export async function GET(req: NextRequest) {
  const erroAuth = verificarCronSecret(req);
  if (erroAuth) return erroAuth;

  // Deriva "hoje" do dia civil em Brasília, não do dia civil em UTC (ver hojeEmSaoPaulo) —
  // senão um prazo pode aparecer vencido/notificável horas antes da hora real, entre 21h e
  // 23h59 de Brasília.
  const hoje = hojeEmSaoPaulo();

  const prazosPendentes = await prisma.prazo.findMany({
    where: { status: "pendente" },
    include: { process: { include: { user: true } } },
  });

  let enviados = 0;
  let pulados = 0;
  let falhas = 0;

  for (const prazo of prazosPendentes) {
    const dataFinal = normalizarData(prazo.dataFinal);
    const diasRestantes = Math.round((dataFinal.getTime() - hoje.getTime()) / 86_400_000);

    const usuario = prazo.process.user;
    const diasParaNotificar = usuario.notifyDaysBefore.length
      ? usuario.notifyDaysBefore
      : [7, 3, 1, 0];

    // diasAntes é a chave usada para dedup de notificação (Notificacao.prazoId_diasAntes_canal).
    // No caminho normal, é o próprio diasRestantes do dia (bate exatamente com um checkpoint
    // configurado, ex: 7, 3, 1, 0).
    let diasAntes = diasRestantes;
    let precisaNotificar = diasParaNotificar.includes(diasRestantes);

    // Recuperação de checkpoint perdido: se o cron não rodou (ou falhou) no dia exato em que
    // diasRestantes chegou a 0, o prazo pula direto de "não bateu checkpoint" para
    // diasRestantes negativo — que nunca mais bate com nenhum checkpoint configurado, e o prazo
    // "escapa" da notificação para sempre. Para o checkpoint 0 especificamente, tratamos
    // qualquer diasRestantes negativo sem notificação de "vencido" bem-sucedida ainda registrada
    // como se fosse esse checkpoint — assim ele acaba sendo notificado no primeiro cron que
    // rodar depois, ainda que atrasado.
    if (!precisaNotificar && diasRestantes < 0 && diasParaNotificar.includes(0)) {
      const jaNotificouVencido = await prisma.notificacao.findUnique({
        where: {
          prazoId_diasAntes_canal: { prazoId: prazo.id, diasAntes: 0, canal: "email" },
        },
      });
      if (!jaNotificouVencido?.sucesso) {
        precisaNotificar = true;
        diasAntes = 0;
      }
    }

    if (!precisaNotificar) {
      pulados++;
      continue;
    }

    const destinatario = usuario.notifyEmail || usuario.email;

    // Só considera "já notificado" um envio que teve sucesso — uma tentativa
    // anterior que falhou (ex: provedor de e-mail fora do ar) deve ser
    // reprocessada na próxima execução do cron, não ignorada para sempre.
    const jaEnviadaComSucesso = await prisma.notificacao.findUnique({
      where: {
        prazoId_diasAntes_canal: {
          prazoId: prazo.id,
          diasAntes,
          canal: "email",
        },
      },
    });
    if (jaEnviadaComSucesso?.sucesso) {
      pulados++;
      continue;
    }

    const resultado = await enviarAlertaPrazo({
      destinatario,
      processoNumeroCnj: prazo.process.numeroCnj,
      prazoTipo: prazo.tipo,
      prazoDescricao: prazo.descricao,
      dataFinal: prazo.dataFinal,
      // Usa o diasRestantes REAL (pode ser negativo) no conteúdo do e-mail, mesmo quando
      // diasAntes (chave de dedup) foi normalizado para 0 — assim quem recebe o alerta vê
      // "venceu há N dias" de fato, não "vence hoje" para um prazo já vencido há tempo.
      diasRestantes,
    });

    await prisma.notificacao.upsert({
      where: {
        prazoId_diasAntes_canal: {
          prazoId: prazo.id,
          diasAntes,
          canal: "email",
        },
      },
      update: {
        sucesso: resultado.ok,
        erro: resultado.erro,
        destinatario,
        enviadaEm: new Date(),
      },
      create: {
        prazoId: prazo.id,
        diasAntes,
        destinatario,
        sucesso: resultado.ok,
        erro: resultado.erro,
      },
    });

    if (resultado.ok) enviados++;
    else falhas++;
  }

  return NextResponse.json({ ok: true, enviados, pulados, falhas, totalAnalisados: prazosPendentes.length });
}
