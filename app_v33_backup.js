
// v31: スマホ連打時のダブルタップ拡大を防止
(function preventDoubleTapZoom(){
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(e){
    const now = Date.now();
    if(now - lastTouchEnd <= 300){ e.preventDefault(); }
    lastTouchEnd = now;
  }, {passive:false});
  document.addEventListener('dblclick', function(e){ e.preventDefault(); }, {passive:false});
})();
let s = {
  team:"自チーム", oppTeam:"相手", setNo:"1",
  nums:["1","2","3","4","5","7"], setterIndex:3,
  positions:["ライト後衛","レフト後衛","レフト前衛","センター前衛","ライト前衛","センター後衛"],
  players:{"1":"","2":"","3":"","4":"","5":"","7":""},
  rot:1, my:0, op:0, serve:"mine",
  mode:"スパイク", result:"成功", logs:[], hist:[]
};
let setupSelected = 0;
let numberPool = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15"];
const actionTypes=["トス","レセプ","ディグ","スパイク","ブロック","サーブ"];
const defaultPositions=["ライト後衛","レフト後衛","レフト前衛","センター前衛","ライト前衛","センター後衛"];

function show(id){
  closeSideMenu && closeSideMenu();
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const bottom=document.getElementById("bottomBar");
  if(bottom) bottom.classList.add("hidden");
  render();
}
function openSideMenu(){ document.body.classList.add("menuOpen"); }
function closeSideMenu(){ document.body.classList.remove("menuOpen"); }
function menuGo(target){
  closeSideMenu();
  if(target==="report"){ showReport(); return; }
  if(target==="match"){ show("match"); return; }
  if(target==="setup"){ show("setup"); return; }
  show("home");
  setTimeout(()=>{
    const map={growth:"growthDashboardCard",csv:"csvImportCard",about:"growthDashboardCard"};
    const el=document.getElementById(map[target]||"");
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
  },80);
}

function goHome(){
  if(confirm("ホームへ戻りますか？\n試合中の記録は保存されています。")){
    show("home");
  }
}
function save(){ localStorage.setItem("setterTheoryV2", JSON.stringify(s)); }
function load(){
  const x=localStorage.getItem("setterTheoryV2");
  if(x){
    try{s=JSON.parse(x);}catch(e){}
  }
  if(!s.positions) s.positions=defaultPositions.slice();
  if(!s.hist) s.hist=[];
  if(!s.logs) s.logs=[];
  if(!s.nums) s.nums=["1","2","3","4","5","7"];
  if(!s.players) s.players={};
  s.nums.forEach(n=>{ if(s.players[n]===undefined) s.players[n]=""; });
}
function snap(){
  s.hist.push(JSON.stringify({...s,hist:[]}));
  if(s.hist.length>300)s.hist.shift();
}
function rotateClockwiseOnce(a){
  // 表示上の時計回り：
  // 左上(pos2) → 上中(pos6) → 右上(pos1) → 右下(pos5) → 下中(pos4) → 左下(pos3)
  // s.numsの並びは [pos1,pos2,pos3,pos4,pos5,pos6]
  return [a[5], a[2], a[3], a[4], a[0], a[1]];
}
function rotationNums(){
  let a=s.nums.slice();
  for(let i=1;i<s.rot;i++){ a=rotateClockwiseOnce(a); }
  return a;
}
function rotatedSetterNum(){ return s.nums[s.setterIndex]; }
function nextRot(){ s.rot=s.rot%6+1; }
function getPlayerName(num){ return (s.players && s.players[String(num)]) ? s.players[String(num)] : ""; }
function serverPos(){
  // サーブ権ありのときは現在の右後衛(pos1)を赤枠にする
  return s.serve==="mine" ? 1 : null;
}

function playLabel(){
  if(s.mode==="トス") return `トス→${s.result}`;
  if(s.mode==="レセプ") return `${s.result}`;
  if(s.result==="エース") return "サービスエース";
  if(s.result==="シャット") return "ブロックシャット";
  if(s.result==="ワンタッチ") return "ブロックワンタッチ";
  if(s.result==="被ブロック") return "被ブロック";
  if(s.result==="継続") return `${s.mode}継続`;
  return `${s.mode}${s.result}`;
}
function addPlayerName(){
  const no=document.getElementById("newPlayerNo").value.trim();
  const name=document.getElementById("newPlayerName").value.trim();
  if(!no){ alert("背番号を入力してください"); return; }
  if(!s.players) s.players={};
  s.players[no]=name;
  if(!numberPool.includes(no)) numberPool.push(no);
  document.getElementById("newPlayerNo").value="";
  document.getElementById("newPlayerName").value="";
  save(); renderSetup(); renderMatchNumberBank(); render();
}

function renderSetup(){
  const spots=document.querySelectorAll(".setupSpot");
  spots.forEach((b,i)=>{
    b.classList.toggle("active", i===setupSelected);
    b.classList.toggle("setter", i===s.setterIndex);
    const currentNum=s.nums[i] || "-";
    const num=b.querySelector(".num");
    if(num) num.innerHTML=`<span>${currentNum}</span><span class="setupName">${getPlayerName(currentNum)}</span>`;
    const name=b.querySelector(".name");
    if(name) name.textContent=s.positions[i] || "";
    const sel=b.querySelector(".nameSelect");
    if(sel){
      const pool=[...new Set([...numberPool,...s.nums,Object.keys(s.players||{})].flat().filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
      sel.innerHTML=pool.map(n=>`<option value="${n}" ${String(currentNum)===String(n)?"selected":""}>${n}${getPlayerName(n)?" "+getPlayerName(n):""}</option>`).join("");
    }
  });
  const used=new Set(s.nums);
  const bank=document.getElementById("numberBank");
  if(bank){
    bank.innerHTML="";
    const pool=[...new Set([...numberPool,...s.nums].filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
    pool.forEach(n=>{
      const btn=document.createElement("button");
      btn.className="numBtn";
      btn.textContent=n;
      if(used.has(n))btn.classList.add("used");
      if(s.nums[setupSelected]===n)btn.classList.add("active");
      btn.onclick=()=>{s.nums[setupSelected]=n; if(!s.players) s.players={}; if(s.players[n]===undefined) s.players[n]=""; save(); renderSetup(); renderMatchNumberBank();};
      bank.appendChild(btn);
    });
  }
}
function addNumber(){
  const n=prompt("追加する背番号は？");
  if(!n)return;
  numberPool.push(n);
  if(!s.players) s.players={};
  if(s.players[n]===undefined) s.players[n]="";
  s.nums[setupSelected]=n;
  save(); renderSetup(); renderMatchNumberBank();
}
function toggleSetter(){
  s.setterIndex=setupSelected;
  save(); renderSetup(); render();
}
function startMatch(){
  s.team=document.getElementById("team").value || "自チーム";
  s.oppTeam=document.getElementById("oppTeam").value || "相手";
  s.setNo=document.getElementById("setNo").value;
  s.serve=document.getElementById("startServe").value;
  s.rot=1; s.my=0; s.op=0; s.mode="スパイク"; s.result="成功"; s.logs=[]; s.hist=[];
  save(); show("match");
}
function pointByResult(result){
  const before=s.serve;

  // 自チーム得点になるもの
  if(
    (s.mode==="スパイク" && result==="成功") ||
    (s.mode==="サーブ" && result==="エース") ||
    (s.mode==="ブロック" && result==="シャット")
  ){
    s.my++;
    if(before==="opp"){ nextRot(); s.serve="mine"; }
    return "自";
  }

  // 相手得点になるもの
  if(
    (s.mode==="スパイク" && (result==="ミス" || result==="被ブロック")) ||
    (s.mode==="サーブ" && result==="ミス") ||
    (s.mode==="レセプ" && result==="ミス") ||
    (s.mode==="レセプ" && result==="レセプミス") ||
    (s.mode==="ディグ" && result==="ミス") ||
    (s.mode==="ブロック" && result==="ミス") ||
    (s.mode==="ブロック" && result==="ブロックミス")
  ){
    s.op++;
    s.serve="opp";
    return "相";
  }

  // レセプA/B/C、ディグ成功、トス先、ワンタッチ、継続などは得点なし
  return "継続";
}

function add(pos){
  const nums=rotationNums();
  const num=nums[Number(pos)-1];
  addByNumber(num, pos);
}
function addByNumber(num, pos="-"){
  snap();
  const point=pointByResult(s.result);
  s.logs.push({
    no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:s.mode,
    num:String(num),pos:String(pos),result:s.result,point:point,
    score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()
  });
  save(); render();
}
function pointOnly(team){
  snap();
  if(team==="my"){
    const before=s.serve; s.my++;
    if(before==="opp"){nextRot(); s.serve="mine";}
    s.logs.push({no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:"得点",num:"-",pos:"-",result:"自チーム得点",point:"自",score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()});
  }else{
    s.op++; s.serve="opp";
    s.logs.push({no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:"得点",num:"-",pos:"-",result:"相手得点",point:"相",score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()});
  }
  save(); render();
}
function manualRotate(){snap();nextRot();save();render();}
function toggleServe(){snap();s.serve=s.serve==="mine"?"opp":"mine";save();render();}
function undo(){
  const h=s.hist.pop();
  if(!h){ alert("取り消す記録がありません"); return; }
  const keep=s.hist;
  s=JSON.parse(h);
  s.hist=keep;
  save(); render();
}
function clearLogs(){
  if(!confirm("すべての記録を消しますか？")) return;
  snap();
  s.logs=[]; s.my=0; s.op=0; s.rot=1; s.serve="mine";
  save(); render();
}
function render(){
  if(document.getElementById("setup").classList.contains("active")) renderSetup();
  if(!document.getElementById("match").classList.contains("active") && !document.getElementById("report").classList.contains("active")) return;
  document.getElementById("rot").textContent=s.rot;
  document.getElementById("myScore").textContent=s.my;
  document.getElementById("opScore").textContent=s.op;
  document.getElementById("serveLabel").textContent=s.serve==="mine"?"自サーブ":"相手サーブ";
  document.getElementById("modeBadge").textContent=playLabel();
  const spl=document.getElementById("selectedPlayLabel"); if(spl) spl.textContent=playLabel();
  const nums=rotationNums();
  const setterNum=rotatedSetterNum();
  document.querySelectorAll(".player").forEach(b=>{
    const n=nums[Number(b.dataset.pos)-1];
    b.textContent=n;
    b.classList.toggle("setter", n===setterNum);
  });
  document.querySelectorAll(".fastBtn").forEach(b=>b.classList.toggle("active", b.dataset.type===s.mode && b.dataset.result===s.result));
  renderMatchNumberBank();
  quick();
}
function renderMatchNumberBank(){
  const bank=document.getElementById("matchNumberBank");
  if(!bank) return;
  bank.innerHTML="";
  const pool=[...new Set(s.nums.filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  pool.forEach(n=>{
    const btn=document.createElement("button");
    btn.className="matchNumBtn";
    btn.textContent=n;
    btn.onclick=()=>addByNumber(n);
    bank.appendChild(btn);
  });
}

function isSuccessResult(x){
  return ["成功","エース","シャット","Aパス","Bパス","Cパス","レフト","センター","ライト","バック","ツー","ワンタッチ"].includes(x.result);
}
function isMissResult(x){
  return (
    (x.type==="スパイク" && (x.result==="ミス" || x.result==="被ブロック")) ||
    (x.type==="サーブ" && x.result==="ミス") ||
    (x.type==="レセプ" && (x.result==="ミス" || x.result==="レセプミス")) ||
    (x.type==="ディグ" && x.result==="ミス") ||
    (x.type==="ブロック" && (x.result==="ミス" || x.result==="ブロックミス"))
  );
}

function buildOverallTable(){
  let html="<table><tr><th>項目</th><th>本数</th><th>成功</th><th>ミス</th><th>成功率</th></tr>";
  actionTypes.forEach(t=>{
    const a=s.logs.filter(x=>x.type===t);
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(isMissResult).length;
    const pct=a.length?Math.round(ok/a.length*100):0;
    html+=`<tr><td>${t}</td><td>${a.length}</td><td>${ok}</td><td>${miss}</td><td>${pct}%</td></tr>`;
  });
  html+="</table>";
  return html;
}

function buildOverallBars(){
  const total=s.logs.filter(x=>actionTypes.includes(x.type)).length || 0;
  let html="<div class='barChart'>";
  actionTypes.forEach(t=>{
    const count=s.logs.filter(x=>x.type===t).length;
    const pct=total?Math.round(count/total*100):0;
    html+=`<div class="barRow"><div class="barLabel">${t}</div><div class="barTrack"><div class="barFill" style="width:${pct}%"></div></div><div class="barNum">${count}本</div></div>`;
  });
  html+="</div>";
  return html;
}
function buildResultBars(){
  const labels=["成功","ミス","被ブロック","継続"];
  const total=s.logs.filter(x=>actionTypes.includes(x.type)).length || 0;
  let html="<div class='barChart'>";
  labels.forEach(t=>{
    const count=s.logs.filter(x=>x.result===t).length;
    const pct=total?Math.round(count/total*100):0;
    html+=`<div class="barRow"><div class="barLabel">${t}</div><div class="barTrack"><div class="barFill result" style="width:${pct}%"></div></div><div class="barNum">${count}本</div></div>`;
  });
  html+="</div>";
  return html;
}
function buildPersonalBars(){
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  const max=Math.max(1,...nums.map(n=>s.logs.filter(x=>String(x.num)===String(n)).length));
  let html="<div class='barChart'>";
  nums.forEach(n=>{
    const count=s.logs.filter(x=>String(x.num)===String(n)).length;
    const pct=Math.round(count/max*100);
    html+=`<div class="barRow"><div class="barLabel">${n}番</div><div class="barTrack"><div class="barFill person" style="width:${pct}%"></div></div><div class="barNum">${count}本</div></div>`;
  });
  html+="</div>";
  return html;
}

function pctClass(pct){
  if(pct>=60) return "good";
  if(pct>=40) return "mid";
  return "bad";
}
function buildReportHero(){
  const actionLogs=s.logs.filter(x=>actionTypes.includes(x.type));
  const total=actionLogs.length;
  const ok=actionLogs.filter(isSuccessResult).length;
  const miss=actionLogs.filter(isMissResult).length;
  const blocked=actionLogs.filter(x=>x.result==="被ブロック").length;
  const okPct=total?Math.round(ok/total*100):0;
  const missPct=total?Math.round(miss/total*100):0;
  const blockPct=total?Math.round(blocked/total*100):0;
  return `<div class="reportHero">
    <div class="metricCard"><div class="metricLabel">総入力</div><div class="metricValue">${total}</div><div class="metricSub">本</div></div>
    <div class="metricCard"><div class="metricLabel">成功率</div><div class="metricValue">${okPct}%</div><div class="metricSub">${ok}/${total}</div></div>
    <div class="metricCard"><div class="metricLabel">失点系</div><div class="metricValue">${missPct+blockPct}%</div><div class="metricSub">ミス＋被ブロック</div></div>
  </div>`;
}
function buildResultSummary(){
  const actionLogs=s.logs.filter(x=>actionTypes.includes(x.type));
  const total=actionLogs.length || 0;
  const groups=[
    ["成功系","success",x=>isSuccessResult(x)],
    ["失点系","miss",x=>isMissResult(x)],
    ["被ブロック","blocked",x=>x.result==="被ブロック"],
    ["継続","cont",x=>x.result==="継続"]
  ];
  return `<div class="resultSummary">${
    groups.map(([label,cls,fn])=>{
      const count=actionLogs.filter(fn).length;
      const pct=total?Math.round(count/total*100):0;
      return `<div class="resultBox ${cls}"><div class="label">${label}</div><div class="pct">${pct}%</div><div class="metricSub">${count}/${total}</div></div>`;
    }).join("")
  }</div>`;
}
function buildActionPercentBars(){
  const total=s.logs.filter(x=>actionTypes.includes(x.type)).length || 0;
  let html="<div class='bigBarChart'>";
  actionTypes.forEach(t=>{
    const count=s.logs.filter(x=>x.type===t).length;
    const pct=total?Math.round(count/total*100):0;
    html+=`<div class="bigBarRow"><div class="bigBarLabel">${t}</div><div class="bigBarTrack"><div class="bigBarFill" style="width:${pct}%"></div></div><div class="bigBarPct">${pct}%</div></div>`;
  });
  html+="</div>";
  return html;
}
function buildSuccessPercentTable(){
  let html="<table class='percentTable'><tr><th>項目</th><th>成功率</th><th>成功/本数</th><th>ミス</th><th>被ブロック</th></tr>";
  actionTypes.forEach(t=>{
    const a=s.logs.filter(x=>x.type===t);
    const total=a.length;
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(x=>x.result==="ミス").length;
    const blocked=a.filter(x=>x.result==="被ブロック").length;
    const pct=total?Math.round(ok/total*100):0;
    html+=`<tr><td>${t}</td><td><span class="percentCell ${pctClass(pct)}">${pct}%</span></td><td>${ok}/${total}</td><td>${miss}</td><td>${blocked}</td></tr>`;
  });
  html+="</table>";
  return html;
}
function buildPersonalSuccessTable(){
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  let html="<table class='percentTable'><tr><th>選手</th><th>成功率</th><th>成功/本数</th><th>ミス</th><th>被ブロック</th></tr>";
  nums.forEach(n=>{
    const a=s.logs.filter(x=>String(x.num)===String(n) && actionTypes.includes(x.type));
    const total=a.length;
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(x=>x.result==="ミス").length;
    const blocked=a.filter(x=>x.result==="被ブロック").length;
    const pct=total?Math.round(ok/total*100):0;
    const name=getPlayerName(n);
    html+=`<tr><td>${n}${name?`<br><small>${name}</small>`:""}</td><td><span class="percentCell ${pctClass(pct)}">${pct}%</span></td><td>${ok}/${total}</td><td>${miss}</td><td>${blocked}</td></tr>`;
  });
  html+="</table>";
  return html;
}


function buildIndividualTable(){
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  let html="<table><tr><th>番</th>"+actionTypes.map(t=>`<th>${t}</th>`).join("")+"<th>合計</th></tr>";
  nums.forEach(n=>{
    const logs=s.logs.filter(x=>String(x.num)===String(n));
    html+=`<tr><td>${n}</td>`;
    actionTypes.forEach(t=>{html+=`<td>${logs.filter(x=>x.type===t).length}</td>`;});
    html+=`<td>${logs.length}</td></tr>`;
  });
  html+="</table>";
  return html;
}
function quick(){
  const target=document.getElementById("quick");
  if(!target)return;
  target.innerHTML=`
    ${buildReportHero()}
    ${buildResultSummary()}
    <div class="quickWrap">
      <div><div class="quickTitle">項目別の割合</div>${buildActionPercentBars()}</div>
      <div><div class="quickTitle">項目別の成功率</div><div class="quickScroll">${buildSuccessPercentTable()}</div></div>
      <div><div class="quickTitle">個人別の成功率</div><div class="quickScroll">${buildPersonalSuccessTable()}</div></div>
      <div><div class="quickTitle">選手別の入力数</div>${buildPersonalBars()}</div>
    </div>`;
}
function showReport(){report();show("report");}

function safePct(part,total){ return total ? Math.round(part/total*100) : 0; }
function cssClassByPct(pct){ if(pct>=70)return ""; if(pct>=50)return "mid"; return "bad"; }
function donutStyle(items){
  const total=items.reduce((a,x)=>a+x.count,0) || 1;
  let deg=0;
  const parts=items.map(x=>{
    const start=deg;
    deg += x.count/total*360;
    return `${x.color} ${start}deg ${deg}deg`;
  });
  return `conic-gradient(${parts.join(",")})`;
}
function legendHtml(items,total){
  return `<div class="legend">`+items.map(x=>{
    const pct=safePct(x.count,total);
    return `<div class="legendRow"><span class="dot" style="background:${x.color}"></span><span>${x.label}</span><span>${pct}% (${x.count})</span></div>`;
  }).join("")+`</div>`;
}
function metricCard(label,value,sub,color,icon,pct){
  return `<div class="statCard">
    <div class="statTop"><span class="statIcon">${icon}</span><span>${label}</span></div>
    <div class="statValue ${color}">${value}</div>
    <div class="statSub">${sub}</div>
    <div class="miniTrack"><div class="miniFill" style="width:${Math.max(0,Math.min(100,pct||0))}%;background:var(--${color==='blue'?'blue':color==='red'?'red':color==='green'?'green':color==='orange'?'orange':'purple'})"></div></div>
  </div>`;
}

let reportRankType = localStorage.getItem("vollyzeReportRankType") || "スパイク";
let reportSortType = localStorage.getItem("vollyzeReportSortType") || "rate";

function safePct(part,total){ return total ? Math.round(part/total*100) : 0; }
function cssClassByPct(pct){ if(pct>=70)return ""; if(pct>=50)return "mid"; return "bad"; }
function donutStyle(items){
  const total=items.reduce((a,x)=>a+x.count,0) || 1;
  let deg=0;
  const parts=items.map(x=>{const st=deg; deg += x.count/total*360; return `${x.color} ${st}deg ${deg}deg`;});
  return `conic-gradient(${parts.join(",")})`;
}
function legendHtml(items,total){
  return `<div class="legend">`+items.map(x=>{
    const pct=safePct(x.count,total);
    return `<div class="legendRow"><span class="dot" style="background:${x.color}"></span><span>${x.label}</span><span>${pct}% (${x.count})</span></div>`;
  }).join("")+`</div>`;
}
function metricCard(label,value,sub,color,icon,pct){
  const c=color==='blue'?'#2563eb':color==='red'?'#dc2626':color==='green'?'#16a34a':color==='orange'?'#f97316':'#7c3aed';
  return `<div class="statCard">
    <div class="statTop"><span class="statIcon">${icon}</span><span>${label}</span></div>
    <div class="statValue ${color}">${value}</div>
    <div class="miniTrack">
      <div class="miniFill" style="width:${Math.max(0,Math.min(100,pct||0))}%;background:${c}"></div>
      <div class="barValue">${value}</div>
    </div>
    <div class="statSub">${sub}</div>
  </div>`;
}
function rankConfig(type){
  const map={
    "スパイク":{title:"スパイク決定率ランキング", success:"決定数", total:"打数", rate:"決定率", note:"決定率 ＝ スパイク成功 ÷ スパイク打数", ok:x=>x.type==="スパイク"&&x.result==="成功", all:x=>x.type==="スパイク"},
    "サーブ":{title:"サーブ成功率ランキング", success:"成功数", total:"総数", rate:"成功率", note:"成功率 ＝ サーブ成功＋サービスエース ÷ サーブ総数", ok:x=>x.type==="サーブ"&&(x.result==="成功"||x.result==="エース"), all:x=>x.type==="サーブ"},
    "レセプ":{title:"レセプション成功率ランキング", success:"成功数", total:"総数", rate:"成功率", note:"成功率 ＝ Aパス＋Bパス＋Cパス ÷ レセプ総数", ok:x=>x.type==="レセプ"&&(x.result==="Aパス"||x.result==="Bパス"||x.result==="Cパス"), all:x=>x.type==="レセプ"},
    "トス":{title:"トス成功率ランキング", success:"成功数", total:"総数", rate:"成功率", note:"成功率 ＝ レフト/センター/ライト/バック/ツーの記録 ÷ トス総数", ok:x=>x.type==="トス", all:x=>x.type==="トス"},
    "ディグ":{title:"ディグ成功率ランキング", success:"成功数", total:"総数", rate:"成功率", note:"成功率 ＝ ディグ成功 ÷ ディグ総数", ok:x=>x.type==="ディグ"&&x.result==="成功", all:x=>x.type==="ディグ"},
    "ブロック":{title:"ブロック成功率ランキング", success:"成功数", total:"総数", rate:"成功率", note:"成功率 ＝ シャット＋ワンタッチ ÷ ブロック総数", ok:x=>x.type==="ブロック"&&(x.result==="シャット"||x.result==="ワンタッチ"), all:x=>x.type==="ブロック"}
  };
  return map[type] || map["スパイク"];
}
function buildPersonalRanking(){
  const cfg=rankConfig(reportRankType);
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  let rows=nums.map(n=>{
    const all=s.logs.filter(x=>String(x.num)===String(n) && cfg.all(x));
    const ok=all.filter(cfg.ok).length;
    const pct=safePct(ok,all.length);
    return {n,name:getPlayerName(n)||`${n}番`, ok,total:all.length,pct};
  });
  rows.sort((a,b)=>{
    if(reportSortType==="success") return b.ok-a.ok || b.pct-a.pct;
    if(reportSortType==="tries") return b.total-a.total || b.pct-a.pct;
    return b.pct-a.pct || b.ok-a.ok || b.total-a.total;
  });
  const list=rows.map((r,i)=>`
    <div class="bigBarRow">
      <div class="bigBarRank">${i+1}</div>
      <div class="bigBarName">${r.n} ${r.name}</div>
      <div class="bigBarNum">${r.ok}</div>
      <div class="bigBarNum">${r.total}</div>
      <div class="bigBarTrack"><div class="bigBarFill" style="width:${r.pct}%"></div></div>
      <div class="bigBarBadge ${cssClassByPct(r.pct)}">${r.pct}%</div>
    </div>`).join("");
  return `<div class="rankControls">
    <div><label>表示項目</label><br><select id="rankTypeSelect" onchange="reportRankType=this.value;localStorage.setItem('vollyzeReportRankType',this.value);report();">
      ${["スパイク","サーブ","レセプ","トス","ディグ","ブロック"].map(t=>`<option value="${t}" ${reportRankType===t?"selected":""}>${rankConfig(t).title}</option>`).join("")}
    </select></div>
    <div><label>並び替え</label><br><select id="rankSortSelect" onchange="reportSortType=this.value;localStorage.setItem('vollyzeReportSortType',this.value);report();">
      <option value="rate" ${reportSortType==="rate"?"selected":""}>成功率順</option>
      <option value="success" ${reportSortType==="success"?"selected":""}>成功数順</option>
      <option value="tries" ${reportSortType==="tries"?"selected":""}>試行数順</option>
    </select></div>
  </div>
  <h3>個人成績 <small>（${cfg.title}）</small></h3>
  <div class="bigBarRow" style="font-size:12px;color:var(--muted);font-weight:1000">
    <div>順位</div><div>選手</div><div>${cfg.success}</div><div>${cfg.total}</div><div></div><div>${cfg.rate}</div>
  </div>
  <div class="bigBars">${list}</div>
  <div class="rankNote">※ ${cfg.note}</div>`;
}
function report(){
  const actionLogs=s.logs.filter(x=>actionTypes.includes(x.type));
  const total=actionLogs.length;
  const success=actionLogs.filter(isSuccessResult).length;
  const loss=s.logs.filter(x=>x.point==="相").length;
  const myPts=s.logs.filter(x=>x.point==="自").length;
  const opPts=s.logs.filter(x=>x.point==="相").length;
  const serveLogs=s.logs.filter(x=>x.type==="サーブ");
  const serveOk=serveLogs.filter(x=>x.result==="成功"||x.result==="エース").length;
  const spikeLogs=s.logs.filter(x=>x.type==="スパイク");
  const spikeKill=spikeLogs.filter(x=>x.result==="成功").length;

  const successPct=safePct(success,total), lossPct=safePct(loss,total), servePct=safePct(serveOk,serveLogs.length), spikePct=safePct(spikeKill,spikeLogs.length);
  const summary=`<div class="summaryCards">
    ${metricCard("成功率",successPct+"%",`成功 ${success} / 総数 ${total}`,"blue","🎯",successPct)}
    ${metricCard("失点率",lossPct+"%",`失点 ${loss} / 総数 ${total}`,"red","🛡",lossPct)}
    ${metricCard("サーブ成功率",servePct+"%",`成功 ${serveOk} / 総数 ${serveLogs.length}`,"green","🏐",servePct)}
    ${metricCard("スパイク決定率",spikePct+"%",`決定 ${spikeKill} / 打数 ${spikeLogs.length}`,"orange","🏃",spikePct)}
    ${metricCard("総プレー数",total,`総数 ${total}プレー`,"purple","〽",100)}
  </div>`;

  const playColors={"サーブ":"#ef4444","レセプ":"#2563eb","スパイク":"#22c55e","トス":"#f59e0b","ディグ":"#7c3aed","ブロック":"#334155"};
  const playItems=actionTypes.map(t=>({label:t,count:s.logs.filter(x=>x.type===t).length,color:playColors[t]})).filter(x=>x.count>0);
  const playDonut=`<div class="donutWrap"><div class="donut" style="background:${donutStyle(playItems)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${total}</div></div></div>${legendHtml(playItems,total)}</div>`;

  const resultGroups=[
    {label:"成功系",count:actionLogs.filter(isSuccessResult).length,color:"#22c55e"},
    {label:"継続",count:actionLogs.filter(x=>x.result==="継続").length,color:"#2563eb"},
    {label:"ミス",count:actionLogs.filter(x=>x.result==="ミス"||x.result==="レセプミス"||x.result==="ブロックミス").length,color:"#ef4444"},
    {label:"被ブロック",count:actionLogs.filter(x=>x.result==="被ブロック").length,color:"#f59e0b"},
  ].filter(x=>x.count>0);
  const resultDonut=`<div class="donutWrap"><div class="donut" style="background:${donutStyle(resultGroups)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${total}</div></div></div>${legendHtml(resultGroups,total)}</div>`;

  const pointItems=[{label:"自チーム得点",count:myPts,color:"#22c55e"},{label:"相手チーム得点",count:opPts,color:"#ef4444"}].filter(x=>x.count>0);
  const pointDonut=`<div class="donutWrap"><div class="donut" style="background:${donutStyle(pointItems)}"><div class="donutCenter"><div class="label">合計</div><div class="num">${myPts+opPts}</div></div></div>${legendHtml(pointItems,myPts+opPts)}</div>`;

  const rotationRows=[1,2,3,4,5,6].map(r=>{
    const a=s.logs.filter(x=>x.rot==="S"+r);
    const ok=a.filter(isSuccessResult).length;
    const pct=safePct(ok,a.length);
    return `<div class="rotationRow ${s.rot===r?"currentRotation":""}"><div class="rotationLabel">S${r}</div><div class="rotationPct">${pct}% (${ok}/${a.length})</div><div class="rotationTrack"><div class="rotationFill ${cssClassByPct(pct)}" style="width:${pct}%"></div></div></div>`;
  }).join("");

  const tossLogs=s.logs.filter(x=>x.type==="トス");
  const tossLabels=["レフト","センター","ライト","バック","ツー"];
  const tossColors={"レフト":"#ef4444","センター":"#2563eb","ライト":"#22c55e","バック":"#f59e0b","ツー":"#0f172a"};
  const tossItems=tossLabels.map(t=>({label:t,count:tossLogs.filter(x=>x.result===t).length,color:tossColors[t]})).filter(x=>x.count>0);
  const tossDonut=`<div class="tossPanel"><div class="donut" style="background:${donutStyle(tossItems)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${tossLogs.length}</div></div></div>${legendHtml(tossItems,tossLogs.length)}</div>`;

  const iconFor=x=>{if(isMissResult(x)) return ["×","tMiss"]; if(x.result==="被ブロック") return ["△","tBlock"]; if(x.result==="継続") return ["−","tCont"]; return ["○","tSuccess"];};
  const recent=s.logs.slice(-20).map(x=>{const [ic,cls]=iconFor(x);return `<div class="timelineItem"><div class="timelineNo">${x.no}</div><div class="timelineIcon ${cls}">${ic}</div><div class="timelineText">${x.type}</div></div>`;}).join("");

  const dashboard=`<div class="reportGrid">
    ${summary}
    <div class="panelGrid">
      <div class="reportPanel"><h3>プレー割合 <small>（何をどれだけやったか）</small></h3>${playDonut}</div>
      <div class="reportPanel"><h3>結果割合 <small>（プレーの結果）</small></h3>${resultDonut}</div>
      <div class="reportPanel"><h3>得点・失点</h3>${pointDonut}</div>
    </div>
    <div class="wideGrid">
      <div class="reportPanel">${buildPersonalRanking()}</div>
      <div class="reportPanel"><h3>ローテーション別 成功率</h3>${rotationRows}</div>
    </div>
    <div class="bottomGrid">
      <div class="reportPanel"><h3>トス配分 <small>（どこに集めているか）</small></h3>${tossDonut}</div>
      <div class="reportPanel"><h3>直近ログ <small>（最新20プレー）</small></h3><div class="timeline">${recent}</div><div class="logLegend"><span>🟢 成功系</span><span>🔵 継続</span><span>🔴 ミス</span><span>🟠 被ブロック</span></div></div>
    </div>
  </div>`;
  const dash=document.getElementById("reportDashboard"); if(dash) dash.innerHTML=dashboard;
  const sub=document.getElementById("reportSub"); if(sub) sub.textContent=`${new Date().toLocaleDateString()}　vs ${s.oppTeam || "相手"}`;
}

function downloadCSV(){
  const rows=[["No","Set","Rotation","Type","Number","Name","Position","Result","Point","Score","Time"]];
  s.logs.forEach(x=>rows.push([x.no,x.set,x.rot,x.type,x.num,getPlayerName(x.num),x.pos,x.result,x.point,x.score,x.time]));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="setter_theory_log.csv"; a.click();
}



// v20: β版に向けたCSV完全解析（配球 / セット / ローテ / 得点差 / 終盤 / A・Bパス）
function normalizeKey(v){
  return String(v||'').toLowerCase().replace(/[\s_\-・./()（）]/g,'');
}
function findHeader(headers, keywords){
  const ns=headers.map(h=>[h, normalizeKey(h)]);
  for(const kw of keywords){
    const nkw=normalizeKey(kw);
    const hit=ns.find(([h,n])=>n===nkw || n.includes(nkw));
    if(hit) return hit[0];
  }
  return null;
}
function getCell(row, keys){
  for(const k of keys){
    if(k && row[k]!==undefined && String(row[k]).trim()!=='') return String(row[k]).trim();
  }
  return '';
}
function classifyTossTarget(value){
  const v=String(value||'').trim();
  const n=normalizeKey(v);
  if(!v) return '未分類';
  if(/レフト|left|outside|oh|ls/.test(n)) return 'レフト';
  if(/センター|ミドル|middle|mb|quick|クイック/.test(n)) return 'センター';
  if(/ライト|right|opposite|rs/.test(n)) return 'ライト';
  if(/バック|back|pipe|bick|パイプ/.test(n)) return 'バック';
  if(/ツー|two|dump|setterattack|setter attack|second|2nd/.test(n)) return 'ツー';
  if(/^1$|^１$|pos1|p1/.test(n)) return 'ライト';
  if(/^2$|^２$|^4$|^４$|pos2|p2|pos4|p4/.test(n)) return 'レフト';
  if(/^3$|^３$|pos3|p3/.test(n)) return 'センター';
  if(/^6$|^６$|pos6|p6/.test(n)) return 'バック';
  return v;
}
function addCount(obj,key){ obj[key]=(obj[key]||0)+1; }
function pctText(count,total){ return total ? Math.round(count/total*100) : 0; }
function scoreParts(score){
  const m=String(score||'').match(/(\d+)\s*[-―ー－]\s*(\d+)/);
  if(!m) return null;
  return {my:Number(m[1]), op:Number(m[2]), diff:Math.abs(Number(m[1])-Number(m[2])), high:Math.max(Number(m[1]),Number(m[2]))};
}
function scoreBucket(score){
  const s=scoreParts(score);
  if(!s) return '不明';
  if(s.high>=20) return '20点以降';
  if(s.diff<=5) return '〜5点差';
  if(s.diff<=15) return '6〜15点差';
  return '16点差以上';
}
function passGrade(v){
  const n=normalizeKey(v);
  if(/aパス|apass|areception|a$/.test(n)) return 'Aパス';
  if(/bパス|bpass|breception|b$/.test(n)) return 'Bパス';
  if(/cパス|cpass|creception|c$/.test(n)) return 'Cパス';
  if(/ミス|miss/.test(n)) return 'ミス';
  return '';
}
function analysisItemsFromCounts(counts,total){
  const order=['レフト','センター','ライト','バック','ツー','未分類'];
  return Object.entries(counts)
    .sort((a,b)=>{
      const ia=order.indexOf(a[0])>=0?order.indexOf(a[0]):99;
      const ib=order.indexOf(b[0])>=0?order.indexOf(b[0]):99;
      return ia===ib ? b[1]-a[1] : ia-ib;
    })
    .map(([label,count])=>({label,count,pct:pctText(count,total)}));
}
function calcScores(counts,total,terminalCounts){
  const valid=['レフト','センター','ライト','バック','ツー'].filter(k=>(counts[k]||0)>0);
  const max=Math.max(0,...Object.values(counts));
  const sideDepend=pctText(max,total);
  const centerPct=pctText(counts['センター']||0,total);
  const backPct=pctText(counts['バック']||0,total);
  const leftRightBalance=100 - Math.abs((counts['レフト']||0) - (counts['ライト']||0)) / Math.max(1,total) * 100;
  const diversity=Math.min(100, valid.length*22 + Math.min(12,backPct));
  const balance=Math.max(0, Math.round(100 - Math.max(0,sideDepend-35)*1.25));
  const quick=Math.max(35, Math.min(99, Math.round(55 + centerPct*1.15 + backPct*.35 - Math.max(0,sideDepend-55)*.45)));
  const terminalTotal=Object.values(terminalCounts||{}).reduce((a,b)=>a+b,0);
  const terminalMax=Math.max(0,...Object.values(terminalCounts||{}));
  const clutch=terminalTotal ? Math.max(35, Math.round(100 - Math.max(0,pctText(terminalMax,terminalTotal)-50)*1.15)) : 70;
  const setterIq=Math.max(40, Math.min(99, Math.round(balance*.28 + diversity*.22 + quick*.24 + clutch*.16 + leftRightBalance*.10)));
  const foreshadow=Math.max(40, Math.min(99, Math.round(diversity*.55 + quick*.25 + balance*.20)));
  const blockInduce=Math.max(35, Math.min(99, Math.round(quick*.55 + diversity*.25 + (100-sideDepend)*.20)));
  return {setterIq,balance,diversity,quick,clutch,foreshadow,blockInduce,sideDepend,centerPct,backPct};
}
function analyzeImportedCsv(parsed){
  const headers=parsed?.headers||[];
  const rows=parsed?.data||[];
  const actionCol=findHeader(headers,['Type','種類','Action','Skill','Play','プレー','項目','動作']);
  const resultCol=findHeader(headers,['Result','結果','Outcome','評価','Eval','Grade']);
  const setCol=findHeader(headers,['Set','セット']);
  const rotCol=findHeader(headers,['Rotation','ローテーション','Rot','ローテ']);
  const numberCol=findHeader(headers,['Number','背番号','No','Player','選手']);
  const scoreCol=findHeader(headers,['Score','スコア']);

  const tossRows=[];
  const targetCounts={}, bySet={}, byRot={}, byScore={}, byPass={}, terminalCounts={}, bySetter={};
  let currentPass='';
  rows.forEach((r,idx)=>{
    const type=getCell(r,[actionCol]);
    const result=getCell(r,[resultCol]);
    const ntype=normalizeKey(type);
    if(ntype==='レセプ' || ntype==='レセプション' || ntype==='receive' || ntype==='reception'){
      currentPass=passGrade(result) || result || currentPass;
    }
    const isToss = ntype==='トス' || ntype==='set' || ntype==='toss';
    if(!isToss) return;
    const label=classifyTossTarget(result);
    const score=getCell(r,[scoreCol]);
    const setName=getCell(r,[setCol]) || '未設定';
    const rotName=getCell(r,[rotCol]) || '未設定';
    const pass=currentPass || '不明';
    const rec={row:r,idx,label,score,setName,rotName,pass};
    tossRows.push(rec);
    addCount(targetCounts,label);
    bySet[setName]=bySet[setName] || {}; addCount(bySet[setName],label);
    byRot[rotName]=byRot[rotName] || {}; addCount(byRot[rotName],label);
    const bucket=scoreBucket(score); byScore[bucket]=byScore[bucket] || {}; addCount(byScore[bucket],label);
    byPass[pass]=byPass[pass] || {}; addCount(byPass[pass],label);
    const sc=scoreParts(score); if(sc && sc.high>=20) addCount(terminalCounts,label);
    const setterNo=getCell(r,[numberCol]) || '-'; bySetter[setterNo]=bySetter[setterNo] || 0; bySetter[setterNo]++;
  });

  let base=tossRows;
  let usedFallback=false;
  if(!base.length){
    usedFallback=true;
    base=rows.filter(r=>/トス/.test(headers.map(h=>String(r[h]||'')).join(' '))).map((r,idx)=>{
      const label=classifyTossTarget(getCell(r,[resultCol]));
      addCount(targetCounts,label);
      return {row:r,idx,label,score:getCell(r,[scoreCol]),setName:getCell(r,[setCol])||'未設定',rotName:getCell(r,[rotCol])||'未設定',pass:'不明'};
    });
  }
  const total=base.length;
  const items=analysisItemsFromCounts(targetCounts,total);
  const scores=calcScores(targetCounts,total,terminalCounts);
  return {headers, rows, actionCol, resultCol, setCol, rotCol, numberCol, scoreCol, tossRows:base, total, items, bySet, byRot, byScore, byPass, terminalCounts, bySetter, usedFallback, ...scores};
}
function colorForLabel(label){
  if(label==='レフト') return '#e11d48';
  if(label==='センター') return '#f59e0b';
  if(label==='ライト') return '#22c55e';
  if(label==='バック') return '#2563eb';
  if(label==='ツー') return '#0f172a';
  return '#64748b';
}
function miniStack(counts){
  const total=Object.values(counts||{}).reduce((a,b)=>a+b,0);
  if(!total) return '<div class="stackBar empty"></div>';
  return `<div class="stackBar">${analysisItemsFromCounts(counts,total).filter(x=>x.count>0).map(x=>`<span style="width:${x.pct}%;background:${colorForLabel(x.label)}">${x.pct>=12?x.pct+'%':''}</span>`).join('')}</div>`;
}
function compactBreakdownTable(title, data){
  const keys=Object.keys(data).sort((a,b)=>String(a).localeCompare(String(b),'ja',{numeric:true}));
  if(!keys.length) return `<div class="csvSubPanel"><b>${title}</b><div class="csvSmall">データなし</div></div>`;
  const rows=keys.map(k=>{
    const counts=data[k];
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    const items=analysisItemsFromCounts(counts,total).filter(x=>x.count>0);
    return `<tr><td>${escapeHtml(k)}</td><td>${miniStack(counts)}</td><td>${items.map(x=>`${escapeHtml(x.label)} ${x.pct}%`).join(' / ')}</td><td>${total}本</td></tr>`;
  }).join('');
  return `<div class="csvSubPanel"><b>${title}</b><table class="csvMiniTable"><tbody>${rows}</tbody></table></div>`;
}

function buildOverallDiagnosis(a){
  const main=a.items[0] || {label:'-',pct:0,count:0};
  const center=a.items.find(x=>x.label==='センター') || {pct:0,count:0};
  const right=a.items.find(x=>x.label==='ライト') || {pct:0,count:0};
  const terminalTotal=Object.values(a.terminalCounts||{}).reduce((x,y)=>x+y,0);
  const terminalItems=analysisItemsFromCounts(a.terminalCounts||{},terminalTotal).filter(x=>x.count>0);
  const terminalMain=terminalItems[0] || null;
  const issues=[];
  const strengths=[];
  let priority='配球バランスを維持しながら、ローテ別に偏りが出る場面を確認する';
  let grade='B';
  let tone='normal';
  if(a.setterIq>=88){ grade='A'; tone='good'; strengths.push('全体評価が高く、配球判断の安定感があります。'); }
  else if(a.setterIq>=78){ grade='B+'; strengths.push('全体として良い内容です。細かい偏りを整える段階です。'); }
  else if(a.setterIq>=68){ grade='B'; issues.push('配球の偏りや勝負所の選択肢に改善余地があります。'); }
  else { grade='C'; tone='warn'; issues.push('まずは攻撃先を増やし、相手ブロックに的を絞らせないことが優先です。'); }
  if(main.pct>=55){ issues.push(`${main.label}への配球が${main.pct}%と高く、相手に読まれやすい傾向が見えます。`); priority=`序盤にセンター・ライトを1〜2本見せて、終盤の${main.label}を生かす`; tone='warn'; }
  else { strengths.push('極端な一方向依存は少なく、相手ブロックを分散しやすい配球です。'); }
  if(center.pct<15){ issues.push(`センター使用率が${center.pct}%で低めです。相手MBを中央に止める材料が不足しています。`); priority='A/Bパス時にセンターを必ず1本見せ、相手MBを固定させない展開を作る'; tone='warn'; }
  else if(center.pct>=22){ strengths.push('センターを一定数使えており、サイド攻撃を生かす伏線になっています。'); }
  if(right.pct<10){ issues.push('ライト使用率が低く、サイドの出口が片寄る可能性があります。'); }
  if(terminalMain && terminalMain.pct>=65){ issues.push(`20点以降は${terminalMain.label}が${terminalMain.pct}%です。勝負所で選択が寄っています。`); priority=`20点以降の最初の1本で${terminalMain.label}以外を見せ、終盤の選択肢を残す`; tone='warn'; }
  else if(terminalTotal>0){ strengths.push('20点以降でも極端な偏りは抑えられています。'); }
  if(a.balance>=85) strengths.push('配球バランス指数が高く、攻撃先の散らし方は良好です。');
  if(a.clutch>=85) strengths.push('終盤冷静度が高く、プレッシャー下でも判断が崩れにくい内容です。');
  const showStrengths=strengths.slice(0,3);
  const showIssues=issues.slice(0,3);
  return `<section class="overallDiagnosis ${tone}">
    <div class="overallTop"><div><span>🏐 🦅 Aquilaの診断</span><h3>${escapeHtml(grade)} 評価</h3></div><div class="overallIq">${a.setterIq}<small>/100</small></div></div>
    <div class="overallGrid">
      <div><b>良い点</b><ul>${(showStrengths.length?showStrengths:['トス傾向を可視化できています。次は意図と結果を結びつけて一緒に確認してみよう。']).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div><b>課題</b><ul>${(showIssues.length?showIssues:['大きな警戒ポイントは少なめです。ローテ別の細かい偏りを一緒に確認してみよう。']).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    </div>
    <div class="priorityAction"><b>次戦の最優先テーマ</b><p>${escapeHtml(priority)}</p></div>
  </section>`;
}

function buildCoachCards(a){
  const main=a.items[0] || {label:'-',pct:0,count:0};
  const center=a.items.find(x=>x.label==='センター') || {pct:0,count:0};
  const terminalTotal=Object.values(a.terminalCounts||{}).reduce((x,y)=>x+y,0);
  const terminalItems=analysisItemsFromCounts(a.terminalCounts||{},terminalTotal);
  const terminalMain=terminalItems[0];
  const good=[];
  const improve=[];
  const next=[];
  if(a.diversity>=80) good.push('配球先を複数使えていて、相手ブロックを絞らせにくい構成です。');
  if(center.pct>=20) good.push('センターを一定数使えているため、サイド攻撃の価値を上げられています。');
  if(a.clutch>=80) good.push('20点以降でも極端な偏りが少なく、勝負所で選択肢を残せています。');
  if(!good.length) good.push(`トス総数${a.total}本の傾向を可視化できています。ここから改善点を絞れます。`);
  if(main.pct>=55) improve.push(`${main.label}への配球が${main.pct}%と高く、終盤はブロックに読まれやすくなります。`);
  if(center.pct<18) improve.push(`センター使用率が${center.pct}%で低めです。Aパス時だけでも速攻を見せたいです。`);
  if(terminalMain && terminalMain.pct>=60) improve.push(`20点以降は${terminalMain.label}が${terminalMain.pct}%です。プレッシャー場面で選択が寄っています。`);
  if(!improve.length) improve.push('大きな偏りは少ないです。次はローテ別に弱い場面を一緒に確認してみよう。');
  next.push('ローテ別で偏りが強いSを確認し、練習で最初の1本目に別方向を使う約束を作る。');
  next.push('20点以降にセンターか逆サイドを1本見せる場面を、試合前に決めておく。');
  next.push('PDFに残すメモとして「なぜその配球にしたか」を試合後すぐ記録する。');
  return `<div class="coachCards">
    <div class="coachCard good"><b>🦅 Aquilaが見つけた強み</b><ul>${good.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    <div class="coachCard warn"><b>🦅 Aquilaが気になった点</b><ul>${improve.map(x=>`<li>${x}</li>`).join('')}</ul></div>
    <div class="coachCard next"><b>🦅 次の試合で考えること</b><ul>${next.map(x=>`<li>${x}</li>`).join('')}</ul></div>
  </div>`;
}

function savedMatchesKey(){ return 'setterTheorySavedMatchesV21'; }
function getSavedMatches(){
  try{return JSON.parse(localStorage.getItem(savedMatchesKey())||'[]') || [];}catch(e){return [];}
}
function setSavedMatches(list){ localStorage.setItem(savedMatchesKey(), JSON.stringify(list)); }
function suggestedMatchName(){
  const d=new Date();
  const day=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const file=(importedCsv && importedCsv.fileName) ? importedCsv.fileName.replace(/\.csv$/i,'') : 'CSV解析';
  return `${day} ${file}`;
}
function currentAnalysisSummary(){
  if(!importedCsv) return null;
  const a=analyzeImportedCsv(importedCsv);
  return {
    total:a.total, setterIq:a.setterIq, balance:a.balance, diversity:a.diversity, quick:a.quick,
    clutch:a.clutch, foreshadow:a.foreshadow, blockInduce:a.blockInduce, sideDepend:a.sideDepend, centerPct:a.centerPct, items:a.items,
    bySet:a.bySet, byRot:a.byRot, byScore:a.byScore, byPass:a.byPass,
    terminalCounts:a.terminalCounts, usedFallback:a.usedFallback
  };
}
function saveCurrentMatch(){
  if(!importedCsv){ alert('CSVを読み込んでから保存してください。'); return; }
  const nameInput=document.getElementById('matchSaveName');
  const memoEl=document.getElementById('setterMemo');
  const title=(nameInput && nameInput.value.trim()) || suggestedMatchName();
  const list=getSavedMatches();
  const summary=currentAnalysisSummary();
  const saved={
    id:`match_${Date.now()}`,
    title,
    fileName:importedCsv.fileName || 'CSV',
    savedAt:new Date().toISOString(),
    memo:memoEl ? memoEl.value : '',
    csv:importedCsv,
    summary
  };
  list.unshift(saved);
  setSavedMatches(list.slice(0,50));
  renderSavedMatches();
  alert('試合を保存しました。');
}
function loadSavedMatch(id){
  const m=getSavedMatches().find(x=>x.id===id);
  if(!m){ alert('保存データが見つかりません。'); return; }
  importedCsv=m.csv;
  localStorage.setItem('vollyzeImportedCsv', JSON.stringify(importedCsv));
  renderCsvPreview(importedCsv, importedCsv.fileName || m.title || '保存済みCSV');
  renderCsvAnalysis(importedCsv);
  setTimeout(()=>{
    const memo=document.getElementById('setterMemo');
    if(memo) memo.value=m.memo || '';
    const box=document.getElementById('csvAnalysisBox');
    if(box) box.scrollIntoView({behavior:'smooth',block:'start'});
  },0);
}
function deleteSavedMatch(id){
  if(!confirm('この保存試合を削除しますか？')) return;
  setSavedMatches(getSavedMatches().filter(x=>x.id!==id));
  renderSavedMatches();
}
function renameSavedMatch(id){
  const list=getSavedMatches();
  const m=list.find(x=>x.id===id);
  if(!m) return;
  const name=prompt('試合名を変更', m.title || '');
  if(!name) return;
  m.title=name.trim();
  setSavedMatches(list);
  renderSavedMatches();
}
function renderSavedMatches(){
  const listEl=document.getElementById('savedMatchList');
  const countEl=document.getElementById('savedMatchCount');
  if(!listEl) return;
  const list=getSavedMatches();
  if(countEl) countEl.textContent=`${list.length}件`;
  renderCompareSelectors();
  if(!list.length){ listEl.innerHTML='<div class="csvSmall">保存された試合はまだありません。CSV解析後に「この試合を保存」を押してください。</div>'; return; }
  listEl.innerHTML=list.map(m=>{
    const d=m.savedAt ? new Date(m.savedAt) : new Date();
    const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    const iq=(m.summary && m.summary.setterIq) ? m.summary.setterIq : '-';
    const total=(m.summary && m.summary.total) ? m.summary.total : 0;
    return `<div class="savedMatchItem">
      <div>
        <div class="savedMatchTitle">${escapeHtml(m.title||'無題の試合')}</div>
        <div class="savedMatchMeta">${escapeHtml(date)}　${escapeHtml(m.fileName||'CSV')}　トス${total}本</div>
        <div class="savedMatchIq">Setter IQ ${iq}</div>
      </div>
      <div class="savedMatchActions">
        <button class="miniBtn" type="button" onclick="loadSavedMatch('${m.id}')">開く</button>
        <button class="miniBtn gray" type="button" onclick="renameSavedMatch('${m.id}')">名前</button>
        <button class="miniBtn danger" type="button" onclick="deleteSavedMatch('${m.id}')">削除</button>
      </div>
    </div>`;
  }).join('');
}

function matchOptionLabel(m){
  const d=m.savedAt ? new Date(m.savedAt) : new Date();
  const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const iq=(m.summary && m.summary.setterIq) ? m.summary.setterIq : '-';
  return `${date}｜${m.title || m.fileName || '無題'}｜IQ ${iq}`;
}
function renderCompareSelectors(){
  const from=document.getElementById('compareFrom');
  const to=document.getElementById('compareTo');
  const result=document.getElementById('compareResult');
  const count=document.getElementById('compareMatchCount');
  if(!from || !to) return;
  const list=getSavedMatches();
  if(count) count.textContent=`保存 ${list.length}件`;
  const opts=list.map(m=>`<option value="${m.id}">${escapeHtml(matchOptionLabel(m))}</option>`).join('');
  from.innerHTML=opts;
  to.innerHTML=opts;
  if(list.length>=2){
    from.value=list[1].id;
    to.value=list[0].id;
    if(result && (!result.dataset.touched)) compareSavedMatches();
  }else{
    if(result) result.innerHTML='<div class="csvSmall">保存した試合が2件以上あると比較できます。まずCSV解析後に「この試合を保存」を押してください。</div>';
  }
}
function pctFromSummary(summary,label){
  const item=((summary&&summary.items)||[]).find(x=>x.label===label);
  return item ? Number(item.pct||0) : 0;
}
function valueFromSummary(summary,key){
  if(!summary) return 0;
  if(key==='left') return pctFromSummary(summary,'レフト');
  if(key==='center') return pctFromSummary(summary,'センター');
  if(key==='right') return pctFromSummary(summary,'ライト');
  if(key==='back') return pctFromSummary(summary,'バック');
  return Number(summary[key]||0);
}
function diffClass(diff, reverse=false){
  if(diff===0) return 'diffFlat';
  const good=reverse ? diff<0 : diff>0;
  return good ? 'diffUp' : 'diffDown';
}
function diffText(diff, suffix=''){
  if(diff>0) return `+${diff}${suffix}`;
  if(diff<0) return `${diff}${suffix}`;
  return `±0${suffix}`;
}
function compareRow(label, fromSummary, toSummary, key, suffix='', reverse=false){
  const a=valueFromSummary(fromSummary,key);
  const b=valueFromSummary(toSummary,key);
  const d=b-a;
  return `<tr><td>${escapeHtml(label)}</td><td>${a}${suffix}</td><td>${b}${suffix}</td><td class="${diffClass(d,reverse)}">${diffText(d,suffix)}</td></tr>`;
}
function compareAssessment(label, diff, type){
  const abs=Math.abs(diff);
  if(type==='left'){
    if(diff>=10) return {tone:'warn',badge:'注意',title:`${label}が${abs}%増加`,body:'レフト依存が強くなっています。特に終盤で同じ傾向が出ると、相手ブロックに読まれやすくなるかもしれません。',action:'次戦は序盤にセンター・ライトを1本ずつ見せて、レフトの価値を下げずに見せてみよう。'};
    if(diff<=-8) return {tone:'good',badge:'GOOD',title:`${label}が${abs}%減少`,body:'レフト偏重がやわらぎ、配球の選択肢が広がっています。相手MBを迷わせやすい状態です。',action:'このバランスを保ちながら、勝負所でも同じ選択肢を残しましょう。'};
  }
  if(type==='center'){
    if(diff>=6) return {tone:'good',badge:'GOOD',title:`${label}が${abs}%増加`,body:'センターを使う意識が上がっています。相手MBを中央に引きつけ、サイド攻撃を生かしやすくなります。',action:'A/Bパス時だけでなく、少し乱れた場面でもセンターを見せられるか一緒に確認してみよう。'};
    if(diff<=-6) return {tone:'warn',badge:'注意',title:`${label}が${abs}%減少`,body:'センター使用率が下がっています。相手ブロックがサイドに寄りやすくなる可能性があります。',action:'序盤で1〜2本センターを使い、相手MBを固定させない展開を作ってみよう。'};
  }
  if(type==='right'){
    if(diff>=6) return {tone:'good',badge:'GOOD',title:`${label}が${abs}%増加`,body:'ライトへの展開が増えています。レフト以外の出口ができ、ブロック分散につながります。',action:'ライトを単発で終わらせず、センターを見せた後のライトも試しましょう。'};
    if(diff<=-6) return {tone:'warn',badge:'注意',title:`${label}が${abs}%減少`,body:'ライトの選択肢が少なくなっています。レフト・センターに意識が偏る可能性があります。',action:'ローテ別にライトが使えていない場面を一緒に確認してみよう。'};
  }
  if(type==='iq'){
    if(diff>0) return {tone:'good',badge:'成長',title:`Setter IQが${abs}上昇`,body:'全体として前回より良い内容です。配球判断・バランス・勝負所の質が改善しています。',action:'良かったローテを確認し、次戦でも再現できる形にしましょう。'};
    if(diff<0) return {tone:'warn',badge:'確認',title:`Setter IQが${abs}低下`,body:'前回より評価が下がっています。配球の偏りや終盤の選択肢低下が影響している可能性があります。',action:'まずはレフト・センター・ライトの比率と20点以降の配球を一緒に確認してみよう。'};
  }
  if(type==='clutch'){
    if(diff>=8) return {tone:'good',badge:'GOOD',title:`終盤冷静度が${abs}上昇`,body:'勝負所でも選択肢を残せています。プレッシャー下での判断が改善しています。',action:'20点以降にセンター・ライトを使えた場面を次戦の基準にしましょう。'};
    if(diff<=-8) return {tone:'warn',badge:'注意',title:`終盤冷静度が${abs}低下`,body:'終盤で配球が偏った可能性があります。勝負所で相手に読まれやすくなる点に注意です。',action:'20点以降の1本目をどこに使うか、試合前に決めておきましょう。'};
  }
  if(type==='balance'){
    if(diff>=8) return {tone:'good',badge:'GOOD',title:`配球バランスが${abs}上昇`,body:'前回より攻撃先の偏りが少なくなっています。相手ブロックを分散しやすい内容です。',action:'この配球をローテ別にも安定して出せるか一緒に確認してみよう。'};
    if(diff<=-8) return {tone:'warn',badge:'注意',title:`配球バランスが${abs}低下`,body:'攻撃先の偏りが強くなっています。得点できていても次戦では読まれる可能性があります。',action:'一番少ない攻撃先を、序盤に必ず1本使う設計にしましょう。'};
  }
  return null;
}
function buildCompareInsightCards(fromMatch,toMatch){
  const a=fromMatch.summary||{};
  const b=toMatch.summary||{};
  const checks=[
    compareAssessment('Setter IQ', valueFromSummary(b,'setterIq')-valueFromSummary(a,'setterIq'),'iq'),
    compareAssessment('配球バランス', valueFromSummary(b,'balance')-valueFromSummary(a,'balance'),'balance'),
    compareAssessment('レフト使用率', valueFromSummary(b,'left')-valueFromSummary(a,'left'),'left'),
    compareAssessment('センター使用率', valueFromSummary(b,'center')-valueFromSummary(a,'center'),'center'),
    compareAssessment('ライト使用率', valueFromSummary(b,'right')-valueFromSummary(a,'right'),'right'),
    compareAssessment('終盤冷静度', valueFromSummary(b,'clutch')-valueFromSummary(a,'clutch'),'clutch')
  ].filter(Boolean);
  const selected=checks.slice(0,4);
  if(!selected.length){
    selected.push({tone:'flat',badge:'確認',title:'大きな変化は少なめ',body:'全体の数値は前回と近い内容です。ローテ別・得点差別で細かい違いを見る段階です。',action:'同じ配球でも、どの場面で使えたかをメモに残しましょう。'});
  }
  return `<div class="compareInsights">${selected.map(x=>`<div class="insightCard ${x.tone}"><div class="insightBadge">${escapeHtml(x.badge)}</div><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.body)}</p><small>次の一手：${escapeHtml(x.action)}</small></div>`).join('')}</div>`;
}
function buildCompareComment(fromMatch,toMatch){
  const a=fromMatch.summary||{};
  const b=toMatch.summary||{};
  const center=valueFromSummary(b,'center')-valueFromSummary(a,'center');
  const left=valueFromSummary(b,'left')-valueFromSummary(a,'left');
  const right=valueFromSummary(b,'right')-valueFromSummary(a,'right');
  const iq=valueFromSummary(b,'setterIq')-valueFromSummary(a,'setterIq');
  const clutch=valueFromSummary(b,'clutch')-valueFromSummary(a,'clutch');
  const balance=valueFromSummary(b,'balance')-valueFromSummary(a,'balance');
  const lines=[];
  if(iq>0) lines.push(`Setter IQが${iq}上がっています。全体として前回より改善傾向です。`);
  else if(iq<0) lines.push(`Setter IQは${Math.abs(iq)}下がっています。偏りが出た場面を一緒に確認してみよう。`);
  else lines.push('Setter IQは前回と同水準です。配球先だけでなく、終盤とローテ別の変化を一緒に確認してみよう。');
  if(balance>0) lines.push(`配球バランスが${balance}上がっています。相手ブロックを分散しやすくなっています。`);
  if(center>0) lines.push(`センター使用率が${center}%増えています。相手MBを中央に引きつける材料になります。`);
  if(left<0) lines.push(`レフト使用率が${Math.abs(left)}%下がり、レフト依存は改善しています。`);
  if(left>8) lines.push(`レフト使用率が${left}%増えています。得点できていても、次戦で読まれやすくなる可能性があります。`);
  if(right<-6) lines.push(`ライト使用率が${Math.abs(right)}%下がっています。サイドの選択肢が片寄らないよう一緒に確認してみよう。`);
  if(clutch>0) lines.push(`終盤冷静度が${clutch}上がっています。勝負所で選択肢を残せています。`);
  if(!lines.length) lines.push('大きな差は少ないです。ローテ別と得点差別で細部を見ていきましょう。');
  return `<div class="compareComment"><b>🦅 Aquilaのアドバイス</b><ul>${lines.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
}
function renderIqTrend(list){
  if(!list.length) return '';
  const ordered=[...list].reverse().slice(-8);
  return `<div class="panelLike"><h3>Setter IQ 推移</h3><div class="trendBars">${ordered.map(m=>{
    const iq=(m.summary&&m.summary.setterIq)||0;
    const name=(m.title||m.fileName||'試合').replace(/^\d{4}\/\d{2}\/\d{2}\s*/, '');
    return `<div class="trendRow"><div class="trendName">${escapeHtml(name)}</div><div class="trendTrack"><div class="trendFill" style="width:${Math.max(3,Math.min(100,iq))}%"></div></div><div>${iq}</div></div>`;
  }).join('')}</div></div>`;
}
function compareSavedMatches(){
  const list=getSavedMatches();
  const fromId=document.getElementById('compareFrom')?.value;
  const toId=document.getElementById('compareTo')?.value;
  const result=document.getElementById('compareResult');
  if(result) result.dataset.touched='1';
  if(!result) return;
  if(list.length<2){ result.innerHTML='<div class="csvSmall">保存した試合が2件以上必要です。</div>'; return; }
  if(fromId===toId){ result.innerHTML='<div class="csvSmall">別々の試合を選んでください。</div>'; return; }
  const from=list.find(x=>x.id===fromId);
  const to=list.find(x=>x.id===toId);
  if(!from||!to){ result.innerHTML='<div class="csvSmall">比較対象が見つかりません。</div>'; return; }
  const fs=from.summary||{};
  const ts=to.summary||{};
  const iqDiff=valueFromSummary(ts,'setterIq')-valueFromSummary(fs,'setterIq');
  result.innerHTML=`
    <div class="compareSummary">
      <div><div class="compareMatchName">${escapeHtml(from.title||'比較元')}</div><div class="compareIq">${valueFromSummary(fs,'setterIq')}</div><div class="csvSmall">トス ${valueFromSummary(fs,'total')}本</div></div>
      <div class="compareArrow">→ <span class="${diffClass(iqDiff)}">${diffText(iqDiff)}</span></div>
      <div><div class="compareMatchName">${escapeHtml(to.title||'比較先')}</div><div class="compareIq">${valueFromSummary(ts,'setterIq')}</div><div class="csvSmall">トス ${valueFromSummary(ts,'total')}本</div></div>
    </div>
    <table class="compareTable"><thead><tr><th>項目</th><th>比較元</th><th>比較先</th><th>変化</th></tr></thead><tbody>
      ${compareRow('Setter IQ',fs,ts,'setterIq')}
      ${compareRow('配球バランス',fs,ts,'balance')}
      ${compareRow('多様性指数',fs,ts,'diversity')}
      ${compareRow('速攻活用指数',fs,ts,'quick')}
      ${compareRow('終盤冷静度',fs,ts,'clutch')}
      ${compareRow('伏線指数',fs,ts,'foreshadow')}
      ${compareRow('レフト使用率',fs,ts,'left','%',true)}
      ${compareRow('センター使用率',fs,ts,'center','%')}
      ${compareRow('ライト使用率',fs,ts,'right','%')}
      ${compareRow('バック使用率',fs,ts,'back','%')}
    </tbody></table>
    ${buildCompareInsightCards(from,to)}
    ${buildCompareComment(from,to)}
    ${renderIqTrend(list)}
  `;
}

function summaryPctValue(summary,label){
  const item=((summary&&summary.items)||[]).find(x=>x.label===label);
  return item ? Number(item.pct||0) : 0;
}
function growthDiffHtml(diff, suffix='', reverse=false){
  const cls=diff===0?'flat':((reverse?diff<0:diff>0)?'up':'down');
  const mark=diff>0?`+${diff}`:diff<0?`${diff}`:'±0';
  return `<div class="growthDiff ${cls}">${mark}${suffix}</div>`;
}
function growthMetricCard(label, current, diff, suffix='', reverse=false){
  return `<div class="growthMetric"><b>${escapeHtml(label)}</b><div class="growthValue">${current}${suffix}</div>${growthDiffHtml(diff,suffix,reverse)}</div>`;
}
function growthTrendRows(list, key, label, suffix='', color=''){
  const rows=list.map(m=>{
    const s=m.summary||{};
    const val= key==='left'?summaryPctValue(s,'レフト') : key==='center'?summaryPctValue(s,'センター') : key==='right'?summaryPctValue(s,'ライト') : key==='back'?summaryPctValue(s,'バック') : Number(s[key]||0);
    const name=(m.title||m.fileName||'試合').replace(/^\d{4}\/\d{2}\/\d{2}\s*/, '');
    return `<div class="growthTrendRow"><div class="growthTrendName">${escapeHtml(name)}</div><div class="growthTrendTrack"><div class="growthTrendFill" style="width:${Math.max(2,Math.min(100,val))}%;${color?`background:${color}`:''}"></div></div><div>${val}${suffix}</div></div>`;
  }).join('');
  return `<div class="growthTrendPanel"><h4>${escapeHtml(label)}</h4>${rows}</div>`;
}
function buildGrowthAquilaMessage(first,last){
  const fs=first.summary||{}, ls=last.summary||{};
  const iq=Number(ls.setterIq||0)-Number(fs.setterIq||0);
  const center=summaryPctValue(ls,'センター')-summaryPctValue(fs,'センター');
  const left=summaryPctValue(ls,'レフト')-summaryPctValue(fs,'レフト');
  const clutch=Number(ls.clutch||0)-Number(fs.clutch||0);
  const lines=[];
  if(iq>0) lines.push(`Setter IQが${iq}上がっているよ。積み重ねが数字にも出てきているね。`);
  else if(iq<0) lines.push(`Setter IQは${Math.abs(iq)}下がっているよ。悪いというより、次に確認する材料が増えたと考えよう。`);
  else lines.push('Setter IQは大きく変わっていないよ。細かい配球の変化を一緒に見ていこう。');
  if(center>0) lines.push(`センター使用率が${center}%増えているね。サイドを生かす伏線が増えてきているよ。`);
  if(left>8) lines.push(`レフト使用率が${left}%増えているよ。得点できていても、相手に読まれない準備をしておこう。`);
  if(clutch>0) lines.push(`終盤冷静度も${clutch}上がっているよ。勝負所で選択肢を残せているのは良い成長だね。`);
  if(!lines.length) lines.push('大きな変化は少なめだね。次はローテ別に「どこで偏ったか」を見てみよう。');
  return lines.slice(0,3);
}
function renderGrowthDashboard(){
  const body=document.getElementById('growthDashboardBody');
  const count=document.getElementById('growthMatchCount');
  if(!body) return;
  const saved=getSavedMatches();
  if(count) count.textContent=`保存 ${saved.length}件`;
  if(saved.length<2){
    body.innerHTML='<div class="csvSmall">保存した試合が2件以上あると、成長推移を表示できます。</div>';
    return;
  }
  const chronological=[...saved].reverse();
  const recent=chronological.slice(-5);
  const first=recent[0];
  const last=recent[recent.length-1];
  const fs=first.summary||{}, ls=last.summary||{};
  const iqDiff=Number(ls.setterIq||0)-Number(fs.setterIq||0);
  const centerDiff=summaryPctValue(ls,'センター')-summaryPctValue(fs,'センター');
  const leftDiff=summaryPctValue(ls,'レフト')-summaryPctValue(fs,'レフト');
  const clutchDiff=Number(ls.clutch||0)-Number(fs.clutch||0);
  const badges=[];
  if(iqDiff>=5) badges.push('🦅 成長中');
  if(centerDiff>=5) badges.push('🏐 センター活用');
  if(leftDiff<=-5) badges.push('⚖️ レフト依存改善');
  if(clutchDiff>=5) badges.push('🔥 終盤の司令塔');
  if(!badges.length) badges.push('🔍 継続観察');
  const aquila=buildGrowthAquilaMessage(first,last);
  body.innerHTML=`
    <div class="growthSummary">
      ${growthMetricCard('Setter IQ', Number(ls.setterIq||0), iqDiff)}
      ${growthMetricCard('センター使用率', summaryPctValue(ls,'センター'), centerDiff, '%')}
      ${growthMetricCard('レフト使用率', summaryPctValue(ls,'レフト'), leftDiff, '%', true)}
      ${growthMetricCard('終盤冷静度', Number(ls.clutch||0), clutchDiff)}
    </div>
    <div class="growthAquila"><b>🦅 Aquilaの成長コメント</b><ul>${aquila.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><div class="growthBadges">${badges.map(x=>`<span class="growthBadge">${escapeHtml(x)}</span>`).join('')}</div></div>
    ${growthTrendRows(recent,'setterIq','Setter IQ 推移')}
    <div class="growthDistribution">
      ${growthTrendRows(recent,'center','センター使用率 推移','%','#f59e0b')}
      ${growthTrendRows(recent,'left','レフト使用率 推移','%','#e11d48')}
    </div>
  `;
}

function pdfBarRows(items){
  return (items||[]).filter(x=>x.count>0).map(x=>`
    <div class="pbarRow">
      <div class="pbarLabel">${escapeHtml(x.label)}</div>
      <div class="pbarTrack"><div class="pbarFill" style="width:${x.pct}%;background:${colorForLabel(x.label)}"></div></div>
      <div class="pbarPct">${x.pct}%</div>
      <div class="pbarCount">${x.count}本</div>
    </div>`).join('') || '<div class="pnote">該当データがありません。</div>';
}
function pdfStackTable(title, groups){
  const keys=Object.keys(groups||{});
  if(!keys.length) return `<section class="panel"><h2>${escapeHtml(title)}</h2><div class="pnote">該当データがありません。</div></section>`;
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${keys.map(k=>{
    const counts=groups[k]||{};
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    const items=analysisItemsFromCounts(counts,total).filter(x=>x.count>0);
    return `<div class="stackRow"><div class="stackKey">${escapeHtml(k)}<span>${total}本</span></div><div class="stackTrack">${items.map(x=>`<div class="stackSeg" style="width:${x.pct}%;background:${colorForLabel(x.label)}">${x.pct>=12?x.pct+'%':''}</div>`).join('')}</div><div class="stackTxt">${items.map(x=>`${escapeHtml(x.label)} ${x.pct}%`).join(' / ')}</div></div>`;
  }).join('')}</section>`;
}

function buildPlainDiagnosis(a){
  const main=a.items[0] || {label:'-',pct:0};
  const center=a.items.find(x=>x.label==='センター') || {pct:0};
  const terminalTotal=Object.values(a.terminalCounts||{}).reduce((x,y)=>x+y,0);
  const terminalMain=analysisItemsFromCounts(a.terminalCounts||{},terminalTotal).filter(x=>x.count>0)[0];
  const lines=[];
  if(a.setterIq>=88) lines.push('総合評価は高く、安定した配球判断ができています。');
  else if(a.setterIq>=78) lines.push('総合評価は良好です。細かな偏りを調整するとさらに良くなります。');
  else lines.push('総合評価は改善余地があります。まず攻撃先の偏りを減らしましょう。');
  if(main.pct>=55) lines.push(`${main.label}への配球が${main.pct}%と高く、相手に読まれやすい傾向が見えます。`);
  if(center.pct<15) lines.push(`センター使用率が${center.pct}%で低めです。序盤に1〜2本見せたいです。`);
  if(terminalMain && terminalMain.pct>=65) lines.push(`20点以降は${terminalMain.label}が${terminalMain.pct}%で、勝負所の選択が寄っています。`);
  if(!lines.length) lines.push('大きな偏りは少なく、ローテ別の細部確認に進めます。');
  return `<div class="pnote">${lines.map(x=>`・${escapeHtml(x)}`).join('<br>')}</div>`;
}

function printCsvReport(){
  if(!importedCsv){ alert('CSVを読み込んでからPDF出力してください。'); return; }
  const a=analyzeImportedCsv(importedCsv);
  const memoEl=document.getElementById('setterMemo');
  const memo=memoEl ? memoEl.value.trim() : '';
  const terminalTotal=Object.values(a.terminalCounts||{}).reduce((x,y)=>x+y,0);
  const terminalItems=analysisItemsFromCounts(a.terminalCounts||{},terminalTotal);
  const now=new Date();
  const date=`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  const reportHtml=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>SETTER THEORY Report</title><style>
    @page{size:A4 portrait;margin:10mm;}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#fff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;font-size:11px}.page{width:190mm;min-height:277mm;padding:0;page-break-after:always}.page:last-child{page-break-after:auto}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:7mm;margin-bottom:6mm}.brand{font-size:22px;font-weight:1000;letter-spacing:.04em}.sub{font-size:10px;color:#64748b;font-weight:800;margin-top:1mm}.meta{text-align:right;font-size:10px;color:#334155;font-weight:800}.hero{display:grid;grid-template-columns:42mm 1fr;gap:6mm;margin-bottom:5mm}.iq{background:#0f172a;color:#fff;border-radius:5mm;padding:5mm;text-align:center}.iq span{display:block;font-size:10px;color:#bfdbfe;font-weight:900}.iq b{display:block;font-size:42px;line-height:1;margin:2mm 0}.iq small{font-size:10px;color:#e5e7eb}.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.score{border:1px solid #cbd5e1;border-radius:4mm;background:#f8fafc;padding:3.5mm;text-align:center}.score b{display:block;font-size:21px}.score span{font-size:9px;color:#64748b;font-weight:900}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.panel{border:1px solid #cbd5e1;border-radius:4mm;padding:4mm;background:#fff;margin-bottom:5mm;break-inside:avoid}.panel h2{font-size:14px;margin:0 0 3mm}.pbarRow{display:grid;grid-template-columns:24mm 1fr 13mm 13mm;gap:2mm;align-items:center;margin:0 0 2.3mm}.pbarLabel{font-weight:1000}.pbarTrack{height:6mm;background:#e5e7eb;border-radius:999px;overflow:hidden}.pbarFill{height:100%;border-radius:999px}.pbarPct,.pbarCount{text-align:right;font-weight:900}.pnote{color:#64748b;font-weight:800;line-height:1.6}.stackRow{display:grid;grid-template-columns:21mm 1fr;gap:3mm;align-items:center;margin:0 0 3mm}.stackKey{font-weight:1000}.stackKey span{display:block;font-size:9px;color:#64748b}.stackTrack{height:7mm;background:#e5e7eb;border-radius:999px;display:flex;overflow:hidden}.stackSeg{height:100%;color:#fff;font-size:8px;font-weight:1000;display:flex;align-items:center;justify-content:center}.stackTxt{grid-column:2;font-size:9px;color:#64748b;font-weight:800;margin-top:-2mm}.coach{display:grid;grid-template-columns:1fr;gap:4mm}.coachCard{border-radius:4mm;padding:4mm;border:1px solid #cbd5e1;line-height:1.55;font-weight:800;break-inside:avoid}.coachCard ul{margin:2mm 0 0;padding-left:5mm}.coachCard.good{background:#f0fdf4;border-color:#86efac;color:#14532d}.coachCard.warn{background:#fff7ed;border-color:#fdba74;color:#7c2d12}.coachCard.next{background:#eff6ff;border-color:#93c5fd;color:#1e3a8a}.memo{min-height:32mm;border:1px solid #cbd5e1;border-radius:4mm;background:#f8fafc;padding:4mm;font-weight:800;white-space:pre-wrap;line-height:1.6}.footer{position:fixed;bottom:0;left:0;right:0;text-align:center;color:#94a3b8;font-size:9px}@media screen{body{background:#e5e7eb;padding:18px}.page{background:#fff;margin:0 auto 18px;padding:10mm;box-shadow:0 6px 24px rgba(15,23,42,.18)}}@media print{.page{padding:0}.footer{display:none}}
  </style></head><body>
    <main class="page">
      <div class="header"><div><div class="brand">SETTER THEORY</div><div class="sub">MATCH ANALYSIS REPORT</div></div><div class="meta">${escapeHtml(date)}<br>${escapeHtml(importedCsv.fileName||'Vollyze CSV')}<br>データ行数 ${a.total}トス</div></div>
      <div class="hero"><div class="iq"><span>Setter IQ</span><b>${a.setterIq}</b><small>/100</small></div><div class="scores"><div class="score"><b>${a.total}</b><span>トス本数</span></div><div class="score"><b>${a.balance}</b><span>配球バランス</span></div><div class="score"><b>${a.diversity}</b><span>多様性指数</span></div><div class="score"><b>${a.quick}</b><span>速攻活用指数</span></div><div class="score"><b>${a.clutch}</b><span>終盤冷静度</span></div><div class="score"><b>${a.foreshadow}</b><span>伏線指数</span></div></div></div>
      <div class="panel"><h2>🦅 Aquilaの診断</h2>${buildPlainDiagnosis(a)}</div>
      <div class="grid2"><section class="panel"><h2>配球割合（全体）</h2>${pdfBarRows(a.items)}</section><section class="panel"><h2>勝負所（20点以降）</h2>${pdfBarRows(terminalItems)}</section></div>
    </main>
    <main class="page"><div class="header"><div><div class="brand">DATA ANALYSIS</div><div class="sub">SET / ROTATION / SCORE / PASS</div></div><div class="meta">SETTER THEORY</div></div><div class="grid2">${pdfStackTable('セット別 配球割合',a.bySet)}${pdfStackTable('ローテ別 配球割合',a.byRot)}${pdfStackTable('得点差別 配球割合',a.byScore)}${pdfStackTable('A/B/Cパス別 配球割合',a.byPass)}</div></main>
    <main class="page"><div class="header"><div><div class="brand">AQUILA COACHING</div><div class="sub">Aquila Advice / Good / Improve / Next</div></div><div class="meta">SETTER THEORY</div></div><div class="coach">${buildCoachCards(a)}</div><section class="panel" style="margin-top:5mm"><h2>セッター思考メモ</h2><div class="memo">${escapeHtml(memo||'メモは未入力です。')}</div></section><section class="panel" style="margin-top:5mm;background:#eff6ff"><h2>🦅 Aquilaからのメッセージ</h2><div class="pnote">自由な発想が、最高のセットをつくる。<br>数字を答えにするのではなく、次の選択肢を増やすために使っていこう。</div></section></main>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)};<\/script>
  </body></html>`;
  const w=window.open('', '_blank');
  if(!w){ alert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
  w.document.open();
  w.document.write(reportHtml);
  w.document.close();
}
function renderCsvAnalysis(parsed){
  const box=document.getElementById('csvAnalysisBox');
  if(!box) return;
  if(!parsed || !(parsed.data||[]).length){ box.style.display='none'; box.innerHTML=''; return; }
  const a=analyzeImportedCsv(parsed);
  box.style.display='block';
  const bars=a.items.map(x=>`<div class="csvAnaRow"><div class="csvAnaLabel">${escapeHtml(x.label)}</div><div class="csvAnaTrack"><div class="csvAnaFill" style="width:${x.pct}%;background:${colorForLabel(x.label)}"></div></div><div class="csvAnaPct">${x.pct}%</div><div class="csvAnaCount">${x.count}本</div></div>`).join('') || '<div class="csvSmall">集計できるデータがありません。</div>';
  const terminalTotal=Object.values(a.terminalCounts||{}).reduce((x,y)=>x+y,0);
  const terminalBars=analysisItemsFromCounts(a.terminalCounts||{},terminalTotal).filter(x=>x.count>0).map(x=>`<div class="csvAnaRow"><div class="csvAnaLabel">${escapeHtml(x.label)}</div><div class="csvAnaTrack"><div class="csvAnaFill" style="width:${x.pct}%;background:${colorForLabel(x.label)}"></div></div><div class="csvAnaPct">${x.pct}%</div><div class="csvAnaCount">${x.count}本</div></div>`).join('') || '<div class="csvSmall">20点以降のトスがありません。</div>';
  box.innerHTML=`
    <div class="csvAnalysisHead">
      <div><div class="csvAnalysisTitle">📊 SETTER THEORY β解析 v30</div><div class="csvSmall">${a.usedFallback?'※ Type=トスを完全特定できなかったため、仮集計です。':'Type=トス / Result=トス先 として解析しました。'}</div></div>
      <div class="csvHeadActions"><button class="ghostBtn" type="button" onclick="printCsvReport()">PDFレポート出力</button><div class="csvIq"><span>Setter IQ</span><b>${a.setterIq}</b></div></div>
    </div>
    ${buildOverallDiagnosis(a)}
    <div class="csvScoreGrid">
      <div><b>${a.total}</b><span>トス本数</span></div>
      <div><b>${a.balance}</b><span>配球バランス</span></div>
      <div><b>${a.diversity}</b><span>多様性指数</span></div>
      <div><b>${a.quick}</b><span>速攻活用指数</span></div>
      <div><b>${a.clutch}</b><span>終盤冷静度</span></div>
      <div><b>${a.foreshadow}</b><span>伏線指数</span></div>
    </div>
    <div class="csvDual">
      <div><h3>配球割合（全体）</h3><div class="csvAnaBars">${bars}</div></div>
      <div><h3>勝負所（20点以降）</h3><div class="csvAnaBars">${terminalBars}</div></div>
    </div>
    <div class="csvSubGrid">
      ${compactBreakdownTable('セット別 配球割合', a.bySet)}
      ${compactBreakdownTable('ローテ別 配球割合', a.byRot)}
      ${compactBreakdownTable('得点差別 配球割合', a.byScore)}
      ${compactBreakdownTable('A/B/Cパス別 配球割合', a.byPass)}
    </div>
    ${buildCoachCards(a)}
    <div class="saveCurrentBox"><input id="matchSaveName" value="${escapeHtml(suggestedMatchName())}" placeholder="試合名"><button class="csvFileBtn" type="button" onclick="saveCurrentMatch()">💾 この試合を保存</button></div>
    <div class="csvMemo"><b>📝 セッター思考メモ</b><textarea id="setterMemo" placeholder="例：相手MBがライト寄りだったので、序盤にセンターを見せてからレフトを使った。"></textarea><div class="csvSmall">このメモは保存データとPDF印刷に載せられます。</div></div>
    <div class="csvSmall">検出列：Type=${escapeHtml(a.actionCol||'未検出')} / Result=${escapeHtml(a.resultCol||'未検出')} / Set=${escapeHtml(a.setCol||'未検出')} / Rotation=${escapeHtml(a.rotCol||'未検出')} / Score=${escapeHtml(a.scoreCol||'未検出')}</div>
  `;
}

document.addEventListener("DOMContentLoaded",()=>{
  setupCsvImport();
  renderSavedMatches();
  renderCompareSelectors();
  load();
  document.querySelectorAll(".setupSpot").forEach(b=>{
    b.addEventListener("click",(e)=>{ if(e.target.classList.contains("posSelect")) return; setupSelected=Number(b.dataset.spot);renderSetup();});
    b.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){setupSelected=Number(b.dataset.spot);renderSetup();}});
  });
  document.querySelectorAll(".nameSelect").forEach(sel=>sel.addEventListener("change",(e)=>{
    const i=Number(e.target.dataset.nameSelect);
    const no=e.target.value;
    s.nums[i]=no;
    if(!s.players) s.players={};
    if(s.players[no]===undefined) s.players[no]="";
    setupSelected=i;
    save(); renderSetup(); renderMatchNumberBank(); render();
  }));
  document.querySelectorAll(".player").forEach(b=>b.addEventListener("click",()=>add(b.dataset.pos)));
  document.querySelectorAll(".fastBtn").forEach(b=>b.addEventListener("click",()=>{
    s.mode=b.dataset.type;
    s.result=b.dataset.result;
    save();
    render();
  }));
  if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{});}
  renderSetup();
  render();
});


// v17 CSV読み込み
let importedCsv = null;

function parseCSVText(text){
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;

  for(let i=0; i<text.length; i++){
    const ch = text[i];
    const next = text[i+1];

    if(ch === '"' && quote && next === '"'){
      cell += '"';
      i++;
      continue;
    }
    if(ch === '"'){
      quote = !quote;
      continue;
    }
    if(ch === "," && !quote){
      row.push(cell);
      cell = "";
      continue;
    }
    if((ch === "\n" || ch === "\r") && !quote){
      if(ch === "\r" && next === "\n") i++;
      row.push(cell);
      if(row.some(v => String(v).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if(row.some(v => String(v).trim() !== "")) rows.push(row);

  if(!rows.length) return {headers:[], data:[]};
  const headers = rows[0].map((h,i)=>String(h || `列${i+1}`).trim());
  const data = rows.slice(1).map(r=>{
    const obj = {};
    headers.forEach((h,i)=>obj[h] = (r[i] ?? "").trim());
    return obj;
  });
  return {headers, data};
}

function renderCsvPreview(parsed, fileName){
  const status = document.getElementById("csvImportStatus");
  const box = document.getElementById("csvPreviewBox");
  if(!status || !box) return;

  const rows = parsed.data || [];
  const headers = parsed.headers || [];

  status.innerHTML = `✅ 読み込み完了：${fileName}<div class="csvSmall">列数 ${headers.length} / データ行 ${rows.length}</div>`;

  if(!headers.length){
    box.style.display = "block";
    box.innerHTML = "<div style='padding:12px;font-weight:1000'>CSVの列を読み取れませんでした。</div>";
    return;
  }

  const previewRows = rows.slice(0, 10);
  box.style.display = "block";
  box.innerHTML = `
    <table>
      <thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${previewRows.map(r=>`<tr>${headers.map(h=>`<td>${escapeHtml(r[h] || "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
    <div class="csvSmall" style="padding:10px 12px">先頭10行を表示中。次の版で、このデータから自動分析します。</div>
  `;
}

function escapeHtml(v){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setupCsvImport(){
  const input = document.getElementById("csvFileInput");
  const clear = document.getElementById("clearCsvBtn");
  const status = document.getElementById("csvImportStatus");
  const box = document.getElementById("csvPreviewBox");

  if(input){
    input.addEventListener("change", async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const text = await file.text();
      const parsed = parseCSVText(text);
      importedCsv = {fileName:file.name, ...parsed};
      localStorage.setItem("vollyzeImportedCsv", JSON.stringify(importedCsv));
      renderCsvPreview(importedCsv, file.name);
      renderCsvAnalysis(importedCsv);
    });
  }

  if(clear){
    clear.addEventListener("click", ()=>{
      importedCsv = null;
      localStorage.removeItem("vollyzeImportedCsv");
      if(input) input.value = "";
      if(status) status.textContent = "未読み込み";
      if(box){ box.style.display = "none"; box.innerHTML = ""; }
      renderCsvAnalysis(null);
    });
  }

  const saved = localStorage.getItem("vollyzeImportedCsv");
  if(saved){
    try{
      importedCsv = JSON.parse(saved);
      renderCsvPreview(importedCsv, importedCsv.fileName || "保存済みCSV");
      renderCsvAnalysis(importedCsv);
    }catch(e){}
  }
}

