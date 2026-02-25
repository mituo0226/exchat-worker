import { describe, it, expect } from "vitest";
import {
  corsHeaders,
  handleOptions,
  jsonResponse,
  errorResponse,
} from "../cors";

describe("cors", () => {
  it("corsHeaders should include Access-Control-Allow-Origin *", () => {
    const headers = corsHeaders() as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("handleOptions should return 204 with CORS headers", () => {
    const response = handleOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });

  it("jsonResponse should return JSON with CORS headers", async () => {
    const response = jsonResponse({ hello: "world" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const data = await response.json();
    expect(data).toEqual({ hello: "world" });
  });

  it("jsonResponse should support custom status codes", async () => {
    const response = jsonResponse({ created: true }, 201);
    expect(response.status).toBe(201);
  });

  it("errorResponse should return error JSON with given status", async () => {
    const response = errorResponse("Something went wrong", 422);
    expect(response.status).toBe(422);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Something went wrong");
  });

  it("errorResponse defaults to 400", async () => {
    const response = errorResponse("Bad request");
    expect(response.status).toBe(400);
  });
});
