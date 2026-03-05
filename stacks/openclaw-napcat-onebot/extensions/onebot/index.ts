import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { onebotPlugin } from "./src/channel.ts";
import { setOnebotRuntime } from "./src/runtime.ts";

const plugin = {
  id: "onebot",
  name: "NapCat OneBot",
  description: "NapCat (OneBot v11) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setOnebotRuntime(api.runtime);
    api.registerChannel({ plugin: onebotPlugin as ChannelPlugin });
  },
};

export default plugin;

