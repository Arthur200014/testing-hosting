import pg from 'pg';
import {createHash} from 'node:crypto';
import {validateFile,references,MAX_ROOM_FILE_BYTES,MAX_ROOM_PIXELS,validId} from './files.mjs';
const valid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
export function assertTestDatabase(connectionString) {
  const u = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['127.0.0.1','localhost','[::1]'].includes(u.hostname)
      || !/^\/tas_board_test(?:_[a-z0-9_]+)?$/.test(u.pathname) || u.search || u.hash)
    throw new Error('Only dedicated loopback tas_board_test databases are allowed');
}
// Dedicated test DB only; production adapter/migrations are deliberately not enabled.
export async function openPostgresJournal(connectionString, {beforeCheckpointCommit=async()=>{}} = {}) {
  assertTestDatabase(connectionString);
  const pool = new pg.Pool({ connectionString, max: 12, connectionTimeoutMillis: 3000 });
  await pool.query(`CREATE TABLE IF NOT EXISTS board_heads (
    workspace text NOT NULL, board text NOT NULL, revision integer NOT NULL DEFAULT 0,
    bytes bigint NOT NULL DEFAULT 0, PRIMARY KEY(workspace,board));
    CREATE TABLE IF NOT EXISTS board_frames (
    workspace text NOT NULL, board text NOT NULL, seq integer NOT NULL,
    actor text NOT NULL, message_id text NOT NULL, ciphertext bytea NOT NULL, iv bytea NOT NULL,
    PRIMARY KEY(workspace,board,seq), UNIQUE(workspace,board,actor,message_id),
    FOREIGN KEY(workspace,board) REFERENCES board_heads(workspace,board));
    ALTER TABLE board_frames ADD COLUMN IF NOT EXISTS file_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS board_checkpoints (
    workspace text NOT NULL, board text NOT NULL, base integer NOT NULL, actor text NOT NULL,
    message_id text NOT NULL, ciphertext bytea NOT NULL, iv bytea NOT NULL, file_ids jsonb NOT NULL,
    PRIMARY KEY(workspace,board), FOREIGN KEY(workspace,board) REFERENCES board_heads(workspace,board));
    CREATE TABLE IF NOT EXISTS board_receipts (
    workspace text NOT NULL, board text NOT NULL, kind text NOT NULL, actor text NOT NULL,
    message_id text NOT NULL, seq integer NOT NULL, digest text NOT NULL,
    PRIMARY KEY(workspace,board,kind,actor,message_id),
    FOREIGN KEY(workspace,board) REFERENCES board_heads(workspace,board));
    CREATE TABLE IF NOT EXISTS board_files (
    workspace text NOT NULL, board text NOT NULL, id text NOT NULL, actor text NOT NULL,
    name text NOT NULL, mime_type text NOT NULL, data bytea NOT NULL, sha256 text NOT NULL,
    size integer NOT NULL, width integer NOT NULL, height integer NOT NULL, pixels bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace,board,id),
    FOREIGN KEY(workspace,board) REFERENCES board_heads(workspace,board));`);
  const checkScope = s => {
    if (!s || !valid(s.workspace) || !valid(s.board)) throw new Error('Invalid scope');
    return [s.workspace,s.board];
  };
  const dto = r => ({ workspace:r.workspace,board:r.board,user:r.actor,messageId:r.message_id,
    seq:r.seq,ciphertext:r.ciphertext.toString('base64'),iv:r.iv.toString('base64'),...(r.file_ids?.length?{fileIds:r.file_ids}:{}) });
  const digest=(ciphertext,iv,refs)=>createHash('sha256').update(iv).update(String(ciphertext.length)+':').update(ciphertext).update(JSON.stringify(refs)).digest('hex');
  const checkpointDto=r=>r?{...dto({...r,seq:r.base}),kind:'checkpoint'}:null;
  const fileDto=r=>({id:r.id,name:r.name,mimeType:r.mime_type,data:r.data,sha256:r.sha256,size:r.size,width:r.width,height:r.height,createdAt:r.created_at});
  return {
    async append(scope, { messageId, user, ciphertext, iv, fileIds }) {
      const refs=references(fileIds);
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
          if (!old.ciphertext.equals(ciphertext) || !old.iv.equals(iv) || JSON.stringify(old.file_ids)!==JSON.stringify(refs)) throw new Error('Message ID payload conflict');
          await c.query('COMMIT'); return dto(old);
        }
        const receipt=(await c.query("SELECT seq,digest FROM board_receipts WHERE workspace=$1 AND board=$2 AND kind='frame' AND actor=$3 AND message_id=$4",[...ids,user,messageId])).rows[0];
        if(receipt){
          if(receipt.digest!==digest(ciphertext,iv,refs))throw new Error('Message ID payload conflict');
          await c.query('COMMIT');return dto({workspace:scope.workspace,board:scope.board,actor:user,message_id:messageId,seq:receipt.seq,ciphertext,iv,file_ids:refs});
        }
        if(refs.length && (await c.query('SELECT id FROM board_files WHERE workspace=$1 AND board=$2 AND id=ANY($3::text[])',[...ids,refs])).rowCount!==refs.length)throw new Error('Referenced files are not durable');
        if (h.revision >= 10000 || Number(h.bytes) + ciphertext.length > 33554432) throw new Error('Room quota exceeded');
        const row = (await c.query('INSERT INTO board_frames(workspace,board,seq,actor,message_id,ciphertext,iv,file_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *',
          [...ids,h.revision+1,user,messageId,ciphertext,iv,JSON.stringify(refs)])).rows[0];
        await c.query('UPDATE board_heads SET revision=revision+1,bytes=bytes+$3 WHERE workspace=$1 AND board=$2',[...ids,ciphertext.length]);
        await c.query('COMMIT'); // Only a committed transaction can produce acknowledgement.
        return dto(row);
      } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    async replay(scope, after=0, limit=10000) {
      if (!Number.isSafeInteger(after) || after<0 || !Number.isSafeInteger(limit) || limit<1 || limit>10000) throw new Error('Invalid replay cursor');
      return (await pool.query('SELECT * FROM board_frames WHERE workspace=$1 AND board=$2 AND seq>$3 ORDER BY seq LIMIT $4',[...checkScope(scope),after,limit])).rows.map(dto);
    },
    // Consistent checkpoint + tail view even when another writer compacts mid-read.
    async read(scope,after=0,limit=8) {
      const ids=checkScope(scope);
      if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>8)throw new Error('Invalid read cursor');
      const c=await pool.connect();
      try{
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const h=(await c.query('SELECT revision FROM board_heads WHERE workspace=$1 AND board=$2',ids)).rows[0];
        if(after>(h?.revision??0))throw new Error('Cursor beyond room head');
        const cp=(await c.query('SELECT * FROM board_checkpoints WHERE workspace=$1 AND board=$2 AND base>$3',[...ids,after])).rows[0];
        const rows=(await c.query('SELECT * FROM board_frames WHERE workspace=$1 AND board=$2 AND seq>$3 ORDER BY seq LIMIT $4',[...ids,cp?.base??after,limit])).rows;
        await c.query('COMMIT');return {checkpoint:checkpointDto(cp),frames:rows.map(dto),head:h?.revision??0,next:rows.at(-1)?.seq??cp?.base??after,more:rows.length===limit};
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    },
    async checkpoint(scope,{base,user,messageId,ciphertext,iv,fileIds}) {
      const ids=checkScope(scope),refs=references(fileIds);
      if(!Number.isSafeInteger(base)||base<1||!valid(user)||!valid(messageId)||!Buffer.isBuffer(ciphertext)||!ciphertext.length||ciphertext.length>2097152||!Buffer.isBuffer(iv)||iv.length!==12)throw new Error('Invalid checkpoint');
      const fingerprint=digest(ciphertext,iv,refs),c=await pool.connect();
      try{
        await c.query('BEGIN');
        const h=(await c.query('SELECT revision,bytes FROM board_heads WHERE workspace=$1 AND board=$2 FOR UPDATE',ids)).rows[0];
        if(!h)throw new Error('Missing room');
        const prior=(await c.query("SELECT seq,digest FROM board_receipts WHERE workspace=$1 AND board=$2 AND kind='checkpoint' AND actor=$3 AND message_id=$4",[...ids,user,messageId])).rows[0];
        if(prior){if(prior.seq!==base||prior.digest!==fingerprint)throw new Error('Checkpoint ID payload conflict');await c.query('COMMIT');return {accepted:true,base,messageId};}
        const previous=(await c.query('SELECT base FROM board_checkpoints WHERE workspace=$1 AND board=$2',ids)).rows[0];
        if(base!==h.revision||base<=(previous?.base??0)){await c.query('COMMIT');return {accepted:false,head:h.revision};}
        if(refs.length&&(await c.query('SELECT id FROM board_files WHERE workspace=$1 AND board=$2 AND id=ANY($3::text[])',[...ids,refs])).rowCount!==refs.length)throw new Error('Checkpoint files are not durable');
        const frames=(await c.query('SELECT * FROM board_frames WHERE workspace=$1 AND board=$2 AND seq<=$3 ORDER BY seq',[...ids,base])).rows;
        for(const f of frames)await c.query("INSERT INTO board_receipts(workspace,board,kind,actor,message_id,seq,digest) VALUES($1,$2,'frame',$3,$4,$5,$6)",[...ids,f.actor,f.message_id,f.seq,digest(f.ciphertext,f.iv,f.file_ids)]);
        await c.query('INSERT INTO board_checkpoints(workspace,board,base,actor,message_id,ciphertext,iv,file_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(workspace,board) DO UPDATE SET base=excluded.base,actor=excluded.actor,message_id=excluded.message_id,ciphertext=excluded.ciphertext,iv=excluded.iv,file_ids=excluded.file_ids',[...ids,base,user,messageId,ciphertext,iv,JSON.stringify(refs)]);
        await c.query("INSERT INTO board_receipts(workspace,board,kind,actor,message_id,seq,digest) VALUES($1,$2,'checkpoint',$3,$4,$5,$6)",[...ids,user,messageId,base,fingerprint]);
        await c.query('DELETE FROM board_frames WHERE workspace=$1 AND board=$2 AND seq<=$3',[...ids,base]);
        await c.query('UPDATE board_heads SET bytes=$3 WHERE workspace=$1 AND board=$2',[...ids,ciphertext.length]);
        // Test-only crash/failure barrier; the whole operation rolls back together.
        await beforeCheckpointCommit();await c.query('COMMIT');return {accepted:true,base,messageId};
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    },
    async putFile(scope,payload) {
      const ids=checkScope(scope),f=validateFile(payload);
      if(!validId(payload.user))throw new Error('Invalid file actor');
      const c=await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('INSERT INTO board_heads(workspace,board) VALUES($1,$2) ON CONFLICT DO NOTHING',ids);
        await c.query('SELECT revision FROM board_heads WHERE workspace=$1 AND board=$2 FOR UPDATE',ids);
        const old=(await c.query('SELECT * FROM board_files WHERE workspace=$1 AND board=$2 AND id=$3',[...ids,f.id])).rows[0];
        if(old){if(old.sha256!==f.sha256||!old.data.equals(f.data)||old.name!==f.name||old.mime_type!==f.mimeType)throw new Error('Immutable file conflict');await c.query('COMMIT');return fileDto(old);}
        const q=(await c.query('SELECT count(*) AS count,coalesce(sum(size),0) AS bytes,coalesce(sum(pixels),0) AS pixels FROM board_files WHERE workspace=$1 AND board=$2',ids)).rows[0];
        if(Number(q.count)>=64||Number(q.bytes)+f.size>MAX_ROOM_FILE_BYTES||Number(q.pixels)+f.pixels>MAX_ROOM_PIXELS)throw new Error('Room file quota exceeded');
        const row=(await c.query('INSERT INTO board_files(workspace,board,id,actor,name,mime_type,data,sha256,size,width,height,pixels) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[...ids,f.id,payload.user,f.name,f.mimeType,f.data,f.sha256,f.size,f.width,f.height,f.pixels])).rows[0];
        await c.query('COMMIT');return fileDto(row);
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    },
    async getFile(scope,id) {
      if(!validId(id))throw new Error('Invalid file id');
      const r=(await pool.query('SELECT * FROM board_files WHERE workspace=$1 AND board=$2 AND id=$3',[...checkScope(scope),id])).rows[0];
      if(!r)return null;
      if(createHash('sha256').update(r.data).digest('hex')!==r.sha256)throw new Error('Corrupt stored file');
      return fileDto(r);
    },
    async close() { await pool.end(); },
  };
}
