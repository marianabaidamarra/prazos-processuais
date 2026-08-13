import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consultarProcessoDatajud } from "@/lib/datajud";
import { detectarPossivelPrazoPorCodigoTpu } from "@/lib/heuristica-prazo";
import { enviarAlertaSistema } from "@/lib/email";

/**
 * Job diário (configurado via Vercel Cron, ver vercel.json) que consulta o DataJud para todo
 * `Process` com `fonteMonitoramento = "datajud"` e grava movimentos novos em `Movimentacao`
 * (fonte: "datajud"), sinalizando `prazoSugeridoDetectado` pelo código da TPU.
 *
 * Roda ANTES do cron de notificações (ver vercel.json) para que movimentos novos já estejam
 * gravados quando o outro job avaliar prazos pendentes.
 *
 * Protegido por CRON_SECRET, igual ao cron de notificações.
 *
 * IMPORTANTE: esta rota nunca deve falhar silenciosamente. Se o DataJud rejeitar a chave de API
 * (401/403 — sinal de rotação pelo CNJ), a execução é interrompida cedo (não adianta repetir o
 * mesmo erro para cada processo) e um e-mail de alerta é enviado para o dono de cada processo
 * monitorado, além do log de erro normal do Vercel.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  }

  const processos = await prisma.process.findMany({
    where: { fonteMonitoramento: "datajud", status: "ativo" },
    include: { user: true },
  });

  let processosVerificados = 0;
  let movimentosNovos = 0;
  let falhas = 0;
  const codigosDesconhecidos = new Set<string>();
  const errosDetalhados: Array<{ numeroCnj: string; erro: string }> = [];
  let chaveRotacionadaDetectada = false;

  for (const processo of processos) {
    if (chaveRotacionadaDetectada) {
      // Já sabemos que a chave está rejeitada — não adianta repetir a mesma falha para
      // cada processo restante, só acumula ruído no log sem informação nova.
      falhas++;
      continue;
    }

    const resultado = await consultarProcessoDatajud(processo.numeroCnj);

    if (!resultado.ok) {
      falhas++;
      errosDetalhados.push({ numeroCnj: processo.numeroCnj, erro: resultado.erro ?? "erro desconhecido" });
      console.error(`[cron/monitoramento-datajud] Falha ao consultar ${processo.numeroCnj}: ${resultado.erro}`);

      if (resultado.chaveRotacionada) {
        chaveRotacionadaDetectada = true;
        const destinatario = processo.user.notifyEmail || processo.user.email;
        await enviarAlertaSistema({
          destinatario,
          assunto: "Chave da API do DataJud foi rejeitada",
          mensagem:
            `O monitoramento automático de processos via DataJud parou de funcionar porque a chave de API foi rejeitada ` +
            `(erro 401/403) — provavelmente o CNJ rotacionou a chave pública. ` +
            `Consulte https://datajud-wiki.cnj.jus.br/api-publica/acesso/ para obter a chave atual e atualize a ` +
            `variável de ambiente DATAJUD_API_KEY no Vercel. Nenhum processo foi verificado nesta execução após a falha.`,
        }).catch((e) => console.error("[cron/monitoramento-datajud] Falha ao enviar alerta de chave rotacionada:", e));
      }
      continue;
    }

    processosVerificados++;

    for (const mov of resultado.movimentos) {
      const codigoStr = String(mov.codigo);
      const dataHora = new Date(mov.dataHora);
      if (isNaN(dataHora.getTime())) continue;

      const jaExiste = await prisma.movimentacao.findFirst({
        where: {
          processId: processo.id,
          fonte: "datajud",
          codigoMovimento: codigoStr,
          data: dataHora,
        },
        select: { id: true },
      });
      if (jaExiste) continue;

      const classificacao = detectarPossivelPrazoPorCodigoTpu(mov.codigo);
      if (!classificacao.categoriaConhecida) {
        codigosDesconhecidos.add(`${codigoStr} (${mov.nome})`);
      }

      await prisma.movimentacao.create({
        data: {
          processId: processo.id,
          data: dataHora,
          tipo: mov.nome,
          conteudo: mov.nome,
          fonte: "datajud",
          codigoMovimento: codigoStr,
          raw: mov as unknown as object,
          prazoSugeridoDetectado: classificacao.detectado,
        },
      });
      movimentosNovos++;
    }

    await prisma.process.update({
      where: { id: processo.id },
      data: { ultimaVerificacaoDatajud: new Date() },
    });
  }

  if (codigosDesconhecidos.size > 0) {
    // Log intencional (não é erro) — objetivo é ir expandindo tpu-codigos-referencia.json com
    // códigos reais observados em produção, em vez de tentar prever todos de antemão.
    console.log(
      `[cron/monitoramento-datajud] Códigos de movimento fora da tabela TPU catalogada: ${Array.from(codigosDesconhecidos).join(", ")}`
    );
  }

  return NextResponse.json({
    ok: !chaveRotacionadaDetectada,
    processosMonitorados: processos.length,
    processosVerificados,
    movimentosNovos,
    falhas,
    chaveRotacionadaDetectada,
    codigosDesconhecidos: Array.from(codigosDesconhecidos),
    erros: errosDetalhados,
  });
}
