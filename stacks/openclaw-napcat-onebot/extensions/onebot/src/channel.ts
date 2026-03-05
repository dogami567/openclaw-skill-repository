import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, type ChannelPlugin } from "openclaw/plugin-sdk";
import { listOnebotAccountIds, resolveDefaultOnebotAccountId, resolveOnebotAccount } from "./accounts.ts";
import { monitorOnebotProvider } from "./monitor.ts";
import type { ResolvedOnebotAccount } from "./types.ts";

export const onebotPlugin: ChannelPlugin<ResolvedOnebotAccount> = {
  id: "onebot",
  meta: {
    id: "onebot",
    label: "OneBot",
    selectionLabel: "NapCat (OneBot v11)",
    docsPath: "/tools/plugin",
    docsLabel: "plugins",
    blurb: "QQ via NapCat OneBot v11 (WebSocket + HTTP).",
    aliases: ["napcat", "onebot11", "qq"],
    order: 90,
    quickstartAllowFrom: false,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.onebot"] },
  configSchema: {
    // Keep this permissive for local deployments; strict validation is already
    // handled at the manifest level for channel discovery.
    schema: {
      type: "object",
      additionalProperties: true,
    },
    uiHints: {
      token: { sensitive: true },
      tokenFile: { sensitive: true },
    },
  },
  config: {
    listAccountIds: (cfg: OpenClawConfig) => listOnebotAccountIds(cfg),
    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) =>
      resolveOnebotAccount({ cfg, accountId }),
    defaultAccountId: (cfg: OpenClawConfig) => resolveDefaultOnebotAccountId(cfg),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.httpUrl,
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveOnebotAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }).config.allowFrom,
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
    resolveDefaultTo: ({ cfg, accountId }) =>
      resolveOnebotAccount({ cfg, accountId: accountId ?? DEFAULT_ACCOUNT_ID }).config.defaultTo,
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.enabled) {
        return;
      }
      if (!account.configured) {
        throw new Error(
          `OneBot is not configured for account \"${ctx.accountId}\" (need channels.onebot.wsUrl/httpUrl/token).`,
        );
      }
      ctx.log?.info?.(`[${ctx.accountId}] starting OneBot provider (${account.wsUrl})`);
      await monitorOnebotProvider({
        account,
        accountId: ctx.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
