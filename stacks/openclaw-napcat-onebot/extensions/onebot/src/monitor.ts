import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { getOnebotRuntime } from "./runtime.ts";
import { handleOnebotInbound } from "./inbound.ts";
import type { ResolvedOnebotAccount } from "./types.ts";

function sleepWithAbort(ms: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}

function buildWsUrl(wsUrl: string, token: string): string {
  try {
    const url = new URL(wsUrl);
    if (token.trim() && !url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", token.trim());
    }
    return url.toString();
  } catch {
    const trimmed = wsUrl.trim();
    if (!token.trim()) {
      return trimmed;
    }
    const suffix = `access_token=${encodeURIComponent(token.trim())}`;
    return trimmed.includes("?") ? `${trimmed}&${suffix}` : `${trimmed}?${suffix}`;
  }
}

function coerceString(value: unknown): string {
  return value != null ? String(value).trim() : "";
}

function messageDataToText(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data ?? "");
}

export async function monitorOnebotProvider(params: {
  account: ResolvedOnebotAccount;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: {
    connected?: boolean;
    lastConnectedAt?: number;
    lastDisconnect?: { at: number; status?: number; error?: string };
    lastInboundAt?: number;
    lastOutboundAt?: number;
    lastError?: string | null;
  }) => void;
}): Promise<void> {
  const core = getOnebotRuntime();
  const logger = core.logging.getChildLogger({ channel: "onebot", accountId: params.accountId });

  let attempt = 0;
  while (!params.abortSignal.aborted) {
    const url = buildWsUrl(params.account.wsUrl, params.account.token);
    logger.info?.(`[${params.accountId}] connecting ${url}`);

    const ws = new WebSocket(url);

    const runOnce = await new Promise<{
      ok: boolean;
      code?: number;
      reason?: string;
      error?: string;
    }>((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; code?: number; reason?: string; error?: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const stop = () => {
        try {
          ws.close(1000, "abort");
        } catch {
          // ignore
        }
      };
      params.abortSignal.addEventListener("abort", stop, { once: true });

      ws.addEventListener("open", () => {
        attempt = 0;
        params.statusSink?.({ connected: true, lastConnectedAt: Date.now(), lastError: null });
        logger.info?.(`[${params.accountId}] connected`);
      });

      ws.addEventListener("message", (event) => {
        const text = messageDataToText((event as { data?: unknown }).data);
        let json: Record<string, unknown> | null = null;
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return;
        }
        if (!json || json.post_type !== "message") {
          return;
        }
        const messageType = coerceString(json.message_type);
        if (messageType !== "private" && messageType !== "group") {
          return;
        }
        void handleOnebotInbound({
          event: {
            message: json.message,
            rawMessage: json.raw_message,
            selfId: json.self_id,
            messageId: json.message_id,
            time: json.time,
            userId: json.user_id,
            groupId: json.group_id,
            messageType,
          },
          account: params.account,
          config: params.config,
          runtime: params.runtime,
          statusSink: (patch) => params.statusSink?.(patch),
        }).catch((err) => {
          params.runtime.error?.(`onebot: inbound handling failed: ${String(err)}`);
        });
      });

      ws.addEventListener("error", (event) => {
        const msg = (event as { message?: unknown }).message;
        finish({ ok: false, error: typeof msg === "string" ? msg : "WebSocket error" });
      });

      ws.addEventListener("close", (event) => {
        const code = (event as { code?: unknown }).code;
        const reason = (event as { reason?: unknown }).reason;
        const codeNum = typeof code === "number" ? code : Number(code);
        const reasonText = typeof reason === "string" ? reason : "";
        finish({
          ok: Number.isFinite(codeNum) ? codeNum === 1000 : false,
          code: Number.isFinite(codeNum) ? codeNum : undefined,
          reason: reasonText,
        });
      });
    });

    params.statusSink?.({
      connected: false,
      lastDisconnect: {
        at: Date.now(),
        status: runOnce.code,
        error: runOnce.error ?? runOnce.reason,
      },
    });

    if (params.abortSignal.aborted) {
      return;
    }

    attempt += 1;
    const delayMs = Math.min(60_000, 2_000 * Math.pow(2, Math.min(attempt, 6)));
    const why = runOnce.error ?? runOnce.reason ?? `code=${String(runOnce.code ?? "")}`;
    logger.warn?.(
      `[${params.accountId}] disconnected (${why || "unknown"}); retrying in ${Math.round(delayMs / 1000)}s`,
    );
    await sleepWithAbort(delayMs, params.abortSignal);
  }
}
