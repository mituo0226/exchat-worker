import { describe, it, expect, beforeEach } from "vitest";
import { getHistory, appendMessage, deleteHistory } from "../history";

// シンプルなKVモック
function createKVMock(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    getWithMetadata: async () => ({ value: null, metadata: null }),
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
  } as unknown as KVNamespace;
}

describe("history", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createKVMock();
  });

  it("getHistory should return null for unknown session", async () => {
    const result = await getHistory(kv, "nonexistent");
    expect(result).toBeNull();
  });

  it("appendMessage should create new history for a new session", async () => {
    const history = await appendMessage(
      kv,
      "session-1",
      "assistant",
      "こんにちは",
      "こんにちは！何かお手伝いできますか？"
    );
    expect(history.sessionId).toBe("session-1");
    expect(history.characterId).toBe("assistant");
    expect(history.messages).toHaveLength(2);
    expect(history.messages[0].role).toBe("user");
    expect(history.messages[0].content).toBe("こんにちは");
    expect(history.messages[1].role).toBe("assistant");
    expect(history.messages[1].content).toBe(
      "こんにちは！何かお手伝いできますか？"
    );
  });

  it("appendMessage should append to existing history", async () => {
    await appendMessage(kv, "session-2", "assistant", "最初のメッセージ", "最初の返答");
    const history = await appendMessage(
      kv,
      "session-2",
      "assistant",
      "2番目のメッセージ",
      "2番目の返答"
    );
    expect(history.messages).toHaveLength(4);
  });

  it("getHistory should return saved history", async () => {
    await appendMessage(
      kv,
      "session-3",
      "friendly",
      "テスト",
      "テスト返答"
    );
    const history = await getHistory(kv, "session-3");
    expect(history).not.toBeNull();
    expect(history?.sessionId).toBe("session-3");
    expect(history?.messages).toHaveLength(2);
  });

  it("deleteHistory should remove history from KV", async () => {
    await appendMessage(kv, "session-4", "assistant", "削除テスト", "削除テスト返答");
    await deleteHistory(kv, "session-4");
    const history = await getHistory(kv, "session-4");
    expect(history).toBeNull();
  });
});
