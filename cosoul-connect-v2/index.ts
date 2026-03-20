import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { cosoulPlugin } from "./src/channel.js";

const plugin = {
  id: "cosoul",
  name: "Cosoul.AI",
  description: "Cosoul.AI IM channel plugin via WebSocket Bridge",
  version: "2.0.0",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      bridgeUrl: { type: "string", format: "uri" },
      apiKey: { type: "string" },
      apiKeyFile: { type: "string" },
    },
  },
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: cosoulPlugin as ChannelPlugin });
  },
};

export default plugin;
