import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const atualizarPrazoSchema = z.object({
  status: z.enum(["pendente", "cumprido", "perdido", "cancelado"]).optional(),
  observacoes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const prazo = await prisma.prazo.findFirst({
    where: { id, process: { userId } },
  });
  if (!prazo) return NextResponse.json({ erro: "Prazo não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = atualizarPrazoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 });
  }

  const atualizado = await prisma.prazo.update({
    where: { id },
    data: {
      ...parsed.data,
      cumpridoEm: parsed.data.status === "cumprido" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ prazo: atualizado });
}
