import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session!.user as { id: string }).id;

  const processos = await prisma.process.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      prazos: { orderBy: { dataFinal: "asc" } },
    },
  });

  // Movimentações que a heurística (regex ou código TPU, ver src/lib/heuristica-prazo.ts)
  // sinalizou como possível gatilho de prazo, e que ainda não viraram um Prazo de fato
  // (prazoGerado null) — é o que a advogada precisa revisar e decidir se cadastra o prazo.
  // Sem isso na UI, o monitoramento roda mas ninguém vê o resultado.
  const movimentacoesDetectadas = await prisma.movimentacao.findMany({
    where: {
      prazoSugeridoDetectado: true,
      prazoGerado: null,
      process: { userId },
    },
    include: { process: true },
    orderBy: { data: "desc" },
  });

  // Serializa datas para string (Server -> Client Component boundary)
  const processosSerializados = processos.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    monitoradoDesde: p.monitoradoDesde?.toISOString() ?? null,
    ultimaVerificacaoDatajud: p.ultimaVerificacaoDatajud?.toISOString() ?? null,
    prazos: p.prazos.map((pr) => ({
      ...pr,
      dataIntimacao: pr.dataIntimacao.toISOString(),
      dataFinal: pr.dataFinal.toISOString(),
      cumpridoEm: pr.cumpridoEm?.toISOString() ?? null,
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
    })),
  }));

  const movimentacoesDetectadasSerializadas = movimentacoesDetectadas.map((m) => ({
    id: m.id,
    processId: m.processId,
    numeroCnj: m.process.numeroCnj,
    data: m.data.toISOString(),
    tipo: m.tipo,
    conteudo: m.conteudo,
    fonte: m.fonte,
    codigoMovimento: m.codigoMovimento,
  }));

  return (
    <DashboardClient
      userEmail={session!.user!.email ?? ""}
      processosIniciais={processosSerializados}
      movimentacoesDetectadasIniciais={movimentacoesDetectadasSerializadas}
    />
  );
}
