
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const LS={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
function syncHeadRowsScroll(headSel, rowsSel){
  const head=$(headSel), rows=$(rowsSel); if(!head||!rows) return;
  rows.addEventListener("scroll",()=>{ head.scrollLeft=rows.scrollLeft });
}

// ===== Config =====
const AUTH_BASE = "https://fdp-auth.danuntu.com";
const API_BASE = "https://redcap-api.danuntu.com";
const PRINT_BASE = "https://fdp-print.danuntu.com";

// ===== Auth =====
const Auth = {
  getAccess(){ return LS.get("redcap.auth.access", null) },
  getRefresh(){ return LS.get("redcap.auth.refresh", null) },
  setTokens(access, refresh){ LS.set("redcap.auth.access", access); if(refresh) LS.set("redcap.auth.refresh", refresh) },
  clear(){ localStorage.removeItem("redcap.auth.access"); localStorage.removeItem("redcap.auth.refresh") },
  claims(){
    const t = this.getAccess(); if(!t) return null;
    try{ return JSON.parse(atob(t.split(".")[1])) }catch{ return null }
  },
  isLoggedIn(){
    const c = this.claims(); return !!(c && c.exp*1000 > Date.now())
  },
  async login(username, password){
    const res = await fetch(`${AUTH_BASE}/auth/login`, {
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({username, password})
    });
    if(!res.ok) throw new Error(res.status===401?"Incorrect username or password":"Login failed");
    const data = await res.json();
    this.setTokens(data.access_token, data.refresh_token);
  },
  async refresh(){
    const rt = this.getRefresh(); if(!rt) return false;
    const res = await fetch(`${AUTH_BASE}/auth/refresh`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refresh_token:rt})
    });
    if(!res.ok){ this.clear(); return false }
    const data = await res.json();
    this.setTokens(data.access_token, null);
    return true
  },
  async logout(){
    const rt = this.getRefresh();
    if(rt){ try{ await fetch(`${AUTH_BASE}/auth/logout`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refresh_token:rt})}) }catch{} }
    this.clear();
  }
};

async function authFetch(url, opts={}){
  opts.headers = {...(opts.headers||{}), Authorization:`Bearer ${Auth.getAccess()}`};
  let res = await fetch(url, opts);
  if(res.status===401){
    const refreshed = await Auth.refresh();
    if(refreshed){
      opts.headers.Authorization = `Bearer ${Auth.getAccess()}`;
      res = await fetch(url, opts);
    }
  }
  return res;
}

async function apiErrorMessage(res, fallback){
  try{ const data = await res.json(); return data.detail || fallback }catch{ return fallback }
}

// ===== API =====
const Api = {
  async listHydrants(q, districtId){
    const url = new URL(`${API_BASE}/hydrants`);
    if(q) url.searchParams.set("q", q);
    if(districtId) url.searchParams.set("district_id", districtId);
    const res = await authFetch(url);
    if(!res.ok) throw new Error("Failed to load hydrants");
    return res.json();
  },
  async createHydrant(body){
    const res = await authFetch(`${API_BASE}/hydrants`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to save hydrant"));
    return res.json();
  },
  async updateHydrant(id, body){
    const res = await authFetch(`${API_BASE}/hydrants/${id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to update hydrant"));
    return res.json();
  },
  async deleteHydrant(id){
    const res = await authFetch(`${API_BASE}/hydrants/${id}`, {method:"DELETE"});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to retire hydrant"));
  },
  async listInspections(hydrantId, type){
    const url = new URL(`${API_BASE}/inspections`);
    if(hydrantId) url.searchParams.set("hydrant_id", hydrantId);
    if(type) url.searchParams.set("inspection_type", type);
    const res = await authFetch(url);
    if(!res.ok) throw new Error("Failed to load inspections");
    return res.json();
  },
  async createInspection(body){
    const res = await authFetch(`${API_BASE}/inspections`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error("Failed to save inspection");
    return res.json();
  },
  async listDistricts(){
    const res = await authFetch(`${API_BASE}/districts`);
    if(!res.ok) throw new Error("Failed to load districts");
    return res.json();
  },
  async getSettings(){
    const res = await authFetch(`${API_BASE}/settings`);
    if(!res.ok) throw new Error("Failed to load settings");
    return res.json();
  },
  async putSetting(key, value){
    const res = await authFetch(`${API_BASE}/settings/${key}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({value})});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to save setting"));
    return res.json();
  },
  async listPhotos(inspectionId){
    const res = await authFetch(`${API_BASE}/inspections/${inspectionId}/photos`);
    if(!res.ok) throw new Error("Failed to load photos");
    return res.json();
  },
  async uploadPhoto(inspectionId, file){
    const fd = new FormData(); fd.append("file", file);
    const res = await authFetch(`${API_BASE}/inspections/${inspectionId}/photos`, {method:"POST", body:fd});
    if(!res.ok) throw new Error(await apiErrorMessage(res, `Failed to upload ${file.name}`));
    return res.json();
  },
  async openPhoto(photoId){
    const res = await authFetch(`${API_BASE}/inspection-photos/${photoId}/download`);
    if(!res.ok) throw new Error("Failed to load photo");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  },
  async listHoses(q, category){
    const url = new URL(`${API_BASE}/hoses`);
    if(q) url.searchParams.set("q", q);
    if(category) url.searchParams.set("category", category);
    const res = await authFetch(url);
    if(!res.ok) throw new Error("Failed to load hoses");
    return res.json();
  },
  async createHose(body){
    const res = await authFetch(`${API_BASE}/hoses`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to save hose"));
    return res.json();
  },
  async updateHose(id, body){
    const res = await authFetch(`${API_BASE}/hoses/${id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to update hose"));
    return res.json();
  },
  async deleteHose(id){
    const res = await authFetch(`${API_BASE}/hoses/${id}`, {method:"DELETE"});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to retire hose"));
  },
  async listHoseTests(hoseId){
    const url = new URL(`${API_BASE}/hose-tests`);
    if(hoseId) url.searchParams.set("hose_id", hoseId);
    const res = await authFetch(url);
    if(!res.ok) throw new Error("Failed to load hose tests");
    return res.json();
  },
  async createHoseTest(body){
    const res = await authFetch(`${API_BASE}/hose-tests`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to save hose test"));
    return res.json();
  }
};

// ===== Printing (fdp-print) =====
const Print = {
  async render(templateName, data){
    const res = await authFetch(`${PRINT_BASE}/render/${templateName}`, {
      method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({data})
    });
    if(!res.ok) throw new Error(await apiErrorMessage(res, "Failed to generate PDF"));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }
};

// ===== Local-only config (statuses/checklist/maintenance templates) =====
const STATE={
  statuses:LS.get("redcap.statuses",[
    {id:"ok",name:"OK",color:"#16a34a",activity:"none"},
    {id:"needs",name:"Needs",color:"#b45309",activity:"maintenance"},
    {id:"oos",name:"OOS",color:"#b91c1c",activity:"urgent"}
  ]),
  checklist:LS.get("redcap.checklist",["Caps present/intact","No leaks","Threads clean"]),
  maint:LS.get("redcap.maint",["Lubricate stem","Paint touch-up","Replace gaskets"]),
  rules:LS.get("redcap.rules",[
    "Flow test interval: every hydrant should receive a flow test with real recorded readings (static, residual, discharge/AFF) at least once every 5 years. RedCap's Overdue Flow Tests report and compliance badges flag any hydrant with no qualifying flow test in the last 6+ years.",
    "Annual activity: every hydrant should have at least one flow test or M&I record logged in each calendar year. The No Activity This Year report and dashboard tiles flag hydrants with nothing recorded so far this year.",
    "Hydrant numbering: field-facing hydrant numbers must always match what is physically printed or painted on the hydrant. Numbers are never renumbered or reformatted in RedCap, even when the same number is reused across different districts."
  ]),
  hydrants:[],
  districts:[],
  route:"dashboard"
};
// Backend-synced now (org_settings table via /settings) so statuses/checklist/
// maintenance items/rules stay consistent across devices instead of drifting
// per-browser. localStorage stays as an offline read cache and as the
// first-paint fallback before loadOrgSettings() resolves.
async function loadOrgSettings(){
  try{
    const s = await Api.getSettings();
    STATE.statuses=s.statuses; STATE.checklist=s.checklist; STATE.maint=s.maint; STATE.rules=s.rules;
    LS.set("redcap.statuses",s.statuses); LS.set("redcap.checklist",s.checklist); LS.set("redcap.maint",s.maint); LS.set("redcap.rules",s.rules);
  }catch(e){
    toast("Couldn't sync settings — using cached values",{bg:"#b45309"});
  }
}
function saveConfig(key){
  LS.set("redcap."+key, STATE[key]);
  Api.putSetting(key, STATE[key]).catch(e=>{ toast("Saved on this device, but didn't sync: "+e.message,{bg:"#b45309"}) });
}

function toast(msg,{bg,ms}={}){ const t=document.createElement("div"); t.className="toast"; if(bg)t.style.background=bg; t.textContent=msg; $("#toastbox").appendChild(t); setTimeout(()=>t.remove(), ms??3500) }

function districtName(id){ return STATE.districts.find(d=>d.id===id)?.name || "—" }
// STATE.hydrants gets narrowed whenever the Hydrants tab applies its own search/district
// filter, so it's not safe as a lookup source elsewhere (Flow/M&I save would then fail to
// find real hydrants outside that narrowed set). ALL_HYDRANTS is a separate, always-complete
// cache used for lookups; refreshed at boot and after any hydrant create/update/retire.
let ALL_HYDRANTS=[];
async function refreshAllHydrants(){
  try{
    ALL_HYDRANTS=await Api.listHydrants();
    cacheRead("all_hydrants",ALL_HYDRANTS);
  }catch{
    const cached=getCachedRead("all_hydrants");
    if(cached) ALL_HYDRANTS=cached.data;
  }
}
function findHydrant(districtId, num){ return ALL_HYDRANTS.find(h=>h.district_id===districtId && String(h.hydrant_number)===String(num)) }
async function loadDistricts(){
  try{ STATE.districts = await Api.listDistricts() }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  const opts = STATE.districts.map(d=>`<option value="${d.id}">${d.name}</option>`).join("");
  $("#flowDistrict").innerHTML = opts;
  $("#miDistrict").innerHTML = opts;
  $("#importDistrict").innerHTML = opts;
  $("#hydrDistrict").innerHTML = `<option value="">All districts</option>` + opts;
}

// ===== Nav =====
// ===== Context bar (page/view-specific tools, set by whichever view is active) =====
function setContextBar(html){ const cb=$("#contextbar"); cb.innerHTML=html; cb.style.display="flex" }
function clearContextBar(){ const cb=$("#contextbar"); cb.innerHTML=""; cb.style.display="none" }

function goto(tab){
  STATE.route=tab; $$("#content>section").forEach(s=>s.hidden=(s.id!=="tab-"+tab)); $("#pagetitle").textContent=(tab==="mi"?"Maintenance & Inspection":tab[0].toUpperCase()+tab.slice(1));
  $$(".tabbtn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab)); $("#bottombar").classList.toggle("hidden",tab!=="flow"); location.hash="#/"+tab;
  clearContextBar();
  if(tab==="dashboard")renderDashboard(); if(tab==="hydrants")renderHydrants(); if(tab==="hoses")renderHoses(); if(tab==="settings")renderSettings(); if(tab==="reports")renderReportsTab();
}
window.addEventListener("hashchange",()=>goto(location.hash.replace(/^#\/?/,"")||"dashboard"));
function bindNav(){ $$(".tabbtn").forEach(b=>b.addEventListener("click",()=>goto(b.dataset.tab))) }

// ===== Dashboard =====
async function renderDashboard(){
  let inspections=[];
  try{
    STATE.hydrants = await Api.listHydrants();
    inspections = await Api.listInspections();
    cacheRead("dashboard",{hydrants:STATE.hydrants, inspections});
  }catch(e){
    const cached=getCachedRead("dashboard");
    if(!cached){ toast(e.message,{bg:"#b91c1c"}); return }
    STATE.hydrants=cached.data.hydrants; inspections=cached.data.inspections;
    toast(`Offline — showing cached dashboard from ${cacheAgeLabel(cached.cachedAt)}.`,{bg:"#b45309"});
  }

  const lastFlow=trueLastFlowMap(inspections); const now=new Date(); const thisYear=now.getFullYear();
  const isOverdue=h=>{
    const last=lastFlow.get(h.id)||null;
    const years=last?Math.floor((now-new Date(last+"T00:00:00"))/(365.25*24*3600*1000)):Infinity;
    return years>=FLOW_TEST_OVERDUE_YEARS;
  };
  const isNoActivity=h=>!h.last_activity_date || new Date(h.last_activity_date+"T00:00:00").getFullYear()!==thisYear;
  const pct=(n,total)=>total?Math.round(n/total*100):0;

  const byDistrict=new Map();
  STATE.hydrants.forEach(h=>{
    const d=districtName(h.district_id);
    if(!byDistrict.has(d)) byDistrict.set(d,{count:0, statusCounts:{}, overdue:0, noActivity:0});
    const entry=byDistrict.get(d);
    entry.count++;
    const key=h.status||"_none";
    entry.statusCounts[key]=(entry.statusCounts[key]||0)+1;
    if(isOverdue(h)) entry.overdue++;
    if(isNoActivity(h)) entry.noActivity++;
  });
  const k=$("#kpi"); k.innerHTML="";
  byDistrict.forEach((entry,d)=>{
    const t=document.createElement("div"); t.className="tile";
    const pills=STATE.statuses.map(s=>{
      const c=entry.statusCounts[s.id]||0; if(!c) return "";
      return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:999px;border:1px solid ${s.color};color:${s.color};margin:2px 4px 0 0"><span style="width:8px;height:8px;border-radius:50%;background:${s.color}"></span>${s.name} ${c}</span>`;
    }).join("");
    const noneCount=entry.statusCounts["_none"]||0;
    const nonePill=noneCount?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 6px;border-radius:999px;border:1px solid #e5e7eb;color:#6b7280;margin:2px 4px 0 0">Not set ${noneCount}</span>`:"";
    t.innerHTML=`<h3 style='margin:0 0 6px;color:#6b7280'>${d}</h3><div style='font-size:28px;font-weight:800'>${entry.count}</div>
      <div style="margin-top:6px">${pills}${nonePill}</div>
      <div style="margin-top:8px;font-size:12px;color:var(--muted);line-height:1.6">
        <div>${entry.overdue} overdue flow test${entry.overdue===1?"":"s"} <b style="color:#111827">(${pct(entry.overdue,entry.count)}%)</b></div>
        <div>${entry.noActivity} no activity this year <b style="color:#111827">(${pct(entry.noActivity,entry.count)}%)</b></div>
      </div>`;
    k.appendChild(t);
  });

  const overdueCount=STATE.hydrants.filter(isOverdue).length;
  const noActivityCount=STATE.hydrants.filter(isNoActivity).length;
  const flaggedCount=inspections.filter(r=>r.flags_jsonb?.needs_review).length;

  let hoses=[];
  try{ hoses=await Api.listHoses() }catch{}
  const hoseInServiceCount=hoses.filter(h=>h.in_service).length;
  const hoseOverdueCount=hoses.filter(isHoseOverdue).length;

  const legend=$("#statusLegend");
  legend.innerHTML=`<div class="grid g3">
    <div class="tile" id="dashOverdue" style="cursor:pointer"><h3 style='margin:0 0 6px;color:#6b7280'>Overdue Flow Tests</h3><div style='font-size:28px;font-weight:800;color:#b91c1c'>${overdueCount}</div></div>
    <div class="tile" id="dashNoActivity" style="cursor:pointer"><h3 style='margin:0 0 6px;color:#6b7280'>No Activity This Year</h3><div style='font-size:28px;font-weight:800;color:#b45309'>${noActivityCount}</div></div>
    <div class="tile" id="dashFlagged" style="cursor:pointer"><h3 style='margin:0 0 6px;color:#6b7280'>Flagged for Review</h3><div style='font-size:28px;font-weight:800'>${flaggedCount}</div></div>
  </div>
  <div class="grid g3" style="margin-top:10px">
    <div class="tile"><h3 style='margin:0 0 6px;color:#6b7280'>Hoses In Service</h3><div style='font-size:28px;font-weight:800'>${hoseInServiceCount}<span style="font-size:14px;font-weight:400;color:var(--muted)"> / ${hoses.length}</span></div></div>
    <div class="tile" id="dashHoseOverdue" style="cursor:pointer"><h3 style='margin:0 0 6px;color:#6b7280'>Overdue Hose Tests</h3><div style='font-size:28px;font-weight:800;color:#b91c1c'>${hoseOverdueCount}</div></div>
  </div>`;
  $("#dashOverdue").onclick=()=>{ goto("reports"); runReport("overdue-flow") };
  $("#dashNoActivity").onclick=()=>{ goto("reports"); runReport("no-activity") };
  $("#dashFlagged").onclick=()=>{ goto("reports"); runReport("flagged-review") };
  $("#dashHoseOverdue").onclick=()=>{ goto("reports"); runReport("hose-overdue") };
}

// ===== Hydrants list =====
function populateHydrStatus(){
  const sel=$("#hydrStatus"); if(!sel) return;
  sel.innerHTML=`<option value="">All statuses</option>`+STATE.statuses.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
}

function naturalHydrantSort(a,b){
  const an=/^[0-9]+$/.test(a??""), bn=/^[0-9]+$/.test(b??"");
  if(an&&bn) return parseInt(a,10)-parseInt(b,10);
  if(an&&!bn) return -1;
  if(!an&&bn) return 1;
  return (a??"").localeCompare(b??"");
}

let hydrSort={key:"hydrant_number", dir:"asc"};

function hydrSortValue(h,key){
  switch(key){
    case "hydrant_number": return h.hydrant_number??"";
    case "district": return districtName(h.district_id);
    case "make": return h.make||"";
    case "status": return STATE.statuses.find(s=>s.id===h.status)?.name||"";
    case "last_activity_date": return h.last_activity_date||"";
    default: return "";
  }
}
function applyHydrantSort(list){
  const {key,dir}=hydrSort; const mul=dir==="asc"?1:-1;
  return [...list].sort((a,b)=>{
    const av=hydrSortValue(a,key), bv=hydrSortValue(b,key);
    const ablank=av===""||av==null, bblank=bv===""||bv==null;
    if(ablank&&!bblank) return 1;
    if(!ablank&&bblank) return -1;
    if(ablank&&bblank) return 0;
    if(key==="hydrant_number") return mul*naturalHydrantSort(av,bv);
    return mul*String(av).localeCompare(String(bv),undefined,{numeric:true});
  });
}
// Columns are computed per render: District drops out once a specific district is
// filtered (redundant at that point), and Make/Last Activity drop out on narrow
// screens to keep this a real compact table instead of forcing a card layout.
function buildHydrColumns(districtFiltered){
  const mobile=window.innerWidth<=760;
  const cols=[
    {field:"hydrant_number", label:"#", sortKey:"hydrant_number", width:"40px"},
    {field:"location", label:"Location", sortKey:null, width:mobile?"1.8fr":"1.4fr"}
  ];
  if(!districtFiltered) cols.push({field:"district", label:"District", sortKey:"district", width:"1fr"});
  if(!mobile) cols.push({field:"make", label:"Make", sortKey:"make", width:"0.9fr"});
  cols.push({field:"status", label:"Status", sortKey:"status", width:mobile?"0.7fr":"0.9fr"});
  if(!mobile) cols.push({field:"last_activity_date", label:"Last Activity", sortKey:"last_activity_date", width:"1fr"});
  cols.push({field:"actions", label:"", sortKey:null, width:mobile?"180px":"1.4fr"});
  return cols;
}
function hydrCellHTML(h,field){
  switch(field){
    case "hydrant_number": return h.hydrant_number??"";
    case "location": return h.street_address??h.label??"";
    case "district": return districtName(h.district_id);
    case "make": return h.make??"";
    case "status": { const meta=STATE.statuses.find(s=>s.id===h.status)||{name:h.status||"—",color:"#e5e7eb"}; return `<span style="padding:2px 6px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:12px">${meta.name}</span>` }
    case "last_activity_date": return h.last_activity_date??"—";
    case "actions": {
      const hasLoc = h.latitude!=null && h.longitude!=null;
      const locTitle = hasLoc ? "" : ' title="No location set"';
      return `<button type="button" class="btn secondary" data-act="flow">Flow</button><button type="button" class="btn secondary" data-act="mi">M&amp;I</button><button type="button" class="btn secondary" data-act="preview" style="padding:9px 8px"${hasLoc?' title="Preview location"':locTitle}${hasLoc?"":" disabled"}>👁</button><button type="button" class="btn secondary" data-act="map" style="padding:9px 8px"${hasLoc?' title="Show on Map"':locTitle}${hasLoc?"":" disabled"}>📍</button>`;
    }
    default: return "";
  }
}

// ===== Hydrant map preview/modal (mirrors PrePlans' plan-list "quick view" +
// "Show on Map" pattern: a tiny locked flyout on hover, plus a real interactive
// map on click). Loaded via Leaflet CDN in index.html -- see comment there for
// why that's an acceptable tradeoff for this offline-tolerant app: the hover
// preview needs live map tiles regardless, so it isn't meaningfully more
// "offline" whether Leaflet itself ships locally or from a CDN.
// Standard street map, not satellite -- matches PrePlans' main map's own
// default base layer (MapPanel.tsx).
const HYDR_TILE_URL="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const HYDR_FLYOUT_W=260, HYDR_FLYOUT_H=180;
// Zoomed out one notch from a typical single-point preview (14, not 16+) --
// a lone hydrant needs surrounding street context to actually place it, unlike
// a property boundary which is its own visual anchor.
const HYDR_PREVIEW_ZOOM=14;

function computeHydrFlyoutPos(rect){
  let left=rect.right+8;
  if(left+HYDR_FLYOUT_W>window.innerWidth) left=rect.left-HYDR_FLYOUT_W-8;
  if(left<8) left=8;
  let top=rect.top;
  if(top+HYDR_FLYOUT_H>window.innerHeight) top=window.innerHeight-HYDR_FLYOUT_H-8;
  if(top<8) top=8;
  return {top,left};
}

let hydrPreviewEl=null;
function hideHydrantPreview(){
  if(hydrPreviewEl){ hydrPreviewEl.remove(); hydrPreviewEl=null }
}
function showHydrantPreview(h,anchorEl){
  if(h.latitude==null||h.longitude==null) return;
  hideHydrantPreview();
  const pos=computeHydrFlyoutPos(anchorEl.getBoundingClientRect());
  const el=document.createElement("div");
  el.style.cssText=`position:fixed;top:${pos.top}px;left:${pos.left}px;z-index:2000;width:${HYDR_FLYOUT_W}px;height:${HYDR_FLYOUT_H}px;border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.25);background:#fff`;
  document.body.appendChild(el);
  hydrPreviewEl=el;
  const map=L.map(el,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,keyboard:false,boxZoom:false}).setView([h.latitude,h.longitude],HYDR_PREVIEW_ZOOM);
  L.tileLayer(HYDR_TILE_URL).addTo(map);
  L.circleMarker([h.latitude,h.longitude],{radius:8,color:"#b10a0a",weight:2,fillColor:"#e34a4a",fillOpacity:.9}).addTo(map);
}

let hydrModalMap=null, hydrModalMarker=null;
function showHydrantMapModal(h){
  if(h.latitude==null||h.longitude==null) return;
  hideHydrantPreview();
  $("#hydrMapModalTitle").textContent=`Hydrant #${h.hydrant_number??"(unnumbered)"}${h.street_address?" — "+h.street_address:""}`;
  $("#hydrMapModal").showModal();
  if(!hydrModalMap){
    hydrModalMap=L.map("hydrMapModalMap").setView([h.latitude,h.longitude],HYDR_PREVIEW_ZOOM);
    L.tileLayer(HYDR_TILE_URL,{attribution:"&copy; OpenStreetMap contributors"}).addTo(hydrModalMap);
    hydrModalMarker=L.circleMarker([h.latitude,h.longitude],{radius:9,color:"#b10a0a",weight:2,fillColor:"#e34a4a",fillOpacity:.9}).addTo(hydrModalMap);
  } else {
    hydrModalMap.setView([h.latitude,h.longitude],HYDR_PREVIEW_ZOOM);
    hydrModalMarker.setLatLng([h.latitude,h.longitude]);
  }
  // The dialog's layout size isn't final until the next frame after showModal(),
  // so a map initialized (or just re-shown) in the same tick can render with a
  // stale/zero size until something forces a recalculation.
  setTimeout(()=>hydrModalMap&&hydrModalMap.invalidateSize(),60);
}
$("#hydrMapModalClose")?.addEventListener("click",()=>$("#hydrMapModal").close());
$("#hydrRows")?.addEventListener("scroll",hideHydrantPreview);
function renderHydrantHead(cols){
  const head=$("#hydrHead"); if(!head) return;
  head.style.gridTemplateColumns=cols.map(c=>c.width).join(" ");
  head.innerHTML="";
  cols.forEach(col=>{
    const d=document.createElement("div");
    if(col.sortKey){
      const active=hydrSort.key===col.sortKey;
      d.dataset.key=col.sortKey; if(active) d.classList.add("sorted");
      d.textContent=col.label+(active?(hydrSort.dir==="asc"?" ▲":" ▼"):"");
      d.addEventListener("click",()=>{
        if(hydrSort.key===col.sortKey){ hydrSort.dir=hydrSort.dir==="asc"?"desc":"asc" }
        else{ hydrSort={key:col.sortKey, dir:col.sortKey==="last_activity_date"?"desc":"asc"} }
        renderHydrants();
      });
    } else { d.textContent=col.label }
    head.appendChild(d);
  });
}

function goRecordFlow(h){
  goto("flow");
  $("#flowDistrict").value=h.district_id;
  $("#flowHydrant").value=h.hydrant_number??"";
  onHydrantFieldChange("flow"); $("#flowInspector").focus();
}
function goRecordMI(h){
  goto("mi");
  $("#miDistrict").value=h.district_id;
  $("#miHydrant").value=h.hydrant_number??"";
  onHydrantFieldChange("mi"); $("#miInspector").focus();
}

let currentHydrantPrintList=[];
async function renderHydrants(){
  hideHydrantDetail();
  hideHydrantPreview();
  const q=($("#hydrSearch")?.value||"").trim();
  const districtId=$("#hydrDistrict")?.value||"";
  const statusId=$("#hydrStatus")?.value||"";
  try{
    STATE.hydrants = await Api.listHydrants(q, districtId||undefined);
  }catch(e){
    const cached=getCachedRead("all_hydrants");
    if(!cached){ toast(e.message,{bg:"#b91c1c"}); return }
    const ql=q.toLowerCase();
    STATE.hydrants = cached.data.filter(h=>{
      if(districtId && h.district_id!==districtId) return false;
      if(!ql) return true;
      return [h.hydrant_number,h.label,h.street_address,h.notes].some(v=>v&&v.toLowerCase().includes(ql));
    });
    toast(`Offline — showing cached hydrants from ${cacheAgeLabel(cached.cachedAt)}.`,{bg:"#b45309"});
  }
  let list = statusId ? STATE.hydrants.filter(h=>h.status===statusId) : STATE.hydrants;
  list = applyHydrantSort(list);
  currentHydrantPrintList=list;
  const cols=buildHydrColumns(!!districtId);
  renderHydrantHead(cols);
  const rows=$("#hydrRows"); rows.innerHTML="";
  list.forEach(h=>{
    const r=document.createElement("div"); r.className="row"; r.style.cursor="pointer";
    r.style.gridTemplateColumns=cols.map(c=>c.width).join(" ");
    r.innerHTML=cols.map(c=>`<div${c.field==="actions"?' class="row-actions"':""}>${hydrCellHTML(h,c.field)}</div>`).join("");
    r.addEventListener("click",()=>showHydrantDetail(h));
    r.querySelector('[data-act="flow"]').addEventListener("click",e=>{ e.stopPropagation(); goRecordFlow(h) });
    r.querySelector('[data-act="mi"]').addEventListener("click",e=>{ e.stopPropagation(); goRecordMI(h) });
    const previewBtn=r.querySelector('[data-act="preview"]');
    // mouseenter/mouseleave for desktop hover; click as the touch-device
    // equivalent since there's no hover on a phone/tablet in the field.
    previewBtn.addEventListener("mouseenter",e=>{ e.stopPropagation(); showHydrantPreview(h,previewBtn) });
    previewBtn.addEventListener("mouseleave",e=>{ e.stopPropagation(); hideHydrantPreview() });
    previewBtn.addEventListener("click",e=>{ e.stopPropagation(); showHydrantPreview(h,previewBtn) });
    r.querySelector('[data-act="map"]').addEventListener("click",e=>{ e.stopPropagation(); showHydrantMapModal(h) });
    rows.appendChild(r);
  });
  setContextBar(`<button id="ctxPrintHydrantList" class="btn secondary">Print List…</button>`);
  $("#ctxPrintHydrantList").onclick=()=>$("#hydrPrintModal").showModal();
}
$("#hydrSearch")?.addEventListener("input",renderHydrants); $("#hydrClear")?.addEventListener("click",()=>{$("#hydrSearch").value=""; renderHydrants()});
$("#hydrDistrict")?.addEventListener("change",renderHydrants);
$("#hydrStatus")?.addEventListener("change",renderHydrants);
syncHeadRowsScroll("#hydrHead", "#hydrRows");
populateHydrStatus();

// ===== Hydrant detail =====
let currentDetailHydrant=null;
function hideHydrantDetail(){ $("#hydrListView").style.display=""; $("#hydrDetailView").hidden=true; currentDetailHydrant=null; }

// PIAL requires a flow test at least once every 5 years -- mirrors
// FLOW_TEST_OVERDUE_YEARS in backend/app/alerts_sync.py (was wrongly 6 here
// and there until fixed 2026-09-05; keep both in sync if this changes again).
const FLOW_TEST_OVERDUE_YEARS=5;
// Mirrors HOSE_TEST_OVERDUE_MONTHS in backend/app/alerts_sync.py -- keep in sync if that changes.
const HOSE_TEST_OVERDUE_MONTHS_JS=15;
function isHoseOverdue(h){
  if(!h.in_service) return false;
  if(!h.last_test_date) return true;
  const months=(new Date()-new Date(h.last_test_date+"T00:00:00"))/(30.44*24*3600*1000);
  return months>=HOSE_TEST_OVERDUE_MONTHS_JS;
}
function complianceBadges(h){
  const badges=[]; const now=new Date(); const thisYear=now.getFullYear();
  if(!h.last_flow_date){
    badges.push("⚠ No flow test on record");
  } else {
    const years=Math.floor((now-new Date(h.last_flow_date+"T00:00:00"))/(365.25*24*3600*1000));
    if(years>=FLOW_TEST_OVERDUE_YEARS) badges.push(`⚠ No flow test in ${years} years`);
  }
  if(!h.last_activity_date || new Date(h.last_activity_date+"T00:00:00").getFullYear()!==thisYear){
    badges.push("⚠ Nothing recorded this year");
  }
  return badges;
}

function renderHydrantFieldsView(h){
  const meta=STATE.statuses.find(s=>s.id===h.status)||{name:h.status||"—",color:"#e5e7eb"};
  const badges=complianceBadges(h);
  $("#hydrDetailFields").innerHTML=`
    <h3 style="margin:0 0 10px">Hydrant #${h.hydrant_number??"(unnumbered)"} — ${districtName(h.district_id)}</h3>
    ${badges.length?`<div class="compliance-badges">${badges.map(b=>`<span class="compliance-badge">${b}</span>`).join("")}</div>`:""}
    <div class="grid g3">
      <div><label>Location</label><div>${h.street_address??h.label??"—"}</div></div>
      <div><label>Status</label><div><span style="padding:2px 6px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:12px">${meta.name}</span></div></div>
      <div><label>Make</label><div>${h.make||"—"}</div></div>
      <div><label>Line Size</label><div>${h.line_size||"—"}</div></div>
      <div><label>Top</label><div>${h.top||"—"}</div></div>
      <div><label>Caps</label><div>${h.caps||"—"}</div></div>
      <div><label>Coordinates</label><div>${h.latitude}, ${h.longitude}</div></div>
      <div style="grid-column:span 2"><label>Notes</label><div>${h.notes||"—"}</div></div>
    </div>
    <div style="margin-top:10px;font-size:12px;color:var(--muted)">
      ${h.created_by?`Created by ${h.created_by}`:""}${h.created_by&&h.updated_by&&h.updated_by!==h.created_by?" · ":""}${h.updated_by&&h.updated_by!==h.created_by?`Last updated by ${h.updated_by}`:""}
    </div>`;
  $("#hydrDetailActions").hidden=false;
}

function renderHydrantFieldsEdit(h){
  $("#hydrDetailActions").hidden=true;
  const districtOpts=STATE.districts.map(d=>`<option value="${d.id}" ${d.id===h.district_id?"selected":""}>${d.name}</option>`).join("");
  const statusOpts=`<option value="">—</option>`+STATE.statuses.map(s=>`<option value="${s.id}" ${s.id===h.status?"selected":""}>${s.name}</option>`).join("");
  $("#hydrDetailFields").innerHTML=`
    <h3 style="margin:0 0 10px">Editing Hydrant #${h.hydrant_number??"(unnumbered)"}</h3>
    <div class="grid g3">
      <div><label>District</label><select id="edDistrict">${districtOpts}</select></div>
      <div><label>Hydrant #</label><input id="edNumber" value="${h.hydrant_number??""}"></div>
      <div><label>Status</label><select id="edStatus">${statusOpts}</select></div>
      <div><label>Location / Address</label><input id="edAddress" value="${h.street_address??""}"></div>
      <div><label>Make</label><input id="edMake" value="${h.make??""}"></div>
      <div><label>Line Size</label><input id="edLineSize" value="${h.line_size??""}"></div>
      <div><label>Top</label><input id="edTop" value="${h.top??""}"></div>
      <div><label>Caps</label><input id="edCaps" value="${h.caps??""}"></div>
      <div><label>Flow (GPM)</label><input id="edFlowGpm" type="number" value="${h.flow_gpm??""}"></div>
      <div><label>Latitude</label><input id="edLat" type="number" step="0.000001" value="${h.latitude}"></div>
      <div><label>Longitude</label><input id="edLon" type="number" step="0.000001" value="${h.longitude}"></div>
      <div style="display:flex;align-items:end"><button type="button" id="edUseLocation" class="btn secondary">📍 Use my location</button></div>
      <div style="grid-column:span 3"><label>Notes</label><textarea id="edNotes" rows="2">${h.notes??""}</textarea></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px"><button id="edSave" class="btn">Save changes</button><button id="edCancel" class="btn secondary">Cancel</button></div>`;
  $("#edUseLocation").onclick=()=>{
    if(!("geolocation" in navigator)){ toast("Location isn't available on this device/browser.",{bg:"#b91c1c"}); return }
    const btn=$("#edUseLocation"); const original=btn.textContent; btn.textContent="Locating…"; btn.disabled=true;
    navigator.geolocation.getCurrentPosition(
      pos=>{
        $("#edLat").value=pos.coords.latitude.toFixed(6);
        $("#edLon").value=pos.coords.longitude.toFixed(6);
        toast("Location filled in.");
        btn.textContent=original; btn.disabled=false;
      },
      err=>{
        const msg=err.code===err.PERMISSION_DENIED?"Location permission denied.":"Couldn't get your location.";
        toast(msg,{bg:"#b91c1c"});
        btn.textContent=original; btn.disabled=false;
      },
      {enableHighAccuracy:true, timeout:10000}
    );
  };
  $("#edSave").onclick=async()=>{
    try{
      const updated=await Api.updateHydrant(h.id,{
        district_id:$("#edDistrict").value, hydrant_number:$("#edNumber").value||null, label:h.label,
        street_address:$("#edAddress").value||null, city:h.city, state:h.state, postal_code:h.postal_code,
        latitude:parseFloat($("#edLat").value), longitude:parseFloat($("#edLon").value),
        status:$("#edStatus").value||null, flow_gpm:$("#edFlowGpm").value?parseInt($("#edFlowGpm").value):null,
        notes:$("#edNotes").value||null, make:$("#edMake").value||null, line_size:$("#edLineSize").value||null,
        top:$("#edTop").value||null, caps:$("#edCaps").value||null
      });
      toast("Hydrant updated.");
      currentDetailHydrant={...updated, last_activity_date:h.last_activity_date, last_flow_date:h.last_flow_date};
      renderHydrantFieldsView(currentDetailHydrant);
      refreshAllHydrants();
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  $("#edCancel").onclick=()=>renderHydrantFieldsView(h);
}

function hasFlowReadings(flags){
  return [flags.static,flags.residual,flags.pitot,flags.total_discharge??flags.discharge,flags.aff]
    .some(v=>v!==null && v!==undefined && v!=="");
}
function historyToPrintRows(records){
  return records.map(r=>{
    const flags=r.flags_jsonb||{};
    let type, summary;
    if(r.inspection_type==="flow"){
      type="Flow Test";
      summary = hasFlowReadings(flags)
        ? `Static ${flags.static??"—"} · Residual ${flags.residual??"—"} · Pitot ${flags.pitot??"—"} · Discharge ${flags.total_discharge??flags.discharge??"—"} · AFF ${flags.aff??"—"}`
        : "";
    } else {
      type="M&I";
      const checklist=[...(flags.checks||[]),...(flags.tasks||[])];
      const issues=checklist.filter(i=>i.state==="issue");
      summary = checklist.length
        ? (issues.length ? `${issues.length} issue${issues.length>1?"s":""}: ${issues.map(i=>i.item).join(", ")}` : "All OK")
        : (r.status ? `Status: ${STATE.statuses.find(s=>s.id===r.status)?.name||r.status}` : "");
    }
    return {date:r.inspection_date, type, summary, notes:r.notes||""};
  });
}

function buildHistoryRow(r){
  const row=document.createElement("div"); row.className="histrow";
  const flags=r.flags_jsonb||{};
  const review=flags.needs_review?`<div class="review">⚠ ${flags.needs_review.replace(/_/g," ")}</div>`:"";
  let badge="", metrics="", extras="";

  if(r.inspection_type==="flow"){
    const readings=[["Static",flags.static],["Residual",flags.residual],["Pitot",flags.pitot],
                     ["Discharge",flags.total_discharge??flags.discharge],["AFF",flags.aff]];
    if(hasFlowReadings(flags)){
      badge=`<span class="histbadge flow">Flow Test</span>`;
      metrics=`<div class="histmetrics">${readings.map(([label,val])=>`<div class="m"><label>${label}</label><b>${val??"—"}</b></div>`).join("")}</div>`;
    }
    // no real readings: legacy service-visit entry — just the date and its note, no badge/metrics
    extras=`${r.notes?`<div>${r.notes}</div>`:""}${review}`;
  } else {
    badge=`<span class="histbadge mi">M&amp;I</span>`;
    const checklist=[...(flags.checks||[]),...(flags.tasks||[])];
    const issues=checklist.filter(i=>i.state==="issue");
    if(checklist.length){
      metrics=`<div class="histmetrics"><span class="histbadge ${issues.length?"issue":"ok"}">${issues.length?`⚠ ${issues.length} issue${issues.length>1?"s":""}`:"All OK"}</span></div>`;
    } else if(r.status){
      const meta=STATE.statuses.find(s=>s.id===r.status)||{name:r.status,color:"#e5e7eb"};
      metrics=`<div class="histmetrics"><div class="m"><label>Status</label><b><span style="padding:2px 6px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:12px">${meta.name}</span></b></div></div>`;
    }
    const flagLines=issues.map(i=>`<div class="flagitem">⚠ ${i.item}${i.note?` — ${i.note}`:""}</div>`).join("");
    extras=`${flagLines}${r.notes?`<div>${r.notes}</div>`:""}${review}`;
  }

  row.innerHTML=`
    <div class="histrow-main">
      <span class="histdate">${r.inspection_date}</span>
      ${badge}
      ${metrics}
    </div>
    ${extras?`<div class="histrow-extra">${extras}</div>`:""}
    <div class="histrow-extra hist-photos">
      <a href="#" class="hist-photos-toggle">📷 Photos</a>
      <div class="hist-photos-list" style="display:none;margin-top:6px"></div>
    </div>`;

  const toggle=row.querySelector(".hist-photos-toggle");
  const list=row.querySelector(".hist-photos-list");
  let loaded=false;
  toggle.addEventListener("click", async e=>{
    e.preventDefault();
    const showing = list.style.display!=="none";
    if(showing){ list.style.display="none"; return }
    list.style.display="block";
    if(loaded) return;
    list.textContent="Loading…";
    try{
      const photos=await Api.listPhotos(r.id);
      loaded=true;
      list.innerHTML = photos.length
        ? photos.map(p=>`<a href="#" class="hist-photo-open" data-id="${p.id}" style="display:inline-block;margin:0 8px 6px 0;font-size:12px">${p.original_filename||"photo"}</a>`).join("")
        : `<span style="color:var(--muted)">No photos on this record.</span>`;
      list.querySelectorAll(".hist-photo-open").forEach(a=>{
        a.addEventListener("click", async ev=>{
          ev.preventDefault();
          try{ await Api.openPhoto(a.dataset.id) }catch(err){ toast(err.message,{bg:"#b91c1c"}) }
        });
      });
    }catch(e){ list.textContent="Couldn't load photos."; }
  });
  return row;
}

const MONTH_NAMES=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
let currentHydrantRecords=[];

function populateMonthOptions(year){
  const sel=$("#histMonth"); if(!sel) return;
  const filtered=year?currentHydrantRecords.filter(r=>r.inspection_date.slice(0,4)===year):currentHydrantRecords;
  const months=[...new Set(filtered.map(r=>r.inspection_date.slice(5,7)))].sort();
  const prior=sel.value;
  sel.innerHTML=`<option value="">All months</option>`+months.map(m=>`<option value="${m}">${MONTH_NAMES[parseInt(m,10)-1]}</option>`).join("");
  if(months.includes(prior)) sel.value=prior;
}
function populateHistFilters(){
  const yearSel=$("#histYear"); if(!yearSel) return;
  const years=[...new Set(currentHydrantRecords.map(r=>r.inspection_date.slice(0,4)))].sort((a,b)=>b.localeCompare(a));
  yearSel.innerHTML=`<option value="">All years</option>`+years.map(y=>`<option value="${y}">${y}</option>`).join("");
  populateMonthOptions("");
}
function matchesHistFilters(r){
  const year=$("#histYear")?.value||""; const month=$("#histMonth")?.value||"";
  const q=($("#histSearch")?.value||"").trim().toLowerCase();
  if(year && !r.inspection_date.startsWith(year)) return false;
  if(month && r.inspection_date.slice(5,7)!==month) return false;
  if(q){
    const flags=r.flags_jsonb||{};
    const hay=[r.inspection_date, r.inspection_type, r.notes, r.status,
      ...(flags.checks||[]).flatMap(c=>[c.item,c.note]), ...(flags.tasks||[]).flatMap(c=>[c.item,c.note])]
      .filter(Boolean).join(" ").toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}
function renderHistoryList(){
  const hist=$("#hydrDetailHistory"); if(!hist) return;
  if(!currentHydrantRecords.length){ hist.innerHTML=`<div class="muted">No history recorded yet.</div>`; return }
  const filtered=currentHydrantRecords.filter(matchesHistFilters);
  if(!filtered.length){ hist.innerHTML=`<div class="muted">No records match those filters.</div>`; return }
  const list=document.createElement("div"); list.className="histlist";
  filtered.forEach(r=>list.appendChild(buildHistoryRow(r)));
  hist.innerHTML=""; hist.appendChild(list);
}

async function showHydrantDetail(h){
  hideHydrantPreview();
  currentDetailHydrant=h;
  $("#hydrListView").style.display="none"; $("#hydrDetailView").hidden=false;
  renderHydrantFieldsView(h);
  $("#hydrEdit").onclick=()=>renderHydrantFieldsEdit(currentDetailHydrant);
  $("#hydrPrint").onclick=async()=>{
    try{
      const meta=STATE.statuses.find(s=>s.id===currentDetailHydrant.status)||{name:currentDetailHydrant.status||""};
      await Print.render("hydrant_record_sheet", {
        district_name: districtName(currentDetailHydrant.district_id),
        hydrant_number: currentDetailHydrant.hydrant_number,
        location: currentDetailHydrant.street_address ?? currentDetailHydrant.label ?? "",
        status: meta.name,
        make: currentDetailHydrant.make || "",
        line_size: currentDetailHydrant.line_size || "",
        top: currentDetailHydrant.top || "",
        caps: currentDetailHydrant.caps || "",
        coordinates: `${currentDetailHydrant.latitude}, ${currentDetailHydrant.longitude}`,
        notes: currentDetailHydrant.notes || "",
        badges: complianceBadges(currentDetailHydrant),
        history: historyToPrintRows(currentHydrantRecords),
        generated_by: Auth.claims()?.username || ""
      });
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  $("#hydrRetire").onclick=async()=>{
    if(!confirm(`Retire hydrant #${currentDetailHydrant.hydrant_number??"(unnumbered)"}? This removes it from active lists but keeps its history.`)) return;
    try{
      await Api.deleteHydrant(currentDetailHydrant.id);
      toast("Hydrant retired.");
      renderHydrants();
      refreshAllHydrants();
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  $("#hydrGoFlow").onclick=()=>goRecordFlow(currentDetailHydrant);
  $("#hydrGoMI").onclick=()=>goRecordMI(currentDetailHydrant);
  const hist=$("#hydrDetailHistory");
  hist.innerHTML="Loading…";
  $("#histYear").innerHTML=""; $("#histMonth").innerHTML=""; $("#histSearch").value="";
  function applyHistoryRecords(records){
    currentHydrantRecords=records;
    populateHistFilters();
    renderHistoryList();
    // the API's last_flow_date counts any inspection_type='flow' row, including legacy
    // "flowed and oiled" imports with no real readings — recompute from actual readings
    // so the overdue badge reflects when the hydrant was truly last flow-tested.
    const realFlowDates=records.filter(r=>r.inspection_type==="flow" && hasFlowReadings(r.flags_jsonb||{})).map(r=>r.inspection_date);
    currentDetailHydrant={...currentDetailHydrant, last_flow_date: realFlowDates.length?realFlowDates.sort().slice(-1)[0]:null};
    renderHydrantFieldsView(currentDetailHydrant);
  }
  try{
    const records=await Api.listInspections(h.id);
    records.sort((a,b)=>b.inspection_date.localeCompare(a.inspection_date));
    cacheRead("history_"+h.id, records);
    applyHistoryRecords(records);
  }catch(e){
    const cached=getCachedRead("history_"+h.id);
    if(cached){
      applyHistoryRecords(cached.data);
      toast(`Offline — showing cached history from ${cacheAgeLabel(cached.cachedAt)}.`,{bg:"#b45309"});
    } else {
      hist.innerHTML=`<div style="color:#b91c1c">${e.message}</div>`;
    }
  }
}
$("#hydrBack")?.addEventListener("click",hideHydrantDetail);
$("#histYear")?.addEventListener("change",()=>{ populateMonthOptions($("#histYear").value); renderHistoryList() });
$("#histMonth")?.addEventListener("change",renderHistoryList);
$("#histSearch")?.addEventListener("input",renderHistoryList);
$("#histClear")?.addEventListener("click",()=>{ $("#histYear").value=""; populateMonthOptions(""); $("#histSearch").value=""; renderHistoryList() });

// ===== Hoses =====
const HOSE_CATEGORY_LABELS = {
  "1.5": "1½\"",
  "1.75": "1¾\"",
  "2.5": "2½\"",
  "3": "3\""
};
const HOSE_DIAMETER_BY_CATEGORY = {"1.5":1.5,"1.75":1.75,"2.5":2.5,"3":3};
function hoseCategoryLabel(c){ return HOSE_CATEGORY_LABELS[c] || c }
function hoseSizeColorLabel(h){ return hoseCategoryLabel(h.category) + (h.color?` (${h.color})`:"") }

function populateHoseCategorySelect(){
  const sel=$("#hoseCategory"); if(!sel) return;
  sel.innerHTML = `<option value="">All categories</option>` +
    Object.keys(HOSE_CATEGORY_LABELS).map(c=>`<option value="${c}">${hoseCategoryLabel(c)}</option>`).join("");
}
populateHoseCategorySelect();

let hoseSort={key:"hose_number", dir:"asc"};
function hoseSortValue(h,key){
  switch(key){
    case "hose_number": return h.hose_number??"";
    case "category": return hoseCategoryLabel(h.category)||"";
    case "color": return h.color||"";
    case "in_service": return h.in_service?"0":"1"; // in-service first when ascending
    case "last_test_date": return h.last_test_date||"";
    default: return "";
  }
}
function applyHoseSort(list){
  const {key,dir}=hoseSort; const mul=dir==="asc"?1:-1;
  return [...list].sort((a,b)=>{
    const av=hoseSortValue(a,key), bv=hoseSortValue(b,key);
    const ablank=av===""||av==null, bblank=bv===""||bv==null;
    if(ablank&&!bblank) return 1;
    if(!ablank&&bblank) return -1;
    if(ablank&&bblank) return 0;
    if(key==="hose_number") return mul*naturalHydrantSort(av,bv);
    return mul*String(av).localeCompare(String(bv),undefined,{numeric:true});
  });
}
let currentHoseList=[];
async function renderHoses(){
  hideHoseDetail();
  const q=($("#hoseSearch")?.value||"").trim();
  const category=$("#hoseCategory")?.value||"";
  const inServiceFilter=$("#hoseInService")?.value||"";
  try{
    currentHoseList = await Api.listHoses(q, category||undefined);
  }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  if(inServiceFilter){
    const want = inServiceFilter==="true";
    currentHoseList = currentHoseList.filter(h=>h.in_service===want);
  }
  currentHoseList = applyHoseSort(currentHoseList);
  const cols = [
    {label:"Hose #", sortKey:"hose_number", width:"90px"},
    {label:"Size", sortKey:"category", width:"90px"},
    {label:"Color", sortKey:"color", width:"110px"},
    {label:"In Service", sortKey:"in_service", width:"120px"},
    {label:"Last Test", sortKey:"last_test_date", width:"130px"},
  ];
  const head=$("#hoseHead");
  head.style.gridTemplateColumns = cols.map(c=>c.width).join(" ");
  head.innerHTML = "";
  cols.forEach(col=>{
    const d=document.createElement("div");
    const active=hoseSort.key===col.sortKey;
    if(active) d.classList.add("sorted");
    d.style.cursor="pointer";
    d.textContent=col.label+(active?(hoseSort.dir==="asc"?" ▲":" ▼"):"");
    d.addEventListener("click",()=>{
      if(hoseSort.key===col.sortKey){ hoseSort.dir=hoseSort.dir==="asc"?"desc":"asc" }
      else{ hoseSort={key:col.sortKey, dir:col.sortKey==="last_test_date"?"desc":"asc"} }
      renderHoses();
    });
    head.appendChild(d);
  });
  const rows=$("#hoseRows"); rows.innerHTML="";
  currentHoseList.forEach(h=>{
    const r=document.createElement("div"); r.className="row"; r.style.cursor="pointer";
    r.style.gridTemplateColumns = cols.map(c=>c.width).join(" ");
    r.innerHTML = `
      <div>${h.hose_number}</div>
      <div>${hoseCategoryLabel(h.category)}</div>
      <div>${h.color||"—"}</div>
      <div>${h.in_service?'<span style="color:#16a34a">In service</span>':'<span style="color:var(--muted)">Out of service</span>'}</div>
      <div>${h.last_test_date?h.last_test_date:'<span style="color:#b45309">Never tested</span>'}</div>`;
    r.addEventListener("click",()=>showHoseDetail(h));
    rows.appendChild(r);
  });
  if(!currentHoseList.length){ rows.innerHTML = `<div class="muted" style="padding:10px">No hoses match.</div>`; }
  setContextBar(`<button id="ctxAddHose" class="btn">+ Add Hose</button>`);
  $("#ctxAddHose").onclick=startNewHose;
}
$("#hoseSearch")?.addEventListener("input",renderHoses);
$("#hoseClear")?.addEventListener("click",()=>{$("#hoseSearch").value=""; $("#hoseCategory").value=""; $("#hoseInService").value=""; renderHoses()});
$("#hoseCategory")?.addEventListener("change",renderHoses);
$("#hoseInService")?.addEventListener("change",renderHoses);
syncHeadRowsScroll("#hoseHead", "#hoseRows");

// ===== Hose detail =====
let currentDetailHose=null;
let currentHoseTests=[];
function hideHoseDetail(){ $("#hoseListView").style.display=""; $("#hoseDetailView").hidden=true; currentDetailHose=null; }

function renderHoseFieldsView(h){
  $("#hoseDetailFields").innerHTML = `
    <h3 style="margin:0 0 10px">Hose #${h.hose_number} — ${hoseSizeColorLabel(h)}</h3>
    <div class="grid g3">
      <div><label>In Service</label><div>${h.in_service?"Yes":"No"}</div></div>
      <div><label>Color</label><div>${h.color||"—"}</div></div>
      <div><label>Manufacturer</label><div>${h.manufacturer||"—"}</div></div>
      <div><label>Length (ft)</label><div>${h.length_ft??"—"}</div></div>
      <div style="grid-column:span 2"><label>Apparatus / Location</label><div>${h.apparatus_location||"—"}</div></div>
      <div style="grid-column:span 3"><label>Notes</label><div>${h.notes||"—"}</div></div>
    </div>
    <div style="margin-top:10px;font-size:12px;color:var(--muted)">
      ${h.created_by?`Created by ${h.created_by}`:""}${h.created_by&&h.updated_by&&h.updated_by!==h.created_by?" · ":""}${h.updated_by&&h.updated_by!==h.created_by?`Last updated by ${h.updated_by}`:""}
    </div>`;
  $("#hoseDetailActions").hidden=false;
}

function renderHoseFieldsEdit(h){
  const isNew = !h.id;
  $("#hoseDetailActions").hidden=true;
  $("#hoseDetailFields").innerHTML = `
    <h3 style="margin:0 0 10px">${isNew?"New Hose":`Editing Hose #${h.hose_number}`}</h3>
    <div class="grid g3">
      <div><label>Hose #</label><input id="edHoseNumber" value="${h.hose_number??""}"></div>
      <div><label>Size</label><select id="edHoseCategory">${Object.keys(HOSE_CATEGORY_LABELS).map(c=>`<option value="${c}" ${c===h.category?"selected":""}>${hoseCategoryLabel(c)}</option>`).join("")}</select></div>
      <div><label>Color</label><input id="edHoseColor" list="hoseColorSuggestions" value="${h.color??""}" placeholder="Optional"></div>
      <datalist id="hoseColorSuggestions"><option value="yellow"><option value="orange"><option value="red"></datalist>
      <div><label>In Service</label><select id="edHoseInService"><option value="true" ${h.in_service?"selected":""}>Yes</option><option value="false" ${!h.in_service?"selected":""}>No</option></select></div>
      <div><label>Manufacturer</label><input id="edHoseManufacturer" value="${h.manufacturer??""}"></div>
      <div><label>Length (ft)</label><input id="edHoseLength" type="number" value="${h.length_ft??""}"></div>
      <div><label>Apparatus / Location</label><input id="edHoseApparatus" value="${h.apparatus_location??""}"></div>
      <div style="grid-column:span 3"><label>Notes</label><input id="edHoseNotes" value="${h.notes??""}"></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="edHoseSave" class="btn">${isNew?"Create Hose":"Save"}</button>
      <button id="edHoseCancel" class="btn secondary">Cancel</button>
    </div>`;
  $("#edHoseSave").onclick=async()=>{
    const category=$("#edHoseCategory").value;
    const body={
      hose_number:$("#edHoseNumber").value.trim(),
      category,
      diameter_inches:HOSE_DIAMETER_BY_CATEGORY[category],
      color:$("#edHoseColor").value.trim()||null,
      manufacturer:$("#edHoseManufacturer").value.trim()||null,
      length_ft:$("#edHoseLength").value?parseInt($("#edHoseLength").value,10):null,
      apparatus_location:$("#edHoseApparatus").value.trim()||null,
      in_service:$("#edHoseInService").value==="true",
      notes:$("#edHoseNotes").value.trim()||null
    };
    if(!body.hose_number){ toast("Hose # is required.",{bg:"#b91c1c"}); return }
    try{
      const saved = isNew ? await Api.createHose(body) : await Api.updateHose(h.id, body);
      toast(isNew?"Hose created.":"Hose updated.");
      renderHoses();
      showHoseDetail(saved);
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  $("#edHoseCancel").onclick=()=>{ if(isNew){ hideHoseDetail() } else { renderHoseFieldsView(currentDetailHose) } };
}

function startNewHose(){
  currentDetailHose=null; currentHoseTests=[];
  $("#hoseListView").style.display="none"; $("#hoseDetailView").hidden=false;
  $("#hoseDetailActions").hidden=true;
  $("#hoseDetailHistory").innerHTML="";
  renderHoseFieldsEdit({category:"1.5", in_service:true});
}

function buildHoseTestRow(t){
  const row=document.createElement("div"); row.className="histrow";
  const resultLabel = t.result==="tested" ? (t.pressure_psi?`${t.pressure_psi} PSI`:"Tested") :
    t.result==="factory_new" ? "Factory test / New" : "Removed from service";
  const color = t.result==="removed" ? "#b91c1c" : t.result==="factory_new" ? "#1d4ed8" : "#16a34a";
  row.innerHTML=`
    <div class="histrow-main">
      <strong>${t.test_date}</strong>
      <span style="color:${color};margin-left:8px">${resultLabel}</span>
    </div>
    ${t.notes?`<div class="histrow-extra">${t.notes}</div>`:""}`;
  return row;
}

function renderHoseHistory(){
  const hist=$("#hoseDetailHistory"); if(!hist) return;
  if(!currentHoseTests.length){ hist.innerHTML=`<div class="muted">No tests recorded yet.</div>`; return }
  const list=document.createElement("div"); list.className="histlist";
  currentHoseTests.forEach(t=>list.appendChild(buildHoseTestRow(t)));
  hist.innerHTML=""; hist.appendChild(list);
}

function showHoseTestForm(){
  const existing=$("#newHoseTestForm"); if(existing) existing.remove();
  const wrap=document.createElement("div"); wrap.className="card"; wrap.id="newHoseTestForm"; wrap.style.marginBottom="10px";
  wrap.innerHTML=`
    <div class="grid g3">
      <div><label>Test Date</label><input id="newHoseTestDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div><label>Result</label><select id="newHoseTestResult">
        <option value="tested">Tested</option>
        <option value="factory_new">Factory test / New</option>
        <option value="removed">Removed from service</option>
      </select></div>
      <div><label>Pressure (PSI)</label><input id="newHoseTestPsi" type="number"></div>
      <div style="grid-column:span 3"><label>Notes</label><input id="newHoseTestNotes" placeholder="Optional"></div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="newHoseTestSave" class="btn">Save Test</button>
      <button id="newHoseTestCancel" class="btn secondary">Cancel</button>
    </div>`;
  const hist=$("#hoseDetailHistory");
  hist.parentNode.insertBefore(wrap, hist);
  wrap.querySelector("#newHoseTestSave").onclick=async()=>{
    const result=wrap.querySelector("#newHoseTestResult").value;
    const psi=wrap.querySelector("#newHoseTestPsi").value;
    const testDate=wrap.querySelector("#newHoseTestDate").value;
    if(!testDate){ toast("Test date is required.",{bg:"#b91c1c"}); return }
    try{
      await Api.createHoseTest({
        hose_id: currentDetailHose.id,
        test_date: testDate,
        result,
        pressure_psi: result==="tested" && psi ? parseFloat(psi) : null,
        notes: wrap.querySelector("#newHoseTestNotes").value.trim()||null
      });
      toast("Test recorded.");
      wrap.remove();
      await loadHoseTests(currentDetailHose.id);
      renderHoses();
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  wrap.querySelector("#newHoseTestCancel").onclick=()=>wrap.remove();
}

async function loadHoseTests(hoseId){
  const hist=$("#hoseDetailHistory");
  hist.innerHTML="Loading…";
  try{
    currentHoseTests = await Api.listHoseTests(hoseId);
    renderHoseHistory();
  }catch(e){ hist.innerHTML=`<div class="muted">Couldn't load test history.</div>`; }
}

async function showHoseDetail(h){
  currentDetailHose=h;
  $("#hoseListView").style.display="none"; $("#hoseDetailView").hidden=false;
  renderHoseFieldsView(h);
  $("#hoseEdit").onclick=()=>renderHoseFieldsEdit(currentDetailHose);
  $("#hoseRetire").onclick=async()=>{
    if(!confirm(`Retire hose #${currentDetailHose.hose_number}? This removes it from active lists but keeps its history.`)) return;
    try{
      await Api.deleteHose(currentDetailHose.id);
      toast("Hose retired.");
      renderHoses();
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  };
  $("#hoseGoTest").onclick=showHoseTestForm;
  await loadHoseTests(h.id);
}
$("#hoseBack")?.addEventListener("click",hideHoseDetail);

// ===== Reports =====
function populateReportFilters(){
  const dSel=$("#rptDistrict"); if(dSel) dSel.innerHTML=`<option value="">All districts</option>`+STATE.districts.map(d=>`<option value="${d.id}">${d.name}</option>`).join("");
  const sSel=$("#rptStatus"); if(sSel) sSel.innerHTML=`<option value="">Any status</option>`+STATE.statuses.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
  const hcSel=$("#rptHoseCategory"); if(hcSel) hcSel.innerHTML=`<option value="">Any</option>`+Object.entries(HOSE_CATEGORY_LABELS).map(([k,label])=>`<option value="${k}">${label}</option>`).join("");
}
const REPORT_TITLES={
  "overdue-flow":"Overdue Flow Tests", "no-activity":"No Activity This Year",
  "status-breakdown":"Status Breakdown by District", "flagged-review":"Flagged for Review",
  "flow-log":"Flow Test Log", "mi-log":"M&I Log", "pressure-trends":"Pressure Trends",
  "location":"Hydrants by Road / Area",
  "adhoc":"Special Report Criteria Results",
  "hose-overdue":"Overdue Hose Tests", "hose-test-log":"Hose Test Log", "hose-out-of-service":"Out of Service Hoses",
  "hose-query":"Special Hose Criteria Results"
};
const REPORT_DESCRIPTIONS={
  "overdue-flow":`Hydrants with no flow test on record with real readings in the last ${FLOW_TEST_OVERDUE_YEARS}+ years.`,
  "no-activity":"Hydrants with no flow test or M&I activity recorded so far this year.",
  "status-breakdown":"Count of hydrants by current status, grouped by district.",
  "flagged-review":"Records flagged during data import as needing manual review (orphaned hydrant numbers, estimated dates, etc.).",
  "flow-log":"All flow test records on file.",
  "mi-log":"All maintenance & inspection records on file.",
  "pressure-trends":"Hydrants with 2+ flow tests with real readings, comparing earliest vs. most recent to show gain or loss over time.",
  "hose-overdue":`In-service hoses with no test on record in the last ${HOSE_TEST_OVERDUE_MONTHS_JS}+ months.`,
  "hose-test-log":"All hose test records on file.",
  "hose-out-of-service":"Hoses currently marked out of service."
};
let currentReportTitle="", currentReportKind="";
function customReportName(){ return $("#rptCustomName")?.value?.trim()||"" }
function buildReportDescription(kind){
  if(kind==="adhoc"){
    const parts=[];
    const type=$("#rptType")?.value; if(type) parts.push(`Type: ${type==="flow"?"Flow Test":"M&I"}`);
    const status=$("#rptStatus")?.value; if(status) parts.push(`Status: ${STATE.statuses.find(s=>s.id===status)?.name||status}`);
    const from=$("#rptFrom")?.value, to=$("#rptTo")?.value;
    if(from||to) parts.push(`Date range: ${from||"…"} to ${to||"…"}`);
    const keyword=$("#rptKeyword")?.value?.trim(); if(keyword) parts.push(`Keyword: "${keyword}"`);
    return parts.length ? parts.join(" · ") : "No additional filters applied.";
  }
  if(kind==="location"){
    const q=$("#rptLocationSearch")?.value?.trim();
    return q ? `Hydrants with street/location matching "${q}"` : "All hydrants in scope.";
  }
  if(kind==="hose-query"){
    const parts=[];
    const category=$("#rptHoseCategory")?.value; if(category) parts.push(`Size: ${hoseCategoryLabel(category)}`);
    const color=$("#rptHoseColor")?.value?.trim(); if(color) parts.push(`Color: "${color}"`);
    const service=$("#rptHoseService")?.value; if(service) parts.push(`Service: ${service==="true"?"In service":"Out of service"}`);
    const apparatus=$("#rptHoseApparatus")?.value?.trim(); if(apparatus) parts.push(`Apparatus/Location: "${apparatus}"`);
    const from=$("#rptHoseFrom")?.value, to=$("#rptHoseTo")?.value;
    if(from||to) parts.push(`Last test: ${from||"…"} to ${to||"…"}`);
    const groupBy=$("#rptHoseGroupBy")?.value;
    if(groupBy && groupBy!=="none") parts.push(`Grouped by: ${groupBy==="category"?"Size":"Apparatus / Location"}`);
    return parts.length ? parts.join(" · ") : "No additional filters applied.";
  }
  return REPORT_DESCRIPTIONS[kind]||"";
}

const PREDEFINED_REPORTS=[
  {kind:"overdue-flow", label:"Overdue Flow Tests", module:"hydrant"},
  {kind:"no-activity", label:"No Activity This Year", module:"hydrant"},
  {kind:"status-breakdown", label:"Status Breakdown by District", module:"hydrant"},
  {kind:"flagged-review", label:"Flagged for Review", module:"hydrant"},
  {kind:"flow-log", label:"Flow Test Log", module:"hydrant"},
  {kind:"mi-log", label:"M&I Log", module:"hydrant"},
  {kind:"pressure-trends", label:"Pressure Trends", module:"hydrant"},
  {kind:"location", label:"Hydrants by Road / Area", module:"hydrant"},
  {kind:"adhoc", label:"Special Report Criteria", module:"hydrant"},
  {kind:"hose-overdue", label:"Overdue Hose Tests", module:"hose"},
  {kind:"hose-test-log", label:"Hose Test Log", module:"hose"},
  {kind:"hose-out-of-service", label:"Out of Service Hoses", module:"hose"},
  {kind:"hose-query", label:"Special Hose Criteria", module:"hose"}
];
const REPORT_MODULES=[{id:"hydrant", label:"Hydrants"}, {id:"hose", label:"Hoses"}];
function reportKindModule(kind){ return PREDEFINED_REPORTS.find(r=>r.kind===kind)?.module || "hydrant" }
function buildReportSelectOptions(){
  return REPORT_MODULES.map(m=>{
    const opts=PREDEFINED_REPORTS.filter(r=>r.module===m.id).map(r=>`<option value="${r.kind}">${r.label}</option>`).join("");
    return opts ? `<optgroup label="${m.label}">${opts}</optgroup>` : "";
  }).join("");
}
const REPORT_CRITERIA_GROUP={location:"location", adhoc:"adhoc", "hose-query":"hose"};
function updateReportCriteriaVisibility(kind){
  const group=REPORT_CRITERIA_GROUP[kind]||"";
  const details=$("#rpt-criteria");
  const locWrap=$("#rptCriteriaLocation"), adhocWrap=$("#rptCriteriaAdhoc"), hoseWrap=$("#rptCriteriaHose");
  if(locWrap) locWrap.style.display = group==="location" ? "" : "none";
  if(adhocWrap) adhocWrap.style.display = group==="adhoc" ? "" : "none";
  if(hoseWrap) hoseWrap.style.display = group==="hose" ? "" : "none";
  if(details){ if(group){ details.style.display=""; details.open=true } else { details.style.display="none" } }
  const districtWrap=$("#rptDistrictWrap");
  if(districtWrap) districtWrap.style.display = reportKindModule(kind)==="hose" ? "none" : "";
}
function closeReportMenu(){ $("#ctxReportMoreMenu")?.classList.remove("open") }

function extractStreetName(address){
  if(!address) return null;
  let s=address.split(",")[0].trim();
  s=s.replace(/^\d+\s+/,"");
  if(!s || /could not find|no coordinates/i.test(s)) return null;
  return s;
}
async function populateLocationDatalist(){
  const dl=$("#rptLocationList"); if(!dl) return;
  const districtId=$("#rptDistrict")?.value||"";
  try{
    const hydrants=await Api.listHydrants();
    const relevant=districtId?hydrants.filter(h=>h.district_id===districtId):hydrants;
    const streets=[...new Set(relevant.map(h=>extractStreetName(h.street_address??h.label)).filter(Boolean))].sort();
    dl.innerHTML=streets.map(s=>`<option value="${s}">`).join("");
  }catch{}
}

function resetReportCriteria(){
  $("#rptDistrict").value=""; $("#rptLocationSearch").value=""; $("#rptCustomName").value="";
  $("#rptType").value=""; $("#rptStatus").value=""; $("#rptFrom").value=""; $("#rptTo").value=""; $("#rptKeyword").value="";
  $("#rptHoseCategory").value=""; $("#rptHoseColor").value=""; $("#rptHoseService").value="";
  $("#rptHoseApparatus").value=""; $("#rptHoseFrom").value=""; $("#rptHoseTo").value=""; $("#rptHoseGroupBy").value="none";
  const sel=$("#ctxReportSelect"); if(sel) sel.value="";
  currentReportKind=""; currentReportTitle=""; rptColumns=[]; rptRows=[]; rptRowsBase=[]; rptSort={key:null, dir:"asc"};
  $("#rptSummary").textContent=""; $("#rptHead").innerHTML=""; $("#rptRows").innerHTML="";
  updateReportCriteriaVisibility("");
  const printBtn=$("#ctxPrintReport"); if(printBtn) printBtn.disabled=true;
  const exportBtn=$("#ctxExportReport"); if(exportBtn) exportBtn.disabled=true;
  closeReportMenu();
  populateLocationDatalist();
}

function renderReportsTab(){
  populateReportFilters();
  populateLocationDatalist();
  populateBlankFormFields();
  setContextBar(`
    <select id="ctxReportSelect"><option value="">Predefined Reports…</option>${buildReportSelectOptions()}</select>
    <button id="ctxResetReport" class="btn ghost">Reset</button>
    <div class="menuwrap">
      <button id="ctxReportMore" class="btn secondary" type="button" title="More actions">⋯</button>
      <div id="ctxReportMoreMenu" class="menu-popover">
        <button id="ctxPrintReport" class="menu-item" ${rptRows.length?"":"disabled"}>🖨️ Print This Report</button>
        <button id="ctxExportReport" class="menu-item" ${rptRows.length?"":"disabled"}>⬇️ Export CSV</button>
        <button id="ctxBlankForm" class="menu-item">📄 Blank Form Builder…</button>
      </div>
    </div>
  `);
  $("#ctxReportSelect").value = PREDEFINED_REPORTS.some(r=>r.kind===currentReportKind) ? currentReportKind : "";
  updateReportCriteriaVisibility(currentReportKind);
  $("#ctxReportSelect").onchange=e=>{
    const kind=e.target.value;
    updateReportCriteriaVisibility(kind);
    if(!kind) return;
    if(REPORT_CRITERIA_GROUP[kind]){
      currentReportKind=kind;
      currentReportTitle = kind==="adhoc" ? (customReportName()||REPORT_TITLES.adhoc) : REPORT_TITLES[kind];
    }else{
      runReport(kind);
    }
  };
  $("#ctxPrintReport").onclick=()=>{ printCurrentReport(); closeReportMenu(); };
  $("#ctxExportReport").onclick=()=>{ exportReportCSV(); closeReportMenu(); };
  $("#ctxResetReport").onclick=resetReportCriteria;
  $("#ctxBlankForm").onclick=()=>{ $("#bfModal").showModal(); closeReportMenu(); };
  $("#ctxReportMore").onclick=e=>{ e.stopPropagation(); $("#ctxReportMoreMenu").classList.toggle("open") };
}
async function printCurrentReport(){
  if(!rptRows.length) return;
  const districtId=$("#rptDistrict")?.value||"";
  try{
    await Print.render("report_table", {
      heading: currentReportTitle || "Report",
      district_name: districtId ? districtName(districtId) : "",
      description: buildReportDescription(currentReportKind),
      subtitle: `${rptRows.length} record${rptRows.length===1?"":"s"}`,
      columns: rptColumns.map(c=>c.label),
      rows: rptRows.map(r=>rptColumns.map(c=>String(r[c.key]??"—")))
    });
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
}

function trueLastFlowMap(inspections){
  const map=new Map();
  inspections.forEach(r=>{
    if(r.inspection_type!=="flow" || !hasFlowReadings(r.flags_jsonb||{})) return;
    const cur=map.get(r.hydrant_id);
    if(!cur || r.inspection_date>cur) map.set(r.hydrant_id, r.inspection_date);
  });
  return map;
}

function runOverdueFlowReport(hydrants,inspections){
  const lastFlow=trueLastFlowMap(inspections); const now=new Date();
  const rows=hydrants.map(h=>{
    const last=lastFlow.get(h.id)||null;
    const years=last?Math.floor((now-new Date(last+"T00:00:00"))/(365.25*24*3600*1000)):Infinity;
    return {h,last,years};
  }).filter(x=>x.years>=FLOW_TEST_OVERDUE_YEARS)
    .sort((a,b)=>b.years-a.years)
    .map(x=>({hydrant_number:x.h.hydrant_number??"—", district:districtName(x.h.district_id),
      location:x.h.street_address??x.h.label??"—", last_flow:x.last||"Never tested",
      years_since:x.years===Infinity?"—":x.years}));
  return {columns:[{key:"hydrant_number",label:"#"},{key:"district",label:"District"},{key:"location",label:"Location"},
    {key:"last_flow",label:"Last Flow Test"},{key:"years_since",label:"Years Since"}], rows};
}

function runNoActivityReport(hydrants){
  const thisYear=new Date().getFullYear();
  const rows=hydrants.filter(h=>!h.last_activity_date || new Date(h.last_activity_date+"T00:00:00").getFullYear()!==thisYear)
    .sort((a,b)=>(a.last_activity_date||"").localeCompare(b.last_activity_date||""))
    .map(h=>({hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id),
      location:h.street_address??h.label??"—", last_activity:h.last_activity_date||"Never"}));
  return {columns:[{key:"hydrant_number",label:"#"},{key:"district",label:"District"},{key:"location",label:"Location"},
    {key:"last_activity",label:"Last Activity"}], rows};
}

function runStatusBreakdown(hydrants){
  const map=new Map();
  hydrants.forEach(h=>{
    const d=districtName(h.district_id);
    const s=STATE.statuses.find(x=>x.id===h.status)?.name || (h.status||"Not set");
    const key=d+"||"+s;
    map.set(key,(map.get(key)||0)+1);
  });
  const rows=[...map.entries()].map(([key,count])=>{ const [district,status]=key.split("||"); return {district,status,count} })
    .sort((a,b)=>a.district.localeCompare(b.district)||a.status.localeCompare(b.status));
  return {columns:[{key:"district",label:"District"},{key:"status",label:"Status"},{key:"count",label:"Count"}], rows};
}

function runFlaggedReview(hydrants,inspections){
  const hMap=new Map(hydrants.map(h=>[h.id,h]));
  const rows=inspections.filter(r=>r.flags_jsonb?.needs_review).map(r=>{
    const h=hMap.get(r.hydrant_id)||{};
    return {date:r.inspection_date, hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id),
      location:h.street_address??h.label??"—", reason:r.flags_jsonb.needs_review.replace(/_/g," ")};
  }).sort((a,b)=>b.date.localeCompare(a.date));
  return {columns:[{key:"date",label:"Date"},{key:"hydrant_number",label:"#"},{key:"district",label:"District"},
    {key:"location",label:"Location"},{key:"reason",label:"Reason"}], rows};
}

function runHoseOverdueReport(hoses){
  const now=new Date();
  const rows=hoses.filter(isHoseOverdue)
    .map(h=>{
      const months=h.last_test_date?Math.floor((now-new Date(h.last_test_date+"T00:00:00"))/(30.44*24*3600*1000)):Infinity;
      return {h,months};
    })
    .sort((a,b)=>b.months-a.months)
    .map(x=>({hose_number:x.h.hose_number, size:hoseCategoryLabel(x.h.category), color:x.h.color||"—",
      apparatus_location:x.h.apparatus_location||"—", last_test:x.h.last_test_date||"Never tested",
      months_since:x.months===Infinity?"—":x.months}));
  return {columns:[{key:"hose_number",label:"Hose #"},{key:"size",label:"Size"},{key:"color",label:"Color"},
    {key:"apparatus_location",label:"Apparatus / Location"},{key:"last_test",label:"Last Test"},
    {key:"months_since",label:"Months Since"}], rows};
}

function runHoseTestLog(hoses,hoseTests){
  const hMap=new Map(hoses.map(h=>[h.id,h]));
  const rows=hoseTests.map(t=>{
    const h=hMap.get(t.hose_id)||{};
    const resultLabel = t.result==="tested" ? (t.pressure_psi?`${t.pressure_psi} PSI`:"Tested") :
      t.result==="factory_new" ? "Factory test / New" : "Removed from service";
    return {date:t.test_date, hose_number:h.hose_number??"—", size:hoseCategoryLabel(h.category), color:h.color||"—",
      result:resultLabel, notes:t.notes||"—"};
  }).sort((a,b)=>b.date.localeCompare(a.date));
  return {columns:[{key:"date",label:"Date"},{key:"hose_number",label:"Hose #"},{key:"size",label:"Size"},
    {key:"color",label:"Color"},{key:"result",label:"Result"},{key:"notes",label:"Notes"}], rows};
}

function runHoseOutOfServiceReport(hoses){
  const rows=hoses.filter(h=>!h.in_service)
    .map(h=>({hose_number:h.hose_number, size:hoseCategoryLabel(h.category), color:h.color||"—",
      apparatus_location:h.apparatus_location||"—", last_test:h.last_test_date||"Never tested", notes:h.notes||"—"}));
  return {columns:[{key:"hose_number",label:"Hose #"},{key:"size",label:"Size"},{key:"color",label:"Color"},
    {key:"apparatus_location",label:"Apparatus / Location"},{key:"last_test",label:"Last Test"},
    {key:"notes",label:"Notes"}], rows};
}

function runHoseQueryReport(hoses, criteria){
  const {category, color, service, apparatus, from, to, groupBy} = criteria;
  const filtered=hoses.filter(h=>{
    if(category && h.category!==category) return false;
    if(color && !(h.color||"").toLowerCase().includes(color.toLowerCase())) return false;
    if(service && String(h.in_service)!==service) return false;
    if(apparatus && !(h.apparatus_location||"").toLowerCase().includes(apparatus.toLowerCase())) return false;
    if(from && (!h.last_test_date || h.last_test_date<from)) return false;
    if(to && (!h.last_test_date || h.last_test_date>to)) return false;
    return true;
  });
  if(groupBy==="category" || groupBy==="apparatus_location"){
    const groups=new Map();
    filtered.forEach(h=>{
      const key = groupBy==="category" ? h.category : (h.apparatus_location?.trim()||"Unassigned");
      if(!groups.has(key)) groups.set(key, {key, sections:0, footage:0, inServiceCount:0});
      const g=groups.get(key);
      g.sections+=1;
      g.footage+=h.length_ft||0;
      if(h.in_service) g.inServiceCount+=1;
    });
    const rows=[...groups.values()]
      .sort((a,b)=>String(a.key).localeCompare(String(b.key),undefined,{numeric:true}))
      .map(g=>({group: groupBy==="category" ? hoseCategoryLabel(g.key) : g.key, sections:g.sections,
        in_service:g.inServiceCount, out_of_service:g.sections-g.inServiceCount, total_footage:g.footage}));
    const groupLabel = groupBy==="category" ? "Size" : "Apparatus / Location";
    return {columns:[{key:"group",label:groupLabel},{key:"sections",label:"# Sections"},
      {key:"in_service",label:"In Service"},{key:"out_of_service",label:"Out of Service"},
      {key:"total_footage",label:"Total Footage (ft)"}], rows};
  }
  const rows=filtered.map(h=>({hose_number:h.hose_number, size:hoseCategoryLabel(h.category), color:h.color||"—",
    apparatus_location:h.apparatus_location||"—", in_service:h.in_service?"Yes":"No",
    last_test:h.last_test_date||"Never tested"}));
  return {columns:[{key:"hose_number",label:"Hose #"},{key:"size",label:"Size"},{key:"color",label:"Color"},
    {key:"apparatus_location",label:"Apparatus / Location"},{key:"in_service",label:"In Service"},
    {key:"last_test",label:"Last Test"}], rows};
}

function inspectionSearchText(r){
  const flags=r.flags_jsonb||{};
  const checklist=[...(flags.checks||[]),...(flags.tasks||[])];
  const checklistText=checklist.map(i=>`${i.item||""} ${i.note||""}`).join(" ");
  return `${r.notes||""} ${flags.project||""} ${checklistText}`.toLowerCase();
}
function runAdhocQuery(hydrants,inspections){
  const hMap=new Map(hydrants.map(h=>[h.id,h]));
  const type=$("#rptType")?.value||""; const status=$("#rptStatus")?.value||"";
  const from=$("#rptFrom")?.value||""; const to=$("#rptTo")?.value||"";
  const keyword=($("#rptKeyword")?.value||"").trim().toLowerCase();
  const rows=inspections.filter(r=>{
    const h=hMap.get(r.hydrant_id); if(!h) return false;
    if(type && r.inspection_type!==type) return false;
    if(status && r.status!==status) return false;
    if(from && r.inspection_date<from) return false;
    if(to && r.inspection_date>to) return false;
    if(keyword && !inspectionSearchText(r).includes(keyword)) return false;
    return true;
  }).map(r=>{
    const h=hMap.get(r.hydrant_id);
    const flags=r.flags_jsonb||{};
    const issues=[...(flags.checks||[]),...(flags.tasks||[])].filter(i=>i.state==="issue");
    return {date:r.inspection_date, type:r.inspection_type==="flow"?"Flow Test":"M&I", hydrant_number:h.hydrant_number??"—",
      district:districtName(h.district_id), location:h.street_address??h.label??"—",
      status:r.status?(STATE.statuses.find(s=>s.id===r.status)?.name||r.status):"—",
      issues:issues.length?issues.map(i=>i.item).join(", "):"—", notes:r.notes||""};
  }).sort((a,b)=>b.date.localeCompare(a.date));
  return {columns:[{key:"date",label:"Date"},{key:"type",label:"Type"},{key:"hydrant_number",label:"#"},
    {key:"district",label:"District"},{key:"location",label:"Location"},{key:"status",label:"Status"},
    {key:"issues",label:"Checklist Issues"},{key:"notes",label:"Notes"}], rows};
}

function runFlowTestLog(hydrants,inspections){
  const hMap=new Map(hydrants.map(h=>[h.id,h]));
  const rows=inspections.filter(r=>r.inspection_type==="flow").map(r=>{
    const h=hMap.get(r.hydrant_id); if(!h) return null;
    const f=r.flags_jsonb||{};
    return {date:r.inspection_date, hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id),
      location:h.street_address??h.label??"—", static:f.static??"—", residual:f.residual??"—", pitot:f.pitot??"—",
      discharge:f.total_discharge??f.discharge??"—", aff:f.aff??"—", notes:r.notes||""};
  }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  return {columns:[{key:"date",label:"Date"},{key:"hydrant_number",label:"#"},{key:"district",label:"District"},
    {key:"location",label:"Location"},{key:"static",label:"Static"},{key:"residual",label:"Residual"},
    {key:"pitot",label:"Pitot"},{key:"discharge",label:"Discharge"},{key:"aff",label:"AFF"},{key:"notes",label:"Notes"}], rows};
}

function runMILog(hydrants,inspections){
  const hMap=new Map(hydrants.map(h=>[h.id,h]));
  const rows=inspections.filter(r=>r.inspection_type==="mi").map(r=>{
    const h=hMap.get(r.hydrant_id); if(!h) return null;
    const flags=r.flags_jsonb||{};
    const checklist=[...(flags.checks||[]),...(flags.tasks||[])];
    const issues=checklist.filter(i=>i.state==="issue");
    return {date:r.inspection_date, hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id),
      location:h.street_address??h.label??"—", status:r.status?(STATE.statuses.find(s=>s.id===r.status)?.name||r.status):"—",
      issues: issues.length?issues.map(i=>i.item).join(", "):(checklist.length?"None":"—"), notes:r.notes||""};
  }).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  return {columns:[{key:"date",label:"Date"},{key:"hydrant_number",label:"#"},{key:"district",label:"District"},
    {key:"location",label:"Location"},{key:"status",label:"Status"},{key:"issues",label:"Issues"},{key:"notes",label:"Notes"}], rows};
}

function runPressureTrends(hydrants,inspections){
  const byHydrant=new Map();
  inspections.forEach(r=>{
    if(r.inspection_type!=="flow" || !hasFlowReadings(r.flags_jsonb||{})) return;
    if(!byHydrant.has(r.hydrant_id)) byHydrant.set(r.hydrant_id,[]);
    byHydrant.get(r.hydrant_id).push(r);
  });
  const hMap=new Map(hydrants.map(h=>[h.id,h]));
  const parseNum=v=>{ const n=Number(v); return Number.isFinite(n)?n:null };
  const rows=[];
  byHydrant.forEach((records,hydrantId)=>{
    const h=hMap.get(hydrantId); if(!h || records.length<2) return;
    records.sort((a,b)=>a.inspection_date.localeCompare(b.inspection_date));
    const first=records[0], last=records[records.length-1];
    const ff=first.flags_jsonb||{}, lf=last.flags_jsonb||{};
    const fAff=parseNum(ff.aff), lAff=parseNum(lf.aff);
    const affChange=(fAff!==null&&lAff!==null)?lAff-fAff:null;
    rows.push({
      hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id), location:h.street_address??h.label??"—",
      first_date:first.inspection_date, first_static:ff.static??"—", first_aff:ff.aff??"—",
      last_date:last.inspection_date, last_static:lf.static??"—", last_aff:lf.aff??"—",
      aff_change: affChange===null?"—":(affChange>0?`+${affChange}`:String(affChange)),
      trend: affChange===null?"—":(affChange>0?"↑ Gain":affChange<0?"↓ Loss":"No change"),
      _sort: affChange===null?0:affChange
    });
  });
  rows.sort((a,b)=>a._sort-b._sort);
  rows.forEach(r=>delete r._sort);
  return {columns:[{key:"hydrant_number",label:"#"},{key:"district",label:"District"},{key:"location",label:"Location"},
    {key:"first_date",label:"First Test"},{key:"first_static",label:"First Static"},{key:"first_aff",label:"First AFF"},
    {key:"last_date",label:"Last Test"},{key:"last_static",label:"Last Static"},{key:"last_aff",label:"Last AFF"},
    {key:"aff_change",label:"AFF Change"},{key:"trend",label:"Trend"}], rows};
}

function runLocationReport(hydrants){
  const rows=hydrants.map(h=>({hydrant_number:h.hydrant_number??"—", district:districtName(h.district_id),
    location:h.street_address??h.label??"—", make:h.make||"—",
    status:(STATE.statuses.find(s=>s.id===h.status)?.name)||"—", last_activity:h.last_activity_date||"—"}));
  return {columns:[{key:"hydrant_number",label:"#"},{key:"district",label:"District"},{key:"location",label:"Location"},
    {key:"make",label:"Make"},{key:"status",label:"Status"},{key:"last_activity",label:"Last Activity"}], rows};
}

let rptColumns=[], rptRows=[], rptRowsBase=[], rptSort={key:null, dir:"asc"};
function sortReportRows(rows, sort){
  if(!sort.key) return rows;
  const mul=sort.dir==="asc"?1:-1;
  return [...rows].sort((a,b)=>{
    const av=a[sort.key], bv=b[sort.key];
    const ablank=av===""||av==null||av==="—", bblank=bv===""||bv==null||bv==="—";
    if(ablank&&!bblank) return 1;
    if(!ablank&&bblank) return -1;
    if(ablank&&bblank) return 0;
    return mul*String(av).localeCompare(String(bv),undefined,{numeric:true});
  });
}
function renderReport({columns,rows}, resetSort=true){
  rptColumns=columns; rptRowsBase=rows;
  if(resetSort) rptSort={key:null, dir:"asc"};
  rptRows=sortReportRows(rptRowsBase, rptSort);
  $("#rptSummary").textContent=`${rptRows.length} record${rptRows.length===1?"":"s"}`;
  const headRow=document.createElement("tr");
  columns.forEach(c=>{
    const th=document.createElement("th");
    const active=rptSort.key===c.key;
    th.style.cursor="pointer";
    th.textContent=c.label+(active?(rptSort.dir==="asc"?" ▲":" ▼"):"");
    th.addEventListener("click",()=>{
      if(rptSort.key===c.key){ rptSort={key:c.key, dir:rptSort.dir==="asc"?"desc":"asc"} }
      else{ rptSort={key:c.key, dir:"asc"} }
      renderReport({columns:rptColumns, rows:rptRowsBase}, false);
    });
    headRow.appendChild(th);
  });
  $("#rptHead").innerHTML=""; $("#rptHead").appendChild(headRow);
  $("#rptRows").innerHTML = rptRows.length
    ? rptRows.map(r=>"<tr>"+columns.map(c=>`<td>${r[c.key]??"—"}</td>`).join("")+"</tr>").join("")
    : `<tr><td colspan="${columns.length}" style="color:var(--muted)">No matching records.</td></tr>`;
  const printBtn=$("#ctxPrintReport"); if(printBtn) printBtn.disabled = rptRows.length===0;
  const exportBtn=$("#ctxExportReport"); if(exportBtn) exportBtn.disabled = rptRows.length===0;
}
async function runReport(kind){
  $("#rptSummary").textContent="Loading…";
  currentReportKind=kind;
  updateReportCriteriaVisibility(kind);
  const sel=$("#ctxReportSelect"); if(sel) sel.value = PREDEFINED_REPORTS.some(r=>r.kind===kind) ? kind : "";
  const districtId=$("#rptDistrict")?.value||"";
  try{
    if(kind==="location"){
      const q=$("#rptLocationSearch")?.value?.trim()||"";
      currentReportTitle = q ? `Hydrants matching "${q}"` : "All Hydrants";
      const hydrants=await Api.listHydrants(q, districtId||undefined);
      renderReport(runLocationReport(hydrants));
      return;
    }
    if(kind==="hose-overdue" || kind==="hose-test-log" || kind==="hose-out-of-service" || kind==="hose-query"){
      currentReportTitle = REPORT_TITLES[kind];
      const hoses=await Api.listHoses();
      if(kind==="hose-overdue"){ renderReport(runHoseOverdueReport(hoses)); return }
      if(kind==="hose-out-of-service"){ renderReport(runHoseOutOfServiceReport(hoses)); return }
      if(kind==="hose-query"){
        const criteria={
          category:$("#rptHoseCategory")?.value||"",
          color:($("#rptHoseColor")?.value||"").trim(),
          service:$("#rptHoseService")?.value||"",
          apparatus:($("#rptHoseApparatus")?.value||"").trim(),
          from:$("#rptHoseFrom")?.value||"",
          to:$("#rptHoseTo")?.value||"",
          groupBy:$("#rptHoseGroupBy")?.value||"none"
        };
        renderReport(runHoseQueryReport(hoses, criteria));
        return;
      }
      const hoseTests=await Api.listHoseTests();
      renderReport(runHoseTestLog(hoses,hoseTests));
      return;
    }
    currentReportTitle = kind==="adhoc" ? (customReportName()||REPORT_TITLES.adhoc) : (REPORT_TITLES[kind]||"Report");
    const [hydrantsAll,inspectionsAll]=await Promise.all([Api.listHydrants(), Api.listInspections()]);
    const hydrants=districtId?hydrantsAll.filter(h=>h.district_id===districtId):hydrantsAll;
    const hydrantIds=new Set(hydrants.map(h=>h.id));
    const inspections=districtId?inspectionsAll.filter(r=>hydrantIds.has(r.hydrant_id)):inspectionsAll;
    const runner={
      "overdue-flow":()=>runOverdueFlowReport(hydrants,inspections),
      "no-activity":()=>runNoActivityReport(hydrants),
      "status-breakdown":()=>runStatusBreakdown(hydrants),
      "flagged-review":()=>runFlaggedReview(hydrants,inspections),
      "flow-log":()=>runFlowTestLog(hydrants,inspections),
      "mi-log":()=>runMILog(hydrants,inspections),
      "pressure-trends":()=>runPressureTrends(hydrants,inspections),
      "adhoc":()=>runAdhocQuery(hydrants,inspections)
    }[kind];
    renderReport(runner());
  }catch(e){ $("#rptSummary").textContent=""; toast(e.message,{bg:"#b91c1c"}) }
}
function exportReportCSV(){
  if(!rptRows.length) return;
  const esc=v=>{ const s=String(v??""); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s };
  const lines=[rptColumns.map(c=>esc(c.label)).join(","), ...rptRows.map(r=>rptColumns.map(c=>esc(r[c.key])).join(","))];
  const blob=new Blob([lines.join("\n")],{type:"text/csv"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="redcap-report.csv"; a.click(); URL.revokeObjectURL(url);
}
$("#rptRun")?.addEventListener("click",()=>runReport("adhoc"));
$("#rptLocationRun")?.addEventListener("click",()=>runReport("location"));
$("#rptHoseRun")?.addEventListener("click",()=>runReport("hose-query"));
$("#rptDistrict")?.addEventListener("change",()=>{ populateLocationDatalist(); if(currentReportKind) runReport(currentReportKind) });
document.addEventListener("click",e=>{
  const menu=$("#ctxReportMoreMenu"), btn=$("#ctxReportMore");
  if(!menu || !btn) return;
  if(!menu.contains(e.target) && e.target!==btn) menu.classList.remove("open");
});
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeReportMenu() });
$("#bfClose")?.addEventListener("click",()=>$("#bfModal").close());

// ===== Print hydrant list (with optional detail records) =====
$("#hplDetailMode")?.addEventListener("change",()=>{
  const mode=$("#hplDetailMode").value;
  $("#hplRangeWrap").style.display=mode==="range"?"":"none";
  $("#hplYearWrap").style.display=mode==="year"?"":"none";
});
$("#hplClose")?.addEventListener("click",()=>$("#hydrPrintModal").close());
$("#hplGenerate")?.addEventListener("click", async()=>{
  if(!currentHydrantPrintList.length){ toast("No hydrants in the current list.",{bg:"#b91c1c"}); return }
  const mode=$("#hplDetailMode")?.value||"none";
  let byHydrant=new Map();
  if(mode!=="none"){
    try{
      let all=await Api.listInspections();
      if(mode==="range"){
        const from=$("#hplFrom")?.value, to=$("#hplTo")?.value;
        all=all.filter(r=>(!from||r.inspection_date>=from)&&(!to||r.inspection_date<=to));
      } else if(mode==="year"){
        const yr=$("#hplYear")?.value?.trim();
        if(yr) all=all.filter(r=>r.inspection_date.startsWith(yr));
      }
      all.forEach(r=>{ if(!byHydrant.has(r.hydrant_id)) byHydrant.set(r.hydrant_id,[]); byHydrant.get(r.hydrant_id).push(r) });
    }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  }
  const districtId=$("#hydrDistrict")?.value||"";
  const hydrantsData=currentHydrantPrintList.map(h=>{
    const meta=STATE.statuses.find(s=>s.id===h.status)||{name:h.status||""};
    const records=(byHydrant.get(h.id)||[]).slice().sort((a,b)=>b.inspection_date.localeCompare(a.inspection_date));
    return {
      hydrant_number:h.hydrant_number??"—", location:h.street_address??h.label??"—",
      district:districtName(h.district_id), status:meta.name,
      history:historyToPrintRows(records)
    };
  });
  const modeLabel={none:"", all:" · with full history", range:" · with history in date range", year:" · with history for that year"}[mode];
  try{
    await Print.render("hydrant_list", {
      heading:"Hydrant List",
      district_name: districtId?districtName(districtId):"",
      subtitle:`${hydrantsData.length} hydrant${hydrantsData.length===1?"":"s"}${modeLabel}`,
      hydrants:hydrantsData
    });
    $("#hydrPrintModal").close();
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
});

// ===== Blank Form Builder =====
const BLANK_FORM_FIELDS_HYDRANT=[
  {key:"hydrant_number", label:"Hydrant #"}, {key:"district", label:"District"}, {key:"location", label:"Location"},
  {key:"date", label:"Date"}, {key:"inspector", label:"Inspector"},
  {key:"static", label:"Static (psi)"}, {key:"residual", label:"Residual (psi)"}, {key:"pitot", label:"Pitot (psi)"},
  {key:"diameter", label:"Diameter (in)"}, {key:"coefficient", label:"Coefficient C"}, {key:"outlets_flowing", label:"# Outlets Flowing"},
  {key:"total_discharge", label:"Total Discharge (GPM)"}, {key:"aff", label:"Available Fire Flow (GPM)"},
  {key:"status", label:"Status"}, {key:"notes", label:"Notes"}
];
const BLANK_FORM_FIELDS_HOSE=[
  {key:"hose_number", label:"Hose #"}, {key:"size", label:"Size"}, {key:"color", label:"Color"},
  {key:"apparatus_location", label:"Apparatus / Location"}, {key:"date", label:"Date"}, {key:"tester", label:"Tester"},
  {key:"manufacturer", label:"Manufacturer"}, {key:"length_ft", label:"Length (ft)"},
  {key:"test_pressure", label:"Test Pressure (psi)"}, {key:"result", label:"Result"},
  {key:"in_service", label:"In Service"}, {key:"notes", label:"Notes"}
];
const BLANK_FORM_FIELDS_BY_TYPE={hydrant:BLANK_FORM_FIELDS_HYDRANT, hose:BLANK_FORM_FIELDS_HOSE};
let bfCustomColumns=[];
function populateBlankFormFields(){
  const wrap=$("#bfFields"); if(!wrap) return;
  const recordType=$("#bfRecordType")?.value||"hydrant";
  const fields=BLANK_FORM_FIELDS_BY_TYPE[recordType]||BLANK_FORM_FIELDS_HYDRANT;
  wrap.innerHTML=fields.map(f=>`<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:400"><input type="checkbox" value="${f.key}" checked style="width:auto">${f.label}</label>`).join("");
  renderBfCustomColumns();
}
function renderBfCustomColumns(){
  const wrap=$("#bfCustomColumns"); if(!wrap) return;
  wrap.innerHTML=bfCustomColumns.map((label,i)=>`<span style="display:inline-flex;align-items:center;gap:6px;background:var(--chip-bg,#eef2f7);border-radius:14px;padding:4px 10px;font-size:13px">${label}<button type="button" data-i="${i}" class="bfRemoveColumn" style="border:none;background:none;cursor:pointer;color:var(--muted);font-size:14px;line-height:1;padding:0">×</button></span>`).join("");
  wrap.querySelectorAll(".bfRemoveColumn").forEach(btn=>{
    btn.addEventListener("click",()=>{ bfCustomColumns.splice(parseInt(btn.dataset.i,10),1); renderBfCustomColumns(); });
  });
}
$("#bfRecordType")?.addEventListener("change",populateBlankFormFields);
$("#bfAddColumn")?.addEventListener("click",()=>{
  const input=$("#bfNewColumnLabel"); const label=input?.value?.trim();
  if(!label){ toast("Enter a column header first.",{bg:"#b91c1c"}); return }
  bfCustomColumns.push(label);
  input.value="";
  renderBfCustomColumns();
});
$("#bfNewColumnLabel")?.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#bfAddColumn").click(); } });
$("#bfLayout")?.addEventListener("change",()=>{ $("#bfRowsWrap").style.display = $("#bfLayout").value==="grid" ? "" : "none" });
$("#bfGenerate")?.addEventListener("click", async()=>{
  const name=$("#bfName")?.value?.trim()||"Blank Form";
  const desc=$("#bfDesc")?.value?.trim()||"";
  const layout=$("#bfLayout")?.value||"single";
  const recordType=$("#bfRecordType")?.value||"hydrant";
  const rowCount=Math.max(1, Math.min(60, parseInt($("#bfRows")?.value||"20",10)||20));
  const checked=[...$$("#bfFields input:checked")].map(c=>c.value);
  if(!checked.length && !bfCustomColumns.length){ toast("Pick at least one field or add a custom column.",{bg:"#b91c1c"}); return }
  const baseFields=BLANK_FORM_FIELDS_BY_TYPE[recordType]||BLANK_FORM_FIELDS_HYDRANT;
  const fields=[...baseFields.filter(f=>checked.includes(f.key)).map(f=>({label:f.label})),
                ...bfCustomColumns.map(label=>({label}))];
  try{
    await Print.render("custom_form", {heading:name, description:desc, layout, fields, rows:rowCount});
    $("#bfModal").close();
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
});

// ===== Drafts (offline resilience) =====
function saveDraft(key,data){ LS.set("redcap.draft."+key,{data,savedAt:Date.now()}) }
function loadDraft(key){ return LS.get("redcap.draft."+key,null) }
function clearDraft(key){ localStorage.removeItem("redcap.draft."+key) }

// ===== Offline read cache =====
// The write path (drafts, above) already queues and retries. This is the read
// half: hydrant list, a hydrant's history, and the dashboard all get a "last
// known good" fallback for a dead-zone lookup instead of just failing.
function cacheRead(key,data){ LS.set("redcap.cache."+key,{data,cachedAt:Date.now()}) }
function getCachedRead(key){ return LS.get("redcap.cache."+key,null) }
function cacheAgeLabel(cachedAt){
  const mins=Math.round((Date.now()-cachedAt)/60000);
  if(mins<1) return "moments ago";
  if(mins<60) return `${mins} min ago`;
  const hrs=Math.round(mins/60);
  if(hrs<24) return `${hrs} hr ago`;
  return `${Math.round(hrs/24)} day(s) ago`;
}
async function resumeDrafts(){
  for(const key of ["flow","mi"]){
    const draft=loadDraft(key);
    if(!draft) continue;
    try{
      await Api.createInspection(draft.data);
      clearDraft(key);
      toast(`Synced a previously unsaved ${key==="flow"?"Flow":"M&I"} record.`);
    }catch{ /* still can't reach the server - leave it queued, retry next load */ }
  }
}

// ===== Hydrant autocomplete + context (shared by Flow/M&I) =====
function attachHydrantAutocomplete(prefix){
  const input=$(`#${prefix}Hydrant`);
  const box=document.createElement("div"); box.className="ac-dropdown"; box.style.display="none";
  input.insertAdjacentElement("afterend", box);

  function renderMatches(){
    const q=input.value.trim();
    if(!q){ box.style.display="none"; box.innerHTML=""; return }
    const districtId=$(`#${prefix}District`).value;
    const matches=ALL_HYDRANTS.filter(h=>{
      if(!h.hydrant_number) return false;
      if(districtId && h.district_id!==districtId) return false;
      return h.hydrant_number.toLowerCase().startsWith(q.toLowerCase());
    }).slice(0,15);
    if(!matches.length){ box.style.display="none"; box.innerHTML=""; return }
    box.innerHTML=matches.map(h=>`<div class="ac-item" data-id="${h.id}"><b>#${h.hydrant_number}</b> — ${h.street_address??h.label??"—"}${districtId?"":` <span class="ac-district">(${districtName(h.district_id)})</span>`}</div>`).join("");
    box.style.display="block";
  }
  input.addEventListener("input", renderMatches);
  input.addEventListener("focus", renderMatches);
  input.addEventListener("blur", ()=>setTimeout(()=>{ box.style.display="none" }, 150));
  box.addEventListener("mousedown", e=>{
    const item=e.target.closest(".ac-item"); if(!item) return;
    e.preventDefault();
    const h=ALL_HYDRANTS.find(x=>x.id===item.dataset.id); if(!h) return;
    $(`#${prefix}District`).value=h.district_id;
    input.value=h.hydrant_number;
    onHydrantFieldChange(prefix);
    box.style.display="none";
  });
}
async function onHydrantFieldChange(prefix){
  const districtId=$(`#${prefix}District`).value;
  const num=$(`#${prefix}Hydrant`).value;
  const ctx=$(`#${prefix}Context`);
  const hydrant=findHydrant(districtId,num);
  if(!hydrant){ ctx.innerHTML=""; return }
  // Always keep Location in sync with whichever hydrant is currently selected. This used to
  // be guarded by a "was this autofilled before" flag so a manual edit wouldn't get stomped,
  // but that flag lives on the DOM node and doesn't survive things like the browser restoring
  // a previously-typed value into the field on page reload — once that happened the guard was
  // permanently (and silently) stuck off, so hydrant/district changes stopped updating it at all.
  $(`#${prefix}Project`).value=hydrant.street_address??hydrant.label??"";
  const type=prefix==="flow"?"flow":"mi";
  ctx.innerHTML="Loading last record…";
  try{
    const records=await Api.listInspections(hydrant.id,type);
    records.sort((a,b)=>b.inspection_date.localeCompare(a.inspection_date));
    if(!records.length){ ctx.innerHTML=`No prior ${type==="flow"?"flow test":"M&I"} on record for this hydrant.`; return }
    const r=records[0], f=r.flags_jsonb||{};
    const lastLine = type==="flow"
      ? `Last flow test ${r.inspection_date}: Static ${f.static??"—"} · Residual ${f.residual??"—"} · Pitot ${f.pitot??"—"} · Discharge ${f.total_discharge??f.discharge??"—"} · AFF ${f.aff??"—"}`
      : `Last M&I ${r.inspection_date}: Status ${r.status??"—"}${r.notes?` — "${r.notes}"`:""}`;
    const thisYear=String(new Date().getFullYear());
    const thisYearRecords=historyToPrintRows(records.filter(x=>x.inspection_date.startsWith(thisYear)));
    const thisYearLine = thisYearRecords.length>1
      ? `<div style="margin-top:2px">${thisYear} records so far: ${thisYearRecords.map(x=>`${x.date}${x.summary||x.notes?` (${x.summary||x.notes})`:""}`).join("; ")}</div>`
      : "";
    ctx.innerHTML = `<div>${lastLine}</div>${thisYearLine}`;
  }catch{ ctx.innerHTML="" }
}

// ===== Flow =====
function initFlow(){
  $("#addOutlet").addEventListener("click",addOutletRow);
  $("#flowCalc").addEventListener("click",doFlowCalc);
  $("#flowSave").addEventListener("click",saveFlow);
  $("#flowClear").addEventListener("click",clearFlow);
  $("#flowPrintBlank").addEventListener("click", async()=>{
    try{
      await Print.render("flow_test_form", {
        district_name: districtName($("#flowDistrict").value) || "",
        hydrant_number: $("#flowHydrant").value || "",
        date: $("#flowDate").value || "",
        location: $("#flowProject").value || "",
        inspector: $("#flowInspector").value || ""
      });
    }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
  });
  if(!$("#flowInspector").value){ $("#flowInspector").value=Auth.claims()?.username||"" }
  const requireFilled=()=>{const ok=($("#flowDistrict").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); $("#flow-sec-2").open=ok?$("#flow-sec-2").open:false; $("#flow-sec-3").open=ok?$("#flow-sec-3").open:false; ["#flow-sec-2","#flow-sec-3"].forEach(id=>$(id).querySelector("summary").style.opacity=ok?1:.5)};
  ["#flowDistrict","#flowProject","#flowInspector","#flowHydrant","#flowDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  $("#flowDistrict").addEventListener("change",()=>onHydrantFieldChange("flow"));
  $("#flowHydrant").addEventListener("change",()=>onHydrantFieldChange("flow"));
  attachHydrantAutocomplete("flow");
  if(!$("#flowDate").value){ const t=new Date(); $("#flowDate").value=t.toISOString().slice(0,10) }
  attachPhotoPreview(["#flowPhotos","#flowPhotosCapture"],"#flowPhotoList");
}
function attachPhotoPreview(inputSels,listSel){
  // inputSels can be a single selector or an array -- the "Take Photo" camera-capture
  // input and the regular library/file input are separate <input> elements (each has
  // its own FileList), so the preview needs to combine both instead of just one.
  const sels=Array.isArray(inputSels)?inputSels:[inputSels];
  const inputs=sels.map(s=>$(s)).filter(Boolean);
  const list=$(listSel); if(!inputs.length||!list) return;
  const update=()=>{
    const files=inputs.flatMap(i=>[...i.files]);
    list.textContent = files.length ? `${files.length} photo${files.length>1?"s":""} selected: ${files.map(f=>f.name).join(", ")}` : "";
  };
  inputs.forEach(i=>i.addEventListener("change",update));
}
function addOutletRow(){ const div=document.createElement("div"); div.className="outlet grid g3"; div.innerHTML=`<div><label>Outlet Diameter (in)</label><input type="number" step="0.1" value="2.5"></div><div><label>Coefficient C</label><input type="number" step="0.01" value="0.9"></div><div><label># Outlets Flowing</label><input type="number" value="1"></div>`; $("#outletsWrap").appendChild(div) }
function collectOutlets(){ const outlets=[{d:parseFloat($("#flowDiameter").value||"2.5"),c:parseFloat($("#flowCoeff").value||"0.9"),n:parseInt($("#flowCount").value||"1",10)}]; $$("#outletsWrap .outlet").forEach(o=>{const [d,c,n]=o.querySelectorAll("input"); outlets.push({d:parseFloat(d.value||"2.5"),c:parseFloat(c.value||"0.9"),n:parseInt(n.value||"1",10)})}); return outlets}
function doFlowCalc(){ const pitot=parseFloat($("#flowPitot").value||"0"), residual=parseFloat($("#flowResidual").value||"0"), staticP=parseFloat($("#flowStatic").value||"0"), outlets=collectOutlets(); let totalQ=0; outlets.forEach(o=>{ const q=29.83*o.c*(o.d**2)*(pitot>0?Math.sqrt(pitot):0)*(o.n||1); totalQ+=q }); let aff="-"; if(staticP>0&&residual>0&&staticP>residual){ aff=Math.round(totalQ*((staticP-20)/(staticP-residual))) } $("#resDischarge").textContent=Math.round(totalQ); $("#resAFF").textContent=aff; $("#flowResults").style.display="block"; return {totalQ, aff} }
async function saveFlow(){
  const ok=($("#flowDistrict").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return}
  const hydrant = findHydrant($("#flowDistrict").value, $("#flowHydrant").value);
  if(!hydrant){ toast("Unknown hydrant # for that district — check Hydrants list.",{bg:"#b91c1c"}); return }
  const {totalQ,aff} = doFlowCalc();
  const payload={
    hydrant_id: hydrant.id, inspection_date: $("#flowDate").value, inspection_type:"flow",
    notes: $("#flowNotes").value||"",
    flags_jsonb:{ project:$("#flowProject").value, inspector:$("#flowInspector").value, static:parseFloat($("#flowStatic").value||"0"), residual:parseFloat($("#flowResidual").value||"0"), pitot:parseFloat($("#flowPitot").value||"0"), outlets:collectOutlets(), discharge:Math.round(totalQ||0), aff:(aff==="-"?null:aff) }
  };
  saveDraft("flow",payload);
  try{
    const created = await Api.createInspection(payload);
    clearDraft("flow");
    await uploadSelectedPhotos(created.id, [$("#flowPhotos"), $("#flowPhotosCapture")]);
    toast("Flow record saved.");
    clearFlowForNext();
  }catch(e){ toast(e.message+" — kept locally, will retry automatically.",{bg:"#b91c1c",ms:5000}) }
}
async function uploadSelectedPhotos(inspectionId, inputEls){
  const els=Array.isArray(inputEls)?inputEls:[inputEls];
  const files=els.flatMap(el=>[...(el?.files||[])]);
  if(!files.length) return;
  let failed=0;
  for(const file of files){
    try{ await Api.uploadPhoto(inspectionId, file) }catch{ failed++ }
  }
  els.forEach(el=>{ if(el) el.value=""; });
  if(failed) toast(`${failed} photo(s) didn't upload — the inspection record itself was saved fine.`,{bg:"#b45309"});
}
function clearFlow(){ ["#flowDistrict","#flowProject","#flowInspector","#flowHydrant","#flowDate","#flowStatic","#flowResidual","#flowPitot","#flowDiameter","#flowCoeff","#flowCount","#flowNotes"].forEach(id=>{const el=$(id); if(!el)return; if(el.type==="date") el.value=new Date().toISOString().slice(0,10); else el.value=""}); $("#outletsWrap").innerHTML=""; $("#flowResults").style.display="none"; $("#flowContext").innerHTML="" }
function clearFlowForNext(){ ["#flowHydrant","#flowProject","#flowStatic","#flowResidual","#flowPitot","#flowNotes"].forEach(id=>{$(id).value=""}); $("#flowDiameter").value="2.5"; $("#flowCoeff").value="0.9"; $("#flowCount").value="1"; $("#outletsWrap").innerHTML=""; $("#flowResults").style.display="none"; $("#flowContext").innerHTML=""; $("#flowHydrant").focus() }

// ===== M&I =====
let miChecklistState=[], miTasksState=[];
function initMI(){
  const sel=$("#miStatus"); sel.innerHTML=""; STATE.statuses.forEach(s=>{const o=document.createElement("option"); o.value=s.id; o.textContent=s.name; sel.appendChild(o)});
  miChecklistState=renderTriState("#miChecklist",STATE.checklist);
  miTasksState=renderTriState("#miTasks",STATE.maint);
  if(!$("#miInspector").value){ $("#miInspector").value=Auth.claims()?.username||"" }
  const requireFilled=()=>{const ok=($("#miDistrict").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); ["#mi-sec-2","#mi-sec-3","#mi-sec-4"].forEach(id=>{const sec=$(id); sec.open=ok?sec.open:false; sec.querySelector("summary").style.opacity=ok?1:.5})};
  ["#miDistrict","#miProject","#miInspector","#miHydrant","#miDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  $("#miDistrict").addEventListener("change",()=>onHydrantFieldChange("mi"));
  $("#miHydrant").addEventListener("change",()=>onHydrantFieldChange("mi"));
  attachHydrantAutocomplete("mi");
  if(!$("#miDate").value){ $("#miDate").value=new Date().toISOString().slice(0,10) }
  if(!$("#miSave")){ const save=document.createElement("div"); save.style="margin-top:8px"; save.innerHTML=`<button id="miSave" class="btn">Save M&I</button>`; $("#tab-mi").appendChild(save); }
  $("#miSave").onclick=saveMI;
  attachPhotoPreview(["#miPhotos","#miPhotosCapture"],"#miPhotoList");
}
function renderTriState(containerId,items){
  const wrap=$(containerId); wrap.innerHTML="";
  const colors={ok:"#16a34a",issue:"#b91c1c",na:"#6b7280"};
  const state=items.map(t=>({item:t,val:"",note:""}));
  items.forEach((t,i)=>{
    const row=document.createElement("div"); row.style="padding:8px 0;border-bottom:1px dashed var(--border)";
    row.innerHTML=`<div style="display:flex;gap:8px;align-items:center">
        <div style="flex:1">${t}</div>
        <div style="display:flex;gap:4px">
          <button type="button" data-val="ok" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:#fff;color:#111827;cursor:pointer">OK</button>
          <button type="button" data-val="issue" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:#fff;color:#111827;cursor:pointer">Issue</button>
          <button type="button" data-val="na" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:#fff;color:#111827;cursor:pointer">N/A</button>
        </div>
      </div>
      <input class="triNote" placeholder="What's the issue?" style="display:none;margin-top:6px">`;
    wrap.appendChild(row);
    const noteEl=row.querySelector(".triNote");
    row.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click",()=>{
        state[i].val=b.dataset.val;
        row.querySelectorAll("button").forEach(x=>{ const active=x===b; x.style.background=active?colors[x.dataset.val]:"#fff"; x.style.color=active?"#fff":"#111827" });
        noteEl.style.display=b.dataset.val==="issue"?"":"none";
        if(b.dataset.val!=="issue"){ state[i].note=""; noteEl.value="" }
      });
    });
    noteEl.addEventListener("input",()=>{ state[i].note=noteEl.value });
  });
  return state;
}
async function saveMI(){
  const ok=($("#miDistrict").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return}
  const hydrant = findHydrant($("#miDistrict").value, $("#miHydrant").value);
  if(!hydrant){ toast("Unknown hydrant # for that district — check Hydrants list.",{bg:"#b91c1c"}); return }
  const status = $("#miStatus").value||null;
  const payload={
    hydrant_id: hydrant.id, inspection_date: $("#miDate").value, inspection_type:"mi", status,
    notes: $("#miNotes").value||"",
    flags_jsonb:{ project:$("#miProject").value, inspector:$("#miInspector").value,
      checks: miChecklistState.map(s=>({item:s.item, state:s.val||"unchecked", note:s.note||undefined})),
      tasks: miTasksState.map(s=>({item:s.item, state:s.val||"unchecked", note:s.note||undefined})) }
  };
  saveDraft("mi",payload);
  try{
    const created = await Api.createInspection(payload);
    if(status){ try{ await Api.updateHydrant(hydrant.id, {...hydrantToApiIn(hydrant), status}) }catch{} }
    clearDraft("mi");
    await uploadSelectedPhotos(created.id, [$("#miPhotos"), $("#miPhotosCapture")]);
    toast("M&I record saved.");
    clearMIForNext();
  }catch(e){ toast(e.message+" — kept locally, will retry automatically.",{bg:"#b91c1c",ms:5000}) }
}
function clearMIForNext(){
  $("#miHydrant").value=""; $("#miProject").value=""; $("#miNotes").value="";
  miChecklistState=renderTriState("#miChecklist",STATE.checklist);
  miTasksState=renderTriState("#miTasks",STATE.maint);
  $("#miContext").innerHTML=""; $("#miHydrant").focus();
}
function hydrantToApiIn(h){
  return { district_id:h.district_id, hydrant_number:h.hydrant_number, label:h.label, street_address:h.street_address, city:h.city, state:h.state, postal_code:h.postal_code, latitude:h.latitude, longitude:h.longitude, status:h.status, flow_gpm:h.flow_gpm, notes:h.notes, make:h.make, line_size:h.line_size, top:h.top, caps:h.caps };
}

// ===== Settings =====
function renderSettings(){
  const claims = Auth.claims();
  $("#accountInfo").textContent = claims ? `Signed in as ${claims.username}` : "";
  $("#btnLogout").onclick = async ()=>{ await Auth.logout(); showLogin(); };

  const sp=$("#statusPanel"); sp.innerHTML=""; const add=document.createElement("div"); add.className="grid g3"; add.innerHTML=`<div><label>Name</label><input id="stName"></div><div><label>Color</label><input id="stColor" type="color" value="#16a34a"></div><div style="display:flex;gap:8px;align-items:end"><button id="stAdd" class="btn">Add</button><button id="stReset" class="btn secondary">Reset</button></div>`; sp.appendChild(add);
  const list=document.createElement("div"); list.style="margin-top:8px"; STATE.statuses.forEach((s,i)=>{const row=document.createElement("div"); row.className="grid g3"; row.style="align-items:end;margin:6px 0"; row.innerHTML=`<div><label>Label</label><input value="${s.name}"></div><div><label>Color</label><input type="color" value="${s.color}"></div><div style="display:flex;gap:8px"><button class="btn secondary" data-act="save" data-i="${i}">Save</button><button class="btn ghost" data-act="del" data-i="${i}">Delete</button></div>`; list.appendChild(row)}); sp.appendChild(list);
  sp.querySelector("#stAdd").onclick=()=>{ const name=sp.querySelector("#stName").value.trim(); const color=sp.querySelector("#stColor").value; if(!name) return; const id=name.toLowerCase().replace(/\s+/g,"-"); STATE.statuses.push({id,name,color,activity:"custom"}); saveConfig("statuses"); toast("Status added."); renderSettings(); renderDashboard(); populateHydrStatus(); };
  sp.querySelector("#stReset").onclick=()=>{ STATE.statuses=[{id:"ok",name:"OK",color:"#16a34a",activity:"none"},{id:"needs",name:"Needs",color:"#b45309",activity:"maintenance"},{id:"oos",name:"OOS",color:"#b91c1c",activity:"urgent"}]; saveConfig("statuses"); toast("Statuses reset."); renderSettings(); renderDashboard(); populateHydrStatus(); };
  list.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i; const row=b.parentElement.parentElement; if(b.dataset.act==="save"){ const [nameEl,colorEl]=row.querySelectorAll("input"); STATE.statuses[i].name=nameEl.value.trim()||STATE.statuses[i].name; STATE.statuses[i].color=colorEl.value||STATE.statuses[i].color; saveConfig("statuses"); toast("Status updated."); renderDashboard(); populateHydrStatus(); } else { STATE.statuses.splice(i,1); saveConfig("statuses"); toast("Status deleted."); renderSettings(); renderDashboard(); populateHydrStatus(); } } });
  const cp=$("#checklistPanel"); cp.innerHTML=""; buildCrudList(cp, STATE.checklist, "checklist", list=>{ STATE.checklist=list; saveConfig("checklist"); miChecklistState=renderTriState("#miChecklist",STATE.checklist); });
  const mp=$("#maintPanel"); mp.innerHTML=""; buildCrudList(mp, STATE.maint, "maint", list=>{ STATE.maint=list; saveConfig("maint"); miTasksState=renderTriState("#miTasks",STATE.maint); });
  const rp=$("#rulesPanel"); rp.innerHTML=""; buildCrudList(rp, STATE.rules, "rules", list=>{ STATE.rules=list; saveConfig("rules"); });
  $("#btnExport").onclick=exportBackup; $("#btnImport").onclick=importCSV;
}
function buildCrudList(container, arr, key, onChange){
  const add=document.createElement("div"); add.className="grid g3"; add.innerHTML=`<div><label>Add item</label><input id="${key}_add"></div><div style="display:flex;align-items:end"><button id="${key}_btn" class="btn">Add</button></div><div></div>`; container.appendChild(add);
  const list=document.createElement("div"); list.style="margin-top:8px"; arr.forEach((txt,i)=>{const row=document.createElement("div"); row.className="grid g3"; row.style="align-items:end;margin:6px 0"; row.innerHTML=`<div><label>Item</label><input value="${txt}"></div><div><button class="btn secondary" data-act="save" data-i="${i}">Save</button></div><div><button class="btn ghost" data-act="del" data-i="${i}">Delete</button></div>`; list.appendChild(row)}); container.appendChild(list);
  container.querySelector("#"+key+"_btn").onclick=()=>{ const v=container.querySelector("#"+key+"_add").value.trim(); if(!v) return; onChange([...arr,v]); toast("Item added."); renderSettings(); };
  list.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i; const row=b.parentElement.parentElement; if(b.dataset.act==="save"){ const v=row.querySelector("input").value.trim(); arr[i]=v||arr[i]; onChange(arr); toast("Item updated.") } else { arr.splice(i,1); onChange(arr); toast("Item deleted."); renderSettings(); } } });
}
async function exportBackup(){
  try{
    const hydrants = await Api.listHydrants();
    const inspections = await Api.listInspections();
    const data={statuses:STATE.statuses,checklist:STATE.checklist,maint:STATE.maint,hydrants,inspections};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="redcap-backup.json"; a.click(); URL.revokeObjectURL(url)
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
}
function parseCSV(text){ const lines=text.split(/\r?\n/).filter(l=>l.trim().length); const headers=lines.shift().split(",").map(h=>h.trim().replace(/(^"|"$)/g,"")); const out=[]; lines.forEach(line=>{ const cells=[]; let cur="",inq=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'&&line[i+1]==='"'){ cur+='"'; i++; continue } if(ch==='"'){ inq=!inq; continue } if(ch===','&&!inq){ cells.push(cur); cur=""; continue } cur+=ch } cells.push(cur); const row={}; headers.forEach((h,i)=> row[h]=(cells[i]??"").trim()); out.push(row) }); return out }
async function importCSV(){
  const districtId=$("#importDistrict").value;
  if(!districtId){ toast("Choose a district first.",{bg:"#b91c1c"}); return }
  const masterText=$("#csvMaster").value.trim();
  if(!masterText){ toast("Paste Master CSV first.",{bg:"#b91c1c"}); return }
  const rows=parseCSV(masterText);
  let ok=0, fail=0;
  for(const r of rows){
    if(!r.HydID) continue;
    try{
      await Api.createHydrant({
        district_id:districtId, hydrant_number:r.HydID, label:r.Name||"", latitude:parseFloat(r["Lat (DD)"]||"0")||0, longitude:parseFloat(r["Lon (DD)"]||"0")||0,
        street_address:r.Location||r.Name||"", make:r.Make||"", line_size:r.LineSize||"", top:r.Top||"", caps:r.Caps||"", notes:r.Notes||""
      });
      ok++;
    }catch{ fail++ }
  }
  toast(`Imported ${ok} hydrants${fail?`, ${fail} failed`:""}.`);
  renderDashboard(); renderHydrants();
}

// ===== Boot =====
function showLogin(){ $("#loginScreen").style.display=""; $("#app").style.display="none" }
async function showApp(){
  $("#loginScreen").style.display="none"; $("#app").style.display="";
  await loadOrgSettings();
  await loadDistricts();
  try{ STATE.hydrants = await Api.listHydrants() }catch{}
  await refreshAllHydrants();
  goto(location.hash.replace(/^#\/?/,"")||"dashboard"); initFlow(); initMI(); bindNav(); registerSW();
  resumeDrafts();
}

function initLogin(){
  const submit = async ()=>{
    const u=$("#loginUsername").value.trim(), p=$("#loginPassword").value;
    $("#loginError").style.display="none";
    try{ await Auth.login(u,p); showApp(); }
    catch(e){ $("#loginError").textContent=e.message; $("#loginError").style.display="block" }
  };
  $("#loginSubmit").addEventListener("click",submit);
  $("#loginPassword").addEventListener("keydown",e=>{ if(e.key==="Enter") submit() });
}

function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(regs=>{
    regs.forEach(r=>{ if(r.active && !/\/sw-v5\.js$/.test(r.active.scriptURL)) r.unregister() });
  });
  navigator.serviceWorker.register("./sw-v5.js").catch(()=>{});
}

// ===== Embed handoff =====
// When RedCap is embedded in an iframe by the FDP shell, it receives the
// user's already-established fdp-auth session via postMessage instead of
// showing its own login form. Opened directly/standalone (not in an iframe,
// or no handoff message ever arrives), everything behaves exactly as before —
// this doesn't change RedCap's ability to run entirely on its own.
const TRUSTED_EMBED_PARENTS = ["https://preplans.danuntu.com", "http://localhost:3080"];
function initEmbedHandoff(){
  if(window === window.top) return; // not embedded, nothing to do
  window.addEventListener("message", e=>{
    if(!TRUSTED_EMBED_PARENTS.includes(e.origin)) return;
    if(e.data?.type !== "fdp-auth-handoff" || !e.data.access) return;
    Auth.setTokens(e.data.access, e.data.refresh);
    showApp();
  });
  window.parent.postMessage({type:"fdp-embed-ready"}, "*");
}

window.addEventListener("DOMContentLoaded",()=>{
  initLogin();
  initEmbedHandoff();
  if(Auth.isLoggedIn()) showApp(); else showLogin();
});
