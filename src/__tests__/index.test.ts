import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../index";
import type { Env } from "../index";

// KVモック
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

// AIモック
function createAIMock(): Ai {
  return {
    run: vi.fn().mockResolvedValue({ response: "AIからのテスト応答です。" }),
  } as unknown as Ai;
}

function createEnv(): Env {
  return {
    AI: createAIMock(),
    CHAT_HISTORY: createKVMock(),
  };
}

describe("worker", () => {
  let env: Env;

  beforeEach(() => {
    env = createEnv();
  });

  it("OPTIONS request should return 204 with CORS headers", async () => {
    const request = new Request("http://localhost/chat", { method: "OPTIONS" });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("GET /characters should return character list", async () => {
    const request = new Request("http://localhost/characters", {
      method: "GET",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Array<{
      id: string;
      name: string;
      description: string;
    }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].id).toBeTruthy();
    expect(data[0].name).toBeTruthy();
    // systemPrompt はレスポンスに含まれないこと
    expect("systemPrompt" in data[0]).toBe(false);
  });

  it("POST /chat should return AI reply", async () => {
    const request = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-session",
        message: "こんにちは",
      }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      sessionId: string;
      reply: string;
      characterId: string;
    };
    expect(data.sessionId).toBe("test-session");
    expect(data.reply).toBe("AIからのテスト応答です。");
    expect(data.characterId).toBe("assistant");
  });

  it("POST /chat should accept a specific characterId", async () => {
    const request = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-session-2",
        message: "こんにちは",
        characterId: "friendly",
      }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      characterId: string;
      characterName: string;
    };
    expect(data.characterId).toBe("friendly");
  });

  it("POST /chat should fall back to default character for unknown characterId", async () => {
    const request = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "test-session-3",
        message: "テスト",
        characterId: "nonexistent",
      }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { characterId: string };
    expect(data.characterId).toBe("assistant");
  });

  it("POST /chat should return 400 when sessionId is missing", async () => {
    const request = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "こんにちは" }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("sessionId");
  });

  it("POST /chat should return 400 when message is missing", async () => {
    const request = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "abc" }),
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("message");
  });

  it("GET /history/:sessionId should return 404 for unknown session", async () => {
    const request = new Request("http://localhost/history/unknown-session", {
      method: "GET",
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(404);
  });

  it("GET /history/:sessionId should return history after chat", async () => {
    // まずチャット
    const chatRequest = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "history-session",
        message: "履歴テスト",
      }),
    });
    await worker.fetch(chatRequest, env);

    // 履歴取得
    const historyRequest = new Request(
      "http://localhost/history/history-session",
      { method: "GET" }
    );
    const response = await worker.fetch(historyRequest, env);
    expect(response.status).toBe(200);
    const history = (await response.json()) as {
      sessionId: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(history.sessionId).toBe("history-session");
    expect(history.messages).toHaveLength(2);
    expect(history.messages[0].role).toBe("user");
    expect(history.messages[0].content).toBe("履歴テスト");
  });

  it("DELETE /history/:sessionId should delete history", async () => {
    // チャットして履歴を作成
    const chatRequest = new Request("http://localhost/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "delete-session",
        message: "削除テスト",
      }),
    });
    await worker.fetch(chatRequest, env);

    // 削除
    const deleteRequest = new Request(
      "http://localhost/history/delete-session",
      { method: "DELETE" }
    );
    const deleteResponse = await worker.fetch(deleteRequest, env);
    expect(deleteResponse.status).toBe(200);

    // 削除後に取得すると404
    const getRequest = new Request("http://localhost/history/delete-session", {
      method: "GET",
    });
    const getResponse = await worker.fetch(getRequest, env);
    expect(getResponse.status).toBe(404);
  });

  it("unknown route should return 404", async () => {
    const request = new Request("http://localhost/unknown", { method: "GET" });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(404);
  });

  it("all responses should include CORS headers", async () => {
    const request = new Request("http://localhost/characters", {
      method: "GET",
    });
    const response = await worker.fetch(request, env);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
