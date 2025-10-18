
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const LS={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},set(k,v){localStorage.setItem(k,JSON.stringify(v))}};
const STATE={
  statuses:LS.get("redcap.statuses",[
    {id:"ok",name:"OK",color:"#16a34a",activity:"none"},
    {id:"needs",name:"Needs",color:"#b45309",activity:"maintenance"},
    {id:"oos",name:"OOS",color:"#b91c1c",activity:"urgent"}
  ]),
  checklist:LS.get("redcap.checklist",["Caps present/intact","No leaks","Threads clean"]),
  maint:LS.get("redcap.maint",["Lubricate stem","Paint touch-up","Replace gaskets"]),
  master:LS.get("redcap.master",[]),
  details:LS.get("redcap.details",[]),
  lockedYears:LS.get("redcap.lockedYears",[]),
  route:"dashboard"
};
function saveAll(){ LS.set("redcap.statuses",STATE.statuses); LS.set("redcap.checklist",STATE.checklist); LS.set("redcap.maint",STATE.maint); LS.set("redcap.master",STATE.master); LS.set("redcap.details",STATE.details); LS.set("redcap.lockedYears",STATE.lockedYears); }
function toast(msg,{bg,ms}={}){ const t=document.createElement("div"); t.className="toast"; if(bg)t.style.background=bg; t.textContent=msg; $("#toastbox").appendChild(t); setTimeout(()=>t.remove(), ms??3500) }
function goto(tab){ STATE.route=tab; $$("#content>section").forEach(s=>s.hidden=(s.id!=="tab-"+tab)); $("#pagetitle").textContent=(tab==="mi"?"Maintenance & Inspection":tab[0].toUpperCase()+tab.slice(1)); $$(".tabbtn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab)); $("#bottombar").classList.toggle("hidden",tab!=="flow"); if(tab==="dashboard")renderDashboard(); if(tab==="hydrants")renderHydrants(); if(tab==="settings")renderSettings(); location.hash="#/"+tab }
window.addEventListener("hashchange",()=>goto(location.hash.replace(/^#\/?/,"")||"dashboard"));
window.addEventListener("DOMContentLoaded",()=>{ goto(location.hash.replace(/^#\/?/,"")||"dashboard"); initFlow(); initMI(); bindNav(); registerSW(); });

function bindNav(){ $$(".tabbtn").forEach(b=>b.addEventListener("click",()=>goto(b.dataset.tab))) }
function renderDashboard(){
  const byD=new Map(); STATE.master.forEach(h=>{const d=h.District||"—"; byD.set(d,(byD.get(d)||0)+1)});
  const k=$("#kpi"); k.innerHTML=""; byD.forEach((c,d)=>{const t=document.createElement("div"); t.className="tile"; t.innerHTML=`<h3 style='margin:0 0 6px;color:#6b7280'>${d}</h3><div style='font-size:28px;font-weight:800'>${c}</div>`; k.appendChild(t)});
  const legend=$("#statusLegend"); const latest={}; STATE.details.forEach(r=>{ if(r.type==="mi"&&r.hydID){ const k=String(r.hydID); if(!latest[k]||(r.date>latest[k].date)) latest[k]={status:r.status||null,date:r.date||""}; } }); const counts={}; STATE.statuses.forEach(s=>counts[s.id]=0); Object.values(latest).forEach(v=>{ if(v.status&&counts.hasOwnProperty(v.status)) counts[v.status]++ });
  legend.innerHTML=""; const wrap=document.createElement("div"); STATE.statuses.forEach(s=>{const pill=document.createElement("span"); pill.style="display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;margin-right:6px"; pill.innerHTML=`<span style="width:12px;height:12px;border-radius:50%;background:${s.color}"></span>${s.name}: <b>${counts[s.id]||0}</b>`; wrap.appendChild(pill)}); legend.appendChild(wrap);
}
function renderHydrants(){
  const q=($("#hydrSearch")?.value||"").trim().toLowerCase(); const rows=$("#hydrRows"); rows.innerHTML=""; let data=STATE.master; if(q){ data=data.filter(h=>{const s=(h.Location||"")+" "+(h.District||"")+" "+(h.Make||"")+" "+(h.Notes||"")+" "+String(h.HydID||""); return s.toLowerCase().includes(q)})}
  data.forEach(h=>{const r=document.createElement("div"); r.className="row"; const st=findLatestStatus(h.HydID); const meta=STATE.statuses.find(s=>s.id===st)||{name:"—",color:"#e5e7eb"}; r.innerHTML=`<div>${h.HydID??""}</div><div>${h.Location??""}</div><div>${h.District??""}</div><div>${h.Make??""}</div><div><span style="padding:2px 6px;border-radius:999px;border:1px solid ${meta.color};color:${meta.color};font-size:12px">${meta.name}</span></div>`; r.addEventListener("click",()=>{goto("flow"); $("#flowHydrant").value=h.HydID??""; $("#flowProject").value=h.Location??""; $("#flowInspector").focus();}); rows.appendChild(r)});
}
$("#hydrSearch")?.addEventListener("input",renderHydrants); $("#hydrClear")?.addEventListener("click",()=>{$("#hydrSearch").value=""; renderHydrants()})
function findLatestStatus(hid){ let best=null,bd=""; STATE.details.forEach(r=>{ if(r.type==="mi"&&String(r.hydID)===String(hid)){ if(!bd||(r.date && r.date>bd)){ best=r.status||null; bd=r.date||"" } } }); return best }

// Flow
function initFlow(){
  $("#addOutlet").addEventListener("click",addOutletRow);
  $("#flowCalc").addEventListener("click",doFlowCalc);
  $("#flowSave").addEventListener("click",saveFlow);
  $("#flowClear").addEventListener("click",clearFlow);
  const requireFilled=()=>{const ok=($("#flowProject").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); $("#flow-sec-2").open=ok?$("#flow-sec-2").open:false; $("#flow-sec-3").open=ok?$("#flow-sec-3").open:false; ["#flow-sec-2","#flow-sec-3"].forEach(id=>$(id).querySelector("summary").style.opacity=ok?1:.5)};
  ["#flowProject","#flowInspector","#flowHydrant","#flowDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  if(!$("#flowDate").value){ const t=new Date(); $("#flowDate").value=t.toISOString().slice(0,10) }
}
function addOutletRow(){ const div=document.createElement("div"); div.className="outlet grid g3"; div.innerHTML=`<div><label>Outlet Diameter (in)</label><input type="number" step="0.1" value="2.5"></div><div><label>Coefficient C</label><input type="number" step="0.01" value="0.9"></div><div><label># Outlets Flowing</label><input type="number" value="1"></div>`; $("#outletsWrap").appendChild(div) }
function collectOutlets(){ const outlets=[{d:parseFloat($("#flowDiameter").value||"2.5"),c:parseFloat($("#flowCoeff").value||"0.9"),n:parseInt($("#flowCount").value||"1",10)}]; $$("#outletsWrap .outlet").forEach(o=>{const [d,c,n]=o.querySelectorAll("input"); outlets.push({d:parseFloat(d.value||"2.5"),c:parseFloat(c.value||"0.9"),n:parseInt(n.value||"1",10)})}); return outlets}
function doFlowCalc(){ const pitot=parseFloat($("#flowPitot").value||"0"), residual=parseFloat($("#flowResidual").value||"0"), staticP=parseFloat($("#flowStatic").value||"0"), outlets=collectOutlets(); let totalQ=0; outlets.forEach(o=>{ const q=29.83*o.c*(o.d**2)*(pitot>0?Math.sqrt(pitot):0)*(o.n||1); totalQ+=q }); let aff="-"; if(staticP>0&&residual>0&&staticP>residual){ aff=Math.round(totalQ*((staticP-20)/(staticP-residual))) } $("#resDischarge").textContent=Math.round(totalQ); $("#resAFF").textContent=aff; $("#flowResults").style.display="block" }
function isLockedYear(y){ return (STATE.lockedYears||[]).includes(y) }
function saveFlow(){ const ok=($("#flowProject").value&&$("#flowInspector").value&&$("#flowHydrant").value&&$("#flowDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return} const rec={type:"flow",hydID:parseInt($("#flowHydrant").value,10),project:$("#flowProject").value,inspector:$("#flowInspector").value,date:$("#flowDate").value,static:parseFloat($("#flowStatic").value||"0"),residual:parseFloat($("#flowResidual").value||"0"),pitot:parseFloat($("#flowPitot").value||"0"),outlets:collectOutlets(),results:{discharge:parseInt($("#resDischarge").textContent||"0",10)||0,aff:($("#resAFF").textContent==="-"?null:parseInt($("#resAFF").textContent,10))},notes:$("#flowNotes").value||""}; if(isLockedYear(new Date(rec.date).getFullYear())){toast("Locked year; can't save.",{bg:"#b91c1c"});return} STATE.details.push(rec); saveAll(); toast("Flow record saved.") }
function clearFlow(){ ["#flowProject","#flowInspector","#flowHydrant","#flowDate","#flowStatic","#flowResidual","#flowPitot","#flowDiameter","#flowCoeff","#flowCount","#flowNotes"].forEach(id=>{const el=$(id); if(!el)return; if(el.type==="date") el.value=new Date().toISOString().slice(0,10); else el.value=""}); $("#outletsWrap").innerHTML=""; $("#flowResults").style.display="none" }

// M&I
function initMI(){
  const sel=$("#miStatus"); sel.innerHTML=""; STATE.statuses.forEach(s=>{const o=document.createElement("option"); o.value=s.id; o.textContent=s.name; sel.appendChild(o)});
  renderMiChecklist(); renderMiTasks();
  const requireFilled=()=>{const ok=($("#miProject").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); ["#mi-sec-2","#mi-sec-3","#mi-sec-4"].forEach(id=>{const sec=$(id); sec.open=ok?sec.open:false; sec.querySelector("summary").style.opacity=ok?1:.5})};
  ["#miProject","#miInspector","#miHydrant","#miDate"].forEach(id=>$(id).addEventListener("input",requireFilled)); requireFilled();
  if(!$("#miDate").value){ $("#miDate").value=new Date().toISOString().slice(0,10) }
  const save=document.createElement("div"); save.style="margin-top:8px"; save.innerHTML=`<button id="miSave" class="btn">Save M&I</button>`; $("#tab-mi").appendChild(save); $("#miSave").onclick=saveMI;
}
function renderMiChecklist(){ const wrap=$("#miChecklist"); wrap.innerHTML=""; STATE.checklist.forEach((t,i)=>{const row=document.createElement("label"); row.style="display:flex;gap:8px;align-items:center;padding:6px 0"; row.innerHTML=`<input type="checkbox" id="chk_${i}"><span>${t}</span>`; wrap.appendChild(row)}) }
function renderMiTasks(){ const wrap=$("#miTasks"); wrap.innerHTML=""; STATE.maint.forEach((t,i)=>{const row=document.createElement("label"); row.style="display:flex;gap:8px;align-items:center;padding:6px 0"; row.innerHTML=`<input type="checkbox" id="mnt_${i}"><span>${t}</span>`; wrap.appendChild(row)}) }
function saveMI(){ const ok=($("#miProject").value&&$("#miInspector").value&&$("#miHydrant").value&&$("#miDate").value); if(!ok){toast("Fill section 1 first.",{bg:"#b91c1c"});return} const hydID=parseInt($("#miHydrant").value,10); const rec={type:"mi",hydID,project:$("#miProject").value,inspector:$("#miInspector").value,date:$("#miDate").value,status:$("#miStatus").value||null,checks:STATE.checklist.map((_,i)=>$("#chk_"+i)?.checked||false),tasks:STATE.maint.map((_,i)=>$("#mnt_"+i)?.checked||false),notes:$("#miNotes").value||""}; if(isLockedYear(new Date(rec.date).getFullYear())){toast("Locked year; can't save.",{bg:"#b91c1c"});return} STATE.details.push(rec); saveAll(); toast("M&I record saved.") }

// Settings
function renderSettings(){
  const sp=$("#statusPanel"); sp.innerHTML=""; const add=document.createElement("div"); add.className="grid g3"; add.innerHTML=`<div><label>Name</label><input id="stName"></div><div><label>Color</label><input id="stColor" type="color" value="#16a34a"></div><div style="display:flex;gap:8px;align-items:end"><button id="stAdd" class="btn">Add</button><button id="stReset" class="btn secondary">Reset</button></div>`; sp.appendChild(add);
  const list=document.createElement("div"); list.style="margin-top:8px"; STATE.statuses.forEach((s,i)=>{const row=document.createElement("div"); row.className="grid g3"; row.style="align-items:end;margin:6px 0"; row.innerHTML=`<div><label>Label</label><input value="${s.name}"></div><div><label>Color</label><input type="color" value="${s.color}"></div><div style="display:flex;gap:8px"><button class="btn secondary" data-act="save" data-i="${i}">Save</button><button class="btn ghost" data-act="del" data-i="${i}">Delete</button></div>`; list.appendChild(row)}); sp.appendChild(list);
  sp.querySelector("#stAdd").onclick=()=>{ const name=sp.querySelector("#stName").value.trim(); const color=sp.querySelector("#stColor").value; if(!name) return; const id=name.toLowerCase().replace(/\s+/g,"-"); STATE.statuses.push({id,name,color,activity:"custom"}); saveAll(); toast("Status added."); renderSettings(); renderDashboard(); };
  sp.querySelector("#stReset").onclick=()=>{ STATE.statuses=[{id:"ok",name:"OK",color:"#16a34a",activity:"none"},{id:"needs",name:"Needs",color:"#b45309",activity:"maintenance"},{id:"oos",name:"OOS",color:"#b91c1c",activity:"urgent"}]; saveAll(); toast("Statuses reset."); renderSettings(); renderDashboard(); };
  list.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i; const row=b.parentElement.parentElement; if(b.dataset.act==="save"){ const [nameEl,colorEl]=row.querySelectorAll("input"); STATE.statuses[i].name=nameEl.value.trim()||STATE.statuses[i].name; STATE.statuses[i].color=colorEl.value||STATE.statuses[i].color; saveAll(); toast("Status updated."); renderDashboard(); } else { STATE.statuses.splice(i,1); saveAll(); toast("Status deleted."); renderSettings(); renderDashboard(); } } });
  const cp=$("#checklistPanel"); cp.innerHTML=""; buildCrudList(cp, STATE.checklist, "checklist", list=>{ STATE.checklist=list; saveAll(); renderMiChecklist(); });
  const mp=$("#maintPanel"); mp.innerHTML=""; buildCrudList(mp, STATE.maint, "maint", list=>{ STATE.maint=list; saveAll(); renderMiTasks(); });
  $("#btnExport").onclick=exportBackup; $("#btnImport").onclick=importCSV;
}
function buildCrudList(container, arr, key, onChange){
  const add=document.createElement("div"); add.className="grid g3"; add.innerHTML=`<div><label>Add item</label><input id="${key}_add"></div><div style="display:flex;align-items:end"><button id="${key}_btn" class="btn">Add</button></div><div></div>`; container.appendChild(add);
  const list=document.createElement("div"); list.style="margin-top:8px"; arr.forEach((txt,i)=>{const row=document.createElement("div"); row.className="grid g3"; row.style="align-items:end;margin:6px 0"; row.innerHTML=`<div><label>Item</label><input value="${txt}"></div><div><button class="btn secondary" data-act="save" data-i="${i}">Save</button></div><div><button class="btn ghost" data-act="del" data-i="${i}">Delete</button></div>`; list.appendChild(row)}); container.appendChild(list);
  container.querySelector("#"+key+"_btn").onclick=()=>{ const v=container.querySelector("#"+key+"_add").value.trim(); if(!v) return; onChange([...arr,v]); toast("Item added."); renderSettings(); };
  list.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i; const row=b.parentElement.parentElement; if(b.dataset.act==="save"){ const v=row.querySelector("input").value.trim(); arr[i]=v||arr[i]; onChange(arr); toast("Item updated.") } else { arr.splice(i,1); onChange(arr); toast("Item deleted."); renderSettings(); } } });
}
function exportBackup(){ const data={statuses:STATE.statuses,checklist:STATE.checklist,maint:STATE.maint,master:STATE.master,details:STATE.details,lockedYears:STATE.lockedYears}; const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="redcap-backup.json"; a.click(); URL.revokeObjectURL(url) }
function parseCSV(text){ const lines=text.split(/\r?\n/).filter(l=>l.trim().length); const headers=lines.shift().split(",").map(h=>h.trim().replace(/(^"|"$)/g,"")); const out=[]; lines.forEach(line=>{ const cells=[]; let cur="",inq=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'&&line[i+1]==='"'){ cur+='"'; i++; continue } if(ch==='"'){ inq=!inq; continue } if(ch===','&&!inq){ cells.push(cur); cur=""; continue } cur+=ch } cells.push(cur); const row={}; headers.forEach((h,i)=> row[h]=(cells[i]??"").trim()); out.push(row) }); return out }
function importCSV(){
  const masterText=$("#csvMaster").value.trim(), detailText=$("#csvDetail").value.trim();
  const mode=$("#importMode").value, lockChoice=$("#importLock").value, lockScope=$("#lockScope").value;
  let newMaster=[], newDetails=[];
  function num(v){ if(v===undefined||v==="") return null; const n=Number(v); return isFinite(n)?n:null }
  if(masterText){ const rows=parseCSV(masterText); newMaster=rows.map(r=>({ TestNeeded:(String(r.TestNeeded||"").toLowerCase()==="true"), HydID:r.HydID?parseInt(r.HydID,10):null, Name:r.Name||"", Lat:r["Lat (DD)"]?parseFloat(r["Lat (DD)"]):null, Lon:r["Lon (DD)"]?parseFloat(r["Lon (DD)"]):null, District:r.District||"", Location:r.Location||r.Name||"", Make:r.Make||"", LineSize:r.LineSize||"", Top:r.Top||"", Caps:r.Caps||"", Notes:r.Notes||"" })).filter(h=>h.HydID!=null) }
  if(detailText){ const rows=parseCSV(detailText); newDetails=rows.map(r=>{ const hydID=r.hydID||r.HydID||r.hydId||r.hydid||""; if(!hydID) return null; const dt=(r.EntryDate||r.date||"").replace(/(\d{2})\/(\d{2})\/(\d{2,4})/,(_,mm,dd,yy)=>{ yy=(String(yy).length===2?"20"+yy:yy); return `${yy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`}); return { type:"flow", hydID:parseInt(hydID,10), pilot:num(r.Pilot), static:num(r.Static), mainOutlet:r.MainOutlet||"2.5", ttlDsch:num(r.TtlDsch||r["Total Discharge"]), residual:num(r.Residual), date:dt||null, notes:r.Notes||"", aff:num(r["Available Fire Flow"]), coeff:num(r['Coefficient C = .9'])||0.9, diameter:num(r['diameter (d) of outlet flowed in inches'])||2.5, outlets:num(r['Number of outlets flowing'])||1 }; }).filter(x=>x&&x.hydID) }
  if(mode==="replace"){ if(newMaster.length) STATE.master=newMaster; if(newDetails.length) STATE.details=[] }
  if(newMaster.length){ const map=new Map(STATE.master.map(h=>[String(h.HydID),h])); newMaster.forEach(h=>map.set(String(h.HydID),{...(map.get(String(h.HydID))||{}),...h})); STATE.master=Array.from(map.values()).sort((a,b)=>(a.HydID||0)-(b.HydID||0)) }
  if(newDetails.length){ STATE.details=STATE.details.concat(newDetails) }
  if(lockChoice!=="none"){ const years=new Set(); if((lockScope==="both"||lockScope==="detail")&&newDetails.length){ newDetails.forEach(r=>{ if(!r.date) return; const y=new Date(r.date).getFullYear(); if(y>1900&&y<3000) years.add(y) }) } if(years.size){ if(lockChoice==="yes"){ addLockedYears(years); toast("Years locked: "+Array.from(years).join(", ")) } else if(lockChoice==="ask"){ toast("Lock imported years? "+Array.from(years).join(", ")) } } }
  saveAll(); toast("Import complete."); renderDashboard(); renderHydrants();
}
function addLockedYears(setYears){ const cur=new Set(STATE.lockedYears||[]); setYears.forEach(y=>cur.add(y)); STATE.lockedYears=Array.from(cur).sort(); saveAll() }
function registerSW(){ if("serviceWorker" in navigator){ navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(console.error) } }
