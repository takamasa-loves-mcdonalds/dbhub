// Throwaway probe, not for upstream.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgresConnector } from '../postgres/index.js';
import { sqlVerdict, policyFromReadonly } from '../../utils/sql-access-policy.js';

describe('quoted set_config in readonly mode', () => {
  let container: StartedPostgreSqlContainer;
  beforeAll(async () => { container = await new PostgreSqlContainer('postgres:16').start(); }, 120000);
  afterAll(async () => { await container?.stop(); });

  for (const sql of [
    `SELECT "set_config"('statement_timeout', '123s', false), pg_backend_pid() AS pid`,
    `SELECT pg_catalog."set_config"('statement_timeout', '123s', false), pg_backend_pid() AS pid`,
    `SELECT u&"\\0073et_config"('statement_timeout', '123s', false), pg_backend_pid() AS pid`,
  ]) {
    it(sql, async () => {
      const verdict = sqlVerdict(policyFromReadonly(true), sql, 'postgres');
      console.log('VERDICT', verdict, sql);
      const c = new PostgresConnector();
      // pool of 1 so both calls share the backend
      await c.connect(container.getConnectionUri(), undefined, { queryTimeoutSeconds: 300, poolMaxConnections: 1 });
      try {
        const r1 = await c.executeSQL(sql, { readonly: true });
        const r2 = await c.executeSQL(`SELECT current_setting('statement_timeout') AS st, pg_backend_pid() AS pid`, { readonly: true });
        console.log('RESULT', JSON.stringify(r1.resultSets[0].rows), JSON.stringify(r2.resultSets[0].rows));
        expect(verdict).toBe('allow');
        expect(r2.resultSets[0].rows[0].st).toBe('123s');
      } finally { await c.disconnect(); }
    });
  }
});
