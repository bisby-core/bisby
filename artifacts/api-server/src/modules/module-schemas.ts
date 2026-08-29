export const MODULE_SCHEMA_NAMES = [
  "module_a",
  "module_b",
  "module_c",
  "module_d",
  "module_e",
  "module_f",
  "module_g",
  "module_h",
] as const;

export type ModuleSchemaName = (typeof MODULE_SCHEMA_NAMES)[number];