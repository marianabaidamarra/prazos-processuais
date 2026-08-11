import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarAlertaPrazo } from "@/lib/email";
import { normalizarData } from "@/lib/prazos";

/**
 * Job diário (configurado via Vercel Cron, ver vercel.json) que verifica prazos
 * pendentes e envia e-mail de alerta conforme `notifyDaysBefore` do usuário.
 * Protegido por CRON_SECRET — o Vercel Cron envia esse valor automaticamente
 * no header Authorization quando configurado nas variáveis de ambiente.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  }

  const hoje = normalizarData(new Date());

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

    if (!diasParaNotificar.includes(diasRestantes)) {
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
          diasAntes: diasRestantes,
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
      diasRestantes,
    });

    await prisma.notificacao.upsert({
      where: {
        prazoId_diasAntes_canal: {
          prazoId: prazo.id,
          diasAntes: diasRestantes,
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
        diasAntes: diasRestantes,
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
