import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setOnebotRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getOnebotRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("OneBot runtime not initialized");
  }
  return runtime;
}

