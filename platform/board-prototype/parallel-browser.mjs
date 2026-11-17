import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {build,preview} from 'vite';
import {chromium} from '@playwright/test';
import {openPostgresJournal} from './postgres.mjs';
import {startTestTransport} from './transport.mjs';
import {apiAccess} from './api-access.mjs';
import {editorSnapshot} from './browser-probes.mjs';
import {png,pdf} from './file-fixtures.mjs';
const command=promisify(execFile),wait=ms=>new Promise(r=>setTimeout(r,ms));
class RunnerBlocked extends Error {name='RunnerBlocked';}
const percentile=(a,p=.95)=>a.length?[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1]:null;
const numericFile=async path=>{try{const s=(await readFile(path,'utf8')).trim();return s==='max'?null:Number(s);}catch{return null;}};
export async function runApiBoardBrowser({api,accounts,group,beforeLessons,call}){
  assert.equal(process.env.TAS_BOARD_TEST_ONLY,'1');
  const groupSoak=process.env.TAS_BOARD_SOAK_GROUP_ONLY==='1';assert.ok(groupSoak||process.env.TAS_BOARD_PARALLEL_TEST_ONLY==='1');
  const workspaceCount=groupSoak?1:2,roomCount=groupSoak?1:10,lessonsPerWorkspace=groupSoak?1:5,targetContexts=roomCount*21;
  const label=groupSoak?'P3 soak':'P4';
  const project=process.env.TAS_REAL_COMPOSE_PROJECT;assert.match(project,/^tas-calendar-browser-[a-zA-Z0-9-]+$/);
  assert.equal(new URL(api).hostname,'127.0.0.1');assert.ok(!process.env.JWT_SIGNING_KEY&&!process.env.TAS_BOARD_SCENE_ROOT_KEY);
  const key=Buffer.from(process.env.TAS_BOARD_SIGNING_KEY,'base64');assert.equal(key.length,32);
  const output=new URL(groupSoak?'../../test-results/board-group-soak-result.json':'../../test-results/board-parallel-result.json',import.meta.url),start=performance.now();
  const rooms=[],errors=[],samples=[],phases={},latencies=[],operations={},failures={},subjects=new Set(),commits=new Map(),deliveries=[],seenDeliveries=new Set(),deliveryReceivers=new Set(),connections={connected:0,disconnected:0,peak:0,byPhase:{}};let peakPending=0,droppedMetrics=0,steadyDurationMs=0,steadyStarted=0;
  let journal,relay,site,browser,cdp,sampler,busy=false,metricsError,dropActor,dropCount=0,activePhase='setup';
  let peakBrowserRss=0,peakBrowserCpu=0,peakNodeCpu=0,peakCgroup=0,lastSample=performance.now(),lastNode=process.cpuUsage();
  const cpuByPid=new Map(),containerPeaks={};let containerIds=[];const limit=await numericFile('/sys/fs/cgroup/memory.max');
  const host={cores:os.availableParallelism(),totalMemoryBytes:os.totalmem(),cgroupMemoryLimitBytes:limit};
  const auth=apiAccess(api),authorize=async x=>auth(x);
  const observe=({event,durationMs,acknowledged,reason,phase,pendingOperations,connections:live})=>{
    if(pendingOperations)peakPending=Math.max(peakPending,pendingOperations);
    if(event==='connection'){connections[phase]++;connections.peak=Math.max(connections.peak,live);const b=connections.byPhase[activePhase]??={connected:0,disconnected:0};b[phase]++;return;}
    if(phase==='started')return;
    if(!acknowledged)failures[reason??'DISCONNECTED']=(failures[reason??'DISCONNECTED']??0)+1;
    const m=operations[event]??={count:0,nacks:0,sumMs:0,maxMs:0,samples:[]};m.count++;m.sumMs+=durationMs;m.maxMs=Math.max(m.maxMs,durationMs);
    if(!acknowledged)m.nacks++;if(m.samples.length<10000)m.samples.push(durationMs);
  };
  function trackCommits(){const append=journal.append;journal.append=async(scope,frame)=>{const row=await append(scope,frame),id=scope.workspace+'/'+scope.board+'/'+row.seq;if(!commits.has(id))commits.set(id,{at:Date.now(),steady:activePhase==='steady mixed workload 15min'});return row;};}
  async function collectDelivery(){
    await Promise.all(rooms.flatMap(r=>r.pages.map(async(p,i)=>{
      const m=await p.evaluate(()=>{const m=window.__BOARD_METRICS;return m?{startedAt:m.startedAt,applied:m.applied.splice(0),dropped:m.dropped}:null;});if(!m)return;
      droppedMetrics=Math.max(droppedMetrics,m.dropped);
      for(const e of m.applied){const id=r.scope.workspace+'/'+r.scope.board+'/'+e.seq,c=commits.get(id),key=id+'/'+i+'/'+m.startedAt;
        if(c?.steady&&c.at>=m.startedAt&&!seenDeliveries.has(key)){seenDeliveries.add(key);deliveryReceivers.add(r.number+'/'+i);deliveries.push(Math.max(0,e.at-c.at));}
      }
    })));
  }
  const openRelay=port=>startTestTransport({key,journal,authorize,observe,...(port?{port}:{}),acknowledge:({event,claims})=>{
    if(event==='submit'&&dropActor===claims.user){dropActor=undefined;dropCount++;return false;}return true;
  }});
  const actor=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub.replaceAll('-','');
  async function headroom(){
    const current=await numericFile('/sys/fs/cgroup/memory.current');
    const info=await readFile('/proc/meminfo','utf8'),available=Number(/MemAvailable:\s+(\d+)/.exec(info)?.[1]??0)*1024;
    if(available<1073741824||limit&&current&&limit-current<1073741824)throw new RunnerBlocked('Measured runner memory headroom below 1GiB');
  }
  const until=async(check,label,timeout=120000)=>{const end=performance.now()+timeout;while(!await check()){if(metricsError)throw metricsError;assert.ok(performance.now()<end,label);await wait(300);}};
  async function sample(){
    if(busy||!cdp)return;busy=true;
    try{
      const now=performance.now(),elapsed=(now-lastSample)/1000,used=process.cpuUsage(),processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
      let rss=0,cpu=0;for(const p of processes){
        const text=await readFile('/proc/'+p.id+'/status','utf8').catch(()=>''),bytes=Number(/VmRSS:\s+(\d+)/.exec(text)?.[1]??0)*1024;rss+=bytes;
        cpu+=Math.max(0,p.cpuTime-(cpuByPid.get(p.id)??p.cpuTime));cpuByPid.set(p.id,p.cpuTime);
      }
      const browserCpu=elapsed?cpu/elapsed*100:0,nodeCpu=elapsed?(used.user+used.system-lastNode.user-lastNode.system)/1000000/elapsed*100:0;
      const cg=await numericFile('/sys/fs/cgroup/memory.current');peakBrowserRss=Math.max(peakBrowserRss,rss);peakBrowserCpu=Math.max(peakBrowserCpu,browserCpu);peakNodeCpu=Math.max(peakNodeCpu,nodeCpu);peakCgroup=Math.max(peakCgroup,cg??0);
      lastSample=now;lastNode=used;
      if(samples.length<1200)samples.push({ms:Math.round(now-start),phase:activePhase,contexts:browser.contexts().length,browserProcessCount:processes.length,browserRssSumBytes:rss,browserCpuPercentOfOneCore:Math.round(browserCpu),nodeCpuPercentOfOneCore:Math.round(nodeCpu),cgroupBytes:cg});
      if(containerIds.length){
        const text=(await command('docker',['stats','--no-stream','--format','{{json .}}',...containerIds],{timeout:4000})).stdout;
        for(const line of text.trim().split('\n').filter(Boolean)){
          const x=JSON.parse(line),old=containerPeaks[x.Name]??{cpuPercentOfOneCore:0,memoryBytes:0,samples:0};
          const m=/([0-9.]+)\s*([kMGT]?i?B)/i.exec(x.MemUsage),unit=m?.[2]?.toUpperCase()??'B',power={B:0,KB:1,KIB:1,MB:2,MIB:2,GB:3,GIB:3,TB:4,TIB:4}[unit]??0;
          const memory=m?Number(m[1])*Math.pow(unit.includes('I')?1024:1000,power):0;
          containerPeaks[x.Name]={cpuPercentOfOneCore:Math.max(old.cpuPercentOfOneCore,parseFloat(x.CPUPerc)),memoryBytes:Math.max(old.memoryBytes,memory),samples:old.samples+1};
        }
      }
      if(activePhase==='steady mixed workload 15min')await collectDelivery();await headroom();
    }catch(e){metricsError=e;}finally{busy=false;}
  }
  async function page(account,session,lessonId,allowed=true){
    const context=await browser.newContext({viewport:{width:1100,height:800}});
    await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('crash',()=>errors.push('Editor process crashed'));
    await p.addInitScript(config=>{window.__BOARD_TEST_CONFIG=config;},{url:relay.url,metrics:true,session:{apiBase:api,accessToken:session,role:account.role,lessonId}});
    await p.goto('http://127.0.0.1:8768',{timeout:90000});
    await p.waitForFunction(t=>document.querySelector('#status')?.textContent===t,allowed?'Сохранено':'Нет доступа к занятию',{timeout:90000});
    if(!allowed){await context.close();return null;}return p;
  }
  const draw=async(p,x,y)=>{await p.getByTitle(/Rectangle/).first().click();await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+65,y+45,{steps:3});await p.mouse.up();};
  async function select(p,id){const e=await p.evaluate(id=>window.__BOARD_EDITOR.getSceneElements().find(e=>e.id===id),id);assert.ok(e);
    await p.getByTitle(/Selection/).first().click();await p.mouse.move(e.x-5,e.y-5);await p.mouse.down();await p.mouse.move(e.x+e.width+5,e.y+e.height+5,{steps:3});await p.mouse.up();
    await p.waitForFunction(id=>{const s=window.__BOARD_EDITOR.getAppState().selectedElementIds;return s[id]&&Object.values(s).filter(Boolean).length===1;},id);
  }
  async function converge(room,active,deleted){
    let previous;const t=performance.now();
    await until(async()=>{const values=await Promise.all(room.pages.map(p=>p.evaluate(editorSnapshot))),first=values[0];
      const ok=values.every(x=>x.status==='Сохранено'&&x.active===active&&x.deleted===deleted&&x.hash&&x.hash===first.hash);
      if(ok&&previous===first.hash){room.hash=first.hash;room.active=active;room.deleted=deleted;latencies.push(performance.now()-t);return true;}
      previous=ok?first.hash:undefined;return false;
    },'P4 full-state divergence in room '+room.number);
  }
  async function phase(name,run){activePhase=name;const t=performance.now();await run();phases[name]=Math.round(performance.now()-t);console.log('PASS '+label+': '+name);}
  try{
    const profiles=[accounts.north,accounts.south].slice(0,workspaceCount).map(account=>({account,tokens:[]}));
    for(const profile of profiles)subjects.add(actor(profile.account.token));
    for(let w=0;w<workspaceCount;w++){
      const profile=profiles[w],a=profile.account;
      const g=w===0?group:await call('teacher/groups',a.token,{requestId:randomUUID(),title:'Parallel test group',memberIds:a.students.map(s=>s.membershipId),durationMinutes:60},201);
      for(let i=0;i<lessonsPerWorkspace;i++){
        const lesson=w===0&&i===0?beforeLessons.find(l=>l.groupClassId===group.id):await call('teacher/lessons',a.token,{requestId:randomUUID(),title:'Parallel test lesson '+i,lessonAt:`2026-11-17T${String(6+i).padStart(2,'0')}:00:00Z`,groupClassId:g.id,participants:a.students.map(s=>({membershipId:s.membershipId,durationMinutes:60,attendanceStatus:'Unknown'}))},201);
        lesson.id??=lesson.lessonId;assert.match(lesson.id,/^[0-9a-f-]{36}$/i,'Actual lesson ID required');
        const permit=await call('teacher/board-prototype/lessons/'+lesson.id+'/permit',a.token,{});
        rooms.push({number:rooms.length,profile,lesson,scope:{workspace:permit.workspace,board:permit.board},pages:[]});
      }
    }
    const loginStart=performance.now();
    for(const profile of profiles){
      const a=profile.account;assert.equal(a.students.length,20);
      for(const student of a.students){for(;;){
        const r=await fetch(api+'/api/v1/student-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:a.workspace,code:student.inviteCode})});
        if(r.status===429){assert.ok(performance.now()-loginStart<600000,'Login rate-limit budget exceeded');await wait(15000);continue;}
        assert.equal(r.status,200);const token=(await r.json()).accessToken;profile.tokens.push(token);subjects.add(actor(token));break;
      }}
    }
    assert.equal(subjects.size,workspaceCount*21);
    containerIds=(await command('docker',['ps','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}'])).stdout.trim().split('\n').filter(Boolean);
    journal=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);trackCommits();relay=await openRelay();const port=Number(new URL(relay.url).port);
    const cwd=process.cwd();process.chdir(new URL('.',import.meta.url).pathname);
    try{await build({logLevel:'warn'});site=await preview({logLevel:'warn',preview:{host:'127.0.0.1',port:8768,strictPort:true}});}finally{process.chdir(cwd);}
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});cdp=await browser.newBrowserCDPSession();await sample();sampler=setInterval(()=>sample(),5000);
    await phase(targetContexts+' simultaneous actual editors in '+roomCount+' rooms',async()=>{
      for(const room of rooms){
        await headroom();room.pages.push(await page({role:'teacher'},room.profile.account.token,room.lesson.id));
        for(let i=0;i<20;i+=3){await headroom();room.pages.push(...await Promise.all(room.profile.tokens.slice(i,i+3).map(t=>page({role:'student'},t,room.lesson.id))));}
        assert.equal(room.pages.length,21);console.log('P4 startup contexts: '+browser.contexts().length);
      }
      assert.equal(browser.contexts().length,targetContexts);await Promise.all(rooms.map(r=>converge(r,0,0)));
    });
    await phase('parallel draw, same-element edit, delete and undo',async()=>{
      await Promise.all(rooms.flatMap(r=>r.pages.map((p,i)=>draw(p,260+(i%5)*105,150+Math.floor(i/5)*105))));await Promise.all(rooms.map(r=>converge(r,21,0)));
      assert.equal(new Set(rooms.map(r=>r.hash)).size,roomCount,'Rooms mixed their scenes');
      for(const r of rooms)r.ids=await r.pages[0].evaluate(()=>window.__BOARD_EDITOR.getSceneElements().map(e=>({id:e.id,x:e.x,y:e.y})));
      const target=r=>r.ids.find(e=>e.x===260&&e.y===150).id;
      await Promise.all(rooms.flatMap(r=>[select(r.pages[0],target(r)),select(r.pages[1],target(r))]));
      await Promise.all(rooms.flatMap(r=>[r.pages[0].keyboard.press('ArrowRight'),r.pages[1].keyboard.press('ArrowLeft')]));await Promise.all(rooms.map(r=>converge(r,21,0)));
      await Promise.all(rooms.map(async r=>{const id=r.ids.find(e=>e.x===575&&e.y===150).id;await select(r.pages[3],id);await r.pages[3].keyboard.press('Backspace');}));await Promise.all(rooms.map(r=>converge(r,20,1)));
      await Promise.all(rooms.map(r=>r.pages[3].getByRole('button',{name:'Undo',exact:true}).click()));await Promise.all(rooms.map(r=>converge(r,21,0)));
    });
    await phase('ten offline writers and lost durable acknowledgement',async()=>{
      const heads=await Promise.all(rooms.map(r=>journal.read(r.scope)));
      for(const r of rooms){await r.pages[5].context().setOffline(true);relay.disconnectUser(actor(r.profile.tokens[4]));}
      // Identity is legitimately shared across five room tabs; all its sockets
      // disconnect, but only each selected context is offline and edits locally.
      await Promise.all(rooms.map(r=>draw(r.pages[5],680,680)));
      for(let i=0;i<rooms.length;i++){await rooms[i].pages[5].waitForFunction(()=>document.querySelector('#status')?.textContent!=='Сохранено');assert.equal((await journal.read(rooms[i].scope)).head,heads[i].head);}
      dropActor=actor(rooms[0].profile.tokens[4]);await Promise.all(rooms.map(r=>r.pages[5].context().setOffline(false)));await Promise.all(rooms.map(r=>converge(r,22,0)));assert.equal(dropCount,1);
    });
    await phase('files and checkpoints across ten active rooms',async()=>{
      await Promise.all(rooms.map(r=>r.pages[0].getByTestId('board-file').setInputFiles({name:'room-'+r.number+'.png',mimeType:'image/png',buffer:png})));await Promise.all(rooms.map(r=>converge(r,23,0)));
      await Promise.all(rooms.map(r=>r.pages[0].getByTestId('board-file').setInputFiles({name:'room-'+r.number+'.pdf',mimeType:'application/pdf',buffer:pdf})));
      for(const r of rooms)await Promise.all(r.pages.map(p=>p.getByRole('button',{name:'room-'+r.number+'.pdf',exact:true}).waitFor()));await Promise.all(rooms.map(r=>converge(r,23,0)));
      await Promise.all(rooms.map(r=>r.pages[0].getByTestId('board-checkpoint').click()));
      await Promise.all(rooms.map(r=>r.pages[0].getByTestId('checkpoint-status').filter({hasText:/Контрольная точка: [0-9]+/}).waitFor({timeout:120000})));await Promise.all(rooms.map(r=>converge(r,23,0)));
    });
    await phase('shared relay and storage restart with pending work',async()=>{
      await relay.close();await journal.close();await Promise.all(rooms.map(r=>draw(r.pages[0],575,680)));
      journal=await openPostgresJournal(process.env.BOARD_TEST_DATABASE_URL);trackCommits();relay=await openRelay(port);await Promise.all(rooms.map(r=>converge(r,24,0)));
      // One cold participant per room reloads while the other200 editors stay open.
      await Promise.all(rooms.map(async r=>{await r.pages[20].reload();await r.pages[20].waitForFunction(()=>document.querySelector('#status')?.textContent==='Сохранено',null,{timeout:120000});}));await Promise.all(rooms.map(r=>converge(r,24,0)));
      assert.equal(browser.contexts().length,targetContexts);
      await Promise.all(rooms.map(async r=>{const download=r.pages[20].waitForEvent('download');await r.pages[20].getByRole('button',{name:'room-'+r.number+'.pdf',exact:true}).click();const parts=[],stream=await(await download).createReadStream();for await(const b of stream)parts.push(b);assert.ok(Buffer.concat(parts).equals(pdf));}));
    });
    await phase('workspace isolation',async()=>{
      await page({role:'teacher'},accounts.south.token,rooms[0].lesson.id,false);
      if(!groupSoak)await page({role:'student'},profiles[0].tokens[0],rooms[5].lesson.id,false);
      assert.equal(new Set(rooms.map(r=>r.hash)).size,roomCount);assert.deepEqual(errors,[]);
    });
    await phase('steady mixed workload 15min',async()=>{
      // Existing image/PDF are present throughout; actual text editing, deletion,
      // undo, added images and checkpoints continue during the full15 minutes.
      await Promise.all(rooms.map(async r=>{const p=r.pages[2];await p.getByTitle(/^Text/).first().click();await p.mouse.click(260,700);await p.keyboard.type('Room '+r.number);await p.keyboard.press('Escape');}));
      await Promise.all(rooms.map(r=>converge(r,25,0)));
      for(const r of rooms)r.textId=await r.pages[2].evaluate(()=>window.__BOARD_EDITOR.getSceneElements().find(e=>e.type==='text').id);
      const began=performance.now();steadyStarted=began;let cycle=0;
      while(performance.now()-began<900000){
        const tick=performance.now();cycle++;
        await Promise.all(rooms.map(async r=>{const p=r.pages[2],e=await p.evaluate(id=>window.__BOARD_EDITOR.getSceneElements().find(e=>e.id===id),r.textId);await p.getByTitle(/Selection/).first().click();await p.mouse.dblclick(e.x+5,e.y+e.height/2);await p.keyboard.press('ControlOrMeta+A');const text='Room '+r.number+' cycle '+cycle;await p.keyboard.type(text);await p.keyboard.press('Escape');await p.waitForFunction(({id,text})=>{const e=window.__BOARD_EDITOR.getSceneElements().find(e=>e.id===id);return (e?.originalText??e?.text)===text;},{id:r.textId,text});}));
        await Promise.all(rooms.map(r=>converge(r,r.active,0)));
        if(cycle%3===0){
          await Promise.all(rooms.map(async r=>{await select(r.pages[3],r.ids.find(e=>e.x===575&&e.y===150).id);await r.pages[3].keyboard.press('Backspace');}));
          await Promise.all(rooms.map(r=>converge(r,r.active-1,1)));await Promise.all(rooms.map(r=>r.pages[3].getByRole('button',{name:'Undo',exact:true}).click()));await Promise.all(rooms.map(r=>converge(r,r.active+1,0)));
        }
        if(cycle%5===0){await Promise.all(rooms.map(r=>r.pages[0].getByTestId('board-file').setInputFiles({name:'cycle-'+cycle+'.png',mimeType:'image/png',buffer:png})));await Promise.all(rooms.map(r=>converge(r,r.active+1,0)));}
        if(cycle%7===0){
          const prior=await Promise.all(rooms.map(r=>r.pages[0].getByTestId('checkpoint-status').textContent()));await Promise.all(rooms.map(r=>r.pages[0].getByTestId('board-checkpoint').click()));
          await Promise.all(rooms.map((r,i)=>r.pages[0].waitForFunction(old=>document.querySelector('[data-testid=checkpoint-status]')?.textContent!==old,prior[i],{timeout:120000})));await Promise.all(rooms.map(r=>converge(r,r.active,0)));
        }
        if(cycle%6===0)console.log(label+' steady seconds: '+Math.round((performance.now()-began)/1000)+'; contexts: '+browser.contexts().length);
        await wait(Math.max(0,10000-(performance.now()-tick)));
      }
      steadyDurationMs=performance.now()-began;assert.ok(steadyDurationMs>=900000);await Promise.all(rooms.map(r=>converge(r,r.active,0)));
    });
    clearInterval(sampler);while(busy)await wait(100);await sample();if(metricsError)throw metricsError;assert.ok(samples.some(s=>s.contexts===targetContexts),'Full-profile metrics missing');
    assert.ok(deliveries.length>=targetContexts*10&&deliveryReceivers.size===targetContexts&&droppedMetrics===0,'Delivery samples missing or truncated');
    assert.ok(percentile(deliveries)<=500,'p95 live durable-frame delivery exceeded plan 500ms budget');
    assert.ok(percentile(operations.submit?.samples??[])<=2000,'p95 server submit acknowledgement exceeded plan 2s budget');
    assert.ok(operations.submit?.count>=targetContexts,'Actual submit metrics missing');
    assert.ok(Object.keys(containerPeaks).length>=2,'API/database metrics missing');
    await save('PASS');console.log('PASS '+label+': '+roomCount+' rooms, '+workspaceCount+' workspaces, '+targetContexts+' actual editors, '+subjects.size+' identities; 15min mixed workload, strict convergence, isolation/recovery, delivery and durable-ack budgets PASS.');
  }catch(e){await save(e instanceof RunnerBlocked?'BLOCKED':'FAIL',e);throw e;}
  finally{clearInterval(sampler);if(browser)await browser.close();if(site)await new Promise(r=>site.httpServer.close(r));if(relay)await relay.close();if(journal)await journal.close();}
  async function save(status,error){
    await mkdir(new URL('.',output),{recursive:true});const measuredSteadyMs=steadyDurationMs||(steadyStarted?performance.now()-steadyStarted:0);const counts=Object.fromEntries(Object.entries(operations).map(([k,v])=>[k,{count:v.count,nacks:v.nacks,meanMs:v.count?v.sumMs/v.count:0,maxMs:v.maxMs,p50Ms:percentile(v.samples,.5),p95Ms:percentile(v.samples),sampleCount:v.samples.length}]));
    const result={status,profile:{targetRooms:roomCount,rooms:rooms.length,readyEditors:rooms.reduce((n,r)=>n+r.pages.length,0),perRoomReadyEditors:rooms.map(r=>r.pages.length),contexts:browser?.contexts().length??0,authenticatedIdentities:subjects.size,identitiesPerRoom:21,workspaces:workspaceCount,sessionReuse:'same 21 authorized identities per workspace across five lesson rooms'},host,phases,durationMs:Math.round(performance.now()-start),scenarioSeed:'grid-mixed-v1',versions:{node:process.version,chromium:browser?.version(),excalidraw:'0.18.1',react:'18.3.1',socketIO:'4.8.1'},steadyDurationMs:measuredSteadyMs,delivery:{definition:'durable COMMIT completion to client ordered frame application, live steady phase only; local clock',samples:deliveries.length,receivers:deliveryReceivers.size,droppedMetrics,p50Ms:percentile(deliveries,.5),p95Ms:percentile(deliveries)},connections,peakPendingOperations:peakPending,finalScenes:rooms.map(r=>({active:r.active,deleted:r.deleted})),convergenceP95Ms:percentile(latencies),operations:counts,negativeAcknowledgementsByReason:failures,
      resources:{peakBrowserRssSumBytes:peakBrowserRss,peakBrowserCpuPercentOfOneCore:peakBrowserCpu,peakNodeCpuPercentOfOneCore:peakNodeCpu,peakCgroupBytes:peakCgroup,containerPeaks,samples,notes:'RSS is a sum of process RSS and includes shared mappings; cgroup memory is recorded separately. CPU percent uses one core=100%.'},errors:errors.slice(0,10),error:error?{name:error.name,message:String(error.message).slice(0,180)}:null,production:'NOT_RUN'};
    await writeFile(output,JSON.stringify(result,null,2));console.log('P4 result: '+JSON.stringify({status,contexts:result.profile.contexts,identities:subjects.size,steadyDurationMs:measuredSteadyMs,deliveryP95Ms:result.delivery.p95Ms,ackP95Ms:counts.submit?.p95Ms,convergenceP95Ms:result.convergenceP95Ms,peakBrowserRssSumBytes:peakBrowserRss,error:result.error}));
  }
}
