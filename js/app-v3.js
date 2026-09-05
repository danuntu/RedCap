
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const LS={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};

// ===== Config =====
const AUTH_BASE = "https://fdp-auth.danuntu.com";
const API_BASE = "https://redcap-api.danuntu.com";

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
    if(!res.ok) throw new Error("Failed to save hydrant");
    return res.json();
  },
  async updateHydrant(id, body){
    const res = await authFetch(`${API_BASE}/hydrants/${id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    if(!res.ok) throw new Error("Failed to update hydrant");
    return res.json();
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
  hydrants:[],
  districts:[],
  route:"dashboard"
};
function saveLocalConfig(){ LS.set("redcap.statuses",STATE.statuses); LS.set("redcap.checklist",STATE.checklist); LS.set("redcap.maint",STATE.maint) }

function toast(msg,{bg,ms}={}){ const t=document.createElement("div"); t.className="toast"; if(bg)t.style.background=bg; t.textContent=msg; $("#toastbox").appendChild(t); setTimeout(()=>t.remove(), ms??3500) }

function districtName(id){ return STATE.districts.find(d=>d.id===id)?.name || "—" }
function findHydrant(districtId, num){ return STATE.hydrants.find(h=>h.district_id===districtId && String(h.hydrant_number)===String(num)) }
async function loadDistricts(){
  try{ STATE.districts = await Api.listDistricts() }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  const opts = STATE.districts.map(d=>`<option value="${d.id}">${d.name}</option>`).join("");
  $("#flowDistrict").innerHTML = opts;
  $("#miDistrict").innerHTML = opts;
  $("#importDistrict").innerHTML = opts;
  $("#hydrDistrict").innerHTML = `<option value="">All districts</option>` + opts;
}

// ===== Nav =====
function goto(tab){
  STATE.route=tab; $$("#content>section").forEach(s=>s.hidden=(s.id!=="tab-"+tab)); $("#pagetitle").textContent=(tab==="mi"?"Maintenance & Inspection":tab[0].toUpperCase()+tab.slice(1));
  $$(".tabbtn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab)); $("#bottombar").classList.toggle("hidden",tab!=="flow"); location.hash="#/"+tab;
  if(tab==="dashboard")renderDashboard(); if(tab==="hydrants")renderHydrants(); if(tab==="settings")renderSettings();
}
window.addEventListener("hashchange",()=>goto(location.hash.replace(/^#\/?/,"")||"dashboard"));
function bindNav(){ $$(".tabbtn").forEach(b=>b.addEventListener("click",()=>goto(b.dataset.tab))) }

// ===== Dashboard =====
async function renderDashboard(){
  try{ STATE.hydrants = await Api.listHydrants() }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  const byD=new Map(); STATE.hydrants.forEach(h=>{const d=districtName(h.district_id); byD.set(d,(byD.get(d)||0)+1)});
  const k=$("#kpi"); k.innerHTML=""; byD.forEach((c,d)=>{const t=document.createElement("div"); t.className="tile"; t.innerHTML=`<h3 style='margin:0 0 6px;color:#6b7280'>${d}</h3><div style='font-size:28px;font-weight:800'>${c}</div>`; k.appendChild(t)});
  const legend=$("#statusLegend"); const counts={}; STATE.statuses.forEach(s=>counts[s.id]=0);
  STATE.hydrants.forEach(h=>{ if(h.status && counts.hasOwnProperty(h.status)) counts[h.status]++ });
  legend.innerHTML=""; const wrap=document.createElement("div"); STATE.statuses.forEach(s=>{const pill=document.createElement("span"); pill.style="display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;margin-right:6px"; pill.innerHTML=`<span style="width:12px;height:12px;border-radius:50%;background:${s.color}"></span>${s.name}: <b>${counts[s.id]||0}</b>`; wrap.appendChild(pill)}); legend.appendChild(wrap);
}

// ===== Hydrants list =====
async function renderHydrants(){
  const q=($("#hydrSearch")?.value||"").trim();
  const districtId=$("#hydrDistrict")?.value||"";
  try{ STATE.hydrants = await Api.listHydrants(q, districtId||undefined) }catch(e){ toast(e.message,{bg:"#b91c1c"}); return }
  const rows=$("#hydrRows"); rows.innerHTML="";
  STATE.hydrants.forEach(h=>{const r=document.createElement("div"); r.className="row"; const meta=STATE.statuses.find(s=>s.id===h.status)||{name:h.status||"—",color:"#e5e7eb"}; r.innerHTML=`<div>${h.hydrant_number??""}</div><div>${h.street_address??h.label??""}</div><div>${districtName(h.district_id)}</div><div>${h.make??""}</div><div><span style="padding:2px 6px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:12px">${meta.name}</span></div>`; r.addEventListener("click",()=>{goto("flow"); $("#flowDistrict").value=h.district_id; $("#flowHydrant").value=h.hydrant_number??""; $("#flowProject").value=h.street_address??h.label??""; $("#flowInspector").focus();}); rows.appendChild(r)});
}
$("#hydrSearch")?.addEventListener("input",renderHydrants); $("#hydrClear")?.addEventListener("click",()=>{$("#hydrSearch").value=""; renderHydrants()});
$("#hydrDistrict")?.addEventListener("change",renderHydrants);

// ===== Flow =====
function initFlow(){
  $("#addOutlet").addEventListener("click",addOutletRow);
  $("#flowCalc").addEventListener("click",doFlowCalc);
  $("#flowSave").addEventListener("click",saveFlow);
  $("#flowClear").addEventListener("click",clearFlow);
  const requireFilled=()=>{const ok=($("#flowDistrict").value&&$("#flowProject").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); $("#flow-sec-2").open=ok?$("#flow-sec-2").open:false; $("#flow-sec-3").open=ok?$("#flow-sec-3").open:false; ["#flow-sec-2","#flow-sec-3"].forEach(id=>$(id).querySelector("summary").style.opacity=ok?1:.5)};
  ["#flowDistrict","#flowProject","#flowInspector","#flowHydrant","#flowDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  if(!$("#flowDate").value){ const t=new Date(); $("#flowDate").value=t.toISOString().slice(0,10) }
}
function addOutletRow(){ const div=document.createElement("div"); div.className="outlet grid g3"; div.innerHTML=`<div><label>Outlet Diameter (in)</label><input type="number" step="0.1" value="2.5"></div><div><label>Coefficient C</label><input type="number" step="0.01" value="0.9"></div><div><label># Outlets Flowing</label><input type="number" value="1"></div>`; $("#outletsWrap").appendChild(div) }
function collectOutlets(){ const outlets=[{d:parseFloat($("#flowDiameter").value||"2.5"),c:parseFloat($("#flowCoeff").value||"0.9"),n:parseInt($("#flowCount").value||"1",10)}]; $$("#outletsWrap .outlet").forEach(o=>{const [d,c,n]=o.querySelectorAll("input"); outlets.push({d:parseFloat(d.value||"2.5"),c:parseFloat(c.value||"0.9"),n:parseInt(n.value||"1",10)})}); return outlets}
function doFlowCalc(){ const pitot=parseFloat($("#flowPitot").value||"0"), residual=parseFloat($("#flowResidual").value||"0"), staticP=parseFloat($("#flowStatic").value||"0"), outlets=collectOutlets(); let totalQ=0; outlets.forEach(o=>{ const q=29.83*o.c*(o.d**2)*(pitot>0?Math.sqrt(pitot):0)*(o.n||1); totalQ+=q }); let aff="-"; if(staticP>0&&residual>0&&staticP>residual){ aff=Math.round(totalQ*((staticP-20)/(staticP-residual))) } $("#resDischarge").textContent=Math.round(totalQ); $("#resAFF").textContent=aff; $("#flowResults").style.display="block"; return {totalQ, aff} }
async function saveFlow(){
  const ok=($("#flowDistrict").value&&$("#flowProject").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return}
  const hydrant = findHydrant($("#flowDistrict").value, $("#flowHydrant").value);
  if(!hydrant){ toast("Unknown hydrant # for that district — check Hydrants list.",{bg:"#b91c1c"}); return }
  const {totalQ,aff} = doFlowCalc();
  try{
    await Api.createInspection({
      hydrant_id: hydrant.id, inspection_date: $("#flowDate").value, inspection_type:"flow",
      notes: $("#flowNotes").value||"",
      flags_jsonb:{ project:$("#flowProject").value, inspector:$("#flowInspector").value, static:parseFloat($("#flowStatic").value||"0"), residual:parseFloat($("#flowResidual").value||"0"), pitot:parseFloat($("#flowPitot").value||"0"), outlets:collectOutlets(), discharge:Math.round(totalQ||0), aff:(aff==="-"?null:aff) }
    });
    toast("Flow record saved.");
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
}
function clearFlow(){ ["#flowProject","#flowInspector","#flowHydrant","#flowDate","#flowStatic","#flowResidual","#flowPitot","#flowDiameter","#flowCoeff","#flowCount","#flowNotes"].forEach(id=>{const el=$(id); if(!el)return; if(el.type==="date") el.value=new Date().toISOString().slice(0,10); else el.value=""}); $("#outletsWrap").innerHTML=""; $("#flowResults").style.display="none" }

// ===== M&I =====
function initMI(){
  const sel=$("#miStatus"); sel.innerHTML=""; STATE.statuses.forEach(s=>{const o=document.createElement("option"); o.value=s.id; o.textContent=s.name; sel.appendChild(o)});
  renderMiChecklist(); renderMiTasks();
  const requireFilled=()=>{const ok=($("#miDistrict").value&&$("#miProject").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); ["#mi-sec-2","#mi-sec-3","#mi-sec-4"].forEach(id=>{const sec=$(id); sec.open=ok?sec.open:false; sec.querySelector("summary").style.opacity=ok?1:.5})};
  ["#miDistrict","#miProject","#miInspector","#miHydrant","#miDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  if(!$("#miDate").value){ $("#miDate").value=new Date().toISOString().slice(0,10) }
  if(!$("#miSave")){ const save=document.createElement("div"); save.style="margin-top:8px"; save.innerHTML=`<button id="miSave" class="btn">Save M&I</button>`; $("#tab-mi").appendChild(save); }
  $("#miSave").onclick=saveMI;
}
function renderMiChecklist(){ const wrap=$("#miChecklist"); wrap.innerHTML=""; STATE.checklist.forEach((t,i)=>{const row=document.createElement("label"); row.style="display:flex;gap:8px;align-items:center;padding:6px 0"; row.innerHTML=`<input type="checkbox" id="chk_${i}"><span>${t}</span>`; wrap.appendChild(row)}) }
function renderMiTasks(){ const wrap=$("#miTasks"); wrap.innerHTML=""; STATE.maint.forEach((t,i)=>{const row=document.createElement("label"); row.style="display:flex;gap:8px;align-items:center;padding:6px 0"; row.innerHTML=`<input type="checkbox" id="mnt_${i}"><span>${t}</span>`; wrap.appendChild(row)}) }
async function saveMI(){
  const ok=($("#miDistrict").value&&$("#miProject").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return}
  const hydrant = findHydrant($("#miDistrict").value, $("#miHydrant").value);
  if(!hydrant){ toast("Unknown hydrant # for that district — check Hydrants list.",{bg:"#b91c1c"}); return }
  const status = $("#miStatus").value||null;
  try{
    await Api.createInspection({
      hydrant_id: hydrant.id, inspection_date: $("#miDate").value, inspection_type:"mi", status,
      notes: $("#miNotes").value||"",
      flags_jsonb:{ project:$("#miProject").value, inspector:$("#miInspector").value, checks: STATE.checklist.map((t,i)=>({item:t, checked: $("#chk_"+i)?.checked||false})), tasks: STATE.maint.map((t,i)=>({item:t, checked: $("#mnt_"+i)?.checked||false})) }
    });
    if(status){ await Api.updateHydrant(hydrant.id, {...hydrantToApiIn(hydrant), status}) }
    toast("M&I record saved.");
  }catch(e){ toast(e.message,{bg:"#b91c1c"}) }
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
  sp.querySelector("#stAdd").onclick=()=>{ const name=sp.querySelector("#stName").value.trim(); const color=sp.querySelector("#stColor").value; if(!name) return; const id=name.toLowerCase().replace(/\s+/g,"-"); STATE.statuses.push({id,name,color,activity:"custom"}); saveLocalConfig(); toast("Status added."); renderSettings(); renderDashboard(); };
  sp.querySelector("#stReset").onclick=()=>{ STATE.statuses=[{id:"ok",name:"OK",color:"#16a34a",activity:"none"},{id:"needs",name:"Needs",color:"#b45309",activity:"maintenance"},{id:"oos",name:"OOS",color:"#b91c1c",activity:"urgent"}]; saveLocalConfig(); toast("Statuses reset."); renderSettings(); renderDashboard(); };
  list.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i; const row=b.parentElement.parentElement; if(b.dataset.act==="save"){ const [nameEl,colorEl]=row.querySelectorAll("input"); STATE.statuses[i].name=nameEl.value.trim()||STATE.statuses[i].name; STATE.statuses[i].color=colorEl.value||STATE.statuses[i].color; saveLocalConfig(); toast("Status updated."); renderDashboard(); } else { STATE.statuses.splice(i,1); saveLocalConfig(); toast("Status deleted."); renderSettings(); renderDashboard(); } } });
  const cp=$("#checklistPanel"); cp.innerHTML=""; buildCrudList(cp, STATE.checklist, "checklist", list=>{ STATE.checklist=list; saveLocalConfig(); renderMiChecklist(); });
  const mp=$("#maintPanel"); mp.innerHTML=""; buildCrudList(mp, STATE.maint, "maint", list=>{ STATE.maint=list; saveLocalConfig(); renderMiTasks(); });
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
  await loadDistricts();
  goto(location.hash.replace(/^#\/?/,"")||"dashboard"); initFlow(); initMI(); bindNav(); registerSW();
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
    regs.forEach(r=>{ if(r.active && /\/sw\.js$/.test(r.active.scriptURL)) r.unregister() });
  });
  navigator.serviceWorker.register("./sw-v3.js").catch(()=>{});
}

window.addEventListener("DOMContentLoaded",()=>{
  initLogin();
  if(Auth.isLoggedIn()) showApp(); else showLogin();
});
