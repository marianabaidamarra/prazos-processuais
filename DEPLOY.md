# Guia de deploy (hospedagem na nuvem — stack 100% gratuita, por decisão sua)

Você optou por ficar no plano gratuito em tudo por enquanto (Vercel Hobby, Supabase Free, sem domínio próprio). Isso é totalmente viável para uso individual — só é importante entender as duas pegadinhas abaixo e como este projeto já lida com elas.

## Pegadinhas do plano gratuito e como já estão resolvidas

**Supabase pausa por inatividade (1 semana sem uso).** Isso já é mitigado automaticamente: o cron diário de notificações (`vercel.json`, roda todo dia às 8h de Brasília) consulta o banco todo santo dia — bem dentro da janela de 1 semana. Ou seja, **enquanto o cron estiver ativo, o banco nunca vai pausar por inatividade**, mesmo que você não abra o sistema com frequência. Só fique atenta: se em algum momento remover ou desativar esse cron, o risco de pausa volta.

**Resend sem domínio verificado só envia para o e-mail dono da conta.** Isso não é um problema aqui: como o sistema é de uso individual e os alertas de prazo vão para o seu próprio e-mail (`notifyEmail` do seu usuário), basta criar a conta Resend com o mesmo e-mail que vai receber os alertas. Se um dia você quiser mandar alertas para outra pessoa (ex: um estagiário, ou vários advogados do escritório), aí sim vai precisar verificar um domínio próprio — trato isso como um passo futuro, não bloqueante agora.

**Vercel Hobby para uso profissional.** Você decidiu aceitar esse risco (é baixo na prática, mas existe tecnicamente pelos termos de uso). Nada a configurar aqui, só reforçando que você está ciente.

## 1. Banco de dados — Supabase

1. Crie uma conta grátis em https://supabase.com e um novo projeto.
2. Em **Project Settings → Database**, copie a "Connection string" (modo "Transaction" / pooled, porta 6543) — essa será sua `DATABASE_URL`.

## 2. Monitoramento de processos — Escavador

1. Crie uma conta em https://api.escavador.com e gere um token de API (Bearer token) em **Configurações → Tokens**.
2. Esse token vai na variável `ESCAVADOR_API_TOKEN`.
3. Ao ativar o monitoramento de um processo, o Escavador chamará o webhook `https://SEU-DOMINIO/api/webhooks/escavador` — configure isso no painel deles (confira a doc atual em api.escavador.com/v2/docs, esse fluxo pode mudar).
4. Gere um segredo qualquer e configure-o tanto no painel do Escavador (campo de assinatura de webhook, se houver) quanto na variável `ESCAVADOR_WEBHOOK_SECRET` aqui.

## 3. E-mails de alerta — Resend

1. Crie uma conta grátis em https://resend.com **usando o mesmo e-mail que vai receber os alertas de prazo** (necessário porque, sem domínio verificado, só dá pra mandar e-mail pro dono da conta — ver pegadinha acima).
2. Gere uma API key → variável `RESEND_API_KEY`.
3. Defina `NOTIFICATIONS_FROM_EMAIL="onboarding@resend.dev"` (domínio de teste deles, funciona sem configuração de DNS).

## 4. Deploy — Vercel

1. Suba este projeto para um repositório no GitHub (posso te ajudar com isso).
2. Crie uma conta em https://vercel.com, importe o repositório.
3. Em **Settings → Environment Variables**, configure:
   - `DATABASE_URL` (do Supabase)
   - `ESCAVADOR_API_TOKEN`
   - `ESCAVADOR_WEBHOOK_SECRET`
   - `AUTH_SECRET` (gere um valor aleatório forte, ex: `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (a URL final do seu deploy, ex: `https://prazos.vercel.app`)
   - `RESEND_API_KEY`
   - `NOTIFICATIONS_FROM_EMAIL`
   - `CRON_SECRET` (gere outro valor aleatório — protege o endpoint de notificações diárias)
4. Faça o deploy.
5. Rode a migração no banco de produção (uma vez, do seu computador ou via terminal integrado):
   `DATABASE_URL="<url do supabase>" npx prisma migrate deploy`
6. Crie seu usuário de login em produção:
   `DATABASE_URL="<url do supabase>" ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD=sua-senha npm run db:seed`

## 5. Recomendado (gratuito, opcional, mas vale muito a pena)

Dado que esse sistema existe para não deixar passar prazo — um erro silencioso (cron que falha, e-mail que não sai) tem custo real. Duas ferramentas gratuitas fecham essa lacuna:

- **Sentry** (https://sentry.io, free tier ~5 mil erros/mês): avisa se alguma rota da aplicação der erro. Setup: `npx @sentry/wizard@latest -i nextjs` no projeto, depois seguir o assistente.
- **UptimeRobot** (https://uptimerobot.com, free): configure um monitor tipo "Heartbeat/Cron" apontando para `https://SEU-DOMINIO/api/cron/notificacoes` — ele te avisa por e-mail se o cron diário parar de responder.

Nenhum dos dois é obrigatório para o sistema funcionar, mas sem eles uma falha pode passar despercebida por dias.

## O que eu preciso de você para ativar tudo isso

Se quiser que eu finalize a configuração e o deploy, me envie (com segurança, não em texto puro no chat se possível):
- A `DATABASE_URL` do Supabase
- O token da API do Escavador
- A API key do Resend
- Acesso para importar o repositório no seu Vercel (ou eu preparo tudo e você importa)

Também posso seguir sem integrar Escavador/Resend agora — o sistema funciona com cadastro e cálculo de prazos 100% manual, e essas integrações podem ser plugadas depois sem mudar a estrutura.
