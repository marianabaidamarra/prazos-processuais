-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifyEmail" TEXT,
    "notifyDaysBefore" INTEGER[] DEFAULT ARRAY[7, 3, 1, 0]::INTEGER[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "numeroCnj" TEXT NOT NULL,
    "tribunal" TEXT,
    "vara" TEXT,
    "partes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "escavadorProcessoId" TEXT,
    "monitoradoDesde" TIMESTAMP(3),
    "fonteMonitoramento" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimentacao" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT,
    "conteudo" TEXT NOT NULL,
    "fonte" TEXT NOT NULL DEFAULT 'manual',
    "escavadorEventoId" TEXT,
    "raw" JSONB,
    "prazoSugeridoDetectado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prazo" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "movimentacaoId" TEXT,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "dataIntimacao" TIMESTAMP(3) NOT NULL,
    "diasPrazo" INTEGER NOT NULL,
    "contagemEmDiasUteis" BOOLEAN NOT NULL DEFAULT true,
    "dataFinal" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "cumpridoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prazo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "prazoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'email',
    "diasAntes" INTEGER NOT NULL,
    "enviadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destinatario" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "erro" TEXT,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feriado" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "abrangencia" TEXT NOT NULL DEFAULT 'nacional',

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Process_escavadorProcessoId_key" ON "Process"("escavadorProcessoId");

-- CreateIndex
CREATE INDEX "Process_userId_status_idx" ON "Process"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Process_userId_numeroCnj_key" ON "Process"("userId", "numeroCnj");

-- CreateIndex
CREATE UNIQUE INDEX "Movimentacao_escavadorEventoId_key" ON "Movimentacao"("escavadorEventoId");

-- CreateIndex
CREATE INDEX "Movimentacao_processId_data_idx" ON "Movimentacao"("processId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Prazo_movimentacaoId_key" ON "Prazo"("movimentacaoId");

-- CreateIndex
CREATE INDEX "Prazo_processId_status_idx" ON "Prazo"("processId", "status");

-- CreateIndex
CREATE INDEX "Prazo_dataFinal_status_idx" ON "Prazo"("dataFinal", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Notificacao_prazoId_diasAntes_canal_key" ON "Notificacao"("prazoId", "diasAntes", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_data_key" ON "Feriado"("data");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prazo" ADD CONSTRAINT "Prazo_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prazo" ADD CONSTRAINT "Prazo_movimentacaoId_fkey" FOREIGN KEY ("movimentacaoId") REFERENCES "Movimentacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacao" ADD CONSTRAINT "Notificacao_prazoId_fkey" FOREIGN KEY ("prazoId") REFERENCES "Prazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
