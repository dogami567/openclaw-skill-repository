export type OnebotAccountConfig = {
  name?: string;
  enabled?: boolean;
  wsUrl?: string;
  httpUrl?: string;
  token?: string;
  tokenFile?: string;
  selfId?: string | number;
  requireMention?: boolean;
  allowFrom?: Array<string | number>;
  allowGroups?: Array<string | number>;
  defaultTo?: string;
};

export type ResolvedOnebotAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  wsUrl: string;
  httpUrl: string;
  token: string;
  tokenSource: "env" | "tokenFile" | "config" | "none";
  selfId?: string;
  config: {
    requireMention: boolean;
    allowFrom: string[];
    allowGroups: string[];
    defaultTo?: string;
  };
};

export type OnebotInboundMessage = {
  messageId: string;
  timestamp: number;
  userId: string;
  groupId?: string;
  isGroup: boolean;
  text: string;
  rawMessage?: string;
  wasMentioned: boolean;
  selfId?: string;
};

