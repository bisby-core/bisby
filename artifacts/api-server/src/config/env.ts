export type RuntimeEnvironment = "development" | "test" | "production";

export interface RuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly port: number;
  readonly masterDatabaseName?: string;
  readonly bisbyRootDomain: string;
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

function parsePort(value: string | undefined): number {
  if (!value) {
    throw new Error("PORT environment variable is required.");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`PORT must be a valid TCP port. Received "${value}".`);
  }

  return port;
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return {
    environment: parseEnvironment(environment["NODE_ENV"]),
    port: parsePort(environment["PORT"]),
    masterDatabaseName: environment["BISBY_MASTER_DB_NAME"],
    bisbyRootDomain: environment["BISBY_ROOT_DOMAIN"] ?? "bisby.com",
  };
}