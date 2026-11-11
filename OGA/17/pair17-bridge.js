/* Bridge to the original guide's existing authenticated Firebase session.
   It uses UI/sessionStorage signals already set by the original app and never guesses identities. */
(()=>{
 const APP='oge17-quadrilaterals-dragon-guide-v1',KEY=APP+':activeRole';
 const participantKey=code=>'student_'+String(code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'_').slice(0,80);
 const connected=()=>document.body.classList.contains('cb-connected')&&!document.getElementById('cbToolbar')?.classList.contains('cb-hidden');
 const mode=()=>connected()?(sessionStorage.getItem(KEY)||''):'';
 window.OGE17PairBridge={
  get connected(){return connected()},
  get role(){return mode()},
  get me(){
   const role=mode();if(!role)return null;
   if(role==='teacher')return{id:'teacher',role,name:'Учитель'};
   const code=localStorage.getItem('egeStudentCode')||'',name=localStorage.getItem('egeStudentName')||'Ученик';
   return code?{id:participantKey(code),code,name,role:'student'}:null;
  },
  get state(){return null},
  leave:()=>{document.getElementById('cbExit')?.click();return Promise.resolve()}
 };
})();
