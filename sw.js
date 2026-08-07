const CACHE_NAME = 'settertheory-v151-1-32-presentation-outer-frame-fit';
const ASSETS=['./','./index.html','./app_v141_setter_split.js?v=151190','./manifest.json','./icons/aquila-192.png','./icons/aquila-512.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{if(response&&response.ok&&new URL(event.request.url).origin===self.location.origin){const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone());}return response;}).catch(()=>caches.match(event.request)));
});
