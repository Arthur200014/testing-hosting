import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {pilotDatabase, pilotOrigin} from './pilot-settings.mjs';

const env = process.env;
const origin = pilotOrigin(env.TAS_BOARD_PILOT_ORIGIN);
const hostname = env.TAS_BOARD_PILOT_DB_HOST;
const apiDb = pilotDatabase(env.TAS_BOARD_PILOT_API_DB, hostname, 'tas_platform_staging');
const boardDb = pilotDatabase(env.TAS_BOARD_STAGING_DB, hostname, 'tas_board_staging');
if (decodeURIComponent(apiDb.username) === decodeURIComponent(boardDb.username))
  throw new Error('Use separate roles for the two pilot databases');

const quoted = value => '"' + value.replaceAll('"', '""') + '"';
const workspace = env.BoardPrototype__StagingWorkspaceId;
const boardEnabled = env.BoardPrototype__Enabled === 'true';
if (boardEnabled && (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(workspace ?? '') ||
    !/[1-9a-f]/i.test(workspace))) throw new Error('A synthetic pilot workspace is required');
if (Buffer.from(env.TAS_BOARD_STAGING_SIGNING_KEY ?? '', 'base64').length < 32)
  throw new Error('Board staging signing key is required');

const caFile = '/tmp/tas-pilot-postgres-ca.pem';
if (env.TAS_BOARD_PILOT_DB_CA) await writeFile(caFile, env.TAS_BOARD_PILOT_DB_CA, {mode: 0o600, flag: 'wx'});
const connection = [
  `Host=${quoted(hostname)}`, `Port=${apiDb.port || 5432}`, 'Database=tas_platform_staging',
  `Username=${quoted(decodeURIComponent(apiDb.username))}`, `Password=${quoted(decodeURIComponent(apiDb.password))}`,
  'SSL Mode=VerifyFull', ...(env.TAS_BOARD_PILOT_DB_CA ? [`Root Certificate=${caFile}`] : []),
].join(';');
const apiOrigin = 'http://127.0.0.1:18447';
const apiEnv = {...env,
  DOTNET_ENVIRONMENT: 'Staging', ASPNETCORE_ENVIRONMENT: 'Staging', ASPNETCORE_URLS: apiOrigin,
  Database__ConnectionString: connection, Cors__AllowedOrigins__0: origin.origin,
  BoardPrototype__SigningKey: env.TAS_BOARD_STAGING_SIGNING_KEY,
  BoardPrototype__Enabled: String(boardEnabled),
  Jwt__Issuer: 'tas-board-pilot', Jwt__Audience: 'tas-board-pilot', Jwt__LifetimeMinutes: '10',
};

const children = new Set();
let stopping = false;
function stop() {
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
function run(command, args, childEnv) {
  const child = spawn(command, args, {env: childEnv, stdio: 'inherit'});
  children.add(child);
  return once(child, 'exit').then(([code]) => code, () => 1).finally(() => children.delete(child));
}
const api = ['/app/api/Platform.Api.dll'];
const migrated = await run('dotnet', [...api, '--migrate'], apiEnv);
if (migrated !== 0 && !stopping) process.exitCode = 1;
if (migrated === 0 && !stopping) {
  const processes = [
    run('dotnet', api, apiEnv),
    run(process.execPath, [new URL('./staging.mjs', import.meta.url).pathname],
      {...env, TAS_BOARD_STAGING_API: apiOrigin, TAS_BOARD_STAGING_PORT: '8080'}),
  ];
  await Promise.race(processes);
  if (!stopping) process.exitCode = 1;
  stop();
  await Promise.all(processes);
}
