# Prazos Processuais

Ferramenta para acompanhamento de prazos processuais: cadastro de processos, cálculo automático de prazos (dias úteis, feriados nacionais, recesso forense), monitoramento automático de movimentações via API pública do DataJud (CNJ) e alertas por e-mail.

## Stack

- **Next.js 16** (App Router) — frontend + API
- **PostgreSQL + Prisma** — banco de dados
- **NextAuth (Auth.js) v5** — autenticação
- **DataJud (API pública do CNJ)** — monitoramento automático de movimentações por número CNJ, via cron diário (defasagem de T+1 a T+7 dias, sempre visível na UI)
- **Resend** — envio de e-mails de alerta
- **Vercel Cron** — disparo diário da checagem de prazos e do monitoramento DataJud

## Rodando localmente

1. `npm install`
2. Configure um Postgres local e ajuste `DATABASE_URL` no `.env` (veja `.env` já criado como exemplo)
3. `npx prisma migrate dev`
4. Crie seu usuário: `ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=sua-senha npm run db:seed`
5. `npm run dev`
6. Acesse http://localhost:3000 e faça login

## Testes

`npm test` — roda os testes da lógica de cálculo de prazo (`src/lib/prazos.test.ts`), incluindo casos de recesso forense e feriados nacionais.

## Limitações importantes (leia antes de usar em produção)

- O cálculo de prazo cobre **feriados nacionais + recesso forense nacional** (20/dez–20/jan). Feriados **estaduais/municipais** do tribunal específico (ex: aniversário da cidade-sede) não são conhecidos automaticamente. Cadastre-os na tabela `Feriado` para maior precisão.
- Esta ferramenta é um **apoio**, não substitui a conferência profissional de prazos críticos.
- O monitoramento automático via DataJud **não é tempo real** — os índices de cada tribunal têm defasagem de T+1 a T+7 dias. A UI mostra a data da última verificação em cada processo monitorado; não é substituto para conferência manual de prazos críticos.
- Há também suporte (atualmente escondido na UI) a monitoramento via Escavador, que depende de uma conta e créditos pagos na API deles (https://api.escavador.com) e não está ativo por padrão.
- A heurística que sinaliza "possível prazo" em uma movimentação é baseada em palavras-chave simples (`src/lib/heuristica-prazo.ts`, `detectarPossivelPrazo`) para fontes manuais, e em código oficial da Tabela Processual Unificada (`detectarPossivelPrazoPorCodigoTpu`) para movimentações vindas do DataJud — sempre revise antes de confiar no prazo sugerido.

Veja `DEPLOY.md` para o passo a passo de colocar isso no ar para uso real.
