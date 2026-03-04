# napcat-clawdbot-exa

一套可直接运行的 Docker Compose 模板：

- NapCat（QQ + OneBot 11）
- Clawdbot Gateway（已内置 Exa `web_search` provider）

## 启动

```bash
cp .env.example .env
docker compose up -d
```

## Linux / macOS 适配说明

- **Linux**：直接跑；建议先创建 `./data/*` 并给 Clawdbot 目录赋权（uid `1000`）。
- **macOS**：用 Docker Desktop；如果目录在外接盘（`/Volumes/...`），需要在 Docker Desktop File Sharing 里允许该路径。

Linux（可选）一键初始化目录权限：

```bash
./scripts/init-linux-perms.sh
```

## NapCat WebUI

- 地址：`http://<宿主机IP>:${NAPCAT_WEBUI_PORT:-6099}/webui`
- Token：`NAPCAT_WEBUI_TOKEN`（默认示例是 `napcat`，也可以 `docker logs napcat` 查看）

## Clawdbot 启用 Exa provider

```bash
docker compose run --rm clawdbot-cli config set tools.web.search.provider exa
docker compose restart clawdbot-gateway
```
