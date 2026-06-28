# Ligar o chatbot de suporte (Telegram) — passo a passo

Runbook do operador para a **Fatia 1** (o bot ENTENDE o problema do dono do restaurante).
Tudo GUI-first. Tempo total ~15 min.

**Como funciona (1 frase):** o Telegram manda a mensagem → o n8n (relê) faz `POST /api/chat` na
plataforma (no Railway) → a plataforma roda o agente + o diagnóstico e devolve `{reply}` → o n8n
responde no Telegram. Amanhã o Intercom é o **mesmo `/api/chat`**, troca só o relê.

Quem mora onde: **Railway** = a plataforma + o `/api/chat` (o cérebro) · **Supabase** = só o banco ·
**n8n Cloud** = o relê + o webhook do Telegram · **Telegram** = o bot.

---

## ⚠️ ANTES de mergear — 1 coisa obrigatória (senão o deploy não sobe)

O guard de boot agora exige `AGENT_GATEWAY_TOKEN` em produção. **Sem ela, o servidor falha ao iniciar
(crash-loop).** Então:

1. **Gere um token forte** (qualquer um destes):
   - terminal: `openssl rand -hex 32`
   - ou um gerador de senha (32+ caracteres aleatórios).
   - ⚠️ guarde esse valor — você vai usá-lo em DOIS lugares (Railway e n8n). Eles têm que ser IGUAIS.
2. **Railway → seu projeto → Variables → New Variable:**
   - `AGENT_GATEWAY_TOKEN` = o valor gerado.
   - (Confira que `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL` já existem — já existiam.)

---

## Passo 1 — Merge (o banco se cuida sozinho)

- Aprove e mergeie o **PR #80** no `main`.
- O Railway faz deploy automático. No deploy, o `preDeployCommand` (`apply-hosted`) **aplica a migration
  nova sozinho** (`migrate()` é idempotente) — você **não** roda SQL à mão.
- Verifique que subiu: abra `https://SEU-DOMINIO-RAILWAY/healthz` → deve responder `{"ok":true}`.
  - *(Fallback GUI raro: se algum dia quiser aplicar a migration à mão, ela está em
    `supabase/migrations/20260628130000_agent_chat_gateway.sql` — cole no Supabase → SQL Editor. É
    `create table if not exists`, então rodar de novo não quebra nada.)*

## Passo 2 — Criar o bot no Telegram

1. No Telegram, fale com **@BotFather** → `/newbot` → siga os passos.
2. Ele te dá um **token do bot**. Guarde.

## Passo 3 — Importar o relê no n8n

1. n8n Cloud (`leonardocavalcante.app.n8n.cloud`) → **Workflows → Import from File**.
2. Selecione **`docs/agent-chat/telegram-relay.n8n.json`** (deste repo).
3. Vão aparecer 3 nós: `Telegram Trigger → POST /api/chat → Telegram Send`.

## Passo 4 — Configurar credenciais e URL no n8n

1. **Credencial do Telegram** (nos nós `Telegram Trigger` e `Telegram Send`): crie/escolha uma
   credencial `Telegram API` com o **token do bot** (Passo 2).
2. **Credencial do gateway** (no nó `POST /api/chat`): crie uma credencial **Header Auth**.
   ⚠️ **Cuidado — a tela tem DOIS campos "Name":**
   - o **nome da credencial** (o rótulo, no topo) pode ser qualquer coisa, ex.: `Musixplat Gateway Token`;
   - o campo **Name** (o nome do header HTTP) tem que ser **exatamente** `Authorization` — NÃO o rótulo.
   - **Value** = `Bearer <AGENT_GATEWAY_TOKEN>`  ← o MESMO token do Railway (com `Bearer ` na frente).
   - Se puser o rótulo no campo Name, dá `ERR_INVALID_HTTP_TOKEN: Header name must be a valid HTTP token`.
3. **URL** (no nó `POST /api/chat`): troque `https://REPLACE-WITH-YOUR-RAILWAY-DOMAIN/api/chat` pelo
   seu domínio real do Railway. (Railway → Settings → Networking → Generate Domain, se ainda não tiver.)

## Passo 5 — Ativar

- Ligue o toggle **Active** do workflow (canto superior direito).
- Isso **registra o webhook no Telegram automaticamente** — você NÃO precisa chamar `setWebhook` à mão.

## Passo 6 — Testar

1. **Plataforma viva:** `https://SEU-DOMINIO-RAILWAY/healthz` → `{"ok":true}`.
2. **Gateway direto** (prova o cérebro + a auth, sem o n8n) — cole no terminal trocando os valores:
   ```bash
   curl -X POST https://SEU-DOMINIO-RAILWAY/api/chat \
     -H "Authorization: Bearer SEU_AGENT_GATEWAY_TOKEN" \
     -H "content-type: application/json" \
     -d '{"channel":"telegram","external_id":123,"text":"oi"}'
   # → {"reply":"..."}  (vai pedir o id do restaurante)
   ```
3. **Ponta a ponta:** mande "oi" pro bot no Telegram → ele responde e pede o **id interno do seu
   restaurante**. Mande um id real (ex.: `R001`) → ele liga você ao restaurante → conte o problema
   (ex.: "muitos pagamentos falhando") → ele responde com o número medido.
4. **Webhook saudável (diagnóstico):**
   ```bash
   curl "https://api.telegram.org/bot<TOKEN_DO_BOT>/getWebhookInfo"   # url do n8n + pending:0
   ```

---

## O que cada chamada é (GET vs POST)

| Chamada | O que é |
|---|---|
| `GET /healthz` (Railway) | só checa se a plataforma está viva |
| `POST /api/chat` (Railway) | a chamada real (n8n→plataforma); exige o Bearer |
| Telegram → n8n | POST automático (o webhook), ligado ao **ativar** o workflow |

## Limites desta fatia (honesto)
- **Identidade demo-grade:** quem souber um id interno de restaurante consegue consultá-lo. OK para
  demo; o hardening (código de vínculo único) é follow-up.
- **Só ENTENDER:** o bot diagnostica e responde números; ele ainda **não age** (propor/resolver) nem
  mexe em dinheiro — isso é a Fatia 2 (dinheiro sempre com humano no loop).
- **Sem tela nova** na plataforma; a "tela" do dono é o Telegram.

## Problemas comuns
- **Deploy em crash-loop logo após o merge** → faltou `AGENT_GATEWAY_TOKEN` no Railway (passo obrigatório).
- **Bot responde "Tive uma dificuldade…"** → normalmente falta `OPENAI_API_KEY` no Railway, ou o token
  do gateway no n8n ≠ o do Railway.
- **401 no `/api/chat`** → o header `Authorization: Bearer …` no n8n não bate com `AGENT_GATEWAY_TOKEN`.
- **Bot não responde nada** → o workflow não está **Active**, ou a URL do Railway no nó está errada.
