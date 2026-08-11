import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_PASSWORD;

  if (!email || !senha) {
    throw new Error(
      "Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente antes de rodar o seed (ex: ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=senha123 npx prisma db seed)."
    );
  }

  const passwordHash = await bcrypt.hash(senha, 12);

  const usuario = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || undefined,
    },
  });

  console.log(`Usuário criado/atualizado: ${usuario.email} (id: ${usuario.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
