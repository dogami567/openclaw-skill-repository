# openclaw-skill-repository

这个仓库用于把我在本地/私有环境里用到的一些能力（例如 NapCat、以及带 Exa provider 的 Clawdbot `web_search`）做成**可复用的交付物**：

- 通过 GitHub Actions 自动构建并发布 Docker 镜像（推到 GHCR）
- 通过 GitHub Release 发布可直接运行的 Docker Compose “整套模板”（含 `.env.example`）

目前包含：

- `clawdbot-exa`：在上游 `clawdbot/clawdbot` 固定版本上应用 patch，新增 `provider="exa"`（向后兼容 `brave/perplexity`）
- `napcat-clawdbot-exa`：NapCat + Clawdbot Gateway 的 compose 模板
- `openclaw-napcat-onebot`：OpenClaw + NapCat（OneBot v11）的一键部署模板（内置 `onebot` 插件），可选启动 Clawdbot

## 快速开始（NapCat + Clawdbot Gateway）

1) 进入目录：

```bash
cd stacks/napcat-clawdbot-exa
```

2) 创建环境文件：

```bash
cp .env.example .env
```

3) 按需填写：

- NapCat：`NAPCAT_WEBUI_TOKEN`（默认示例是 `napcat`）
- Exa：`EXA_API_KEY` 或 `EXA_API_KEYS`
- Clawdbot：`CLAWDBOT_GATEWAY_TOKEN`、以及你的模型 provider key（OpenAI/OpenRouter/Claude Web 等）

4) 启动：

```bash
docker compose up -d
```

## 快速开始（OpenClaw + NapCat + OneBot）

1) 进入目录：

```bash
cd stacks/openclaw-napcat-onebot
```

2) 创建环境文件：

```bash
cp .env.example .env
```

3) 一键启动（推荐）：

- Windows：`powershell -ExecutionPolicy Bypass -File .\\scripts\\up.ps1`
- Linux/macOS：`chmod +x scripts/*.sh && ./scripts/up.sh`

> 说明：脚本会自动写入 NapCat `onebot11.json`、安装 OpenClaw `onebot` 插件、并写入 OpenClaw 的 `channels.onebot.*` 配置。

## Linux / macOS 适配说明

这套交付物本质上是 **Linux 容器**，因此：

- **Linux**：直接使用 Docker Engine + Docker Compose 即可
- **macOS（Intel / Apple Silicon）**：使用 Docker Desktop（容器在 Linux VM 中运行）

已做多架构构建：

- `ghcr.io/dogami567/clawdbot-exa:*`：`linux/amd64` + `linux/arm64`
- `mlikiowa/napcat-docker:latest`：`linux/amd64` + `linux/arm64`

### macOS 注意事项

- 如果把目录放在外接硬盘（例如 `/Volumes/...`），需要在 Docker Desktop 的 **File Sharing** 里把该路径加进去，否则 bind mount 会失败。
- 端口映射在 macOS 上同样可用：NapCat `6099/3001/3000`、Clawdbot `18789/18790`。

### Linux 注意事项（目录权限）

Clawdbot 镜像默认以非 root 用户（uid `1000`）运行，所以第一次启动前建议先创建并赋权：

```bash
cd stacks/napcat-clawdbot-exa
mkdir -p ./data/clawdbot/config ./data/clawdbot/workspace
sudo chown -R 1000:1000 ./data/clawdbot
```

NapCat 如需把容器内文件归属到当前用户，可在 `.env` 里设置：

```bash
NAPCAT_UID=$(id -u)
NAPCAT_GID=$(id -g)
```

### NapCat 登录入口

- WebUI：`http://<宿主机IP>:${NAPCAT_WEBUI_PORT:-6099}/webui`
- Token：看日志或使用你设置的 `NAPCAT_WEBUI_TOKEN`：

```bash
docker logs napcat
```

### Clawdbot 切到 Exa provider

镜像里已包含 Exa provider，但**是否启用**取决于你的 Clawdbot 配置。你可以用 compose 里的 `clawdbot-cli` 一次性写入配置：

```bash
docker compose run --rm clawdbot-cli config set tools.web.search.provider exa
```

可选：写入 Exa 细节配置（不写也能用默认值）：

```bash
docker compose run --rm clawdbot-cli config set tools.web.search.exa.searchType auto
docker compose run --rm clawdbot-cli config set tools.web.search.exa.contentMode highlights
docker compose run --rm clawdbot-cli config set tools.web.search.exa.maxCharacters 4000
```

然后重启 gateway：

```bash
docker compose restart clawdbot-gateway
```

## 镜像发布策略

- push 到 `main`：发布 `:latest`、`:main` 与 `:sha-<short>` 到 GHCR
- 打 tag（`v*`）：发布 `:latest` 与 `:<tag>`，并创建 GitHub Release（附带 stack 模板压缩包）

镜像名默认是：

- `ghcr.io/<repo-owner>/clawdbot-exa`

## 如何更新上游 Clawdbot 版本

1) 修改 `clawdbot.ref`（建议 pin 到 tag 或 commit SHA，避免上游变更导致 patch 失效）
2) 若 patch 失败：在本地把上游检出到同版本，重新生成/调整 `patches/clawdbot/exa-web-search.patch`
3) 提交后，让 CI 先跑绿，再打 tag 走 release
