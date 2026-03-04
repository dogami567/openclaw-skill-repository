# napcat-clawdbot-exa

一套可直接运行的 Docker Compose 模板：

- NapCat（QQ + OneBot 11）
- Clawdbot Gateway（已内置 Exa `web_search` provider）

## 启动

```bash
cp .env.example .env
docker compose up -d
```

## NapCat WebUI

- 地址：`http://<宿主机IP>:${NAPCAT_WEBUI_PORT:-6099}/webui`
- Token：`NAPCAT_WEBUI_TOKEN`（默认示例是 `napcat`，也可以 `docker logs napcat` 查看）

## Clawdbot 启用 Exa provider

```bash
docker compose run --rm clawdbot-cli config set tools.web.search.provider exa
docker compose restart clawdbot-gateway
```

