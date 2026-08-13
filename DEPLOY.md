# Guia de deploy (hospedagem na nuvem — stack 100% gratuita, por decisão sua)

Você optou por ficar no plano gratuito em tudo por enquanto (Vercel Hobby, Supabase Free, sem domínio próprio). Isso é totalmente viável para uso individual — só é importante entender as duas pegadinhas abaixo e como este projeto já lida com elas.

## Pegadinhas do plano gratuito e como já estão resolvidas

**Supabase pausa por inatividade (1 semana sem uso).** Isso já é mitigado automaticamente: os crons diários (`vercel.json` — monitoramento DataJud às 9h e notificações às 11h, horário de Brasília) consultam o banco todo santo dia — bem dentro da janela de 1 semana. Ou seja, **enquanto os crons estiverem ativos, o banco nunca vai pausar por inatividade**, mesmo que você não abra o sistema com frequência. Só fique atenta: se em algum momento remover ou desativar esses crons, o risco de pausa volta.

**Resend sem domínio verificado só envia para o e-mail dono da conta.** Isso não é um problema aqui: como o sistema é de uso individual e os alertas de prazo vão para o seu próprio e-mail (`notifyEmail` do seu usuário), basta criar a conta Resend com o mesmo e-mail que vai receber os alertas. Se um dia você quiser mandar alertas para outra pessoa (ex: um estagiário, ou vários advogados do escritório), aí sim vai precisar verificar um domínio próprio — trato isso como um passo futuro, não bloqueante agora.

**Vercel Hobby para uso profissional.** Você decidiu aceitar esse risco (é baixo na prática, mas existe tecnicamente pelos termos de uso). Nada a configurar aqui, só reforçando que você está ciente.

## 1. Banco de dados — Supabase

1. Crie uma conta grátis em https://supabase.com e um novo projeto.
2. Em **Project Settings → Database**, copie DUAS connection strings (isso é importante — usar só
   uma das duas trava o deploy, foi um bug real que já aconteceu neste projeto):
   - Modo **"Transaction"** (porta 6543) → variável `DATABASE_URL`. Usada em runtime pela
     aplicação (é rápida e aguenta muitas conexões simultâneas, mas roda em cima do PgBouncer).
     **Acrescente `?pgbouncer=true` no final da string** (ex:
     `...pooler.supabase.com:6543/postgres?pgbouncer=true`) — sem isso, o Prisma tenta reusar
     prepared statements que o PgBouncer em modo Transaction não garante permanecerem na mesma
     conexão física, e a aplicação passa a falhar aleatoriamente com erro
     `prepared statement "sN" already exists` (código Postgres 42P05). Esse foi outro bug real
     que já aconteceu neste projeto, depois do primeiro deploy funcionar — os primeiros cadastros
     de processo deram certo e só depois começou a falhar de forma intermitente.
   - Modo **"Session"** (porta 5432, mesmo host do pooler) → variável `DIRECT_URL`. Usada só pelo
     `prisma migrate deploy` no momento do build.
3. Por quê as duas: o `prisma migrate deploy` precisa de locks de sessão (advisory locks) que o
   PgBouncer em modo "Transaction" (porta 6543) não suporta. Se `DIRECT_URL` não estiver
   configurada, o `schema.prisma` cai para usar a mesma `DATABASE_URL` pooled também na migração —
   e o build fica **travado "Building..." por tempo indefinido**, sem erro claro, até estourar o
   timeout do Vercel. Isso já aconteceu neste projeto e consumiu ~9 minutos de build antes de ser
   diagnosticado. `prisma/schema.prisma` já está configurado para usar `directUrl = env("DIRECT_URL")`
   além de `url = env("DATABASE_URL")` — só falta garantir as duas variáveis no Vercel.

## 2. Monitoramento automático de processos — DataJud (implementado em 13/08)

Pesquisamos Escavador, Codilo, Judit.io, JusBrasil Soluções e TrackJud/Vigilant. Nenhum ficou
dentro do critério "self-service + orçamento baixo + monitora por número CNJ diretamente + todos
os tribunais" ao mesmo tempo:

- **Escavador**: mudou de modelo — API agora exige contato comercial (formulário + especialista), não é mais self-service.
- **Codilo / JusBrasil Soluções**: também exigem processo comercial, preços na faixa de R$1.000+/mês.
- **Judit.io**: self-service, cobertura ampla, mas preço pós-trial incerto/provavelmente alto para uso individual.
- **TrackJud/Vigilant**: self-service e barato (~R$0,10/consulta), mas monitora por **CPF**, não por número de processo — exigiria redesenhar o cadastro de processo para incluir CPF da parte e criar lógica de filtro sobre os alertas.

Em vez disso, optamos pela **API pública do DataJud (CNJ)** — gratuita, sem contrato comercial,
consulta direta por número de processo, cobre praticamente todos os tribunais do país. A limitação
principal: **não é tempo real**, os índices de cada tribunal têm defasagem de T+1 a T+7 dias. Isso
fica visível na UI (badge "DataJud · última verificação: ..." em cada processo monitorado) — o
sistema nunca esconde essa defasagem.

Como funciona:
- `src/lib/datajud.ts` — cliente da API, decompõe o número CNJ e resolve o endpoint do tribunal certo.
- `src/app/api/cron/monitoramento-datajud/route.ts` — cron diário (`vercel.json`, 9h de Brasília,
  2h antes do cron de notificações às 11h — dá tempo de os movimentos novos serem gravados antes da
  avaliação de prazos) que consulta cada processo com `fonteMonitoramento: "datajud"` e grava
  movimentações novas. IMPORTANTE: o campo `schedule` do Vercel Cron é sempre em UTC, nunca no
  fuso do usuário — como o Brasil não observa horário de verão desde 2019 (Brasília = UTC-3 o ano
  todo), 9h/11h de Brasília correspondem a `"0 12 * * *"`/`"0 14 * * *"` em `vercel.json`, não
  `"0 9 * * *"`/`"0 11 * * *"` (que seriam 6h/8h de Brasília). Ambos os crons rodam 1x/dia, dentro
  do limite do plano Hobby da Vercel (cron não pode rodar mais de uma vez ao dia nesse plano).
- `src/lib/heuristica-prazo.ts` — a função `detectarPossivelPrazoPorCodigoTpu` classifica os
  movimentos do DataJud pelo código oficial da Tabela Processual Unificada (mais confiável que a
  heurística de regex usada para outras fontes, que continua ativa sem alterações).
- Se a chave pública do CNJ for rotacionada (API responde 401/403), o cron não falha
  silenciosamente: envia e-mail de alerta (`enviarAlertaSistema`) e loga o erro.

Cadastro de processo aceita o checkbox "Monitorar automaticamente via DataJud"
(`src/app/dashboard/DashboardClient.tsx`), e processos já cadastrados podem ligar/desligar o
monitoramento a qualquer momento pelo botão no card do processo. A opção de monitoramento via
Escavador (`src/lib/escavador.ts`, campo `monitorarViaEscavador`) continua no código, mas escondida
na tela — pode ser reativada no futuro se decidirem seguir com um provedor comercial.

Se decidir seguir com o Escavador mais adiante (após resposta comercial deles), as variáveis
seriam:
- `ESCAVADOR_API_TOKEN`
- `ESCAVADOR_WEBHOOK_SECRET` (webhook aponta para `https://SEU-DOMINIO/api/webhooks/escavador`)

## 3. E-mails de alerta — Resend

1. Crie uma conta grátis em https://resend.com **usando o mesmo e-mail que vai receber os alertas de prazo** (necessário porque, sem domínio verificado, só dá pra mandar e-mail pro dono da conta — ver pegadinha acima).
2. Gere uma API key → variável `RESEND_API_KEY`.
3. Defina `NOTIFICATIONS_FROM_EMAIL="onboarding@resend.dev"` (domínio de teste deles, funciona sem configuração de DNS).

## 4. Deploy — Vercel

1. Suba este projeto para um repositório no GitHub (posso te ajudar com isso).
2. Crie uma conta em https://vercel.com, importe o repositório.
3. Em **Settings → Environment Variables**, configure (o Escavador fica de fora por enquanto — veja seção 2):
   - `DATABASE_URL` (do Supabase, connection string modo "Transaction", porta 6543)
   - `DIRECT_URL` (do Supabase, connection string modo "Session", porta 5432 — necessária para o `prisma migrate deploy` não travar o build, ver seção 1)
   - `AUTH_SECRET` (gere um valor aleatório forte, ex: `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (a URL final do seu deploy, ex: `https://prazos.vercel.app`)
   - `RESEND_API_KEY`
   - `NOTIFICATIONS_FROM_EMAIL`
   - `CRON_SECRET` (gere outro valor aleatório — protege os endpoints de cron diário)
   - `DATAJUD_API_KEY` (chave pública documentada pelo CNJ, não é uma credencial pessoal — ver
     https://datajud-wiki.cnj.jus.br/api-publica/acesso/)
4. Faça o deploy. A migração do banco roda sozinha nesse momento (o comando de build já inclui `prisma migrate deploy`), não precisa rodar nada manualmente.
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
