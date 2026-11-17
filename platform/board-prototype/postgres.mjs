import pg from 'pg';
const valid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
export function assertTestDatabase(connectionString) {
  const u = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['127.0.0.1','localhost','[::1]'].includes(u.hostname)
      || !/^\/tas_board_test(?:_[a-z0-9_]+)?$/.test(u.pathname) || u.search || u.hash)
    throw new Error('Only dedicated loopback tas_board_test databases are allowed');
}
// Dedicated test DB only; production adapter/migrations are deliberately not enabled.
export async function openPostgresJournal(connectionString) {
  assertTestDatabase(connectionString);
  const pool = new pg.Pool({ connectionString, max: 12, connectionTimeoutMillis: 3000 });
  await pool.query(`CREATE TABLE IF NOT EXISTS board_heads (
    workspace text NOT NULL, board text NOT NULL, revision integer NOT NULL DEFAULT 0,
    bytes bigint NOT NULL DEFAULT 0, PRIMARY KEY(workspace,board));
    CREATE TABLE IF NOT EXISTS board_frames (
    workspace text NOT NULL, board text NOT NULL, seq integer NOT NULL,
    actor text NOT NULL, message_id text NOT NULL, ciphertext bytea NOT NULL, iv bytea NOT NULL,
    PRIMARY KEY(workspace,board,seq), UNIQUE(workspace,board,actor,message_id),
    FOREIGN KEY(workspace,board) REFERENCES board_heads(workspace,board));`);
  const checkScope = s => {
    if (!s || !valid(s.workspace) || !valid(s.board)) throw new Error('Invalid scope');
    return [s.workspace,s.board];
  };
  const dto = r => ({ workspace:r.workspace,board:r.board,user:r.actor,messageId:r.message_id,
    seq:r.seq,ciphertext:r.ciphertext.toString('base64'),iv:r.iv.toString('base64') });
  return {
    async append(scope, { messageId, user, ciphertext, iv }) {
      const ids = checkScope(scope);
      if (!valid(messageId) || !valid(user) || !Buffer.isBuffer(ciphertext) || !ciphertext.length
          || ciphertext.length > 262144 || !Buffer.isBuffer(iv) || iv.length !== 12) throw new Error('Invalid frame');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('INSERT INTO board_heads(workspace,board) VALUES($1,$2) ON CONFLICT DO NOTHING',ids);
        const h = (await c.query('SELECT revision,bytes FROM board_heads WHERE workspace=$1 AND board=$2 FOR UPDATE',ids)).rows[0];
        const old = (await c.query('SELECT * FROM board_frames WHERE workspace=$1 AND board=$2 AND actor=$3 AND message_id=$4',[...ids,user,messageId])).rows[0];
        if (old) {
          if (!old.ciphertext.equals(ciphertext) || !old.iv.equals(iv)) throw new Error('Message ID payload conflict');
          await c.query('COMMIT'); return dto(old);
        }
        if (h.revision >= 10000 || Number(h.bytes) + ciphertext.length > 33554432) throw new Error('Room quota exceeded');
        const row = (await c.query('INSERT INTO board_frames(workspace,board,seq,actor,message_id,ciphertext,iv) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [...ids,h.revision+1,user,messageId,ciphertext,iv])).rows[0];
        await c.query('UPDATE board_heads SET revision=revision+1,bytes=bytes+$3 WHERE workspace=$1 AND board=$2',[...ids,ciphertext.length]);
        await c.query('COMMIT'); // Only a committed transaction can produce acknowledgement.
        return dto(row);
      } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    async replay(scope, after=0, limit=10000) {
      if (!Number.isSafeInteger(after) || after<0 || !Number.isSafeInteger(limit) || limit<1 || limit>10000) throw new Error('Invalid replay cursor');
      return (await pool.query('SELECT * FROM board_frames WHERE workspace=$1 AND board=$2 AND seq>$3 ORDER BY seq LIMIT $4',[...checkScope(scope),after,limit])).rows.map(dto);
    },
    async close() { await pool.end(); },
  };
}
