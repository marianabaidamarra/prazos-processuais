import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarMonitoramentoProcesso } from "@/lib/escavador";

const criarProcessoSchema = z.object({
  numeroCnj: z.string().min(15, "Número CNJ parece inválido"),
  tribunal: z.string().optional(),
  vara: z.string().optional(),
  partes: z.string().optional(),
  monitorarViaEscavador: z.boolean().optional().default(false),
  monitorarViaDatajud: z.boolean().optional().default(false),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  const processos = await prisma.process.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      prazos: {
        where: { status: "pendente" },
        orderBy: { dataFinal: "asc" },
      },
    },
  });

  return NextResponse.json({ processos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => null);
  const parsed = criarProcessoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 });
  }
  const { numeroCnj, tribunal, vara, partes, monitorarViaEscavador, monitorarViaDatajud } = parsed.data;

  const existente = await prisma.process.findUnique({
    where: { userId_numeroCnj: { userId, numeroCnj } },
  });
  if (existente) {
    return NextResponse.json({ erro: "Este processo já está cadastrado." }, { status: 409 });
  }

  let escavadorProcessoId: string | undefined;
  let fonteMonitoramento = "manual";
  let monitoradoDesde: Date | undefined;
  let avisoMonitoramento: string | undefined;

  if (monitorarViaEscavador) {
    try {
      const resultado = await registrarMonitoramentoProcesso(numeroCnj);
      if (resultado.ok) {
        escavadorProcessoId = resultado.escavadorProcessoId;
        fonteMonitoramento = "escavador";
        monitoradoDesde = new Date();
      } else {
        avisoMonitoramento =
          "Não foi possível registrar o monitoramento automático no Escavador. O processo foi salvo apenas para acompanhamento manual.";
      }
    } catch (e) {
      avisoMonitoramento =
        e instanceof Error
          ? `Monitoramento automático indisponível: ${e.message}`
          : "Monitoramento automático indisponível.";
    }
  } else if (monitorarViaDatajud) {
    // Diferente do Escavador, o DataJud não tem um passo de "registro" — é consulta pull,
    // feita pelo cron diário (ver src/app/api/cron/monitoramento-datajud/route.ts). Aqui só
    // marcamos a fonte; a primeira consulta real acontece na próxima execução do cron.
    fonteMonitoramento = "datajud";
    monitoradoDesde = new Date();
  }

  const processo = await prisma.process.create({
    data: {
      userId,
      numeroCnj,
      tribunal,
      vara,
      partes,
      escavadorProcessoId,
      fonteMonitoramento,
      monitoradoDesde,
    },
  });

  return NextResponse.json({ processo, aviso: avisoMonitoramento }, { status: 201 });
}
