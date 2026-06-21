// Single LLM provider = OpenAI chat (operator decision 2026-06-20: one vendor — embeddings are OpenAI too,
// see server/knowledge/embedder.ts). Anthropic/Claude removed everywhere. The model only classifies/ranks
// TEXT and emits [C] markers — NEVER a measured number (CLAUDE.md §3.6/§8; every number stays SQL).

// Token counts a provider reports for one call. These are FACTS returned by OpenAI/OpenRouter (not an
// LLM-produced number) — the COST is computed later in SQL from Config_Knobs prices (§3.6/§14).
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Minimal structural shape of the OpenAI chat client — kept tiny so tests can fake it without the SDK.
// `usage` is optional in the shape (OpenAI/OpenRouter always send it; a fake may omit it ⇒ zeros).
export interface ChatClient {
  chat: {
    completions: {
      create(args: {
        model: string;
        max_tokens?: number;
        messages: ReadonlyArray<{ role: "system" | "user"; content: string }>;
      }): Promise<{
        choices: ReadonlyArray<{ message: { content: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      }>;
    };
  };
}

// Default chat model for classify/rank — cheap + fast; enough for closed-list classification + ordering.
export const CHAT_MODEL = "gpt-4o-mini";

export interface ChatResult {
  text: string;
  usage: TokenUsage;
}

/** One system+user turn → assistant text + token usage. An empty/missing response THROWS so callers
 *  fail-closed (§3.7). Usage is surfaced (zeros if the provider omits it) so the call-site can log
 *  cost-per-process; the count is a provider fact, the cost is SQL (§3.6). */
export async function chatText(
  client: ChatClient,
  system: string,
  user: string,
  maxTokens = 256,
  model = CHAT_MODEL,
): Promise<ChatResult> {
  const res = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("openai chat: empty response");
  return {
    text: content,
    usage: {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
    },
  };
}

/** Lazy OpenAI client (reads OPENAI_API_KEY by SDK default). Constructed only on the live path — tests
 *  never reach here (they short-circuit to the deterministic provider under vitest). */
export async function openaiChatClient(): Promise<ChatClient> {
  const { default: OpenAI } = await import("openai");
  return new OpenAI() as unknown as ChatClient;
}
