/**
 * 会話履歴管理
 * Cloudflare KV を使って会話履歴を保存・取得・削除する
 */

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ConversationHistory {
  sessionId: string;
  characterId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const KV_TTL = 60 * 60 * 24 * 7; // 7日間

export async function getHistory(
  kv: KVNamespace,
  sessionId: string
): Promise<ConversationHistory | null> {
  const raw = await kv.get(sessionId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConversationHistory;
  } catch {
    return null;
  }
}

export async function saveHistory(
  kv: KVNamespace,
  history: ConversationHistory
): Promise<void> {
  await kv.put(sessionId(history), JSON.stringify(history), {
    expirationTtl: KV_TTL,
  });
}

function sessionId(history: ConversationHistory): string {
  return history.sessionId;
}

export async function appendMessage(
  kv: KVNamespace,
  sessionId: string,
  characterId: string,
  userMessage: string,
  assistantReply: string
): Promise<ConversationHistory> {
  const now = Date.now();
  let history = await getHistory(kv, sessionId);

  if (!history) {
    history = {
      sessionId,
      characterId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  history.messages.push(
    { role: "user", content: userMessage, timestamp: now },
    { role: "assistant", content: assistantReply, timestamp: now }
  );
  history.updatedAt = now;
  history.characterId = characterId;

  await saveHistory(kv, history);
  return history;
}

export async function deleteHistory(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(sessionId);
}
