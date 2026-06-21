import { query } from "../db/pool.js";
import { CHAT_MODEL } from "./llm.js";

// Resolve the operator-selected chat model (knob llm_chat_model, §3.8 by name) at call time, so picking
// a model in the AI Cost settings takes effect on the next agent call. Fail-safe to the default model.
export type KnobReader = () => Promise<string | undefined>;

const dbReader: KnobReader = async () => {
  const r = await query<{ value: string }>(
    `select value from catalog."Config_Knobs" where key = 'llm_chat_model'`,
  );
  return r[0]?.value;
};

export async function getActiveChatModel(read: KnobReader = dbReader): Promise<string> {
  return (await read()) || CHAT_MODEL;
}
