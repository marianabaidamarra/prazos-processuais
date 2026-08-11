import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelarMonitoramentoProcesso } from "@/lib/escavador";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const processo = await prisma.process.findFirst({
    where: { id, userId },
    include: {
      prazos: { orderBy: { dataFinal: "asc" } },
      movimentacoes: { orderBy: { data: "desc" }, take: 50 },
    },
  });
  if (!processo) return NextResponse.json({ erro: "Processo não encontrado" }, { status: 404 });
  return NextResponse.json({ processo });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const processo = await prisma.process.findFirst({ where: { id, userId } });
  if (!processo) return NextResponse.json({ erro: "Processo não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const dataPermitida: Record<string, unknown> = {};
  for (const campo of ["tribunal", "vara", "partes", "status"] as const) {
    if (typeof body[campo] === "string") dataPermitida[campo] = body[campo];
  }

  const atualizado = await prisma.process.update({ where: { id }, data: dataPermitida });
  return NextResponse.json({ processo: atualizado });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const processo = await prisma.process.findFirst({ where: { id, userId } });
  if (!processo) return NextResponse.json({ erro: "Processo não encontrado" }, { status: 404 });

  if (processo.escavadorProcessoId) {
    await cancelarMonitoramentoProcesso(processo.escavadorProcessoId).catch(() => null);
  }

  await prisma.process.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
