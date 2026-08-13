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

  return (
    <DashboardClient
      userEmail={session!.user!.email ?? ""}
      processosIniciais={processosSerializados}
    />
  );
}
