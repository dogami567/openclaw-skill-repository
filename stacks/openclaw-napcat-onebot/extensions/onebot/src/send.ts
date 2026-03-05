import type { ResolvedOnebotAccount } from "./types.ts";

type OnebotResponse = {
  status?: string;
  retcode?: number;
  msg?: string;
  wording?: string;
};

function formatOnebotError(res: OnebotResponse | null, fallback: string): string {
  const msg = res?.wording || res?.msg;
  const status = res?.status;
  const retcode = res?.retcode;
  const parts = [fallback];
  if (status) {
    parts.push(`status=${status}`);
  }
  if (retcode != null) {
    parts.push(`retcode=${retcode}`);
  }
  if (msg) {
    parts.push(String(msg));
  }
  return parts.join(" ");
}

async function callOnebotHttp(params: {
  httpUrl: string;
  token: string;
  action: string;
  body: Record<string, unknown>;
}): Promise<OnebotResponse> {
  const base = params.httpUrl.replace(/\/+$/g, "");
  const path = params.action.replace(/^\/+/, "");
  const url = `${base}/${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.token.trim()) {
    headers.Authorization = `Bearer ${params.token.trim()}`;
  }
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.body),
  });
  const text = await resp.text();
  let json: OnebotResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as OnebotResponse) : null;
  } catch {
    // ignore
  }
  if (!resp.ok) {
    throw new Error(formatOnebotError(json, `OneBot HTTP ${resp.status} ${resp.statusText}`));
  }
  if (json && json.status && json.status !== "ok") {
    throw new Error(formatOnebotError(json, "OneBot error"));
  }
  if (json && typeof json.retcode === "number" && json.retcode !== 0) {
    throw new Error(formatOnebotError(json, "OneBot non-zero retcode"));
  }
  return json ?? {};
}

function toNumericId(raw: string): number | string {
  const trimmed = raw.trim();
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && String(parsed) === trimmed) {
    return parsed;
  }
  return trimmed;
}

export async function sendOnebotText(params: {
  account: ResolvedOnebotAccount;
  target:
    | { kind: "private"; userId: string }
    | { kind: "group"; groupId: string };
  text: string;
}): Promise<void> {
  const text = params.text.trim();
  if (!text) {
    return;
  }

  if (params.target.kind === "group") {
    await callOnebotHttp({
      httpUrl: params.account.httpUrl,
      token: params.account.token,
      action: "send_group_msg",
      body: {
        group_id: toNumericId(params.target.groupId),
        message: text,
      },
    });
    return;
  }

  await callOnebotHttp({
    httpUrl: params.account.httpUrl,
    token: params.account.token,
    action: "send_private_msg",
    body: {
      user_id: toNumericId(params.target.userId),
      message: text,
    },
  });
}
