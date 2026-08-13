import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consultarProcessoDatajud } from "@/lib/datajud";
import { detectarPossivelPrazoPorCodigoTpu } from "@/lib/heuristica-prazo";
import { enviarAlertaSistema } from "@/lib/email";
import { verificarCronSecret } from "@/lib/cron-auth";

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
  const erroAuth = verificarCronSecret(req);
  if (erroAuth) return erroAuth;

  const processos = await prisma.process.findMany({
    where: { fonteMonitoramento: "datajud", status: "ativo" },
    include: { user: true },
  });

  // Mapa de usuários distintos donos de algum processo monitorado via DataJud. Quando a chave é
  // rejeitada, o problema afeta TODOS eles igualmente (a chave é global, não por processo) — não
  // só o dono do processo que happened to be o primeiro a falhar no loop. Hoje é irrelevante (só
  // há um usuário), mas o schema já é multi-usuário; sem isso, um segundo usuário nunca seria
  // avisado que o monitoramento dos processos dele parou.
  const usuariosAfetados = new Map<string, { notifyEmail: string | null; email: string }>();
  for (const processo of processos) {
    usuariosAfetados.set(processo.user.id, {
      notifyEmail: processo.user.notifyEmail,
      email: processo.user.email,
    });
  }

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
        // Notifica TODOS os donos distintos de processos monitorados via DataJud, não só o dono
        // do processo que disparou a falha — a chave é global, então o problema afeta todo mundo
        // que depende do monitoramento automático, mesmo quem ainda nem tinha sido verificado
        // nesta execução.
        await Promise.all(
          Array.from(usuariosAfetados.values()).map((usuario) => {
            const destinatario = usuario.notifyEmail || usuario.email;
            return enviarAlertaSistema({
              destinatario,
              assunto: "Chave da API do DataJud foi rejeitada",
              mensagem:
                `O monitoramento automático de processos via DataJud parou de funcionar porque a chave de API foi rejeitada ` +
                `(erro 401/403) — provavelmente o CNJ rotacionou a chave pública. ` +
                `Consulte https://datajud-wiki.cnj.jus.br/api-publica/acesso/ para obter a chave atual e atualize a ` +
                `variável de ambiente DATAJUD_API_KEY no Vercel. Nenhum processo foi verificado nesta execução após a falha.`,
            }).catch((e) =>
              console.error(
                `[cron/monitoramento-datajud] Falha ao enviar alerta de chave rotacionada para ${destinatario}:`,
                e
              )
            );
          })
        );
      }
      continue;
    }

    processosVerificados++;

    for (const mov of resultado.movimentos) {
      const codigoStr = String(mov.codigo);
      const dataHora = new Date(mov.dataHora);
      if (isNaN(dataHora.getTime())) continue;

      const classificacao = detectarPossivelPrazoPorCodigoTpu(mov.codigo);
      if (!classificacao.categoriaConhecida) {
        codigosDesconhecidos.add(`${codigoStr} (${mov.nome})`);
      }

      // Dedup via constraint única no banco (processId+fonte+codigoMovimento+data), não mais
      // via findFirst antes do create — o findFirst deixava uma janela de corrida (ex: duas
      // execuções do cron sobrepostas inserindo a mesma movimentação duas vezes). Se a
      // movimentação já existe, o create falha com P2002 e isso é tratado como "já processada",
      // não como erro.
      try {
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
      } catch (e) {
        const jaExistia =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (!jaExistia) throw e;
      }
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
