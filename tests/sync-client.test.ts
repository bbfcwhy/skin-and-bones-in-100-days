import { describe, expect, it } from "vitest";
import {
  requestHealth,
  requestLogin,
  requestPull,
  requestPush,
  requestRegister,
} from "../src/lib/sync-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Call {
  url: string;
  init?: RequestInit;
}

/** 攔住 fetch：記下每次呼叫，照排好的順序回傳假回應。 */
function stubFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetchImpl };
}

describe("sync-client 的錯誤分類", () => {
  it("登入成功時回傳 token 與到期時間", async () => {
    const { calls, fetchImpl } = stubFetch([
      jsonResponse(200, { token: "abc.def", expiresAt: "2026-09-10T00:00:00.000Z" }),
    ]);

    const result = await requestLogin(
      { baseUrl: "https://sync.example.com", fetchImpl },
      "will@example.com",
      "hunter2hunter2",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token).toBe("abc.def");
    expect(result.data.expiresAt).toBe("2026-09-10T00:00:00.000Z");
    expect(calls[0].url).toBe("https://sync.example.com/auth/login");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: "will@example.com",
      password: "hunter2hunter2",
    });
  });

  it("401 分類成 unauthorized，並沿用伺服器的訊息", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(401, { error: "登入失敗，請確認帳號與密碼。" })]);

    const result = await requestLogin({ baseUrl: "https://sync.example.com", fetchImpl }, "a@b.c", "12345678");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unauthorized");
    expect(result.status).toBe(401);
    expect(result.message).toBe("登入失敗，請確認帳號與密碼。");
  });

  it("403 分類成 forbidden（此服務已有人註冊）", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(403, { error: "此服務不開放註冊。" })]);

    const result = await requestRegister({ baseUrl: "https://sync.example.com", fetchImpl }, "a@b.c", "12345678");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("forbidden");
    expect(result.status).toBe(403);
  });

  it("fetch 直接丟例外時分類成 network", async () => {
    const { fetchImpl } = stubFetch([new TypeError("Failed to fetch")]);

    const result = await requestHealth({ baseUrl: "https://sync.example.com", fetchImpl });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("network");
    expect(result.status).toBeNull();
    expect(result.message).toContain("連不上");
  });

  it("500 與其他狀態一律分類成 other", async () => {
    const { fetchImpl } = stubFetch([jsonResponse(500, { error: "伺服器錯誤，請稍後再試。" })]);

    const result = await requestPull({ baseUrl: "https://sync.example.com", fetchImpl }, "token-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("other");
    expect(result.status).toBe(500);
  });

  it("回應不是 JSON 時也不會炸掉，分類成 other", async () => {
    const { fetchImpl } = stubFetch([new Response("<html>502</html>", { status: 502 })]);

    const result = await requestHealth({ baseUrl: "https://sync.example.com", fetchImpl });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("other");
  });

  it("health 回傳 registered 讓 UI 判斷要不要開帳號", async () => {
    const { calls, fetchImpl } = stubFetch([jsonResponse(200, { ok: true, registered: false })]);

    const result = await requestHealth({ baseUrl: "https://sync.example.com/", fetchImpl });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.registered).toBe(false);
    // baseUrl 尾端的斜線不能變成 //health
    expect(calls[0].url).toBe("https://sync.example.com/health");
  });

  it("pull 會帶上 Bearer token", async () => {
    const { calls, fetchImpl } = stubFetch([jsonResponse(200, { profile: null, records: [] })]);

    const result = await requestPull({ baseUrl: "https://sync.example.com", fetchImpl }, "token-42");

    expect(result.ok).toBe(true);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-42");
    expect(calls[0].url).toBe("https://sync.example.com/sync");
  });

  it("push 用 PUT 送出 payload，token 失效回 unauthorized", async () => {
    const { calls, fetchImpl } = stubFetch([jsonResponse(401, { error: "登入已過期，請重新登入。" })]);
    const payload = {
      profile: { payload: "{}", updatedAt: "2026-08-11T00:00:00.000Z" },
      records: [{ dateKey: "2026-08-11", payload: "{}", updatedAt: "2026-08-11T00:00:00.000Z" }],
    };

    const result = await requestPush({ baseUrl: "https://sync.example.com", fetchImpl }, "token-42", payload);

    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(payload);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("unauthorized");
  });
});
