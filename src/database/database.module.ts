import { Global, Logger, Module, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";
import { generateMigrationSql } from "@duraflows/pg";

const { Pool } = pg;

export const PG_POOL = Symbol("PG_POOL");

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (): Promise<pg.Pool> => {
        const logger = new Logger("DatabaseModule");

        const host = process.env.DATABASE_HOST ?? "localhost";
        const port = Number(process.env.DATABASE_PORT ?? 5432);
        const user = process.env.DATABASE_USER ?? "postgres";
        const password = process.env.DATABASE_PASSWORD ?? "postgres";
        const database = process.env.DATABASE_NAME ?? "duraflows_examples";

        // Create the database if it doesn't exist
        const adminPool = new Pool({ host, port, user, password, database: "postgres" });
        try {
          await adminPool.query(`CREATE DATABASE ${database}`);
          logger.log(`Database "${database}" created`);
        } catch (err: unknown) {
          const pgErr = err as { code?: string };
          if (pgErr.code === "42P04") {
            logger.log(`Database "${database}" already exists`);
          } else {
            throw err;
          }
        } finally {
          await adminPool.end();
        }

        // Connect to the target database
        const pool = new Pool({ host, port, user, password, database });

        // Run migrations (made idempotent)
        const { up } = generateMigrationSql();
        const idempotentSql = up
          .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
          .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
        await pool.query(idempotentSql);

        // `CREATE TABLE IF NOT EXISTS` above is a no-op against tables that
        // already existed from a pre-5.0.0 install (e.g. this example's own
        // database, upgraded from the 1.1.0 schema) — it never adds columns
        // to a table that's already there. Bring such tables current with
        // the same ALTERs dbmate migrations 003/004 apply, run idempotently
        // on every boot so both fresh and upgraded databases converge.
        await pool.query(`
          ALTER TABLE workflow_history DROP CONSTRAINT IF EXISTS workflow_history_outcome_check;
          ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_outcome_check
            CHECK (outcome IN ('success', 'failure', 'guard-rejected'));
          ALTER TABLE workflow_history ADD COLUMN IF NOT EXISTS rejected_by text;
          ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS definition_version integer NULL;
          ALTER TABLE workflow_history ADD COLUMN IF NOT EXISTS definition_version integer NULL;
        `);
        logger.log("Database migrations applied");

        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor() {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log("Closing database pool");
  }
}
