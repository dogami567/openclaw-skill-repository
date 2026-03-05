import {
  createNormalizedOutboundDeliverer,
  createReplyPrefixOptions,
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls,
  type OpenClawConfig,
  type OutboundReplyPayload,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import { getOnebotRuntime } from "./runtime.ts";
import { sendOnebotText } from "./send.ts";
import type { OnebotInboundMessage, ResolvedOnebotAccount } from "./types.ts";

const CHANNEL_ID = "onebot" as const;

type OnebotSegment = {
  type?: unknown;
  data?: unknown;
};

function extractOnebotText(params: {
  message: unknown;
  rawMessage?: unknown;
  selfId?: string;
}): { text: string; wasMentioned: boolean; rawMessage?: string } {
  const selfId = params.selfId?.trim() || undefined;
  if (typeof params.message === "string") {
    return {
      text: params.message,
      wasMentioned: false,
      rawMessage: typeof params.rawMessage === "string" ? params.rawMessage : undefined,
    };
  }

  if (!Array.isArray(params.message)) {
    return {
      text: "",
      wasMentioned: false,
      rawMessage: typeof params.rawMessage === "string" ? params.rawMessage : undefined,
    };
  }

  let wasMentioned = false;
  const parts: string[] = [];
  for (const entry of params.message as unknown[]) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const seg = entry as OnebotSegment & { data?: Record<string, unknown> };
    const type = typeof seg.type === "string" ? seg.type : "";
    const data = seg.data && typeof seg.data === "object" ? (seg.data as Record<string, unknown>) : {};

    if (type === "text") {
      const text = typeof data.text === "string" ? data.text : "";
      if (text) {
        parts.push(text);
      }
      continue;
    }
    if (type === "at") {
      const qq = data.qq != null ? String(data.qq).trim() : "";
      if (selfId && qq && qq === selfId) {
        wasMentioned = true;
      }
      continue;
    }
  }

  return {
    text: parts.join(""),
    wasMentioned,
    rawMessage: typeof params.rawMessage === "string" ? params.rawMessage : undefined,
  };
}

function idInList(list: string[], id: string): boolean {
  const normalized = id.trim();
  if (!normalized) {
    return false;
  }
  if (list.includes("*")) {
    return true;
  }
  return list.some((entry) => entry.trim() === normalized);
}

async function deliverOnebotReply(params: {
  payload: OutboundReplyPayload;
  inbound: OnebotInboundMessage;
  peerId: string;
  account: ResolvedOnebotAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}) {
  const combined = formatTextWithAttachmentLinks(
    params.payload.text,
    resolveOutboundMediaUrls(params.payload),
  );
  if (!combined) {
    return;
  }

  const replyPrefix = params.payload.replyToId
    ? `[CQ:reply,id=${params.payload.replyToId}] `
    : params.inbound.messageId
      ? `[CQ:reply,id=${params.inbound.messageId}] `
      : "";

  const mentionPrefix =
    params.inbound.isGroup && params.inbound.userId
      ? `[CQ:at,qq=${params.inbound.userId}] `
      : "";

  const text = `${replyPrefix}${mentionPrefix}${combined}`.trim();

  await sendOnebotText({
    account: params.account,
    target: params.inbound.isGroup
      ? { kind: "group", groupId: params.peerId }
      : { kind: "private", userId: params.peerId },
    text,
  });
  params.statusSink?.({ lastOutboundAt: Date.now() });
}

export async function handleOnebotInbound(params: {
  event: {
    message: unknown;
    rawMessage?: unknown;
    selfId?: unknown;
    messageId?: unknown;
    time?: unknown;
    userId?: unknown;
    groupId?: unknown;
    messageType?: unknown;
  };
  account: ResolvedOnebotAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { event, account, config, runtime, statusSink } = params;
  const core = getOnebotRuntime();

  const isGroup = event.messageType === "group";
  const userId = event.userId != null ? String(event.userId).trim() : "";
  const groupId = event.groupId != null ? String(event.groupId).trim() : undefined;
  if (!userId) {
    return;
  }
  if (isGroup && !groupId) {
    return;
  }

  const selfIdResolved =
    (event.selfId != null ? String(event.selfId).trim() : "") ||
    (account.selfId ?? "");

  const extracted = extractOnebotText({
    message: event.message,
    rawMessage: event.rawMessage,
    selfId: selfIdResolved || undefined,
  });
  const rawBody = extracted.text.trim();
  if (!rawBody) {
    return;
  }

  const timestamp =
    typeof event.time === "number" && Number.isFinite(event.time)
      ? Math.trunc(event.time * 1000)
      : Date.now();
  statusSink?.({ lastInboundAt: timestamp });

  if (account.config.allowFrom.length > 0 && !idInList(account.config.allowFrom, userId)) {
    runtime.log?.(`onebot: drop sender ${userId} (not in allowFrom)`);
    return;
  }
  if (
    isGroup &&
    account.config.allowGroups.length > 0 &&
    !idInList(account.config.allowGroups, groupId ?? "")
  ) {
    runtime.log?.(`onebot: drop group ${groupId} (not in allowGroups)`);
    return;
  }

  const inbound: OnebotInboundMessage = {
    messageId:
      event.messageId != null && String(event.messageId).trim()
        ? String(event.messageId).trim()
        : `${Date.now()}`,
    timestamp,
    userId,
    groupId,
    isGroup,
    text: rawBody,
    rawMessage: extracted.rawMessage,
    wasMentioned: extracted.wasMentioned,
    selfId: selfIdResolved || undefined,
  };

  if (inbound.isGroup && account.config.requireMention && !inbound.wasMentioned) {
    return;
  }

  const peerId = inbound.isGroup ? (inbound.groupId as string) : inbound.userId;
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: inbound.isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const fromLabel = inbound.isGroup ? `group:${peerId}` : `qq:${userId}`;
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "OneBot",
    from: fromLabel,
    timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: inbound.isGroup ? `onebot:group:${peerId}` : `onebot:qq:${userId}`,
    To: inbound.isGroup ? `onebot:group:${peerId}` : `onebot:qq:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: inbound.isGroup ? "group" : "direct",
    ConversationLabel: inbound.isGroup ? `group:${peerId}` : `qq:${userId}`,
    SenderName: undefined,
    SenderId: userId,
    GroupSubject: inbound.isGroup ? `group:${peerId}` : undefined,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    WasMentioned: inbound.isGroup ? inbound.wasMentioned : undefined,
    MessageSid: inbound.messageId,
    Timestamp: timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: inbound.isGroup ? `onebot:group:${peerId}` : `onebot:qq:${peerId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`onebot: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  const deliverReply = createNormalizedOutboundDeliverer(async (payload) => {
    await deliverOnebotReply({
      payload,
      inbound,
      peerId,
      account,
      cfg: config,
      runtime,
      statusSink,
    });
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: deliverReply,
      onError: (err, info) => {
        runtime.error?.(`onebot ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

