import knex, { type Knex } from "knex";

const DEFAULT_POOL = {
  min: 0,
  max: 10,
};

export function createPostgresClient(
  connectionString: string,
  pool = DEFAULT_POOL,
): Knex {
  return knex({
    client: "pg",
    connection: connectionString,
    pool,
  });
}

export function createMasterDatabase(): Knex {
  const connectionString = process.env["BISBY_MASTER_DATABASE_URL"];

  if (!connectionString) {
    throw new Error(
      "BISBY_MASTER_DATABASE_URL must be configured for the global routing database.",
    );
  }

  return createPostgresClient(connectionString, { min: 0, max: 5 });
}