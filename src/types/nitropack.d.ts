declare module "nitropack/runtime" {
  export function defineNitroPlugin(plugin: (nitroApp?: unknown) => void): (nitroApp?: unknown) => void;
}
