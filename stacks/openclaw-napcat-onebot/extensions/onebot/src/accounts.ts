import { readFileSync } from "node:fs";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
} from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { OnebotAccountConfig, ResolvedOnebotAccount } from "./types.ts";

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.onebot?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  const ids = new Set<string>();
  for (const key of Object.keys(accounts)) {
    if (key.trim()) {
      ids.add(normalizeAccountId(key));
    }
  }
  return [...ids];
}

function resolveAccountConfig(cfg: OpenClawConfig, accountId: string): OnebotAccountConfig | null {
  const accounts = cfg.channels?.onebot?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return null;
  }
  const direct = accounts[accountId] as OnebotAccountConfig | undefined;
  if (direct) {
    return direct;
  }
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? ((accounts[matchKey] as OnebotAccountConfig | undefined) ?? null) : null;
}

function mergeAccountConfig(cfg: OpenClawConfig, accountId: string): OnebotAccountConfig {
  const {
    accounts: _ignored,
    defaultAccount: _ignoredDefault,
    ...base
  } = (cfg.channels?.onebot ?? {}) as OnebotAccountConfig & {
    accounts?: unknown;
    defaultAccount?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function normalizeIdList(list?: Array<string | number>): string[] {
  if (!list || !Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry)))
    .filter(Boolean);
}

function resolveToken(params: {
  accountId: string;
  merged: OnebotAccountConfig;
}): { token: string; source: ResolvedOnebotAccount["tokenSource"] } {
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    const envToken = process.env.ONEBOT_TOKEN?.trim();
    if (envToken) {
      return { token: envToken, source: "env" };
    }
  }

  const tokenFile = params.merged.tokenFile?.trim();
  if (tokenFile) {
    try {
      const fileToken = readFileSync(tokenFile, "utf-8").trim();
      if (fileToken) {
        return { token: fileToken, source: "tokenFile" };
      }
    } catch {
      // Ignore unreadable files here; status will surface missing configuration.
    }
  }

  const configToken = normalizeResolvedSecretInputString({
    value: params.merged.token,
    path: `channels.onebot.accounts.${params.accountId}.token`,
  });
  if (configToken) {
    return { token: configToken, source: "config" };
  }

  return { token: "", source: "none" };
}

export function listOnebotAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultOnebotAccountId(cfg: OpenClawConfig): string {
  const preferred = normalizeOptionalAccountId(cfg.channels?.onebot?.defaultAccount);
  if (
    preferred &&
    listOnebotAccountIds(cfg).some((accountId) => normalizeAccountId(accountId) === preferred)
  ) {
    return preferred;
  }
  const ids = listOnebotAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveOnebotAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedOnebotAccount {
  const accountId = params.accountId?.trim() ? normalizeAccountId(params.accountId) : DEFAULT_ACCOUNT_ID;
  const baseEnabled = params.cfg.channels?.onebot?.enabled !== false;
  const merged = mergeAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const envWsUrl = accountId === DEFAULT_ACCOUNT_ID ? process.env.ONEBOT_WS_URL?.trim() : "";
  const envHttpUrl = accountId === DEFAULT_ACCOUNT_ID ? process.env.ONEBOT_HTTP_URL?.trim() : "";

  const wsUrl = (merged.wsUrl?.trim() || envWsUrl || "").trim();
  const httpUrl = (merged.httpUrl?.trim() || envHttpUrl || "").trim();
  const tokenResolution = resolveToken({ accountId, merged });
  const token = tokenResolution.token;

  const configured = Boolean(wsUrl && httpUrl && token);

  const selfIdRaw = merged.selfId != null ? String(merged.selfId).trim() : "";
  const selfId = selfIdRaw || undefined;

  const allowFrom = normalizeIdList(merged.allowFrom);
  const allowGroups = normalizeIdList(merged.allowGroups);

  return {
    accountId,
    enabled,
    configured,
    name: merged.name?.trim() || undefined,
    wsUrl,
    httpUrl,
    token,
    tokenSource: tokenResolution.source,
    selfId,
    config: {
      requireMention: merged.requireMention !== false,
      allowFrom,
      allowGroups,
      defaultTo: merged.defaultTo?.trim() || undefined,
    },
  };
}

