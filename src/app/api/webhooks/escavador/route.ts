import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verificarAssinaturaWebhook } from "@/lib/escavador";
import { detectarPossivelPrazo } from "@/lib/heuristica-prazo";

/**
 * Recebe eventos de monitoramento do Escavador (nova_movimentacao, novo_documento, etc.).
 * Formato exato do payload deve ser conferido na doc oficial ao ativar em produção:
 * https://api.escavador.com/v2/docs/monitoramento-de-processos — este handler assume
 * um formato razoável e é resiliente a campos ausentes, mas pode precisar de ajuste
 * fino após os primeiros eventos reais chegarem (registre `raw` para conferir).
 */
export async function POST(req: NextRequest) {
  const payloadBruto = await req.text();
  const assinatura = req.headers.get("x-escavador-signature");

  if (!verificarAssinaturaWebhook(payloadBruto, assinatura)) {
    return NextResponse.json({ erro: "Assinatura inválida" }, { status: 401 });
  }

  let evento: Record<string, unknown>;
  try {
    evento = JSON.parse(payloadBruto);
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  const escavadorProcessoId =
    (evento.processo_id ?? evento.id_processo ?? (evento.processo as { id?: unknown })?.id) as
      | string
      | number
      | undefined;
  const eventoId = (evento.id ?? evento.evento_id) as string | number | undefined;
  const conteudo = String(evento.conteudo ?? evento.texto ?? evento.descricao ?? "");
  const dataEvento = evento.data ? new Date(String(evento.data)) : new Date();
  const tipoEvento = String(evento.tipo ?? evento.tipo_evento ?? "movimentacao");

  if (!escavadorProcessoId) {
    // Registra mesmo assim para não perder o evento, mas sem processo associado não há como salvar.
    console.error("Webhook Escavador sem processo_id identificável:", payloadBruto.slice(0, 500));
    return NextResponse.json({ ok: true, aviso: "Sem processo_id, evento ignorado" });
  }

  const processo = await prisma.process.findUnique({
    where: { escavadorProcessoId: String(escavadorProcessoId) },
  });

  if (!processo) {
    console.warn(`Webhook Escavador para processo não cadastrado: ${escavadorProcessoId}`);
    return NextResponse.json({ ok: true, aviso: "Processo não monitorado nesta conta" });
  }

  const { detectado } = detectarPossivelPrazo(conteudo);

  const movimentacao = await prisma.movimentacao.upsert({
    where: { escavadorEventoId: eventoId ? String(eventoId) : "sem-id-" + randomUUID() },
    update: {},
    create: {
      processId: processo.id,
      data: dataEvento,
      tipo: tipoEvento,
      conteudo,
      fonte: "escavador_webhook",
      escavadorEventoId: eventoId ? String(eventoId) : undefined,
      raw: JSON.parse(payloadBruto),
      prazoSugeridoDetectado: detectado,
    },
  });

  return NextResponse.json({ ok: true, movimentacaoId: movimentacao.id, prazoSugerido: detectado });
}
