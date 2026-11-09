// Throwaway probe, not for upstream.
import { describe, it, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MySqlContainer, StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgresConnector } from '../postgres/index.js';
import { MySQLConnector } from '../mysql/index.js';

const run = async (c: any, sql: string) => {
  try { const r = await c.executeSQL(sql, { readonly: true }); console.log('PROBE OK', sql, JSON.stringify(r.resultSets[0].rows).slice(0, 120)); }
  catch (e: any) { console.log('PROBE ERR', sql, e.message.slice(0, 160)); }
};

describe('quoted escape hatches', () => {
  let pg: StartedPostgreSqlContainer; let my: StartedMySqlContainer;
  beforeAll(async () => { [pg, my] = await Promise.all([new PostgreSqlContainer('postgres:16').start(), new MySqlContainer('mysql:8.0').withDatabase('testdb').withRootPassword('rootpass').start()]); }, 180000);
  afterAll(async () => { await pg?.stop(); await my?.stop(); });

  it('postgres', async () => {
    const c = new PostgresConnector(); await c.connect(pg.getConnectionUri());
    try {
      await run(c, `SELECT "pg_read_file"('/etc/hostname')`);
      await run(c, `SELECT "pg_ls_dir"('.') LIMIT 3`);
      // does ROLLBACK revert set_config(false)?
      const cl = await (c as any).pool.connect();
      await cl.query("BEGIN READ ONLY"); await cl.query("SELECT set_config('statement_timeout','123s',false)"); await cl.query("ROLLBACK");
      console.log('PROBE after ROLLBACK', (await cl.query("SHOW statement_timeout")).rows[0]);
      await cl.query("BEGIN READ ONLY"); await cl.query("SELECT pg_advisory_lock(42)"); await cl.query("ROLLBACK");
      console.log('PROBE advisory lock after ROLLBACK', (await cl.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()")).rows[0]);
      cl.release();
    } finally { await c.disconnect(); }
  });

  it('mysql', async () => {
    const c = new MySQLConnector(); await c.connect(my.getConnectionUri());
    try {
      await run(c, "SELECT `get_lock`('dbhub_probe', 0) AS l");
      await run(c, "SELECT IS_USED_LOCK('dbhub_probe') AS holder, CONNECTION_ID() AS me");
      await run(c, "SELECT `load_file`('/etc/hostname') AS f");
    } finally { await c.disconnect(); }
  });
});
