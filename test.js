
(function(){
  var TEAM_KEY='setterTheoryTeamsV1';
  var RECORD_KEY='setterTheoryServePracticeRecordsV1';
  var LEVELS=['LEVEL 1','LEVEL 2','LEVEL 3','LEVEL MAX'];
  var selectedTeam='';
  var selectedServer='';
  var serverSearch='';
  var sessionActions=[];

  function e(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function teams(){try{var v=JSON.parse(localStorage.getItem(TEAM_KEY)||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}}
  function currentTeam(){return teams().find(function(t){return String(t.id)===String(selectedTeam)})||null}
  function players(){var t=currentTeam();return t&&Array.isArray(t.players)?t.players:[]}
  function currentLevel(){var v=((e('serveLandingLevelText')||{}).textContent||'LEVEL 1').trim();return LEVELS.indexOf(v)>=0?v:'LEVEL 1'}
  function selectedPlayer(){return players().find(function(p){return String(p.id)===String(selectedServer)})||null}
  function actionsFor(level,playerId){return sessionActions.filter(function(a){return a.level===level&&(playerId==null||String(a.playerId)===String(playerId))})}
  function statFor(level,playerId){var a=actionsFor(level,playerId),s=0,m=0;a.forEach(function(x){if(x.type==='success')s++;else if(x.type==='miss')m++});return {success:s,miss:m}}
  function syncTopCounts(){var st=statFor(currentLevel(),selectedServer||null);var sc=e('serveSuccessCount'),mc=e('serveMissCount');if(sc)sc.textContent=String(st.success);if(mc)mc.textContent=String(st.miss)}

  function rebuildCard(){
    var card=document.querySelector('#serveLandingScreen .servePlayerListCard');if(!card)return;
    card.innerHTML='<div class="serveServerTitle">サーバー選択</div><label class="serveServerTeam"><span>登録チーム</span><select id="serveServerTeamSelect"></select></label><label class="serveServerSearch"><span>名前検索</span><input id="serveServerSearchInput" type="search" placeholder="選手名を入力" autocomplete="off"></label><div id="serveServerList"></div><div id="serveServerCurrent" class="serveServerCurrent"></div>';
    var sel=e('serveServerTeamSelect'),ts=teams();
    sel.innerHTML='<option value="">登録チームを選択</option>'+ts.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.name)+(t.year?'（'+esc(t.year)+'）':'')+'</option>'}).join('');
    if(!selectedTeam&&ts.length)selectedTeam=String(ts[0].id);sel.value=selectedTeam;
    sel.onchange=function(){selectedTeam=this.value;selectedServer='';serverSearch='';var q=e('serveServerSearchInput');if(q)q.value='';renderServers()};
    var search=e('serveServerSearchInput');if(search){search.value=serverSearch;search.oninput=function(){serverSearch=this.value||'';renderServers()}}
    renderServers();
  }
  function renderServers(){
    var list=e('serveServerList'),cur=e('serveServerCurrent');if(!list||!cur)return;
    var all=players(),q=serverSearch.trim().toLowerCase(),level=currentLevel();
    var shown=q?all.filter(function(p){return String(p.name||'').toLowerCase().indexOf(q)!==-1}):all;
    if(!selectedServer&&all.length)selectedServer=String(all[0].id);
    list.innerHTML=shown.length?shown.map(function(p){var st=statFor(level,p.id),active=String(p.id)===String(selectedServer);return '<button type="button" class="serveServerBtn'+(active?' active':'')+'" data-id="'+esc(p.id)+'"><b>'+esc(p.number||'—')+'</b><span>'+esc(p.name||'名前未設定')+'</span><small>'+st.success+'成功 / '+st.miss+'ミス</small></button>'}).join(''):'<div style="color:#94a3b8;font-size:10px;padding:10px 2px">'+(q?'該当する選手がいません':'登録選手がありません')+'</div>';
    Array.prototype.forEach.call(list.querySelectorAll('.serveServerBtn'),function(b){b.onclick=function(){selectedServer=this.getAttribute('data-id')||'';renderServers()}});
    var p=selectedPlayer();
    if(!p){cur.innerHTML='<small>選択中</small><strong>サーバーを選択</strong>';syncTopCounts();return}
    var st=statFor(level,p.id),total=st.success+st.miss,rate=total?Math.round(st.success/total*100):0;
    cur.innerHTML='<small>選択中のサーバー ／ '+esc(level)+'</small><strong>'+(p.number?esc(p.number)+' ':'')+esc(p.name)+'</strong><div class="stats"><span>成功<b>'+st.success+'</b></span><span>ミス<b>'+st.miss+'</b></span><span>成功率<b>'+rate+'%</b></span></div>';
    syncTopCounts();
  }
  function addAction(type,point){
    var p=selectedPlayer();if(!p){alert('サーバーを選択してください。');return}
    sessionActions.push({id:'a_'+Date.now()+'_'+Math.random().toString(36).slice(2),level:currentLevel(),playerId:p.id,playerName:p.name||'名前未設定',playerNumber:p.number||'',type:type,x:point&&point.x!=null?point.x:null,y:point&&point.y!=null?point.y:null});
    renderServers();
  }
  function undoAction(){if(!sessionActions.length)return;sessionActions.pop();renderServers()}
  function clearActions(){if(!sessionActions.length)return;if(confirm('入力をすべて消しますか？')){sessionActions=[];renderServers()}}
  function ensureFinishButton(){var a=document.querySelector('#serveLandingScreen .serveLandingActions');if(!a)return;var b=a.querySelector('.serveFinishButton');if(!b){b=document.createElement('button');b.type='button';b.className='serveFinishButton';b.textContent='分析終了';a.appendChild(b)}b.onclick=finishServeAnalysis}

  function rowsFor(record,level){
    var map={};(record.actions||[]).forEach(function(a){if(a.level!==level)return;var k=String(a.playerId);var r=map[k]||(map[k]={id:a.playerId,name:a.playerName||'名前未設定',number:a.playerNumber||'',success:0,miss:0});if(a.type==='success')r.success++;else if(a.type==='miss')r.miss++});return Object.keys(map).map(function(k){return map[k]})
  }
  function resultBody(record,level){
    var actions=(record.actions||[]).filter(function(a){return a.level===level});var rows=rowsFor(record,level);
    var totalS=actions.filter(function(a){return a.type==='success'}).length,totalM=actions.filter(function(a){return a.type==='miss'}).length,total=totalS+totalM,rate=total?Math.round(totalS/total*100):0;
    var ranked=rows.slice().sort(function(a,b){var at=a.success+a.miss,bt=b.success+b.miss,ar=at?a.success/at:0,br=bt?b.success/bt:0;return br-ar||b.success-a.success});
    var ranking=ranked.length?ranked.map(function(r,i){var n=r.success+r.miss,rr=n?Math.round(r.success/n*100):0;return '<div class="serveRankRow"><em>'+(i+1)+'</em><span>'+esc((r.number?r.number+' ':'')+r.name)+'</span><small>'+n+'本</small><b>'+rr+'%</b></div>'}).join(''):'<div class="serveHeatEmpty">このLEVELの入力なし</div>';
    var heat=actions.filter(function(a){return a.type==='success'&&a.x!=null&&a.y!=null}).map(function(a){return '<i class="serveHeatPoint" style="left:'+Math.max(0,Math.min(100,Number(a.x)))+'%;top:'+Math.max(0,Math.min(100,Number(a.y)))+'%" title="'+esc(a.playerName)+'"></i>'}).join('')||'<div class="serveHeatEmpty">着地点データなし</div>';
    var details=ranked.length?ranked.map(function(r){var n=r.success+r.miss,rr=n?Math.round(r.success/n*100):0;return '<details class="servePlayerDetail"><summary><span>'+esc((r.number?r.number+' ':'')+r.name)+'</span><b>'+r.success+'成功</b><b>'+r.miss+'ミス</b><b>'+rr+'%</b></summary><div class="servePlayerDetailBody">合計 '+n+'本 ／ 成功 '+r.success+'本 ／ ミス '+r.miss+'本</div></details>'}).join(''):'<div class="serveHeatEmpty">このLEVELの入力なし</div>';
    return '<section class="serveResultSummary"><div class="serveMetric"><span>総本数</span><b>'+total+'</b></div><div class="serveMetric"><span>成功</span><b>'+totalS+'</b></div><div class="serveMetric"><span>ミス</span><b>'+totalM+'</b></div><div class="serveMetric"><span>成功率</span><b>'+rate+'%</b></div></section><section class="serveResultCard"><h3>成功率ランキング</h3><div class="serveRanking">'+ranking+'</div></section><section class="serveResultCard"><h3>着地点ヒートマップ</h3><div class="serveHeatmap">'+heat+'</div></section><section class="serveResultCard" style="grid-column:1/-1"><h3>選手別詳細</h3><div class="servePlayerDetails">'+details+'</div></section>';
  }
  function switchResultLevel(overlay,record,level){
    if(LEVELS.indexOf(level)<0)return;
    var dash=overlay.querySelector('#serveResultDashboard');if(!dash)return;
    Array.prototype.forEach.call(overlay.querySelectorAll('.serveLevelTabs button'),function(b){b.classList.toggle('active',b.getAttribute('data-level')===level)});
    dash.innerHTML=resultBody(record,level);
  }
  function showServeResult(record,initialLevel){
    var old=e('serveResultOverlay');if(old)old.parentNode.removeChild(old);
    var active=LEVELS.indexOf(initialLevel)>=0?initialLevel:'LEVEL 1';
    var overlay=document.createElement('div');overlay.id='serveResultOverlay';overlay.className='serveResultOverlay show';
    overlay.innerHTML='<div class="serveResultPanel"><div class="serveResultHead"><div><h2>サーブ分析結果</h2><div class="serveResultMeta">'+esc(record.teamName||'チーム未選択')+'</div></div></div><div class="serveLevelTabs">'+LEVELS.map(function(l){var empty=!((record.actions||[]).some(function(a){return a.level===l}));return '<button type="button" data-level="'+l+'" class="'+(l===active?'active ':'')+(empty?'empty':'')+'">'+l+'</button>'}).join('')+'</div><div id="serveResultDashboard" class="serveResultDashboard"></div><div class="serveResultActions"><button type="button" data-action="back">入力画面へ戻る</button><button type="button" class="primary" data-action="close">終了</button></div></div>';
    document.body.appendChild(overlay);
    Array.prototype.forEach.call(overlay.querySelectorAll('.serveLevelTabs button'),function(btn){btn.onclick=function(ev){ev.preventDefault();ev.stopPropagation();switchResultLevel(overlay,record,this.getAttribute('data-level'))}});
    overlay.querySelector('[data-action="back"]').onclick=function(){overlay.parentNode.removeChild(overlay)};
    overlay.querySelector('[data-action="close"]').onclick=function(){overlay.parentNode.removeChild(overlay);if(typeof window.closeServeLandingAnalysis==='function')window.closeServeLandingAnalysis()};
    switchResultLevel(overlay,record,active);
  }
  function finishServeAnalysis(){
    if(!sessionActions.length){alert('入力データがありません。');return}
    if(!confirm('この練習を保存して結果画面へ移動しますか？'))return;
    var t=currentTeam(),record={id:'serve_'+Date.now(),createdAt:new Date().toISOString(),teamId:selectedTeam,teamName:t?t.name:'',level:currentLevel(),actions:sessionActions.map(function(a){return Object.assign({},a)})};
    try{var saved=JSON.parse(localStorage.getItem(RECORD_KEY)||'[]');if(!Array.isArray(saved))saved=[];saved.unshift(record);localStorage.setItem(RECORD_KEY,JSON.stringify(saved))}catch(err){console.error(err)}
    showServeResult(record,currentLevel());
  }

  document.addEventListener('DOMContentLoaded',function(){
    var oldOpen=window.openServeLandingAnalysis;
    window.openServeLandingAnalysis=function(level){
      selectedServer='';selectedTeam='';serverSearch='';sessionActions=[];
      try{if(typeof oldOpen==='function')oldOpen(level)}catch(err){console.error('serve open recovery',err)}
      var screen=e('serveLandingScreen');if(screen){screen.classList.add('show');screen.setAttribute('aria-hidden','false')}
      var tx=e('serveLandingLevelText');if(tx)tx.textContent=LEVELS.indexOf(level)>=0?level:'LEVEL 1';
      document.body.style.overflow='hidden';setTimeout(function(){rebuildCard();ensureFinishButton();renderServers()},0)
    };
    var court=e('serveLandingCourt');if(court)court.addEventListener('pointerup',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('.serveHumanIcon'))return;var r=court.getBoundingClientRect();if(!r.width||!r.height)return;addAction('success',{x:(ev.clientX-r.left)/r.width*100,y:(ev.clientY-r.top)/r.height*100})});
    window.recordServeMiss=function(){addAction('miss')};
    window.undoServeLanding=function(){undoAction()};
    window.clearServeLanding=function(){clearActions()};
    ensureFinishButton();
  });
})();
