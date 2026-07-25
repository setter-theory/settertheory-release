// V136: result ratio horizontal bars; V135 play success bars retained
// V135 corrected: play success rate horizontal bars in original renderer
// V99: Field Ready - last action visibility, safer undo, autosave status

// V74: unify imported CSV analysis with the in-match report engine.

let s = {
  team:"自チーム", oppTeam:"相手", setNo:"1",
  nums:["1","2","3","4","5","7"], setterIndex:3, setterNums:["4"],
  positions:["ライト後衛","ライト前衛","センター前衛","レフト前衛","レフト後衛","センター後衛"],
  players:{"1":"","2":"","3":"","4":"","5":"","7":""},
  playerPositions:{},
  benchCount:6,
  lastSubstitution:null,
  substitutionCounts:{},
  rot:1, my:0, op:0, mySets:0, opSets:0, serve:"mine",
  mode:"スパイク", result:"成功", logs:[], hist:[],
  matchActive:false, matchStartedAt:null, lastSavedAt:null
};

const DATA_SCHEMA_VERSION = 990;
function createEntityId(prefix){
  try{ if(globalThis.crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`; }catch(e){}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
}
function ensureAppIdentity(state){
  state=state&&typeof state==='object'?state:{};
  state.dataVersion=DATA_SCHEMA_VERSION;
  state.userId=String(state.userId||localStorage.getItem('setterTheoryReleaseUserId')||createEntityId('user'));
  localStorage.setItem('setterTheoryReleaseUserId',state.userId);
  state.teamId=String(state.teamId||localStorage.getItem('setterTheoryReleaseTeamId')||createEntityId('team'));
  localStorage.setItem('setterTheoryReleaseTeamId',state.teamId);
  state.matchId=String(state.matchId||createEntityId('match'));
  state.setId=String(state.setId||`${state.matchId}_set_${state.setNo||1}`);
  state.playerIdentities=state.playerIdentities&&typeof state.playerIdentities==='object'&&!Array.isArray(state.playerIdentities)?state.playerIdentities:{};
  state.playerPositions=state.playerPositions&&typeof state.playerPositions==='object'&&!Array.isArray(state.playerPositions)?state.playerPositions:{};
  const nums=[...(state.nums||[]),...Object.keys(state.players||{})].map(String);
  nums.forEach(num=>{
    const name=String((state.players||{})[num]||'').trim();
    const id=ensureStablePlayerId(name,num,state.playerIdentities[num]);
    if(id) state.playerIdentities[num]=id;
  });
  ensureDistinctRegisteredPlayerIdentities(state);
  return state;
}
function playerIdForNumber(num){
  num=String(num||'').trim();
  if(!num || num==='-') return '';
  const name=String((s.players||{})[num]||'').trim();
  const preferred=String((s.playerIdentities||{})[num]||'').trim();
  const id=ensureStablePlayerId(name,num,preferred);
  if(id){
    if(!s.playerIdentities||typeof s.playerIdentities!=='object') s.playerIdentities={};
    s.playerIdentities[num]=id;
  }
  return id;
}
const PLAYER_POSITION_OPTIONS=[
  {value:'',label:'未設定'},
  {value:'S_START',label:'先発セッター'},
  {value:'S_BENCH',label:'控えセッター'},
  {value:'S',label:'セッター（旧）'},
  {value:'OP',label:'オポジット'},
  {value:'OH',label:'アウトサイド'},
  {value:'MB',label:'ミドル'},
  {value:'L',label:'リベロ'},
  {value:'OTHER',label:'その他'}
];
function playerPositionForNumber(num){
  const id=playerIdForNumber(num);
  return id ? String((s.playerPositions||{})[id]||'') : '';
}
function playerPositionLabel(code){
  return (PLAYER_POSITION_OPTIONS.find(x=>x.value===String(code||''))||PLAYER_POSITION_OPTIONS[0]).label;
}
function isSetterPosition(code){ return String(code||'').startsWith('S'); }
function setterRoleLabelForNumber(num){
  const code=playerPositionForNumber(num);
  if(code==='S_START') return '先発セッター';
  if(code==='S_BENCH') return '控えセッター';
  return isSetterPosition(code)?'セッター':'';
}
function setPlayerPosition(num,code,{rerender=true}={}){
  ensureDistinctRegisteredPlayerIdentities(s);
  const id=playerIdForNumber(num);
  if(!id) return;
  if(!s.playerPositions||typeof s.playerPositions!=='object') s.playerPositions={};
  code=String(code||'');
  if(code) s.playerPositions[id]=code; else delete s.playerPositions[id];
  save();
  if(rerender){ renderSetup(); renderMatchNumberBank(); render(); }
}
function hasAssignedPlayerPositions(){
  return Object.values(s.playerPositions||{}).some(Boolean);
}
function syncActiveSettersFromCourt({incomingNum='',outgoingNum='',legacyTransfer=false}={}){
  const court=(s.nums||[]).map(String).filter(Boolean);
  const courtSet=new Set(court);
  const old=setterNumbers();
  if(!hasAssignedPlayerPositions()){
    if(legacyTransfer && outgoingNum && incomingNum) transferSetterRole(outgoingNum,incomingNum);
    return setterNumbers();
  }
  const onCourtSetters=court.filter(n=>isSetterPosition(playerPositionForNumber(n)));
  let next=old.filter(n=>courtSet.has(String(n)) && isSetterPosition(playerPositionForNumber(n)));
  const incoming=String(incomingNum||'');
  if(incoming && courtSet.has(incoming) && isSetterPosition(playerPositionForNumber(incoming)) && !next.includes(incoming)) next.unshift(incoming);
  onCourtSetters.forEach(n=>{ if(!next.includes(n)) next.push(n); });
  s.setterNums=[...new Set(next)].slice(0,2);
  s.setterIndex=Math.max(0,court.indexOf(String(s.setterNums[0]||'')));
  return s.setterNums.slice();
}
function positionSelectHtml(num,compact=false){
  const current=playerPositionForNumber(num);
  return `<select class="playerPositionSelect${compact?' compact':''}" aria-label="${escapeAttr(num)}番の基本ポジション" onchange="setPlayerPosition('${escapeAttr(num)}',this.value)">${PLAYER_POSITION_OPTIONS.map(x=>`<option value="${x.value}" ${current===x.value?'selected':''}>${x.label}</option>`).join('')}</select>`;
}

function logBelongsToPlayer(log,num){
  const targetId=playerIdForNumber(num);
  const logId=String(log&&log.playerId||'').trim();
  if(targetId && logId) return targetId===logId;
  return String(log&&log.num||'')===String(num||'');
}
function stampPlayerOnLog(log,num){
  num=String(num||'');
  return {
    ...log,
    num,
    playerId:playerIdForNumber(num),
    playerNameSnapshot:String((s.players||{})[num]||''),
    playerNumberSnapshot:num,
    matchId:String(s.matchId||''),
    setId:String(s.setId||'')
  };
}
function validateStateForSave(state){
  ensureAppIdentity(state);
  if(!Array.isArray(state.logs)) state.logs=[];
  if(!Array.isArray(state.hist)) state.hist=[];
  if(!state.players||typeof state.players!=='object'||Array.isArray(state.players)) state.players={};
  if(!state.playerPositions||typeof state.playerPositions!=='object'||Array.isArray(state.playerPositions)) state.playerPositions={};
  if(!Array.isArray(state.nums)) state.nums=[];
  state.logs=state.logs.filter(x=>x&&typeof x==='object').map((x,i)=>({
    ...x,
    logId:String(x.logId||`${state.matchId}_log_${i+1}`),
    matchId:String(x.matchId||state.matchId),
    setId:String(x.setId||state.setId),
    playerId:String(x.playerId||state.playerIdentities?.[String(x.num||'')]||'')
  }));
  return state;
}

let setupSelected = 0;
let setupCarry = null;
let setupHoldTimer = null;
let setupHoldTriggered = false;
let selectedCourtNum = null;
let subOutNum = null;
let substitutionBusy = false;
let previousPlaySelection = null;
let inputView = localStorage.getItem("setterTheoryReleaseInputView") || "simple";
let secondBallMode = false;
const groupTypeMap = {attack:"攻撃", serve:"サーブ", receive:"レセプション", toss:"トス", dig:"ディグ", block:"ブロック"};
const defaultMineGroupOrder = ["serve","block","dig","toss","attack","receive"];
const defaultOppGroupOrder = ["receive","toss","attack","block","dig","serve"];
function normalizeGroupOrder(value, fallback){
  const valid=["attack","serve","receive","toss","dig","block"];
  const src=Array.isArray(value)?value:[];
  const out=src.filter((x,i)=>valid.includes(x)&&src.indexOf(x)===i);
  valid.forEach(x=>{ if(!out.includes(x)) out.push(x); });
  return out.length===valid.length?out:fallback.slice();
}
let mineGroupOrder = normalizeGroupOrder(readJsonArray("setterTheoryReleaseMineGroupOrder", defaultMineGroupOrder), defaultMineGroupOrder);
let oppGroupOrder = normalizeGroupOrder(readJsonArray("setterTheoryReleaseOppGroupOrder", defaultOppGroupOrder), defaultOppGroupOrder);
let orderEditSide = "mine";
let heldOrderGroup = null;
let orderHoldTimer = null;
const groupOrder = ["attack","serve","receive","toss","dig","block"];
function readJsonArray(key, fallback){
  try{ const v=JSON.parse(localStorage.getItem(key)||"null"); return Array.isArray(v)?v:fallback; }catch(e){ return fallback; }
}
let openInputGroups = readJsonArray("setterTheoryReleaseOpenGroups", ["attack"]);
let favoriteInputGroups = readJsonArray("setterTheoryReleaseFavoriteGroups", ["toss","dig"]);
let favoritePlays = readJsonArray("setterTheoryReleaseFavoritePlays", [
  {mode:"スパイク", result:"成功"},
  {mode:"レセプ", result:"Aパス"},
  {mode:"ディグ", result:"成功"},
  {mode:"サーブ", result:"ミス"}
]);
let numberPool = ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15"];
const actionTypes=["トス","二段トス","レセプ","ディグ","スパイク","ブロック","サーブ"];
const rateActionTypes=["スパイク","サーブ","レセプ","ディグ","ブロック"];
const defaultPositions=["ライト後衛","ライト前衛","センター前衛","レフト前衛","レフト後衛","センター後衛"];

function show(id){
  // V118: 試合入力画面を離れる直前にも同期保存する。
  const activeScreen=document.querySelector(".screen.active");
  if(activeScreen && activeScreen.id==="match" && id!=="match") save("screen-change");
  closeSideMenu && closeSideMenu();
  document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));
  const next=document.getElementById(id);
  if(!next) return;
  next.classList.add("active");
  if(id==="match") ensureMatchRosterState();
  const bottom=document.getElementById("bottomBar");
  if(bottom) bottom.classList.add("hidden");
  render();
}
function openSideMenu(){ document.body.classList.add("menuOpen"); }
function closeSideMenu(){ document.body.classList.remove("menuOpen"); }
function persistNavigationSnapshot(target="home"){
  // V120: 保存失敗が画面遷移を止めないよう、同期保存はベストエフォートにする。
  // プレー入力時点ですでに即時保存されるため、ここでは移動直前の保険として保存する。
  try{
    save(`navigation-${target}`);
    return true;
  }catch(e){
    console.error("navigation snapshot failed",target,e);
    return false;
  }
}
function menuGo(target){
  closeSideMenu();
  if(target==="report"){ showReport(); return; }
  if(target==="match"){ show("match"); return; }
  if(target==="setup"){
    show("setup");
    return;
  }
  persistNavigationSnapshot(target);
  show("home");
  updateHomeMatchControls();
  if(target==="growth") renderGrowthDashboard();
  setTimeout(()=>{
    const map={growth:"growthDashboardCard",csv:"csvImportCard",about:"growthDashboardCard"};
    const el=document.getElementById(map[target]||"");
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
  },80);
}

function currentInputGroupOrder(){ return (s.serve==="opp" ? oppGroupOrder : mineGroupOrder); }
function saveInputGroupOrders(){
  localStorage.setItem("setterTheoryReleaseMineGroupOrder", JSON.stringify(mineGroupOrder));
  localStorage.setItem("setterTheoryReleaseOppGroupOrder", JSON.stringify(oppGroupOrder));
}
function applyInputGroupOrder(){
  const wrap=document.querySelector("#match .fastInput");
  if(!wrap) return;
  currentInputGroupOrder().forEach(key=>{
    const el=wrap.querySelector(`.fastGroup[data-acc-group="${key}"]`);
    if(el) wrap.appendChild(el);
  });
}
function openInputOrderModal(){
  closeSideMenu();
  const modal=document.getElementById("inputOrderModal");
  if(!modal) return;
  orderEditSide=s.serve==="opp"?"opp":"mine";
  heldOrderGroup=null;
  modal.classList.add("show");
  renderInputOrderEditor();
}
function closeInputOrderModal(){
  const modal=document.getElementById("inputOrderModal");
  if(modal) modal.classList.remove("show");
  heldOrderGroup=null;
  clearTimeout(orderHoldTimer);
}
function setOrderEditSide(side){
  orderEditSide=side==="opp"?"opp":"mine";
  heldOrderGroup=null;
  renderInputOrderEditor();
}
function editingOrder(){ return orderEditSide==="opp"?oppGroupOrder:mineGroupOrder; }
function setEditingOrder(next){
  const normalized=normalizeGroupOrder(next, orderEditSide==="opp"?defaultOppGroupOrder:defaultMineGroupOrder);
  if(orderEditSide==="opp") oppGroupOrder=normalized; else mineGroupOrder=normalized;
  saveInputGroupOrders();
  applyInputGroupOrder();
}
function renderInputOrderEditor(){
  const list=document.getElementById("inputOrderList");
  if(!list) return;
  const mineBtn=document.getElementById("orderMineBtn");
  const oppBtn=document.getElementById("orderOppBtn");
  if(mineBtn) mineBtn.classList.toggle("active",orderEditSide==="mine");
  if(oppBtn) oppBtn.classList.toggle("active",orderEditSide==="opp");
  list.innerHTML=editingOrder().map((key,i)=>`<button type="button" class="inputOrderItem ${heldOrderGroup===key?'held':''}" data-order-group="${key}" onpointerdown="startOrderHold('${key}',event)" onpointerup="cancelOrderHold()" onpointercancel="cancelOrderHold()" onclick="placeHeldOrderGroup('${key}')"><span>${i+1}</span><b>${escapeHtml(groupTypeMap[key]||key)}</b><small>${heldOrderGroup===key?'移動先をタップ':'長押しで選択'}</small></button>`).join("");
}
function startOrderHold(key,ev){
  if(ev && ev.pointerType==="mouse" && ev.button!==0) return;
  clearTimeout(orderHoldTimer);
  orderHoldTimer=setTimeout(()=>{
    heldOrderGroup=key;
    if(navigator.vibrate) navigator.vibrate(35);
    renderInputOrderEditor();
  },420);
}
function cancelOrderHold(){ clearTimeout(orderHoldTimer); }
function placeHeldOrderGroup(target){
  if(!heldOrderGroup) return;
  const arr=editingOrder().slice();
  const from=arr.indexOf(heldOrderGroup), to=arr.indexOf(target);
  if(from<0||to<0){ heldOrderGroup=null; renderInputOrderEditor(); return; }
  arr.splice(from,1); arr.splice(to,0,heldOrderGroup);
  setEditingOrder(arr);
  heldOrderGroup=null;
  renderInputOrderEditor();
}
function resetInputOrder(){
  setEditingOrder(orderEditSide==="opp"?defaultOppGroupOrder:defaultMineGroupOrder);
  heldOrderGroup=null;
  renderInputOrderEditor();
}

function saveOpenInputGroups(){
  localStorage.setItem("setterTheoryReleaseOpenGroups", JSON.stringify(openInputGroups));
}
function saveFavoriteInputGroups(){
  localStorage.setItem("setterTheoryReleaseFavoriteGroups", JSON.stringify(favoriteInputGroups));
}
function applyInputView(){
  applyInputGroupOrder();
  document.body.classList.toggle("inputSimple", inputView==="simple" || inputView==="favorite");
  document.body.classList.toggle("inputList", inputView==="list");
  document.body.classList.toggle("inputFavorite", inputView==="favorite");
  ["simple","list","favorite"].forEach(v=>{
    const btn=document.getElementById(v+"ModeBtn");
    if(btn) btn.classList.toggle("active", inputView===v);
  });
  document.querySelectorAll(".fastGroup").forEach(g=>{
    const key=g.dataset.accGroup;
    let visible=true;
    let open=false;
    if(inputView==="list"){
      open=true;
    }else if(inputView==="favorite"){
      visible=favoriteInputGroups.includes(key);
      open=visible;
    }else{
      open=openInputGroups.includes(key);
    }
    g.classList.toggle("filterHidden", !visible);
    g.classList.toggle("open", open);
    const arrow=g.querySelector(".accArrow");
    if(arrow) arrow.textContent=open?"⌃":"⌄";
    const fav=g.querySelector(".favToggle");
    if(fav){
      const on=favoriteInputGroups.includes(key);
      fav.textContent=on?"★":"☆";
      fav.classList.toggle("active", on);
      fav.setAttribute("aria-label", on?"お気に入り解除":"お気に入り登録");
    }
  });
  renderDisplayModePanel();
}
function renderDisplayModePanel(){
  const box=document.getElementById("simpleGroupSelector");
  if(!box) return;
  box.style.display = inputView === "simple" ? "grid" : "none";
  box.innerHTML = groupOrder.map(key=>{
    const label=groupTypeMap[key] || key;
    const open=openInputGroups.includes(key);
    const fav=favoriteInputGroups.includes(key);
    return `<div class="simpleGroupRow ${open?'on':''}" data-group="${key}">
      <button type="button" class="simpleGroupMain" onclick="toggleInputGroup('${key}')">
        <span>${open?'☑':'□'} ${label}</span><small>${open?'開いています':'閉じています'}</small>
      </button>
      <button type="button" class="simpleGroupFav ${fav?'active':''}" onclick="toggleFavoriteGroup('${key}', event)" aria-label="${fav?'お気に入り解除':'お気に入り登録'}">${fav?'★':'☆'}</button>
    </div>`;
  }).join("");
}
function toggleDisplayPanel(){
  document.body.classList.toggle("displayPanelOpen");
}
function closeDisplayPanel(){ document.body.classList.remove("displayPanelOpen"); }
function setInputView(view){
  inputView=["simple","list","favorite"].includes(view)?view:"simple";
  localStorage.setItem("setterTheoryReleaseInputView", inputView);
  if(inputView==="list") closeDisplayPanel();
  applyInputView();
}
function toggleInputGroup(group){
  if(inputView==="list") return;
  if(inputView==="favorite") setInputView("simple");
  if(openInputGroups.includes(group)){
    openInputGroups=openInputGroups.filter(x=>x!==group);
  }else{
    openInputGroups.push(group);
  }
  saveOpenInputGroups();
  applyInputView();
}
function toggleFavoriteGroup(group, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  if(favoriteInputGroups.includes(group)){
    favoriteInputGroups=favoriteInputGroups.filter(x=>x!==group);
  }else{
    favoriteInputGroups.push(group);
  }
  saveFavoriteInputGroups();
  applyInputView();
}
function resetFavoriteGroups(){
  favoriteInputGroups = openInputGroups.length ? openInputGroups.slice() : ["toss","dig"];
  saveFavoriteInputGroups();
  setInputView("favorite");
}


function normalizeFavoritePlays(){
  favoritePlays = (Array.isArray(favoritePlays)?favoritePlays:[]).filter(x=>x && x.mode && x.result)
    .filter((x,i,arr)=>arr.findIndex(y=>y.mode===x.mode && y.result===x.result)===i)
    .slice(0,8);
}
function saveFavoritePlays(){
  normalizeFavoritePlays();
  localStorage.setItem("setterTheoryReleaseFavoritePlays", JSON.stringify(favoritePlays));
}
function isCurrentFavoritePlay(){
  normalizeFavoritePlays();
  return favoritePlays.some(x=>x.mode===s.mode && x.result===s.result);
}
function playText(mode,result){
  const before={"スパイク":"💥","レセプ":"🤲","ディグ":"💪","サーブ":"🎯","トス":"⚡","ブロック":"🧱"}[mode] || "🏐";
  if(mode==="二段トス") return `${before} 二段トス→${result}`;
  if(mode==="トス") return `${before} トス→${result}`;
  if(result==="エース") return `${before} サービスエース`;
  if(result==="シャット") return `${before} ブロックシャット`;
  if(result==="ワンタッチ") return `${before} ワンタッチ`;
  if(result==="被ブロック") return `🚫 被ブロック`;
  return `${before} ${mode}${result}`;
}
function isTossMissLog(x){
  return !!(x && x.type==="トス" && (x.tossMist===true || x.tossMist==="1" || x.tossMist==="true" || x.quality==="ミス"));
}
function tossQualityStats(logs=s.logs){
  const toss=normalSetterTossLogs(logs);
  const miss=toss.filter(isTossMissLog).length;
  const success=Math.max(0,toss.length-miss);
  const successRate=toss.length?Math.round(success/toss.length*1000)/10:0;
  const missRate=toss.length?Math.round(miss/toss.length*1000)/10:0;
  return {total:toss.length,miss,success,successRate,missRate};
}
function logResultText(x){
  if(!x) return "";
  return isTossMissLog(x) ? `${x.result}（トスミス）` : (x.result||"");
}
function markLastTossMist(ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  const logs=s.logs||[];
  const last=logs[logs.length-1];
  if(!last || last.type!=="トス"){
    showInputToast("先にトス先を記録してください");
    return;
  }
  if(isTossMissLog(last)){
    showInputToast("直前のトスはすでにミス登録済みです");
    return;
  }
  snap();
  last.tossMist=true;
  last.quality="ミス";
  save();
  render();
  showInputToast(`トスミスを追加：${last.result}`);
}
function toggleSecondBallMode(ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  secondBallMode=!secondBallMode;
  updateSecondBallModeUi();
  showInputToast(secondBallMode ? "二段トス：トス先を選択してください" : "通常トスに戻しました");
}
function updateSecondBallModeUi(){
  const btn=document.getElementById("secondBallModeBtn");
  if(btn){
    btn.classList.toggle("active", secondBallMode);
    btn.setAttribute("aria-pressed", secondBallMode?"true":"false");
    btn.innerHTML=secondBallMode ? "✅<br>二段トス中" : "👐<br>二段トス";
  }
  document.querySelectorAll('.fastGroup[data-acc-group="toss"] .fastBtn.toss, .fastGroup[data-acc-group="toss"] .fastBtn.two').forEach(b=>b.classList.toggle("secondBallTarget",secondBallMode));
}
function normalSetterTossLogs(logs=s.logs){
  const setters=reportSetterNumbers();
  return (logs||[]).filter(x=>x && x.type==="トス" && setters.some(n=>logBelongsToPlayer(x,n)));
}
function isImplicitSecondBallLog(x){
  if(!x || x.type!=="トス") return false;
  const setters=reportSetterNumbers();
  return !setters.some(n=>logBelongsToPlayer(x,n));
}
function effectivePlayType(x){
  return isImplicitSecondBallLog(x) ? "二段トス" : (x&&x.type||"");
}
function secondBallLogs(logs=s.logs){
  return (logs||[]).filter(x=>x && (x.type==="二段トス" || isImplicitSecondBallLog(x)));
}
function secondBallAnalysis(logs=s.logs){
  const rows={};
  const zones=["レフト","センター","ライト","バック","ツー"];
  secondBallLogs(logs).forEach(x=>{
    const key=String(x.num||"-");
    if(!rows[key]) rows[key]={num:key,name:getPlayerName(key),total:0,counts:Object.fromEntries(zones.map(z=>[z,0]))};
    rows[key].total++;
    if(rows[key].counts[x.result]!==undefined) rows[key].counts[x.result]++;
  });
  return {total:secondBallLogs(logs).length,zones,players:Object.values(rows).sort((a,b)=>Number(a.num)-Number(b.num))};
}
function buildSecondBallAnalysis(){
  const a=secondBallAnalysis();
  if(!a.total) return `<div class="reportPanel secondBallPanel"><h3>二段トス分析</h3><p class="emptySecondBall">二段トスの記録はありません。</p></div>`;
  const cards=a.players.map(p=>{
    const playerLabel = `${escapeHtml(p.num)}番${p.name ? ` ${escapeHtml(p.name)}` : ""}`;
    const zoneCells = a.zones.map(z=>`<div class="secondBallZoneCell"><span>${z}</span><b>${p.counts[z]}本</b></div>`).join("");
    return `<article class="secondBallCard">
      <div class="secondBallHead">
        <div class="secondBallPlayer"><small>選手</small><strong>${playerLabel}</strong></div>
        <div class="secondBallTotal"><small>二段トス</small><strong>${p.total}本</strong></div>
      </div>
      <div class="secondBallZoneTitle">トス先</div>
      <div class="secondBallZones">${zoneCells}</div>
    </article>`;
  }).join("");
  return `<div class="reportPanel secondBallPanel"><h3>二段トス分析 <small>（Setter IQ・通常トス集計とは別）</small></h3><div class="secondBallSummary">チーム合計 <b>${a.total}本</b></div><div class="secondBallGrid">${cards}</div></div>`;
}
function setPlay(mode,result){
  // V67: 入力順は「選手番号 → プレー」。プレー押下で即記録。
  // 選手が未選択のときは、プレーを記録せず案内だけ表示する。
  if(selectedCourtNum===null){
    showInputToast("先に選手番号を選択してください");
    return;
  }
  if(s.mode!==mode || s.result!==result){
    previousPlaySelection={mode:s.mode, result:s.result};
  }
  s.mode=mode;
  s.result=result;
  recordSelectedPlayerPlay();
}
function clearGroupPlay(groupKey, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const type=groupTypeMap[groupKey];
  if(!type) return;
  const last=(s.logs||[])[(s.logs||[]).length-1];
  if(!last || last.type!==type){
    showInputToast(type + "の直近記録がありません");
    return;
  }
  const h=s.hist && s.hist.pop ? s.hist.pop() : null;
  if(!h){
    showInputToast("戻せる記録がありません");
    return;
  }
  const keep=s.hist;
  s=JSON.parse(h);
  s.hist=keep;
  save();
  render();
  showInputToast(type + "の直近記録を戻しました");
}

function toggleFavoritePlay(){
  const idx=favoritePlays.findIndex(x=>x.mode===s.mode && x.result===s.result);
  if(idx>=0){
    favoritePlays.splice(idx,1);
    showInputToast("★ お気に入り解除");
  }else{
    favoritePlays.unshift({mode:s.mode,result:s.result});
    showInputToast("★ お気に入り登録しました");
  }
  saveFavoritePlays();
  renderFavoritePlayBar();
}
function removeFavoritePlay(mode,result,ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  favoritePlays=favoritePlays.filter(x=>!(x.mode===mode && x.result===result));
  saveFavoritePlays();
  renderFavoritePlayBar();
  showInputToast("★ お気に入り解除");
}
function renderFavoritePlayBar(){
  const bar=document.getElementById("favoritePlayBar");
  if(!bar) return;
  normalizeFavoritePlays();
  bar.classList.toggle("empty", favoritePlays.length===0);
  bar.innerHTML = favoritePlays.map(x=>{
    const active=x.mode===s.mode && x.result===s.result;
    return `<button type="button" class="favoritePlayChip ${active?'active':''}" onclick="setPlay('${escapeAttr(x.mode)}','${escapeAttr(x.result)}')"><span>${escapeHtml(playText(x.mode,x.result))}</span><span class="removeFav" onclick="removeFavoritePlay('${escapeAttr(x.mode)}','${escapeAttr(x.result)}', event)">×</span></button>`;
  }).join("");
}
function showInputToast(msg){
  let el=document.getElementById("inputSavedToast");
  if(!el){
    el=document.createElement("div");
    el.id="inputSavedToast";
    el.className="inputSavedToast";
    document.body.appendChild(el);
  }
  el.textContent=msg;
  el.classList.add("show");
  clearTimeout(showInputToast._t);
  showInputToast._t=setTimeout(()=>el.classList.remove("show"),800);
}
function pulseElement(el){
  if(!el) return;
  el.classList.remove("pulseTap");
  void el.offsetWidth;
  el.classList.add("pulseTap");
}
function vibrateTap(){
  try{ if(navigator.vibrate) navigator.vibrate(18); }catch(e){}
}

function hasInProgressMatch(){
  return !!(s && s.matchActive && ((s.logs&&s.logs.length) || Number(s.my||0)>0 || Number(s.op||0)>0));
}
function matchResumeSummary(){
  const saved=s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleString() : "保存時刻不明";
  return `${s.team||"自チーム"} vs ${s.oppTeam||"相手"} / ${s.my||0}-${s.op||0} / S${s.rot||1} / ${saved}`;
}
function updateHomeMatchControls(){
  const resume=document.getElementById("resumeMatchBtn");
  const fresh=document.getElementById("newMatchBtn");
  const note=document.getElementById("resumeMatchNote");
  const active=hasInProgressMatch();
  if(resume){ resume.style.display=active?"block":"none"; resume.textContent="▶ 試合を再開"; }
  if(fresh){ fresh.textContent=active?"＋ 新しい試合を始める":"🏐 試合を始める"; }
  if(note){ note.style.display=active?"block":"none"; note.textContent=active?matchResumeSummary():""; }
}
function resumeMatch(){
  // V121: 同じ画面内でホーム／ダッシュボードから戻る場合は、
  // localStorageを再読込せず、直前まで入力していた最新のメモリ状態を使う。
  // ブラウザ再起動直後など、メモリ上に途中試合が無い場合だけ保存データを読む。
  if(!hasInProgressMatch()) load();
  if(!hasInProgressMatch()){
    alert("再開できる途中データがありません");
    updateHomeMatchControls();
    return;
  }
  show("match");
  showInputToast("途中の試合を再開しました");
}
function startNewMatchSetup(){
  if(hasInProgressMatch()){
    const ok=confirm("途中の試合データがあります。新しい試合の設定へ進みますか？\n※『試合開始』を押すまでは途中データは消えません。");
    if(!ok) return;
  }
  show("setup");
}
function goHome(){
  if(confirm("ホームへ戻りますか？\n途中データは自動保存され、ホームから再開できます。")){
    persistNavigationSnapshot("home-button");
    show("home");
    updateHomeMatchControls();
  }
}
function save(reason="auto"){
  try{
    const savedAt=new Date().toISOString();
    s.lastSavedAt=savedAt;
    validateStateForSave(s);

    // V122: 先に軽量な緊急スナップショットを保存し、その後に完全データを保存する。
    // iPadでアプリを閉じる瞬間に完全保存が中断されても、最新得点とログを復元できる。
    const emergency={...s,hist:[]};
    localStorage.setItem("setterTheoryReleaseV2Emergency", JSON.stringify(emergency));

    const serialized=JSON.stringify(s);
    localStorage.setItem("setterTheoryReleaseV2", serialized);
    localStorage.setItem("setterTheoryReleaseV2Backup", serialized);

    const verified=JSON.parse(localStorage.getItem("setterTheoryReleaseV2")||"null");
    if(!verified || verified.lastSavedAt!==savedAt) throw new Error("autosave verification failed");
    updateAutosaveIndicator(savedAt);
    return true;
  }catch(e){
    console.error("autosave failed",reason,e);
    updateAutosaveIndicator(null,true);
    return false;
  }
}
function updateAutosaveIndicator(savedAt=s.lastSavedAt,failed=false){
  const saveEl=document.getElementById("autosaveStateText");
  if(!saveEl) return;
  if(failed){
    saveEl.textContent="保存に失敗";
    saveEl.classList.remove("saved");
    return;
  }
  if(savedAt){
    const d=new Date(savedAt);
    const time=Number.isNaN(d.getTime()) ? "" : ` ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
    saveEl.textContent="途中データ保存済"+time;
    saveEl.classList.add("saved");
  }else{
    saveEl.textContent="自動保存";
    saveEl.classList.remove("saved");
  }
}
function load(){
  // V122: primary / backup / emergency のうち、保存時刻が最も新しい状態を復元する。
  const candidates=["setterTheoryReleaseV2","setterTheoryReleaseV2Backup","setterTheoryReleaseV2Emergency"]
    .map(key=>{ try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):null; }catch(_){ return null; } })
    .filter(x=>x&&typeof x==="object");
  if(candidates.length){
    candidates.sort((a,b)=>String(b.lastSavedAt||"").localeCompare(String(a.lastSavedAt||"")));
    s=candidates[0];
  }
  ensureAppIdentity(s);
  if(!s.positions) s.positions=defaultPositions.slice();
  if(!s.hist) s.hist=[];
  if(!s.logs) s.logs=[];
  if(!s.nums) s.nums=["1","2","3","4","5","7"];
  if(!Array.isArray(s.setterNums) || !s.setterNums.length){
    const legacySetter=(s.nums||[])[Number(s.setterIndex)||0];
    s.setterNums=legacySetter ? [String(legacySetter)] : [];
  }
  s.setterNums=[...new Set(s.setterNums.map(String).filter(n=>(s.nums||[]).map(String).includes(n)))].slice(0,2);
  if(!s.setterNums.length && s.nums[0]) s.setterNums=[String(s.nums[0])];
  s.setterIndex=Math.max(0,(s.nums||[]).map(String).indexOf(String(s.setterNums[0])));
  if(!s.players) s.players={};
  if(!s.playerPositions||typeof s.playerPositions!=="object"||Array.isArray(s.playerPositions)) s.playerPositions={};
  if(s.benchCount===undefined || s.benchCount===null) s.benchCount=6;
  s.benchCount=Math.max(0, Math.min(12, Number(s.benchCount)||0));
  if(s.lastSubstitution===undefined) s.lastSubstitution=null;
  if(s.matchActive===undefined) s.matchActive=((s.logs&&s.logs.length)>0 || Number(s.my||0)>0 || Number(s.op||0)>0);
  if(s.matchStartedAt===undefined) s.matchStartedAt=null;
  if(s.lastSavedAt===undefined) s.lastSavedAt=null;
  if(!s.substitutionCounts || typeof s.substitutionCounts!=="object" || Array.isArray(s.substitutionCounts)) s.substitutionCounts={};
  s.nums.forEach(n=>{ if(s.players[n]===undefined) s.players[n]=""; });
  validateStateForSave(s);
}

function snap(){
  s.hist.push(JSON.stringify({...s,hist:[]}));
  if(s.hist.length>300)s.hist.shift();
}
function rotateClockwiseOnce(a){
  // 標準ローテーション定義：
  // S1=右後衛 → S2=右前衛 → S3=中央前衛 → S4=左前衛 → S5=左後衛 → S6=中央後衛
  // コート上では S1 を基準に反時計回り。s.nums は [S1,S2,S3,S4,S5,S6]。
  // 1ローテ進むと、各選手は S1→S6→S5→S4→S3→S2→S1 と移動する。
  return [a[1], a[2], a[3], a[4], a[5], a[0]];
}
function rotationNums(){
  let a=s.nums.slice();
  for(let i=1;i<s.rot;i++){ a=rotateClockwiseOnce(a); }
  return a;
}
function rotationNumsAt(rot){
  let a=s.nums.slice();
  for(let i=1;i<rot;i++){ a=rotateClockwiseOnce(a); }
  return a;
}
function adjustSetCount(side, delta){
  snap();
  if(side==='my') s.mySets=Math.max(0, Number(s.mySets||0)+delta);
  else s.opSets=Math.max(0, Number(s.opSets||0)+delta);
  save();
  render();
}
function adjustRotation(delta){
  const step=Number(delta)||0;
  if(!step) return;
  snap();
  const current=Math.max(1, Math.min(6, Number(s.rot)||1));
  s.rot=((current-1+step)%6+6)%6+1;
  save();
  render();
  showInputToast(`ローテーションをS${s.rot}に補正しました`);
}
function toggleRotationOverview(){
  const box=document.getElementById('rotationOverview');
  const btn=document.getElementById('rotationToggleBtn');
  const card=document.querySelector('.matchInfoCard');
  if(!box||!btn) return;
  const willOpen=box.hidden;
  box.hidden=!willOpen;
  if(card) card.classList.toggle('rotationOpen', willOpen);
  btn.setAttribute('aria-expanded', String(willOpen));
  btn.textContent=willOpen?'ローテ一覧を閉じる ▲':'各ローテ一覧を見る ▼';
  if(willOpen) renderRotationOverview();
}
function miniCourtHtml(nums, rot){
  const order=[3,2,1,4,5,0]; // 上段: S4,S3,S2 / 下段: S5,S6,S1
  return `<div class="rotationMiniCourt" aria-label="S${rot}ローテーション">
    <div class="rotationMiniLine"></div>
    ${order.map((idx,visualIndex)=>{
      const n=nums[idx] ?? '-';
      const name=getPlayerName(n);
      return `<div class="rotationMiniPlayer mini${visualIndex+1}" title="${escapeAttr(name)}"><b>${escapeHtml(n)}</b><small>${escapeHtml(name)}</small></div>`;
    }).join('')}
  </div>`;
}
function renderRotationOverview(){
  const box=document.getElementById('rotationOverview');
  if(!box || box.hidden) return;
  box.innerHTML=`<div class="rotationOverviewGrid">${[1,2,3,4,5,6].map(rot=>{
    const nums=rotationNumsAt(rot);
    return `<section class="rotationOverviewCard ${rot===s.rot?'current':''}">
      <div class="rotationOverviewLabel">S${rot}${rot===1?'<span>開始</span>':''}</div>
      ${miniCourtHtml(nums,rot)}
    </section>`;
  }).join('')}</div>`;
}
function setterNumbers(){
  if(!Array.isArray(s.setterNums) || !s.setterNums.length){
    const legacy=(s.nums||[])[Number(s.setterIndex)||0];
    s.setterNums=legacy?[String(legacy)]:[];
  }
  const liveNums=new Set((s.nums||[]).map(v=>String(v).trim()).filter(Boolean));
  const playerNums=new Set(Object.keys(s.players||{}).map(v=>String(v).trim()).filter(Boolean));
  const cleaned=[...new Set((s.setterNums||[]).map(v=>String(v).trim()))]
    .filter(n=>n && n!=="-" && n!=="undefined" && n!=="null")
    // CSV復元時に混入する未設定値の「0」は、実在選手でない限り除外する
    .filter(n=>n!=="0" || liveNums.has(n) || playerNums.has(n));
  s.setterNums=cleaned.slice(0,2);
  return s.setterNums.slice();
}
// レポートには、登録済みセッターと実際に交代で担当したセッターだけを表示する。
// 単発の二段トス・アタッカーのトスを「セッター2」と誤認しないよう、
// ログだけから追加する場合は十分な通常トス記録がある選手に限定する。
function reportSetterNumbers(){
  const active=[...new Set(setterNumbers().map(String).filter(Boolean))].slice(0,2);

  // V150.162:
  // ローテーション設定で登録されたセッターを正解として扱う。
  // アタッカー等が通常トスを複数回記録しても、セッター2へ自動追加しない。
  if(active.length) return active;

  // セッター情報を持たない旧データだけ、通常トス最多の1名を補助復元する。
  // ここでは2人目を推定しないため、旧ワンセッター試合がツーセッター表示にならない。
  const counts=new Map();
  (s.logs||[]).forEach(x=>{
    if(!x || x.type!=='トス' || String(x.result||'')==='二段トス') return;
    const n=String(x.playerNumberSnapshot||x.num||'').trim();
    if(!n || n==='-' || n==='undefined' || n==='null') return;
    counts.set(n,(counts.get(n)||0)+1);
  });
  const first=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
  return first ? [String(first[0])] : [];
}
function isSetterNumber(num){ return setterNumbers().includes(String(num)); }
function transferSetterRole(outNum,inNum){
  outNum=String(outNum||''); inNum=String(inNum||'');
  if(!outNum||!inNum||outNum===inNum) return false;
  const list=setterNumbers();
  const idx=list.indexOf(outNum);
  if(idx<0) return false;
  list[idx]=inNum;
  s.setterNums=[...new Set(list)].slice(0,2);
  s.setterIndex=Math.max(0,(s.nums||[]).map(String).indexOf(String(s.setterNums[0]||inNum)));
  return true;
}
function preservePlayerIdentityOnNumberChange(outNum,inNum){
  outNum=String(outNum||''); inNum=String(inNum||'');
  if(!outNum||!inNum||outNum===inNum) return;
  const outName=String((s.players||{})[outNum]||'').trim();
  const inName=String((s.players||{})[inNum]||'').trim();
  if(outName && inName && normalizeGrowthPlayerName(outName)===normalizeGrowthPlayerName(inName)){
    if(!s.playerIdentities||typeof s.playerIdentities!=='object') s.playerIdentities={};
    const oldId=playerIdForNumber(outNum);
    if(oldId) s.playerIdentities[inNum]=oldId;
  }
}
function replaceCourtNumber(index,newNum,{transferSetter=true}={}){
  index=Number(index); newNum=String(newNum||'');
  const oldNum=String((s.nums||[])[index]||'');
  if(index<0||index>5||!newNum) return {oldNum,newNum,setterTransferred:false};
  if(!s.players||typeof s.players!=='object') s.players={};
  if(s.players[newNum]===undefined) s.players[newNum]='';
  preservePlayerIdentityOnNumberChange(oldNum,newNum);
  s.nums[index]=newNum;
  const setterTransferred=transferSetter ? transferSetterRole(oldNum,newNum) : false;
  s.setterIndex=Math.max(0,(s.nums||[]).map(String).indexOf(String(setterNumbers()[0]||'')));
  return {oldNum,newNum,setterTransferred};
}
function rotatedSetterNum(){ return setterNumbers()[0] || ''; }
function rotatedSetterNums(){ return setterNumbers(); }
function nextRot(){ s.rot=s.rot%6+1; }
function getPlayerName(num){ return (s.players && s.players[String(num)]) ? s.players[String(num)] : ""; }
function serverPos(){
  // サーブ権ありのときは現在の右後衛(pos1)を赤枠にする
  return s.serve==="mine" ? 1 : null;
}

function playLabel(){
  if(s.mode==="二段トス") return `二段トス→${s.result}`;
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
  const pos=document.getElementById("newPlayerPosition")?.value||'';
  if(!no){ alert("背番号を入力してください"); return; }
  if(!s.players) s.players={};
  s.players[no]=name;
  if(!numberPool.includes(no)) numberPool.push(no);
  const id=playerIdForNumber(no);
  if(pos && id){ if(!s.playerPositions||typeof s.playerPositions!=='object') s.playerPositions={}; s.playerPositions[id]=pos; }
  document.getElementById("newPlayerNo").value="";
  document.getElementById("newPlayerName").value="";
  const posEl=document.getElementById("newPlayerPosition"); if(posEl) posEl.value='';
  save(); renderSetup(); renderMatchNumberBank(); render();
}


function allRegisteredNumbers(){
  const vals=[...numberPool,...(s.nums||[]),...Object.keys(s.players||{})].filter(Boolean).map(String);
  return [...new Set(vals)].sort((a,b)=>Number(a)-Number(b));
}
function benchNumbers(){
  const court=new Set((s.nums||[]).map(String));
  const pool=allRegisteredNumbers().filter(n=>!court.has(String(n)));
  const count=Math.max(0, Math.min(12, Number(s.benchCount)||0));
  return pool.slice(0,count);
}
function setBenchCount(v){
  s.benchCount=Math.max(0, Math.min(12, Number(v)||0));
  save();
  renderSetup();
  renderSubModal();
}
function rosterItemHtml(n, fallback){
  return `<div class="rosterItem ${isSetterPosition(playerPositionForNumber(n))?'setterRosterItem':''}"><b>${escapeHtml(n)}</b><span class="rosterPlayerName">${escapeHtml(getPlayerName(n)||fallback||'未登録')}</span>${positionSelectHtml(n,true)}</div>`;
}
function renderRosterPanel(){
  const starterBox=document.getElementById('starterRoster');
  const benchBox=document.getElementById('benchRoster');
  if(!starterBox || !benchBox) return;
  const starters=(s.nums||[]).filter(Boolean).map(String);
  starterBox.innerHTML=starters.length ? starters.map(n=>rosterItemHtml(n,'スタメン')).join('') : '<div class="rosterEmpty">開始ローテの6人を選ぶと、ここにスタメンとして表示されます。</div>';
  const bench=benchNumbers();
  benchBox.innerHTML=bench.length ? bench.map(n=>rosterItemHtml(n,'ベンチ')).join('') : '<div class="rosterEmpty">ベンチ人数が0人、またはベンチ候補がありません。ベンチ人数を増やしてください。</div>';
}
function openSubModal(outNum){
  subOutNum = outNum ? String(outNum) : null;
  const modal=document.getElementById('subModal');
  if(!modal) return;
  modal.classList.add('show');
  renderSubModal();
}
function closeSubModal(){
  const modal=document.getElementById('subModal');
  if(modal) modal.classList.remove('show');
  subOutNum=null;
}
function renderSubModal(){
  const outBox=document.getElementById('subOutList');
  const inBox=document.getElementById('subInList');
  const confirmBtn=document.getElementById('subConfirmBtn');
  if(!outBox || !inBox) return;
  const courtNums=(s.nums||[]).map(String);
  outBox.innerHTML=courtNums.map(n=>`<button type="button" class="subChoice ${String(subOutNum)===String(n)?'active':''}" onclick="subOutNum='${escapeAttr(n)}'; renderSubModal();"><b>${escapeHtml(n)}</b><span>${escapeHtml(getPlayerName(n)||'コート上')}</span></button>`).join('');
  const bench=benchNumbers();
  inBox.innerHTML=bench.length ? bench.map(n=>`<button type="button" class="subChoice" onclick="applySubstitution('${escapeAttr(n)}')"><b>${escapeHtml(n)}</b><span>${escapeHtml(getPlayerName(n)||'ベンチ')}</span></button>`).join('') : '<div class="subEmpty">ベンチ候補がありません。ローテ設定の「選手登録」で背番号を追加してください。</div>';
  const label=document.getElementById('subSelectedLabel');
  if(label) label.textContent = subOutNum ? `${subOutNum}番を交代` : '交代するコート上の選手を選択';
  if(confirmBtn) confirmBtn.disabled = !subOutNum;
}
function setSubstitutionUiBusy(busy){
  substitutionBusy=!!busy;
  const modal=document.getElementById('subModal');
  if(modal) modal.classList.toggle('subBusy', substitutionBusy);
  document.querySelectorAll('#subModal button').forEach(btn=>{ btn.disabled=substitutionBusy; });
}
function applySubstitution(inNum){
  // 連続タップや二重発火によるフリーズ・二重記録を防ぐ
  if(substitutionBusy) return;
  if(!subOutNum){ showInputToast('交代する選手を選んでください'); return; }

  inNum=String(inNum||'');
  const outNum=String(subOutNum||'');
  const courtNums=(s.nums||[]).map(String);
  const idx=courtNums.findIndex(n=>n===outNum);

  if(!inNum){ showInputToast('交代で入る選手を選んでください'); return; }
  if(idx<0){ showInputToast('コート上の選手が見つかりません'); return; }
  if(outNum===inNum){ closeSubModal(); return; }
  if(courtNums.includes(inNum)){
    showInputToast('その選手はすでにコート上にいます');
    return;
  }

  setSubstitutionUiBusy(true);
  const stateBefore=JSON.stringify(s);
  const selectedBefore=selectedCourtNum;

  try{
    snap();
    const setterWasChanged=isSetterNumber(outNum);
    const usePositionRecognition=hasAssignedPlayerPositions();
    replaceCourtNumber(idx,inNum,{transferSetter:!usePositionRecognition});
    syncActiveSettersFromCourt({incomingNum:inNum,outgoingNum:outNum,legacyTransfer:!usePositionRecognition});
    const incomingIsSetter=isSetterNumber(inNum);

    const subTime=new Date().toLocaleTimeString();
    const pair=[outNum,inNum].sort((a,b)=>(Number(a)||0)-(Number(b)||0));
    const pairKey=pair.join('⇄');
    if(!s.substitutionCounts || typeof s.substitutionCounts!=='object') s.substitutionCounts={};
    if(!s.substitutionCounts[pairKey]){
      s.substitutionCounts[pairKey]={a:pair[0], b:pair[1], count:0, lastTime:'', lastScore:'', lastRot:''};
    }
    s.substitutionCounts[pairKey].count=Number(s.substitutionCounts[pairKey].count||0)+1;
    s.substitutionCounts[pairKey].lastTime=subTime;
    s.substitutionCounts[pairKey].lastScore=s.my+'-'+s.op;
    s.substitutionCounts[pairKey].lastRot='S'+s.rot;
    s.lastSubstitution={outNum, inNum, pos:String(idx+1), rot:'S'+s.rot, score:s.my+'-'+s.op, time:subTime};
    if(!Array.isArray(s.logs)) s.logs=[];
    s.logs.push({no:s.logs.length+1,set:s.setNo,rot:'S'+s.rot,type:'交代',num:`${outNum}→${inNum}`,pos:String(idx+1),result:'選手交代',point:'-',score:s.my+'-'+s.op,time:subTime,matchId:s.matchId,setId:s.setId,outPlayerId:playerIdForNumber(outNum),inPlayerId:playerIdForNumber(inNum),outNameSnapshot:String((s.players||{})[outNum]||''),inNameSnapshot:String((s.players||{})[inNum]||'')});
    selectedCourtNum=inNum;

    // 状態保存を先に完了させ、モーダルを閉じてから1回だけ再描画する
    save();
    const modal=document.getElementById('subModal');
    if(modal) modal.classList.remove('show');
    subOutNum=null;
    requestAnimationFrame(()=>{
      try{
        render();
        showInputToast(`交代：${outNum}番 → ${inNum}番${incomingIsSetter?'（新セッターを認識）':setterWasChanged?'（セッター交代処理中）':''}`);
      }finally{
        setSubstitutionUiBusy(false);
      }
    });
  }catch(err){
    console.error('substitution failed', err);
    try{
      s=JSON.parse(stateBefore);
      selectedCourtNum=selectedBefore;
      save();
      render();
    }catch(restoreErr){
      console.error('substitution rollback failed', restoreErr);
    }
    setSubstitutionUiBusy(false);
    showInputToast('選手交代に失敗しました。もう一度お試しください');
  }
}


function clearSetupCarry(){
  setupCarry=null;
  document.querySelectorAll('#setup .puzzleHeld,#setup .puzzleTarget').forEach(el=>el.classList.remove('puzzleHeld','puzzleTarget'));
}
function beginSetupCarry(kind, value, el){
  const num = kind==='court' ? String((s.nums||[])[Number(value)]||'') : String(value||'');
  if(!num) return;
  setupCarry={kind, value, num};
  document.querySelectorAll('#setup .puzzleHeld').forEach(x=>x.classList.remove('puzzleHeld'));
  if(el) el.classList.add('puzzleHeld');
  document.querySelectorAll('#setup .setupSpot').forEach(x=>x.classList.add('puzzleTarget'));
  const benchDrop=document.getElementById('setupBenchDrop');
  if(benchDrop) benchDrop.classList.add('puzzleTarget');
  if(typeof showInputToast==='function') showInputToast(`${num}番を持ち上げました。移動先をタップ`);
}
function setupLongPressBind(el, kind, value){
  if(!el) return;
  const start=(ev)=>{
    setupHoldTriggered=false;
    clearTimeout(setupHoldTimer);
    setupHoldTimer=setTimeout(()=>{
      setupHoldTriggered=true;
      if(navigator.vibrate) navigator.vibrate(35);
      beginSetupCarry(kind, value, el);
    },520);
  };
  const cancel=()=>{ clearTimeout(setupHoldTimer); setupHoldTimer=null; };
  el.onpointerdown=start;
  el.onpointerup=cancel;
  el.onpointercancel=cancel;
  el.onpointerleave=cancel;
}
function keepSetterPlayerAfterMove(setterNum, fallbackIndex){
  const live=(s.nums||[]).map(String);
  s.setterNums=setterNumbers().filter(n=>live.includes(String(n))).slice(0,2);
  if(!s.setterNums.length && setterNum && live.includes(String(setterNum))) s.setterNums=[String(setterNum)];
  const idx=live.findIndex(n=>n===String(s.setterNums[0]||setterNum));
  s.setterIndex = idx>=0 ? idx : Math.max(0, Math.min(5, Number(fallbackIndex)||0));
}
function placeSetupCarryAtCourt(targetIndex){
  targetIndex=Number(targetIndex);
  if(!setupCarry || targetIndex<0 || targetIndex>5) return false;
  const setterNum=setterNumbers()[0] || (s.nums||[])[s.setterIndex];
  snap && snap();
  if(setupCarry.kind==='court'){
    const sourceIndex=Number(setupCarry.value);
    if(sourceIndex===targetIndex){ clearSetupCarry(); return true; }
    const tmp=s.nums[targetIndex]||'';
    s.nums[targetIndex]=s.nums[sourceIndex]||'';
    s.nums[sourceIndex]=tmp;
  }else{
    const incoming=String(setupCarry.num);
    const existingIndex=(s.nums||[]).map(String).findIndex(n=>n===incoming);
    if(existingIndex>=0 && existingIndex!==targetIndex){
      const tmp=s.nums[targetIndex]||'';
      s.nums[targetIndex]=incoming;
      s.nums[existingIndex]=tmp;
    }else{
      s.nums[targetIndex]=incoming;
    }
  }
  keepSetterPlayerAfterMove(setterNum,targetIndex);
  setupSelected=targetIndex;
  clearSetupCarry();
  save(); renderSetup(); renderMatchNumberBank(); render();
  return true;
}
function placeSetupCarryOnBench(){
  if(!setupCarry) return;
  if(setupCarry.kind!=='court'){
    clearSetupCarry();
    return;
  }
  const sourceIndex=Number(setupCarry.value);
  const removedNum=String((s.nums||[])[sourceIndex]||'');
  snap && snap();
  s.nums[sourceIndex]='';
  s.setterNums=setterNumbers().filter(n=>n!==removedNum);
  if(!s.setterNums.length){
    const fallback=(s.nums||[]).find(Boolean);
    if(fallback) s.setterNums=[String(fallback)];
  }
  s.setterIndex=Math.max(0,(s.nums||[]).map(String).indexOf(String(s.setterNums[0]||'')));
  clearSetupCarry();
  save(); renderSetup(); renderMatchNumberBank(); render();
  if(typeof showInputToast==='function') showInputToast('ベンチへ戻しました');
}


const REGISTERED_TEAM_STORAGE_KEY='setterTheoryReleaseTeamsV1';
const SETUP_SELECTED_TEAM_KEY='setterTheoryReleaseSetupSelectedTeamId';

function registeredTeamsForSetup(){
  try{
    const parsed=JSON.parse(localStorage.getItem(REGISTERED_TEAM_STORAGE_KEY)||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch(error){
    console.warn('registered team load failed',error);
    return [];
  }
}

function renderRegisteredTeamSelector(){
  const select=document.getElementById('registeredTeamSelect');
  if(!select) return;
  const teams=registeredTeamsForSetup().sort((a,b)=>
    Number(b.year)-Number(a.year) ||
    String(a.name||'').localeCompare(String(b.name||''),'ja')
  );
  const selected=String(s.selectedTeamId||localStorage.getItem(SETUP_SELECTED_TEAM_KEY)||'');
  select.innerHTML='<option value="">チームを選択</option>'+
    teams.map(team=>{
      const count=Array.isArray(team.players)?team.players.length:0;
      const label=`${team.name||'名称未設定'}（${team.year||''}年度・${count}名）`;
      return `<option value="${escapeAttr(team.id)}" ${String(team.id)===selected?'selected':''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function ensureImportedPlayerIdentity(num,name){
  if(!s.playerIdentities||typeof s.playerIdentities!=='object') s.playerIdentities={};
  const key=String(num||'');
  if(!key) return '';
  if(!s.playerIdentities[key]){
    const safeName=String(name||'').trim().replace(/\s+/g,'_').slice(0,18);
    s.playerIdentities[key]=`team_${String(s.selectedTeamId||'')}_${key}_${safeName}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  }
  return s.playerIdentities[key];
}

function loadRegisteredTeamToSetup(teamId){
  teamId=String(teamId||'');
  if(!teamId){
    s.selectedTeamId='';
    localStorage.removeItem(SETUP_SELECTED_TEAM_KEY);
    save();
    renderSetup();
    return;
  }

  const team=registeredTeamsForSetup().find(item=>String(item.id)===teamId);
  if(!team){
    alert('登録チームが見つかりません');
    renderRegisteredTeamSelector();
    return;
  }

  const players=(Array.isArray(team.players)?team.players:[])
    .filter(player=>String(player.number||'').trim())
    .map(player=>({
      number:String(player.number).trim(),
      name:String(player.name||'').trim(),
      isSetter:!!player.isSetter
    }));

  if(!players.length){
    alert('このチームには選手が登録されていません');
    renderRegisteredTeamSelector();
    return;
  }

  const existingCount=Object.keys(s.players||{}).length;
  if(existingCount>0 && String(s.selectedTeamId||'')!==teamId){
    const ok=confirm('現在のローテーション設定を、選択したチームの登録選手へ切り替えますか？');
    if(!ok){
      renderRegisteredTeamSelector();
      return;
    }
  }

  s.selectedTeamId=teamId;
  s.teamId=teamId;
  localStorage.setItem(SETUP_SELECTED_TEAM_KEY,teamId);
  localStorage.setItem('setterTheoryReleaseTeamId',teamId);
  s.team=String(team.name||'自チーム');
  const teamInput=document.getElementById('team');
  if(teamInput) teamInput.value=s.team;

  s.players={};
  s.playerIdentities={};
  s.playerPositions={};
  numberPool=[];

  players.forEach(player=>{
    const no=player.number;
    s.players[no]=player.name;
    if(!numberPool.includes(no)) numberPool.push(no);
    const identity=ensureImportedPlayerIdentity(no,player.name);
    if(player.isSetter && identity) s.playerPositions[identity]='S';
  });

  numberPool.sort((a,b)=>{
    const an=Number(a),bn=Number(b);
    if(Number.isFinite(an)&&Number.isFinite(bn)) return an-bn;
    return String(a).localeCompare(String(b),'ja');
  });

  const validNumbers=new Set(numberPool.map(String));
  const registeredSetters=players.filter(player=>player.isSetter).map(player=>String(player.number));

  // V150.161:
  // チーム管理でセッター登録された選手を、スタメン候補とセッター設定で最優先する。
  // 登録セッターが7人目以降の背番号でも、最初の6人から外れて別選手が
  // セッター分析へ入る状態を防ぐ。
  const preserved=(s.nums||[]).map(String).filter(no=>validNumbers.has(no));
  const savedStartingLineup=(Array.isArray(team.startingLineup)?team.startingLineup:[])
    .map(String)
    .filter(no=>validNumbers.has(no));
  const lineup=[];

  // V150.169: 前回このチームで試合開始した6人を、次回の初期スタメンとして優先する。
  savedStartingLineup.forEach(no=>{
    if(lineup.length<6 && !lineup.includes(no)) lineup.push(no);
  });
  registeredSetters.forEach(no=>{
    if(lineup.length<6 && !lineup.includes(no)) lineup.push(no);
  });
  preserved.forEach(no=>{
    if(lineup.length<6 && !lineup.includes(no)) lineup.push(no);
  });
  numberPool.forEach(no=>{
    if(lineup.length<6 && !lineup.includes(no)) lineup.push(no);
  });
  while(lineup.length<6) lineup.push('');
  s.nums=lineup.slice(0,6);

  const courtSet=new Set(s.nums.map(String));
  s.setterNums=[...new Set(registeredSetters.filter(no=>courtSet.has(no)))].slice(0,2);
  if(!s.setterNums.length && s.nums[0]) s.setterNums=[String(s.nums[0])];
  s.setterIndex=Math.max(0,s.nums.map(String).indexOf(String(s.setterNums[0]||'')));

  s.benchCount=Math.max(0,Math.min(12,players.length-6));
  setupSelected=0;

  save();
  renderSetup();
  renderMatchNumberBank();
  render();
  if(typeof showInputToast==='function'){
    showInputToast(`${team.name}（${team.year}年度）${players.length}名を読み込みました`);
  }
}

function renderSetup(){
  renderRegisteredTeamSelector();
  const spots=document.querySelectorAll(".setupSpot");
  spots.forEach((b,i)=>{
    b.classList.toggle("active", i===setupSelected);
    b.classList.toggle("setter", isSetterNumber(s.nums[i]));
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
  const bc=document.getElementById("benchCount");
  if(bc) bc.value=String(Math.max(0, Math.min(12, Number(s.benchCount)||0)));
  renderRosterPanel();
  const used=new Set(s.nums);
  const bank=document.getElementById("numberBank");
  if(bank){
    bank.innerHTML="";
    const pool=allRegisteredNumbers();
    pool.forEach(n=>{
      const btn=document.createElement("button");
      btn.className="numBtn";
      btn.innerHTML=`<b>${escapeHtml(n)}</b>${getPlayerName(n)?`<span>${escapeHtml(getPlayerName(n))}</span>`:""}<small class="numPosition">${escapeHtml(playerPositionLabel(playerPositionForNumber(n)))}</small>`;
      if(used.has(n))btn.classList.add("used"); else btn.classList.add("benchPlayer");
      if(s.nums[setupSelected]===n)btn.classList.add("active");
      btn.onclick=()=>{
        if(setupHoldTriggered){ setupHoldTriggered=false; return; }
        if(setupCarry){ placeSetupCarryAtCourt(setupSelected); return; }
        setupSelected=setupSelected;
        replaceCourtNumber(setupSelected,n,{transferSetter:true}); save(); renderSetup(); renderMatchNumberBank(); render();
      };
      setupLongPressBind(btn, used.has(n)?'court':'bench', used.has(n)?s.nums.map(String).indexOf(String(n)):n);
      bank.appendChild(btn);
    });
  }
  const returnBtn=document.getElementById('returnToMatchBtn');
  const startBtn=document.getElementById('setupStartMatchBtn');
  if(returnBtn) returnBtn.style.display=s.matchActive?'block':'none';
  if(startBtn){
    startBtn.style.display=s.matchActive?'none':'block';
    startBtn.textContent='試合開始';
  }
}
function addNumber(){
  const n=prompt("追加する背番号は？");
  if(!n)return;
  numberPool.push(n);
  if(!s.players) s.players={};
  if(s.players[n]===undefined) s.players[n]="";
  replaceCourtNumber(setupSelected,n,{transferSetter:true});
  save(); renderSetup(); renderMatchNumberBank(); render();
}
function toggleSetter(){
  const num=String((s.nums||[])[setupSelected]||'');
  if(!num){ alert("先にコート位置へ選手を配置してください"); return; }
  const list=setterNumbers();
  if(list.includes(num)){
    if(list.length===1){ alert("セッターは最低1人必要です"); return; }
    s.setterNums=list.filter(n=>n!==num);
  }else{
    if(list.length>=2){ alert("セッターは最大2人です。解除するセッターを先に選んでください"); return; }
    s.setterNums=[...list,num];
    if(!playerPositionForNumber(num)) setPlayerPosition(num,'S_START',{rerender:false});
  }
  s.setterIndex=Math.max(0,(s.nums||[]).map(String).indexOf(String(s.setterNums[0])));
  save(); renderSetup(); render();
}
function returnToMatch(){
  if(!s.matchActive){
    alert("進行中の試合がありません。新しい試合を開始してください。");
    renderSetup();
    return;
  }
  const starters=(s.nums||[]).filter(Boolean).map(String);
  if(starters.length!==6 || new Set(starters).size!==6){
    alert("コート上の6人を重複なく設定してください");
    return;
  }
  s.team=document.getElementById("team")?.value || s.team || "自チーム";
  s.oppTeam=document.getElementById("oppTeam")?.value || s.oppTeam || "相手";
  s.setNo=document.getElementById("setNo")?.value || s.setNo || "1";
  if(hasAssignedPlayerPositions()) syncActiveSettersFromCourt();
  if(!setterNumbers().length){
    alert("現在のセッターを1人以上設定してください");
    return;
  }
  s.setterNums=setterNumbers().filter(n=>starters.includes(String(n))).slice(0,2);
  s.setterIndex=Math.max(0,starters.indexOf(String(s.setterNums[0])));
  ensureMatchRosterState();
  save();
  show("match");
  showInputToast("設定を反映して試合に戻りました");
}

function saveCurrentStartingLineupToRegisteredTeam(starters){
  const teamId=String(s.selectedTeamId||s.teamId||localStorage.getItem(SETUP_SELECTED_TEAM_KEY)||'');
  if(!teamId) return;

  const teams=registeredTeamsForSetup();
  const index=teams.findIndex(team=>String(team.id||'')===teamId);
  if(index<0) return;

  teams[index].startingLineup=(Array.isArray(starters)?starters:[])
    .map(String)
    .filter(Boolean)
    .slice(0,6);
  teams[index].startingSetterNums=setterNumbers()
    .map(String)
    .filter(no=>teams[index].startingLineup.includes(no))
    .slice(0,2);
  teams[index].updatedAt=new Date().toISOString();

  try{
    localStorage.setItem(REGISTERED_TEAM_STORAGE_KEY,JSON.stringify(teams));
  }catch(error){
    console.warn('starting lineup save failed',error);
  }
}

function startMatch(){
  const starters=(s.nums||[]).filter(Boolean).map(String);
  if(starters.length!==6 || new Set(starters).size!==6){ alert("スタメン6人の背番号を重複なく設定してください"); return; }
  s.team=document.getElementById("team").value || "自チーム";
  s.oppTeam=document.getElementById("oppTeam").value || "相手";
  s.setNo=document.getElementById("setNo").value;
  s.serve=document.getElementById("startServe").value;
  s.setterNums=setterNumbers().filter(n=>starters.includes(String(n))).slice(0,2);
  if(hasAssignedPlayerPositions()) syncActiveSettersFromCourt();
  if(!s.setterNums.length){ alert("セッターを1人以上設定するか、基本ポジションを『セッター』にしてください"); return; }
  s.setterIndex=Math.max(0,starters.indexOf(String(s.setterNums[0])));
  saveCurrentStartingLineupToRegisteredTeam(starters);
  s.rot=1; s.my=0; s.op=0; s.mode="スパイク"; s.result="成功"; s.logs=[]; s.hist=[]; s.lastSubstitution=null; s.substitutionCounts={}; selectedCourtNum=null;
  s.matchActive=true; s.matchStartedAt=new Date().toISOString();
  s.matchId=createEntityId('match');
  s.setId=`${s.matchId}_set_${s.setNo||1}`;
  s.playerIdentities=s.playerIdentities&&typeof s.playerIdentities==='object'?s.playerIdentities:{};
  ensureAppIdentity(s);
  starters.forEach(n=>playerIdForNumber(n));
  save(); show("match");
}
function currentMatchAsImportedCsv(){
  const headers=["No","Set","Rotation","Type","Number","Name","Position","Result","Point","Score","Time","PlayerId"];
  const data=(s.logs||[]).map(x=>({
    No:x.no, Set:x.set||s.setNo, Rotation:x.rot, Type:x.type, Number:x.num,
    Name:x.playerNameSnapshot||getPlayerName(x.num), Position:x.pos, Result:x.result,
    Point:x.point, Score:x.score, Time:x.time, PlayerId:x.playerId||""
  }));
  return {fileName:`${s.team||"自チーム"}_vs_${s.oppTeam||"相手"}_Set${s.setNo||1}.csv`,headers,data};
}
function archiveFinishedCurrentMatch(){
  const parsed=currentMatchAsImportedCsv();
  const analysis=analyzeImportedCsv(parsed);
  const setterIqs=setterIqItemsFromCurrentState();
  const primarySetterIq=setterIqs[0]||null;
  const teamMeta=currentSavedMatchTeamMeta();
  const now=new Date();
  const title=`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ${s.team||"自チーム"} vs ${s.oppTeam||"相手"} ${s.my||0}-${s.op||0}`;
  const list=getSavedMatches();
  const saved=migrateSavedMatchIdentities({
    id:String(s.matchId||createEntityId("match")), title, fileName:parsed.fileName,
    savedAt:now.toISOString(), memo:"", csv:parsed, summary:{
      total:setterIqs.reduce((sum,item)=>sum+Number(item.total||0),0) || analysis.total,
      setterIq:primarySetterIq&&primarySetterIq.iq!==null ? primarySetterIq.iq : analysis.setterIq,
      setterIqs,
      balance:analysis.balance,
      diversity:analysis.diversity, quick:analysis.quick, clutch:analysis.clutch,
      foreshadow:analysis.foreshadow, blockInduce:analysis.blockInduce,
      sideDepend:analysis.sideDepend, centerPct:analysis.centerPct, items:analysis.items,
      bySet:analysis.bySet, byRot:analysis.byRot, byScore:analysis.byScore, byPass:analysis.byPass,
      terminalCounts:analysis.terminalCounts, usedFallback:analysis.usedFallback
    },
    liveState:JSON.parse(JSON.stringify({...s,hist:[]})),
    dataVersion:DATA_SCHEMA_VERSION, schemaVersion:DATA_SCHEMA_VERSION,
    userId:s.userId,
    teamId:teamMeta.teamId,
    teamName:teamMeta.teamName,
    teamYear:teamMeta.teamYear,
    matchId:s.matchId, setId:s.setId,
    playerIdentities:{...(s.playerIdentities||{})}
  });
  const withoutSame=list.filter(m=>String(m.matchId||m.id)!==String(saved.matchId));
  withoutSame.unshift(saved);
  setSavedMatches(withoutSame.slice(0,50));
  return saved;
}
function finishMatch(){
  if(!s.matchActive){ alert('進行中の試合がありません。'); return; }
  if(!confirm('この試合を保存して終了しますか？\n終了後も保存データは確認できます。')) return;
  try{
    // V122: 終了フラグを立てる前に、現在の試合を「保存した試合」へ確実に複製する。
    archiveFinishedCurrentMatch();
    s.matchActive=false;
    s.matchEndedAt=new Date().toISOString();
    s.status='completed';
    save('finish-match');
    renderSavedMatches();
    alert('試合を保存して終了しました。');
    show('home');
    updateHomeMatchControls();
    setTimeout(()=>{
      const card=document.getElementById('savedMatchesCard');
      if(card) card.scrollIntoView({behavior:'smooth',block:'start'});
    },80);
  }catch(error){
    console.error('finish match save failed',error);
    alert('試合の保存に失敗したため、終了していません。データは入力画面に残っています。');
  }
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
  // V67: 番号ボタンは選手を選ぶだけ。得点・ログは動かさない。
  selectedCourtNum = String(num);
  vibrateTap();
  render();
  showInputToast(num + "番を選択しました。次にプレーを選択してください");
}

function recordSelectedPlayerPlay(){
  if(selectedCourtNum===null){
    showInputToast("先に選手番号を選択してください");
    return;
  }
  const num=String(selectedCourtNum);
  const nums=rotationNums().map(String);
  const idx=nums.findIndex(n=>n===num);
  const pos=idx>=0 ? String(idx+1) : "-";
  vibrateTap();
  snap();
  const recordedLabel=playLabel();
  const point=pointByResult(s.result);
  s.logs.push(stampPlayerOnLog({
    no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,setterRot:(idx>=0 ? "S"+(idx+1) : ""),type:s.mode,
    pos:pos,result:s.result,point:point,
    score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()
  },num));
  if(s.mode==="二段トス"){
    secondBallMode=false;
    updateSecondBallModeUi();
  }
  // V67: プレーを押した瞬間に記録を確定し、次の入力に備えて選手選択を解除する。
  // 誤入力は既存の「取り消し」で一つ前の状態へ戻せる。
  selectedCourtNum = null;
  save();
  render();
  showInputToast("記録しました：" + recordedLabel + " / " + num + "番");
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
function opponentPoint(){
  // V89: 相手の攻撃がそのまま決まった場合の得点。自チームのプレーミスには加算しない。
  pointOnly("op");
  showInputToast("相手得点を記録しました");
}

function opponentMist(){
  snap();
  const before=s.serve;
  s.my++;
  if(before==="opp"){ nextRot(); s.serve="mine"; }
  s.logs.push({no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:"得点",num:"-",pos:"-",result:"相手ミス",point:"自",score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()});
  save(); render();
}
function undoOpponentMist(){
  const last=s.logs && s.logs[s.logs.length-1];
  if(!last || last.result!=="相手ミス"){
    showInputToast("直前の記録は相手ミスではありません");
    return;
  }
  undo();
  showInputToast("相手ミスを取り消しました");
}
function undoOpponentPoint(){
  const last=s.logs && s.logs[s.logs.length-1];
  if(!last || last.result!=="相手得点"){
    showInputToast("直前の記録は相手得点ではありません");
    return;
  }
  undo();
  showInputToast("相手得点を取り消しました");
}
function manualRotate(){snap();nextRot();save();render();}
function toggleServe(){
  snap();
  s.serve=s.serve==="mine"?"opp":"mine";
  const label=s.serve==="mine"?"自サーブ":"相手サーブ";
  s.logs.push({
    no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:"操作",
    num:"-",pos:"-",result:"サーブ権を手動変更："+label,
    point:"継続",score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()
  });
  save();
  render();
  showInputToast(label+"に切り替えました");
}
function setServeTeam(isMine){
  const next = isMine ? "mine" : "opp";
  if(s.serve===next){
    render();
    return;
  }
  snap();
  s.serve=next;
  const label=isMine?"自チーム":"相手";
  s.logs.push({
    no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:"操作",
    num:"-",pos:"-",result:"サーブ権を手動変更："+label,
    point:"継続",score:s.my+"-"+s.op,time:new Date().toLocaleTimeString()
  });
  save();
  render();
  showInputToast("サーブ権を"+label+"に切り替えました");
}

function ensureMatchRosterState(){
  const validNums=Array.isArray(s.nums) && s.nums.length>=6 && s.nums.slice(0,6).every(n=>String(n||"").trim()!=="");
  if(validNums) return;
  const current=s;
  const raw=localStorage.getItem("setterTheoryReleaseV2");
  if(!raw) return;
  try{
    const saved=JSON.parse(raw);
    const savedValid=Array.isArray(saved.nums) && saved.nums.length>=6 && saved.nums.slice(0,6).every(n=>String(n||"").trim()!=="");
    if(savedValid){
      s={...saved, logs:Array.isArray(saved.logs)?saved.logs:[], hist:Array.isArray(saved.hist)?saved.hist:[]};
    }else{
      s=current;
    }
  }catch(e){
    s=current;
  }
}

function returnToMatchFromReport(){
  ensureMatchRosterState();
  show("match");
  render();
}

function describeLogForField(log){
  if(!log) return "まだ記録はありません";
  const player = log.num && log.num!=="-" ? `${log.num}番${log.playerName||getPlayerName(log.num)||""}` : "";
  const play = [log.type, log.result].filter(Boolean).join(" / ");
  const score = log.score ? `｜${log.score}` : "";
  return [player, play].filter(Boolean).join("｜") + score;
}
function updateFieldReadyStatus(){
  const last=(s.logs||[])[(s.logs||[]).length-1]||null;
  const lastEl=document.getElementById("lastActionText");
  if(lastEl) lastEl.textContent=describeLogForField(last);
  updateAutosaveIndicator(s.lastSavedAt,false);
  const canUndo=Array.isArray(s.hist)&&s.hist.length>0;
  document.querySelectorAll('.undoBtn').forEach(btn=>{
    btn.disabled=!canUndo;
    btn.setAttribute('aria-disabled',canUndo?'false':'true');
  });
}
function undo(){
  const before=(s.logs||[])[(s.logs||[]).length-1]||null;
  const h=s.hist.pop();
  if(!h){ showInputToast("取り消す記録がありません"); return; }
  const keep=s.hist;
  s=JSON.parse(h);
  s.hist=keep;
  save(); render();
  showInputToast(before ? `取り消しました：${describeLogForField(before)}` : "直前の操作を取り消しました");
}
function clearLogs(){
  if(!confirm("すべての記録を消しますか？")) return;
  snap();
  s.logs=[]; s.my=0; s.op=0; s.rot=1; s.serve="mine"; s.lastSubstitution=null; s.substitutionCounts={};
  save(); render();
}
function renderLastSubstitution(){
  const box=document.getElementById('lastSubstitutionBox');
  if(!box) return;
  const counts=s.substitutionCounts || {};
  const rows=Object.values(counts).filter(x=>x && x.a && x.b && Number(x.count)>0)
    .sort((x,y)=>Number(y.count)-Number(x.count) || Number(x.a)-Number(y.a) || Number(x.b)-Number(y.b));
  if(!rows.length){
    box.classList.remove('show');
    box.innerHTML='';
    return;
  }
  box.classList.add('show');
  box.innerHTML=`<div class="lastSubTitle">選手交代回数</div>${rows.map(r=>{
    const aName=getPlayerName(r.a);
    const bName=getPlayerName(r.b);
    const aLabel=`${r.a}番${aName?' '+aName:''}`;
    const bLabel=`${r.b}番${bName?' '+bName:''}`;
    return `<div class="lastSubRow"><div class="lastSubMain"><b>${escapeHtml(aLabel)}</b><span>⇄</span><b>${escapeHtml(bLabel)}</b><em>${Number(r.count)}回</em></div><div class="lastSubMeta">最終：${escapeHtml(r.lastRot||'')} / ${escapeHtml(r.lastScore||'')} / ${escapeHtml(r.lastTime||'')}</div></div>`;
  }).join('')}`;
}

function render(){
  if(document.getElementById("setup").classList.contains("active")) renderSetup();
  if(!document.getElementById("match").classList.contains("active") && !document.getElementById("report").classList.contains("active")) return;
  document.getElementById("rot").textContent=s.rot;
  document.getElementById("myScore").textContent=s.my;
  document.getElementById("opScore").textContent=s.op;
  const serveLabelEl=document.getElementById("serveLabel");
  if(serveLabelEl) serveLabelEl.textContent=s.serve==="mine"?"自サーブ":"相手サーブ";
  const serveHomeBtn=document.getElementById("serveHomeBtn");
  const serveAwayBtn=document.getElementById("serveAwayBtn");
  if(serveHomeBtn){
    serveHomeBtn.classList.toggle("active", s.serve==="mine");
    serveHomeBtn.setAttribute("aria-pressed", s.serve==="mine" ? "true" : "false");
  }
  if(serveAwayBtn){
    serveAwayBtn.classList.toggle("active", s.serve==="opp");
    serveAwayBtn.setAttribute("aria-pressed", s.serve==="opp" ? "true" : "false");
  }
  const myTeamEl=document.getElementById("infoMyTeam"); if(myTeamEl) myTeamEl.textContent=s.team||"自チーム";
  const oppTeamEl=document.getElementById("infoOppTeam"); if(oppTeamEl) oppTeamEl.textContent=s.oppTeam||"相手";
  const mySetEl=document.getElementById("mySetCount"); if(mySetEl) mySetEl.textContent=Number(s.mySets||0);
  const opSetEl=document.getElementById("opSetCount"); if(opSetEl) opSetEl.textContent=Number(s.opSets||0);
  renderRotationOverview();
  const reportIqEl=document.getElementById('reportIqValue');
  if(reportIqEl){
    const iqData=currentMatchSetterAnalysis();
    const iq=iqData.total ? iqData.setterIq : null;
    reportIqEl.textContent=iq===null ? '--/100' : `${iq}/100`;
    reportIqEl.className='reportIqValue '+(iq===null?'iqEmpty':iq>=90?'iqExcellent':iq>=80?'iqGood':iq>=70?'iqFair':'iqLow');
  }
  const inputGuide = selectedCourtNum===null
    ? "選手番号を選択"
    : selectedCourtNum + "番選択中｜プレーを選択";
  document.getElementById("modeBadge").textContent=inputGuide;
  const spl=document.getElementById("selectedPlayLabel"); if(spl) spl.textContent=inputGuide;
  const fpb=document.getElementById("favoritePlayBtn"); if(fpb){ const fav=isCurrentFavoritePlay(); fpb.textContent=fav?"★":"☆"; fpb.classList.toggle("active", fav); }
  renderLastSubstitution();
  renderFavoritePlayBar();
  const nums=rotationNums();
  const setterNums=rotatedSetterNums();
  document.querySelectorAll(".player").forEach(b=>{
    const n=nums[Number(b.dataset.pos)-1];
    b.innerHTML=`<span class="playerInner"><span class="playerNo">${escapeHtml(n)}</span><span class="playerName">${escapeHtml(getPlayerName(n))}</span></span>`;
    b.classList.toggle("setter", setterNums.includes(String(n)));
    b.classList.toggle("selected", String(n)===String(selectedCourtNum));
  });
  // V67ではプレーボタン押下で記録し、選手・プレー選択を次の入力用に解除する。
  document.querySelectorAll(".fastBtn").forEach(b=>b.classList.remove("active"));
  applyInputView();
  renderMatchNumberBank();
  updateFieldReadyStatus();
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
    btn.classList.toggle("selected", String(n)===String(selectedCourtNum));
    btn.onclick=()=>addByNumber(n);
    bank.appendChild(btn);
  });
}

function isSuccessResult(x){
  if(!x || x.type === "トス") return false;
  return ["成功","エース","シャット","Aパス","Bパス","Cパス","ワンタッチ"].includes(x.result);
}
function effectRate(logs){
  const total=logs.length;
  if(!total) return 0;
  const plus=logs.filter(isSuccessResult).length;
  const minus=logs.filter(isMissResult).length + logs.filter(x=>x.result==="被ブロック").length;
  return Math.round((plus-minus)/total*100);
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
  let html="<table><tr><th>項目</th><th>本数</th><th>成功</th><th>ミス</th><th>成功率</th><th>効果率</th></tr>";
  rateActionTypes.forEach(t=>{
    const a=s.logs.filter(x=>x.type===t);
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(isMissResult).length;
    const pct=a.length?Math.round(ok/a.length*100):0;
    const eff=effectRate(a);
    html+=`<tr><td>${t}</td><td>${a.length}</td><td>${ok}</td><td>${miss}</td><td>${pct}%</td><td>${eff}%</td></tr>`;
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
  const actionLogs=s.logs.filter(x=>rateActionTypes.includes(x.type));
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
    <div class="metricCard"><div class="metricLabel">効果率</div><div class="metricValue">${effectRate(actionLogs)}%</div><div class="metricSub">成功−失点系 ÷ 対象本数</div></div>
  </div>`;
}
function buildResultSummary(){
  const actionLogs=s.logs.filter(x=>rateActionTypes.includes(x.type));
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
  const total=s.logs.filter(x=>actionTypes.includes(effectivePlayType(x))).length || 0;
  let html="<div class='bigBarChart'>";
  actionTypes.forEach(t=>{
    const count=s.logs.filter(x=>effectivePlayType(x)===t).length;
    const pct=total?Math.round(count/total*100):0;
    html+=`<div class="bigBarRow"><div class="bigBarLabel">${t}</div><div class="bigBarTrack"><div class="bigBarFill" style="width:${pct}%"></div></div><div class="bigBarPct">${pct}%</div></div>`;
  });
  html+="</div>";
  return html;
}
function buildSuccessPercentTable(){
  let html="<table class='percentTable'><tr><th>項目</th><th>成功率</th><th>効果率</th><th>成功/本数</th><th>ミス</th><th>被ブロック</th></tr>";
  rateActionTypes.forEach(t=>{
    const a=s.logs.filter(x=>x.type===t);
    const total=a.length;
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(x=>x.result==="ミス").length;
    const blocked=a.filter(x=>x.result==="被ブロック").length;
    const pct=total?Math.round(ok/total*100):0;
    const eff=effectRate(a);
    html+=`<tr><td>${t}</td><td><span class="percentCell ${pctClass(pct)}">${pct}%</span></td><td><span class="percentCell ${pctClass(eff)}">${eff}%</span></td><td>${ok}/${total}</td><td>${miss}</td><td>${blocked}</td></tr>`;
  });
  html+="</table>";
  return html;
}
function buildPersonalSuccessTable(){
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  let html="<table class='percentTable'><tr><th>選手</th><th>成功率</th><th>効果率</th><th>成功/本数</th><th>ミス</th><th>被ブロック</th></tr>";
  nums.forEach(n=>{
    const a=s.logs.filter(x=>String(x.num)===String(n) && rateActionTypes.includes(x.type));
    const total=a.length;
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(x=>x.result==="ミス").length;
    const blocked=a.filter(x=>x.result==="被ブロック").length;
    const pct=total?Math.round(ok/total*100):0;
    const name=getPlayerName(n);
    const eff=effectRate(a);
    html+=`<tr><td>${n}${name?`<br><small>${name}</small>`:""}</td><td><span class="percentCell ${pctClass(pct)}">${pct}%</span></td><td><span class="percentCell ${pctClass(eff)}">${eff}%</span></td><td>${ok}/${total}</td><td>${miss}</td><td>${blocked}</td></tr>`;
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
    actionTypes.forEach(t=>{html+=`<td>${logs.filter(x=>effectivePlayType(x)===t).length}</td>`;});
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

function currentSetterAnalysisFor(num){
  const setterNum=String(num||'');
  const toss=s.logs.filter(x=>x.type==='トス' && logBelongsToPlayer(x,setterNum));
  const counts={レフト:0,センター:0,ライト:0,バック:0,ツー:0};
  const terminalCounts={};
  toss.forEach(x=>{
    const label=counts[x.result]!==undefined ? x.result : classifyTossTarget(x.result);
    if(counts[label]===undefined) counts[label]=0;
    counts[label]++;
    const score=scoreParts(x.score||'');
    if(score && score.high>=20) addCount(terminalCounts,label);
  });
  const total=toss.length;
  const items=analysisItemsFromCounts(counts,total);
  const quality=tossQualityStats(toss);
  // V144: セッター別ローテーションはチームのローテ番号ではなく、
  // そのプレー時にセッター本人が立っていたコート位置（S1〜S6）で集計する。
  // 途中交代後も log.pos が交代先の位置を保持するため、表示がずれない。
  const setterRotationForLog=(log)=>{
    const saved=String(log&&log.setterRot||'').trim();
    if(/^S[1-6]$/.test(saved)) return saved;
    const pos=Number(log&&log.pos);
    if(pos>=1 && pos<=6) return 'S'+pos;
    return String(log&&log.rot||'');
  };
  const rotationRows=[1,2,3,4,5,6].map(r=>{
    const rot='S'+r;
    const logs=toss.filter(x=>setterRotationForLog(x)===rot);
    const miss=logs.filter(isTossMissLog).length;
    return {rot,total:logs.length,miss,success:Math.max(0,logs.length-miss),rate:logs.length?Math.round((logs.length-miss)/logs.length*100):0};
  });
  return {num:setterNum,name:getPlayerName(setterNum),total,items,counts,terminalCounts,quality,rotationRows,...calcScores(counts,total,terminalCounts)};
}
function getSetterAquilaCoach(num){
  const a=currentSetterAnalysisFor(num);
  if(!a.total){
    return {
      continueText:'トス記録が増えると、継続すべき強みを分析します。',
      correctionText:'配球やトス精度の課題が見つかると、優先して修正するポイントを表示します。',
      nextText:'次の試合でセッターが意識する具体的な行動を表示します。',
      keyPoint:'まずは5本以上のトスを記録し、配球の傾向を確認しましょう。'
    };
  }
  const by=Object.fromEntries(a.items.map(x=>[x.label,x]));
  const left=by['レフト']||{pct:0,count:0};
  const center=by['センター']||{pct:0,count:0};
  const right=by['ライト']||{pct:0,count:0};
  const back=by['バック']||{pct:0,count:0};
  const two=by['ツー']||{pct:0,count:0};
  const top=a.items.slice().sort((x,y)=>y.count-x.count)[0]||{label:'-',pct:0,count:0};
  const used=a.items.filter(x=>x.count>0).length;
  const lrGap=Math.abs(left.pct-right.pct);
  const lowSide=left.pct<=right.pct?'レフト':'ライト';
  const weakRot=(a.rotationRows||[]).filter(x=>x.total>0).slice().sort((x,y)=>x.rate-y.rate || y.total-x.total)[0]||null;

  let continueText='';
  if(a.quality.miss===0 && a.quality.total>=5){
    continueText=`トスミス0本、成功率${a.quality.successRate}%です。ボールの下へ早く入り、同じフォームで供給できている安定性を継続しましょう。`;
  }else if(top.pct<50 && lrGap<=15 && used>=3){
    continueText=`レフト${left.pct}%・センター${center.pct}%・ライト${right.pct}%で大きな偏りを抑えられています。相手ブロックに的を絞らせない配球を継続しましょう。`;
  }else if(center.pct>=18){
    continueText=`センターを${center.pct}%（${center.count}本）使えています。相手MBを中央に残し、両サイドを生かす組み立てを継続しましょう。`;
  }else if(back.pct>=10 || two.pct>=8){
    continueText=`バック${back.pct}%・ツー${two.pct}%を組み込み、前衛3方向だけに限定されない選択ができています。この意外性を継続しましょう。`;
  }else{
    continueText=`最多配球は${top.label}${top.pct}%（${top.count}本）です。自分の勝負先を明確にできている点は継続しましょう。`;
  }

  let correctionText='';
  let nextText='';
  let keyPoint='';
  if(a.quality.miss>=2 || a.quality.successRate<85){
    correctionText=`トスミスは${a.quality.miss}本、成功率${a.quality.successRate}%です。難しい体勢では速さよりも高さと方向をそろえ、アタッカーが打ち切れるトスを優先しましょう。`;
    nextText='次の試合では返球がネットから離れた時の逃げ先を一つ決め、苦しい場面でも同じ基準で選択しましょう。';
    keyPoint='最優先はトス精度です。苦しい返球ほど「打たせるトス」を確実に供給しましょう。';
  }else if(top.pct>=55){
    const alt=top.label==='センター'?(left.pct<=right.pct?'レフト':'ライト'):'センター';
    correctionText=`${top.label}への配球が${top.pct}%に集中しています。序盤に${alt}を1〜2本使い、相手ブロックが${top.label}へ寄るタイミングを遅らせましょう。`;
    nextText=`次の試合では15点までに${alt}を最低2本使い、終盤に${top.label}を生かせる配球の伏線を作りましょう。`;
    keyPoint=`${alt}への配球を増やし、最多配球の${top.label}をさらに決まりやすくすることが今回の鍵です。`;
  }else if(center.pct<12 && a.total>=5){
    correctionText=`センターは${center.pct}%（${center.count}本）です。良い返球時にセンターを使わないと、相手MBがサイドへ早く移動しやすくなります。`;
    nextText='次の試合では各ローテーションの最初のA/Bパスで、センターを第一候補として確認しましょう。';
    keyPoint='良い返球時のセンター使用を増やし、相手MBを中央に残すことが最優先です。';
  }else if(lrGap>=25){
    correctionText=`レフトとライトの配球差が${lrGap}ポイントあります。少ない${lowSide}を使う場面を決め、相手ブロックの基準をずらしましょう。`;
    nextText=`次の試合では${lowSide}への配球を現在より2本増やし、序盤から左右両方を意識させましょう。`;
    keyPoint=`${lowSide}への配球を2本増やすことが、攻撃全体のバランス改善につながります。`;
  }else if(weakRot && weakRot.rate<80){
    correctionText=`${weakRot.rot}のトス成功率は${weakRot.rate}%です。このローテーションで返球が乱れた時の第一候補と逃げ道を整理しましょう。`;
    nextText=`次の試合では${weakRot.rot}に入る前に、良い返球時の第一候補と苦しい返球時の第二候補を確認しましょう。`;
    keyPoint=`${weakRot.rot}の選択基準を事前に決め、迷いを減らすことが今回の改善ポイントです。`;
  }else{
    correctionText=`配球の大きな偏りはありません。次は最多配球の${top.label}${top.pct}%を、点差・ローテーション・相手ブロックに応じて意図的に使い分けましょう。`;
    nextText='次の試合ではトスを上げる前に「誰が決めやすいか」と「相手が最も嫌がる場所」を一度整理して選択しましょう。';
    keyPoint='配球の数ではなく、同じ配球でも「なぜ今そこか」を明確にすることが次の成長ポイントです。';
  }
  return {continueText,correctionText,nextText,keyPoint};
}
function getAquilaAdviceForSetter(num){
  const c=getSetterAquilaCoach(num);
  return [
    `継続すること：${c.continueText}`,
    `修正すること：${c.correctionText}`,
    `次の試合で意識すること：${c.nextText}`,
    `Aquila Coach's Key Point：${c.keyPoint}`
  ];
}
function setterAnalysisWhiteLegendHtml(items,total){
  return `<div class="legend setterAnalysisWhiteLegend" style="color:#ffffff!important">`+items.map(x=>{
    const pct=safePct(x.count,total);
    return `<div class="legendRow" style="color:#ffffff!important"><span class="dot" style="background:${x.color}"></span><span style="color:#ffffff!important">${x.label}</span><span style="color:#ffffff!important">${pct}% (${x.count})</span></div>`;
  }).join("")+`</div>`;
}
function buildSetterDetailReports(){
  const setters=reportSetterNumbers();
  if(!setters.length) return '';
  const labels=['レフト','センター','ライト','バック','ツー'];
  const colors={'レフト':'#ef4444','センター':'#2563eb','ライト':'#22c55e','バック':'#f59e0b','ツー':'#0f172a'};
  return `<div class="setterAnalysisSections">${setters.map((n,idx)=>{
    const a=currentSetterAnalysisFor(n);
    const rank=setterIqRank(a.setterIq||0);
    const b=iqBreakdown20(a);
    const advice=getSetterAquilaCoach(n);
    const toss=(s.logs||[]).filter(x=>x&&x.type==='トス'&&logBelongsToPlayer(x,String(n)));
    const items=labels.map(label=>({label,count:toss.filter(x=>x.result===label).length,color:colors[label]})).filter(x=>x.count>0);
    const tossLegend=window.__setterTheorySavedReportAccordion
      ? `<div class="legend savedReportTossLegend">${items.map(x=>{const pct=safePct(x.count,toss.length);return `<div class="legendRow"><span class="dot" style="background:${x.color}"></span><span>${x.label}</span><span>${pct}% (${x.count})</span></div>`;}).join('')}</div>`
      : setterAnalysisWhiteLegendHtml(items,toss.length);
    const savedReportInnerTitle=window.__setterTheorySavedReportAccordion?'':'<div class="setterMasterChartTitle">トス配分</div>';
    const donut=items.length
      ? `<div class="setterMasterDonut">${savedReportInnerTitle}<div class="tossPanel"><div class="donut" style="background:${donutStyle(items)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${toss.length}</div></div></div>${tossLegend}</div></div>`
      : `<div class="setterMasterDonut">${savedReportInnerTitle}<div class="v141SetterNoData">トス記録がありません</div></div>`;
    const successCount=Math.max(0,a.quality.total-a.quality.miss);
    const successPct=a.quality.total?Math.round(successCount/a.quality.total*100):0;
    const missPct=a.quality.total?Math.round(a.quality.miss/a.quality.total*100):0;
    const qualityBar=`<div class="setterQualityOneBar"><div class="setterQualityOneBarStats" style="color:#ffffff!important"><span style="color:#ffffff!important">総トス <b style="color:#ffffff!important">${a.quality.total}</b>本</span><span style="color:#ffffff!important">トスミス <b style="color:#ffffff!important">${a.quality.miss}</b>本</span><span style="color:#ffffff!important">成功率 <b style="color:#ffffff!important">${a.quality.successRate}</b>%</span></div><div class="setterQualityOneBarTrack">${a.quality.total?`<i class="ok" style="width:${successPct}%"></i><i class="ng" style="width:${missPct}%"></i>`:`<em>記録なし</em>`}</div></div>`;
    return `<section class="reportPanel setterAnalysisUnit" data-setter-number="${escapeHtml(String(n))}">
      <div class="setterAnalysisHeader"><div><span class="setterAnalysisEyebrow">SETTER REPORT</span><h2>セッター分析${idx===0?'①':'②'}</h2></div><small>${escapeHtml(a.name||'')}の配球・能力バランス・ローテーション別傾向</small></div>
      <div class="setterAnalysisUnitBody"><div class="setterMasterCard">
      <div class="setterMasterHeaderRow">
        <div class="setterMasterName"><small style="color:#ffffff!important;-webkit-text-fill-color:#ffffff!important">${escapeHtml(setterRoleLabelForNumber(n)||`セッター${idx+1}`)}</small><h3>${escapeHtml(a.name||'')}</h3></div>
        <div class="setterMasterIqAdviceCard">
          ${buildSetterTheoryEvaluation(a.total?a.setterIq:null)}
          ${window.__setterTheorySavedReportAccordion
            ? `<details class="setterMasterAdvice setterAdviceAccordion" ontoggle="const l=this.querySelector('.setterAdviceToggleLabel');if(l)l.textContent=this.open?'▼ Aquila Adviceを閉じる':'▶ Aquila Adviceを見る';"><summary><span class="setterAdviceToggleLabel">▶ Aquila Adviceを見る</span></summary><div class="setterAquilaAdviceList"><div class="continue"><strong>継続すること</strong><p>${escapeHtml(advice.continueText)}</p></div><div class="correction"><strong>修正すること</strong><p>${escapeHtml(advice.correctionText)}</p></div><div class="next"><strong>次の試合で意識すること</strong><p>${escapeHtml(advice.nextText)}</p></div><div class="key"><strong>Aquila Coach's Key Point</strong><p>${escapeHtml(advice.keyPoint)}</p></div></div></details>`
            : `<div class="setterMasterAdvice"><b>Aquila Advice</b><div class="setterAquilaAdviceList"><div class="continue"><strong>継続すること</strong><p>${escapeHtml(advice.continueText)}</p></div><div class="correction"><strong>修正すること</strong><p>${escapeHtml(advice.correctionText)}</p></div><div class="next"><strong>次の試合で意識すること</strong><p>${escapeHtml(advice.nextText)}</p></div><div class="key"><strong>Aquila Coach's Key Point</strong><p>${escapeHtml(advice.keyPoint)}</p></div></div></div>`}
        </div>
      </div>
      <div class="setterMasterBottomGrid setterAnalysisSubcardGrid">
        <section class="setterAnalysisSubcard setterAnalysisRadarCard">
          <h4 class="setterAnalysisSubcardTitle">能力バランス</h4>
          <div class="setterAnalysisSubcardBody setterMasterRadar">${buildSetterIqRadarChart(b,true)}</div>
        </section>
        <section class="setterAnalysisSubcard setterAnalysisTossCard">
          <h4 class="setterAnalysisSubcardTitle">トス配分</h4>
          <div class="setterAnalysisSubcardBody setterMasterMiddleColumn">${qualityBar}${donut}</div>
        </section>
        <section class="setterAnalysisSubcard setterAnalysisRotationCard setterMasterRotation">
          <h4 class="setterAnalysisSubcardTitle">ローテーション別トス配分</h4>
          <div class="setterAnalysisSubcardBody">${buildRotationTossDistribution(n)}</div>
        </section>
      </div>
      </div></div>
    </section>`;
  }).join('')}</div>`;
}
function buildTwoSetterSummary(){
  const setters=reportSetterNumbers();
  if(!setters.length) return '';
  const cards=setters.map((n,idx)=>{
    const a=currentSetterAnalysisFor(n);
    return `<div class="setterRoleCard"><span>${escapeHtml(setterRoleLabelForNumber(n)||`セッター${idx+1}`)}</span><b>${escapeHtml(n)}番 ${escapeHtml(a.name)}</b><small>IQ ${a.total?a.setterIq:'--'}/100 ・ トス ${a.quality.total}本 ・ ミス ${a.quality.miss}本 ・ 成功率 ${a.quality.successRate}%</small></div>`;
  }).join('');
  return `<div class="reportPanel setterRolePanel"><h3>登録セッター</h3><div class="setterRoleGrid">${cards}</div></div>`;
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

let reportRankType = localStorage.getItem("setterTheoryReleaseReportRankType") || "スパイク";
if(reportRankType === "トス") reportRankType = "スパイク";
let reportSortType = localStorage.getItem("setterTheoryReleaseReportSortType") || "rate";

function refreshPersonalRanking(){
  const host=document.getElementById("personalRankingHost");
  if(host){
    host.innerHTML=buildPersonalRanking();
  }else{
    report();
  }
}
function setReportRankType(value){
  reportRankType = value;
  localStorage.setItem("setterTheoryReleaseReportRankType", value);
  refreshPersonalRanking();
}
function setReportSortType(value){
  reportSortType = value;
  localStorage.setItem("setterTheoryReleaseReportSortType", value);
  refreshPersonalRanking();
}

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
    if(reportSortType==="success") return b.ok-a.ok || b.pct-a.pct || b.total-a.total || Number(a.n)-Number(b.n);
    if(reportSortType==="tries") return b.total-a.total || b.pct-a.pct || b.ok-a.ok || Number(a.n)-Number(b.n);
    return b.pct-a.pct || b.ok-a.ok || b.total-a.total || Number(a.n)-Number(b.n);
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
    <div><label>表示項目</label><br><select id="rankTypeSelect" onchange="setReportRankType(this.value)" oninput="setReportRankType(this.value)">
      ${["スパイク","サーブ","レセプ","ディグ","ブロック"].map(t=>`<option value="${t}" ${reportRankType===t?"selected":""}>${rankConfig(t).title}</option>`).join("")}
    </select></div>
    <div><label>並び替え</label><br><select id="rankSortSelect" onchange="setReportSortType(this.value)" oninput="setReportSortType(this.value)">
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



function buildAllPersonalRankings(){
  const types=["スパイク","サーブ","レセプ","ディグ","ブロック"];
  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=="-"))].sort((a,b)=>Number(a)-Number(b));
  const cards=types.map(type=>{
    const cfg=rankConfig(type);
    const rows=nums.map(n=>{
      const all=s.logs.filter(x=>String(x.num)===String(n) && cfg.all(x));
      const ok=all.filter(cfg.ok).length;
      const pct=safePct(ok,all.length);
      return {n,name:getPlayerName(n)||`${n}番`,ok,total:all.length,pct};
    }).filter(r=>r.total>0)
      .sort((a,b)=>b.pct-a.pct || b.ok-a.ok || b.total-a.total || Number(a.n)-Number(b.n))
      .slice(0,3);
    const body=rows.length?rows.map((r,i)=>`<div class="compactRankRow">
      <span class="compactRankNo">${i+1}</span>
      <span class="compactRankName">#${escapeHtml(r.n)} ${escapeHtml(r.name)}</span>
      <span class="compactRankTrack"><i style="width:${r.pct}%"></i></span>
      <strong>${r.pct}%</strong>
      <small>${r.ok}/${r.total}</small>
    </div>`).join(''):`<div class="compactRankEmpty">記録なし</div>`;
    return `<section class="compactRankCard"><h4>${escapeHtml(cfg.title)}</h4>${body}</section>`;
  }).join('');
  return `<div class="allRankingsGrid">${cards}</div>`;
}

let reportRankingsOpen=false;
let reportRecentLogsOpen=true;
let reportRecentLogsExpanded=false;
let importedReportRankingsOpen=false;
let importedReportRecentLogsOpen=true;
let importedReportRecentLogsExpanded=false;
function toggleReportRankings(){
  reportRankingsOpen=!reportRankingsOpen;
  report();
}
function toggleImportedReportRankings(){
  importedReportRankingsOpen=!importedReportRankingsOpen;
  if(importedCsv) renderCsvAnalysis(importedCsv);
}
function toggleImportedReportRecentSection(){
  importedReportRecentLogsOpen=!importedReportRecentLogsOpen;
  if(importedCsv) renderCsvAnalysis(importedCsv);
}
function toggleImportedReportRecentLogs(){
  importedReportRecentLogsExpanded=!importedReportRecentLogsExpanded;
  if(importedCsv) renderCsvAnalysis(importedCsv);
}
function toggleReportRecentSection(){
  reportRecentLogsOpen=!reportRecentLogsOpen;
  report();
}
function toggleReportRecentLogs(){
  reportRecentLogsExpanded=!reportRecentLogsExpanded;
  report();
}
function buildRecentReportLogs(){
  const source=reportRecentLogsExpanded?s.logs.slice(-20):s.logs.slice(-5);
  const iconFor=x=>{if(isMissResult(x)) return ["×","tMiss"]; if(x.result==="被ブロック") return ["△","tBlock"]; if(x.result==="継続") return ["−","tCont"]; return ["○","tSuccess"];};
  const items=source.map(x=>{const [ic,cls]=iconFor(x);return `<div class="timelineItem"><div class="timelineNo">${x.no}</div><div class="timelineIcon ${cls}">${ic}</div><div class="timelineText">${effectivePlayType(x)}${isTossMissLog(x)?"・ミス":""}</div></div>`;}).join('');
  const canExpand=s.logs.length>5;
  return `<div class="timeline">${items}</div>${canExpand?`<button class="recentLogToggle" onclick="toggleReportRecentLogs()">${reportRecentLogsExpanded?'5件表示に戻す':'すべて表示'}</button>`:''}<div class="logLegend"><span>🟢 成功系</span><span>🔵 継続</span><span>🔴 ミス</span><span>🟠 被ブロック</span></div>`;
}
function buildRotationPointAnalysis(){
  const rows=[1,2,3,4,5,6].map(r=>{
    const key="S"+r;
    const logs=s.logs.filter(x=>x.rot===key);
    const my=logs.filter(x=>x.point==="自").length;
    const op=logs.filter(x=>x.point==="相").length;
    const diff=my-op;
    const toss=normalSetterTossLogs(logs);
    const dist={};
    toss.forEach(x=>{ dist[x.result]=(dist[x.result]||0)+1; });
    const top=Object.entries(dist).sort((a,b)=>b[1]-a[1])[0];
    const topText=top ? `${top[0]} ${safePct(top[1],toss.length)}%` : "-";
    return {key,logs,my,op,diff,toss,topText};
  });
  return `<div class="v37RotTable">
    <div class="v37RotHead"><span>ローテ</span><span>自得点</span><span>失点</span><span>差</span><span>最多トス先</span></div>
    ${rows.map(r=>`<div class="v37RotRow ${r.diff<0?'bad':r.diff>0?'good':''}">
      <span class="rotBadge">${r.key}</span><span>${r.my}</span><span>${r.op}</span><span>${r.diff>0?'+':''}${r.diff}</span><span>${r.topText}</span>
    </div>`).join("")}
  </div>`;
}

function buildRotationTossDistribution(setterNum=null){
  const savedReportRotation=!!window.__setterTheorySavedReportAccordion;
  const rotationTextColor=savedReportRotation?'#0f172a':'#ffffff';
  const rotationTextStyle=`color:${rotationTextColor}!important;-webkit-text-fill-color:${rotationTextColor}!important`;
  const labels=["レフト","センター","ライト","バック","ツー"];
  const colors={"レフト":"#ef4444","センター":"#2563eb","ライト":"#22c55e","バック":"#f59e0b","ツー":"#111827"};
  const source=setterNum
    ? (s.logs||[]).filter(x=>x && x.type==="トス" && logBelongsToPlayer(x,String(setterNum)))
    : normalSetterTossLogs();
  const allToss=source.filter(x=>labels.includes(x.result));
  const setterRotationForLog=(log)=>{
    const saved=String(log&&log.setterRot||'').trim();
    if(/^S[1-6]$/.test(saved)) return saved;
    const pos=Number(log&&log.pos);
    if(pos>=1 && pos<=6) return 'S'+pos;
    const rot=String(log&&log.rot||'').trim();
    return /^S[1-6]$/.test(rot)?rot:'';
  };

  const rows=[1,2,3,4,5,6].map(r=>{
    const rot='S'+r;
    const logs=allToss.filter(x=>setterRotationForLog(x)===rot);
    const total=logs.length;
    const stats=labels.map(label=>{
      const count=logs.filter(x=>x.result===label).length;
      return {label,count,pct:total?Math.round(count/total*100):0};
    });
    const segments=stats.filter(x=>x.count>0).map(x=>
      `<span class="setterRotBarSegment" style="width:${x.pct}%;background:${colors[x.label]}" title="${x.label} ${x.count}本 (${x.pct}%)"></span>`
    ).join('');
    const values=stats.map(x=>`<span class="setterRotValue ${x.count===0?'zero':''}" style="${rotationTextStyle}"><i style="background:${colors[x.label]}"></i><b style="${rotationTextStyle}">${x.label}</b><em style="${rotationTextStyle}">${x.pct}%</em><small style="${rotationTextStyle}">${x.count}本</small></span>`).join('');
    return `<div class="setterRotBarRow ${total===0?'empty':''}">
      <div class="setterRotBarLabel" style="${rotationTextStyle}"><strong style="${rotationTextStyle}">S${r}</strong><small style="${rotationTextStyle}">${total}本</small></div>
      <div class="setterRotBarMain"><div class="setterRotBarTrack">${segments||`<span class="setterRotBarEmpty" style="${rotationTextStyle}">記録なし</span>`}</div><div class="setterRotBarValues">${values}</div></div>
    </div>`;
  }).join('');

  return `<div class="setterRotBarWrap ${savedReportRotation?'savedReportRotationBars':''}" style="${rotationTextStyle}"><div class="setterRotBarSummary" style="${rotationTextStyle}"><span style="${rotationTextStyle}">全ローテーション合計</span><strong style="${rotationTextStyle}">${allToss.length}本</strong></div>${rows}</div>`;
}

function buildSetterTossAnalysisPanel(setterNum){
  const n=String(setterNum||'');
  const name=getPlayerName(n)||'';
  const toss=(s.logs||[]).filter(x=>x && x.type==='トス' && logBelongsToPlayer(x,n));
  const labels=["レフト","センター","ライト","バック","ツー"];
  const colors={"レフト":"#ef4444","センター":"#2563eb","ライト":"#22c55e","バック":"#f59e0b","ツー":"#0f172a"};
  const items=labels.map(label=>({label,count:toss.filter(x=>x.result===label).length,color:colors[label]})).filter(x=>x.count>0);
  const quality=tossQualityStats(toss);
  const donut=items.length
    ? `<div class="tossPanel"><div class="donut" style="background:${donutStyle(items)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${toss.length}</div></div></div>${legendHtml(items,toss.length)}</div>`
    : `<div class="v141SetterNoData">トス記録がありません</div>`;
  const qualityPanel=`<div class="tossQualityPanel">
    <div class="tossQualityMetric"><span>総トス</span><b>${quality.total}</b><small>本</small></div>
    <div class="tossQualityMetric miss"><span>トスミス</span><b>${quality.miss}</b><small>本</small></div>
    <div class="tossQualityMetric success"><span>トス成功率</span><b>${quality.successRate}</b><small>%</small></div>
  </div>`;
  return `<section class="v141SetterTossBlock">
    <div class="v141SetterTossTitle"><span>セッター</span><strong>${escapeHtml(n)}番 ${escapeHtml(name)}</strong></div>
    <div class="v141SetterTossMain">${donut}${qualityPanel}</div>
    <div class="v141RotationSection"><h4>ローテーション別 トス配分</h4><div class="v141RotationNote">${escapeHtml(n)}番 ${escapeHtml(name)}／S1〜S6ごとの配球比較</div>${buildRotationTossDistribution(n)}</div>
  </section>`;
}

function buildSetterTossAnalysis(){
  const setters=reportSetterNumbers();
  if(!setters.length) return '<div class="v141SetterNoData">セッターが設定されていません</div>';
  return `<div class="v141SetterTossList ${setters.length>1?'two':''}">${setters.map(buildSetterTossAnalysisPanel).join('')}</div>`;
}

function buildTossUsageAnalysis(){
  const toss=normalSetterTossLogs();
  const labels=["レフト","センター","ライト","バック","ツー"];
  return `<div class="v37Bars">${labels.map(label=>{
    const count=toss.filter(x=>x.result===label).length;
    const pct=safePct(count,toss.length);
    return `<div class="v37BarLine"><div class="v37BarLabel">${label}</div><div class="v37BarTrack"><div class="v37BarFill" style="width:${pct}%"></div></div><div class="v37BarNum">${pct}%<small>${count}</small></div></div>`;
  }).join("")}</div>`;
}

function buildActionSuccessAnalysis(){
  const cfgs=[
    {label:"サーブ", all:x=>x.type==="サーブ", ok:x=>x.type==="サーブ"&&(x.result==="成功"||x.result==="エース")},
    {label:"レセプ", all:x=>x.type==="レセプ", ok:x=>x.type==="レセプ"&&(x.result==="Aパス"||x.result==="Bパス"||x.result==="Cパス")},
    {label:"ディグ", all:x=>x.type==="ディグ", ok:x=>x.type==="ディグ"&&x.result==="成功"},
    {label:"スパイク", all:x=>x.type==="スパイク", ok:x=>x.type==="スパイク"&&x.result==="成功"},
    {label:"ブロック", all:x=>x.type==="ブロック", ok:x=>x.type==="ブロック"&&(x.result==="シャット"||x.result==="ワンタッチ")}
  ];
  const stats=cfgs.map(c=>{
    const all=s.logs.filter(c.all);
    const ok=s.logs.filter(c.ok);
    return {...c,total:all.length,ok:ok.length,pct:safePct(ok.length,all.length),eff:effectRate(all)};
  }).sort((a,b)=>b.pct-a.pct || b.total-a.total || a.label.localeCompare(b.label,'ja'));
  return `<div class="v135ActionBars">${stats.map(c=>`<div class="v135ActionBarRow ${c.pct>=70?'good':c.pct<45&&c.total>0?'bad':''}">
    <div class="v135ActionBarHead"><span class="v135ActionBarLabel">${c.label}</span><strong class="v135ActionBarValue">${c.pct}%</strong></div>
    <div class="v135ActionBarTrack"><span style="width:${Math.max(0,Math.min(100,c.pct))}%"></span></div>
    <div class="v135ActionBarSub">成功 ${c.ok}/${c.total}　効果率 ${c.eff}%</div>
  </div>`).join("")}</div>`;
}

function buildSetterInsight(){
  const toss=s.logs.filter(x=>x.type==="トス");
  const labels=["レフト","センター","ライト","バック","ツー"];
  const counts=labels.map(label=>({label,count:toss.filter(x=>x.result===label).length,pct:safePct(toss.filter(x=>x.result===label).length,toss.length)}));
  const top=counts.slice().sort((a,b)=>b.count-a.count)[0];
  const center=counts.find(x=>x.label==="センター") || {pct:0,count:0};
  const rotRows=[1,2,3,4,5,6].map(r=>{const logs=s.logs.filter(x=>x.rot==="S"+r); return {r,op:logs.filter(x=>x.point==="相").length,my:logs.filter(x=>x.point==="自").length,total:logs.length};}).sort((a,b)=>b.op-a.op);
  const worst=rotRows[0] || {r:1,op:0,total:0};
  const comments=[];
  if(toss.length===0){
    comments.push("トス記録がまだ少ないです。まずはトス先を入力すると配球分析が見えるようになります。");
  }else{
    if(top && top.pct>=50) comments.push(`${top.label}への配球が${top.pct}%です。相手ブロックに読まれやすい可能性があります。`);
    else comments.push("配球の偏りは大きくありません。ローテ別にどこで崩れるかを見る段階です。");
    if(center.pct<=15 && toss.length>=5) comments.push(`センター使用率が${center.pct}%です。ミドルを意識させる場面を作るとサイドが楽になります。`);
  }
  if(worst.total>0 && worst.op>=2) comments.push(`S${worst.r}で失点が${worst.op}点あります。このローテの1本目の入り方を確認しましょう。`);
  return `<div class="v37Insight"><div class="v37InsightTitle">Setter Theory コメント</div><ul>${comments.map(x=>`<li>${x}</li>`).join("")}</ul></div>`;
}

function currentMatchSetterAnalysis(){
  const toss=normalSetterTossLogs();
  const counts={レフト:0,センター:0,ライト:0,バック:0,ツー:0};
  const terminalCounts={};
  toss.forEach(x=>{
    const label=counts[x.result]!==undefined ? x.result : classifyTossTarget(x.result);
    if(counts[label]===undefined) counts[label]=0;
    counts[label]++;
    const score=scoreParts(x.score||'');
    if(score && score.high>=20) addCount(terminalCounts,label);
  });
  const total=toss.length;
  const items=analysisItemsFromCounts(counts,total);
  return {total,items,terminalCounts,...calcScores(counts,total,terminalCounts)};
}
function setterIqRank(score){
  const n=Number(score||0);
  if(n>=95) return {label:'S+',cls:'rank-sp'};
  if(n>=90) return {label:'S',cls:'rank-s'};
  if(n>=80) return {label:'A',cls:'rank-a'};
  if(n>=70) return {label:'B',cls:'rank-b'};
  if(n>=60) return {label:'C',cls:'rank-c'};
  return {label:'D',cls:'rank-d'};
}
function buildIqRankPyramid(score){
  const current=setterIqRank(score).label;
  const ranks=['S+','S','A','B','C','D'];
  return `<div class="iqRankPyramid" aria-label="今回のランク ${current}">${ranks.map((label,index)=>`<div class="iqRankTier tier-${index+1} ${label===current?'isCurrent':''}"><span>${label}</span>${label===current?'<b>今回</b>':''}</div>`).join('')}</div>`;
}
function buildSetterTheoryEvaluation(score){
  const hasScore=score!==null&&score!==undefined&&score!==''&&Number.isFinite(Number(score));
  if(!hasScore){
    return `<div class="setterTheoryEvaluation isEmpty"><div class="setterTheoryEvaluationTitle">Setter Theory評価</div><div class="setterTheoryEvaluationRank">--</div><div class="setterTheoryPyramid" aria-hidden="true">${[0,1,2,3,4,5].map(i=>`<i class="level-${i+1}"></i>`).join('')}</div><div class="setterTheoryEvaluationIq">IQ --</div><div class="setterTheoryEvaluationNext">トス記録後に評価します</div></div>`;
  }
  const value=Math.max(0,Math.min(100,Math.round(Number(score))));
  const rank=setterIqRank(value).label;
  const ranks=['S+','S','A','B','C','D'];
  const currentIndex=ranks.indexOf(rank);
  const nextThreshold=rank==='S+'?100:rank==='S'?95:rank==='A'?90:rank==='B'?80:rank==='C'?70:60;
  const diff=rank==='S+'?0:Math.max(0,nextThreshold-value);
  const nextText=rank==='S+'?'最高ランク到達':`次のランクまで +${diff}`;
  const pyramid=ranks.map((label,index)=>`<i class="level-${index+1} ${index>=currentIndex?'isReached':''} ${index===currentIndex?'isCurrent':''}" title="${label}"></i>`).join('');
  return `<div class="setterTheoryEvaluation ${setterIqRank(value).cls}"><div class="setterTheoryEvaluationTitle">Setter Theory評価</div><div class="setterTheoryEvaluationRank">${rank}</div><div class="setterTheoryPyramid" role="img" aria-label="今回の評価 ${rank}">${pyramid}</div><div class="setterTheoryEvaluationIq">IQ <b>${value}</b><span>/100</span></div><div class="setterTheoryEvaluationNext">${nextText}</div></div>`;
}
function getCurrentAquilaAdviceItems(){
  const a=currentMatchSetterAnalysis();
  if(!a.total) return ['まずはトスを記録しよう。5本以上たまると、配球の偏りと次の一手が見えやすくなります。'];

  const byLabel=Object.fromEntries(a.items.map(x=>[x.label,x]));
  const left=byLabel['レフト']||{pct:0,count:0};
  const center=byLabel['センター']||{pct:0,count:0};
  const right=byLabel['ライト']||{pct:0,count:0};
  const back=byLabel['バック']||{pct:0,count:0};
  const two=byLabel['ツー']||{pct:0,count:0};
  const top=a.items.slice().sort((x,y)=>y.count-x.count)[0]||{label:'-',pct:0,count:0};

  const rotRows=[1,2,3,4,5,6].map(r=>{
    const logs=s.logs.filter(x=>x.rot==='S'+r);
    return {r,my:logs.filter(x=>x.point==='自').length,op:logs.filter(x=>x.point==='相').length,total:logs.length};
  }).filter(x=>x.total>0).sort((x,y)=>(y.op-y.my)-(x.op-x.my));
  const worst=rotRows[0]||null;

  const advice=[];

  // Good: 必ずデータ根拠を含める
  if(top.pct<50 && Math.abs(left.pct-right.pct)<=15){
    advice.push(`良かった点：レフト${left.pct}%・センター${center.pct}%・ライト${right.pct}%で、左右の偏りを抑えながら配球できています。`);
  }else if(center.pct>=18){
    advice.push(`良かった点：センターを${center.pct}%（${center.count}本）使えており、相手MBを中央に意識させる配球になっています。`);
  }else if(back.pct>=10 || two.pct>=8){
    advice.push(`良かった点：バック${back.pct}%・ツー${two.pct}%を混ぜ、前衛3方向だけに限定されない選択ができています。`);
  }else{
    advice.push(`良かった点：最多配球は${top.label}${top.pct}%（${top.count}本）でした。まずは自分の勝負先を明確にできています。`);
  }

  // Improve: 最大の改善点を一つ、具体的に
  if(top.pct>=55){
    advice.push(`改善点：${top.label}が${top.pct}%に集中しています。次の試合では序盤に${top.label==='センター'?'レフトかライト':'センター'}を1〜2本見せ、終盤の${top.label}を生かしましょう。`);
  }else if(center.pct<12 && a.total>=5){
    advice.push(`改善点：センターは${center.pct}%（${center.count}本）です。A/Bパス時にまず1本使い、相手MBを中央に残す伏線を作りましょう。`);
  }else if(Math.abs(left.pct-right.pct)>=25){
    const low=left.pct<right.pct?'レフト':'ライト';
    advice.push(`改善点：左右差が${Math.abs(left.pct-right.pct)}ポイントあります。少ない${low}へ次戦は2本増やすと、相手ブロックの基準をずらせます。`);
  }else if(a.clutch<65){
    advice.push(`改善点：終盤冷静度は${a.clutch}点です。20点以降の最初の1本だけ、直前と違う方向を準備しておきましょう。`);
  }else{
    advice.push(`改善点：配球の大きな偏りはありません。次は最多配球の${top.label}${top.pct}%を、ローテごとに意図して使い分けましょう。`);
  }

  // Next theme: ローテまたは終盤を使って一行で行動化
  if(worst && worst.op>worst.my){
    advice.push(`次戦テーマ：S${worst.r}は${worst.my}得点・${worst.op}失点でした。このローテの1本目だけ、事前に第一候補と逃げ道を決めて入りましょう。`);
  }else if(a.clutch<75){
    advice.push(`次戦テーマ：20点以降も序盤と同じ選択肢を残すため、15点までにセンターかバックを最低1本ずつ見せましょう。`);
  }else{
    advice.push(`次戦テーマ：現在の配球バランスを維持し、勝負所で「なぜこの選手か」を1本ごとに言語化してみましょう。`);
  }
  return advice;
}
function iqBreakdown20(a){
  const target=Math.max(0, Math.min(100, Math.round(Number(a?.setterIq)||0)));
  const raw=[
    Math.max(0, Number(a?.balance)||0),
    Math.max(0, Number(a?.diversity)||0),
    Math.max(0, Number(a?.quick)||0),
    Math.max(0, Number(a?.clutch)||0),
    Math.max(0, Number(a?.leftRightBalance)||0)
  ];
  const values=[0,0,0,0,0];
  // Setter IQを5項目（各20点）へ、各指標の強さに応じて配分する。
  // 合計は必ずSetter IQと一致し、各項目は20点を超えない。
  for(let point=0; point<target; point++){
    let best=-1;
    let bestScore=-1;
    for(let i=0;i<values.length;i++){
      if(values[i]>=20) continue;
      const score=raw[i]/(values[i]+1);
      if(score>bestScore){ bestScore=score; best=i; }
    }
    if(best<0) break;
    values[best]++;
  }
  return {
    balance:values[0],
    diversity:values[1],
    quick:values[2],
    clutch:values[3],
    stability:values[4],
    total:values.reduce((sum,v)=>sum+v,0)
  };
}
function buildSetterIqRadarChart(breakdown, compactReport=false){
  const items=[
    {label:'配球',value:Number(breakdown?.balance)||0},
    {label:'多様性',value:Number(breakdown?.diversity)||0},
    {label:'ミドル',value:Number(breakdown?.quick)||0},
    {label:'勝負所',value:Number(breakdown?.clutch)||0},
    {label:'安定性',value:Number(breakdown?.stability)||0}
  ];
  const cx=150, cy=132;
  // コート入力→試合レポートのコンパクト表示だけ、
  // 項目名・数値の位置を変えずにレーダー本体を縮小して重なりを防ぐ。
  const radius=compactReport?84:96;
  const labelRadius=96*1.18;
  const point=(index,ratio=1)=>{
    const angle=(-Math.PI/2)+(Math.PI*2*index/items.length);
    return [cx+Math.cos(angle)*radius*ratio,cy+Math.sin(angle)*radius*ratio];
  };
  const labelPoint=index=>{
    const angle=(-Math.PI/2)+(Math.PI*2*index/items.length);
    return [cx+Math.cos(angle)*labelRadius,cy+Math.sin(angle)*labelRadius];
  };
  const polygon=ratio=>items.map((_,i)=>point(i,ratio).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dataPoints=items.map((item,i)=>point(i,Math.max(0,Math.min(20,item.value))/20).map(v=>v.toFixed(1)).join(',')).join(' ');
  const axes=items.map((_,i)=>{const [x,y]=point(i);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;}).join('');
  const labels=items.map((item,i)=>{
    const [x,y]=labelPoint(i);
    const anchor=x<cx-8?'end':x>cx+8?'start':'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"><tspan x="${x.toFixed(1)}">${item.label}</tspan><tspan x="${x.toFixed(1)}" dy="18">${item.value}/20</tspan></text>`;
  }).join('');
  const radarInnerTitle=(compactReport&&window.__setterTheorySavedReportAccordion)?'':'<div class="setterIqRadarTitle">能力バランス</div>';
  return `<div class="setterIqRadar" aria-label="Setter IQ 5項目レーダーチャート">
    ${radarInnerTitle}
    <svg viewBox="0 0 300 270" role="img" aria-label="配球、多様性、ミドル、勝負所、安定性の評価">
      <g class="radarGrid"><polygon points="${polygon(1)}"/><polygon points="${polygon(.75)}"/><polygon points="${polygon(.5)}"/><polygon points="${polygon(.25)}"/>${axes}</g>
      <polygon class="radarData" points="${dataPoints}"/>
      <g class="radarDots">${items.map((item,i)=>{const [x,y]=point(i,Math.max(0,Math.min(20,item.value))/20);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`;}).join('')}</g>
      <g class="radarLabels">${labels}</g>
    </svg>
  </div>`;
}

function buildSetterIqRadarChartPdf(breakdown){
  const items=[
    {label:'配球',value:Number(breakdown?.balance)||0},
    {label:'多様性',value:Number(breakdown?.diversity)||0},
    {label:'ミドル',value:Number(breakdown?.quick)||0},
    {label:'勝負所',value:Number(breakdown?.clutch)||0},
    {label:'安定性',value:Number(breakdown?.stability)||0}
  ];
  // V150.104 PDF/印刷専用：5項目と数値を含む全体を小さくし、カード中央へ収める。
  const cx=180, cy=154, radius=54;
  const point=(index,ratio=1)=>{
    const angle=(-Math.PI/2)+(Math.PI*2*index/items.length);
    return [cx+Math.cos(angle)*radius*ratio,cy+Math.sin(angle)*radius*ratio];
  };
  const polygon=ratio=>items.map((_,i)=>point(i,ratio).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dataPoints=items.map((item,i)=>point(i,Math.max(0,Math.min(20,item.value))/20).map(v=>v.toFixed(1)).join(',')).join(' ');
  const axes=items.map((_,i)=>{const [x,y]=point(i);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;}).join('');
  const labels=items.map((item,i)=>{
    const [x,y]=point(i,1.52);
    const anchor=x<cx-8?'end':x>cx+8?'start':'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" fill="#0f172a" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans JP,sans-serif" font-size="13" font-weight="900"><tspan x="${x.toFixed(1)}" fill="#0f172a">${item.label}</tspan><tspan x="${x.toFixed(1)}" dy="16" fill="#1d4ed8" font-size="12" font-weight="1000">${item.value}/20</tspan></text>`;
  }).join('');
  return `<div class="setterIqRadar pdfSetterIqRadar" aria-label="Setter IQ 5項目レーダーチャート">
    <div class="setterIqRadarTitle">能力バランス</div>
    <svg viewBox="0 0 360 310" preserveAspectRatio="xMidYMid meet" role="img" aria-label="配球、多様性、ミドル、勝負所、安定性の評価">
      <g class="radarGrid"><polygon points="${polygon(1)}"/><polygon points="${polygon(.75)}"/><polygon points="${polygon(.5)}"/><polygon points="${polygon(.25)}"/>${axes}</g>
      <polygon class="radarData" points="${dataPoints}"/>
      <g class="radarDots">${items.map((item,i)=>{const [x,y]=point(i,Math.max(0,Math.min(20,item.value))/20);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`;}).join('')}</g>
      <g class="radarLabels">${labels}</g>
    </svg>
  </div>`;
}

function buildSetterIqPanelFor(num, index){
  const a=currentSetterAnalysisFor(num);
  const setterLabel=`セッター${index+1}　${escapeHtml(num)}番 ${escapeHtml(a.name||'')}`;
  if(!a.total){
    return `<div class="setterIqLive empty aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div><div class="setterIqLiveHead"><span>${setterLabel}</span><b>--</b><small>/100</small></div><p>このセッターのトスを記録するとSetter IQを表示します。</p></div></div></div>`;
  }
  const top=a.items.slice().sort((x,y)=>y.count-x.count)[0]||{label:'-',pct:0};
  const rank=setterIqRank(a.setterIq);
  const breakdown=iqBreakdown20(a);
  return `<div class="setterIqLive aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div class="aquilaHeroBody"><div class="setterIqLiveHead"><span>${setterLabel}</span><b>${a.setterIq}</b><small>/100</small></div><div class="iqRankCurrent">今回のランク <b>${rank.label}</b></div>${buildIqRankPyramid(a.setterIq)}</div></div>
    <div class="setterIqVisualGrid">${buildSetterIqRadarChart(breakdown)}</div>
    <p>最多配球は${escapeHtml(top.label)} ${top.pct}%（トス${a.total}本）です。</p></div>`;
}
function buildCurrentSetterIqPanel(){
  const setters=reportSetterNumbers();
  if(setters.length>1){
    return `<div class="setterIqMultiGrid">${setters.map((n,i)=>buildSetterIqPanelFor(n,i)).join('')}</div>`;
  }
  if(setters.length===1) return buildSetterIqPanelFor(setters[0],0);
  const a=currentMatchSetterAnalysis();
  if(!a.total){
    return `<div class="setterIqLive empty aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div><div class="setterIqLiveHead"><span>Setter IQ</span><b>--</b><small>/100</small></div><p>トスを記録すると、配球バランスをもとにSetter IQを表示します。</p></div></div></div>`;
  }
  const top=a.items.slice().sort((x,y)=>y.count-x.count)[0]||{label:'-',pct:0};
  const rank=setterIqRank(a.setterIq);
  const breakdown=iqBreakdown20(a);
  return `<div class="setterIqLive aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div class="aquilaHeroBody"><div class="setterIqLiveHead"><span>Setter IQ</span><b>${a.setterIq}</b><small>/100</small></div><div class="iqRankCurrent">今回のランク <b>${rank.label}</b></div>${buildIqRankPyramid(a.setterIq)}</div></div>
    <div class="setterIqVisualGrid">${buildSetterIqRadarChart(breakdown)}</div>
    <p>最多配球は${escapeHtml(top.label)} ${top.pct}%（トス${a.total}本）です。</p></div>`;
}
function buildCurrentAquilaAdvice(num=null,index=0){
  const advice=num===null ? getCurrentAquilaAdviceItems() : getAquilaAdviceForSetter(num);
  const a=num===null ? null : currentSetterAnalysisFor(num);
  const title=num===null ? 'Aquilaのアドバイス' : `Aquilaのアドバイス　セッター${index+1} ${escapeHtml(num)}番 ${escapeHtml(a?.name||'')}`;
  return `<div class="aquilaLiveAdvice aquilaAdviceHero"><div class="aquilaAdviceTitle"><img src="icons/aquila-152.png" alt="Aquila"><b>${title}</b></div>${advice.length===1?`<p>${escapeHtml(advice[0])}</p>`:`<ul>${advice.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`}</div>`;
}
function buildCurrentIqAdviceLead(){
  const setters=reportSetterNumbers();
  if(setters.length>1){
    return `<div class="setterIqAdviceStack">${setters.map((n,i)=>`<div class="setterIqAdvicePerson"><div class="reportPanel reportLeadPanel">${buildSetterIqPanelFor(n,i)}</div><div class="reportPanel reportLeadPanel">${buildCurrentAquilaAdvice(n,i)}</div></div>`).join('')}</div>`;
  }
  const num=setters.length===1?setters[0]:null;
  return `<div class="setterIqAdviceStack"><div class="setterIqAdvicePerson"><div class="reportPanel reportLeadPanel">${buildCurrentSetterIqPanel()}</div><div class="reportPanel reportLeadPanel">${buildCurrentAquilaAdvice(num,0)}</div></div></div>`;
}

function buildUnifiedReportBrandHeader(state, analysis, options={}){
  const rank=setterIqRank(analysis.setterIq||0);
  const title=options.title||'Setter Theory Match Report';
  const dateText=options.dateText||new Date().toLocaleDateString();
  const actions=options.actionsHtml||'';
  const iqItems=Array.isArray(options.iqItems)&&options.iqItems.length?options.iqItems:null;
  const iqBadgeHtml=iqItems
    ? `<div class="unifiedIqBadgeGroup ${iqItems.length>1?'isTwoSetter':''}">${iqItems.map((item,index)=>{
        const itemRank=setterIqRank(item.iq||0);
        return `<div class="unifiedAquilaBadge unifiedSetterBadge"><img src="icons/aquila-192.png" alt="Aquila"><div><div class="small">${escapeHtml(item.label||`SETTER ${index+1}`)}</div><div class="iqLine"><b>${item.iq||'--'}</b><span>/100</span></div><div class="rank">${item.iq?itemRank.label:'NO DATA'}</div></div></div>`;
      }).join('')}</div>`
    : `<div class="unifiedAquilaBadge"><img src="icons/aquila-192.png" alt="Aquila"><div><div class="small">SETTER IQ</div><div class="iqLine"><b>${analysis.setterIq||'--'}</b><span>/100</span></div><div class="rank">${analysis.setterIq?rank.label:'NO DATA'}</div></div></div>`;
  return `<div class="unifiedReportBrand">
    <div class="unifiedReportIdentity">
      <div class="unifiedReportEyebrow">AQUILA REPORT</div>
      <div class="unifiedReportTitle">${escapeHtml(title)}</div>
      <div class="unifiedReportMeta">${escapeHtml(state.myTeam||state.team||'自チーム')} vs ${escapeHtml(state.oppTeam||'相手')} / Set ${escapeHtml(state.setNo||'1')} / ${escapeHtml(dateText)}</div>
    </div>
    <div class="unifiedReportRight">
      ${iqBadgeHtml}
      ${actions}
    </div>
  </div>`;
}

function report(){
  const actionLogs=s.logs.filter(x=>actionTypes.includes(effectivePlayType(x)));
  const total=actionLogs.length;
  const success=actionLogs.filter(isSuccessResult).length;
  const loss=s.logs.filter(x=>x.point==="相").length;
  const myPts=s.logs.filter(x=>x.point==="自").length;
  const opPts=s.logs.filter(x=>x.point==="相").length;
  const opponentPointCount=s.logs.filter(x=>x.point==="相" && x.result==="相手得点").length;
  const ownErrorLossCount=Math.max(0,opPts-opponentPointCount);
  const serveLogs=s.logs.filter(x=>x.type==="サーブ");
  const serveOk=serveLogs.filter(x=>x.result==="成功"||x.result==="エース").length;
  const spikeLogs=s.logs.filter(x=>x.type==="スパイク");
  const spikeKill=spikeLogs.filter(x=>x.result==="成功").length;

  const successPct=safePct(success,total), lossPct=safePct(loss,total), servePct=safePct(serveOk,serveLogs.length), spikePct=safePct(spikeKill,spikeLogs.length);

  const playColors={"サーブ":"#ef4444","レセプ":"#2563eb","スパイク":"#22c55e","トス":"#f59e0b","二段トス":"#06b6d4","ディグ":"#7c3aed","ブロック":"#334155"};
  const playItems=actionTypes.map(t=>({label:t,count:s.logs.filter(x=>effectivePlayType(x)===t).length,color:playColors[t]})).filter(x=>x.count>0);
  const playDonut=`<div class="donutWrap"><div class="donut" style="background:${donutStyle(playItems)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${total}</div></div></div>${legendHtml(playItems,total)}</div>`;

  const summary=`<div class="playMetricAnalysis">
    ${playItems.map(item=>{
      const type=item.label;
      const logs=s.logs.filter(x=>effectivePlayType(x)===type);
      const tossMiss=x=>!!(x && (x.tossMist===true || x.tossMist==="1" || x.tossMist==="true" || x.quality==="ミス"));
      const metricPartsByType={
        "スパイク":[
          {label:"成功",color:"#22c55e",match:x=>x.result==="成功"},
          {label:"継続",color:"#3b82f6",match:x=>x.result==="継続"},
          {label:"被ブロック",color:"#f59e0b",match:x=>x.result==="被ブロック"},
          {label:"ミス",color:"#ef4444",match:x=>x.result==="ミス"}
        ],
        "サーブ":[
          {label:"エース",color:"#22c55e",match:x=>x.result==="エース"},
          {label:"成功",color:"#3b82f6",match:x=>x.result==="成功"},
          {label:"ミス",color:"#ef4444",match:x=>x.result==="ミス"}
        ],
        "レセプ":[
          {label:"A",color:"#22c55e",match:x=>x.result==="Aパス"},
          {label:"B",color:"#3b82f6",match:x=>x.result==="Bパス"},
          {label:"C",color:"#f59e0b",match:x=>x.result==="Cパス"},
          {label:"ミス",color:"#ef4444",match:x=>x.result==="ミス"||x.result==="レセプミス"}
        ],
        "ディグ":[
          {label:"成功",color:"#22c55e",match:x=>x.result==="成功"},
          {label:"ミス",color:"#ef4444",match:x=>x.result==="ミス"}
        ],
        "ブロック":[
          {label:"シャット",color:"#22c55e",match:x=>x.result==="シャット"},
          {label:"ワンタッチ",color:"#3b82f6",match:x=>x.result==="ワンタッチ"},
          {label:"ミス",color:"#ef4444",match:x=>x.result==="ミス"||x.result==="ブロックミス"}
        ],
        "トス":[
          {label:"成功",color:"#22c55e",match:x=>!tossMiss(x)},
          {label:"ミス",color:"#ef4444",match:tossMiss}
        ],
        "二段トス":[
          {label:"成功",color:"#22c55e",match:x=>!tossMiss(x)},
          {label:"ミス",color:"#ef4444",match:tossMiss}
        ]
      };
      const defs=metricPartsByType[type]||[
        {label:"成功",color:"#22c55e",match:isSuccessResult},
        {label:"ミス",color:"#ef4444",match:isMissResult}
      ];
      const parts=defs.map(def=>({...def,count:logs.filter(def.match).length}));
      const classified=parts.reduce((sum,part)=>sum+part.count,0);
      if(classified<logs.length) parts.push({label:"その他",color:"#64748b",count:logs.length-classified});
      const raw=parts.map(part=>logs.length ? part.count/logs.length*100 : 0);
      const displayPct=raw.map(v=>Math.floor(v));
      let remain=logs.length ? 100-displayPct.reduce((a,b)=>a+b,0) : 0;
      raw.map((v,i)=>({i,frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac).forEach(({i})=>{if(remain>0){displayPct[i]++;remain--;}});
      const missCount=parts.filter(part=>part.label==="ミス"||part.label==="被ブロック").reduce((sum,part)=>sum+part.count,0);
      const successCount=type==="スパイク" ? parts.find(part=>part.label==="成功")?.count||0
        : type==="サーブ" ? parts.filter(part=>part.label==="エース"||part.label==="成功").reduce((sum,part)=>sum+part.count,0)
        : type==="レセプ" ? parts.filter(part=>part.label==="A"||part.label==="B"||part.label==="C").reduce((sum,part)=>sum+part.count,0)
        : type==="ブロック" ? parts.filter(part=>part.label==="シャット"||part.label==="ワンタッチ").reduce((sum,part)=>sum+part.count,0)
        : parts.filter(part=>part.label==="成功").reduce((sum,part)=>sum+part.count,0);
      const effect=logs.length ? Math.round(((successCount-missCount)/logs.length*100)*10)/10 : 0;
      const effectClass=effect>0?"positive":effect<0?"negative":"even";
      const effectText=effect>0?`+${effect}%`:`${effect}%`;
      return `<div class="playMetricRow playMetricDetailed">
        <div class="playMetricName"><span class="playMetricDot" style="background:${item.color}"></span><b>${type}</b><small>${logs.length}本</small></div>
        <div class="playMetricSingle">
          <div class="playMetricStack" aria-label="${type} ${parts.map((part,i)=>`${part.label}${displayPct[i]}%`).join(' ')}">
            ${parts.map((part,i)=>`<i title="${escapeHtml(part.label)} ${displayPct[i]}%（${part.count}本）" style="width:${displayPct[i]}%;background:${part.color}"></i>`).join('')}
          </div>
          <div class="playMetricDetailLegend">${parts.map((part,i)=>`<span><i style="background:${part.color}"></i>${escapeHtml(part.label)} <b>${displayPct[i]}%</b><small>${part.count}本</small></span>`).join('')}<strong class="${effectClass}">効果 ${effectText}</strong></div>
        </div>
      </div>`;
    }).join("")}
  </div>`;

  const resultGroups=[
    {label:"成功系",count:actionLogs.filter(isSuccessResult).length,color:"#22c55e"},
    {label:"継続",count:actionLogs.filter(x=>x.result==="継続").length,color:"#2563eb"},
    {label:"ミス",count:actionLogs.filter(x=>x.result==="ミス"||x.result==="レセプミス"||x.result==="ブロックミス").length,color:"#ef4444"},
    {label:"被ブロック",count:actionLogs.filter(x=>x.result==="被ブロック").length,color:"#f59e0b"},
  ].filter(x=>x.count>0);
  const classifiedResultCount=resultGroups.reduce((sum,item)=>sum+item.count,0);
  const resultStackItems=[...resultGroups];
  const otherResultCount=Math.max(0,total-classifiedResultCount);
  if(otherResultCount>0) resultStackItems.push({label:"その他",count:otherResultCount,color:"#64748b"});
  const resultStackData=resultStackItems
    .map(item=>({...item,pct:safePct(item.count,total)}))
    .sort((a,b)=>b.pct-a.pct || b.count-a.count);
  const resultBars=`<div class="v146ResultOneBar">
    <div class="v146ResultOneBarTrack">${total>0
      ?resultStackData.map(item=>`<span title="${escapeHtml(item.label)} ${item.pct}%（${item.count}件）" style="width:${Math.max(0,item.pct)}%;background:${item.color}"></span>`).join('')
      :`<em>データなし</em>`}
    </div>
    <div class="v146ResultOneBarLegend">${resultStackData.map(item=>`<div><i style="background:${item.color}"></i><span>${escapeHtml(item.label)}</span><strong>${item.pct}%</strong><small>${item.count}件</small></div>`).join('')}</div>
    <div class="v146ResultOneBarTotal">全${total}プレー</div>
  </div>`;

  const teamMissCount=actionLogs.filter(isMissResult).length;
  const teamMissPct=safePct(teamMissCount,total);
  const pointDiffForAdvice=myPts-opPts;
  const rotationAdviceData=[1,2,3,4,5,6].map(r=>{
    const logs=s.logs.filter(x=>x.rot==="S"+r);
    const gain=logs.filter(x=>x.point==="自").length;
    const lost=logs.filter(x=>x.point==="相").length;
    return {rot:r,total:logs.length,diff:gain-lost};
  }).filter(x=>x.total>0);
  const weakestRotation=rotationAdviceData.length
    ? rotationAdviceData.slice().sort((a,b)=>a.diff-b.diff || b.total-a.total)[0]
    : null;
  let teamContinueAdvice='プレーデータを記録すると、チームの強みを分析します。';
  let teamCorrectionAdvice='課題が見つかると、優先して修正するポイントを表示します。';
  let teamNextActionAdvice='次の試合で意識する具体的な行動を表示します。';
  if(total>0){
    // 継続：チーム分析の中で最も良い指標を具体的に評価する。
    if(successPct>=55){
      teamContinueAdvice=`成功系プレーが${successPct}%です。得点につながっているプレーのテンポと連係を継続し、同じ形を再現できる状態を保ちましょう。`;
    }else if(teamMissPct<18){
      teamContinueAdvice=`ミス率を${teamMissPct}%に抑えられています。無理をせずラリーをつなぎ、攻撃の機会を作る判断を継続しましょう。`;
    }else if(pointDiffForAdvice>0){
      teamContinueAdvice=`得失点差は+${pointDiffForAdvice}です。得点後の集中と、次の1本へ素早く切り替える流れを継続しましょう。`;
    }else{
      teamContinueAdvice='成功したプレーの前後に共通する動きと声掛けを確認し、再現できた形をチームの基準として継続しましょう。';
    }

    // 修正：ミス、弱いローテーション、得失点差の順で優先課題を選ぶ。
    if(teamMissPct>=25){
      teamCorrectionAdvice=`ミス率が${teamMissPct}%と高めです。苦しい場面で無理に決めにいかず、返球コースと次の守備位置を揃えて自失点を減らしましょう。`;
    }else if(weakestRotation && weakestRotation.diff<0){
      teamCorrectionAdvice=`S${weakestRotation.rot}は得失点差${weakestRotation.diff}です。サーブの狙い、ブロックの基準、最初に使う攻撃をローテーション内で共有して立て直しましょう。`;
    }else if(pointDiffForAdvice<=-3){
      teamCorrectionAdvice=`得失点差は${pointDiffForAdvice}です。失点直後に同じ形を繰り返さず、返球の質と攻撃の選択を1本ごとに整理しましょう。`;
    }else{
      teamCorrectionAdvice='得失点は拮抗しています。終盤に攻撃が単調にならないよう、良い返球時に使う攻撃と苦しい返球時の安全な選択を分けて準備しましょう。';
    }

    // 次戦：分析結果を、試合前に共有できる一つの行動へ変換する。
    if(weakestRotation && weakestRotation.diff<0){
      teamNextActionAdvice=`次の試合ではS${weakestRotation.rot}に入る前に「最初のサーブの狙い」と「1本目の攻撃」を確認し、同じ判断でスタートしましょう。`;
    }else if(teamMissPct>=25){
      teamNextActionAdvice='次の試合では連続失点した場面で、全員が「まずラリーを1本つなぐ」ことを共通ルールにしてプレーを立て直しましょう。';
    }else if(Math.abs(pointDiffForAdvice)<=2){
      teamNextActionAdvice='次の試合では20点以降に使う第一候補の攻撃と、返球が乱れた時の第二候補を試合前に共有しておきましょう。';
    }else if(pointDiffForAdvice>2){
      teamNextActionAdvice='次の試合では良い流れの時ほど、得点した攻撃パターンとサーブの狙いを続け、相手が対応するまで先に変えないことを意識しましょう。';
    }else{
      teamNextActionAdvice='次の試合では各ローテーションで最初に狙う得点パターンを一つ決め、迷った時に戻れる共通の形を作りましょう。';
    }
  }
  const teamAquilaAdvice=`<div class="teamAquilaAdvice"><div class="teamAquilaAdviceTitle"><img src="icons/aquila-152.png" alt="Aquila"><b>Team Aquila Advice</b></div><div class="teamAquilaAdviceList"><div class="continue"><strong>継続すること</strong><p>${escapeHtml(teamContinueAdvice)}</p></div><div class="correction"><strong>修正すること</strong><p>${escapeHtml(teamCorrectionAdvice)}</p></div><div class="next"><strong>次の試合で意識すること</strong><p>${escapeHtml(teamNextActionAdvice)}</p></div></div></div>`;

  const pointMax=Math.max(1,myPts,opPts);
  const pointDiff=myPts-opPts;
  const pointDiffClass=pointDiff>0?"positive":pointDiff<0?"negative":"even";
  const pointDiffText=pointDiff>0?`+${pointDiff}`:`${pointDiff}`;
  const pointDivergingBars=`<div class="v138PointDiverging">
    <div class="v138PointLegend"><span class="loss">失点</span><b>0</b><span class="gain">得点</span></div>
    <div class="v138PointHead"><span>試合全体</span><strong class="${pointDiffClass}">得失点差 ${pointDiffText}</strong></div>
    <div class="v138PointChart">
      <div class="v138PointSide loss"><span style="width:${Math.round(opPts/pointMax*100)}%"></span><em>${opPts}</em></div>
      <div class="v138PointAxis"></div>
      <div class="v138PointSide gain"><span style="width:${Math.round(myPts/pointMax*100)}%"></span><em>${myPts}</em></div>
    </div>
    <div class="v138PointMeta"><span>自ミス等 ${ownErrorLossCount}</span><span>合計 ${myPts+opPts}</span><span>相手得点 ${opponentPointCount}</span></div>
  </div>`;

  const rotationRows=[1,2,3,4,5,6].map(r=>{
    const a=s.logs.filter(x=>x.rot==="S"+r);
    const ok=a.filter(isSuccessResult).length;
    const pct=safePct(ok,a.length);
    const my=a.filter(x=>x.point==="自").length;
    const op=a.filter(x=>x.point==="相").length;
    const diff=my-op;
    const diffClass=diff>0?"positive":diff<0?"negative":"even";
    const diffText=diff>0?`+${diff}`:`${diff}`;
    return `<div class="teamRotationRow">
      <div class="teamRotationLabel">S${r}</div>
      <div class="teamRotationSuccess">
        <div class="teamRotationSuccessHead"><span>成功率</span><b>${pct}%</b><small>${ok}/${a.length}</small></div>
        <div class="teamRotationTrack"><i class="${cssClassByPct(pct)}" style="width:${pct}%"></i></div>
      </div>
      <div class="teamRotationPoints">
        <div class="teamRotationPointCounts"><span class="gain">得点 <b>${my}</b></span><span class="loss">失点 <b>${op}</b></span></div>
        <strong class="${diffClass}">得失点差 ${diffText}</strong>
      </div>
    </div>`;
  }).join("");

  const tossLogs=normalSetterTossLogs();
  const tossLabels=["レフト","センター","ライト","バック","ツー"];
  const tossColors={"レフト":"#ef4444","センター":"#2563eb","ライト":"#22c55e","バック":"#f59e0b","ツー":"#0f172a"};
  const tossItems=tossLabels.map(t=>({label:t,count:tossLogs.filter(x=>x.result===t).length,color:tossColors[t]})).filter(x=>x.count>0);
  const tossDonut=`<div class="tossPanel"><div class="donut" style="background:${donutStyle(tossItems)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${tossLogs.length}</div></div></div>${legendHtml(tossItems,tossLogs.length)}</div>`;
  const tossQuality=tossQualityStats(tossLogs);
  const tossQualityPanel=`<div class="tossQualityPanel">
    <div class="tossQualityMetric"><span>総トス</span><b>${tossQuality.total}</b><small>本</small></div>
    <div class="tossQualityMetric miss"><span>トスミス</span><b>${tossQuality.miss}</b><small>本</small></div>
    <div class="tossQualityMetric success"><span>トス成功率</span><b>${tossQuality.successRate}</b><small>%</small></div>
  </div>`;


  const currentAnalysis=currentMatchSetterAnalysis();
  const headerSetters=reportSetterNumbers();
  const headerIqItems=headerSetters.length>1
    ? headerSetters.slice(0,2).map((num,index)=>{const a=currentSetterAnalysisFor(num);return {label:`セッター${index+1} ${num}番`,iq:a.setterIq||0};})
    : null;
  const reportBrand=buildUnifiedReportBrandHeader(s,currentAnalysis,{iqItems:headerIqItems,actionsHtml:`<button class="backLink unifiedReportAction unifiedReportBack" onclick="returnToMatchFromReport()">← 試合入力に戻る</button><button class="pdfBtn unifiedReportAction unifiedReportExport" onclick="printMatchPdfReport()">PDF出力</button><button class="csvBtn unifiedReportAction unifiedReportExport" onclick="downloadCSV()">CSV出力</button>`});
  const dashboard=`${reportBrand}<div class="reportGrid">
    ${buildSetterDetailReports()}
    <section class="reportPanel teamAnalysisCard">
      <div class="teamAnalysisHeader"><div><span class="teamAnalysisEyebrow">TEAM REPORT</span><h2>チーム分析</h2></div><small>試合全体・プレー傾向・ローテーションをまとめて確認</small></div>
      <div class="playOverviewCard">
        <div class="playOverviewColumn playOverviewPlay"><h3>プレー割合 <small>（何をどれだけやったか）</small></h3>${playDonut}</div>
        <div class="playOverviewColumn playOverviewMetrics"><h3>試合指標</h3>${summary}</div>
        <div class="playOverviewColumn playOverviewResult"><h3>結果割合 <small>（プレーの結果）</small></h3>${resultBars}${teamAquilaAdvice}</div>
        <div class="playOverviewRotation"><h3>ローテーション別分析 <small>（成功率・得失点）</small></h3><div class="teamRotationList">${rotationRows}</div></div>
      </div>
    </section>
    <section class="reportPanel analysisMasterCard">
      <div class="analysisMasterHeader"><h2>分析</h2></div>
      <div class="analysisMasterBody">
        <div class="wideGrid singleReportWideGrid">
          <section class="reportPanel reportAccordion ${reportRankingsOpen?"isOpen":""}" id="personalRankingHost">
            <button class="reportAccordionToggle" type="button" onclick="toggleReportRankings()" aria-expanded="${reportRankingsOpen}">
              <span>各ランキング <small>（TOP3）</small></span><b>${reportRankingsOpen?"−":"＋"}</b>
            </button>
            ${reportRankingsOpen?`<div class="reportAccordionBody">${buildAllPersonalRankings()}</div>`:""}
          </section>
        </div>
        <div class="bottomGrid setterUnifiedBottomGrid">
          <section class="reportPanel reportAccordion ${reportRecentLogsOpen?"isOpen":""}">
            <button class="reportAccordionToggle" type="button" onclick="toggleReportRecentSection()" aria-expanded="${reportRecentLogsOpen}">
              <span>直近ログ</span><b>${reportRecentLogsOpen?"−":"＋"}</b>
            </button>
            ${reportRecentLogsOpen?`<div class="reportAccordionBody"><div class="reportAccordionSubhead">${reportRecentLogsExpanded?"最新20プレー":"最新5プレー"}</div>${buildRecentReportLogs()}</div>`:""}
          </section>
        </div>
      </div>
    </section>
  </div>`;
  const dash=document.getElementById("reportDashboard"); if(dash) dash.innerHTML=dashboard;
  const sub=document.getElementById("reportSub"); if(sub) sub.textContent=`${new Date().toLocaleDateString()}　vs ${s.oppTeam || "相手"}`;
}


/* V37.2: Analytics Enhancement - Setter Theory rule-based insights */
function v372ActionStats(){
  const cfgs=[
    {label:"サーブ", all:x=>x.type==="サーブ", ok:x=>x.type==="サーブ"&&(x.result==="成功"||x.result==="エース")},
    {label:"レセプ", all:x=>x.type==="レセプ", ok:x=>x.type==="レセプ"&&(x.result==="Aパス"||x.result==="Bパス"||x.result==="Cパス")},
    {label:"ディグ", all:x=>x.type==="ディグ", ok:x=>x.type==="ディグ"&&x.result==="成功"},
    {label:"スパイク", all:x=>x.type==="スパイク", ok:x=>x.type==="スパイク"&&x.result==="成功"},
    {label:"ブロック", all:x=>x.type==="ブロック", ok:x=>x.type==="ブロック"&&(x.result==="シャット"||x.result==="ワンタッチ")}
  ];
  return cfgs.map(c=>{ const all=s.logs.filter(c.all); const ok=s.logs.filter(c.ok); return {...c,total:all.length,ok:ok.length,pct:safePct(ok.length,all.length),eff:effectRate(all)}; });
}
function buildTossUsageAnalysis(){
  const toss=normalSetterTossLogs();
  const labels=["レフト","センター","ライト","バック","ツー"];
  return `<div class="v372TossList">${labels.map(label=>{
    const count=toss.filter(x=>x.result===label).length;
    const pct=safePct(count,toss.length);
    const warn=(label==="センター"&&toss.length>=5&&pct<=15)||(pct>=50&&count>=3);
    return `<div class="v372TossRow ${warn?'warn':''}"><div class="v372TossName">${label}</div><div class="v372TossTrack"><span style="width:${pct}%"></span></div><div class="v372TossPct">${pct}%<small>${count}本</small></div></div>`;
  }).join("")}</div>`;
}
function buildRotationPointAnalysis(){
  const rows=[1,2,3,4,5,6].map(r=>{
    const key="S"+r;
    const logs=s.logs.filter(x=>x.rot===key);
    const my=logs.filter(x=>x.point==="自").length;
    const op=logs.filter(x=>x.point==="相").length;
    const total=my+op;
    const diff=my-op;
    const gain=safePct(my,total);
    const toss=logs.filter(x=>x.type==="トス");
    const dist={}; toss.forEach(x=>{dist[x.result]=(dist[x.result]||0)+1;});
    const top=Object.entries(dist).sort((a,b)=>b[1]-a[1])[0];
    const topText=top?`${top[0]} ${safePct(top[1],toss.length)}%`:"-";
    return {key,my,op,total,diff,gain,topText};
  });
  const maxPoint=Math.max(1,...rows.flatMap(r=>[r.my,r.op]));
  return `<div class="v137DivergingBars">
    <div class="v137DivergingLegend"><span class="loss">← 失点</span><b>0</b><span class="gain">得点 →</span></div>
    ${rows.map(r=>{
      const lossWidth=(r.op/maxPoint)*50;
      const gainWidth=(r.my/maxPoint)*50;
      return `<div class="v137DivergingRow ${r.diff>0?'good':r.diff<0?'bad':''}">
        <div class="v137DivergingHead"><b>${r.key}</b><strong class="${r.diff>0?'positive':r.diff<0?'negative':'even'}">得失点差 ${r.diff>0?'+':''}${r.diff}</strong></div>
        <div class="v137DivergingChart">
          <div class="v137DivergingSide loss"><span style="width:${lossWidth}%"></span><em>${r.op}</em></div>
          <div class="v137DivergingAxis"></div>
          <div class="v137DivergingSide gain"><span style="width:${gainWidth}%"></span><em>${r.my}</em></div>
        </div>
        <div class="v137DivergingMeta"><span>失点 ${r.op}</span><span>得点率 ${r.gain}%</span><span>得点 ${r.my}</span></div>
        <small>最多トス先：${r.topText}</small>
      </div>`;
    }).join("")}
  </div>`;
}
function buildSetterInsight(){
  const toss=s.logs.filter(x=>x.type==="トス");
  const labels=["レフト","センター","ライト","バック","ツー"];
  const counts=labels.map(label=>{ const count=toss.filter(x=>x.result===label).length; return {label,count,pct:safePct(count,toss.length)}; });
  const top=counts.slice().sort((a,b)=>b.count-a.count)[0] || {label:"-",count:0,pct:0};
  const center=counts.find(x=>x.label==="センター") || {pct:0,count:0};
  const action=v372ActionStats();
  const low=action.filter(x=>x.total>=3).sort((a,b)=>a.pct-b.pct)[0];
  const rotRows=[1,2,3,4,5,6].map(r=>{const logs=s.logs.filter(x=>x.rot==="S"+r); return {r,my:logs.filter(x=>x.point==="自").length,op:logs.filter(x=>x.point==="相").length,total:logs.length};}).filter(x=>x.total>0);
  const worst=rotRows.slice().sort((a,b)=>(b.op-b.my)-(a.op-a.my))[0];
  const myPts=s.logs.filter(x=>x.point==="自").length, opPts=s.logs.filter(x=>x.point==="相").length;
  const comments=[];
  if(!s.logs.length){ comments.push("まだ記録がありません。1セット入力すると分析コメントが表示されます。"); }
  if(toss.length){
    if(top.pct>=50 && top.count>=3) comments.push(`${top.label}への配球が${top.pct}%です。相手ブロックに読まれやすいので、同じフォームから別方向を見せたいです。`);
    else comments.push("配球の偏りは大きくありません。次はローテ別の得失点差を見て、崩れる並びを探しましょう。");
    if(center.pct<=15 && toss.length>=5) comments.push(`センター使用率が${center.pct}%です。乱れた場面でもミドルを意識させると、サイドの決定率が上がる可能性があります。`);
  }else{
    comments.push("トス記録が少ないため配球分析はまだ弱いです。トス先を入れるとセッター視点のコメントが増えます。");
  }
  if(worst && worst.op>worst.my) comments.push(`S${worst.r}は得失点差が${worst.my-worst.op}です。サーブレシーブの入り方、1本目のトス先を確認しましょう。`);
  if(low && low.pct<50) comments.push(`${low.label}成功率が${low.pct}%です。試合後の振り返り優先度が高い項目です。`);
  if(myPts+opPts>=5){ comments.push(`得点 ${myPts} / 失点 ${opPts}。流れを見るときは、連続失点の直前のプレー種別を確認しましょう。`); }
  const tossSummary=counts.map(x=>`<div class="v372InsightChip"><span>${x.label}</span><b>${x.pct}%</b></div>`).join("");
  return `<div class="v37Insight v372Insight"><div class="v37InsightTitle">Setter Theory 分析コメント</div>
    <div class="v372InsightChips">${tossSummary}</div>
    <ul>${comments.map(x=>`<li>${x}</li>`).join("")}</ul>
  </div>`;
}

function downloadCSV(){
  const reportSetters=reportSetterNumbers();
  const analyses=Object.fromEntries(reportSetters.map((n,i)=>[String(n),{idx:i+1,a:currentSetterAnalysisFor(n)}]));
  const rows=[["No","Set","Rotation","Type","Number","Name","SecondBall","SetterRole","SetterIQ","SetterTossTotal","SetterTossMiss","SetterTossSuccessRate","SetterLeft","SetterCenter","SetterRight","SetterBack","SetterTwo","Position","Result","TossMiss","Point","Score","Time","PlayerId"]];
  s.logs.forEach(x=>{
    const d=analyses[String(x.num)];
    const a=d&&d.a;
    rows.push([x.no,x.set,x.rot,effectivePlayType(x),x.num,(x.playerNameSnapshot||getPlayerName(x.num)),effectivePlayType(x)==="二段トス"?"1":"0",d?`Setter${d.idx}`:"",a&&a.total?a.setterIq:"",a?a.quality.total:"",a?a.quality.miss:"",a?a.quality.successRate:"",a?a.counts['レフト']||0:"",a?a.counts['センター']||0:"",a?a.counts['ライト']||0:"",a?a.counts['バック']||0:"",a?a.counts['ツー']||0:"",x.pos,x.result,isTossMissLog(x)?"1":"0",x.point,x.score,x.time,(x.playerId||ensureStablePlayerId(x.playerNameSnapshot||getPlayerName(x.num),x.playerNumberSnapshot||x.num))]);
  });
  rows.push([]);
  rows.push(["Metadata","DataVersion",DATA_SCHEMA_VERSION,"UserId",s.userId||"","TeamId",s.teamId||"","MatchId",s.matchId||"","SetId",s.setId||"","SetterCount",reportSetters.length,"SetterNumbers",reportSetters.join("|")]);
  rows.push([]);
  rows.push(["SetterSummary","Role","Number","Name","IQ","TossTotal","TossMiss","SuccessRate","Left","Center","Right","Back","Two","PlayerId"]);
  reportSetters.forEach((n,i)=>{const a=currentSetterAnalysisFor(n);rows.push(["SetterSummary",`Setter${i+1}`,n,a.name,a.total?a.setterIq:"",a.quality.total,a.quality.miss,a.quality.successRate,a.counts['レフト']||0,a.counts['センター']||0,a.counts['ライト']||0,a.counts['バック']||0,a.counts['ツー']||0,playerIdForNumber(n)]);});
  rows.push([]);
  rows.push(["SecondBallSummary","Number","Name","Total","Left","Center","Right","Back","Two"]);
  secondBallAnalysis().players.forEach(p=>rows.push(["SecondBallSummary",p.num,p.name,p.total,p.counts["レフト"],p.counts["センター"],p.counts["ライト"],p.counts["バック"],p.counts["ツー"]]));
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="setter_theory_log.csv"; a.click();
}

function v46Percent(part,total){ return total ? Math.round(part/total*100) : 0; }
function v46PrintableRows(rows){
  if(!rows || !rows.length) return '<tr><td colspan="6">記録がありません。</td></tr>';
  return rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
}
function v46BuildSubstitutionRows(){
  const counts=s.substitutionCounts || {};
  const rows=Object.values(counts).sort((a,b)=>(b.count||0)-(a.count||0)).map(x=>[
    `${x.a}番 ⇄ ${x.b}番`, `${x.count||0}回`, x.lastScore || '-', x.lastRot || '-', x.lastTime || '-', ''
  ]);
  return v46PrintableRows(rows);
}
function printMatchPdfReport(){
  // V147: 試合レポート画面を基準にした統一PDFプレビュー。
  // 画面とPDFを別々に組み立てず、完成済みのレポートDOMを複製して印刷用に最適化する。
  const previousRankingsOpen=reportRankingsOpen;
  const previousRecentLogsOpen=reportRecentLogsOpen;
  const previousRecentLogsExpanded=reportRecentLogsExpanded;

  // PDFでは詳細項目を最初から展開する。
  reportRankingsOpen=true;
  reportRecentLogsOpen=true;
  reportRecentLogsExpanded=true;
  report();

  const source=document.getElementById('reportDashboard');
  if(!source){
    reportRankingsOpen=previousRankingsOpen;
    reportRecentLogsOpen=previousRecentLogsOpen;
    reportRecentLogsExpanded=previousRecentLogsExpanded;
    report();
    alert('試合レポートを作成できませんでした。');
    return;
  }

  const clone=source.cloneNode(true);
  // V150.22: cloneNodeではcanvasの描画内容が複製されないため、
  // プレビュー作成時点で元canvasを高品質PNGへ置換する。
  const sourcePreviewCanvases=source.querySelectorAll('canvas');
  const clonePreviewCanvases=clone.querySelectorAll('canvas');
  sourcePreviewCanvases.forEach((canvas,index)=>{
    try{
      const img=document.createElement('img');
      img.src=canvas.toDataURL('image/png');
      const rect=canvas.getBoundingClientRect();
      img.width=Math.max(1,Math.round(rect.width||canvas.width));
      img.height=Math.max(1,Math.round(rect.height||canvas.height));
      img.style.width=(rect.width||canvas.width)+'px';
      img.style.height=(rect.height||canvas.height)+'px';
      img.style.maxWidth='100%';
      img.style.objectFit='contain';
      img.className=(canvas.className?String(canvas.className)+' ':'')+'pdfCanvasImage';
      if(clonePreviewCanvases[index]) clonePreviewCanvases[index].replaceWith(img);
    }catch(e){}
  });
  // V150.22: conic-gradientの円グラフはiPadのPDF変換で消えることがあるため、
  // 凡例の割合と色からPDF専用SVGドーナツへ変換する。
  clone.querySelectorAll('.donut').forEach(donut=>{
    try{
      const panel=donut.closest('.donutWrap,.tossPanel')||donut.parentElement;
      const rows=[...(panel?panel.querySelectorAll('.legendRow'):[])];
      const segments=rows.map(row=>{
        const dot=row.querySelector('.dot');
        const spans=row.querySelectorAll('span');
        const text=spans.length?spans[spans.length-1].textContent:'';
        const match=String(text||'').match(/(\d+(?:\.\d+)?)%/);
        const pct=match?Math.max(0,Number(match[1])):0;
        const color=(dot&&dot.style&&(dot.style.background||dot.style.backgroundColor))||'#64748b';
        return {pct,color};
      }).filter(x=>x.pct>0);
      if(!segments.length)return;
      const total=segments.reduce((sum,x)=>sum+x.pct,0)||100;
      let offset=0;
      const polar=(angle,r)=>{
        const rad=(angle-90)*Math.PI/180;
        return {x:55+r*Math.cos(rad),y:55+r*Math.sin(rad)};
      };
      const ringPath=(start,end)=>{
        const outerR=41,innerR=23;
        const os=polar(start,outerR),oe=polar(end,outerR);
        const ie=polar(end,innerR),is=polar(start,innerR);
        const large=end-start>180?1:0;
        return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${innerR} ${innerR} 0 ${large} 0 ${is.x} ${is.y} Z`;
      };
      const circles=segments.length===1
        ? `<circle cx="55" cy="55" r="32" fill="none" stroke="${segments[0].color}" stroke-width="18"/>`
        : segments.map(seg=>{
            const length=seg.pct/total*360;
            const start=offset;
            const end=offset+length;
            offset=end;
            return `<path d="${ringPath(start,end)}" fill="${seg.color}"/>`;
          }).join('');
      const label=donut.querySelector('.donutCenter .label')?.textContent||'総数';
      const num=donut.querySelector('.donutCenter .num')?.textContent||'';
      const holder=document.createElement('div');
      holder.className='pdfDonutSvg';
      holder.innerHTML=`<svg viewBox="0 0 110 110" preserveAspectRatio="xMidYMid meet" role="img" aria-label="円グラフ"><g transform="rotate(-90 55 55)">${circles}</g><circle cx="55" cy="55" r="22" fill="#1e293b"/><text x="55" y="51" text-anchor="middle" font-size="8" font-weight="800" fill="#ffffff" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif">${label}</text><text x="55" y="64" text-anchor="middle" font-size="14" font-weight="900" fill="#ffffff" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif">${num}</text></svg>`;
      donut.replaceWith(holder);
    }catch(e){}
  });
  // 元画面と同じID・親構造を維持し、既存の完成済みCSSをPDFでも有効にする。
  clone.id='reportDashboard';
  clone.classList.add('pdfPreviewReport');

  // V150.141: PDFプレビュー／PDF印刷ではAquila Adviceを従来どおり全文表示する。
  clone.querySelectorAll('details.setterAdviceAccordion').forEach(details=>{
    const body=details.querySelector('.setterAquilaAdviceList');
    const full=document.createElement('div');
    full.className='setterMasterAdvice';
    full.innerHTML='<b>Aquila Advice</b>'+(body?body.outerHTML:'');
    details.replaceWith(full);
  });

  // PDFでは操作ボタン・開閉UI・選択UIを表示しない。
  clone.querySelectorAll('.unifiedReportAction,.reportAccordionToggle,.recentLogToggle,button').forEach(el=>el.remove());
  clone.querySelectorAll('select').forEach(select=>{
    const span=document.createElement('span');
    span.className='pdfSelectedValue';
    span.textContent=select.options[select.selectedIndex]?.textContent||'';
    select.replaceWith(span);
  });
  clone.querySelectorAll('[onclick],[onchange],[oninput]').forEach(el=>{
    el.removeAttribute('onclick');
    el.removeAttribute('onchange');
    el.removeAttribute('oninput');
  });

  // V150.18: PDF専用の固定ページ構成。画面側のレポートDOMは変更しない。
  const a4Root=document.createElement('div');
  a4Root.id='reportDashboard';
  a4Root.className='pdfA4Document';
  const makePage=(extra)=>{ const page=document.createElement('section'); page.className='pdfA4Page '+(extra||''); return page; };
  const appendPage=(node,extra)=>{ if(!node)return; const page=makePage(extra); page.appendChild(node.cloneNode(true)); a4Root.appendChild(page); };
  const brand=clone.querySelector('.unifiedReportBrand');
  const setterCards=[...clone.querySelectorAll('.setterAnalysisUnit')];
  // V150.22: PDFではラベルを外側に配置した専用レーダーへ差し替える。
  const pdfSetterNumbers=reportSetterNumbers();
  setterCards.forEach((card,index)=>{
    // V150.82: 各カード自身に埋め込んだセッター番号を最優先する。
    // 試合入力中でもセッター②を表示順・一時状態に依存させない。
    const embeddedNum=String(card.dataset.setterNumber||'').trim();
    const num=embeddedNum || pdfSetterNumbers[index] || setterNumbers()[index];
    if(!num)return;
    const analysis=currentSetterAnalysisFor(num);
    const radar=card.querySelector('.setterMasterRadar');
    if(radar) radar.innerHTML=buildSetterIqRadarChartPdf(iqBreakdown20(analysis));

    // V150.82: PDFプレビューのセッター①/②円グラフを、元画面のDOM状態に依存せず
    // セッター別集計データから直接再構築する。試合入力中と保存試合で同じ表示になる。
    const tossHost=card.querySelector('.setterAnalysisTossCard .setterMasterDonut');
    // V150.104: 元DOMの凡例を引き継がず、セッター①・②とも集計データから必ず再構築する。
    // 項目名・本数・％は各要素へ直接インライン指定し、PDFプレビュー／印刷変換時の
    // 全体CSSやiPadの色補正に上書きされないようにする。
    if(tossHost){
      const colorMap={'レフト':'#ef4444','センター':'#2563eb','ライト':'#22c55e','バック':'#f59e0b','ツー':'#0f172a','未分類':'#64748b'};
      const items=(analysis.items||[]).filter(item=>Number(item.count)>0);
      const total=items.reduce((sum,item)=>sum+Number(item.count||0),0);
      if(total>0){
        let offset=0;
        const polar=(angle,r)=>{
          const rad=(angle-90)*Math.PI/180;
          return {x:55+r*Math.cos(rad),y:55+r*Math.sin(rad)};
        };
        const ringPath=(start,end)=>{
          const outerR=41,innerR=23;
          const os=polar(start,outerR),oe=polar(end,outerR);
          const ie=polar(end,innerR),is=polar(start,innerR);
          const large=end-start>180?1:0;
          return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} L ${ie.x} ${ie.y} A ${innerR} ${innerR} 0 ${large} 0 ${is.x} ${is.y} Z`;
        };
        const paths=items.length===1
          ? `<circle cx="55" cy="55" r="32" fill="none" stroke="${colorMap[items[0].label]||'#64748b'}" stroke-width="18"/>`
          : items.map(item=>{
              const length=Number(item.count||0)/total*360;
              const start=offset,end=offset+length;
              offset=end;
              return `<path d="${ringPath(start,end)}" fill="${colorMap[item.label]||'#64748b'}"/>`;
            }).join('');
        const whiteStyle="color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif!important;";
        const legend=items.map(item=>{
          const pct=Math.round(Number(item.count||0)/total*100);
          return `<div class="legendRow" style="${whiteStyle}display:grid!important;grid-template-columns:8px minmax(0,1fr) auto!important;gap:3px!important;align-items:center!important"><i class="dot" style="display:block;width:7px;height:7px;border-radius:50%;background:${colorMap[item.label]||'#64748b'}"></i><span style="${whiteStyle}">${escapeHtml(item.label)}</span><span style="${whiteStyle}">${item.count}本&nbsp;${pct}%</span></div>`;
        }).join('');
        tossHost.innerHTML=`<div class="setterMasterChartTitle" style="${whiteStyle}">トス配分</div><div class="tossPanel"><div class="pdfDonutSvg"><svg viewBox="0 0 110 110" preserveAspectRatio="xMidYMid meet" role="img" aria-label="円グラフ"><g transform="rotate(-90 55 55)">${paths}</g><circle cx="55" cy="55" r="22" fill="#1e293b"/><text x="55" y="51" text-anchor="middle" font-size="8" font-weight="800" fill="#ffffff" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;fill:#ffffff">総数</text><text x="55" y="64" text-anchor="middle" font-size="14" font-weight="900" fill="#ffffff" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;fill:#ffffff">${total}</text></svg></div><div class="legend" style="${whiteStyle}">${legend}</div></div>`;
      }else{
        tossHost.innerHTML='<div class="setterMasterChartTitle">トス配分</div><div class="v141SetterNoData">トス記録がありません</div>';
      }
    }
  });

  // 1ページ目：PDFにだけ表示する表紙。
  const cover=makePage('pdfCoverPage');
  cover.innerHTML=`<div class="pdfCoverInner">
    <div class="pdfCoverKicker">MATCH ANALYSIS REPORT</div>
    <div class="pdfCoverTitle">Setter Theory</div>
    <div class="pdfCoverRule"></div>
    <div class="pdfCoverSubtitle">試合分析レポート</div>
    <div class="pdfCoverMeta">${(document.getElementById('reportSub')?.textContent||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</div>
    <div class="pdfCoverSummary"></div>
    <div class="pdfCoverVersion">V150.141</div>
  </div>`;
  const coverSummary=cover.querySelector('.pdfCoverSummary');
  if(brand && coverSummary){
    const brandClone=brand.cloneNode(true);
    brandClone.querySelectorAll('.unifiedReportAction,button').forEach(el=>el.remove());
    coverSummary.appendChild(brandClone);
  }
  a4Root.appendChild(cover);

  // 2ページ目：セッター分析①。
  if(setterCards[0]) appendPage(setterCards[0],'pdfSetterPage pdfSetterPageOne');
  // 3ページ目：セッター分析②。ツーセッター時のみ追加。
  if(setterCards[1]) appendPage(setterCards[1],'pdfSetterPage pdfSetterPageTwo');
  // 4ページ目：チーム分析。
  appendPage(clone.querySelector('.teamAnalysisCard'),'pdfTeamPage');
  // 5ページ目：ランキングと直近ログを1つの「分析」カードへ統合する。
  const finalPage=makePage('pdfFinalPage');
  const finalGrid=document.createElement('div');
  finalGrid.className='pdfFinalGrid';
  const rankings=clone.querySelector('.singleReportWideGrid');
  const recentLogs=clone.querySelector('.setterUnifiedBottomGrid');
  if(rankings || recentLogs){
    const analysisOuter=document.createElement('section');
    analysisOuter.className='pdfFinalOuterCard pdfAnalysisOuterCard';
    analysisOuter.style.cssText='display:grid;grid-template-rows:auto 54mm minmax(0,1fr);gap:6px;width:100%;max-width:100%;height:100%;max-height:100%;min-height:0;box-sizing:border-box;padding:0;background:#0f172a;border:1px solid rgba(96,165,250,.34);border-radius:16px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
    const analysisTitle=document.createElement('h2');
    analysisTitle.className='pdfAnalysisTitle';
    analysisTitle.innerHTML='<span class="pdfAnalysisEyebrow" style="display:block;color:#fff;-webkit-text-fill-color:#fff;font-size:11px;line-height:1;font-weight:900;letter-spacing:.16em;">ANALYSIS</span><span class="pdfAnalysisJapanese" style="display:block;color:#fff;-webkit-text-fill-color:#fff;font-size:20px;line-height:1.05;font-weight:900;letter-spacing:.05em;">分析</span>';
    analysisTitle.style.cssText='display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;margin:0;padding:10px 14px 8px;box-sizing:border-box;background:linear-gradient(135deg,#0f172a,#172554);border-bottom:1px solid rgba(255,255,255,.14);color:#fff;-webkit-text-fill-color:#fff;';
    analysisOuter.appendChild(analysisTitle);
    if(rankings){
      const rankSection=document.createElement('section');
      rankSection.className='pdfAnalysisSection pdfRankingsSection pdfAnalysisSmallCard';
      rankSection.style.cssText='background:#1e293b;border:1px solid rgba(96,165,250,.32);border-radius:14px;padding:7px;box-shadow:none;box-sizing:border-box;overflow:hidden;';
      const rankTitle=document.createElement('h3');
      rankTitle.className='pdfFinalSectionTitle';
      rankTitle.textContent='ランキング';
      rankSection.appendChild(rankTitle);
      const rankClone=rankings.cloneNode(true);
      rankClone.classList.add('pdfRankingsBlock');
      // V150.82: singleReportWideGrid自身が2列グリッドになり、唯一の子要素が左半分へ寄るのを防ぐ。
      // 外側は全幅、内側のランキング5項目は試合レポート画面と同じ2列配置にする。
      rankClone.style.setProperty('display','block','important');
      rankClone.style.setProperty('width','100%','important');
      rankClone.style.setProperty('max-width','100%','important');
      const rankPanel=rankClone.querySelector('.reportPanel');
      if(rankPanel){
        rankPanel.style.setProperty('display','block','important');
        rankPanel.style.setProperty('width','100%','important');
        rankPanel.style.setProperty('max-width','100%','important');
      }
      const allRanks=rankClone.querySelector('.allRankingsGrid');
      if(allRanks){
        allRanks.style.setProperty('display','grid','important');
        allRanks.style.setProperty('grid-template-columns','repeat(6,minmax(0,1fr))','important');
        allRanks.style.setProperty('gap','6px','important');
        allRanks.style.setProperty('width','100%','important');
        allRanks.style.setProperty('max-width','100%','important');
        Array.from(allRanks.children).forEach((card,index)=>{
          card.style.setProperty('grid-column','span 2','important');
          card.style.setProperty('width','auto','important');
          card.style.setProperty('min-width','0','important');
          card.style.setProperty('box-sizing','border-box','important');
        });
      }
      rankSection.appendChild(rankClone);
      analysisOuter.appendChild(rankSection);
    }
    if(recentLogs){
      const logSection=document.createElement('section');
      logSection.className='pdfAnalysisSection pdfRecentLogsSection pdfRecentLogsOuterCard pdfAnalysisSmallCard';
      logSection.style.cssText='background:#1e293b;border:1px solid rgba(96,165,250,.32);border-radius:14px;padding:12px;box-shadow:0 7px 18px rgba(2,6,23,.14);';
      const logTitle=document.createElement('h3');
      logTitle.className='pdfFinalSectionTitle';
      logTitle.textContent='直近ログ';
      logSection.appendChild(logTitle);
      const logClone=recentLogs.cloneNode(true);
      logClone.classList.add('pdfRecentLogsBlock');
      logSection.appendChild(logClone);
      analysisOuter.appendChild(logSection);
    }
    finalGrid.appendChild(analysisOuter);
  }
  if(finalGrid.children.length){ finalPage.appendChild(finalGrid); a4Root.appendChild(finalPage); }

  // V150.69: html2pdf.js creates its own detached rendering clone, so CSS selectors
  // that depend on the #report ancestor may be lost. Apply the requested parent
  // surface colors directly to the PDF DOM before it is serialized.
  const parentSurfaceColor='#2f394b';
  a4Root.querySelectorAll(
    '.pdfSetterPage .setterAnalysisUnitBody,'+
    '.pdfSetterPage .setterMasterCard,'+
    '.pdfTeamPage .teamAnalysisCard,'+
    '.pdfTeamPage .teamAnalysisCard > .playOverviewCard,'+
    '.pdfFinalPage .pdfAnalysisOuterCard'
  ).forEach(el=>{
    el.style.setProperty('background',parentSurfaceColor,'important');
    el.style.setProperty('background-color',parentSurfaceColor,'important');
  });

  // V150.69: align every visible small card with the approved dark PDF-preview theme.
  // Also force the final analysis parent card to occupy the full printable width.
  const smallCardColor='#1e293b';
  a4Root.querySelectorAll(
    '.pdfSetterPage .setterAnalysisSubcard,'+
    '.pdfSetterPage .setterMasterTop,'+
    '.pdfSetterPage .setterMasterRadar,'+
    '.pdfSetterPage .setterMasterMiddleColumn,'+
    '.pdfSetterPage .setterMasterRotation,'+
    '.pdfTeamPage .playOverviewPlay,'+
    '.pdfTeamPage .playOverviewMetrics,'+
    '.pdfTeamPage .playOverviewResult,'+
    '.pdfTeamPage .playOverviewRotation,'+
    '.pdfFinalPage .compactRankCard,'+
    '.pdfFinalPage .reportPanel,'+
    '.pdfFinalPage .recentLogItem,'+
    '.pdfFinalPage .timelineItem,'+
    '.pdfFinalPage .timelineRow'
  ).forEach(el=>{
    el.style.setProperty('background',smallCardColor,'important');
    el.style.setProperty('background-color',smallCardColor,'important');
    el.style.setProperty('border-color','rgba(96,165,250,.32)','important');
  });
  const analysisOuter=a4Root.querySelector('.pdfFinalPage .pdfAnalysisOuterCard');
  const analysisGrid=a4Root.querySelector('.pdfFinalPage .pdfFinalGrid');
  if(analysisGrid){
    // V150.117: PDF/print detached clone can lose ancestor-dependent CSS.
    // The old two-column .pdfFinalGrid made the single analysis card occupy only the left column.
    analysisGrid.style.setProperty('display','block','important');
    analysisGrid.style.setProperty('grid-template-columns','minmax(0,1fr)','important');
    analysisGrid.style.setProperty('width','100%','important');
    analysisGrid.style.setProperty('max-width','100%','important');
    analysisGrid.style.setProperty('min-width','0','important');
  }
  if(analysisOuter){
    analysisOuter.style.setProperty('display','grid','important');
    analysisOuter.style.setProperty('grid-template-rows','auto auto minmax(0,1fr)','important');
    analysisOuter.style.setProperty('gap','6px','important');
    analysisOuter.style.setProperty('width','100%','important');
    analysisOuter.style.setProperty('max-width','100%','important');
    analysisOuter.style.setProperty('height','100%','important');
    analysisOuter.style.setProperty('max-height','100%','important');
    analysisOuter.style.setProperty('min-height','0','important');
    analysisOuter.style.setProperty('background',parentSurfaceColor,'important');
  }
  // V150.82: ランキング・直近ログの小カード外枠は透明化しない。
  // 内側の複製ブロックだけを透明にして、親の小カード背景を残す。
  a4Root.querySelectorAll('.pdfFinalPage .pdfAnalysisSection').forEach(el=>{
    el.style.setProperty('display','block','important');
    el.style.setProperty('width','100%','important');
    el.style.setProperty('max-width','100%','important');
    el.style.setProperty('background',smallCardColor,'important');
    el.style.setProperty('background-color',smallCardColor,'important');
    el.style.setProperty('border','1px solid rgba(96,165,250,.32)','important');
    el.style.setProperty('border-radius','14px','important');
    el.style.setProperty('padding','12px','important');
    el.style.setProperty('overflow','hidden','important');
  });
  a4Root.querySelectorAll('.pdfFinalPage .pdfRankingsBlock,.pdfFinalPage .pdfRecentLogsBlock,.pdfFinalPage .singleReportWideGrid,.pdfFinalPage .setterUnifiedBottomGrid').forEach(el=>{
    el.style.setProperty('width','100%','important');
    el.style.setProperty('max-width','100%','important');
    el.style.setProperty('background','transparent','important');
    el.style.setProperty('background-color','transparent','important');
  });

  const styleHtml=[...document.querySelectorAll('style,link[rel="stylesheet"]')]
    .map(el=>el.outerHTML).join('\n');
  const title=`Setter Theory PDFプレビュー`;
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styleHtml}<title>${title}</title>
  <style>
    @page{size:A4 landscape;margin:7mm}
    *{box-sizing:border-box}
    html,body{margin:0!important;background:#eef2f7!important;color:#0f172a;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}
    .pdfPreviewTopbar{position:sticky;top:0;z-index:2147483646;pointer-events:auto!important;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#0f172a;color:#fff;box-shadow:0 3px 12px rgba(15,23,42,.25)}
    .pdfPreviewTopbar b{font-size:14px}.pdfPreviewTopbar div{display:flex;gap:8px}
    .pdfPreviewTopbar button{pointer-events:auto!important;position:relative!important;z-index:2147483647!important;border:0;border-radius:9px;padding:9px 13px;font-weight:900;cursor:pointer;background:#f4b63f;color:#111827}
    .pdfPreviewTopbar button.secondary{background:#334155;color:#fff}
    .pdfPreviewSheet{width:min(1120px,calc(100% - 24px));margin:16px auto;background:#fff;padding:16px;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.15)}
    #report #reportDashboard{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important}
    #report #reportDashboard .unifiedReportBrand{margin-top:0!important}
    #report #reportDashboard .unifiedReportRight{min-width:0!important}
    #report #reportDashboard .reportAccordionBody{display:block!important}
    #report #reportDashboard .reportAccordion{overflow:visible!important}
    #report #reportDashboard .pdfSelectedValue{display:inline-block;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;padding:5px 8px;font-size:11px;font-weight:800;color:#334155}
    #report #reportDashboard .pdfPageStart{break-before:page;page-break-before:always;margin-top:0!important}
    #report #reportDashboard .setterIqAdvicePerson,#report #reportDashboard .pdfRankCard{break-inside:avoid;page-break-inside:avoid}
    #report #reportDashboard canvas,#report #reportDashboard svg{max-width:100%!important}
    #report{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;background:#fff!important;color:#0f172a!important;overflow:visible!important}
    #report #reportDashboard,#report #reportDashboard *{min-width:0}
    #report #reportDashboard .setterMasterGrid.two{grid-template-columns:1fr!important}
    #report #reportDashboard .setterMasterCard,#report #reportDashboard .teamAnalysisCard,#report #reportDashboard .reportPanel,#report #reportDashboard .singleReportWideGrid{width:100%!important;max-width:100%!important;overflow:visible!important}
    #report #reportDashboard .setterMasterChartTitle{color:#fff!important;text-shadow:0 1px 2px rgba(0,0,0,.35)!important}
    #report #reportDashboard .teamAnalysisCard>.playOverviewCard{display:grid!important;grid-template-columns:1fr!important;grid-template-rows:auto!important;gap:12px!important;padding:12px!important}
    #report #reportDashboard .teamAnalysisCard .playOverviewPlay,#report #reportDashboard .teamAnalysisCard .playOverviewMetrics,#report #reportDashboard .teamAnalysisCard .playOverviewResult,#report #reportDashboard .teamAnalysisCard .playOverviewResultPoint,#report #reportDashboard .teamAnalysisCard .playOverviewRotation{grid-column:1!important;grid-row:auto!important;width:100%!important;margin:0!important;padding:10px!important;border:0!important;border-top:1px solid rgba(148,163,184,.25)!important}
    #report #reportDashboard .teamAnalysisCard .playOverviewPlay{border-top:0!important}
    #report #reportDashboard .teamAnalysisCard .playOverviewResultSection,#report #reportDashboard .teamAnalysisCard .playOverviewPointSection{display:block!important;width:100%!important;height:auto!important}
    #report #reportDashboard .teamAnalysisCard .teamRotationList{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}
    #report #reportDashboard table{width:100%!important;max-width:100%!important;table-layout:fixed!important}
    #report #reportDashboard th,#report #reportDashboard td{overflow-wrap:anywhere!important;word-break:break-word!important}
    #report #reportDashboard img{max-width:100%!important;height:auto}
    .pdfPreviewSheet{width:297mm!important;max-width:calc(100% - 16px)!important;padding:0!important;overflow:visible!important}
    #reportDashboard.pdfA4Document{display:block!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important}
    .pdfA4Page{display:block!important;position:relative!important;width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding:7mm!important;background:#fff!important;break-before:page;page-break-before:always}
    .pdfA4Page:first-child{break-before:auto;page-break-before:auto}
    .pdfCoverPage{height:190mm!important;min-height:190mm!important;padding:12mm 16mm!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}
    .pdfCoverInner{position:relative!important;width:100%!important;height:100%!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;border:2px solid #0f172a!important;border-radius:18px!important;padding:12mm!important;background:linear-gradient(145deg,#ffffff 0%,#f8fafc 58%,#e2e8f0 100%)!important}
    .pdfCoverKicker{font-size:12px!important;font-weight:900!important;letter-spacing:.28em!important;color:#64748b!important;margin-bottom:4mm!important}
    .pdfCoverTitle{font-size:40px!important;line-height:1!important;font-weight:1000!important;letter-spacing:.02em!important;color:#0f172a!important}
    .pdfCoverRule{width:72mm!important;height:2px!important;background:#f4b63f!important;margin:6mm auto 4mm!important}
    .pdfCoverSubtitle{font-size:20px!important;font-weight:900!important;color:#334155!important}
    .pdfCoverMeta{font-size:13px!important;font-weight:800!important;color:#475569!important;margin-top:4mm!important}
    .pdfCoverSummary{width:min(235mm,92%)!important;margin-top:9mm!important}
    .pdfCoverSummary .unifiedReportBrand{box-shadow:none!important;border:1px solid #cbd5e1!important;background:rgba(255,255,255,.88)!important}
    .pdfCoverVersion{position:absolute!important;right:9mm!important;bottom:7mm!important;font-size:10px!important;font-weight:900!important;color:#64748b!important}
    .pdfFinalGrid{display:grid!important;grid-template-columns:1.15fr .85fr!important;gap:7mm!important;align-items:start!important;width:100%!important}
    .pdfFinalGrid .singleReportWideGrid,.pdfFinalGrid .setterUnifiedBottomGrid{display:block!important;width:100%!important;margin:0!important}
    .pdfA4Page>*{width:100%!important;max-width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;margin:0!important;transform:none!important;overflow:visible!important}
    .pdfA4Page .setterMasterHeaderRow{display:grid!important;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr)!important;gap:10px!important}
    .pdfA4Page .setterMasterIqAdviceCard{display:grid!important;grid-template-columns:minmax(145px,.7fr) minmax(0,1.3fr)!important;gap:10px!important}
    .pdfA4Page .setterMasterBottomGrid{display:grid!important;grid-template-columns:minmax(0,.9fr) minmax(0,1.05fr) minmax(0,1.05fr)!important;gap:10px!important;align-items:start!important}
    .pdfA4Page .setterMasterRadar,.pdfA4Page .setterMasterMiddleColumn,.pdfA4Page .setterMasterRotation{width:100%!important;max-width:100%!important;overflow:visible!important}
    .pdfTeamPage .playOverviewCard{display:block!important;width:100%!important;height:auto!important;overflow:visible!important}
    .pdfTeamPage .playOverviewColumn,.pdfTeamPage .playOverviewRotation{display:block!important;position:static!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;margin:0 0 10px!important;padding:10px!important}
    .pdfTeamPage .teamRotationList{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
    /* V148.1: A4幅を超える固定幅・最小幅を解除し、内容量に応じて自然に複数ページへ流す */
    .pdfA4Document,.pdfA4Page,.pdfA4Page *{box-sizing:border-box!important}
    .pdfA4Page .setterAnalysisUnit,.pdfA4Page .setterAnalysisUnitBody,.pdfA4Page .setterMasterCard,.pdfA4Page .setterMasterHeaderRow,.pdfA4Page .setterMasterBottomGrid,.pdfA4Page .setterMasterRadar,.pdfA4Page .setterMasterMiddleColumn,.pdfA4Page .setterMasterRotation,.pdfA4Page .teamAnalysisCard,.pdfA4Page .playOverviewCard,.pdfA4Page .singleReportWideGrid,.pdfA4Page .setterUnifiedBottomGrid{width:100%!important;max-width:100%!important;min-width:0!important;height:auto!important;max-height:none!important;overflow:visible!important}
    .pdfA4Page .singleReportWideGrid,.pdfA4Page .setterUnifiedBottomGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
    .pdfA4Page .setterMasterHeaderRow>*,.pdfA4Page .setterMasterBottomGrid>*,.pdfA4Page .singleReportWideGrid>*,.pdfA4Page .setterUnifiedBottomGrid>*{width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important}
    .pdfA4Page canvas,.pdfA4Page svg{display:block!important;max-width:100%!important;height:auto!important;margin-left:auto!important;margin-right:auto!important}
    .pdfA4Page table{width:100%!important;max-width:100%!important;table-layout:fixed!important}
    .pdfA4Page th,.pdfA4Page td{white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}
    /* V149: A4横向き専用。画面レポートの横構成を保ちながら用紙幅へ収める */
    .pdfA4Page .setterAnalysisUnit,.pdfA4Page .setterMasterCard,.pdfTeamPage .teamAnalysisCard{font-size:92%!important}
    .pdfA4Page .setterMasterRadar canvas,.pdfA4Page .setterMasterRadar svg{max-height:250px!important}
    .pdfA4Page .setterMasterMiddleColumn canvas,.pdfA4Page .setterMasterMiddleColumn svg{max-height:230px!important}
    .pdfA4Page .setterMasterRotation{overflow:visible!important}
    .pdfA4Page .setterMasterRotation table{font-size:10px!important}
    .pdfTeamPage .playOverviewCard{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)!important;gap:10px!important;align-items:start!important}
    .pdfTeamPage .playOverviewRotation{grid-column:1/-1!important}
    @media print{
      html,body{background:#fff!important;width:auto!important;min-height:0!important}
      body *{visibility:visible!important}
      #csvAnalysisBox{display:none!important}
      .pdfPreviewTopbar{display:none!important}
      .pdfPreviewSheet{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;border-radius:0;box-shadow:none;overflow:visible!important}
      #report,#report #reportDashboard,#reportDashboard.pdfA4Document{display:block!important;position:static!important;width:100%!important;max-width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;transform:none!important}
      #report #reportDashboard{font-size:82%;position:static!important;transform:none!important;box-sizing:border-box!important}.pdfA4Page{box-sizing:border-box!important;padding:1mm 3mm!important;width:calc(100% - 6mm)!important;max-width:calc(100% - 6mm)!important;margin-left:auto!important;margin-right:auto!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;break-before:page!important;page-break-before:always!important}.pdfA4Page:first-child{break-before:auto!important;page-break-before:auto!important}.pdfA4Page .reportPanel,.pdfA4Page .setterMasterCard,.pdfA4Page .teamAnalysisCard,.pdfA4Page .pdfRankCard{padding-top:6px!important;padding-bottom:6px!important}.pdfA4Page h1,.pdfA4Page h2,.pdfA4Page h3,.pdfA4Page h4,.pdfA4Page p{margin-top:2px!important;margin-bottom:2px!important;line-height:1.12!important}.pdfA4Page .reportGrid>* ,#report #reportDashboard .setterMasterGrid>*{margin-bottom:3mm!important}.pdfA4Page canvas,.pdfA4Page svg{max-height:205px!important}
      #report #reportDashboard .reportGrid,#report #reportDashboard .setterMasterGrid{display:block!important;width:100%!important;height:auto!important;overflow:visible!important}#report #reportDashboard .singleReportWideGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7mm!important;width:100%!important;height:auto!important;overflow:visible!important}
      #report #reportDashboard .reportGrid>* ,#report #reportDashboard .setterMasterGrid>*{width:100%!important;max-width:100%!important;margin:0 0 6mm!important}#report #reportDashboard .singleReportWideGrid>*{width:100%!important;max-width:100%!important;margin:0!important}
      #report #reportDashboard .reportPanel,#report #reportDashboard .setterMasterCard,#report #reportDashboard .teamAnalysisCard,#report #reportDashboard .singleReportWideGrid{display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;box-shadow:none!important;break-inside:auto!important;page-break-inside:auto!important}
      #report #reportDashboard .playOverviewPlay,#report #reportDashboard .playOverviewMetrics,#report #reportDashboard .playOverviewResult,#report #reportDashboard .playOverviewResultPoint,#report #reportDashboard .playOverviewRotation,#report #reportDashboard .setterIqAdvicePerson,#report #reportDashboard .pdfRankCard,#report #reportDashboard tr{break-inside:avoid!important;page-break-inside:avoid!important}
      #report #reportDashboard .setterAnalysisUnit,#report #reportDashboard .setterAnalysisUnitBody,#report #reportDashboard .setterMasterCard{break-inside:auto!important;page-break-inside:auto!important}
      #report #reportDashboard .pdfPageStart{break-before:page!important;page-break-before:always!important}
      #report #reportDashboard [style*="overflow"]{overflow:visible!important}
      #report #reportDashboard canvas,#report #reportDashboard svg,#report #reportDashboard img{max-width:100%!important;break-inside:avoid!important;page-break-inside:avoid!important}
      #report #reportDashboard .teamAnalysisCard{break-inside:auto!important;page-break-inside:auto!important}
      #report #reportDashboard .singleReportWideGrid{break-inside:auto!important;page-break-inside:auto!important}
      #report #reportDashboard *{max-width:100%!important;min-width:0!important}
      #report #reportDashboard .setterMasterHeaderRow{display:grid!important;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr)!important;gap:4mm!important;width:100%!important}#report #reportDashboard .setterMasterBottomGrid{display:grid!important;grid-template-columns:minmax(0,.9fr) minmax(0,1.05fr) minmax(0,1.05fr)!important;gap:4mm!important;width:100%!important}#report #reportDashboard .singleReportWideGrid,#report #reportDashboard .setterUnifiedBottomGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4mm!important;width:100%!important}
      #report #reportDashboard .setterMasterHeaderRow>*,#report #reportDashboard .setterMasterBottomGrid>*,#report #reportDashboard .singleReportWideGrid>*,#report #reportDashboard .setterUnifiedBottomGrid>*{display:block!important;width:100%!important;max-width:100%!important;margin:0!important}
    }
    /* V150.18 PDF layout corrections */
    .pdfPreviewSheet{width:297mm!important;max-width:calc(100% - 16px)!important;margin:12px auto!important}
    #reportDashboard.pdfA4Document{width:297mm!important;max-width:297mm!important;margin:0!important;padding:0!important;background:#fff!important}
    .pdfA4Page{box-sizing:border-box!important;width:289mm!important;max-width:289mm!important;height:196mm!important;min-height:196mm!important;max-height:196mm!important;margin:0 auto!important;padding:4mm!important;overflow:hidden!important;break-before:auto!important;page-break-before:auto!important;break-after:page!important;page-break-after:always!important;background:#fff!important}
    .pdfA4Page:last-child{break-after:auto!important;page-break-after:auto!important}
    .pdfCoverPage{display:flex!important;align-items:center!important;justify-content:center!important;height:196mm!important;min-height:196mm!important;max-height:196mm!important;padding:9mm 14mm!important}
    .pdfCoverInner{width:100%!important;height:100%!important;min-height:0!important;justify-content:center!important;padding:8mm 12mm!important}
    .pdfCoverSummary{width:88%!important;max-width:245mm!important;margin:8mm auto 0!important}

    /* White-on-white text correction */
    .pdfSetterPage .setterMasterCard,.pdfTeamPage .teamAnalysisCard,.pdfFinalPage{color:#172033!important}
    .pdfSetterPage .setterMasterCard *,.pdfTeamPage .teamAnalysisCard *,.pdfFinalPage *{text-shadow:none!important}
    .pdfSetterPage .setterMasterName,.pdfSetterPage .setterMasterName *,
    .pdfSetterPage .setterMasterRadar,.pdfSetterPage .setterMasterRadar *,
    .pdfSetterPage .setterMasterMiddleColumn,.pdfSetterPage .setterMasterMiddleColumn *,
    .pdfSetterPage .setterMasterRotation,.pdfSetterPage .setterMasterRotation *,
    .pdfTeamPage .playOverviewPlay,.pdfTeamPage .playOverviewPlay *,
    .pdfTeamPage .playOverviewMetrics,.pdfTeamPage .playOverviewMetrics *,
    .pdfTeamPage .playOverviewRotation,.pdfTeamPage .playOverviewRotation *,
    .pdfFinalPage .reportPanel,.pdfFinalPage .reportPanel *{color:#172033!important}
    .pdfSetterPage .setterAnalysisHeader,.pdfSetterPage .setterAnalysisHeader *,
    .pdfTeamPage .teamAnalysisHeader,.pdfTeamPage .teamAnalysisHeader *,
    .pdfSetterPage .setterMasterIqAdviceCard,.pdfSetterPage .setterMasterIqAdviceCard *,
    .pdfTeamPage .teamAquilaAdvice,.pdfTeamPage .teamAquilaAdvice *{color:#fff!important}
    .pdfSetterPage .setterTheoryEvaluationRank,.pdfSetterPage .setterTheoryEvaluationIq b{color:inherit!important}
    .pdfA4Page canvas,.pdfA4Page svg,.pdfA4Page img{opacity:1!important;visibility:visible!important}
    .pdfSetterPage .setterMasterRadar canvas,.pdfSetterPage .setterMasterRadar img,
    .pdfTeamPage canvas,.pdfTeamPage canvas+img,.pdfTeamPage .donut{filter:contrast(1.18) brightness(.86)!important}

    /* Setter pages: keep all information inside one sheet */
    .pdfSetterPage{font-size:72%!important}
    .pdfSetterPage .setterAnalysisHeader{padding:8px 12px!important;min-height:0!important}
    .pdfSetterPage .setterAnalysisHeader h2{font-size:22px!important}
    .pdfSetterPage .setterMasterCard{padding:8px!important;height:166mm!important;max-height:166mm!important;overflow:hidden!important}
    .pdfSetterPage .setterMasterHeaderRow{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)!important;gap:6px!important}
    .pdfSetterPage .setterMasterIqAdviceCard{gap:6px!important;padding:7px!important}
    .pdfSetterPage .setterMasterBottomGrid{grid-template-columns:minmax(0,.8fr) minmax(0,1fr) minmax(0,1.2fr)!important;gap:6px!important;margin-top:5px!important}
    .pdfSetterPage .setterMasterRadar canvas,.pdfSetterPage .setterMasterRadar svg,.pdfSetterPage .setterMasterRadar img{max-height:190px!important}
    .pdfSetterPage .setterMasterMiddleColumn canvas,.pdfSetterPage .setterMasterMiddleColumn svg,.pdfSetterPage .setterMasterMiddleColumn img{max-height:165px!important}
    .pdfSetterPage .setterMasterRotation{font-size:88%!important}
    .pdfSetterPage h3,.pdfSetterPage h4,.pdfSetterPage p{line-height:1.08!important;margin-top:1px!important;margin-bottom:1px!important}

    /* Team analysis: 3-column top + six compact rotation cards */
    .pdfTeamPage{font-size:68%!important}
    .pdfTeamPage .teamAnalysisHeader{padding:7px 12px!important}
    .pdfTeamPage .teamAnalysisHeader h2{font-size:22px!important}
    .pdfTeamPage .teamAnalysisCard{height:188mm!important;max-height:188mm!important;overflow:hidden!important;padding:0!important}
    .pdfTeamPage .playOverviewCard{display:grid!important;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr) minmax(0,1fr)!important;grid-template-rows:auto auto!important;gap:6px!important;padding:7px!important;height:164mm!important;overflow:hidden!important}
    .pdfTeamPage .playOverviewColumn{padding:6px!important;margin:0!important;min-height:0!important;overflow:hidden!important}
    .pdfTeamPage .playOverviewRotation{grid-column:1/-1!important;padding:5px!important;margin:0!important;overflow:hidden!important}
    .pdfTeamPage .teamRotationList{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:4px!important}
    .pdfTeamPage .teamRotationRow{display:block!important;padding:4px!important;min-height:0!important}
    .pdfTeamPage .teamRotationLabel{font-size:12px!important;margin-bottom:2px!important}
    .pdfTeamPage .teamRotationSuccessHead,.pdfTeamPage .teamRotationPointCounts{font-size:9px!important;gap:2px!important;flex-wrap:wrap!important}
    .pdfTeamPage .teamRotationPoints strong{display:block!important;font-size:9px!important;margin-top:2px!important}
    .pdfTeamPage .donut{width:105px!important;height:105px!important;min-width:105px!important}
    .pdfTeamPage h3{font-size:13px!important;margin:0 0 4px!important}
    .pdfTeamPage p{line-height:1.08!important;margin:1px 0!important}
    .pdfTeamPage .teamAquilaAdvice{padding:6px!important;margin-top:5px!important;font-size:90%!important}

    /* V150.22 visibility and sharpness corrections */
    .pdfCoverSummary,.pdfCoverSummary *{opacity:1!important;visibility:visible!important;text-shadow:none!important}
    .pdfCoverSummary .unifiedReportBrand{background:#fff!important;border:1.5px solid #94a3b8!important}
    .pdfCoverSummary .unifiedReportEyebrow,.pdfCoverSummary .unifiedReportEyebrow *,
    .pdfCoverSummary .unifiedReportTitle,.pdfCoverSummary .unifiedReportTitle *,
    .pdfCoverSummary .unifiedReportMeta,.pdfCoverSummary .unifiedReportMeta *,
    .pdfCoverSummary .unifiedReportRight,.pdfCoverSummary .unifiedReportRight *{color:#172033!important}
    .pdfCoverSummary svg,.pdfCoverSummary img{opacity:1!important;filter:none!important}

    .pdfSetterPage .setterMasterName,.pdfSetterPage .setterMasterName small,
    .pdfSetterPage .setterMasterName h3{display:block!important;color:#0f172a!important;opacity:1!important;visibility:visible!important}
    .pdfSetterPage .setterMasterName h3{font-size:22px!important;line-height:1.15!important;margin:2px 0!important}
    .pdfSetterPage .setterMasterRadar{overflow:visible!important;padding:2px 8px 8px!important}
    .pdfSetterPage .pdfSetterIqRadar{width:100%!important;max-width:100%!important;overflow:visible!important}
    .pdfSetterPage .pdfSetterIqRadar svg{width:100%!important;height:210px!important;max-height:210px!important;overflow:visible!important}
    .pdfSetterPage .radarLabels text,.pdfSetterPage .radarLabels tspan{fill:#0f172a!important;color:#0f172a!important;font-size:13px!important;font-weight:900!important;opacity:1!important}
    .pdfSetterPage .radarGrid polygon,.pdfSetterPage .radarGrid line{stroke:#94a3b8!important;stroke-width:1.2!important;opacity:1!important}
    .pdfSetterPage .radarData{fill:rgba(124,58,237,.30)!important;stroke:#7c3aed!important;stroke-width:2.5!important;opacity:1!important}
    .pdfSetterPage .radarDots circle{fill:#7c3aed!important;stroke:#fff!important;stroke-width:1.5!important}

    .pdfTeamPage .playOverviewPlay,.pdfTeamPage .playOverviewMetrics,.pdfTeamPage .playOverviewResult,
    .pdfTeamPage .playOverviewResultPoint,.pdfTeamPage .playOverviewRotation{font-size:86%!important}
    .pdfTeamPage .playOverviewMetrics h3{display:block!important;visibility:visible!important;opacity:1!important;color:#0f172a!important;font-size:12px!important;margin:0 0 4px!important}
    .pdfTeamPage .donutWrap,.pdfTeamPage .tossPanel{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:7px!important;overflow:visible!important}
    .pdfTeamPage .donut{display:block!important;width:82px!important;height:82px!important;min-width:82px!important;min-height:82px!important;max-width:82px!important;max-height:82px!important;opacity:1!important;visibility:visible!important;filter:none!important}
    .pdfTeamPage .donutCenter{width:50%!important;height:50%!important}
    .pdfTeamPage .donutCenter .label{font-size:8px!important}.pdfTeamPage .donutCenter .num{font-size:13px!important}
    .pdfTeamPage .legend,.pdfTeamPage .legend *{font-size:8px!important;line-height:1.15!important;color:#172033!important}
    .pdfTeamPage .metricRow,.pdfTeamPage .metricRow *{font-size:9px!important}
    .pdfA4Page .pdfCanvasImage{display:block!important;opacity:1!important;visibility:visible!important;image-rendering:auto!important;filter:none!important}

    /* V150.22: PDF配色とSVG円グラフを最終段で固定 */
    .pdfA4Page .pdfDonutSvg{display:block!important;width:82px!important;height:82px!important;min-width:82px!important;flex:0 0 82px!important;overflow:visible!important}
    .pdfA4Page .pdfDonutSvg svg{display:block!important;width:100%!important;height:100%!important;max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important}
    .pdfCoverPage .unifiedReportBrand,.pdfCoverPage .unifiedReportBrand *{color:#0f172a!important}
    .pdfSetterPage .setterMasterName,.pdfSetterPage .setterMasterName *,
    .pdfSetterPage .setterMasterRadar,.pdfSetterPage .setterMasterRadar *,
    .pdfSetterPage .setterMasterMiddleColumn,.pdfSetterPage .setterMasterMiddleColumn *,
    .pdfSetterPage .setterMasterRotation,.pdfSetterPage .setterMasterRotation *,
    .pdfTeamPage .playOverviewColumn,.pdfTeamPage .playOverviewColumn *,
    .pdfTeamPage .playOverviewRotation,.pdfTeamPage .playOverviewRotation *{color:#0f172a!important}
    .pdfSetterPage .setterAnalysisHeader,.pdfSetterPage .setterAnalysisHeader *,
    .pdfTeamPage .teamAnalysisHeader,.pdfTeamPage .teamAnalysisHeader *{color:#fff!important}
    .pdfSetterPage .setterMasterIqAdviceCard,.pdfSetterPage .setterMasterIqAdviceCard *,
    .pdfTeamPage .teamAquilaAdvice,.pdfTeamPage .teamAquilaAdvice *,
    .pdfTeamPage .teamAquilaAdviceTitle,.pdfTeamPage .teamAquilaAdviceTitle *,
    .pdfTeamPage .teamAquilaAdviceList,.pdfTeamPage .teamAquilaAdviceList *{color:#f8fafc!important}
    .pdfSetterPage .setterMasterIqAdviceCard small,
    .pdfTeamPage .teamAquilaAdvice small{color:#e2e8f0!important}
    .pdfTeamPage .playOverviewMetrics h3{color:#0f172a!important;display:block!important;opacity:1!important;visibility:visible!important}

    /* V150.22: visible radar labels, numeric values, and unclipped donut charts */
    .pdfSetterPage .pdfSetterIqRadar{display:block!important;width:100%!important;min-height:238px!important;overflow:visible!important;background:#fff!important}
    .pdfSetterPage .pdfSetterIqRadar svg{display:block!important;width:100%!important;height:238px!important;max-height:238px!important;overflow:visible!important}
    .pdfSetterPage .pdfSetterIqRadar .radarGrid polygon{fill:none!important;stroke:#94a3b8!important;stroke-width:1.4!important}
    .pdfSetterPage .pdfSetterIqRadar .radarGrid line{stroke:#cbd5e1!important;stroke-width:1.2!important}
    .pdfSetterPage .pdfSetterIqRadar .radarData{fill:rgba(37,99,235,.22)!important;stroke:#2563eb!important;stroke-width:3!important}
    .pdfSetterPage .pdfSetterIqRadar .radarDots circle{fill:#1d4ed8!important;stroke:#fff!important;stroke-width:2!important}
    .pdfSetterPage .pdfSetterIqRadar .radarLabels text,
    .pdfSetterPage .pdfSetterIqRadar .radarLabels tspan{opacity:1!important;visibility:visible!important;text-shadow:none!important}

    .pdfA4Page .pdfDonutSvg{box-sizing:content-box!important;width:78px!important;height:78px!important;min-width:78px!important;flex:0 0 78px!important;padding:4px!important;overflow:visible!important}
    .pdfA4Page .pdfDonutSvg svg{width:78px!important;height:78px!important;max-width:none!important;max-height:none!important;overflow:visible!important}
    .pdfTeamPage .donutWrap,.pdfTeamPage .tossPanel{padding:4px!important;overflow:visible!important;align-items:center!important}

    /* White/light surfaces: make every label and value readable */
    .pdfA4Page .summaryCard *,
    .pdfA4Page .metricCard *,
    .pdfA4Page .playOverviewMetrics *,
    .pdfA4Page .playOverviewPlay *,
    .pdfA4Page .playOverviewResultPoint *,
    .pdfA4Page .playOverviewRotation *,
    .pdfA4Page .setterMasterRadar *,
    .pdfA4Page .setterMasterMiddleColumn *,
    .pdfA4Page .setterMasterRotation *,
    .pdfA4Page .setterTheoryEvaluation *,
    .pdfA4Page .compactRankCard *,
    .pdfA4Page .timelineItem *,
    .pdfA4Page table *{opacity:1!important;visibility:visible!important}
    .pdfA4Page .summaryCard,
    .pdfA4Page .metricCard,
    .pdfA4Page .playOverviewMetrics,
    .pdfA4Page .playOverviewPlay,
    .pdfA4Page .playOverviewResultPoint,
    .pdfA4Page .playOverviewRotation,
    .pdfA4Page .setterMasterRadar,
    .pdfA4Page .setterMasterMiddleColumn,
    .pdfA4Page .setterMasterRotation,
    .pdfA4Page .compactRankCard,
    .pdfA4Page .timelineItem,
    .pdfA4Page table{color:#0f172a!important}
    .pdfA4Page .summaryCard b,.pdfA4Page .summaryCard strong,.pdfA4Page .summaryCard .num,
    .pdfA4Page .metricCard b,.pdfA4Page .metricCard strong,.pdfA4Page .metricCard .num,
    .pdfA4Page .playOverviewMetrics b,.pdfA4Page .playOverviewMetrics strong,.pdfA4Page .playOverviewMetrics .num,
    .pdfA4Page .playOverviewPlay b,.pdfA4Page .playOverviewPlay strong,.pdfA4Page .playOverviewPlay .num,
    .pdfA4Page .playOverviewResultPoint b,.pdfA4Page .playOverviewResultPoint strong,.pdfA4Page .playOverviewResultPoint .num,
    .pdfA4Page .playOverviewRotation b,.pdfA4Page .playOverviewRotation strong,.pdfA4Page .playOverviewRotation .num,
    .pdfA4Page .setterMasterMiddleColumn b,.pdfA4Page .setterMasterMiddleColumn strong,.pdfA4Page .setterMasterMiddleColumn .num,
    .pdfA4Page .setterMasterRotation b,.pdfA4Page .setterMasterRotation strong,.pdfA4Page .setterMasterRotation .num{color:#0f172a!important;text-shadow:none!important}
    .pdfA4Page .summaryCard small,.pdfA4Page .metricCard small,
    .pdfA4Page .playOverviewMetrics small,.pdfA4Page .playOverviewPlay small,
    .pdfA4Page .playOverviewResultPoint small,.pdfA4Page .playOverviewRotation small,
    .pdfA4Page .setterMasterMiddleColumn small,.pdfA4Page .setterMasterRotation small{color:#475569!important}
    /* Keep genuine dark panels white */
    .pdfA4Page .setterAnalysisHeader *,
    .pdfA4Page .teamAnalysisHeader *,
    .pdfA4Page .setterMasterAdvice *,
    .pdfA4Page .teamAquilaAdvice *,
    .pdfA4Page .teamAquilaAdviceList *{color:#f8fafc!important}

    /* Rankings + latest 20 plays */
    .pdfFinalPage{font-size:68%!important;padding:5mm!important}
    .pdfFinalGrid{display:grid!important;grid-template-columns:minmax(0,1.65fr) minmax(0,.85fr)!important;gap:6px!important;height:186mm!important;max-height:186mm!important;overflow:hidden!important}
    .pdfFinalGrid .pdfRankingsBlock,.pdfFinalGrid .pdfRecentLogsBlock{display:block!important;width:100%!important;height:100%!important;max-height:100%!important;overflow:hidden!important;margin:0!important}
    .pdfFinalGrid .reportPanel{padding:7px!important;height:100%!important;overflow:hidden!important;background:#fff!important}
    .pdfFinalGrid .reportAccordionBody{display:block!important;height:auto!important;overflow:visible!important}
    .pdfFinalGrid .allRankingsGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important}
    .pdfFinalGrid .compactRankCard{padding:6px!important;margin:0!important;min-height:0!important;overflow:hidden!important;background:#e5e7eb!important;border-radius:9px!important}
    .pdfFinalGrid .compactRankCard h4{font-size:12px!important;margin:0 0 4px!important;color:#172033!important}
    .pdfFinalGrid .compactRankRow{display:grid!important;grid-template-columns:16px minmax(0,1.4fr) minmax(44px,.8fr) 34px 28px!important;gap:3px!important;align-items:center!important;min-width:0!important;padding:2px 0!important;font-size:9px!important;color:#172033!important}
    .pdfFinalGrid .compactRankName{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#172033!important}
    .pdfFinalGrid .compactRankTrack{min-width:0!important;width:100%!important}
    .pdfFinalGrid .timeline{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:3px!important;margin-top:4px!important}
    .pdfFinalGrid .timelineItem{display:grid!important;grid-template-columns:22px 22px minmax(0,1fr)!important;gap:3px!important;align-items:center!important;padding:3px 4px!important;min-width:0!important;background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:6px!important;color:#172033!important}
    .pdfFinalGrid .timelineNo,.pdfFinalGrid .timelineText{font-size:9px!important;color:#172033!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .pdfFinalGrid .timelineIcon{width:18px!important;height:18px!important;line-height:18px!important;font-size:10px!important}
    .pdfFinalGrid .logLegend{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:3px!important;margin-top:5px!important;font-size:9px!important;color:#172033!important}
    .pdfFinalGrid .reportAccordionSubhead{font-size:11px!important;font-weight:900!important;color:#172033!important;margin-bottom:3px!important}



    /* V150.25: force the PDF team layout to match the normal report (3 columns + rotation row) */
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      display:grid!important;
      grid-template-columns:minmax(0,.82fr) minmax(0,1.05fr) minmax(0,1.05fr)!important;
      grid-template-rows:minmax(0,1fr) auto!important;
      gap:7px!important;
      width:100%!important;
      height:164mm!important;
      max-height:164mm!important;
      padding:7px!important;
      overflow:hidden!important;
      align-items:stretch!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewPlay{
      grid-column:1!important;grid-row:1!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewMetrics{
      grid-column:2!important;grid-row:1!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResult{
      grid-column:3!important;grid-row:1!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewRotation{
      grid-column:1/-1!important;grid-row:2!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewPlay,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResult,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewRotation{
      display:block!important;
      position:relative!important;
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      height:100%!important;
      max-height:none!important;
      margin:0!important;
      padding:7px!important;
      overflow:hidden!important;
      border:1px solid #cbd5e1!important;
      border-radius:10px!important;
      background:#fff!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playMetricRow{
      display:grid!important;
      grid-template-columns:58px minmax(0,1fr)!important;
      gap:5px!important;
      align-items:center!important;
      width:100%!important;
      min-width:0!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playMetricSingle{
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playMetricStack{
      width:100%!important;
      max-width:100%!important;
      height:8px!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .teamRotationList{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:6px!important;
      width:100%!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .teamRotationRow{
      min-width:0!important;
      padding:6px 8px!important;
    }

    @media(max-width:760px){.pdfPreviewSheet{width:100%;margin:0;padding:8px;border-radius:0}.pdfPreviewTopbar{padding:8px}.pdfPreviewTopbar b{font-size:12px}.pdfPreviewTopbar button{padding:8px 10px;font-size:12px}}




    /* V150.24: match the PDF preview team-analysis layout to the normal report */
    .pdfTeamPage .teamAnalysisCard{height:188mm!important;max-height:188mm!important;overflow:hidden!important;background:#f8fafc!important}
    .pdfTeamPage .playOverviewCard{
      display:grid!important;
      grid-template-columns:minmax(0,.78fr) minmax(0,1.25fr) minmax(0,.9fr) minmax(0,1.08fr)!important;
      grid-template-rows:1fr!important;
      gap:7px!important;
      height:164mm!important;
      max-height:164mm!important;
      padding:7px!important;
      overflow:hidden!important;
      align-items:stretch!important;
      background:#f8fafc!important;
    }
    .pdfTeamPage .playOverviewPlay{grid-column:1!important;grid-row:1!important}
    .pdfTeamPage .playOverviewMetrics{grid-column:2!important;grid-row:1!important}
    .pdfTeamPage .playOverviewResult{grid-column:3!important;grid-row:1!important}
    .pdfTeamPage .playOverviewRotation{grid-column:4!important;grid-row:1!important}
    .pdfTeamPage .playOverviewColumn,
    .pdfTeamPage .playOverviewRotation{
      box-sizing:border-box!important;
      min-width:0!important;
      width:100%!important;
      height:100%!important;
      margin:0!important;
      padding:7px!important;
      overflow:hidden!important;
      border:1px solid #cbd5e1!important;
      border-radius:10px!important;
      background:#fff!important;
      color:#0f172a!important;
    }
    .pdfTeamPage .playOverviewColumn h3,
    .pdfTeamPage .playOverviewRotation h3{margin:0 0 5px!important;color:#0f172a!important;font-size:11px!important;line-height:1.18!important;white-space:normal!important}
    .pdfTeamPage .playOverviewColumn h3 small,
    .pdfTeamPage .playOverviewRotation h3 small{color:#475569!important;font-size:7.5px!important}

    .pdfTeamPage .playOverviewPlay .donutWrap{display:flex!important;flex-direction:column!important;align-items:center!important;gap:6px!important;padding:2px!important;overflow:visible!important}
    .pdfTeamPage .playOverviewPlay .pdfDonutSvg{width:92px!important;height:92px!important;min-width:92px!important;padding:2px!important}
    .pdfTeamPage .playOverviewPlay .pdfDonutSvg svg{width:92px!important;height:92px!important}
    .pdfTeamPage .playOverviewPlay .legend{display:grid!important;grid-template-columns:1fr!important;gap:3px!important;width:100%!important;margin:0!important}
    .pdfTeamPage .playOverviewPlay .legend>div{display:grid!important;grid-template-columns:7px minmax(0,1fr) auto!important;gap:3px!important;align-items:center!important;min-width:0!important;font-size:7.5px!important;line-height:1.08!important}
    .pdfTeamPage .playOverviewPlay .legend span,.pdfTeamPage .playOverviewPlay .legend b,.pdfTeamPage .playOverviewPlay .legend strong,.pdfTeamPage .playOverviewPlay .legend small{color:#0f172a!important;white-space:nowrap!important}

    .pdfTeamPage .playMetricAnalysis{display:grid!important;gap:4px!important}
    .pdfTeamPage .playMetricRow{display:grid!important;grid-template-columns:62px minmax(0,1fr)!important;gap:5px!important;align-items:center!important;min-width:0!important;margin:0!important}
    .pdfTeamPage .playMetricName{display:grid!important;grid-template-columns:6px minmax(0,1fr)!important;gap:3px!important;align-items:center!important;min-width:0!important}
    .pdfTeamPage .playMetricName b,.pdfTeamPage .playMetricName small{font-size:7.2px!important;color:#0f172a!important;white-space:nowrap!important}
    .pdfTeamPage .playMetricSingle{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important}
    .pdfTeamPage .playMetricStack{width:100%!important;max-width:100%!important;height:8px!important;border-radius:999px!important;overflow:hidden!important;background:#e2e8f0!important}
    .pdfTeamPage .playMetricLegend{display:grid!important;grid-template-columns:1fr 1fr!important;grid-template-areas:"success failure" "effect effect"!important;gap:1px 3px!important;min-width:0!important;line-height:1.02!important}
    .pdfTeamPage .playMetricLegend .success{grid-area:success!important}.pdfTeamPage .playMetricLegend .failure{grid-area:failure!important}.pdfTeamPage .playMetricLegend strong{grid-area:effect!important;text-align:right!important}
    .pdfTeamPage .playMetricLegend span,.pdfTeamPage .playMetricLegend strong{font-size:6.7px!important;color:#0f172a!important;white-space:nowrap!important}

    .pdfTeamPage .playOverviewResult{display:block!important}
    .pdfTeamPage .v146ResultOneBar{margin:0 0 7px!important;padding:0!important;min-width:0!important}
    .pdfTeamPage .v146ResultOneBarTrack{height:10px!important;margin:0 0 5px!important;overflow:hidden!important;border-radius:999px!important;background:#e2e8f0!important}
    .pdfTeamPage .v146ResultOneBarLegend{display:grid!important;grid-template-columns:1fr!important;gap:3px!important;min-width:0!important}
    .pdfTeamPage .v146ResultOneBarLegend>div{display:grid!important;grid-template-columns:6px minmax(0,1fr) auto auto!important;gap:3px!important;align-items:center!important;min-width:0!important}
    .pdfTeamPage .v146ResultOneBarLegend span,.pdfTeamPage .v146ResultOneBarLegend strong,.pdfTeamPage .v146ResultOneBarLegend small{font-size:7px!important;color:#0f172a!important;white-space:nowrap!important}
    .pdfTeamPage .v146ResultOneBarTotal{font-size:7px!important;color:#475569!important;text-align:right!important;margin-top:2px!important}
    .pdfTeamPage .teamAquilaAdvice{display:block!important;margin:7px 0 0!important;padding:6px!important;min-width:0!important;overflow:hidden!important;border-radius:9px!important;background:#0f1b33!important}
    .pdfTeamPage .teamAquilaAdviceTitle{margin:0 0 4px!important}.pdfTeamPage .teamAquilaAdviceTitle img{width:18px!important;height:18px!important}.pdfTeamPage .teamAquilaAdviceTitle b{font-size:9px!important;color:#fff!important}
    .pdfTeamPage .teamAquilaAdviceList{display:grid!important;grid-template-columns:1fr!important;gap:3px!important}
    .pdfTeamPage .teamAquilaAdviceList>div{display:block!important;min-width:0!important}.pdfTeamPage .teamAquilaAdviceList strong{display:block!important;font-size:6.8px!important;color:#fff!important;margin-bottom:1px!important}.pdfTeamPage .teamAquilaAdviceList p{font-size:6.8px!important;line-height:1.12!important;margin:0!important;color:#f8fafc!important;overflow-wrap:anywhere!important}

    .pdfTeamPage .playOverviewRotation{padding:6px!important;min-height:0!important}
    .pdfTeamPage .teamRotationList{display:grid!important;grid-template-columns:1fr!important;gap:4px!important;min-width:0!important}
    .pdfTeamPage .teamRotationRow{display:block!important;min-width:0!important;padding:5px!important;margin:0!important;border:1px solid #e2e8f0!important;border-radius:7px!important;background:#f8fafc!important;overflow:hidden!important}
    .pdfTeamPage .teamRotationLabel{font-size:10px!important;color:#0f172a!important;margin:0 0 2px!important}.pdfTeamPage .teamRotationSuccessHead{display:grid!important;grid-template-columns:auto auto 1fr!important;gap:3px!important;align-items:center!important;font-size:6.8px!important;color:#0f172a!important}.pdfTeamPage .teamRotationSuccessHead small{text-align:right!important;color:#475569!important}.pdfTeamPage .teamRotationTrack{height:6px!important;margin:2px 0!important;overflow:hidden!important}.pdfTeamPage .teamRotationPointCounts{display:flex!important;justify-content:space-between!important;gap:3px!important;font-size:6.8px!important;color:#0f172a!important}.pdfTeamPage .teamRotationPoints strong{display:block!important;margin-top:1px!important;font-size:6.8px!important;text-align:right!important;color:#0f172a!important;white-space:nowrap!important}

    /* V150.22: PDF preview horizontal alignment correction */
    .pdfPreviewSheet{box-sizing:border-box!important;width:297mm!important;max-width:calc(100vw - 16px)!important;margin:12px auto!important;padding:0!important;overflow-x:hidden!important}
    #reportDashboard.pdfA4Document{box-sizing:border-box!important;display:block!important;position:relative!important;left:0!important;width:297mm!important;max-width:100%!important;margin:0 auto!important;padding:0!important;transform:none!important;overflow:hidden!important}
    #reportDashboard.pdfA4Document>.pdfA4Page{box-sizing:border-box!important;position:relative!important;left:0!important;width:100%!important;max-width:100%!important;margin:0!important;padding-left:4mm!important;padding-right:4mm!important;transform:none!important;overflow:hidden!important}
    #reportDashboard.pdfA4Document>.pdfA4Page>*{box-sizing:border-box!important;position:relative!important;left:0!important;width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:none!important}
    .pdfA4Page .setterAnalysisUnit,.pdfA4Page .setterMasterCard,.pdfA4Page .teamAnalysisCard,.pdfA4Page .playOverviewCard,.pdfA4Page .singleReportWideGrid,.pdfA4Page .setterUnifiedBottomGrid,.pdfA4Page .pdfFinalGrid{box-sizing:border-box!important;position:relative!important;left:0!important;right:auto!important;width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:none!important}
    .pdfCoverInner{box-sizing:border-box!important;left:0!important;width:100%!important;max-width:100%!important;margin-left:auto!important;margin-right:auto!important;padding-left:10mm!important;padding-right:10mm!important;text-align:center!important;transform:none!important}
    .pdfCoverSummary{width:100%!important;max-width:250mm!important;margin-left:auto!important;margin-right:auto!important}

    /* V150.26: unify analysis backgrounds and remove outer white frames */
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard{
      background:#eef2f7!important;
      border:1px solid #d7e0eb!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      background:#eef2f7!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewPlay,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResult,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewRotation{
      background:#f8fafc!important;
      border-color:#d8e1ec!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid .pdfRankingsBlock>.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid .pdfRecentLogsBlock>.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid .reportPanel{
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
      border-radius:0!important;
    }
    /* V150.27: final visual override — match team-analysis surface to setter-analysis and remove ranking/log outer cards */
    #report #reportDashboard.pdfA4Document .pdfTeamPage,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      background:#eef2f7!important;
      border-color:#dbeafe!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewColumn,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewPlay,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResult,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewRotation{
      background:#eef2f7!important;
      border-color:#dbeafe!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfFinalGrid{
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock>.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock>.reportPanel{
      background:transparent!important;
      border:0!important;
      outline:0!important;
      box-shadow:none!important;
      border-radius:0!important;
    }
    /* V150.28: keep the ranking/log section cards, remove only the small white item frames */
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock.reportPanel,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock.reportPanel{
      background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(30,41,59,.90))!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      padding:9px!important;
      color:#f8fafc!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankCard{
      background:transparent!important;
      border:0!important;
      outline:0!important;
      box-shadow:none!important;
      border-radius:0!important;
      padding:6px 4px!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankCard h4,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankName,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow strong{color:#f8fafc!important;}
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow small{color:#cbd5e1!important;}
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankCard+.compactRankCard{border-top:1px solid rgba(148,163,184,.18)!important;}
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineItem{
      background:transparent!important;
      border:0!important;
      outline:0!important;
      box-shadow:none!important;
      border-radius:0!important;
      border-bottom:1px solid rgba(148,163,184,.18)!important;
      padding:4px 2px!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineNo,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineText,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .logLegend,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .reportAccordionSubhead{color:#f8fafc!important;}

    /* V150.29: unify every analysis section background with the setter-analysis surface */
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard>.playOverviewCard,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock{
      background:#eef2f7!important;
      border:1px solid #dbeafe!important;
      border-radius:18px!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewPlay,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResult,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewResultPoint,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard .playOverviewRotation{
      background:transparent!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineItem{
      background:transparent!important;
      border-left:0!important;
      border-right:0!important;
      border-top:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankCard h4,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankName,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow strong,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineNo,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .timelineText,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .logLegend,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .reportAccordionSubhead{color:#0f172a!important;}
    #report #reportDashboard.pdfA4Document .pdfFinalPage .compactRankRow small{color:#475569!important;}


    /* V150.30: actual PDF-preview target. Keep every analysis page on the same setter-analysis surface. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{background:#eef2f7!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock{
      background:#eef2f7!important;border-color:#dbeafe!important;box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem{
      background:transparent!important;border:0!important;border-bottom:1px solid rgba(100,116,139,.22)!important;border-radius:0!important;box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard:last-child,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem:last-child{border-bottom:0!important;}
    /* V150.31: apply the setter-analysis dark surface to the actual inner panels. */
    #report #reportDashboard.pdfA4Document > .pdfTeamPage,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{
      background:#0f172a!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard>.playOverviewCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewColumn,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewPlay,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResultPoint,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .reportPanel{
      background:#2f394b!important;
      border-color:rgba(203,213,225,.28)!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem{
      background:transparent!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard{
      border:0!important;
      border-bottom:1px solid rgba(203,213,225,.22)!important;
      border-radius:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem{
      border:0!important;
      border-bottom:1px solid rgba(203,213,225,.22)!important;
      border-radius:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard:last-child,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem:last-child{
      border-bottom:0!important;
    }

    /* V150.33: PDF preview surfaces and inner-frame cleanup. */
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewColumn,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewPlay,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResultPoint,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .reportPanel{
      border-color:rgba(148,163,184,.18)!important;
      outline:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .recentLogItem{
      background:transparent!important;
      border-left:0!important;
      border-right:0!important;
      border-top:0!important;
      border-radius:0!important;
      outline:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem{
      border-bottom:1px solid rgba(148,163,184,.16)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard:last-child,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem:last-child{
      border-bottom:0!important;
    }

    /* V150.33: only the PDF preview. Keep outer cards, remove only inner ranking/log frames. */
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock .compactRankCard,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock .compactRankRow,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRankingsBlock [class*="rankItem"],
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock .timelineItem,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock .timelineRow,
    #report #reportDashboard.pdfA4Document .pdfFinalPage .pdfRecentLogsBlock .recentLogItem {
      background:transparent!important;
      border:0!important;
      outline:0!important;
      border-radius:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .teamAnalysisCard {
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document .pdfTeamPage .playOverviewMetrics .metricBar,
    #report #reportDashboard.pdfA4Document .pdfTeamPage .playOverviewMetrics .barTrack {
      max-width:360px!important;
    }



    /* V150.34: final PDF-only team/final-page styling. */
    #report #reportDashboard.pdfA4Document > .pdfTeamPage,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid{
      background:#2f394b!important;
      border:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      display:grid!important;
      grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr) minmax(0,1fr)!important;
      grid-template-rows:auto auto!important;
      gap:10px!important;
      width:100%!important;
      height:164mm!important;
      padding:10px!important;
      background:#2f394b!important;
      border:0!important;
      box-shadow:none!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewPlay{grid-column:1!important;grid-row:1!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics{grid-column:2!important;grid-row:1!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult{grid-column:3!important;grid-row:1!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation{
      grid-column:1 / -1!important;
      grid-row:2!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewColumn,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewPlay,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResultPoint,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation{
      background:#2f394b!important;
      border:0!important;
      outline:0!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics .v136ResultBarTrack,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics .metricBar,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics .barTrack{
      width:100%!important;
      max-width:330px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .reportPanel{
      background:#2f394b!important;
      border:1px solid rgba(203,213,225,.22)!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock .compactRankRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock .timelineItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock .timelineRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock .recentLogItem{
      background:transparent!important;
      border:0!important;
      outline:0!important;
      border-radius:0!important;
      box-shadow:none!important;
    }


    /* V150.37: keep ranking and recent-log navy backgrounds inside their existing outer cards only. */
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{
      background:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
      padding:0!important;
      background:transparent!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
      overflow:hidden!important;
      border-radius:16px!important;
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock > *,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock > *{
      box-sizing:border-box!important;
      max-width:100%!important;
    }

    /* V150.36: keep the navy background inside the existing team-analysis card only. */
    #report #reportDashboard.pdfA4Document > .pdfTeamPage{
      background:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
      overflow:hidden!important;
      border-radius:16px!important;
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
      overflow:hidden!important;
      border-radius:inherit!important;
    }


    /* V150.38: add explicit outer cards for rankings and recent logs. */
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:12px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalOuterCard{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin:0!important;
      padding:12px!important;
      overflow:hidden!important;
      border:1px solid rgba(203,213,225,.28)!important;
      border-radius:16px!important;
      background:#2f394b!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalOuterCard > .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalOuterCard > .pdfRecentLogsBlock{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      margin:0!important;
      padding:0!important;
      overflow:visible!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalOuterCard .reportPanel{
      box-sizing:border-box!important;
      max-width:100%!important;
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
    }



    /* V150.40: place the latest 20 plays in one horizontal row inside the PDF card. */
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard{
      padding:8px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .reportPanel{
      height:100%!important;
      max-height:100%!important;
      min-height:0!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .reportPanel{
      padding:4px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .reportAccordionSubhead{
      margin:0 0 3px!important;
      font-size:9px!important;
      line-height:1.05!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .timeline{
      display:grid!important;
      grid-template-columns:repeat(20,minmax(0,1fr))!important;
      grid-auto-flow:column!important;
      gap:2px!important;
      width:100%!important;
      max-width:100%!important;
      margin-top:2px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .timelineItem{
      display:grid!important;
      grid-template-columns:1fr!important;
      grid-template-rows:auto auto auto!important;
      justify-items:center!important;
      align-content:start!important;
      gap:1px!important;
      min-width:0!important;
      min-height:0!important;
      padding:2px 1px!important;
      line-height:1!important;
      text-align:center!important;
      border-bottom:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .timelineNo{
      width:100%!important;
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      font-size:6px!important;
      line-height:1!important;
      opacity:.78!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .timelineText{
      width:100%!important;
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      font-size:5.5px!important;
      line-height:1!important;
      text-align:center!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .timelineIcon{
      width:13px!important;
      height:13px!important;
      line-height:13px!important;
      font-size:8px!important;
      margin:0 auto!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .logLegend{
      gap:4px!important;
      margin-top:3px!important;
      font-size:7px!important;
      line-height:1!important;
      justify-content:center!important;
    }



    /* V150.41: round the setter-card top corners and improve text contrast on every non-cover PDF card. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisUnit{
      box-sizing:border-box!important;
      overflow:hidden!important;
      border-radius:16px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisHeader{
      overflow:hidden!important;
      border-top-left-radius:16px!important;
      border-top-right-radius:16px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisUnitBody,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterCard{
      border-bottom-left-radius:16px!important;
      border-bottom-right-radius:16px!important;
    }

    #report #reportDashboard.pdfA4Document > .pdfSetterPage,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{
      color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage :is(h1,h2,h3,h4,h5,h6,b,strong,.num,.value,.score,.rate,.percent,.rank,.timelineText,.timelineNo,.compactRankName,.compactRankValue),
    #report #reportDashboard.pdfA4Document > .pdfTeamPage :is(h1,h2,h3,h4,h5,h6,b,strong,.num,.value,.score,.rate,.percent,.rank),
    #report #reportDashboard.pdfA4Document > .pdfFinalPage :is(h1,h2,h3,h4,h5,h6,b,strong,.num,.value,.score,.rate,.percent,.rank,.timelineText,.timelineNo,.compactRankName,.compactRankValue){
      color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage :is(p,span,small,label,td,th,.small,.label,.sub,.meta,.caption,.legendRow,.setterAnalysisEyebrow),
    #report #reportDashboard.pdfA4Document > .pdfTeamPage :is(p,span,small,label,td,th,.small,.label,.sub,.meta,.caption,.legendRow),
    #report #reportDashboard.pdfA4Document > .pdfFinalPage :is(p,span,small,label,td,th,.small,.label,.sub,.meta,.caption,.legendRow,.logLegend){
      color:#e5e7eb!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage svg text:not(.pdfDonutSvg text),
    #report #reportDashboard.pdfA4Document > .pdfTeamPage svg text:not(.pdfDonutSvg text),
    #report #reportDashboard.pdfA4Document > .pdfFinalPage svg text:not(.pdfDonutSvg text){
      fill:#e5e7eb!important;
    }



    /* V150.42: targeted text contrast and final-page section headings. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .rotationPct,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .rotationPct *,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation [class*="Pct"]{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationLabel,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationLabel *{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalSectionTitle{
      margin:0 0 8px!important;
      padding:0 2px 7px!important;
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      font-size:20px!important;
      line-height:1.1!important;
      font-weight:1000!important;
      letter-spacing:.04em!important;
      border-bottom:1px solid rgba(255,255,255,.22)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard .compactRankCard h4,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard .compactRankRow,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard .compactRankRow *,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard [class*="Rank"]{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .reportAccordionSubhead,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsOuterCard .reportAccordionSubhead *{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }



    /* V150.43: PDF-only chart sizing, team balance, and unified analysis card. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar{
      transform:scale(1.24)!important;
      transform-origin:center center!important;
      margin:3px 0 5px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar svg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar canvas,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar img{
      max-height:232px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfDonutSvg{
      width:108px!important;
      height:108px!important;
      min-width:108px!important;
      flex-basis:108px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfDonutSvg svg{
      width:108px!important;
      height:108px!important;
    }

    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard>.playOverviewCard{
      grid-template-rows:minmax(0,1fr) auto!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult{
      padding:8px 10px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAquilaAdvice{
      margin-top:7px!important;
      padding:13px 14px!important;
      min-height:78px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAquilaAdviceTitle{
      font-size:12px!important;
      margin-bottom:7px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAquilaAdvice p,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAquilaAdviceList p{
      font-size:10.5px!important;
      line-height:1.55!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation{
      padding:4px 6px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation h3{
      margin-bottom:3px!important;
      font-size:10px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationList{
      gap:4px 6px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationRow{
      min-height:34px!important;
      padding:3px 5px!important;
      gap:5px!important;
      grid-template-columns:24px minmax(0,1fr) minmax(82px,.65fr)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationLabel{font-size:10px!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationSuccessHead b{font-size:10px!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationSuccessHead span,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationSuccessHead small,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationPointCounts{font-size:7px!important;}
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamRotationTrack{height:6px!important;margin-top:3px!important;}

    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid{
      display:block!important;
      height:186mm!important;
      max-height:186mm!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard{
      display:grid!important;
      grid-template-rows:auto auto minmax(0,1fr)!important;
      gap:8px!important;
      width:100%!important;
      max-width:100%!important;
      height:auto!important;
      max-height:100%!important;
      min-height:0!important;
      box-sizing:border-box!important;
      padding:12px!important;
      border:1px solid rgba(203,213,225,.28)!important;
      border-radius:16px!important;
      background:#2f394b!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisTitle{
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-start!important;
      gap:1px!important;
      margin:0!important;
      padding:0 2px 8px!important;
      color:#ffffff!important;
      border-bottom:1px solid rgba(255,255,255,.28)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisEyebrow{
      display:block!important;
      color:#93c5fd!important;
      font-size:9px!important;
      line-height:1!important;
      font-weight:1000!important;
      letter-spacing:.16em!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisJapanese{
      display:block!important;
      color:#fff!important;
      font-size:22px!important;
      line-height:1.05!important;
      font-weight:1000!important;
      letter-spacing:.05em!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSection{
      min-width:0!important;
      overflow:hidden!important;
      background:transparent!important;
      border:0!important;
      padding:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsSection{min-height:0!important;}
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsSection{padding-top:7px!important;border-top:1px solid rgba(255,255,255,.18)!important;}
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSection .pdfFinalSectionTitle{
      margin:0 0 5px!important;
      padding:0!important;
      font-size:15px!important;
      border-bottom:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .reportPanel{
      background:transparent!important;
      border:0!important;
      border-radius:0!important;
      box-shadow:none!important;
      padding:0!important;
      margin:0!important;
    }

    /* V150.44: enlarge setter charts and force rotation percentage contrast. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar{
      transform:scale(1.24)!important;
      transform-origin:center center!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfDonutSvg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfDonutSvg svg{
      width:108px!important;
      height:108px!important;
      min-width:108px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterRotValue em,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotValue em,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .v141RotationSection .setterRotValue em{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      opacity:1!important;
      font-weight:900!important;
    }



    /* V150.49: unify setter analysis 1/2 chart geometry and place the ability title just above 配球. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid{
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) minmax(0,1.2fr)!important;
      grid-template-rows:242px!important;
      align-items:stretch!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid > *{
      width:100%!important;
      height:242px!important;
      min-height:242px!important;
      max-height:242px!important;
      align-self:stretch!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterMiddleColumn,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation{
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar{
      position:relative!important;
      grid-template-rows:minmax(0,1fr)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar .setterIqRadarTitle{
      position:absolute!important;
      z-index:4!important;
      top:7px!important;
      left:50%!important;
      transform:translateX(-50%)!important;
      width:max-content!important;
      margin:0!important;
      padding:0!important;
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      font-size:12px!important;
      line-height:1!important;
      font-weight:1000!important;
      text-align:center!important;
      text-shadow:0 1px 2px rgba(15,23,42,.85)!important;
      opacity:1!important;
      visibility:visible!important;
      pointer-events:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar svg{
      display:block!important;
      width:100%!important;
      height:238px!important;
      min-height:238px!important;
      max-height:238px!important;
      margin:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg svg{
      width:126px!important;
      height:126px!important;
      min-width:126px!important;
      min-height:126px!important;
      max-width:126px!important;
      max-height:126px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarWrap{
      height:206px!important;
      min-height:206px!important;
      max-height:206px!important;
    }

    /* V150.47: restore the PDF ability-balance title and fill each setter chart card. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid{
      align-items:stretch!important;
      gap:7px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid > *{
      height:100%!important;
      min-height:0!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar{
      display:flex!important;
      align-items:stretch!important;
      justify-content:center!important;
      transform:none!important;
      margin:0!important;
      padding:3px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar{
      display:grid!important;
      grid-template-rows:auto minmax(0,1fr)!important;
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      padding:0!important;
      background:transparent!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar .setterIqRadarTitle{
      display:block!important;
      margin:0 0 1px!important;
      color:#0f172a!important;
      -webkit-text-fill-color:#0f172a!important;
      font-size:12px!important;
      line-height:1.1!important;
      font-weight:1000!important;
      text-align:center!important;
      opacity:1!important;
      visibility:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar svg{
      width:100%!important;
      height:100%!important;
      min-height:215px!important;
      max-height:none!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterMiddleColumn{
      display:flex!important;
      flex-direction:column!important;
      justify-content:space-between!important;
      gap:4px!important;
      padding:3px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut{
      display:flex!important;
      flex:1 1 auto!important;
      min-height:0!important;
      flex-direction:column!important;
      justify-content:flex-start!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .tossPanel{
      display:flex!important;
      flex:1 1 auto!important;
      min-height:0!important;
      align-items:center!important;
      justify-content:center!important;
      gap:8px!important;
      padding:0!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg svg{
      width:126px!important;
      height:126px!important;
      min-width:126px!important;
      flex-basis:126px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation{
      display:flex!important;
      flex-direction:column!important;
      margin:0!important;
      padding:3px 2px 2px 7px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation > h4{
      flex:0 0 auto!important;
      margin:0 0 3px!important;
      font-size:12px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarWrap{
      display:flex!important;
      flex:1 1 auto!important;
      min-height:0!important;
      flex-direction:column!important;
      justify-content:space-between!important;
      gap:2px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarRow{
      flex:1 1 0!important;
      min-height:0!important;
      margin:0!important;
      padding:2px 3px!important;
    }

    .pdfPreviewBuildMarker{position:fixed!important;right:8px!important;bottom:8px!important;z-index:2147483647!important;padding:4px 7px!important;border-radius:7px!important;background:rgba(15,23,42,.92)!important;color:#fff!important;font-size:10px!important;font-weight:900!important;pointer-events:none!important;}
    @media print{.pdfPreviewBuildMarker{display:none!important}}
  

    /* V150.49: match both setter cards to the approved layout and force the ability title white. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid{
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) minmax(0,1.2fr)!important;
      grid-template-rows:242px!important;
      align-items:stretch!important;
      gap:7px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid > *{
      width:100%!important;
      height:242px!important;
      min-height:242px!important;
      max-height:242px!important;
      align-self:stretch!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar{
      display:flex!important;
      align-items:stretch!important;
      justify-content:center!important;
      transform:none!important;
      margin:0!important;
      padding:3px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar{
      position:relative!important;
      display:block!important;
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      padding:0!important;
      background:transparent!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar .setterIqRadarTitle{
      position:absolute!important;
      z-index:10!important;
      top:13px!important;
      left:50%!important;
      transform:translateX(-50%)!important;
      display:block!important;
      width:max-content!important;
      margin:0!important;
      padding:0!important;
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      font-size:12px!important;
      line-height:1!important;
      font-weight:1000!important;
      text-align:center!important;
      text-shadow:0 1px 2px rgba(15,23,42,.9)!important;
      opacity:1!important;
      visibility:visible!important;
      pointer-events:none!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .pdfSetterIqRadar svg{
      display:block!important;
      width:100%!important;
      height:238px!important;
      min-height:238px!important;
      max-height:238px!important;
      margin:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg svg{
      width:126px!important;
      height:126px!important;
      min-width:126px!important;
      min-height:126px!important;
      max-width:126px!important;
      max-height:126px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarWrap{
      height:206px!important;
      min-height:206px!important;
      max-height:206px!important;
    }

    /* V150.50: PDF preview only — force 能力バランス title to white. */
    #report .setterIqRadarTitle,
    #report #reportDashboard .setterIqRadarTitle,
    #report #reportDashboard.pdfA4Document .setterIqRadarTitle{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      opacity:1!important;
    }

    /* V150.51: PDF preview only — keep the “○本” labels clear of the rotation chart line. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarValues{
      margin-top:5px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotValue{
      grid-template-rows:auto auto!important;
      row-gap:2px!important;
      line-height:1.05!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotValue small{
      position:relative!important;
      top:2px!important;
      line-height:1!important;
    }

    /* V150.53: PDF preview only — keep each S1–S6 divider below its labels. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarWrap{
      gap:3px!important;
      justify-content:flex-start!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarRow{
      flex:0 0 31px!important;
      height:31px!important;
      min-height:31px!important;
      margin:0!important;
      padding:1px 3px 5px!important;
      align-items:start!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarMain{
      min-height:25px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarValues{
      margin-top:3px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotValue small{
      top:0!important;
    }

    /* V150.54: PDF preview only — lower the divider by giving the count labels more vertical room. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarRow{
      flex-basis:35px!important;
      height:35px!important;
      min-height:35px!important;
      padding:1px 3px 9px!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarMain{
      min-height:29px!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarValues{
      margin-top:4px!important;
      padding-bottom:2px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotValue small{
      top:2px!important;
    }


    /* V150.55: PDF preview only — add one more step of clearance below the count labels. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarRow{
      flex-basis:39px!important;
      height:39px!important;
      min-height:39px!important;
      padding:1px 3px 13px!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarMain{
      min-height:33px!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation .setterRotBarValues{
      margin-top:4px!important;
      padding-bottom:6px!important;
    }


    /* V150.60: PDF preview only — make the three setter-analysis subcards fill the parent card. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterCard{
      display:grid!important;
      grid-template-rows:auto minmax(0,1fr)!important;
      gap:5px!important;
      padding:5px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid.setterAnalysisSubcardGrid{
      display:grid!important;
      grid-template-columns:minmax(0,.9fr) minmax(0,1fr) minmax(0,1.18fr)!important;
      grid-template-rows:minmax(0,1fr)!important;
      gap:6px!important;
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      max-height:none!important;
      margin:0!important;
      padding:0!important;
      align-items:stretch!important;
      justify-items:stretch!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterBottomGrid.setterAnalysisSubcardGrid > .setterAnalysisSubcard{
      display:flex!important;
      flex-direction:column!important;
      width:100%!important;
      height:100%!important;
      min-width:0!important;
      min-height:0!important;
      max-width:none!important;
      max-height:none!important;
      margin:0!important;
      padding:0!important;
      align-self:stretch!important;
      border-radius:12px!important;
      overflow:hidden!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisSubcardTitle{
      flex:0 0 auto!important;
      margin:0!important;
      padding:7px 8px!important;
      text-align:center!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisSubcardBody{
      display:flex!important;
      flex:1 1 auto!important;
      flex-direction:column!important;
      width:100%!important;
      height:auto!important;
      min-width:0!important;
      min-height:0!important;
      max-width:none!important;
      max-height:none!important;
      margin:0!important;
      padding:5px 7px 7px!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .setterAnalysisSubcardBody{
      align-items:stretch!important;
      justify-content:center!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .setterAnalysisSubcardBody,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRotationCard .setterAnalysisSubcardBody{
      justify-content:flex-start!important;
    }

    /* V150.69: match the exposed parent-card surfaces to the navy PDF-preview design.
       Small cards, charts, values, and layout are unchanged. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisUnitBody,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterCard{
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .teamAnalysisCard > .playOverviewCard{
      background:#2f394b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock{
      background:#2f394b!important;
    }

    /* V150.69: PDF final-page ranking text contrast. */
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsOuterCard *,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock *,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .singleReportWideGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .singleReportWideGrid *{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }


    /* V150.69 final PDF-preview overrides: dark small cards, full-width analysis parent, unclipped toss donut. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisSubcard,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterTop,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRadar,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterMiddleColumn,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterRotation,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewPlay,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewMetrics,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewResult,
    #report #reportDashboard.pdfA4Document > .pdfTeamPage .playOverviewRotation,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .reportPanel,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .recentLogItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineRow{
      background:#1e293b!important;
      background-color:#1e293b!important;
      border-color:rgba(96,165,250,.32)!important;
      color:#fff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfFinalGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSection,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .singleReportWideGrid,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .setterUnifiedBottomGrid{
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      margin-right:0!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard{
      display:block!important;
      min-height:186mm!important;
      background:#2f394b!important;
      padding:12px!important;
      border-radius:16px!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSection{
      background:transparent!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsBlock{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:7px!important;
      background:transparent!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .compactRankCard{
      min-width:0!important;
      border:1px solid rgba(96,165,250,.32)!important;
      border-radius:10px!important;
      padding:7px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock{
      background:transparent!important;
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .setterAnalysisSubcardBody,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterMiddleColumn,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .tossPanel{
      overflow:visible!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .setterAnalysisSubcardBody{
      padding-top:10px!important;
      padding-bottom:12px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .tossPanel{
      min-height:150px!important;
      padding:8px 4px 10px!important;
      align-items:center!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterDonut .pdfDonutSvg svg{
      width:116px!important;
      height:116px!important;
      min-width:116px!important;
      min-height:116px!important;
      max-width:116px!important;
      max-height:116px!important;
      overflow:visible!important;
    }

    /* V150.69: setter-analysis card final layout and contrast adjustments. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisSubcard,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisSubcard *{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .pdfSetterIqRadar{
      display:grid!important;
      grid-template-rows:auto minmax(0,1fr)!important;
      align-items:center!important;
      justify-items:center!important;
      width:100%!important;
      height:100%!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .pdfSetterIqRadar .setterIqRadarTitle{
      position:static!important;
      transform:none!important;
      width:auto!important;
      margin:0!important;
      padding:1px 0 0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .pdfSetterIqRadar svg{
      display:block!important;
      width:94%!important;
      height:205px!important;
      min-height:205px!important;
      max-height:205px!important;
      margin:auto!important;
      overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .radarLabels text,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisRadarCard .radarLabels tspan{
      fill:#ffffff!important;
      font-size:13px!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .setterMasterDonut{
      align-items:center!important;
      justify-content:flex-start!important;
      width:100%!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .setterMasterDonut .tossPanel{
      display:flex!important;
      flex-direction:column!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:5px!important;
      width:100%!important;
      min-height:0!important;
      padding:3px 4px 6px!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .pdfDonutSvg{
      margin:0 auto!important;
      flex:0 0 112px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legend{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:3px 8px!important;
      width:100%!important;
      margin:0 auto!important;
      padding:0 4px!important;
      box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legendRow{
      display:grid!important;
      grid-template-columns:8px minmax(0,1fr) auto!important;
      gap:3px!important;
      align-items:center!important;
      min-width:0!important;
      font-size:8px!important;
      line-height:1.1!important;
      white-space:nowrap!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .pdfDonutSvg circle:last-of-type{
      fill:#1e293b!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .pdfDonutSvg text{
      fill:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legend,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legendRow,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legendRow span,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legendRow b,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisTossCard .legendRow small{
      color:#ffffff!important;
      -webkit-text-fill-color:#ffffff!important;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif!important;
    }



    /* V150.117 FINAL: final analysis page must match team/setter header colors and stay inside the white A4 sheet. */
    #report #reportDashboard.pdfA4Document > .pdfFinalPage{
      height:190mm!important;min-height:190mm!important;max-height:190mm!important;
      padding:7mm!important;overflow:hidden!important;background:#fff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage > .pdfFinalGrid{
      display:block!important;width:100%!important;height:176mm!important;max-height:176mm!important;
      min-height:0!important;overflow:hidden!important;margin:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage > .pdfFinalGrid > .pdfAnalysisOuterCard{
      display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;gap:6px!important;
      width:100%!important;height:176mm!important;min-height:0!important;max-height:176mm!important;
      margin:0!important;padding:9px!important;box-sizing:border-box!important;overflow:hidden!important;
      background:#2f394b!important;background-color:#2f394b!important;
      border:1px solid rgba(203,213,225,.28)!important;border-radius:16px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisTitle{
      display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:1px!important;
      margin:0!important;padding:0 2px 6px!important;border-bottom:1px solid rgba(255,255,255,.28)!important;
      background:transparent!important;color:#fff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisEyebrow{
      color:#93c5fd!important;-webkit-text-fill-color:#93c5fd!important;font-size:9px!important;
      line-height:1!important;font-weight:1000!important;letter-spacing:.16em!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisJapanese{
      color:#fff!important;-webkit-text-fill-color:#fff!important;font-size:20px!important;
      line-height:1.05!important;font-weight:1000!important;letter-spacing:.05em!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSmallCard{
      min-height:0!important;box-sizing:border-box!important;overflow:hidden!important;
      background:#1e293b!important;background-color:#1e293b!important;
      border:1px solid rgba(96,165,250,.32)!important;border-radius:14px!important;padding:7px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRankingsSection{height:auto!important;max-height:none!important;}
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsSection{
      height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important;
      padding-top:7px!important;border-top:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisSection .pdfFinalSectionTitle{
      margin:0 0 4px!important;font-size:13px!important;line-height:1.1!important;color:#fff!important;
      -webkit-text-fill-color:#fff!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .allRankingsGrid{
      display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:5px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .compactRankCard,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .compactRankCard:nth-child(4),
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfAnalysisOuterCard .compactRankCard:nth-child(5){
      grid-column:auto!important;width:100%!important;min-width:0!important;max-width:none!important;
      min-height:0!important;padding:5px!important;box-sizing:border-box!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock .reportPanel,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .pdfRecentLogsBlock .reportAccordionBody{
      height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important;
      margin:0!important;padding:0!important;background:transparent!important;border:0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timeline{
      display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:2px 4px!important;
      margin:2px 0 0!important;max-height:100%!important;overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .recentLogItem,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineRow{
      min-height:0!important;padding:2px 4px!important;margin:0!important;line-height:1.05!important;
      border-radius:5px!important;overflow:hidden!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineNo,
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineText{
      font-size:8px!important;line-height:1.05!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .timelineIcon{
      width:16px!important;height:16px!important;line-height:16px!important;font-size:9px!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfFinalPage .logLegend{
      margin-top:3px!important;gap:2px 4px!important;font-size:8px!important;line-height:1.05!important;
    }

    /* V150.141: PDF preview / print setter-analysis card — all four corners rounded. */
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisUnit{
      border-radius:18px!important;
      overflow:hidden!important;
      clip-path:inset(0 round 18px)!important;
      -webkit-clip-path:inset(0 round 18px)!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisHeader{
      border-radius:18px 18px 0 0!important;
    }
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterAnalysisUnitBody,
    #report #reportDashboard.pdfA4Document > .pdfSetterPage .setterMasterCard{
      border-radius:0 0 18px 18px!important;
      overflow:hidden!important;
    }
</style><script src="https://unpkg.com/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js"></script></head><body>
    <div class="pdfPreviewTopbar"><b>Setter Theory PDFプレビュー</b><div><button class="secondary" onclick="window.close()">← レポートへ戻る</button><button id="pdfPrintButton" type="button">PDF／印刷</button></div></div>
    <div class="pdfPreviewBuildMarker">V150.141</div>
    <main class="pdfPreviewSheet"><section id="report" class="active">${a4Root.outerHTML}</section></main>
</body></html>`;

  // 元画面の開閉状態は変えずに戻す。
  reportRankingsOpen=previousRankingsOpen;
  reportRecentLogsOpen=previousRecentLogsOpen;
  reportRecentLogsExpanded=previousRecentLogsExpanded;
  report();

  const w=window.open('', '_blank');
  if(!w){ alert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();

  // V150.18: PDF生成処理は維持し、PDF専用の固定ページ構成へ変更。
  // HTMLの直接印刷は使わず、html2pdf.jsでA4横向きPDFを作成して別タブへ表示する。
  const bindPreviewButtons=()=>{
    try{
      const printButton=w.document.getElementById('pdfPrintButton');
      const backButton=w.document.querySelector('.pdfPreviewTopbar .secondary');

      if(backButton && backButton.dataset.bound!=='1'){
        backButton.removeAttribute('onclick');
        backButton.dataset.bound='1';
        backButton.addEventListener('click',(ev)=>{
          ev.preventDefault();
          ev.stopPropagation();
          try{ w.close(); }catch(e){}
        },{passive:false});
      }

      if(printButton && printButton.dataset.bound!=='1'){
        printButton.disabled=false;
        printButton.style.pointerEvents='auto';
        printButton.style.touchAction='manipulation';
        printButton.dataset.bound='1';
        printButton.addEventListener('click',async(ev)=>{
          ev.preventDefault();
          ev.stopPropagation();

          // iPadのポップアップ制限対策として、タップ直後にPDF表示先を確保する。
          const pdfWindow=w.open('', '_blank');
          if(!pdfWindow){
            alert('PDF画面を開けませんでした。Safariのポップアップを許可してください。');
            return;
          }
          pdfWindow.document.open();
          pdfWindow.document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF作成中</title><style>body{margin:0;background:#111827;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh}.box{text-align:center;padding:24px}.spin{width:38px;height:38px;border:4px solid #475569;border-top-color:#facc15;border-radius:50%;margin:0 auto 16px;animation:r 1s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spin"></div><b>PDFを作成しています…</b></div></body></html>');
          pdfWindow.document.close();

          const originalText=printButton.textContent;
          printButton.disabled=true;
          printButton.textContent='PDF作成中…';
          try{
            if(typeof w.html2pdf!=='function'){
              throw new Error('PDF生成ライブラリを読み込めませんでした。通信状態を確認してください。');
            }
            const source=w.document.querySelector('.pdfA4Document');
            if(!source) throw new Error('PDFにするレポート全体を取得できませんでした。');

            // canvasを画像化した複製を使い、グラフがPDF内で消えるのを防ぐ。
            const clone=source.cloneNode(true);

            // V150.104: V150.87の大きさを維持し、PDF/印刷用複製の位置だけを補正する。
            // PDFプレビュー側と他カードには影響させない。
            clone.querySelectorAll('.setterAnalysisRadarCard').forEach(card=>{
              card.style.overflow='hidden';
              const body=card.querySelector('.setterAnalysisSubcardBody');
              if(body){
                body.style.overflow='hidden';
                body.style.display='flex';
                body.style.alignItems='center';
                body.style.justifyContent='center';
              }
              const radar=card.querySelector('.pdfSetterIqRadar');
              if(radar){
                radar.style.width='100%';
                radar.style.height='100%';
                radar.style.overflow='visible';
                radar.style.display='grid';
                radar.style.placeItems='center';
              }
              const svg=card.querySelector('.pdfSetterIqRadar svg');
              if(svg){
                svg.style.display='block';
                svg.style.width='92%';
                svg.style.height='184px';
                svg.style.minHeight='184px';
                svg.style.maxHeight='184px';
                svg.style.margin='auto';
                svg.style.overflow='visible';
                svg.style.transform='scale(.88)';
                svg.style.transformOrigin='50% 50%';
                svg.style.position='relative';
                svg.style.left='-20px';
                svg.style.top='-7px';
              }
              card.querySelectorAll('.radarLabels text,.radarLabels tspan').forEach(label=>{
                label.style.fill='#ffffff';
                label.style.webkitTextFillColor='#ffffff';
                label.style.fontSize='12px';
                label.style.fontWeight='900';
              });
            });

            // V150.104: 印刷用「トス配分」だけ、凡例・本数・％を白色へ固定し、
            // 円グラフ中央の文字と数字をアプリ共通のゴシック系フォントへ統一する。
            // SVGをPNG化する前にインライン指定し、iPad印刷でも色とフォントを保持する。
            clone.querySelectorAll('.setterAnalysisTossCard').forEach(card=>{
              card.querySelectorAll('.legend,.legendRow,.legendRow span,.setterMasterChartTitle').forEach(el=>{
                el.style.color='#ffffff';
                el.style.webkitTextFillColor='#ffffff';
                el.style.fontFamily='-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif';
              });
              card.querySelectorAll('.pdfDonutSvg svg').forEach(svg=>{
                const centerCircle=svg.querySelector('circle:last-of-type');
                if(centerCircle) centerCircle.setAttribute('fill','#1e293b');
                svg.querySelectorAll('text').forEach(text=>{
                  text.setAttribute('fill','#ffffff');
                  text.style.fill='#ffffff';
                  text.style.webkitTextFillColor='#ffffff';
                  text.style.fontFamily='-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif';
                });
              });
            });

            const sourceCanvases=source.querySelectorAll('canvas');
            const cloneCanvases=clone.querySelectorAll('canvas');
            sourceCanvases.forEach((canvas,index)=>{
              try{
                const img=w.document.createElement('img');
                img.src=canvas.toDataURL('image/png');
                img.style.width=(canvas.getBoundingClientRect().width||canvas.width)+'px';
                img.style.maxWidth='100%';
                img.style.height='auto';
                if(cloneCanvases[index]) cloneCanvases[index].replaceWith(img);
              }catch(e){}
            });

            clone.style.width='297mm';
            clone.style.maxWidth='297mm';
            clone.style.height='auto';
            clone.style.overflow='visible';
            clone.style.background='#fff';
            const holder=w.document.createElement('div');
            holder.id='pdfGenerationHolder';
            holder.style.position='fixed';
            holder.style.left='-20000px';
            holder.style.top='0';
            holder.style.width='297mm';
            holder.style.background='#fff';
            holder.style.zIndex='-1';
            holder.appendChild(clone);
            w.document.body.appendChild(holder);

            // V150.72: PDFプレビューのSVGは変更せず、実際の印刷PDFに渡す複製だけを
            // 高解像度PNGへ固定する。html2canvasによる扇形境界の再解釈を防ぎ、
            // データに応じて一部の扇形だけ太く見える現象を印刷画面側だけで抑える。
            const rasterizePrintDonuts=async()=>{
              const svgs=[...clone.querySelectorAll('.pdfDonutSvg svg')];
              await Promise.all(svgs.map(svg=>new Promise(resolve=>{
                try{
                  const serializer=new XMLSerializer();
                  let svgText=serializer.serializeToString(svg);
                  if(!/xmlns=/.test(svgText)){
                    svgText=svgText.replace('<svg','<svg xmlns=\"http://www.w3.org/2000/svg\"');
                  }
                  const blob=new Blob([svgText],{type:'image/svg+xml;charset=utf-8'});
                  const url=URL.createObjectURL(blob);
                  const image=new Image();
                  image.onload=()=>{
                    try{
                      const size=440;
                      const canvas=w.document.createElement('canvas');
                      canvas.width=size;
                      canvas.height=size;
                      const ctx=canvas.getContext('2d');
                      ctx.clearRect(0,0,size,size);
                      ctx.drawImage(image,0,0,size,size);
                      const png=w.document.createElement('img');
                      png.src=canvas.toDataURL('image/png');
                      png.className='pdfDonutRaster';
                      png.alt='円グラフ';
                      png.style.display='block';
                      png.style.width='132px';
                      png.style.height='132px';
                      png.style.maxWidth='none';
                      png.style.maxHeight='none';
                      png.style.objectFit='contain';
                      const donutHolder=svg.closest('.pdfDonutSvg');
                      if(donutHolder){
                        donutHolder.style.width='132px';
                        donutHolder.style.height='132px';
                        donutHolder.style.minWidth='132px';
                        donutHolder.style.minHeight='132px';
                        donutHolder.style.maxWidth='132px';
                        donutHolder.style.maxHeight='132px';
                        donutHolder.style.flex='0 0 132px';
                      }
                      svg.replaceWith(png);
                    }catch(e){}
                    URL.revokeObjectURL(url);
                    resolve();
                  };
                  image.onerror=()=>{ URL.revokeObjectURL(url); resolve(); };
                  image.src=url;
                }catch(e){ resolve(); }
              })));
            };
            await rasterizePrintDonuts();

            const filename='setter-theory-report.pdf';
            const options={
              margin:4,
              filename,
              image:{type:'png',quality:1},
              html2canvas:{scale:1.5,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',scrollX:0,scrollY:0,logging:false},
              jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},
              pagebreak:{mode:['css','legacy'],after:'.pdfA4Page:not(:last-child)',avoid:['tr','.compactRankCard','.setterIqAdvicePerson']}
            };

            if(w.document.fonts&&w.document.fonts.ready){ try{ await w.document.fonts.ready; }catch(e){} }
            await new Promise(resolve=>setTimeout(resolve,500));
            const worker=w.html2pdf().set(options).from(clone).toPdf();
            const pdf=await worker.get('pdf');
            const blob=pdf.output('blob');
            holder.remove();
            const blobUrl=URL.createObjectURL(blob);
            pdfWindow.location.replace(blobUrl);
            setTimeout(()=>URL.revokeObjectURL(blobUrl),10*60*1000);
          }catch(err){
            try{
              pdfWindow.document.open();
              pdfWindow.document.write('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px"><h2>PDFを作成できませんでした</h2><p>'+String(err&&err.message?err.message:err).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))+'</p><button onclick="window.close()" style="padding:10px 14px">閉じる</button></body></html>');
              pdfWindow.document.close();
            }catch(e){}
          }finally{
            printButton.disabled=false;
            printButton.textContent=originalText;
          }
        },{passive:false});
      }
      w.focus();
    }catch(e){}
  };
  setTimeout(bindPreviewButtons,50);
  setTimeout(bindPreviewButtons,300);

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
  return {setterIq,balance,diversity,quick,clutch,leftRightBalance,foreshadow,blockInduce,sideDepend,centerPct,backPct};
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
    const rowTag=String(getCell(r,[findHeader(headers,['No'])])||'').trim();
    if(rowTag==='SetterSummary' || rowTag==='SecondBallSummary') return;
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


function registeredTeamById(teamId){
  const id=String(teamId||'');
  if(!id) return null;
  return registeredTeamsForSetup().find(team=>String(team.id||'')===id)||null;
}

function currentSavedMatchTeamMeta(){
  const teamId=String(s.teamId||s.selectedTeamId||localStorage.getItem('setterTheoryReleaseTeamId')||'');
  const registered=registeredTeamById(teamId);
  return {
    teamId,
    teamName:String(registered?.name||s.team||'').trim(),
    teamYear:String(registered?.year||'').trim()
  };
}

function savedMatchTeamMeta(match){
  const teamId=String(match?.teamId||match?.csv?.teamId||'').trim();
  const registered=registeredTeamById(teamId);
  const teamName=String(
    match?.teamName||
    match?.csv?.teamName||
    registered?.name||
    ''
  ).trim();
  const teamYear=String(
    match?.teamYear||
    match?.csv?.teamYear||
    registered?.year||
    ''
  ).trim();
  return {
    teamId,
    teamName:teamName||'チーム未設定',
    teamYear
  };
}

function savedMatchTeamGroupKey(match){
  const meta=savedMatchTeamMeta(match);

  // V150.166:
  // 過去データには、実際のチーム情報が無いのに仮のteamIdだけが
  // 保存されている試合がある。そのteamIdで分けると
  // 「チーム未設定」が複数できるため、未設定試合は全て1つにまとめる。
  if(!meta.teamName || meta.teamName==='チーム未設定'){
    return 'unassigned';
  }

  return meta.teamId
    ? `team:${meta.teamId}`
    : `name:${meta.teamName}:${meta.teamYear}`;
}

function savedMatchesKey(){ return 'setterTheoryReleaseSavedMatchesV21'; }
function playerRegistryKey(){ return 'setterTheoryReleasePlayerRegistryV1'; }
function createStablePlayerId(){ return createEntityId('player'); }
function getPlayerRegistry(){
  try{ const v=JSON.parse(localStorage.getItem(playerRegistryKey())||'{}'); return v&&typeof v==='object'&&!Array.isArray(v)?v:{}; }catch(e){ return {}; }
}
function setPlayerRegistry(v){ localStorage.setItem(playerRegistryKey(),JSON.stringify(v||{})); }
function identityLookupKey(name,num=''){
  const no=String(num||'').trim();
  if(no && no!=='-' && no!=='0') return `number:${no}`;
  const n=normalizeGrowthPlayerName(name);
  return n ? `name:${n}` : '';
}
function ensureStablePlayerId(name,num='',preferredId=''){
  if(preferredId) return String(preferredId);
  const key=identityLookupKey(name,num);
  if(!key) return '';
  const registry=getPlayerRegistry();
  if(!registry[key]) registry[key]={playerId:createStablePlayerId(),name:String(name||''),numbers:[]};
  const no=String(num||'').trim();
  if(no && !registry[key].numbers.includes(no)) registry[key].numbers.push(no);
  if(name) registry[key].name=String(name);
  setPlayerRegistry(registry);
  return registry[key].playerId;
}
function ensureDistinctRegisteredPlayerIdentities(state=s){
  if(!state || typeof state!=='object') return state;
  state.playerIdentities=state.playerIdentities&&typeof state.playerIdentities==='object'?state.playerIdentities:{};
  const nums=[...(state.nums||[]),...Object.keys(state.players||{})].map(String).filter(n=>n&&n!=='-');
  const seen=new Map();
  nums.forEach(num=>{
    const name=String((state.players||{})[num]||'').trim();
    let id=String(state.playerIdentities[num]||'').trim();
    if(!id) id=ensureStablePlayerId(name,num,'');
    if(!id) return;
    if(seen.has(id) && seen.get(id)!==num){
      id=createStablePlayerId();
      const registry=getPlayerRegistry();
      registry[`number:${num}`]={playerId:id,name,numbers:[num]};
      setPlayerRegistry(registry);
    }
    state.playerIdentities[num]=id;
    seen.set(id,num);
  });
  return state;
}
function migrateSavedMatchIdentities(match){
  if(!match || typeof match!=='object') return match;
  match.dataVersion=DATA_SCHEMA_VERSION;
  match.schemaVersion=DATA_SCHEMA_VERSION;
  match.userId=String(match.userId||localStorage.getItem('setterTheoryReleaseUserId')||createEntityId('user'));
  match.teamId=String(match.teamId||match?.csv?.teamId||'');
  const teamMeta=savedMatchTeamMeta(match);
  match.teamName=String(match.teamName||teamMeta.teamName||'チーム未設定');
  match.teamYear=String(match.teamYear||teamMeta.teamYear||'');
  match.id=String(match.id||createEntityId('match'));
  match.matchId=String(match.matchId||match.id);
  match.setId=String(match.setId||`${match.matchId}_set_${match?.csv?.setNo||1}`);
  const metas=savedMatchSetterMeta(match);
  match.playerIdentities=match.playerIdentities&&typeof match.playerIdentities==='object'?match.playerIdentities:{};
  metas.forEach(meta=>{
    const old=meta.playerId||match.playerIdentities[String(meta.num||'')];
    const id=ensureStablePlayerId(meta.name,meta.num,old);
    if(id) match.playerIdentities[String(meta.num||'')]=id;
  });
  if(match.csv&&typeof match.csv==='object'){
    match.csv.dataVersion=DATA_SCHEMA_VERSION;
    match.csv.matchId=match.matchId;
    match.csv.setId=match.setId;
  }
  return match;
}
function savedMatchesBackupKey(){ return 'setterTheoryReleaseSavedMatchesV21Backup'; }
function normalizeSavedMatchList(value){
  if(!Array.isArray(value)) return null;
  return value.map(migrateSavedMatchIdentities);
}
function readSavedMatchStore(key){
  try{
    const raw=localStorage.getItem(key);
    if(!raw) return null;
    const parsed=JSON.parse(raw);
    // V124 backup envelope: {savedAt, list}. Old plain-array data is also supported.
    if(Array.isArray(parsed)) return {savedAt:'',list:normalizeSavedMatchList(parsed)};
    if(parsed && Array.isArray(parsed.list)) return {savedAt:String(parsed.savedAt||''),list:normalizeSavedMatchList(parsed.list)};
  }catch(error){ console.error('saved match store read failed',key,error); }
  return null;
}
function getSavedMatches(){
  const primary=readSavedMatchStore(savedMatchesKey());
  const backup=readSavedMatchStore(savedMatchesBackupKey());
  let chosen=primary;
  if(!chosen && backup) chosen=backup;
  else if(primary && backup && backup.savedAt && primary.savedAt && backup.savedAt>primary.savedAt) chosen=backup;
  const list=(chosen&&chosen.list)||[];
  // If primary is missing/corrupt, restore it from the automatic in-app backup.
  if((!primary || chosen===backup) && backup){
    try{ localStorage.setItem(savedMatchesKey(),JSON.stringify(list)); }catch(error){ console.error('saved match primary restore failed',error); }
  }
  return list;
}
function setSavedMatches(list){
  const normalized=(list||[]).map(migrateSavedMatchIdentities);
  const savedAt=new Date().toISOString();
  const serialized=JSON.stringify(normalized);
  const backupSerialized=JSON.stringify({savedAt,list:normalized});
  // App-internal storage is the main record. The second key is an automatic recovery copy,
  // so users do not need to export a CSV after every match.
  localStorage.setItem(savedMatchesKey(),serialized);
  localStorage.setItem(savedMatchesBackupKey(),backupSerialized);
  try{
    const verified=JSON.parse(localStorage.getItem(savedMatchesKey())||'null');
    if(!Array.isArray(verified) || verified.length!==normalized.length) throw new Error('saved match verification failed');
  }catch(error){
    console.error('saved match verification failed',error);
    throw error;
  }
  updateSavedMatchBackupState(savedAt);
}
function updateSavedMatchBackupState(savedAt){
  const el=document.getElementById('savedMatchBackupState');
  if(!el) return;
  const d=savedAt?new Date(savedAt):null;
  const time=d&&!Number.isNaN(d.getTime())?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';
  el.textContent=time?`アプリ内自動バックアップ済み ${time}`:'アプリ内自動バックアップ有効';
}
function suggestedMatchName(){
  const d=new Date();
  const day=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const file=(importedCsv && importedCsv.fileName) ? importedCsv.fileName.replace(/\.csv$/i,'') : 'CSV解析';
  return `${day} ${file}`;
}

function setterIqItemsFromCurrentState(){
  return reportSetterNumbers().slice(0,2).map((num,index)=>{
    const analysis=currentSetterAnalysisFor(num);
    return {
      role:`Setter${index+1}`,
      number:String(num),
      name:String(analysis.name||getPlayerName(num)||''),
      iq:analysis.total ? Number(analysis.setterIq||0) : null,
      total:Number(analysis.total||0)
    };
  });
}

function setterIqItemsForParsed(parsed){
  if(!parsed) return [];
  try{
    return withImportedMatchState(parsed,()=>setterIqItemsFromCurrentState());
  }catch(error){
    console.warn('setter IQ restore failed',error);
    return [];
  }
}

function savedMatchIqItems(match){
  const stored=Array.isArray(match?.summary?.setterIqs)
    ? match.summary.setterIqs.map((item,index)=>({
        role:String(item?.role||`Setter${index+1}`),
        number:String(item?.number||item?.num||''),
        name:String(item?.name||''),
        iq:item?.iq===null||item?.iq===undefined||item?.iq===''?null:Number(item.iq),
        total:Number(item?.total||0)
      })).slice(0,2)
    : [];

  // 保存時にセッター別IQを保持している新データは、それを使用する。
  if(stored.length) return stored;

  // 旧保存データはCSVからセッター分析カードと同じ計算処理で再計算する。
  const parsed=recoveryNormalizePayload(
    match?.csv||match?.parsed||match?.data||match,
    match?.fileName||match?.title||'保存試合'
  );
  const restored=setterIqItemsForParsed(parsed);
  if(restored.length) return restored;

  // 最後の互換処理。旧summaryの単一IQを1名分として扱う。
  const legacy=match?.summary?.setterIq;
  return Number.isFinite(Number(legacy))
    ? [{role:'Setter1',number:'',name:'',iq:Number(legacy),total:Number(match?.summary?.total||0)}]
    : [];
}

function currentAnalysisSummary(){
  if(!importedCsv) return null;
  const a=analyzeImportedCsv(importedCsv);
  const setterIqs=setterIqItemsForParsed(importedCsv);
  const primary=setterIqs[0]||null;
  return {
    total:setterIqs.reduce((sum,item)=>sum+Number(item.total||0),0) || a.total,
    // 旧画面との互換用。ワンセッター時は分析カード①と同じIQになる。
    setterIq:primary&&primary.iq!==null ? primary.iq : a.setterIq,
    setterIqs,
    balance:a.balance, diversity:a.diversity, quick:a.quick,
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
  const teamMeta=currentSavedMatchTeamMeta();
  const saved={
    id:createEntityId('match'),
    title,
    fileName:importedCsv.fileName || 'CSV',
    savedAt:new Date().toISOString(),
    memo:memoEl ? memoEl.value : '',
    csv:importedCsv,
    summary,
    dataVersion:DATA_SCHEMA_VERSION,
    schemaVersion:DATA_SCHEMA_VERSION,
    userId:String(s.userId||localStorage.getItem('setterTheoryReleaseUserId')||''),
    teamId:teamMeta.teamId,
    teamName:teamMeta.teamName,
    teamYear:teamMeta.teamYear,
    matchId:String(s.matchId||createEntityId('match')),
    setId:String(s.setId||''),
    playerIdentities:Object.fromEntries(savedMatchSetterMeta({csv:importedCsv}).map(meta=>[String(meta.num||''),ensureStablePlayerId(meta.name,meta.num,meta.playerId)]).filter(x=>x[0]&&x[1]))
  };
  list.unshift(saved);
  setSavedMatches(list.slice(0,50));
  renderSavedMatches();
  alert('試合を保存しました。');
}


// V105: independent recovery report path.
function recoveryNormalizePayload(value, fallbackName='読み込みデータ'){
  try{
    if(!value) return {fileName:fallbackName,headers:[],data:[]};
    if(typeof value==='string'){
      try{return recoveryNormalizePayload(JSON.parse(value),fallbackName);}catch(_){ const parsed=parseCSVText(value); return {fileName:fallbackName,headers:parsed.headers||[],data:parsed.data||[]}; }
    }
    if(value.csv) return recoveryNormalizePayload(value.csv,value.fileName||fallbackName);
    if(value.parsed) return recoveryNormalizePayload(value.parsed,value.fileName||fallbackName);
    if(Array.isArray(value.data)){
      let headers=Array.isArray(value.headers)?value.headers.map(String):[];
      let data=value.data;
      if(data.length && Array.isArray(data[0])){
        if(!headers.length){ headers=data[0].map((x,i)=>String(x||`列${i+1}`)); data=data.slice(1); }
        data=data.map(row=>Object.fromEntries(headers.map((h,i)=>[h,String((row||[])[i]??'')])));
      }else if(data.length && typeof data[0]==='object' && !headers.length){ headers=[...new Set(data.flatMap(row=>Object.keys(row||{})))]; }
      return {...value,fileName:value.fileName||fallbackName,headers,data};
    }
    if(Array.isArray(value.logs)){
      const headers=['No','Set','Rotation','Type','Number','Name','Position','Result','TossMiss','Point','Score','Time'];
      const players=value.players&&typeof value.players==='object'?value.players:{};
      const data=value.logs.map((x,i)=>({No:String(x?.no??i+1),Set:String(x?.set??value.setNo??'1'),Rotation:String(x?.rot??'S1'),Type:String(x?.type??''),Number:String(x?.num??'-'),Name:String(players[String(x?.num??'')]||''),Position:String(x?.pos??''),Result:String(x?.result??''),TossMiss:x?.tossMist?'1':'',Point:String(x?.point??''),Score:String(x?.score??''),Time:String(x?.time??'')}));
      return {fileName:value.fileName||fallbackName,headers,data};
    }
    if(Array.isArray(value)){
      if(!value.length) return {fileName:fallbackName,headers:[],data:[]};
      if(typeof value[0]==='object'&&!Array.isArray(value[0])) return {fileName:fallbackName,headers:[...new Set(value.flatMap(x=>Object.keys(x||{})))],data:value};
      if(Array.isArray(value[0])){ const headers=value[0].map((x,i)=>String(x||`列${i+1}`)); const data=value.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,String((row||[])[i]??'')]))); return {fileName:fallbackName,headers,data}; }
    }
  }catch(error){ console.error('recovery normalize failed',error); }
  return {fileName:fallbackName,headers:[],data:[]};
}
function recoveryCell(row,names){
  if(!row||typeof row!=='object') return '';
  const keys=Object.keys(row);
  for(const name of names){ const key=keys.find(k=>String(k).trim().toLowerCase()===String(name).trim().toLowerCase()); if(key!==undefined && row[key]!==undefined && row[key]!==null) return String(row[key]).trim(); }
  return '';
}
function buildRecoveryReport(payload,title='試合レポート'){
  const parsed=recoveryNormalizePayload(payload,title); const rows=Array.isArray(parsed.data)?parsed.data:[];
  const labels=['レフト','センター','ライト','バック','ツー']; const counts=Object.fromEntries(labels.map(x=>[x,0])); let tossTotal=0,miss=0;
  rows.forEach(row=>{ const type=recoveryCell(row,['Type','種類','Action','Skill','Play','プレー','項目','動作']); const pos=recoveryCell(row,['Position','位置','ポジション','Course','コース']); const result=recoveryCell(row,['Result','結果','Outcome','評価','Eval','Grade']); const tm=recoveryCell(row,['TossMiss','トスミス','Toss Mistake']); if(type==='トス'){ tossTotal++; const label=labels.find(x=>pos.includes(x)); if(label) counts[label]++; if(/ミス/.test(result)||['1','true','yes'].includes(tm.toLowerCase())) miss++; }});
  const bars=labels.map(label=>{ const count=counts[label],pct=tossTotal?Math.round(count/tossTotal*100):0; return `<div class="rotationRow"><div class="rotationLabel">${escapeHtml(label)}</div><div class="rotationPct">${pct}%（${count}本）</div><div class="rotationTrack"><div class="rotationFill" style="width:${pct}%;background:${colorForLabel(label)}"></div></div></div>`; }).join('');
  const score=tossTotal?Math.max(0,Math.round(100-miss/tossTotal*100)):0;
  return `<div class="csvAnalysisHead"><div><h2>${escapeHtml(title)}</h2><div class="csvSmall">${escapeHtml(parsed.fileName||'読み込みデータ')} ／ ${rows.length}行を復元</div></div></div><div class="reportGrid"><div class="reportPanel"><h3>読み込み結果</h3><div class="summaryCards">${metricCard('総トス',tossTotal,'読み取れた通常トス','blue','🏐',100)}${metricCard('トスミス',miss,'読み取れたミス','red','⚠️',tossTotal?Math.round(miss/tossTotal*100):0)}${metricCard('復旧スコア',score,'独立経路で計算','purple','🦅',score)}</div></div><div class="reportPanel"><h3>トス配分</h3>${bars}</div></div>`;
}
function showRecoveryReport(payload,title){
  const box=document.getElementById('csvAnalysisBox'); if(!box){ alert('レポート表示欄が見つかりません。'); return false; }
  box.style.display='block'; box.innerHTML=buildRecoveryReport(payload,title); setTimeout(()=>box.scrollIntoView({behavior:'smooth',block:'start'}),0); return true;
}

// V106: restore the normal full report through the verified V105 import path.
function showRestoredFullReport(payload,title='試合レポート') {
  const normalized=recoveryNormalizePayload(payload,title);
  importedCsv=normalized;
  try{ localStorage.setItem('setterTheoryReleaseImportedCsv',JSON.stringify(normalized)); }catch(_){}
  try{
    renderCsvAnalysis(normalized);
    const box=document.getElementById('csvAnalysisBox');
    if(!box || box.style.display==='none' || !String(box.innerHTML||'').trim()) throw new Error('full report was not rendered');
    setTimeout(()=>box.scrollIntoView({behavior:'smooth',block:'start'}),0);
    return true;
  }catch(error){
    console.error('V106 full report restore failed; using safe recovery report',error);
    return showRecoveryReport(normalized,title);
  }
}

function enrichParsedWithSavedSetterMetadata(parsed,match){
  if(!parsed || typeof parsed!=='object' || !match) return parsed;

  // V150.170: 保存一覧には2人分のIQが残っていても、PDF用のCSV復元時に
  // 可変幅のMetadata / SetterSummary行が正規化で欠ける場合がある。
  // 保存試合本体のセッター別情報をPDF復元データへ明示的に引き継ぐ。
  const fromSummary=Array.isArray(match?.summary?.setterIqs)
    ? match.summary.setterIqs.map((item,index)=>({
        role:String(item?.role||`Setter${index+1}`),
        num:String(item?.number||item?.num||'').trim(),
        name:String(item?.name||'').trim(),
        playerId:String(item?.playerId||match?.playerIdentities?.[String(item?.number||item?.num||'')]||'').trim(),
        order:index+1
      })).filter(item=>item.num)
    : [];
  const fromCsv=savedMatchSetterMeta(match).map((item,index)=>({
    role:String(item?.role||`Setter${index+1}`),
    num:String(item?.num||item?.number||'').trim(),
    name:String(item?.name||'').trim(),
    playerId:String(item?.playerId||match?.playerIdentities?.[String(item?.num||item?.number||'')]||'').trim(),
    order:index+1
  })).filter(item=>item.num);

  const merged=[];
  [...fromSummary,...fromCsv].forEach(item=>{
    if(!item.num || merged.some(existing=>existing.num===item.num)) return;
    merged.push(item);
  });

  if(merged.length){
    parsed.savedSetterMeta=merged.slice(0,2);
    parsed.setterCount=parsed.savedSetterMeta.length;
    parsed.setterNumbers=parsed.savedSetterMeta.map(item=>item.num);
  }
  parsed.teamId=String(parsed.teamId||match.teamId||match?.csv?.teamId||'');
  return parsed;
}

function loadSavedMatch(id){
  try{
    const m=getSavedMatches().find(x=>String(x.id)===String(id));
    if(!m){ alert('保存データが見つかりません。'); return; }

    // V126: the report host is inside the collapsed Data Management panel.
    // Open it first so the rendered report is actually visible on iPad/Safari.
    const dataManagement=document.getElementById('dataManagementCard');
    if(dataManagement) dataManagement.open=true;

    const source=m.csv||m.parsed||m.data||m;
    importedCsv=enrichParsedWithSavedSetterMetadata(
      recoveryNormalizePayload(source,m.fileName||m.title||'保存済みデータ'),
      m
    );
    try{ localStorage.setItem('setterTheoryReleaseImportedCsv',JSON.stringify(importedCsv)); }catch(_){}
    renderCsvPreview(importedCsv,importedCsv.fileName||m.title||'保存済みデータ');
    window.__setterTheorySavedReportAccordion=true;
    let shown;
    try{
      shown=showRestoredFullReport(importedCsv,m.title||'保存試合レポート');
    }finally{
      window.__setterTheorySavedReportAccordion=false;
    }
    if(shown===false) throw new Error('saved report could not be displayed');
  }catch(error){ console.error('saved report recovery failed',error); alert('保存試合のレポート表示中にエラーが発生しました。データは削除されていません。'); }
}
function savedMatchFileBase(match){
  const raw=String((match&&match.title)||(match&&match.fileName)||'setter_theory_match')
    .replace(/\.csv$/i,'')
    .replace(/[\\/:*?"<>|]+/g,'_')
    .trim();
  return raw || 'setter_theory_match';
}
function savedMatchCsvText(match){
  const parsed=recoveryNormalizePayload((match&&match.csv)||match,(match&&match.fileName)||(match&&match.title)||'保存試合');
  const headers=Array.isArray(parsed.headers)&&parsed.headers.length
    ? parsed.headers.map(String)
    : [...new Set((parsed.data||[]).flatMap(row=>Object.keys(row||{})))];
  const rows=[headers,...(parsed.data||[]).map(row=>headers.map(h=>row&&row[h]!==undefined?row[h]:''))];
  return rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\n');
}
function exportSavedMatchCsv(id){
  try{
    const match=getSavedMatches().find(x=>String(x.id)===String(id));
    if(!match){ alert('保存データが見つかりません。'); return; }
    const csv=savedMatchCsvText(match);
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`${savedMatchFileBase(match)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){
    console.error('saved CSV export failed',error);
    alert('CSVの保存に失敗しました。保存試合のデータは削除されていません。');
  }
}
function printSavedMatchPdf(id){
  try{
    const match=getSavedMatches().find(x=>String(x.id)===String(id));
    if(!match){ alert('保存データが見つかりません。'); return; }
    const parsed=enrichParsedWithSavedSetterMetadata(
      recoveryNormalizePayload(match.csv||match,match.fileName||match.title||'保存試合'),
      match
    );
    importedCsv=parsed;
    try{ localStorage.setItem('setterTheoryReleaseImportedCsv',JSON.stringify(parsed)); }catch(_){}
    printCsvReport();
  }catch(error){
    console.error('saved PDF export failed',error);
    alert('PDFの作成に失敗しました。保存試合のデータは削除されていません。');
  }
}

function deleteSavedMatch(id){
  if(!confirm('この保存試合を削除しますか？')) return;
  setSavedMatches(getSavedMatches().filter(x=>x.id!==id));
  renderSavedMatches();
}

function chooseRegisteredTeamForSavedMatch(currentTeamId=''){
  const teams=registeredTeamsForSetup().slice().sort((a,b)=>
    Number(b.year||0)-Number(a.year||0) ||
    String(a.name||'').localeCompare(String(b.name||''),'ja')
  );

  if(!teams.length){
    alert('先に「チーム・選手管理」でチームを登録してください');
    return null;
  }

  const choices=teams.map((team,index)=>{
    const current=String(team.id||'')===String(currentTeamId||'')?' ← 現在':'';
    return `${index+1}. ${team.name||'名称未設定'}（${team.year||'年度未設定'}年度）${current}`;
  }).join('\n');

  const answer=prompt(
    `再設定するチームの番号を入力してください\n\n${choices}\n\n0. チーム未設定へ戻す`,
    ''
  );

  if(answer===null) return null;
  const selected=Number(String(answer).trim());

  if(selected===0){
    return {teamId:'',teamName:'チーム未設定',teamYear:''};
  }

  if(!Number.isInteger(selected) || selected<1 || selected>teams.length){
    alert('一覧にある番号を入力してください');
    return null;
  }

  const team=teams[selected-1];
  return {
    teamId:String(team.id||''),
    teamName:String(team.name||'チーム未設定'),
    teamYear:String(team.year||'')
  };
}

function applySavedMatchTeamMeta(match,teamMeta){
  if(!match||!teamMeta) return;
  match.teamId=String(teamMeta.teamId||'');
  match.teamName=String(teamMeta.teamName||'チーム未設定');
  match.teamYear=String(teamMeta.teamYear||'');

  // 保存CSV側にも所属情報を反映し、後から開いた時も同じチームとして扱う。
  if(match.csv && typeof match.csv==='object'){
    match.csv.teamId=match.teamId;
    match.csv.teamName=match.teamName;
    match.csv.teamYear=match.teamYear;
  }
}

function reassignSavedMatchTeam(id){
  const list=getSavedMatches();
  const match=list.find(item=>String(item.id)===String(id));
  if(!match) return;

  const selected=chooseRegisteredTeamForSavedMatch(match.teamId);
  if(!selected) return;

  applySavedMatchTeamMeta(match,selected);
  setSavedMatches(list);
  renderSavedMatches();
}

function reassignUnassignedSavedMatches(){
  const list=getSavedMatches();
  const targets=list.filter(match=>savedMatchTeamGroupKey(match)==='unassigned');
  if(!targets.length){
    alert('チーム未設定の試合はありません');
    return;
  }

  const selected=chooseRegisteredTeamForSavedMatch('');
  if(!selected) return;

  const teamLabel=selected.teamName==='チーム未設定'
    ? 'チーム未設定'
    : `${selected.teamName}${selected.teamYear?`（${selected.teamYear}年度）`:''}`;

  const ok=confirm(
    `チーム未設定の${targets.length}試合を、すべて「${teamLabel}」へ再設定しますか？`
  );
  if(!ok) return;

  targets.forEach(match=>applySavedMatchTeamMeta(match,selected));
  setSavedMatches(list);
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
function savedMatchItemHtml(m){
  const d=m.savedAt ? new Date(m.savedAt) : new Date();
  const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const iqItems=savedMatchIqItems(m);
  const iqBadges=iqItems.length
    ? iqItems.map((item,index)=>{
        const iqRaw=Number.isFinite(Number(item.iq))?Number(item.iq):null;
        const iq=iqRaw===null?'--':Math.round(iqRaw);
        const iqClass=iqRaw===null?'iqEmpty':iqRaw>=90?'iqExcellent':iqRaw>=80?'iqGood':iqRaw>=70?'iqFair':'iqLow';
        const label=iqItems.length>1?`S${index+1}`:'IQ';
        const name=item.name?` ${escapeHtml(item.name)}`:'';
        return `<div class="savedIqUnit"><small>${label}${name}</small><div class="savedIqBadge ${iqClass}" aria-label="${label} Setter IQ ${iq}/100"><b>${iq}</b><span>/100</span></div></div>`;
      }).join('')
    : `<div class="savedIqUnit"><small>IQ</small><div class="savedIqBadge iqEmpty" aria-label="Setter IQ --/100"><b>--</b><span>/100</span></div></div>`;
  const total=iqItems.reduce((sum,item)=>sum+Number(item.total||0),0) || ((m.summary && m.summary.total) ? m.summary.total : 0);
  return `<div class="savedMatchItem">
    <div>
      <div class="savedMatchTitle">${escapeHtml(m.title||'無題の試合')}</div>
      <div class="savedMatchMeta">${escapeHtml(date)}　${escapeHtml(m.fileName||'CSV')}　トス${total}本</div>
    </div>
    <div class="savedMatchActions">
      <div class="savedIqBadgeGroup ${iqItems.length>1?'isTwoSetter':''}">${iqBadges}</div>
      <button class="miniBtn" type="button" onclick="loadSavedMatch('${m.id}')">レポート</button>
      <button class="miniBtn pdf" type="button" onclick="printSavedMatchPdf('${m.id}')">PDF</button>
      <button class="miniBtn csv" type="button" onclick="exportSavedMatchCsv('${m.id}')">CSV</button>
      <button class="miniBtn teamReassign" type="button" onclick="reassignSavedMatchTeam('${m.id}')">チーム再設定</button>
      <button class="miniBtn gray" type="button" onclick="renameSavedMatch('${m.id}')">名前</button>
      <button class="miniBtn danger" type="button" onclick="deleteSavedMatch('${m.id}')">削除</button>
    </div>
  </div>`;
}

function renderSavedMatches(){
  const listEl=document.getElementById('savedMatchList');
  const countEl=document.getElementById('savedMatchCount');
  if(!listEl) return;
  const list=getSavedMatches();
  if(countEl) countEl.textContent=`${list.length}件`;
  const backup=readSavedMatchStore(savedMatchesBackupKey());
  updateSavedMatchBackupState(backup&&backup.savedAt);
  renderCompareSelectors();
  setTimeout(()=>{ try{ renderGrowthDashboard(); }catch(e){ console.error('growth dashboard render failed',e); } },0);

  if(!list.length){
    listEl.innerHTML='<div class="csvSmall">保存された試合はまだありません。試合終了後、ここへ自動保存されます。</div>';
    return;
  }

  const grouped=new Map();
  list.forEach(match=>{
    const key=savedMatchTeamGroupKey(match);
    if(!grouped.has(key)){
      grouped.set(key,{meta:savedMatchTeamMeta(match),matches:[]});
    }
    grouped.get(key).matches.push(match);
  });

  const groups=[...grouped.values()].sort((a,b)=>{
    if(a.meta.teamName==='チーム未設定' && b.meta.teamName!=='チーム未設定') return 1;
    if(b.meta.teamName==='チーム未設定' && a.meta.teamName!=='チーム未設定') return -1;
    const yearDiff=Number(b.meta.teamYear||0)-Number(a.meta.teamYear||0);
    if(yearDiff) return yearDiff;
    return String(a.meta.teamName).localeCompare(String(b.meta.teamName),'ja');
  });

  listEl.innerHTML=groups.map((group,index)=>{
    const meta=group.meta;
    const yearLabel=meta.teamYear?`${escapeHtml(meta.teamYear)}年度`:'年度未設定';
    const latest=group.matches[0]?.savedAt ? new Date(group.matches[0].savedAt) : null;
    const latestText=latest&&!Number.isNaN(latest.getTime())
      ? `${latest.getFullYear()}/${String(latest.getMonth()+1).padStart(2,'0')}/${String(latest.getDate()).padStart(2,'0')}`
      : '';
    const open=index===0?' open':'';
    return `<details class="savedTeamGroup"${open}>
      <summary>
        <span class="savedTeamGroupName">${escapeHtml(meta.teamName)}</span>
        <span class="savedTeamGroupYear">${yearLabel}</span>
        <span class="savedTeamGroupCount">${group.matches.length}試合</span>
        ${latestText?`<span class="savedTeamGroupLatest">最新 ${escapeHtml(latestText)}</span>`:''}
      </summary>
      <div class="savedTeamGroupBody">
        ${savedMatchTeamGroupKey(group.matches[0])==='unassigned'
          ? `<div class="savedTeamBulkAction">
              <span>未設定の${group.matches.length}試合をまとめて移動できます</span>
              <button class="miniBtn teamReassign" type="button" onclick="reassignUnassignedSavedMatches()">まとめてチーム再設定</button>
            </div>`
          : ''}
        ${group.matches.map(savedMatchItemHtml).join('')}
      </div>
    </details>`;
  }).join('');
}

function matchOptionLabel(m){
  const d=m.savedAt ? new Date(m.savedAt) : new Date();
  const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  const iqItems=savedMatchIqItems(m);
  const iqText=iqItems.length
    ? iqItems.map((item,index)=>`${iqItems.length>1?`S${index+1} `:''}${item.iq===null?'--':Math.round(Number(item.iq))}`).join(' / ')
    : '-';
  return `${date}｜${m.title || m.fileName || '無題'}｜IQ ${iqText}`;
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
  return `<div class="compareComment"><b>Aquilaのアドバイス</b><ul>${lines.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
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

function growthPlayerStorageKey(){ return 'setterTheoryReleaseGrowthPlayerV2'; }
function normalizeGrowthPlayerName(value){
  return String(value||'').normalize('NFKC').trim().replace(/\s+/g,'').toLowerCase();
}
function growthPlayerIdentity(meta){
  const num=String(meta?.num||'').trim();
  const name=String(meta?.name||'').trim();
  const playerId=String(meta?.playerId||'').trim() || ensureStablePlayerId(name,num);
  if(playerId) return `id:${playerId}`;
  const normalizedName=normalizeGrowthPlayerName(name);
  if(normalizedName) return `name:${normalizedName}`;
  return num && num!=='-' && num!=='0' ? `num:${num}` : 'unknown';
}
function inferLegacySetterMeta(parsed){
  const headers=parsed?.headers||[];
  const rows=parsed?.data||[];
  const find=(names)=>findHeader(headers,names);
  const noCol=find(['No']);
  const typeCol=find(['Type','種類','Action','Skill','Play','プレー','項目','動作']);
  const numCol=find(['Number','背番号','Player','選手']);
  const nameCol=find(['Name','選手名']);
  const resultCol=find(['Result','結果','Outcome','評価','Eval','Grade']);
  const counts=new Map();
  rows.forEach(r=>{
    const tag=String(getCell(r,[noCol])||'').trim();
    if(tag==='SetterSummary' || tag==='SecondBallSummary') return;
    const type=String(getCell(r,[typeCol])||'').trim();
    const result=String(getCell(r,[resultCol])||'').trim();
    // 旧CSVでは通常トスだけを手掛かりに、最も多くトスした選手を登録セッターとして推定する。
    if(type!=='トス' || result==='二段トス') return;
    const num=String(getCell(r,[numCol])||'').trim();
    if(!num || num==='-' || num==='0') return;
    const name=String(getCell(r,[nameCol])||'').trim();
    const item=counts.get(num)||{num,name,count:0};
    item.count+=1;
    if(!item.name && name) item.name=name;
    counts.set(num,item);
  });
  const ranked=[...counts.values()].sort((a,b)=>b.count-a.count);
  if(!ranked.length) return [];
  // セッター情報が無い旧CSVは最多トスの1名だけを復元する。
  // 2人目をトス本数から推定すると、ワンセッター試合を誤ってツーセッター表示するため。
  return [{role:'Setter1',num:ranked[0].num,name:ranked[0].name||'',order:1,inferred:true}];
}
function savedMatchSetterMeta(match){
  try{
    const parsed=match?.csv||{};
    const explicit=importedSetterMeta(parsed);
    const metas=explicit.length ? explicit : inferLegacySetterMeta(parsed);
    return metas.map(meta=>{
      const stored=match?.playerIdentities?.[String(meta.num||'')] || meta.playerId || '';
      return {...meta,playerId:ensureStablePlayerId(meta.name,meta.num,stored)};
    });
  }catch(e){return [];}
}
function allGrowthPlayers(saved){
  const map=new Map();
  // 保存日時の古い順に読み、同一人物の表示背番号は最新試合のものへ更新する。
  [...(saved||[])].reverse().forEach(m=>savedMatchSetterMeta(m).forEach(meta=>{
    const key=growthPlayerIdentity(meta);
    if(key==='unknown') return;
    const current=map.get(key)||{key,num:'',name:''};
    current.num=String(meta.num||current.num||'');
    current.name=String(meta.name||current.name||'');
    map.set(key,current);
  }));
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja') || Number(a.num||999)-Number(b.num||999));
}
function renderGrowthPlayerSelector(saved){
  const select=document.getElementById('growthPlayerSelect');
  if(!select) return 'team';
  const players=allGrowthPlayers(saved);
  let wanted=localStorage.getItem(growthPlayerStorageKey())||localStorage.getItem('setterTheoryReleaseGrowthPlayerV1')||'team';
  select.innerHTML='<option value="team">チーム全体</option>'+players.map(p=>`<option value="${escapeHtml(p.key)}">#${escapeHtml(p.num)} ${escapeHtml(p.name||'名前未登録')}</option>`).join('');
  // 旧 name:/num: 形式の選択値を固定 playerId 形式へ自動移行する。
  if(wanted.startsWith('name:') || wanted.startsWith('num:')){
    const oldValue=wanted.slice(wanted.indexOf(':')+1);
    const migrated=players.find(p=>normalizeGrowthPlayerName(p.name)===normalizeGrowthPlayerName(oldValue) || String(p.num)===String(oldValue));
    if(migrated) wanted=migrated.key;
  }
  const valid=[...select.options].some(o=>o.value===wanted)?wanted:'team';
  select.value=valid;
  if(valid!==wanted) localStorage.setItem(growthPlayerStorageKey(),valid);
  return valid;
}
function changeGrowthPlayer(value){
  localStorage.setItem(growthPlayerStorageKey(),value||'team');
  renderGrowthDashboard();
}
function playerMatchesMeta(meta,key){
  return growthPlayerIdentity(meta)===key;
}
function savedMatchSetterSummary(match,meta){
  const rows=match?.csv?.data||[];
  const role=String(meta?.role||'').trim();
  const num=String(meta?.num||'').trim();
  const playerId=String(meta?.playerId||'').trim();
  const nameKey=normalizeGrowthPlayerName(meta?.name||'');
  const candidates=[];
  for(const r of rows){
    if(String(r?.[0]||'').trim()!=='SetterSummary') continue;
    if(String(r?.[1]||'').trim()==='Role') continue;
    const rowRole=String(r?.[1]||'').trim();
    const rowNum=String(r?.[2]||'').trim();
    const rowName=String(r?.[3]||'').trim();
    const rowPlayerId=String(r?.[13]||'').trim();
    let score=0;
    if(playerId && rowPlayerId && playerId===rowPlayerId) score=100;
    else if(nameKey && normalizeGrowthPlayerName(rowName)===nameKey) score=80;
    else if(num && rowNum===num) score=60;
    else if(!playerId && !nameKey && !num && role && rowRole===role) score=20;
    if(score) candidates.push({score,row:r});
  }
  if(!candidates.length) return null;
  const r=candidates.sort((a,b)=>b.score-a.score)[0].row;
  const total=Math.max(0,Number(r?.[5]||0));
  const miss=Math.max(0,Math.min(total,Number(r?.[6]||0)));
  return {
    setterIq:Number(r?.[4]||0), total, miss,
    successRate:total?Math.round((total-miss)/total*1000)/10:0,
    counts:{レフト:Number(r?.[8]||0),センター:Number(r?.[9]||0),ライト:Number(r?.[10]||0),バック:Number(r?.[11]||0),ツー:Number(r?.[12]||0)}
  };
}
function analyzeSetterForSavedMatch(match,key){
  const metas=savedMatchSetterMeta(match);
  const meta=metas.find(x=>playerMatchesMeta(x,key));
  if(!meta) return null;
  const ms=importedCsvToMatchState(match.csv||{});
  const num=String(meta.num||'');
  const toss=(ms.logs||[]).filter(x=>x.type==='トス' && String(x.num)===num);
  let counts={レフト:0,センター:0,ライト:0,バック:0,ツー:0};
  const terminalCounts={};
  toss.forEach(x=>{
    const label=counts[x.result]!==undefined ? x.result : classifyTossTarget(x.result);
    if(counts[label]===undefined) counts[label]=0;
    counts[label]++;
    const score=scoreParts(x.score||'');
    if(score && score.high>=20) addCount(terminalCounts,label);
  });
  let total=toss.length;
  let quality=tossQualityStats(toss);
  const summary=savedMatchSetterSummary(match,meta);
  // CSVのSetterSummaryがある場合は、ログ欠損や旧形式でも正しい母数を復元する。
  if(summary && summary.total>0){
    total=summary.total;
    counts=summary.counts;
    const miss=Math.max(0,summary.miss);
    const success=Math.max(0,total-miss);
    quality={total,miss,success,successRate:Math.round(success/total*1000)/10,missRate:Math.round(miss/total*1000)/10};
  }
  const scores=calcScores(counts,total,terminalCounts);
  const items=analysisItemsFromCounts(counts,total);
  return {
    key, num, name:meta.name||ms.players?.[num]||'', total, counts, items, quality,
    setterIq:(summary&&summary.setterIq)||scores.setterIq||0, balance:scores.balance||0, diversity:scores.diversity||0,
    quick:scores.quick||0, clutch:scores.clutch||0, stability:scores.stability||0,
    match
  };
}
function playerPctValue(a,label){
  const item=(a?.items||[]).find(x=>x.label===label);
  return item?Number(item.pct||0):0;
}
function playerGrowthTrendRows(list,key,label,suffix='',color=''){
  const rows=list.map(a=>{
    const val=key==='successRate'?Number(a.quality?.successRate||0):key==='missRate'?Number(a.quality?.missRate||0):key==='center'?playerPctValue(a,'センター'):key==='left'?playerPctValue(a,'レフト'):key==='right'?playerPctValue(a,'ライト'):Number(a[key]||0);
    const name=(a.match?.title||a.match?.fileName||'試合').replace(/^\d{4}\/\d{2}\/\d{2}\s*/, '');
    return `<div class="growthTrendRow"><div class="growthTrendName">${escapeHtml(name)}</div><div class="growthTrendTrack"><div class="growthTrendFill" style="width:${Math.max(2,Math.min(100,val))}%;${color?`background:${color}`:''}"></div></div><div>${val}${suffix}</div></div>`;
  }).join('');
  return `<div class="growthTrendPanel"><h4>${escapeHtml(label)}</h4>${rows}</div>`;
}
function buildPlayerGrowthAquila(first,last,metricDiffs={}){
  const iq=Number(last.setterIq||0)-Number(first.setterIq||0);
  const success=Number(metricDiffs.success??(Number(last.quality?.successRate||0)-Number(first.quality?.successRate||0)));
  const miss=Number(metricDiffs.miss??(Number(last.quality?.missRate||0)-Number(first.quality?.missRate||0)));
  const center=playerPctValue(last,'センター')-playerPctValue(first,'センター');
  const lines=[];
  if(iq>0) lines.push(`Setter IQが${iq}上がっています。配球判断の積み重ねが数字に表れています。`);
  else if(iq<0) lines.push(`Setter IQは${Math.abs(iq)}下がっています。配球の偏りと勝負所を確認しましょう。`);
  else lines.push('Setter IQは同水準です。トス技術と配球の内訳を見比べましょう。');
  if(success>0) lines.push(`トス成功率が${success}%上がっています。技術面の安定が見えます。`);
  if(miss>0) lines.push(`トスミス率が${miss}%増えています。判断と技術を分けて振り返りましょう。`);
  else if(miss<0) lines.push(`トスミス率が${Math.abs(miss)}%下がっています。精度の改善が見えます。`);
  if(center>=5) lines.push(`センター使用率が${center}%増え、攻撃の幅が広がっています。`);
  return lines.slice(0,3);
}
function renderPlayerGrowthDashboard(saved,key,body,count){
  const all=([...saved].reverse()).map(m=>analyzeSetterForSavedMatch(m,key)).filter(Boolean);
  const recent=all.slice(-5);
  const player=all[all.length-1]||null;
  if(count) count.textContent=player?`#${player.num} ${player.name||''}・${all.length}試合`:'対象試合なし';
  if(all.length<2){
    body.innerHTML=`<div class="csvSmall">この選手の保存試合が2件以上あると、個人成長推移を表示できます。現在 ${all.length}件です。</div>`;
    return;
  }
  const first=recent[0], last=recent[recent.length-1];
  const iqDiff=Number(last.setterIq||0)-Number(first.setterIq||0);
  const centerDiff=playerPctValue(last,'センター')-playerPctValue(first,'センター');
  const cumulativeTotal=all.reduce((sum,a)=>sum+Number(a.quality?.total||a.total||0),0);
  const cumulativeMiss=all.reduce((sum,a)=>sum+Number(a.quality?.miss||0),0);
  const cumulativeSuccess=Math.max(0,cumulativeTotal-cumulativeMiss);
  const cumulativeSuccessRate=cumulativeTotal?Math.round(cumulativeSuccess/cumulativeTotal*1000)/10:0;
  const cumulativeMissRate=cumulativeTotal?Math.round(cumulativeMiss/cumulativeTotal*1000)/10:0;
  // 累計カードの差分は「最新試合追加前の累計」と比較する。
  // 以前は最新試合単体と最古試合単体を比較していたため、累計93.3%の横に-100%など誤解を招く表示が出ていた。
  const previous=all.slice(0,-1);
  const previousTotal=previous.reduce((sum,a)=>sum+Number(a.quality?.total||a.total||0),0);
  const previousMiss=previous.reduce((sum,a)=>sum+Number(a.quality?.miss||0),0);
  const previousSuccess=Math.max(0,previousTotal-previousMiss);
  const previousSuccessRate=previousTotal?Math.round(previousSuccess/previousTotal*1000)/10:0;
  const previousMissRate=previousTotal?Math.round(previousMiss/previousTotal*1000)/10:0;
  const round1=v=>Math.round(Number(v||0)*10)/10;
  const successDiff=previousTotal?round1(cumulativeSuccessRate-previousSuccessRate):0;
  const missDiff=previousTotal?round1(cumulativeMissRate-previousMissRate):0;
  const advice=buildPlayerGrowthAquila(first,last,{success:successDiff,miss:missDiff});
  body.innerHTML=`
    <div class="playerGrowthHeader"><div><b>#${escapeHtml(last.num)} ${escapeHtml(last.name||'')}</b><small>全${all.length}試合・直近${recent.length}試合の推移</small></div><div class="playerGrowthBadge">選手別</div></div>
    <div class="growthSummary">
      ${growthMetricCard('Setter IQ',Number(last.setterIq||0),iqDiff)}
      ${growthMetricCard('累計トス成功率',cumulativeSuccessRate,successDiff,'%')}
      ${growthMetricCard('累計トスミス率',cumulativeMissRate,missDiff,'%',true)}
      ${growthMetricCard('センター使用率',playerPctValue(last,'センター'),centerDiff,'%')}
    </div>
    <div class="csvSmall">累計通常トス ${cumulativeTotal}本 ／ トスミス ${cumulativeMiss}本（二段トスは含みません）</div>
    <div class="growthAquila"><b>Aquilaの個人成長コメント</b><ul>${advice.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    ${playerGrowthTrendRows(recent,'setterIq','Setter IQ 推移')}
    ${playerGrowthTrendRows(recent,'successRate','トス成功率 推移','%','#16a34a')}
    <div class="growthDistribution">
      ${playerGrowthTrendRows(recent,'missRate','トスミス率 推移','%','#dc2626')}
      ${playerGrowthTrendRows(recent,'center','センター使用率 推移','%','#f59e0b')}
    </div>`;
}

function renderGrowthDashboard(){
  const body=document.getElementById('growthDashboardBody');
  const count=document.getElementById('growthMatchCount');
  if(!body) return;
  const saved=getSavedMatches();
  const selected=renderGrowthPlayerSelector(saved);
  if(selected!=='team'){
    renderPlayerGrowthDashboard(saved,selected,body,count);
    return;
  }
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



function importedSetterMetadata(parsed){
  // V150.170: 保存試合PDFでは、正規化後も保持される直接メタデータを最優先する。
  const directNumbers=Array.isArray(parsed?.setterNumbers)
    ? parsed.setterNumbers.map(value=>String(value||'').trim()).filter(Boolean).slice(0,2)
    : [];
  const directCount=parsed?.setterCount===null||parsed?.setterCount===undefined||parsed?.setterCount===''
    ? null
    : Math.max(0,Math.min(2,Number(parsed.setterCount)||0));
  if(directNumbers.length || directCount!==null){
    return {
      count:directCount===null?directNumbers.length:directCount,
      numbers:directNumbers,
      teamId:String(parsed?.teamId||'')
    };
  }

  const rows=parsed?.data||[];
  const metadata=rows.find(r=>String(r?.[0]||'').trim()==='Metadata');
  if(!metadata) return {count:null,numbers:[],teamId:String(parsed?.teamId||'')};
  const result={count:null,numbers:[],teamId:String(parsed?.teamId||'')};
  for(let i=1;i<metadata.length-1;i+=2){
    const key=String(metadata[i]||'').trim();
    const value=String(metadata[i+1]||'').trim();
    if(key==='SetterCount' && value!=='') result.count=Math.max(0,Math.min(2,Number(value)||0));
    if(key==='SetterNumbers') result.numbers=value.split('|').map(x=>x.trim()).filter(Boolean);
    if(key==='TeamId') result.teamId=value;
  }
  return result;
}

function registeredSetterMetaForImported(found,teamId=''){
  if(!found.length) return [];
  let teams=[];
  try{
    const parsed=JSON.parse(localStorage.getItem('setterTheoryReleaseTeamsV1')||'[]');
    teams=Array.isArray(parsed)?parsed:[];
  }catch(_){ teams=[]; }

  const candidates=teamId ? teams.filter(t=>String(t.id||'')===String(teamId)) : teams;
  let best=null;
  candidates.forEach(team=>{
    const players=Array.isArray(team.players)?team.players:[];
    let score=0;
    const matchedSetters=[];
    found.forEach(meta=>{
      const name=String(meta.name||'').normalize('NFKC').trim();
      const num=String(meta.num||'').trim();
      const player=players.find(p=>{
        const pn=String(p.number||'').trim();
        const pName=String(p.name||'').normalize('NFKC').trim();
        return (num && pn===num && name && pName===name) ||
               (num && pn===num) ||
               (name && pName===name);
      });
      if(player){
        score += String(player.number||'').trim()===num && String(player.name||'').normalize('NFKC').trim()===name ? 3 : 1;
        if(player.isSetter) matchedSetters.push(meta);
      }
    });
    if(!best || score>best.score) best={score,matchedSetters};
  });

  if(best && best.score>0 && best.matchedSetters.length){
    return [...new Map(best.matchedSetters.map(x=>[String(x.num),x])).values()].slice(0,2);
  }
  return [];
}

// V93.5: CSV末尾のSetterSummary、または各ログ行のSetterRoleから登録セッターを復元する。
function importedSetterMeta(parsed){
  const headers=parsed?.headers||[];
  const rows=parsed?.data||[];
  const find=(names)=>findHeader(headers,names);
  const noCol=find(['No']);
  const setCol=find(['Set','セット']);
  const rotCol=find(['Rotation','ローテーション','Rot','ローテ']);
  const typeCol=find(['Type','種類','Action','Skill','Play','プレー','項目','動作']);
  const numCol=find(['Number','背番号','Player','選手']);
  const nameCol=find(['Name','選手名']);
  const roleCol=find(['SetterRole','セッター区分','Role']);
  const found=[];
  const push=(role,num,name,playerId='')=>{
    num=String(num||'').trim();
    name=String(name||'').trim();
    role=String(role||'').trim();
    playerId=String(playerId||'').trim();
    if(!num || num==='-' || num==='0' || /^number$/i.test(num)) return;
    const order=(role.match(/(\d+)/)||[])[1] ? Number((role.match(/(\d+)/)||[])[1]) : 99;
    if(!found.some(x=>x.num===num)) found.push({role,num,name,playerId,order});
    else { const x=found.find(x=>x.num===num); if(x&&name&&!x.name)x.name=name; if(x&&playerId&&!x.playerId)x.playerId=playerId; }
  };

  // downloadCSV() が末尾へ追加する可変幅のSetterSummary行を読む。
  rows.forEach(r=>{
    if(String(getCell(r,[noCol])||'').trim()!=='SetterSummary') return;
    const role=String(r?.[1]||'').trim();
    if(!/^Setter\d+$/i.test(role)) return; // 見出し行は除外
    push(role,r?.[2],r?.[3],r?.[13]);
  });

  // Summaryが無い旧CSVでは、通常ログ行のSetterRole列から復元する。
  if(!found.length){
    rows.forEach(r=>{
      const role=getCell(r,[roleCol]);
      if(!/^Setter\d+$/i.test(role)) return;
      push(role,getCell(r,[numCol]),getCell(r,[nameCol]));
    });
  }
  found.sort((a,b)=>a.order-b.order);

  // V150.170: 保存試合本体から引き継いだ2人分を、PDFカード生成の正解として使う。
  const savedMeta=Array.isArray(parsed?.savedSetterMeta)
    ? parsed.savedSetterMeta.map((item,index)=>({
        role:String(item?.role||`Setter${index+1}`),
        num:String(item?.num||item?.number||'').trim(),
        name:String(item?.name||'').trim(),
        playerId:String(item?.playerId||'').trim(),
        order:Number(item?.order||index+1)
      })).filter(item=>item.num).slice(0,2)
    : [];
  if(savedMeta.length) return savedMeta;

  const metadata=importedSetterMetadata(parsed);

  // V150.162以降で保存した試合は、保存時のセッター人数・背番号をそのまま使用する。
  if(metadata.numbers.length){
    const byNumber=metadata.numbers.map((num,index)=>{
      const existing=found.find(x=>String(x.num)===String(num));
      return existing || {role:`Setter${index+1}`,num:String(num),name:'',playerId:'',order:index+1};
    });
    return byNumber.slice(0,metadata.count===null?2:metadata.count);
  }
  if(metadata.count!==null){
    return found.slice(0,metadata.count);
  }

  // 既存の保存試合は、チーム管理に登録された「セッター：はい」と照合して補正する。
  // 1名だけ登録されているチームなら、誤って作られたSetter2を除外する。
  const registered=registeredSetterMetaForImported(found,metadata.teamId);
  if(registered.length) return registered;

  // V150.163:
  // SetterSummary / SetterRoleが無い旧CSVでは、通常トス最多の1名を
  // セッター分析①の対象として復元する。
  // 現在開いている別試合のsetterNumsを流用しない。
  if(!found.length){
    return inferLegacySetterMeta(parsed).slice(0,1);
  }

  // 明示情報が残る旧データはSetter1のみを安全側で復元する。
  return found.slice(0,1);
}

// V74: Setter Theory CSVを試合中と同じレポートエンジンで表示する。
function importedCsvToMatchState(parsed){
  const headers=parsed?.headers||[];
  const rows=parsed?.data||[];
  const find=(names)=>findHeader(headers,names);
  const noCol=find(['No']);
  const setCol=find(['Set','セット']);
  const rotCol=find(['Rotation','ローテーション','Rot','ローテ']);
  const typeCol=find(['Type','種類','Action','Skill','Play','プレー','項目','動作']);
  const numCol=find(['Number','背番号','Player','選手']);
  const nameCol=find(['Name','選手名']);
  const posCol=find(['Position','位置','ポジション']);
  const resultCol=find(['Result','結果','Outcome','評価','Eval','Grade']);
  const tossMissCol=find(['TossMiss','トスミス','Toss Mistake']);
  const pointCol=find(['Point','得点']);
  const scoreCol=find(['Score','スコア']);
  const timeCol=find(['Time','時刻']);
  const logs=rows.filter(r=>{
    const tag=String(getCell(r,[noCol])||'').trim();
    // CSV末尾の集計行・見出し行をプレーログへ混ぜない。
    return tag!=='SetterSummary' && tag!=='SecondBallSummary';
  }).map((r,i)=>({
    no:getCell(r,[noCol]) || String(i+1),
    set:getCell(r,[setCol]) || '1',
    rot:getCell(r,[rotCol]) || 'S1',
    type:getCell(r,[typeCol]) || '',
    num:getCell(r,[numCol]) || '-',
    pos:getCell(r,[posCol]) || '',
    result:getCell(r,[resultCol]) || '',
    tossMist:['1','true','yes','ミス','○'].includes(String(getCell(r,[tossMissCol])||'').toLowerCase()),
    point:getCell(r,[pointCol]) || '',
    score:getCell(r,[scoreCol]) || '',
    time:getCell(r,[timeCol]) || ''
  })).filter(x=>x.type || x.result || x.point);
  const players={};
  rows.forEach(r=>{
    const n=getCell(r,[numCol]);
    const name=getCell(r,[nameCol]);
    if(n && n!=='-' && name) players[String(n)]=name;
  });
  const setterMeta=importedSetterMeta(parsed);
  setterMeta.forEach(x=>{ if(x.name) players[String(x.num)]=x.name; });
  const nums=[...new Set(logs.map(x=>String(x.num||'')).filter(x=>x && x!=='-' && x!=='0'))];
  const setterNums=setterMeta.map(x=>String(x.num)).filter(Boolean);
  // ログに登場しない登録セッターも選手一覧へ保持する。
  setterNums.forEach(n=>{ if(!nums.includes(n)) nums.push(n); });
  const last=logs[logs.length-1]||{};
  const score=scoreParts(last.score||'');
  const rotMatch=String(last.rot||'S1').match(/(\d+)/);
  const restoredNums=nums.length?nums:s.nums.slice();
  // V150.163: 保存試合は保存データから復元したセッターだけを使用する。
  // 現在進行中・直前の試合のセッター設定を流用すると、
  // セッター分析①に別選手が表示されるためフォールバックを廃止。
  const restoredSetters=setterNums.slice(0,2);
  return {
    ...s,
    team:'自チーム', oppTeam:'相手',
    setNo:String(last.set||'1').replace(/^S/i,'') || '1',
    nums:restoredNums,
    players:{...s.players,...players},
    setterNums:restoredSetters,
    setterIndex:Math.max(0,restoredNums.indexOf(String(restoredSetters[0]||''))),
    rot:rotMatch?Math.max(1,Math.min(6,Number(rotMatch[1]))):1,
    my:score?score.my:0, op:score?score.op:0,
    logs, hist:[]
  };
}
function withImportedMatchState(parsed,fn){
  const original=s;
  s=importedCsvToMatchState(parsed);
  try{return fn(s);}finally{s=original;}
}
function buildImportedUnifiedReport(parsed){
  const dash=document.getElementById('reportDashboard');
  const sub=document.getElementById('reportSub');
  if(!dash) return '';
  const oldDash=dash.innerHTML;
  const oldSub=sub?sub.textContent:'';
  const oldRankingsOpen=reportRankingsOpen;
  const oldRecentLogsOpen=reportRecentLogsOpen;
  let html='';
  withImportedMatchState(parsed,()=>{
    reportRankingsOpen=importedReportRankingsOpen;
    reportRecentLogsOpen=importedReportRecentLogsOpen;
    report();
    // CSV画面には上部の共通ヘッダーを別途表示するため、
    // 試合レポート側の重複ヘッダー（PDF/CSVボタンを含む）は除外する。
    const holder=document.createElement('div');
    holder.innerHTML=dash.innerHTML;
    const duplicateBrand=holder.querySelector('.unifiedReportBrand');
    if(duplicateBrand) duplicateBrand.remove();

    // V150.146: 保存した試合レポートのランキング開閉は、
    // 通常試合レポートではなく保存レポート自身を再描画する。
    const importedRankingToggle=holder.querySelector('#personalRankingHost .reportAccordionToggle');
    if(importedRankingToggle) importedRankingToggle.setAttribute('onclick','toggleImportedReportRankings()');

    // V150.151: 保存した試合レポートの全ログは、分析カード内「直近ログ」の
    // 「すべて表示」ボタンでだけ展開し、レポート最下部へ分離しない。
    const recentSection=[...holder.querySelectorAll('.setterUnifiedBottomGrid .reportAccordion')]
      .find(section=>String(section.querySelector('.reportAccordionToggle span')?.textContent||'').includes('直近ログ'));
    if(recentSection){
      const importedRecentToggle=recentSection.querySelector('.reportAccordionToggle');
      if(importedRecentToggle) importedRecentToggle.setAttribute('onclick','toggleImportedReportRecentSection()');
      const body=recentSection.querySelector('.reportAccordionBody');
      if(body){
        const source=importedReportRecentLogsExpanded?s.logs:s.logs.slice(-5);
        const iconFor=x=>{if(isMissResult(x)) return ['×','tMiss']; if(x.result==='被ブロック') return ['△','tBlock']; if(x.result==='継続') return ['−','tCont']; return ['○','tSuccess'];};
        const items=source.map(x=>{const [ic,cls]=iconFor(x);return `<div class="timelineItem"><div class="timelineNo">${x.no}</div><div class="timelineIcon ${cls}">${ic}</div><div class="timelineText">${effectivePlayType(x)}${isTossMissLog(x)?'・ミス':''}</div></div>`;}).join('');
        const label=importedReportRecentLogsExpanded?`全${s.logs.length}プレー`:'最新5プレー';
        const toggle=s.logs.length>5?`<button class="recentLogToggle" type="button" onclick="toggleImportedReportRecentLogs()">${importedReportRecentLogsExpanded?'5件表示に戻す':'すべて表示'}</button>`:'';
        body.innerHTML=`<div class="reportAccordionSubhead">${label}</div><div class="timeline">${items}</div>${toggle}<div class="logLegend"><span>🟢 成功系</span><span>🔵 継続</span><span>🔴 ミス</span><span>🟠 被ブロック</span></div>`;
      }
    }

    // V135 saved-report fix: 保存した試合から開くレポートでも、
    // コート入力後のレポートと同じ横棒グラフを必ず表示する。
    const playSuccessHead=[...holder.querySelectorAll('.reportPanel h3')]
      .find(h=>String(h.textContent||'').replace(/\s/g,'').startsWith('プレー別成功率'));
    if(playSuccessHead){
      const panel=playSuccessHead.closest('.reportPanel');
      if(panel) panel.innerHTML=`<h3>プレー別 成功率</h3>${buildActionSuccessAnalysis()}`;
    }
    html=holder.innerHTML;
  });
  reportRankingsOpen=oldRankingsOpen;
  reportRecentLogsOpen=oldRecentLogsOpen;
  dash.innerHTML=oldDash;
  if(sub) sub.textContent=oldSub;
  return html;
}
function printCsvReport(){
  if(!importedCsv){ alert('CSVを読み込んでからPDF出力してください。'); return; }
  // 試合終了直後と同じPDF生成処理を使用する。
  withImportedMatchState(importedCsv,()=>printMatchPdfReport());
}
function renderCsvAnalysis(parsed){
  const box=document.getElementById('csvAnalysisBox');
  if(!box) return;
  if(!parsed || !(parsed.data||[]).length){ box.style.display='none'; box.innerHTML=''; return; }
  const unified=buildImportedUnifiedReport(parsed);
  const a=analyzeImportedCsv(parsed);
  const csvRank=setterIqRank(a.setterIq||0);
  box.style.display='block';
  const importedState=importedCsvToMatchState(parsed);
  const reportDate=(parsed.data&&parsed.data[0]&&parsed.data[0].Time)?String(parsed.data[0].Time):new Date().toLocaleDateString();
  const sharedBrand=buildUnifiedReportBrandHeader(importedState,a,{dateText:reportDate,actionsHtml:`<button class="ghostBtn unifiedReportAction" type="button" onclick="printCsvReport()">PDFレポート出力</button>`});
  box.innerHTML=`
    ${sharedBrand}
    <div class="importedUnifiedReport">${unified}</div>
    <div class="saveCurrentBox"><input id="matchSaveName" value="${escapeHtml(suggestedMatchName())}" placeholder="試合名"><button class="csvFileBtn" type="button" onclick="saveCurrentMatch()">💾 この試合を保存</button></div>
    <div class="csvMemo"><b>📝 セッター思考メモ</b><textarea id="setterMemo" placeholder="例：相手MBがライト寄りだったので、序盤にセンターを見せてからレフトを使った。"></textarea><div class="csvSmall">このメモは保存データに残せます。</div></div>
  `;
}

document.addEventListener("DOMContentLoaded",()=>{
  setupCsvImport();
  renderSavedMatches();
  renderCompareSelectors();
  renderGrowthDashboard();
  applyInputView();
  load();
  updateHomeMatchControls();
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") save(); });
  document.querySelectorAll(".setupSpot").forEach(b=>{
    const idx=Number(b.dataset.spot);
    setupLongPressBind(b,'court',idx);
    b.addEventListener("click",(e)=>{
      if(e.target.classList.contains("posSelect") || e.target.classList.contains("nameSelect")) return;
      if(setupHoldTriggered){ setupHoldTriggered=false; return; }
      if(setupCarry){ placeSetupCarryAtCourt(idx); return; }
      setupSelected=idx; renderSetup();
    });
    b.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ if(setupCarry) placeSetupCarryAtCourt(idx); else {setupSelected=idx;renderSetup();} }});
  });
  document.querySelectorAll(".nameSelect").forEach(sel=>sel.addEventListener("change",(e)=>{
    const i=Number(e.target.dataset.nameSelect);
    const no=e.target.value;
    replaceCourtNumber(i,no,{transferSetter:true});
    setupSelected=i;
    save(); renderSetup(); renderMatchNumberBank(); render();
  }));
  document.querySelectorAll(".player").forEach(b=>b.addEventListener("click",()=>{ pulseElement(b); add(b.dataset.pos); }));
  document.querySelectorAll(".fastBtn[data-type][data-result]").forEach(b=>b.addEventListener("click",()=>{
    pulseElement(b);
    vibrateTap();
    const group=b.closest(".fastGroup");
    if(group && group.dataset.accGroup && inputView==="simple" && !openInputGroups.includes(group.dataset.accGroup)){
      openInputGroups.push(group.dataset.accGroup);
      saveOpenInputGroups();
    }
    // V93: トス内で二段トスモード中は、通常トスと別データとして記録する。
    const playType=(b.dataset.type==="トス" && secondBallMode) ? "二段トス" : b.dataset.type;
    setPlay(playType, b.dataset.result);
  }));
  if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{});}
  renderSetup();
  render();
  updateSecondBallModeUi();
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

  status.innerHTML = `✅ 読み込み完了：${escapeHtml(fileName)}<div class="csvSmall">列数 ${headers.length} / データ行 ${rows.length}</div>`;

  // V150.152: CSVの生ログ一覧は、保存レポート内「直近ログ」に統合済み。
  // データ管理カード下部へ1〜全件を重複表示しない。
  box.style.display = "none";
  box.innerHTML = "";
  return;

  if(!headers.length){
    box.style.display = "block";
    box.innerHTML = "<div style='padding:12px;font-weight:1000'>CSVの列を読み取れませんでした。</div>";
    return;
  }

  const aliases = {
    no:["No","NO","No.","NO.","番号","ログNo","ログ番号"],
    type:["Type","種類","プレー","項目"],
    name:["Name","名前","選手名","Player"],
    result:["Result","結果","判定"],
    score:["Score","スコア","得点"]
  };
  const findHeader = (keys)=>{
    const lower = headers.map(h=>String(h).trim().toLowerCase());
    for(const key of keys){
      const idx = lower.indexOf(String(key).trim().toLowerCase());
      if(idx >= 0) return headers[idx];
    }
    return "";
  };
  const keyMap = Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,findHeader(v)]));
  const valueFor = (row,key,fallback="-")=>{
    const h=keyMap[key];
    const value=h ? row[h] : "";
    return String(value ?? "").trim() || fallback;
  };

  const noHeader=keyMap.no;
  const playableRows=rows.filter(row=>{
    const raw=noHeader ? String(row[noHeader] ?? "").trim() : "";
    return /^\d+$/.test(raw);
  });
  const detailFields=[
    {label:"セット", aliases:["Set","セット"]},
    {label:"ローテーション", aliases:["Rotation","ローテーション","Rot","ローテ"]},
    {label:"背番号", aliases:["Number","背番号"]},
    {label:"ポジション", aliases:["Position","ポジション"]},
    {label:"結果詳細", aliases:["Result","結果","判定"]},
    {label:"トスミス", aliases:["TossMiss","トスミス"]},
    {label:"ポイント", aliases:["Point","ポイント","得点状況"]},
    {label:"スコア", aliases:["Score","スコア"]},
    {label:"プレー時間", aliases:["Time","時間"]},
    {label:"セッターIQ", aliases:["SetterIQ","セッターIQ"]},
    {label:"トス成功率", aliases:["SetterTossSuccessRate","トス成功率"]}
  ];
  const detailHeaderMap=detailFields.map(field=>({
    ...field,
    header:findHeader(field.aliases)
  })).filter(field=>field.header);

  box.style.display = "block";
  box.innerHTML = `
    <div class="csvLogCards">
      ${playableRows.map((row,index)=>{
        const no=valueFor(row,"no",String(index+1));
        const type=valueFor(row,"type");
        const name=valueFor(row,"name");
        const result=valueFor(row,"result");
        const score=valueFor(row,"score");
        const details=detailHeaderMap.map(field=>{
          const value=String(row[field.header] ?? "").trim();
          if(!value) return "";
          return `<div class="csvLogDetailItem"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
        }).join("");
        return `
          <details class="csvLogCard">
            <summary class="csvLogSummary">
              <span class="csvLogNo">${escapeHtml(no)}</span>
              <span class="csvLogMain"><strong>${escapeHtml(type)}</strong><small>${escapeHtml(name)}</small></span>
              <span class="csvLogResult">${escapeHtml(result)}</span>
              <span class="csvLogScore">${escapeHtml(score)}</span>
              <span class="csvLogChevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="csvLogDetails">${details || '<div class="csvLogEmpty">詳細データはありません</div>'}</div>
          </details>`;
      }).join("") || '<div class="csvLogEmpty">試合ログはありません</div>'}
    </div>
    <div class="csvSmall" style="padding:10px 12px">各ログをタップすると、試合確認に必要な詳細を表示できます。</div>
  `;
}

function escapeAttr(v){ return String(v).replace(/\\/g,"\\\\").replace(/\'/g,"\\\'").replace(/"/g,"&quot;"); }
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
      try{
        let text='';
        if(typeof file.text==='function') text=await file.text();
        else text=await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsText(file); });
        const parsed=parseCSVText(text);
        importedCsv=recoveryNormalizePayload({fileName:file.name,...parsed},file.name);
        try{ localStorage.setItem("setterTheoryReleaseImportedCsv",JSON.stringify(importedCsv)); }catch(_){}
        renderCsvPreview(importedCsv,file.name);
        showRestoredFullReport(importedCsv,`${file.name} レポート`);
      }catch(error){ console.error('CSV recovery import failed',error); alert('CSVを読み込めませんでした。ファイルは変更されていません。'); }
    });
  }

  if(clear){
    clear.addEventListener("click", ()=>{
      importedCsv = null;
      localStorage.removeItem("setterTheoryReleaseImportedCsv");
      if(input) input.value = "";
      if(status) status.textContent = "未読み込み";
      if(box){ box.style.display = "none"; box.innerHTML = ""; }
      renderCsvAnalysis(null);
    });
  }

  const saved = localStorage.getItem("setterTheoryReleaseImportedCsv");
  if(saved){
    try{
      importedCsv = JSON.parse(saved);
      renderCsvPreview(importedCsv, importedCsv.fileName || "保存済みCSV");
      showRestoredFullReport(importedCsv,`${importedCsv.fileName||'保存済みCSV'} レポート`);
    }catch(e){}
  }
}



// V62: close the on-screen keyboard when tapping a non-interactive area.
(function installNaturalKeyboardDismiss(){
  function isEditableOrControl(el){
    return !!(el && el.closest && el.closest('input, textarea, select, button, [contenteditable="true"], label, a'));
  }
  document.addEventListener('pointerdown', function(e){
    const active=document.activeElement;
    const editing=active && (active.matches('input, textarea, [contenteditable="true"]'));
    if(editing && !isEditableOrControl(e.target)) active.blur();
  }, {passive:true});
})();

// V118: アプリ切替・タブ非表示・終了時にも途中データを同期保存する。
window.addEventListener("pagehide",()=>{ try{ save("pagehide"); }catch(_){} });
window.addEventListener("beforeunload",()=>{ try{ save("beforeunload"); }catch(_){} });
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){ try{ save("visibility-hidden"); }catch(_){} }
});
