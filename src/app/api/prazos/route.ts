import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularDataFinalPrazo } from "@/lib/prazos";

const criarPrazoSchema = z.object({
  processId: z.string().min(1),
  tipo: z.string().min(1),
  descricao: z.string().optional(),
  dataIntimacao: z.coerce.date(),
  diasPrazo: z.coerce.number().int().positive(),
  contagemEmDiasUteis: z.boolean().optional().default(true),
  movimentacaoId: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const prazos = await prisma.prazo.findMany({
    where: { process: { userId } },
    include: { process: true },
    orderBy: [{ status: "asc" }, { dataFinal: "asc" }],
  });

  return NextResponse.json({ prazos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => null);
  const parsed = criarPrazoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 });
  }
  const { processId, tipo, descricao, dataIntimacao, diasPrazo, contagemEmDiasUteis, movimentacaoId } =
    parsed.data;

  const processo = await prisma.process.findFirst({ where: { id: processId, userId } });
  if (!processo) return NextResponse.json({ erro: "Processo não encontrado" }, { status: 404 });

  // Feriados extras cadastrados manualmente (estaduais/locais), independente do ano.
  const feriadosCadastrados = await prisma.feriado.findMany();
  const feriadosExtras = new Set(
    feriadosCadastrados.map((f) => f.data.toISOString().slice(0, 10))
  );

  const dataFinal = calcularDataFinalPrazo({
    dataIntimacao,
    diasPrazo,
    contagemEmDiasUteis,
    feriadosExtras,
  });

  const prazo = await prisma.prazo.create({
    data: {
      processId,
      tipo,
      descricao,
      dataIntimacao,
      diasPrazo,
      contagemEmDiasUteis,
      dataFinal,
      movimentacaoId,
    },
  });

  return NextResponse.json({ prazo }, { status: 201 });
}
