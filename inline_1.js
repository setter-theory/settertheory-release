
function openPositionManager(){const m=document.getElementById('positionManagerModal');if(m){renderRosterPanel();m.classList.add('show');m.setAttribute('aria-hidden','false');}}
function closePositionManager(){const m=document.getElementById('positionManagerModal');if(m){m.classList.remove('show');m.setAttribute('aria-hidden','true');renderSetup();}}
