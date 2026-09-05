
const CACHE='redcap-v5';
const ASSETS=['./','./index.html','./css/styles-v2.css','./js/app-v5.js','./manifest.webmanifest','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/favicon.ico'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  // cache:'reload' bypasses the browser's own HTTP cache so the app shell is always
  // genuinely fresh at install time, not whatever was last cached per Cache-Control.
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>fetch(a,{cache:'reload'}).then(r=>c.put(a,r))))));
});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k))))]))});
self.addEventListener('fetch',e=>{
  const url = new URL(e.request.url);
  // Only cache same-origin app-shell GETs. Never touch cross-origin API/auth calls -
  // those must always hit the network live, and caching authenticated responses by
  // URL alone would risk serving stale or cross-session data.
  if(e.request.method!=='GET' || url.origin !== self.location.origin) return;
  e.respondWith((async()=>{
    try{
      // cache:'reload' bypasses the browser's HTTP cache too, not just this SW's cache -
      // otherwise a still-fresh-per-headers browser cache entry silently wins over a
      // genuinely newer deployment (bit us once already: Cloudflare imposes its own
      // max-age regardless of the no-cache header this app's origin actually sends).
      const res = await fetch(e.request, {cache:'reload'});
      const cache = await caches.open(CACHE);
      cache.put(e.request, res.clone());
      return res;
    }catch(err){
      const cached = await caches.match(e.request);
      if(cached) return cached;
      throw err;
    }
  })());
});
