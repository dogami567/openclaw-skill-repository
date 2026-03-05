# OpenClaw + NapCat (OneBot 11)

这套 stack 用 Docker 一键在本机启动：

- OpenClaw Gateway（控制台 + Agent）
- NapCat（QQ WebUI + OneBot v11 HTTP/WS 网关）
- （可选）Clawdbot Gateway（带 Exa `web_search` provider）

并且内置一个本地 OpenClaw 插件 `onebot`，让 OpenClaw 通过 NapCat 的 OneBot v11 网关收发消息。

## 快速开始

1) 进入目录：

```bash
cd stacks/openclaw-napcat-onebot
```

2) 创建环境文件：

```bash
cp .env.example .env
```

3) 启动 + 自动补全配置（推荐用脚本）：

- Windows（PowerShell / pwsh）：
  - `powershell -ExecutionPolicy Bypass -File .\\scripts\\up.ps1`
- Linux / macOS：
  - `chmod +x scripts/*.sh`
  - `./scripts/up.sh`

脚本会做这些事：

- 写入 NapCat `onebot11.json`（避免 `MODE` 覆盖模板导致配置被重置）
- 把 `extensions/onebot` 复制进容器内 `~/.openclaw/extensions/onebot`
- 写入 OpenClaw 配置：`channels.onebot.*` + `plugins.entries.onebot.enabled`
- 同步 `.env` 里的 `OPENCLAW_GATEWAY_TOKEN` 到 `openclaw.json`（避免 token mismatch）

## 访问入口

- OpenClaw 健康检查：`http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789}/healthz`
- OpenClaw 控制台 URL（带 token）：运行
  - Windows：`powershell -ExecutionPolicy Bypass -File .\\scripts\\dashboard.ps1`
  - Linux/mac：`./scripts/dashboard.sh`
- NapCat WebUI：`http://127.0.0.1:${NAPCAT_WEBUI_PORT:-6099}/webui?token=${NAPCAT_WEBUI_TOKEN:-openclaw-napcat}`

## OneBot 网关（NapCat）

- HTTP（宿主机）：`http://127.0.0.1:${NAPCAT_HTTP_PORT:-6300}`（token：`${ONEBOT_TOKEN:-openclaw-napcat}`）
- WS（宿主机）：`ws://127.0.0.1:${NAPCAT_WS_PORT:-6301}`（token：`${ONEBOT_TOKEN:-openclaw-napcat}`）

OpenClaw 在容器内会使用：

- WS：`ws://napcat:3001`
- HTTP：`http://napcat:3000`

## 配置你的模型（示例：GMN 中转）

安装完成后直接编辑（持久化在宿主机）：

- `./data/openclaw/config/openclaw.json`

把 `models` / `agents` 里的配置替换成你的中转信息即可（把 `sk-xxxx` 换成你自己的 key）。

> 提示：你也可以在 OpenClaw 控制台里改配置，或用 `openclaw-cli config set ...`。

## 可选：启动 Clawdbot（Exa web_search）

默认不启动（使用 compose profile `clawdbot`）：

```bash
docker compose --env-file .env --profile clawdbot up -d clawdbot-gateway
```

## 数据目录

- OpenClaw：`./data/openclaw`
- NapCat：`./data/napcat`
- Clawdbot：`./data/clawdbot`（可选）

## Linux 权限（可选）

Linux 上如果遇到 “Permission denied”，先运行：

```bash
./scripts/init-linux-perms.sh
```

