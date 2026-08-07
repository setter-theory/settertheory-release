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
  state.userId=String(state.userId||localStorage.getItem('setterTheoryUserId')||createEntityId('user'));
  localStorage.setItem('setterTheoryUserId',state.userId);
  state.teamId=String(state.teamId||localStorage.getItem('setterTheoryTeamId')||createEntityId('team'));
  localStorage.setItem('setterTheoryTeamId',state.teamId);
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
let inputView = localStorage.getItem("setterTheoryInputView") || "simple";
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
let mineGroupOrder = normalizeGroupOrder(readJsonArray("setterTheoryMineGroupOrder", defaultMineGroupOrder), defaultMineGroupOrder);
let oppGroupOrder = normalizeGroupOrder(readJsonArray("setterTheoryOppGroupOrder", defaultOppGroupOrder), defaultOppGroupOrder);
let orderEditSide = "mine";
let heldOrderGroup = null;
let orderHoldTimer = null;
const groupOrder = ["attack","serve","receive","toss","dig","block"];
function readJsonArray(key, fallback){
  try{ const v=JSON.parse(localStorage.getItem(key)||"null"); return Array.isArray(v)?v:fallback; }catch(e){ return fallback; }
}
let openInputGroups = readJsonArray("setterTheoryOpenGroups", ["attack"]);
let favoriteInputGroups = readJsonArray("setterTheoryFavoriteGroups", ["toss","dig"]);
let favoritePlays = readJsonArray("setterTheoryFavoritePlays", [
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
  localStorage.setItem("setterTheoryMineGroupOrder", JSON.stringify(mineGroupOrder));
  localStorage.setItem("setterTheoryOppGroupOrder", JSON.stringify(oppGroupOrder));
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
  localStorage.setItem("setterTheoryOpenGroups", JSON.stringify(openInputGroups));
}
function saveFavoriteInputGroups(){
  localStorage.setItem("setterTheoryFavoriteGroups", JSON.stringify(favoriteInputGroups));
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
  localStorage.setItem("setterTheoryInputView", inputView);
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
  localStorage.setItem("setterTheoryFavoritePlays", JSON.stringify(favoritePlays));
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
  const toss=(logs||[]).filter(x=>x.type==="トス");
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
function secondBallLogs(logs=s.logs){ return (logs||[]).filter(x=>x.type==="二段トス"); }
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
    localStorage.setItem("setterTheoryV2Emergency", JSON.stringify(emergency));

    const serialized=JSON.stringify(s);
    localStorage.setItem("setterTheoryV2", serialized);
    localStorage.setItem("setterTheoryV2Backup", serialized);

    const verified=JSON.parse(localStorage.getItem("setterTheoryV2")||"null");
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
  const candidates=["setterTheoryV2","setterTheoryV2Backup","setterTheoryV2Emergency"]
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
  const active=setterNumbers();
  const out=[...active];
  const candidates=[...new Set((s.logs||[])
    .filter(x=>x && x.type==='トス' && String(x.result||'')!=='二段トス')
    .map(x=>String(x.playerNumberSnapshot||x.num||'').trim())
    .filter(n=>n && n!=='-' && n!=='undefined' && n!=='null'))];

  // 基本ポジションで明示されたセッターは、トス本数に関係なく保持する。
  candidates.forEach(n=>{
    if(isSetterPosition(playerPositionForNumber(n)) && !out.includes(n)) out.push(n);
  });

  // 旧データのセッター交代を復元するための補助判定。
  // 最多セッターに対して35%以上、かつ2本以上の通常トスがある場合だけ追加する。
  const tossCounts=candidates.map(n=>({
    num:n,
    count:(s.logs||[]).filter(x=>x && x.type==='トス' && String(x.result||'')!=='二段トス' && logBelongsToPlayer(x,n)).length
  })).sort((a,b)=>b.count-a.count);
  const maxCount=tossCounts[0]?.count||0;
  tossCounts.forEach(x=>{
    if(!out.includes(x.num) && x.count>=2 && x.count>=Math.ceil(maxCount*0.35)) out.push(x.num);
  });
  return [...new Set(out)].slice(0,2);
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

function renderSetup(){
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
  const now=new Date();
  const title=`${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ${s.team||"自チーム"} vs ${s.oppTeam||"相手"} ${s.my||0}-${s.op||0}`;
  const list=getSavedMatches();
  const saved=migrateSavedMatchIdentities({
    id:String(s.matchId||createEntityId("match")), title, fileName:parsed.fileName,
    savedAt:now.toISOString(), memo:"", csv:parsed, summary:{
      total:analysis.total, setterIq:analysis.setterIq, balance:analysis.balance,
      diversity:analysis.diversity, quick:analysis.quick, clutch:analysis.clutch,
      foreshadow:analysis.foreshadow, blockInduce:analysis.blockInduce,
      sideDepend:analysis.sideDepend, centerPct:analysis.centerPct, items:analysis.items,
      bySet:analysis.bySet, byRot:analysis.byRot, byScore:analysis.byScore, byPass:analysis.byPass,
      terminalCounts:analysis.terminalCounts, usedFallback:analysis.usedFallback
    },
    liveState:JSON.parse(JSON.stringify({...s,hist:[]})),
    dataVersion:DATA_SCHEMA_VERSION, schemaVersion:DATA_SCHEMA_VERSION,
    userId:s.userId, teamId:s.teamId, matchId:s.matchId, setId:s.setId,
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
    no:s.logs.length+1,set:s.setNo,rot:"S"+s.rot,type:s.mode,
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
  const raw=localStorage.getItem("setterTheoryV2");
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
  const rotationRows=[1,2,3,4,5,6].map(r=>{
    const logs=toss.filter(x=>x.rot==='S'+r);
    const miss=logs.filter(isTossMissLog).length;
    return {rot:'S'+r,total:logs.length,miss,success:Math.max(0,logs.length-miss),rate:logs.length?Math.round((logs.length-miss)/logs.length*100):0};
  });
  return {num:setterNum,name:getPlayerName(setterNum),total,items,counts,terminalCounts,quality,rotationRows,...calcScores(counts,total,terminalCounts)};
}
function getAquilaAdviceForSetter(num){
  const a=currentSetterAnalysisFor(num);
  if(!a.total) return [`${a.num}番 ${a.name||''}はトス記録がありません。`];
  const by=Object.fromEntries(a.items.map(x=>[x.label,x]));
  const left=by['レフト']||{pct:0,count:0}, center=by['センター']||{pct:0,count:0}, right=by['ライト']||{pct:0,count:0};
  const top=a.items.slice().sort((x,y)=>y.count-x.count)[0]||{label:'-',pct:0,count:0};
  const advice=[];
  if(top.pct<50 && Math.abs(left.pct-right.pct)<=15) advice.push(`配球はレフト${left.pct}%・センター${center.pct}%・ライト${right.pct}%で、大きな偏りを抑えられています。`);
  else if(top.pct>=55) advice.push(`${top.label}への配球が${top.pct}%です。次は序盤に別方向を1〜2本見せると、終盤の${top.label}が生きます。`);
  else advice.push(`最多配球は${top.label}${top.pct}%（${top.count}本）です。ローテごとの意図を確認しましょう。`);
  if(a.quality.miss>0) advice.push(`トスミスは${a.quality.miss}本、成功率は${a.quality.successRate}%です。判断の良さと技術精度を分けて振り返りましょう。`);
  else advice.push(`トスミスは0本で、トス技術は安定しています。`);
  const used=a.items.filter(x=>x.count>0).length;
  if(used<=2 && a.total>=5) advice.push(`使用した攻撃ゾーンは${used}種類です。次戦はもう1方向増やすことをテーマにしましょう。`);
  return advice;
}
function buildSetterDetailReports(){
  const setters=reportSetterNumbers();
  if(!setters.length) return '';
  const labels=['レフト','センター','ライト','バック','ツー'];
  return `<div class="setterDetailGrid">${setters.map((n,idx)=>{
    const a=currentSetterAnalysisFor(n);
    const rank=setterIqRank(a.setterIq||0);
    const b=iqBreakdown20(a);
    const advice=getAquilaAdviceForSetter(n);
    const dist=labels.map(label=>{const it=a.items.find(x=>x.label===label)||{count:0,pct:0};return `<span><b>${label}</b><em>${it.count}本 / ${it.pct}%</em></span>`}).join('');
    const rots=a.rotationRows.filter(x=>x.total>0).map(x=>`<span><b>${x.rot}</b><em>${x.total}本</em><em>成功${x.rate}%</em></span>`).join('')||'<span class="setterDetailEmpty">ローテ別記録なし</span>';
    return `<section class="reportPanel setterDetailCard setterIqCompactCard">
      <div class="setterDetailHead"><div><small>セッター${idx+1}</small><h3>${escapeHtml(n)}番 ${escapeHtml(a.name||'')}</h3></div><div class="setterDetailIq"><b>${a.total?a.setterIq:'--'}</b><span>/100</span><small>${a.total?rank.label:'NO DATA'}</small></div></div>
      <div class="setterDetailMetrics"><span>総トス <b>${a.quality.total}</b></span><span>トスミス <b>${a.quality.miss}</b></span><span>成功率 <b>${a.quality.successRate}%</b></span></div>
      <div class="setterCompactRadar">${buildSetterIqRadarChart(b)}</div>
      <div class="setterDetailAdvice"><b>Aquila Advice</b><ul>${advice.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <details class="setterDetailMore"><summary>詳しい配球・ローテデータ</summary><div class="setterDetailSection"><b>配球</b><div>${dist}</div></div><div class="setterDetailSection"><b>ローテ別トス</b><div>${rots}</div></div></details>
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

let reportRankType = localStorage.getItem("vollyzeReportRankType") || "スパイク";
if(reportRankType === "トス") reportRankType = "スパイク";
let reportSortType = localStorage.getItem("vollyzeReportSortType") || "rate";

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
  localStorage.setItem("vollyzeReportRankType", value);
  refreshPersonalRanking();
}
function setReportSortType(value){
  reportSortType = value;
  localStorage.setItem("vollyzeReportSortType", value);
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


function buildRotationPointAnalysis(){
  const rows=[1,2,3,4,5,6].map(r=>{
    const key="S"+r;
    const logs=s.logs.filter(x=>x.rot===key);
    const my=logs.filter(x=>x.point==="自").length;
    const op=logs.filter(x=>x.point==="相").length;
    const diff=my-op;
    const toss=logs.filter(x=>x.type==="トス");
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

function buildTossUsageAnalysis(){
  const toss=s.logs.filter(x=>x.type==="トス");
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
  const toss=s.logs.filter(x=>x.type==='トス');
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
  if(n>=95) return {label:'LEGEND',cls:'legend'};
  if(n>=90) return {label:'ELITE',cls:'elite'};
  if(n>=80) return {label:'ADVANCED',cls:'advanced'};
  if(n>=70) return {label:'INTERMEDIATE',cls:'intermediate'};
  return {label:'DEVELOPING',cls:'developing'};
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
function buildSetterIqRadarChart(breakdown){
  const items=[
    {label:'配球',value:Number(breakdown?.balance)||0},
    {label:'多様性',value:Number(breakdown?.diversity)||0},
    {label:'ミドル',value:Number(breakdown?.quick)||0},
    {label:'勝負所',value:Number(breakdown?.clutch)||0},
    {label:'安定性',value:Number(breakdown?.stability)||0}
  ];
  const cx=150, cy=132, radius=96;
  const point=(index,ratio=1)=>{
    const angle=(-Math.PI/2)+(Math.PI*2*index/items.length);
    return [cx+Math.cos(angle)*radius*ratio,cy+Math.sin(angle)*radius*ratio];
  };
  const polygon=ratio=>items.map((_,i)=>point(i,ratio).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dataPoints=items.map((item,i)=>point(i,Math.max(0,Math.min(20,item.value))/20).map(v=>v.toFixed(1)).join(',')).join(' ');
  const axes=items.map((_,i)=>{const [x,y]=point(i);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;}).join('');
  const labels=items.map((item,i)=>{
    const [x,y]=point(i,1.18);
    const anchor=x<cx-8?'end':x>cx+8?'start':'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"><tspan x="${x.toFixed(1)}">${item.label}</tspan><tspan x="${x.toFixed(1)}" dy="18">${item.value}/20</tspan></text>`;
  }).join('');
  return `<div class="setterIqRadar" aria-label="Setter IQ 5項目レーダーチャート">
    <div class="setterIqRadarTitle">能力バランス</div>
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
  // PDF専用：グラフ本体を小さくし、項目名・点数を外側へ離して重なりを防ぐ。
  const cx=170, cy=142, radius=72;
  const point=(index,ratio=1)=>{
    const angle=(-Math.PI/2)+(Math.PI*2*index/items.length);
    return [cx+Math.cos(angle)*radius*ratio,cy+Math.sin(angle)*radius*ratio];
  };
  const polygon=ratio=>items.map((_,i)=>point(i,ratio).map(v=>v.toFixed(1)).join(',')).join(' ');
  const dataPoints=items.map((item,i)=>point(i,Math.max(0,Math.min(20,item.value))/20).map(v=>v.toFixed(1)).join(',')).join(' ');
  const axes=items.map((_,i)=>{const [x,y]=point(i);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;}).join('');
  const labels=items.map((item,i)=>{
    const [x,y]=point(i,1.62);
    const anchor=x<cx-8?'end':x>cx+8?'start':'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"><tspan x="${x.toFixed(1)}">${item.label}</tspan><tspan x="${x.toFixed(1)}" dy="17">${item.value}/20</tspan></text>`;
  }).join('');
  return `<div class="setterIqRadar pdfSetterIqRadar" aria-label="Setter IQ 5項目レーダーチャート">
    <svg viewBox="0 0 340 300" role="img" aria-label="配球、多様性、ミドル、勝負所、安定性の評価">
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
  return `<div class="setterIqLive aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div class="aquilaHeroBody"><div class="setterIqLiveHead"><span>${setterLabel}</span><b>${a.setterIq}</b><small>/100</small></div><div class="iqRank ${rank.cls}">${rank.label}</div></div></div>
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
  return `<div class="setterIqLive aquilaHeroCard"><div class="aquilaHeroTop"><img src="icons/aquila-192.png" alt="Aquila"><div class="aquilaHeroBody"><div class="setterIqLiveHead"><span>Setter IQ</span><b>${a.setterIq}</b><small>/100</small></div><div class="iqRank ${rank.cls}">${rank.label}</div></div></div>
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
  return `<div class="unifiedReportBrand">
    <div class="unifiedReportIdentity">
      <div class="unifiedReportEyebrow">AQUILA REPORT</div>
      <div class="unifiedReportTitle">${escapeHtml(title)}</div>
      <div class="unifiedReportMeta">${escapeHtml(state.myTeam||state.team||'自チーム')} vs ${escapeHtml(state.oppTeam||'相手')} / Set ${escapeHtml(state.setNo||'1')} / ${escapeHtml(dateText)}</div>
    </div>
    <div class="unifiedReportRight">
      <div class="unifiedAquilaBadge">
        <img src="icons/aquila-192.png" alt="Aquila">
        <div><div class="small">SETTER IQ</div><div class="iqLine"><b>${analysis.setterIq||'--'}</b><span>/100</span></div><div class="rank">${analysis.setterIq?rank.label:'NO DATA'}</div></div>
      </div>
      ${actions}
    </div>
  </div>`;
}

function report(){
  const actionLogs=s.logs.filter(x=>actionTypes.includes(x.type));
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
  const summary=`<div class="summaryCards">
    ${metricCard("成功率",successPct+"%",`成功 ${success} / 総数 ${total}`,"blue","🎯",successPct)}
    ${metricCard("失点率",lossPct+"%",`失点 ${loss} / 総数 ${total}`,"red","🛡",lossPct)}
    ${metricCard("サーブ成功率",servePct+"%",`成功 ${serveOk} / 総数 ${serveLogs.length}`,"green","🏐",servePct)}
    ${metricCard("スパイク決定率",spikePct+"%",`決定 ${spikeKill} / 打数 ${spikeLogs.length}`,"orange","🏃",spikePct)}
    ${metricCard("総プレー数",total,`総数 ${total}プレー`,"purple","〽",100)}
  </div>`;

  const playColors={"サーブ":"#ef4444","レセプ":"#2563eb","スパイク":"#22c55e","トス":"#f59e0b","二段トス":"#06b6d4","ディグ":"#7c3aed","ブロック":"#334155"};
  const playItems=actionTypes.map(t=>({label:t,count:s.logs.filter(x=>x.type===t).length,color:playColors[t]})).filter(x=>x.count>0);
  const playDonut=`<div class="donutWrap"><div class="donut" style="background:${donutStyle(playItems)}"><div class="donutCenter"><div class="label">総数</div><div class="num">${total}</div></div></div>${legendHtml(playItems,total)}</div>`;

  const resultGroups=[
    {label:"成功系",count:actionLogs.filter(isSuccessResult).length,color:"#22c55e"},
    {label:"継続",count:actionLogs.filter(x=>x.result==="継続").length,color:"#2563eb"},
    {label:"ミス",count:actionLogs.filter(x=>x.result==="ミス"||x.result==="レセプミス"||x.result==="ブロックミス").length,color:"#ef4444"},
    {label:"被ブロック",count:actionLogs.filter(x=>x.result==="被ブロック").length,color:"#f59e0b"},
  ].filter(x=>x.count>0);
  const resultBars=`<div class="v136ResultBars">${resultGroups
    .map(item=>({...item,pct:safePct(item.count,total)}))
    .sort((a,b)=>b.pct-a.pct || b.count-a.count)
    .map(item=>`<div class="v136ResultBarRow" style="--result-color:${item.color}">
      <div class="v136ResultBarHead"><span class="v136ResultBarLabel">${escapeHtml(item.label)}</span><strong class="v136ResultBarValue">${item.pct}%</strong></div>
      <div class="v136ResultBarTrack"><span style="width:${Math.max(0,Math.min(100,item.pct))}%;background:${item.color}"></span></div>
      <div class="v136ResultBarSub"><strong>${item.count}件</strong><span> / 全${total}プレー</span></div>
    </div>`).join('')}</div>`;

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
    return `<div class="rotationRow ${s.rot===r?"currentRotation":""}"><div class="rotationLabel">S${r}</div><div class="rotationPct">${pct}% (${ok}/${a.length})</div><div class="rotationTrack"><div class="rotationFill ${cssClassByPct(pct)}" style="width:${pct}%"></div></div></div>`;
  }).join("");

  const tossLogs=s.logs.filter(x=>x.type==="トス");
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

  const iconFor=x=>{if(isMissResult(x)) return ["×","tMiss"]; if(x.result==="被ブロック") return ["△","tBlock"]; if(x.result==="継続") return ["−","tCont"]; return ["○","tSuccess"];};
  const recent=s.logs.slice(-20).map(x=>{const [ic,cls]=iconFor(x);return `<div class="timelineItem"><div class="timelineNo">${x.no}</div><div class="timelineIcon ${cls}">${ic}</div><div class="timelineText">${x.type}${isTossMissLog(x)?"・ミス":""}</div></div>`;}).join("");

  const currentAnalysis=currentMatchSetterAnalysis();
  const reportBrand=buildUnifiedReportBrandHeader(s,currentAnalysis,{actionsHtml:`<button class="pdfBtn unifiedReportAction" onclick="printMatchPdfReport()">PDF出力</button><button class="csvBtn unifiedReportAction" onclick="downloadCSV()">CSV出力</button>`});
  const dashboard=`${reportBrand}<div class="reportGrid">
    ${buildTwoSetterSummary()}
    ${buildSetterDetailReports()}
    ${buildSecondBallAnalysis()}
    ${summary}
    <div class="panelGrid">
      <div class="reportPanel"><h3>プレー割合 <small>（何をどれだけやったか）</small></h3>${playDonut}</div>
      <div class="reportPanel"><h3>結果割合 <small>（プレーの結果）</small></h3>${resultBars}</div>
      <div class="reportPanel"><h3>得点・失点</h3>${pointDivergingBars}</div>
    </div>
    <div class="reportPanel v37InsightPanel">${buildSetterInsight()}</div>
    <div class="wideGrid">
      <div class="reportPanel" id="personalRankingHost">${buildPersonalRanking()}</div>
      <div class="reportPanel"><h3>ローテーション別 成功率</h3>${rotationRows}</div>
    </div>
    <div class="wideGrid">
      <div class="reportPanel"><h3>ローテーション別 得失点</h3>${buildRotationPointAnalysis()}</div>
      <div class="reportPanel"><h3>プレー別 成功率</h3>${buildActionSuccessAnalysis()}</div>
    </div>
    <div class="bottomGrid">
      <div class="reportPanel"><h3>トス配分 <small>（どこに集めているか）</small></h3>${tossDonut}${tossQualityPanel}${buildTossUsageAnalysis()}</div>
      <div class="reportPanel"><h3>直近ログ <small>（最新20プレー）</small></h3><div class="timeline">${recent}</div><div class="logLegend"><span>🟢 成功系</span><span>🔵 継続</span><span>🔴 ミス</span><span>🟠 被ブロック</span></div></div>
    </div>
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
  const toss=s.logs.filter(x=>x.type==="トス");
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
    rows.push([x.no,x.set,x.rot,x.type,x.num,(x.playerNameSnapshot||getPlayerName(x.num)),x.type==="二段トス"?"1":"0",d?`Setter${d.idx}`:"",a&&a.total?a.setterIq:"",a?a.quality.total:"",a?a.quality.miss:"",a?a.quality.successRate:"",a?a.counts['レフト']||0:"",a?a.counts['センター']||0:"",a?a.counts['ライト']||0:"",a?a.counts['バック']||0:"",a?a.counts['ツー']||0:"",x.pos,x.result,isTossMissLog(x)?"1":"0",x.point,x.score,x.time,(x.playerId||ensureStablePlayerId(x.playerNameSnapshot||getPlayerName(x.num),x.playerNumberSnapshot||x.num))]);
  });
  rows.push([]);
  rows.push(["Metadata","DataVersion",DATA_SCHEMA_VERSION,"UserId",s.userId||"","TeamId",s.teamId||"","MatchId",s.matchId||"","SetId",s.setId||""]);
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
  // V48: PDF専用レイアウト。
  // 画面表示をそのまま印刷せず、A4縦で安定するHTMLを別生成する。
  const esc = escapeHtml;
  const today = new Date().toLocaleDateString();
  const actionLogs = s.logs.filter(x=>rateActionTypes.includes(x.type));
  const total = actionLogs.length;
  const okTotal = actionLogs.filter(isSuccessResult).length;
  const effTotal = effectRate(actionLogs);
  const myPts = s.logs.filter(x=>x.point==='自').length;
  const opPts = s.logs.filter(x=>x.point==='相').length;
  const opponentPointCount = s.logs.filter(x=>x.point==='相' && x.result==='相手得点').length;
  const ownErrorLossCount = Math.max(0, opPts-opponentPointCount);
  const setterAnalysis = currentMatchSetterAnalysis();
  const setterIq = setterAnalysis.total ? setterAnalysis.setterIq : 0;
  const iqRank = setterIqRank(setterIq);
  const iqBreakdown = iqBreakdown20(setterAnalysis);
  const aquilaAdvice = getCurrentAquilaAdviceItems();
  const aquilaIcon = `${location.origin}/icons/aquila-192.png`;
  const reportSetters=reportSetterNumbers();
  const perSetterPdfCards=reportSetters.map((n,i)=>{
    const a=currentSetterAnalysisFor(n), rank=setterIqRank(a.setterIq||0), b=iqBreakdown20(a), advice=getAquilaAdviceForSetter(n);
    const dist=['レフト','センター','ライト','バック','ツー'].map(k=>`${k} ${a.counts[k]||0}本`).join(' / ');
    const rot=a.rotationRows.filter(x=>x.total>0).map(x=>`${x.rot} ${x.total}本 成功${x.rate}%`).join(' / ') || '記録なし';
    return `<section class="section setterPdfCard"><h2>セッター${i+1}：${esc(n)}番 ${esc(a.name)}</h2><div class="setterPdfTop"><b>IQ ${a.total?a.setterIq:'--'}/100 ${a.total?rank.label:''}</b><span>総トス ${a.quality.total} / ミス ${a.quality.miss} / 成功率 ${a.quality.successRate}%</span></div><div class="setterPdfBreak"><span>配球 ${b.balance}/20</span><span>多様性 ${b.diversity}/20</span><span>ミドル ${b.quick}/20</span><span>勝負所 ${b.clutch}/20</span><span>安定性 ${b.stability}/20</span></div><p class="note"><b>配球：</b>${esc(dist)}</p><p class="note"><b>ローテ別：</b>${esc(rot)}</p><ul>${advice.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
  }).join('');
  const pdfSetterLeadCards=(reportSetters.length>1 ? reportSetters : [null]).map((n,i)=>{
    const a=n===null ? setterAnalysis : currentSetterAnalysisFor(n);
    const score=a.total?a.setterIq:0, rank=setterIqRank(score), breakdown=iqBreakdown20(a);
    const title=n===null?'Setter IQ・能力バランス':`セッター${i+1}：${esc(n)}番 ${esc(a.name||'')}`;
    const advice=n===null ? aquilaAdvice : getAquilaAdviceForSetter(n);
    const adviceTitle=n===null?'Aquila Advice':`Aquila Advice　セッター${i+1} ${esc(n)}番 ${esc(a.name||'')}`;
    return `<div class="pdfSetterLeadPerson"><div class="pdfIqCard"><div class="title">${title}</div><div class="pdfIqScoreRow"><div><div class="score">${score||'--'}<small>/100</small></div><div class="rank">${score?rank.label:'NO DATA'}</div></div>${buildSetterIqRadarChartPdf(breakdown)}</div></div><div class="pdfAdviceCard"><div class="title pdfAdviceTitle"><img src="${aquilaIcon}" alt="Aquila"><span>${adviceTitle}</span></div><ul>${advice.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  }).join('');
  const pdfHeaderIq=reportSetters.length>1 ? `<div class="small">AQUILA REPORT</div><div class="iqLine"><b>${reportSetters.length}</b><span>SETTERS</span></div><div class="rank">INDIVIDUAL IQ</div>` : `<div class="small">AQUILA REPORT</div><div class="iqLine"><b>${setterIq||'--'}</b><span>/100</span></div><div class="rank">${setterIq?iqRank.label:'NO DATA'}</div>`;

  function table(headers, rows, emptyText){
    const body = rows && rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">${esc(emptyText||'記録がありません。')}</td></tr>`;
    return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }
  function pct(part, all){ return all ? Math.round(part/all*100) : 0; }

  const actionRows = rateActionTypes.map(t=>{
    const a=s.logs.filter(x=>x.type===t);
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(isMissResult).length;
    const blocked=a.filter(x=>x.result==='被ブロック').length;
    return [t, `${a.length}`, `${ok}`, `${miss}`, `${blocked}`, `${pct(ok,a.length)}%`, `${effectRate(a)}%`];
  });

  const nums=[...new Set(s.nums.concat(s.logs.map(x=>x.num)).filter(n=>n && n!=='-'))].sort((a,b)=>Number(a)-Number(b));
  const playerRows=nums.map(n=>{
    const a=s.logs.filter(x=>String(x.num)===String(n) && rateActionTypes.includes(x.type));
    const ok=a.filter(isSuccessResult).length;
    const miss=a.filter(isMissResult).length;
    const blocked=a.filter(x=>x.result==='被ブロック').length;
    return [`${n}番`, getPlayerName(n)||'-', `${a.length}`, `${ok}`, `${miss}`, `${blocked}`, `${pct(ok,a.length)}%`, `${effectRate(a)}%`];
  }).filter(r=>Number(r[2])>0);

  const rotRows=[1,2,3,4,5,6].map(r=>{
    const a=s.logs.filter(x=>x.rot===`S${r}`);
    const ok=a.filter(isSuccessResult).length;
    const my=a.filter(x=>x.point==='自').length;
    const op=a.filter(x=>x.point==='相').length;
    return [`S${r}`, `${a.length}`, `${ok}`, `${pct(ok,a.length)}%`, `${my}`, `${op}`, `${my-op}`];
  });

  const tossLogs=s.logs.filter(x=>x.type==='トス');
  const tossQuality=tossQualityStats(tossLogs);
  const tossLabels=['レフト','センター','ライト','バック','ツー'];
  const tossRows=tossLabels.map(label=>{
    const count=tossLogs.filter(x=>x.result===label).length;
    return [label, `${count}`, `${pct(count,tossLogs.length)}%`];
  }).filter(r=>Number(r[1])>0);
  const secondBall=secondBallAnalysis();
  const secondBallRows=secondBall.players.map(p=>[`${p.num}番`,p.name||'-',`${p.total}`,`${p.counts['レフト']}`,`${p.counts['センター']}`,`${p.counts['ライト']}`,`${p.counts['バック']}`,`${p.counts['ツー']}`]);

  function topThreeRanking(type){
    const configs={
      'スパイク':{label:'攻撃',all:x=>x.type==='スパイク',ok:x=>x.type==='スパイク'&&x.result==='成功'},
      'サーブ':{label:'サーブ',all:x=>x.type==='サーブ',ok:x=>x.type==='サーブ'&&(x.result==='成功'||x.result==='エース')},
      'レセプ':{label:'レセプション',all:x=>x.type==='レセプ',ok:x=>x.type==='レセプ'&&(x.result==='Aパス'||x.result==='Bパス'||x.result==='Cパス')},
      'ブロック':{label:'ブロック',all:x=>x.type==='ブロック',ok:x=>x.type==='ブロック'&&(x.result==='シャット'||x.result==='ワンタッチ')},
      'ディグ':{label:'ディグ',all:x=>x.type==='ディグ',ok:x=>x.type==='ディグ'&&x.result==='成功'},
      'トス':{label:'通常トス',all:x=>x.type==='トス',ok:x=>x.type==='トス'&&!isTossMissLog(x)},
      '二段トス':{label:'二段トス',all:x=>x.type==='二段トス',ok:x=>x.type==='二段トス'}
    };
    const cfg=configs[type];
    const rows=nums.map(n=>{
      const logs=s.logs.filter(x=>String(x.num)===String(n)&&cfg.all(x));
      const ok=logs.filter(cfg.ok).length;
      const rate=logs.length?Math.round(ok/logs.length*100):0;
      return {n,name:getPlayerName(n)||'-',total:logs.length,ok,rate};
    }).filter(x=>x.total>0);
    rows.sort((a,b)=>b.rate-a.rate||b.ok-a.ok||b.total-a.total||Number(a.n)-Number(b.n));
    return {label:cfg.label,rows:rows.slice(0,3)};
  }
  const pdfRankings=['スパイク','サーブ','レセプ','ブロック','ディグ','トス','二段トス'].map(topThreeRanking);
  const pdfRankingHtml=pdfRankings.map(group=>{
    const rows=group.rows.map((r,i)=>[`${i+1}位`,`${r.n}番`,r.name,`${r.ok}/${r.total}`,`${r.rate}%`]);
    return `<div class="pdfRankCard"><h3>${esc(group.label)}</h3>${table(['順位','背番号','選手','成功/総数','率'],rows,'記録なし')}</div>`;
  }).join('');

  const subCounts=s.substitutionCounts || {};
  const subRows=Object.values(subCounts).sort((a,b)=>(b.count||0)-(a.count||0)).map(x=>[
    `${x.a}番 ⇄ ${x.b}番`, `${x.count||0}回`, x.lastScore || '-', x.lastRot || '-', x.lastTime || '-'
  ]);

  const recentRows=s.logs.slice(-30).reverse().map(x=>[
    `${x.no}`, x.set || '-', x.rot || '-', x.type || '-', x.num && x.num!=='-' ? `${x.num}番` : '-', logResultText(x) || '-', x.point || '-', x.score || '-', x.time || '-'
  ]);

  const playRows=actionTypes.map(t=>{
    const count=s.logs.filter(x=>x.type===t).length;
    return [t, `${count}`, `${pct(count,s.logs.filter(x=>actionTypes.includes(x.type)).length)}%`];
  }).filter(r=>Number(r[1])>0);

  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Setter Theory Report</title>
  <style>
    @page{size:A4 portrait;margin:10mm;}
    *{box-sizing:border-box;}
    html,body{margin:0;background:#eef2f7;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    .topbar{position:sticky;top:0;z-index:10;background:#0f172a;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;}
    .topbar b{font-size:14px}.topbar div{display:flex;gap:8px;flex-wrap:wrap}.topbar button{border:0;border-radius:10px;padding:9px 12px;font-weight:800;background:#fbbf24;color:#111827}.topbar .secondary{background:#334155;color:#fff;}
    .sheet{width:190mm;max-width:calc(100vw - 20px);margin:12px auto;background:#fff;padding:12mm;box-shadow:0 10px 28px rgba(15,23,42,.16);}
    .brand{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:3px solid #f4b63f;padding-bottom:10px;margin-bottom:12px;}
    .brand h1{margin:0;font-size:25px;letter-spacing:.02em;color:#0f172a}.brand p{margin:4px 0 0;color:#64748b;font-size:12px}.badge{font-weight:900;background:#0f172a;color:#fbbf24;border-radius:999px;padding:7px 10px;font-size:11px;white-space:nowrap;}
    .aquilaPdfBadge{display:flex;align-items:center;gap:9px;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;border-radius:16px;padding:8px 11px;min-width:160px;box-shadow:0 5px 14px rgba(15,23,42,.18)}
    .aquilaPdfBadge img{width:48px;height:48px;object-fit:contain;border-radius:50%;background:#fff;padding:3px}.aquilaPdfBadge .small{font-size:9px;color:#fbbf24;font-weight:900;letter-spacing:.08em}.aquilaPdfBadge .iqLine{display:flex;align-items:baseline;gap:3px}.aquilaPdfBadge .iqLine b{font-size:27px;line-height:1}.aquilaPdfBadge .iqLine span{font-size:10px;font-weight:900}.aquilaPdfBadge .rank{font-size:9px;font-weight:950;letter-spacing:.08em;color:#bfdbfe}
    .pdfLead{display:grid;grid-template-columns:1fr;gap:12px;margin:10px 0 12px;align-items:stretch}.pdfSetterLeadPerson{display:grid;grid-template-columns:1fr;gap:8px;break-inside:avoid;page-break-inside:avoid}.pdfIqCard,.pdfAdviceCard{border:1px solid #cbd5e1;border-radius:14px;padding:11px;background:linear-gradient(180deg,#f8fafc,#fff);break-inside:avoid}.pdfIqCard .title,.pdfAdviceCard .title{font-size:12px;font-weight:950;color:#1e3a8a;margin-bottom:6px}.pdfIqCard .score{font-size:36px;font-weight:1000;color:#2563eb;line-height:1}.pdfIqCard .score small{font-size:13px;color:#64748b}.pdfIqCard .rank{display:inline-block;margin-top:5px;border-radius:999px;padding:4px 9px;background:#0f172a;color:#fbbf24;font-size:9px;font-weight:950}.pdfIqScoreRow{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center}.pdfIqBreakdown{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:8px;color:#475569}.pdfIqBreakdown span{background:#e2e8f0;border-radius:6px;padding:4px}.pdfAdviceCard ul{margin:0;padding-left:17px;font-size:10px;line-height:1.55}.pdfAdviceCard li+li{margin-top:4px}
    .pdfIqCard .setterIqRadar{background:#f8fafc;border:1px solid #dbeafe;border-radius:10px;padding:3px;min-width:0}.pdfIqCard .setterIqRadarTitle{display:none}.pdfIqCard .setterIqRadar svg{display:block;width:100%;height:190px;overflow:hidden}.pdfIqCard .radarGrid polygon,.pdfIqCard .radarGrid line{fill:none;stroke:#94a3b8;stroke-width:1}.pdfIqCard .radarGrid polygon:first-child{stroke:#64748b;stroke-width:1.4}.pdfIqCard .radarData{fill:rgba(37,99,235,.24);stroke:#2563eb;stroke-width:3;stroke-linejoin:round}.pdfIqCard .radarDots circle{fill:#1d4ed8;stroke:#fff;stroke-width:2}.pdfIqCard .radarLabels text{font-size:12px;font-weight:1000;fill:#334155}.pdfIqCard .radarLabels tspan+tspan{font-size:11px;font-weight:1000;fill:#1d4ed8}
    .pdfAdviceTitle{display:flex;align-items:center;gap:7px}.pdfAdviceTitle img{width:25px;height:25px;object-fit:contain;border-radius:50%;background:#fff;border:1px solid #f4b63f;padding:2px}.pdfAdviceTitle span{font-size:12px;font-weight:950;color:#1e3a8a}
    .setterPdfCard{border:1px solid #93c5fd;border-radius:12px;padding:9px;background:#f8fbff}.setterPdfTop{display:flex;justify-content:space-between;gap:8px;font-size:11px}.setterPdfTop b{color:#1d4ed8}.setterPdfBreak{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:7px 0}.setterPdfBreak span{background:#dbeafe;border-radius:6px;padding:4px;text-align:center;font-size:9px}.setterPdfCard ul{margin:5px 0 0;padding-left:17px;font-size:9px;line-height:1.45}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 12px;}
    .metric{border:1px solid #cbd5e1;border-radius:12px;padding:9px;background:#f8fafc;break-inside:avoid;page-break-inside:avoid;}.metric .label{font-size:10px;color:#64748b;font-weight:800}.metric .value{font-size:24px;font-weight:950;color:#0f172a;margin-top:2px}.metric .sub{font-size:10px;color:#64748b;margin-top:2px}
    .section{margin:0 0 10px;break-inside:avoid;page-break-inside:avoid;}.section h2{font-size:15px;margin:0 0 6px;color:#0f172a;border-left:5px solid #f4b63f;padding-left:8px;}
    .pdfRankGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}.pdfRankCard{border:1px solid #cbd5e1;border-radius:10px;padding:7px;background:#f8fafc;break-inside:avoid;page-break-inside:avoid}.pdfRankCard h3{margin:0 0 5px;font-size:12px;color:#1e3a8a}.pdfRankCard table{font-size:9px}.pdfRankCard th,.pdfRankCard td{padding:4px}
    table{width:100%;border-collapse:collapse;margin:0;font-size:10px;table-layout:auto;}th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:left;vertical-align:top;}th{background:#e2e8f0;color:#0f172a;font-weight:900;}td{background:#fff}.empty{text-align:center;color:#64748b;padding:12px!important;}
    .twoCol{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;}.note{font-size:10px;color:#64748b;line-height:1.55;margin-top:5px}.footer{border-top:1px solid #cbd5e1;margin-top:12px;padding-top:8px;color:#64748b;font-size:10px;display:flex;justify-content:space-between;gap:8px;}
    @media print{html,body{background:#fff!important}.topbar{display:none!important}.sheet{width:auto;max-width:none;margin:0;padding:0;box-shadow:none}.section{break-inside:avoid;page-break-inside:avoid}tr{break-inside:avoid;page-break-inside:avoid}.twoCol{grid-template-columns:1fr 1fr}.summary{grid-template-columns:repeat(4,1fr)} }
    @media (max-width:760px){.sheet{padding:14px}.summary{grid-template-columns:repeat(2,1fr)}.twoCol{grid-template-columns:1fr}.brand{display:block}.badge{display:inline-block;margin-top:8px}}
  </style></head><body>
    <div class="topbar"><b>Setter Theory PDFプレビュー</b><div><button class="secondary" onclick="window.close()">← レポートへ戻る</button><button onclick="window.print()">📄 PDF/印刷</button></div></div>
    <main class="sheet">
      <header class="brand"><div><h1>Setter Theory Match Report</h1><p>${esc(today)}　${esc(s.myTeam || '自チーム')} vs ${esc(s.oppTeam || '相手')}　/　Set ${esc(s.setNo || '1')}　/　Setter ${reportSetters.map(n=>esc(n+'番 '+getPlayerName(n))).join('・')}</p></div><div class="aquilaPdfBadge"><img src="${aquilaIcon}" alt="Aquila"><div>${pdfHeaderIq}</div></div></header>
      <div class="pdfLead">${pdfSetterLeadCards}</div>
      <div class="summary">
        <div class="metric"><div class="label">総入力</div><div class="value">${total}</div><div class="sub">対象プレー</div></div>
        <div class="metric"><div class="label">成功率</div><div class="value">${pct(okTotal,total)}%</div><div class="sub">成功 ${okTotal}/${total}</div></div>
        <div class="metric"><div class="label">効果率</div><div class="value">${effTotal}%</div><div class="sub">成功−ミス系 ÷ 対象</div></div>
        <div class="metric"><div class="label">得点 / 失点</div><div class="value">${myPts}-${opPts}</div><div class="sub">自ミス等 ${ownErrorLossCount} / 相手得点 ${opponentPointCount}</div></div>
      </div>
      <section class="section"><h2>プレー別 成功率・効果率</h2>${table(['項目','本数','成功','ミス','被ブロック','成功率','効果率'], actionRows, '記録がありません。')}<div class="note">※トス技術は下の「トス技術」で別評価します。</div></section>
      <section class="section"><h2>登録セッター</h2>${table(['区分','背番号','名前','トス数','トス成功率'], reportSetters.map((n,i)=>{const t=s.logs.filter(x=>x.type==='トス'&&logBelongsToPlayer(x,n));const m=t.filter(isTossMissLog).length;return ['セッター'+(i+1),n,getPlayerName(n),String(t.length),`${t.length?Math.round((t.length-m)/t.length*100):0}%`]}), '登録なし')}</section>
      <section class="section"><h2>選手別 成功率・効果率</h2>${table(['選手','名前','本数','成功','ミス','被ブロック','成功率','効果率'], playerRows, '選手別の対象記録がありません。')}</section>
      <div class="twoCol">
        <section class="section"><h2>ローテーション別</h2>${table(['ローテ','本数','成功','成功率','得点','失点','差'], rotRows, '記録がありません。')}</section>
        <section class="section"><h2>プレー割合</h2>${table(['項目','本数','割合'], playRows, '記録がありません。')}</section>
      </div>
      <div class="twoCol">
        <section class="section"><h2>トス配分</h2>${table(['トス先','本数','割合'], tossRows, 'トス記録がありません。')}</section>
        <section class="section"><h2>トス技術</h2>${table(['総トス','成功','トスミス','成功率','ミス率'], [[`${tossQuality.total}`,`${tossQuality.success}`,`${tossQuality.miss}`,`${tossQuality.successRate}%`,`${tossQuality.missRate}%`]], 'トス記録がありません。')}<div class="note">※トスミスは得点・失点とは別に、トスの技術的な質として記録します。</div></section>
      </div>
      <section class="section"><h2>二段トス分析</h2>${table(['選手','名前','合計','レフト','センター','ライト','バック','ツー'], secondBallRows, '二段トスの記録がありません。')}<div class="note">※二段トスは通常トス・Setter IQとは別集計です。セッター本人の二段トスもここに含まれます。</div></section>
      <section class="section"><h2>各項目ランキング TOP3</h2><div class="pdfRankGrid">${pdfRankingHtml}</div><div class="note">※通常トスはトスミスを除いた成功本数、二段トスは記録本数で表示します。</div></section>
      <section class="section"><h2>選手交代履歴</h2>${table(['ペア','回数','最終スコア','最終ローテ','最終時刻'], subRows, '選手交代の記録がありません。')}</section>
      <section class="section"><h2>直近ログ</h2>${table(['No','Set','Rot','プレー','選手','結果','得点','スコア','時刻'], recentRows, 'ログがありません。')}</section>
      <footer class="footer"><span>Setter Theory</span><span>Generated by Aquila</span></footer>
    </main>
  </body></html>`;
  const w=window.open('', '_blank');
  if(!w){ alert('ポップアップがブロックされました。ブラウザの設定で許可してください。'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(()=>{ try{ w.focus(); }catch(e){} },200);
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

function savedMatchesKey(){ return 'setterTheorySavedMatchesV21'; }
function playerRegistryKey(){ return 'setterTheoryPlayerRegistryV1'; }
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
  match.userId=String(match.userId||localStorage.getItem('setterTheoryUserId')||createEntityId('user'));
  match.teamId=String(match.teamId||localStorage.getItem('setterTheoryTeamId')||createEntityId('team'));
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
function savedMatchesBackupKey(){ return 'setterTheorySavedMatchesV21Backup'; }
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
    id:createEntityId('match'),
    title,
    fileName:importedCsv.fileName || 'CSV',
    savedAt:new Date().toISOString(),
    memo:memoEl ? memoEl.value : '',
    csv:importedCsv,
    summary,
    dataVersion:DATA_SCHEMA_VERSION,
    schemaVersion:DATA_SCHEMA_VERSION,
    userId:String(s.userId||localStorage.getItem('setterTheoryUserId')||''),
    teamId:String(s.teamId||localStorage.getItem('setterTheoryTeamId')||''),
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
  try{ localStorage.setItem('vollyzeImportedCsv',JSON.stringify(normalized)); }catch(_){}
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

function loadSavedMatch(id){
  try{
    const m=getSavedMatches().find(x=>String(x.id)===String(id));
    if(!m){ alert('保存データが見つかりません。'); return; }

    // V126: the report host is inside the collapsed Data Management panel.
    // Open it first so the rendered report is actually visible on iPad/Safari.
    const dataManagement=document.getElementById('dataManagementCard');
    if(dataManagement) dataManagement.open=true;

    const source=m.csv||m.parsed||m.data||m;
    importedCsv=recoveryNormalizePayload(source,m.fileName||m.title||'保存済みデータ');
    try{ localStorage.setItem('vollyzeImportedCsv',JSON.stringify(importedCsv)); }catch(_){}
    renderCsvPreview(importedCsv,importedCsv.fileName||m.title||'保存済みデータ');
    const shown=showRestoredFullReport(importedCsv,m.title||'保存試合レポート');
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
    const parsed=recoveryNormalizePayload(match.csv||match,match.fileName||match.title||'保存試合');
    importedCsv=parsed;
    try{ localStorage.setItem('vollyzeImportedCsv',JSON.stringify(parsed)); }catch(_){}
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
  const backup=readSavedMatchStore(savedMatchesBackupKey());
  updateSavedMatchBackupState(backup&&backup.savedAt);
  renderCompareSelectors();
  // V93.7: 保存件数の変化を成長ダッシュボードへ即時反映する。
  setTimeout(()=>{ try{ renderGrowthDashboard(); }catch(e){ console.error('growth dashboard render failed',e); } },0);
  if(!list.length){ listEl.innerHTML='<div class="csvSmall">保存された試合はまだありません。試合終了後、ここへ自動保存されます。</div>'; return; }
  listEl.innerHTML=list.map(m=>{
    const d=m.savedAt ? new Date(m.savedAt) : new Date();
    const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    const iqRaw=(m.summary && Number.isFinite(Number(m.summary.setterIq))) ? Number(m.summary.setterIq) : null;
    const iq=iqRaw===null ? '--' : Math.round(iqRaw);
    const iqClass=iqRaw===null?'iqEmpty':iqRaw>=90?'iqExcellent':iqRaw>=80?'iqGood':iqRaw>=70?'iqFair':'iqLow';
    const total=(m.summary && m.summary.total) ? m.summary.total : 0;
    return `<div class="savedMatchItem">
      <div>
        <div class="savedMatchTitle">${escapeHtml(m.title||'無題の試合')}</div>
        <div class="savedMatchMeta">${escapeHtml(date)}　${escapeHtml(m.fileName||'CSV')}　トス${total}本</div>
      </div>
      <div class="savedMatchActions">
        <div class="savedIqBadge ${iqClass}" aria-label="Setter IQ ${iq}/100"><b>${iq}</b><span>/100</span></div>
        <button class="miniBtn" type="button" onclick="loadSavedMatch('${m.id}')">レポート</button>
        <button class="miniBtn pdf" type="button" onclick="printSavedMatchPdf('${m.id}')">PDF</button>
        <button class="miniBtn csv" type="button" onclick="exportSavedMatchCsv('${m.id}')">CSV</button>
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

function growthPlayerStorageKey(){ return 'setterTheoryGrowthPlayerV2'; }
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
  // 旧ワンセッター試合を確実に拾う。2人目は十分なトス記録がある場合だけ採用する。
  const out=[{role:'Setter1',num:ranked[0].num,name:ranked[0].name||'',order:1,inferred:true}];
  if(ranked[1] && ranked[1].count>=Math.max(2,Math.ceil(ranked[0].count*0.35))){
    out.push({role:'Setter2',num:ranked[1].num,name:ranked[1].name||'',order:2,inferred:true});
  }
  return out;
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
  let wanted=localStorage.getItem(growthPlayerStorageKey())||localStorage.getItem('setterTheoryGrowthPlayerV1')||'team';
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
  return found.slice(0,2);
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
  const restoredSetters=setterNums.length?setterNums:(s.setterNums||[]).map(String).filter(n=>restoredNums.includes(n)).slice(0,2);
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
  let html='';
  withImportedMatchState(parsed,()=>{
    report();
    // CSV画面には上部の共通ヘッダーを別途表示するため、
    // 試合レポート側の重複ヘッダー（PDF/CSVボタンを含む）は除外する。
    const holder=document.createElement('div');
    holder.innerHTML=dash.innerHTML;
    const duplicateBrand=holder.querySelector('.unifiedReportBrand');
    if(duplicateBrand) duplicateBrand.remove();

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


// v17 📥 試合データを取り込む
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
        try{ localStorage.setItem("vollyzeImportedCsv",JSON.stringify(importedCsv)); }catch(_){}
        renderCsvPreview(importedCsv,file.name);
        showRestoredFullReport(importedCsv,`${file.name} レポート`);
      }catch(error){ console.error('CSV recovery import failed',error); alert('CSVを読み込めませんでした。ファイルは変更されていません。'); }
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
