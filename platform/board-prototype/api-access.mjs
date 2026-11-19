// Revalidate the signed permit only. No API JWT/token or secret travels to the relay.
export function apiAccess(api, {https = false, relayKey} = {}) {
  const u=new URL(api);
  if(u.protocol!==(https?'https:':'http:')||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
    throw new Error('Isolated loopback API required');
  return async ({token}) => {
    try {
      const response=await fetch(u.origin+'/api/v1/board-prototype/access',{
        method:'POST',headers:{'Content-Type':'application/json',...(relayKey && {'X-TAS-Board-Relay-Key':relayKey})},body:JSON.stringify({token}),
        signal:AbortSignal.timeout(2000),redirect:'error',
      });
      return response.status===204;
    } catch { return false; }
  };
}
