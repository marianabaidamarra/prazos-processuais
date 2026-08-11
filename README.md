# Prazos Processuais

Ferramenta para acompanhamento de prazos processuais: cadastro de processos, cálculo automático de prazos (dias úteis, feriados nacionais, recesso forense), monitoramento automático de movimentações via API do Escavador e alertas por e-mail.

## Stack

- **Next.js 16** (App Router) — frontend + API
- **PostgreSQL + Prisma** — banco de dados
- **NextAuth (Auth.js) v5** — autenticação
- **Escavador API** — monitoramento automático de processos (webhooks)
- **Resend** — envio de e-mails de alerta
- **Vercel Cron** — disparo diário da checagem de prazos

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
- O monitoramento automático via Escavador depende de uma conta e créditos pagos na API deles (https://api.escavador.com). Sem isso, os processos podem ser cadastrados e os prazos acompanhados manualmente.
- A heurística que sinaliza "possível prazo" em uma movimentação (`src/lib/heuristica-prazo.ts`) é baseada em palavras-chave simples — sempre revise antes de confiar no prazo sugerido.

Veja `DEPLOY.md` para o passo a passo de colocar isso no ar para uso real.
