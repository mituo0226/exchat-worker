/**
 * exchat-worker メインエントリポイント
 *
 * 外部サイトのフリーページにAIチャットを設置するためのCloudflare Worker。
 * CORS対応のAPIを提供し、外部サイトからの呼び出しでキャラクターとの会話を管理する。
 *
 * API エンドポイント:
 *   POST   /chat                  - メッセージ送信・AI応答取得
 *   GET    /history/:sessionId    - 会話履歴取得
 *   DELETE /history/:sessionId    - 会話履歴削除
 *   GET    /characters            - キャラクター一覧取得
 */

import { handleOptions, jsonResponse, errorResponse } from "./cors";
import { CHARACTERS, getCharacter, getDefaultCharacter } from "./character";
import { getHistory, appendMessage, deleteHistory } from "./history";

export interface Env {
  AI: Ai;
  CHAT_HISTORY: KVNamespace;
}

type AiTextGenerationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // プリフライトリクエスト (CORS) の処理
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // GET /characters - キャラクター一覧
    if (request.method === "GET" && pathname === "/characters") {
      return jsonResponse(
        CHARACTERS.map(({ id, name, description }) => ({ id, name, description }))
      );
    }

    // POST /chat - メッセージ送信・AI応答取得
    if (request.method === "POST" && pathname === "/chat") {
      return handleChat(request, env);
    }

    // GET /history/:sessionId - 会話履歴取得
    const historyMatch = pathname.match(/^\/history\/([^/]+)$/);
    if (historyMatch) {
      const sessionId = decodeURIComponent(historyMatch[1]);

      if (request.method === "GET") {
        const history = await getHistory(env.CHAT_HISTORY, sessionId);
        if (!history) {
          return errorResponse("Session not found", 404);
        }
        return jsonResponse(history);
      }

      if (request.method === "DELETE") {
        await deleteHistory(env.CHAT_HISTORY, sessionId);
        return jsonResponse({ message: "History deleted" });
      }
    }

    return errorResponse("Not found", 404);
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  let body: { sessionId?: string; message?: string; characterId?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { sessionId, message, characterId } = body;

  if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
    return errorResponse("sessionId is required");
  }
  if (!message || typeof message !== "string" || message.trim() === "") {
    return errorResponse("message is required");
  }

  const character = characterId
    ? (getCharacter(characterId) ?? getDefaultCharacter())
    : getDefaultCharacter();

  // 既存の会話履歴を取得してコンテキストとして渡す
  const history = await getHistory(env.CHAT_HISTORY, sessionId);
  const previousMessages: AiTextGenerationMessage[] = history
    ? history.messages.map((m) => ({ role: m.role, content: m.content }))
    : [];

  const messages: AiTextGenerationMessage[] = [
    { role: "system", content: character.systemPrompt },
    ...previousMessages,
    { role: "user", content: message.trim() },
  ];

  // Cloudflare Workers AI で応答を生成
  const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages,
  });

  const reply =
    typeof aiResponse === "object" &&
    aiResponse !== null &&
    "response" in aiResponse &&
    typeof (aiResponse as { response: string }).response === "string"
      ? (aiResponse as { response: string }).response
      : "";

  if (!reply) {
    return errorResponse("Failed to generate AI response", 500);
  }

  // 会話履歴を保存
  await appendMessage(
    env.CHAT_HISTORY,
    sessionId,
    character.id,
    message.trim(),
    reply
  );

  return jsonResponse({
    sessionId,
    characterId: character.id,
    characterName: character.name,
    reply,
  });
}
