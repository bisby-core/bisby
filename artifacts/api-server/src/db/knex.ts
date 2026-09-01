import knex, { type Knex } from "knex";

const DEFAULT_POOL: Knex.PoolConfig = {
  min: 0,
  max: 10,
  acquireTimeoutMillis: 10_000,
  createTimeoutMillis: 10_000,
};

export interface PostgresClientOptions {
  readonly databaseName: string;
  readonly pool?: Knex.PoolConfig;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface PostgresConnectionConfig {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly ssl: false | { readonly rejectUnauthorized: false };
  readonly connectionTimeoutMillis: number;
}

function requiredEnvironment(
  name: string,
  environment: NodeJS.ProcessEnv,
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`${name} must be configured before opening PostgreSQL.`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PGPORT must be a valid TCP port.");
  }
  return port;
}

function validateDatabaseName(databaseName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$-]*$/.test(databaseName)) {
    throw new Error(
      "PostgreSQL database names must be plain names without protocols, query strings, paths, or whitespace.",
    );
  }
  return databaseName;
}

function resolveSsl(
  value: string | undefined,
): false | { readonly rejectUnauthorized: false } {
  const mode = value?.trim().toLowerCase() || "require";
  if (mode === "disable") {
    return false;
  }

  if (!["require", "verify-ca", "verify-full"].includes(mode)) {
    throw new Error("PGSSLMODE must be disable, require, verify-ca, or verify-full.");
  }

  return { rejectUnauthorized: false };
}

export function postgresConnectionConfig(
  databaseName: string,
  environment: NodeJS.ProcessEnv = process.env,
): PostgresConnectionConfig {
  const portValue = requiredEnvironment("PGPORT", environment);
  return {
    user: requiredEnvironment("PGUSER", environment),
    password: requiredEnvironment("PGPASSWORD", environment),
    host: requiredEnvironment("PGHOST", environment),
    port: parsePort(portValue),
    database: validateDatabaseName(databaseName),
    ssl: resolveSsl(environment["PGSSLMODE"]),
    connectionTimeoutMillis: 10_000,
  };
}

export function createPostgresClient(
  options: PostgresClientOptions,
): Knex {
  const environment = options.environment ?? process.env;

  return knex({
    client: "pg",
    connection: postgresConnectionConfig(options.databaseName, environment),
    pool: options.pool ?? DEFAULT_POOL,
    acquireConnectionTimeout: 10_000,
  });
}

export function createMasterDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): Knex {
  const databaseName = requiredEnvironment(
    "BISBY_MASTER_DB_NAME",
    environment,
  );

  return createPostgresClient({
    databaseName,
    environment,
    pool: { min: 0, max: 5 },
  });
}