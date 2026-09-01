const configuredRootDomain = import.meta.env.VITE_BISBY_ROOT_DOMAIN as
  | string
  | undefined;

export const BISBY_ROOT_DOMAIN =
  configuredRootDomain?.trim().toLowerCase().replace(/^\.+|\.+$/g, "") ||
  "bisby.pro";