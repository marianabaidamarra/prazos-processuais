-- CreateIndex
-- Dedup de movimentações no nível do banco (não só via findFirst antes do create na aplicação,
-- que deixava uma janela de corrida). codigoMovimento é NULL para movimentações manuais, e
-- Postgres trata NULL como distinto entre si em constraints únicas, então isso não afeta
-- lançamentos manuais (fonte default "manual", codigoMovimento sempre NULL).
CREATE UNIQUE INDEX "Movimentacao_processId_fonte_codigoMovimento_data_key" ON "Movimentacao"("processId", "fonte", "codigoMovimento", "data");
