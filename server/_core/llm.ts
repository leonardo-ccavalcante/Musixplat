// Single LLM provider = OpenAI chat (operator decision 2026-06-20: one vendor — embeddings are OpenAI too,
// see server/knowledge/embedder.ts). Anthropic/Claude removed everywhere. The model only classifies/ranks
// TEXT and emits [C] markers — NEVER a measured number (CLAUDE.md §3.6/§8; every number stays SQL).

// Minimal structural shape of the OpenAI chat client — kept tiny so tests can fake it without the SDK.
export interface ChatClient {
  chat: {
    completions: {
      create(args: {
        model: string;
        max_tokens?: number;
        messages: ReadonlyArray<{ role: "system" | "user"; content: string }>;
      }): Promise<{ choices: ReadonlyArray<{ message: { content: string | null } }> }>;
    };
  };
}

// Default chat model for classify/rank — cheap + fast; enough for closed-list classification + ordering.
export const CHAT_MODEL = "gpt-4o-mini";

/** One system+user turn → assistant text. An empty/missing response THROWS so callers fail-closed (§3.7). */
export async function chatText(
  client: ChatClient,
  system: string,
  user: string,
  maxTokens = 256,
  model = CHAT_MODEL,
): Promise<string> {
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
  return content;
}

/** Lazy OpenAI client (reads OPENAI_API_KEY by SDK default). Constructed only on the live path — tests
 *  never reach here (they short-circuit to the deterministic provider under vitest). */
export async function openaiChatClient(): Promise<ChatClient> {
  const { default: OpenAI } = await import("openai");
  return new OpenAI() as unknown as ChatClient;
}
