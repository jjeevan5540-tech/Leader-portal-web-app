// Leader Portal — app.js
// Loaded as a classic script so it also works when index.html is opened
// directly from disk (file:// blocks ES module scripts via CORS).
// The Firebase SDK is pulled in with dynamic import() instead.

// ─── Session guard ──────────────────────────────────────────────────────────
const SESSION_KEY = "leaderPortalSession";
function getSession(){
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if(raw) return JSON.parse(raw);
    return null;
  } catch(e) {
    return { name:"Leader", storageBlocked:true };
  }
}
window.__signedIn = !!getSession();
if(!window.__signedIn) window.location.replace("login.html");

// Identity of the open ticket: always the Firestore document key
// (collection + "/" + document id), never the human readable ticket code,
// which is NOT guaranteed to be unique across documents.
let activeKey = null;

// Stable, unique key for one ticket document.
function docKeyOf(colName, docId){ return colName + "/" + docId; }

function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") }

// ── Filters ────────────────────────────────────────────────────────────────
const FILTERS = { q:"", cat:"ALL", status:"ALL", date:"ALL", sort:"DATE_DESC" };

function readFilters(){
  FILTERS.q      = (document.getElementById("q").value||"").trim().toLowerCase();
  FILTERS.cat    = document.getElementById("f-cat").value;
  FILTERS.status = document.getElementById("f-status").value;
  FILTERS.date   = document.getElementById("f-date").value;
  FILTERS.sort   = document.getElementById("f-sort").value;
}

function filtersActive(){
  return !!FILTERS.q || FILTERS.cat!=="ALL" || FILTERS.status!=="ALL" || FILTERS.date!=="ALL";
}

function matchesFilters(t, now){
  if(FILTERS.q){
    const hay = [t.ticketCode,t.citizenName,t.phoneNumber,t.subCategory,t.location,t.description]
      .join(" ").toLowerCase();
    if(!hay.includes(FILTERS.q)) return false;
  }
  if(FILTERS.cat==="PERSONAL" && t.category!=="Personal") return false;
  if(FILTERS.cat==="ISSUE"    && t.category!=="Issue")    return false;
  if(FILTERS.status==="SOLVED"   && !t.isSolved) return false;
  if(FILTERS.status==="UNSOLVED" &&  t.isSolved) return false;
  if(FILTERS.date!=="ALL"){
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    if(FILTERS.date==="TODAY" && t.createdAt < startOfToday.getTime()) return false;
    if(FILTERS.date==="WEEK"  && t.createdAt < now - 7*86400000)      return false;
    if(FILTERS.date==="MONTH" && t.createdAt < now - 30*86400000)     return false;
  }
  return true;
}

function sortList(list){
  const byId = (a,b)=>String(a.ticketCode).localeCompare(String(b.ticketCode),undefined,{numeric:true});
  switch(FILTERS.sort){
    case "DATE_ASC": return list.sort((a,b)=>a.createdAt-b.createdAt);
    case "ID_ASC":   return list.sort(byId);
    case "ID_DESC":  return list.sort((a,b)=>byId(b,a));
    case "STATUS":   return list.sort((a,b)=>(a.isSolved?1:0)-(b.isSolved?1:0) || b.createdAt-a.createdAt);
    default:         return list.sort((a,b)=>b.createdAt-a.createdAt);
  }
}

function updateFilterChrome(){
  document.getElementById("f-clear").classList.toggle("show", filtersActive());
  document.getElementById("q-clear").classList.toggle("show", !!FILTERS.q);
  for(const id of ["f-cat","f-status","f-date"]){
    const el = document.getElementById(id);
    el.classList.toggle("active", el.value!=="ALL");
  }
  document.getElementById("f-sort").classList.toggle("active", FILTERS.sort!=="DATE_DESC");
}

function resetFilters(){
  document.getElementById("q").value="";
  document.getElementById("f-cat").value="ALL";
  document.getElementById("f-status").value="ALL";
  document.getElementById("f-date").value="ALL";
  document.getElementById("f-sort").value="DATE_DESC";
  readFilters();
  window.renderAll();
}

// ── Render ──────────────────────────────────────────────────────────────────
window.renderAll = function(){
  readFilters();
  const all = Object.values(window._ticketStore||{});
  const total=all.length, solved=all.filter(t=>t.isSolved).length, unsolved=total-solved;
  const personal=all.filter(t=>t.category==="Personal").length, issue=total-personal;
  const rate=total>0?Math.round((solved/total)*100):0;

  document.getElementById("s-total").textContent=total;
  document.getElementById("s-solved").textContent=solved;
  document.getElementById("s-rate").textContent=rate+"% Resolution Rate";
  document.getElementById("s-unsolved").textContent=unsolved;
  document.getElementById("s-pi").textContent=personal+" / "+issue;

  // The dashboard must stay on screen at ALL times — even when the ticket
  // count reaches 0 — so deleting the last ticket never blanks the page.
  document.getElementById("empty-state").style.display = "none";
  document.getElementById("dash").style.display = "";

  const now = Date.now();
  const tickets = sortList(all.filter(t=>matchesFilters(t, now)));
  updateFilterChrome();

  const tbody=document.getElementById("tbody");
  tbody.innerHTML="";
  for(const t of tickets){
    const pa = (t.assignedPa&&t.assignedPa!=="PA Assigned"&&t.assignedPa!==t.citizenName)
      ? `<div class="td-pa">PA: ${esc(t.assignedPa)}</div>` : "";
    const reports = (Array.isArray(t.entries) && t.entries.length) ? t.entries.length : 1;
    const latestAt = t.latestAt || t.createdAt;
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td style="font-size:13px;font-weight:800;color:var(--navy)">${esc(t.ticketCode)}</td>
      <td><div class="td-cit">${esc(t.citizenName)} (${reports} report${reports===1?"":"s"})</div>${pa}</td>
      <td><div class="td-phone"><div class="ph-icon"><svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="var(--navy)"/></svg></div><span class="ph-num">${esc(t.phoneNumber||"Not Available")}</span></div></td>
      <td><span class="cbadge ${t.category==="Personal"?"cat-p":"cat-i"}">${esc(t.category)}</span></td>
      <td style="font-size:12px;color:var(--nd)">${window._fmtDT?window._fmtDT(latestAt):new Date(latestAt).toLocaleString()}</td>
      <td><span class="sbadge ${t.isSolved?"s-sv":"s-us"}">${t.isSolved?"✓ Solved":"✗ Unsolved"}</span></td>
      <td><button class="vbtn" data-key="${esc(t.docKey||"")}"><svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>View Details</button></td>
    `;
    tbody.appendChild(tr);
  }

  if(tickets.length===0 && total>0){
    const tr=document.createElement("tr");
    tr.innerHTML=`<td colspan="7" class="no-match">No tickets match your current search or filters.</td>`;
    tbody.appendChild(tr);
  }

  const shown=tickets.length;
  document.getElementById("tbl-foot").textContent = filtersActive()
    ? "Showing "+shown+" of "+total+" ticket"+(total!==1?"s":"")
    : "Showing "+total+" ticket"+(total!==1?"s":"");
};

// ── Duplicate ticket merging ───────────────────────────────────────────────
// A submission joins an existing UNSOLVED ticket when phone, category and
// subject all match. Solved tickets are never merged into — a fresh report
// against a closed ticket stays its own document.
const MERGE_COOLDOWN_MS = 4000;
const mergeCooldown = new Map();
const mergingKeys   = new Set();

function ticketMergeKey(t){
  const phone = String(t.phoneNumber||"").replace(/[^0-9+]/g,"");
  if(phone.length < 7) return null;            // no reliable identity to match on
  const subj = String(t.subCategory||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!subj) return null;
  // Category is deliberately NOT part of the key: Personal and Issue tickets
  // live in the same `tickets` collection and must merge with each other when
  // the phone number and subject match.
  return phone + "|" + subj;
}

function dedupeEntries(list){
  const seen = new Set(), out = [];
  for(const e of list){
    if(!e) continue;
    const k = e.src
      ? "s:" + e.src
      : "v:" + String(e.paName||"") + "|" + String(e.description||"") + "|" + String(e.at||"");
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// A report entry may never carry an address — strip everything but the four
// allowed fields at the point where the list is about to be written.
function allowEntry(e){
  return {
    paName: String((e && e.paName) || ""),
    description: String((e && e.description) || ""),
    at: Number((e && e.at) || 0),
    src: String((e && e.src) || "")
  };
}

function reconcileTickets(){
  if(typeof window.mergeTicketEntries !== "function" ||
     typeof window.deleteTicketFromFirestore !== "function") return;

  const groups = new Map();
  for(const t of Object.values(window._ticketStore)){
    if(!t || t.isSolved) continue;             // solved never participates
    const key = ticketMergeKey(t);
    if(!key) continue;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  for(const [key, members] of groups){
    if(members.length < 2) continue;
    if(mergingKeys.has(key)) continue;
    if(Date.now() - (mergeCooldown.get(key)||0) < MERGE_COOLDOWN_MS) continue;
    mergingKeys.add(key);
    mergeCooldown.set(key, Date.now());
    mergeTicketGroup(key, members).finally(() => mergingKeys.delete(key));
  }
}

async function mergeTicketGroup(key, members){
  // The original ticket wins: earliest creation time, document id as tie-break.
  const ordered = members.slice().sort((a,b) =>
    (a.createdAt - b.createdAt) || String(a.docId).localeCompare(String(b.docId)));
  const base = ordered[0];
  const rest = ordered.slice(1);
  let allDeleted = true;

  let entries = dedupeEntries((base.entries||[]).slice());
  for(const d of rest) entries = entries.concat(d.entries||[]);
  entries = dedupeEntries(entries).sort((a,b) => (a.at||0) - (b.at||0)).map(allowEntry);

  try {
    await window.mergeTicketEntries(base.colName, base.docId, entries);
  } catch(e){
    console.warn("Ticket merge write failed:", e && e.message);
    return;                                   // nothing removed locally
  }

  // The cloud owns the merged list now — drop the duplicates locally so the
  // dashboard repaints with a single row before the deletes round-trip.
  base.entries = entries;
  base.latestAt = entries.reduce((m,e)=>Math.max(m, e.at||0), 0) || base.createdAt;
  for(const d of rest){
    delete window._ticketStore[d.docKey];
    delete window._colMap[d.docKey];
  }
  window.renderAll();

  for(const d of rest){
    try { await window.deleteTicketFromFirestore({ colName: d.colName, docId: d.docId }); }
    catch(e){ allDeleted = false; console.warn("Ticket merge delete failed:", e && e.message); }
  }
  // A clean merge needs no back-off; only a partial one waits before retrying.
  if(allDeleted) mergeCooldown.delete(key);
}

function openModal(key){
  const t=window._ticketStore[key]; if(!t) return;
  activeKey=key;
  document.getElementById("m-code").textContent=t.ticketCode;
  const catEl=document.getElementById("m-cat");
  catEl.className="cbadge "+(t.category==="Personal"?"cat-p":"cat-i");
  catEl.textContent=t.category;
  const stEl=document.getElementById("m-status");
  stEl.className="sbadge "+(t.isSolved?"s-sv":"s-us");
  stEl.textContent=t.isSolved?"✓ Solved":"✗ Unsolved";
  document.getElementById("m-name").textContent=t.citizenName;
  document.getElementById("m-phone").textContent="Phone: "+(t.phoneNumber||"Not Available");
  document.getElementById("m-loc").textContent=t.location;
  document.getElementById("m-pa").textContent="Added by: "+t.assignedPa;
  document.getElementById("m-date").textContent="Raised on: "+(window._fmtDT?window._fmtDT(t.createdAt):new Date(t.createdAt).toLocaleString());
  document.getElementById("m-desc").textContent=t.description||"No description provided.";
  const rbox=document.getElementById("m-rbox");
  if(t.isSolved&&t.resolutionNotes){rbox.style.display="";document.getElementById("m-res").textContent=t.resolutionNotes;}
  else rbox.style.display="none";
  const ban=document.getElementById("m-banner");
  const banIcon=document.getElementById("m-ban-icon");
  const banText=document.getElementById("m-ban-text");
  const banBadge=document.getElementById("m-ban-badge");
  if(t.isSolved){
    ban.className="st-banner sv-ban";
    banIcon.innerHTML='<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>';
    banText.textContent="Status: Solved";
    banBadge.className="sbadge s-sv"; banBadge.textContent="✓ Solved";
  } else {
    ban.className="st-banner us-ban";
    banIcon.innerHTML='<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
    banText.textContent="Status: Unsolved / Pending";
    banBadge.className="sbadge s-us"; banBadge.textContent="✗ Unsolved";
  }
  // Reports: every entry the PA Portal contributed, newest first — PA name,
  // the issue text it typed, and its date/time. Address/location is never
  // rendered here (it lives once, on the ticket itself), an entry with no
  // typed text renders no description line, and a lone entry that only repeats
  // the ticket's own description is hidden so nothing ever shows twice.
  const repBox  = document.getElementById("m-reports");
  const repList = document.getElementById("m-report-list");
  if(repBox && repList){
    const entries = (Array.isArray(t.entries) ? t.entries : []).slice()
      .sort((a,b) => (b.at||0) - (a.at||0));
    const repeatsDescription = entries.length === 1 &&
      String(entries[0].description||"") === String(t.description||"");
    const show = entries.length > 0 && !repeatsDescription;
    repBox.style.display = show ? "" : "none";
    repList.innerHTML = show ? entries.map((e,i) => {
      const at = e.at || t.createdAt;
      const when = window._fmtDT ? window._fmtDT(at) : new Date(at).toLocaleString();
      const desc = String(e.description||"").trim();
      return (i ? '<hr class="divider">' : '') +
        `<div class="meta-pa">${esc(e.paName || t.assignedPa || "PA Assigned")}</div>` +
        (desc ? `<div class="dtext">${esc(desc)}</div>` : '') +
        `<div class="meta-dt">${esc(when)}</div>`;
    }).join("") : "";
  }
  document.getElementById("tkt-modal").classList.add("open");
}
function closeModal(){ document.getElementById("tkt-modal").classList.remove("open"); activeKey=null; }

function confirmDel(){
  const t = activeKey ? window._ticketStore[activeKey] : null;
  if(!activeKey || !t) return;
  document.getElementById("del-text").textContent=`This will delete ticket ${t.ticketCode} from the Leader Portal and Firestore database.`;
  document.getElementById("del-ov").classList.add("open");
}
function closeDelOv(){ document.getElementById("del-ov").classList.remove("open"); }
async function doDel(){
  closeDelOv();
  const key = activeKey;
  const ticket = key ? window._ticketStore[key] : null;
  if(!key || !ticket) return;

  const info = window._colMap[key]
    || (ticket.colName && ticket.docId ? { colName: ticket.colName, docId: ticket.docId } : null);

  if(typeof window.deleteTicketFromFirestore !== "function"){
    toast("Still connecting to Firestore — please try again in a moment");
    return;
  }
  if(!info || !info.colName || !info.docId){
    toast("Ticket document reference not found — nothing was deleted");
    return;
  }

  closeModal();

  // Drop exactly this one ticket from local state and repaint, so the
  // dashboard keeps rendering with the remaining tickets.
  delete window._ticketStore[key];
  delete window._colMap[key];
  window.renderAll();

  try {
    await window.deleteTicketFromFirestore(info);
  } catch(e){
    console.error("Delete error:", e);
    // The write never reached Firestore → put the ticket back untouched.
    window._ticketStore[key] = ticket;
    window._colMap[key] = info;
    window.renderAll();
    toast("Ticket could not be deleted — it was restored");
  }
}

function openLogout(){ document.getElementById("lo-ov").classList.add("open"); }
function closeLogout(){ document.getElementById("lo-ov").classList.remove("open"); }
function doLogout(){
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
  window.location.href="login.html";
}

// expose handlers for inline onclick attributes
window.openLogout  = openLogout;
window.closeLogout = closeLogout;
window.doLogout    = doLogout;
window.closeModal  = closeModal;
window.confirmDel  = confirmDel;
window.closeDelOv  = closeDelOv;
window.doDel       = doDel;

// ── Toolbar wiring ─────────────────────────────────────────────────────────
(function wireToolbar(){
  const q = document.getElementById("q");
  let debounce = null;

  q.addEventListener("input", function(){
    clearTimeout(debounce);
    debounce = setTimeout(function(){ readFilters(); window.renderAll(); }, 120);
  });
  q.addEventListener("keydown", function(e){
    if(e.key === "Escape"){ q.value = ""; readFilters(); window.renderAll(); }
  });
  document.getElementById("q-clear").addEventListener("click", function(){
    q.value = ""; readFilters(); window.renderAll(); q.focus();
  });
  for(const id of ["f-cat","f-status","f-date","f-sort"]){
    document.getElementById(id).addEventListener("change", function(){ readFilters(); window.renderAll(); });
  }
  document.getElementById("f-clear").addEventListener("click", resetFilters);
  document.getElementById("tbody").addEventListener("click", function(e){
    const btn = e.target.closest ? e.target.closest("button[data-key]") : null;
    if(btn) openModal(btn.getAttribute("data-key"));
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "/" && document.activeElement !== q &&
       !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){
      e.preventDefault(); q.focus();
    }
  });
})();

window.renderAll();

// ── PA Login Credentials ───────────────────────────────────────────────────
// Schema matches the Leader app exactly:
//   collections: pa_credentials only (no mirror collections)
//   doc id      = phone number
//   fields      : name, paName, phone, phoneNumber, pass, password, role,
//                 status, designation, createdBy, updatedAt, id
const PA_KEY = "leaderPaCredentials";
// ── Firestore collections: this app may only ever touch these three ────────
//   admin_credentials : leader / admin sign-in records (read by login.html)
//   pa_credentials    : personal assistant records
//   tickets           : citizen tickets / grievances
// No mirror or duplicate collections are created — duplicates are forbidden.
const PA_PRIMARY = "pa_credentials";
const PA_MIRRORS = [];

let paStore = {};
const paReveal = new Set();        // ids with password currently visible
const paLocalOnly = new Set();     // created locally, not confirmed by a cloud snapshot
const paPendingDeletes = new Set(); // deleted locally, waiting for cloud confirmation
let paEditId = null;
let paCloudReady = false;
let paToastTimer = null;
let cfCb = null;

// read helpers — tolerate both spellings the app writes
function paName(t){ return String(t.name || t.paName || "").trim(); }
function paPhone(t){ return String(t.phone || t.phoneNumber || "").trim(); }
function paPass(t){ return String(t.password != null ? t.password : (t.pass || "")); }
function paStatus(t){ return String(t.status || "Active"); }
function paIsActive(t){ return !/^revoked$/i.test(paStatus(t)); }

// the exact document the Leader app stores (mirrored field pairs)
function paCloudDoc(t){
  const name = paName(t);
  const phone = paPhone(t);
  return {
    name: name,
    paName: name,
    phone: phone,
    phoneNumber: phone,
    pass: paPass(t),
    password: paPass(t),
    role: t.role || "PA",
    status: paIsActive(t) ? "Active" : "Revoked",
    designation: String(t.designation || "Personal Assistant"),
    createdBy: String(t.createdBy || "Admin Leader Portal"),
    updatedAt: Date.now(),
    id: phone
  };
}

function paLoad(){
  let raw = null;
  try { raw = localStorage.getItem(PA_KEY); } catch(e) { raw = null; }
  if(raw === null) return; // never seeded — the list only holds leader-granted credentials
  try {
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) arr.forEach(t => {
      if(!t) return;
      t.id = String(t.id || t.phone || t.phoneNumber || "").trim();
      // app schema: doc id is always the phone number — ignore legacy/local seeds
      if(/^[0-9+]{7,15}$/.test(t.id)) paStore[t.id] = t;
    });
  } catch(e) {}
}

function paSave(){
  try { localStorage.setItem(PA_KEY, JSON.stringify(Object.values(paStore))); } catch(e) {}
}

function setPaSync(text, color){
  const el = document.getElementById("pa-sync");
  if(!el) return;
  el.textContent = text;
  el.style.color = color;
}

function toast(msg){
  const el = document.getElementById("toast");
  if(!el) return;
  document.getElementById("toast-txt").textContent = msg;
  el.classList.add("show");
  clearTimeout(paToastTimer);
  paToastTimer = setTimeout(() => el.classList.remove("show"), 1900);
}

function paErr(msg){
  const el = document.getElementById("pa-err");
  if(el) el.textContent = msg || "";
}

const ICON_COPY = '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/><path d="M4 4l16 16" fill="none" stroke="#64748B" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_PENCIL = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const ICON_BLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.6 5.6l12.8 12.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

function renderPaList(){
  const list = document.getElementById("pa-list");
  const cnt  = document.getElementById("pa-count");
  const sum  = document.getElementById("pa-sum");
  if(!list) return;
  const all = Object.values(paStore)
    .sort((a,b) => paName(a).localeCompare(paName(b)));
  const active = all.filter(paIsActive).length;
  const revoked = all.length - active;
  if(cnt){
    cnt.textContent = all.length;
    cnt.style.display = all.length ? "flex" : "none";
  }
  if(sum) sum.textContent = all.length
    ? all.length + " credential" + (all.length!==1?"s":"") + " · " + active + " active" +
      (revoked ? " · " + revoked + " revoked" : "")
    : "";
  if(!all.length){
    list.innerHTML = '<div class="pa-empty">No PA credentials yet — grant access above. Credentials sync in real time with the Leader app Firestore.</div>';
    return;
  }
  list.innerHTML = all.map(t => {
    const shown = paReveal.has(t.id);
    const isActive = paIsActive(t);
    const initial = paName(t).replace(/^PA\s*/i,"").charAt(0).toUpperCase() || "?";
    const masked = "••••••••";
    return `<div class="pa-row${isActive?"":" revoked"}">
      <div class="pa-av">${esc(initial)}</div>
      <div class="pa-info">
        <div class="pa-name">${esc(paName(t))}
          <span class="sbadge ${isActive?"s-sv":"s-rv"}">${isActive?"✓ ACTIVE":"⊘ REVOKED"}</span>
        </div>
        <div class="pa-desg">${esc(t.designation||"Personal Assistant")}${t.createdBy?" · by "+esc(t.createdBy):""}</div>
        <div class="pa-cred">
          <div class="cred">
            <span class="cred-lbl">Phone</span>
            <span class="cred-val">${esc(paPhone(t)||"—")}</span>
            <button class="iconbtn" title="Copy phone" onclick="paCopy('phone','${esc(t.id)}')">${ICON_COPY}</button>
          </div>
          <div class="cred">
            <span class="cred-lbl">Password</span>
            <span class="cred-val">${shown ? esc(paPass(t)) : masked}</span>
            <button class="iconbtn" title="${shown?"Hide":"Show"} password" onclick="paTogglePw('${esc(t.id)}')">${shown?ICON_EYE_OFF:ICON_EYE}</button>
            <button class="iconbtn" title="Copy password" onclick="paCopy('password','${esc(t.id)}')">${ICON_COPY}</button>
          </div>
        </div>
      </div>
      <div class="pa-side">
        <div class="pa-tools">
          <button class="iconbtn" title="Edit details" onclick="paEdit('${esc(t.id)}')">${ICON_PENCIL}</button>
          <button class="iconbtn warn" title="${isActive?"Revoke access":"Restore access"}" onclick="paToggleStatus('${esc(t.id)}')">${ICON_BLOCK}</button>
          <button class="iconbtn danger" title="Delete credential" onclick="paAskDelete('${esc(t.id)}')">${ICON_TRASH}</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function paCopy(field, id){
  const t = paStore[id];
  if(!t) return;
  const val = field === "phone" ? paPhone(t) : paPass(t);
  const done = () => toast("Copied " + field);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(val).then(done).catch(() => paFallbackCopy(val, done));
  } else {
    paFallbackCopy(val, done);
  }
}

function paFallbackCopy(val, cb){
  const ta = document.createElement("textarea");
  ta.value = val;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch(e) { ok = false; }
  document.body.removeChild(ta);
  ok ? cb() : toast("Copy blocked by browser");
}

function openPaModal(){
  renderPaList();
  document.getElementById("pa-ov").classList.add("open");
}
function closePaModal(){
  document.getElementById("pa-ov").classList.remove("open");
  paCancelEdit();
}

function paGenerate(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%!";
  let out = "";
  for(let i=0;i<10;i++) out += chars.charAt(Math.floor(Math.random()*chars.length));
  document.getElementById("pa-pass").value = out;
  paErr("");
  toast("Password generated");
}

function paFillForm(t){
  document.getElementById("pa-name").value  = paName(t);
  document.getElementById("pa-phone").value = paPhone(t);
  document.getElementById("pa-desg").value  = t.designation || "";
  document.getElementById("pa-pass").value  = paPass(t);
  document.getElementById("pa-status").value = paIsActive(t) ? "ACTIVE" : "REVOKED";
  paEditId = t.id;
  document.getElementById("pa-save-txt").textContent = "Save Changes";
  document.getElementById("pa-cancel").style.display = "";
  paErr("");
}

function paEdit(id){
  const t = paStore[id];
  if(!t) return;
  paFillForm(t);
  document.getElementById("pa-name").focus();
}

function paCancelEdit(){
  paEditId = null;
  document.getElementById("pa-name").value  = "";
  document.getElementById("pa-phone").value = "";
  document.getElementById("pa-desg").value  = "";
  document.getElementById("pa-pass").value  = "";
  document.getElementById("pa-status").value = "ACTIVE";
  document.getElementById("pa-save-txt").textContent = "Add Credential";
  document.getElementById("pa-cancel").style.display = "none";
  paErr("");
}

function paSubmit(){
  const name = document.getElementById("pa-name").value.trim();
  const phone = document.getElementById("pa-phone").value.replace(/[\s\-().]/g, "");
  const desg = document.getElementById("pa-desg").value.trim();
  const pass = document.getElementById("pa-pass").value;
  const status = document.getElementById("pa-status").value;
  if(name.length < 2) return paErr("PA name is required (min 2 characters).");
  if(!/^[0-9+]{7,15}$/.test(phone)) return paErr("Enter a valid phone number (7–15 digits).");
  if(!pass.trim()) return paErr("Password is required — type one or click Generate.");
  paErr("");

  if(paEditId){
    const oldId = paEditId;
    const t = paStore[oldId];
    if(!t) return paCancelEdit();
    const newId = phone;
    if(newId !== oldId && paStore[newId]) return paErr("A credential with this phone number already exists.");
    delete paStore[oldId];
    paReveal.delete(oldId);
    paLocalOnly.delete(oldId);
    Object.assign(t, {
      id: newId, name, paName: name,
      phone, phoneNumber: phone,
      password: pass, pass: pass,
      designation: desg || "Personal Assistant",
      status: status === "REVOKED" ? "REVOKED" : "ACTIVE",
      role: t.role || "PA",
      createdBy: t.createdBy || "Admin Leader Portal"
    });
    delete t.createdAt;
    t.updatedAt = Date.now();
    paStore[newId] = t;
    paLocalOnly.add(newId);
    if(newId !== oldId){
      paReveal.delete(oldId);
      paPendingDeletes.add(oldId);
      paRemoveRemote(oldId);
    }
    paSave();
    paPush(newId);
    toast("Credential updated");
    paCancelEdit();
  } else {
    if(paStore[phone]) return paErr("A credential with this phone number already exists.");
    const t = {
      id: phone, name, paName: name,
      phone, phoneNumber: phone,
      password: pass, pass: pass,
      designation: desg || "Personal Assistant",
      status: status === "REVOKED" ? "REVOKED" : "ACTIVE",
      role: "PA",
      createdBy: "Admin Leader Portal",
      updatedAt: Date.now()
    };
    paStore[phone] = t;
    paLocalOnly.add(phone);
    paSave();
    paPush(phone);
    toast("Credential created — access granted");
    paCancelEdit();
  }
  renderPaList();
}

function paTogglePw(id){
  if(paReveal.has(id)) paReveal.delete(id);
  else paReveal.add(id);
  renderPaList();
}

function paToggleStatus(id){
  const t = paStore[id];
  if(!t) return;
  const wasActive = paIsActive(t);
  t.status = wasActive ? "REVOKED" : "ACTIVE";
  t.updatedAt = Date.now();
  if(wasActive) paReveal.delete(id);
  paSave();
  paPush(id);
  renderPaList();
  toast(paName(t) + (wasActive ? " access revoked" : " access restored"));
}

function paAskDelete(id){
  const t = paStore[id];
  if(!t) return;
  openConfirm("Delete PA Credential?",
    "This removes " + paName(t) + "'s login from this portal and from the pa_credentials collection in Firestore.",
    () => {
      delete paStore[id];
      paReveal.delete(id);
      paLocalOnly.delete(id);
      paPendingDeletes.add(id);
      if(paEditId === id) paCancelEdit();
      paSave();
      paRemoveRemote(id);
      renderPaList();
      toast("Credential deleted");
    });
}

function openConfirm(title, text, cb){
  document.getElementById("cf-title").textContent = title;
  document.getElementById("cf-text").textContent = text;
  cfCb = cb;
  document.getElementById("confirm-ov").classList.add("open");
}
function closeConfirm(){
  document.getElementById("confirm-ov").classList.remove("open");
  cfCb = null;
}

// ── Cloud hooks (wired by initFirestore when the SDK is ready) ────────────
function paPush(id){
  if(!window._paSet) return;
  const data = paStore[id];
  if(!data) return;
  window._paSet(id, data).catch(e => {
    console.warn("PA push failed:", e.message);
    paLocalOnly.add(id);
    setPaSync("⚠ Local only", "#FCA5A5");
  });
}

const PA_DEL_MAX = 4;
const paDelTries = new Map();

// Removes the credential from every Firestore collection and keeps retrying
// until the cloud confirms the document is gone (the other app mirrors it live).
function paRemoveRemote(id){
  if(!window._paDel){
    (window._paDelQueue = window._paDelQueue || new Set()).add(id);
    setPaSync("⟳ Deleting…", "#F5C542");
    return;
  }
  window._paDel(id).then(() => {
    paDelTries.delete(id);
    setPaSync("☁ Synced", "#4ADE80");
  }).catch(e => {
    const n = (paDelTries.get(id) || 0) + 1;
    paDelTries.set(id, n);
    console.warn("PA delete failed:", e.message);
    if(n < PA_DEL_MAX && paPendingDeletes.has(id)){
      setPaSync("⚠ Delete failed — retrying", "#FCA5A5");
      setTimeout(() => { if(paPendingDeletes.has(id)) paRemoveRemote(id); }, 2000);
    } else {
      setPaSync("⚠ Delete failed — retrying on sync", "#FCA5A5");
      toast("Firestore delete pending — will retry");
    }
  });
}

window._paHydrate = function(docs){
  if(!paCloudReady){
    paCloudReady = true;
    if(docs.length){
      // cloud already has credentials → it wins; keep pending local creations
      const pending = [...paLocalOnly]
        .map(id => paStore[id])
        .filter(t => t && /^[0-9+]{7,15}$/.test(String(t.id)));
      const dels = [...paPendingDeletes];
      paStore = {};
      docs.forEach(d => { if(dels.indexOf(d.id) === -1) paStore[d.id] = d; });
      paLocalOnly.clear();
      paPendingDeletes.clear();
      pending.forEach(t => {
        if(paStore[t.id]) return;
        paStore[t.id] = t;
        paLocalOnly.add(t.id);
        paPush(t.id);
      });
      dels.forEach(id => paRemoveRemote(id));
      paSave();
      renderPaList();
      setPaSync("☁ Synced", "#4ADE80");
      return;
    }
    // cloud empty → push leader-granted credentials held locally (no seeds exist)
    Object.keys(paStore).forEach(id => {
      if(paPendingDeletes.has(id)) return;
      paLocalOnly.add(id);
      paPush(id);
    });
    [...paPendingDeletes].forEach(id => paRemoveRemote(id));
    paPendingDeletes.clear();
    paSave();
    renderPaList();
    setPaSync("☁ Synced", "#4ADE80");
    return;
  }

  // incremental reconciliation on every snapshot
  const remoteIds = new Set(docs.map(d => d.id));
  docs.forEach(d => {
    if(paPendingDeletes.has(d.id)) return;
    paStore[d.id] = d;
    paLocalOnly.delete(d.id);
  });
  // an id we removed locally is no longer in paStore — walk the pending set instead
  [...paPendingDeletes].forEach(id => {
    if(remoteIds.has(id)) paRemoveRemote(id);   // cloud still has it → delete again
    else paPendingDeletes.delete(id);           // confirmed gone everywhere
  });
  Object.keys(paStore).forEach(id => {
    if(!remoteIds.has(id)){
      if(paLocalOnly.has(id)) paPush(id);   // not visible in the cloud yet → retry
      else delete paStore[id];              // deleted from another device
    }
  });
  paSave();
  renderPaList();
};

paLoad();
renderPaList();

(function wirePaForm(){
  const ids = ["pa-name","pa-phone","pa-desg","pa-pass"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("keydown", function(e){
      if(e.key === "Enter"){ e.preventDefault(); paSubmit(); }
      else if(e.key === "Escape" && paEditId) paCancelEdit();
    });
  });
  const ok = document.getElementById("cf-ok");
  if(ok) ok.addEventListener("click", function(){
    const cb = cfCb;
    closeConfirm();
    if(cb) cb();
  });
})();

// ── Shared state for the Firestore layer ──────────────────────────────────
window._ticketStore = {};
window._colMap      = {};
window._listeners   = [];

// ─── Firestore: live ticket listeners ─────────────────────────────────────
// The Firestore WebChannel keeps a long-poll request open for as long as the
// page lives. Lighthouse counts it as a critical request that never finishes
// and waits out its 45s limit, reporting "The page loaded too slowly to finish
// within the time limit. Results may be incomplete." Connecting only after the
// page has loaded and had a moment to go network-quiet avoids that; visitors
// see the dashboard shell first and the live tickets a moment later.
const FIRESTORE_CONNECT_DELAY_MS = 2000;

async function initFirestore(){
  // Auth guard: bounce to login.html when there is no local session
  if (window.__signedIn === false) {
    window.location.replace("login.html");
    return;
  }

  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
  const { getFirestore, collection, onSnapshot, deleteDoc, doc, setDoc, getDoc, getDocs, query, where } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

  // ─── Firebase project config (personal-assisstant-c28f1) ────────────────
  const firebaseConfig = {
    apiKey: "AIzaSyA1awCWPelB1hKFDYTdh4bxwbB5Zmw35do",
    authDomain: "personal-assisstant-c28f1.firebaseapp.com",
    databaseURL: "https://personal-assisstant-c28f1-default-rtdb.firebaseio.com",
    projectId: "personal-assisstant-c28f1",
    storageBucket: "personal-assisstant-c28f1.firebasestorage.app",
    messagingSenderId: "749776543986",
    appId: "1:749776543986:web:a4f473a0ab2c11038ab06b",
    measurementId: "G-CJD2BWX3CK"
  };
  // ─────────────────────────────────────────────────────────────────────────

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  window._db = db;

  // Tickets live in exactly one collection. This app listens to (and can only
  // ever delete from) that collection — never to mirror/duplicate ones.
  const COLLECTIONS = [ "tickets" ];

  // ── helpers ──────────────────────────────────────────────────────────────
  function norm(k) { return k.toLowerCase().replace(/[\s_\-]/g,""); }

  function flatStrings(obj) {
    const out = {};
    function walk(o) {
      for (const [k, v] of Object.entries(o)) {
        const nk = norm(k);
        if (typeof v === "string" && v.trim() && v.toLowerCase() !== "null") out[nk] = v.trim();
        else if (typeof v === "number") out[nk] = String(v);
        else if (v && typeof v === "object" && !Array.isArray(v)) walk(v);
      }
    }
    walk(obj);
    return out;
  }

  function extractCitizenName(data) {
    const fl = flatStrings(data);
    const priority = ["submittername","submitter","submittedby","submitterfullname",
      "applicantname","citizenname","clientname","callername","fullname","personname",
      "contactname","beneficiaryname","raisedby","createdby","displayname","username","name"];
    for (const p of priority) if (fl[p]) return fl[p];
    if (fl["firstname"]) return fl["lastname"] ? fl["firstname"]+" "+fl["lastname"] : fl["firstname"];
    for (const [k,v] of Object.entries(fl))
      if (k.endsWith("name") && !["file","class","app","pa"].some(x=>k.includes(x))) return v;
    return null;
  }

  function extractPhone(data) {
    const fl = flatStrings(data);
    const keys = ["submitterphone","submittermobile","phonenumber","mobilenumber","contactnumber",
      "phone","mobile","contact","cell","telephone","whatsapp","citizenphone","userphone"];
    for (const k of keys) if (fl[k]) return fl[k];
    for (const [k,v] of Object.entries(fl))
      if ((k.includes("phone")||k.includes("mobile")||k.includes("contact")) && v.length>=7) return v;
    return "";
  }

  function extractStr(data, keys) {
    for (const k of keys) {
      const v = data[k];
      if (v == null || typeof v === "object") continue;
      const s = String(v).trim();
      if (s && s.toLowerCase() !== "null") return s;
    }
    return null;
  }

  function extractPa(data, citizenName) {
    const fl = flatStrings(data);
    const paKeys = ["paname","painame","pa","assignedpa","assignedpaname","assignedto","paincharge",
      "officer","officername","incharge","assignedofficer","leader","leadername",
      "raisedbypa","raisedbypaname","raisedbyname"];
    for (const k of paKeys) if (fl[k]) return fl[k];
    const nameField = fl["name"];
    if (nameField && nameField.toLowerCase() !== (citizenName||"").toLowerCase()) return nameField;
    return "PA Assigned";
  }

  function parseTs(val) {
    if (val == null || val === "") return Date.now();
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const s = val.trim();
      if (/^\d{10,16}$/.test(s)) return Number(s);
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) return parsed;
      return Date.now();
    }
    if (val && typeof val.toMillis === "function") return val.toMillis();
    if (val && val.seconds) return val.seconds * 1000;
    return Date.now();
  }

  // Report entries: one entry per PA who raised the ticket. An entry is an
  // ALLOWLIST of exactly four fields — address/location is never carried into
  // an entry, whatever extra keys the source document happens to have.
  function parseEntries(raw, fallbackPa, fallbackDesc, fallbackAt) {
    const out = [];
    if (Array.isArray(raw)) {
      raw.forEach(e => {
        if (!e || typeof e !== "object") return;
        const at = parseTs(e.at ?? e.createdAt ?? e.timestamp ?? e.date ?? null);
        const entry = {
          paName: String(e.paName || e.pa || e.assignedPa || e.raisedBy || "").trim() || fallbackPa,
          description: String(e.description || e.desc || e.text || e.details || "").trim(),
          at: at,
          src: String(e.src || "")
        };
        out.push(entry);          // location/address keys are dropped here
      });
    }
    if (!out.length) {
      out.push({ paName: fallbackPa, description: fallbackDesc || "", at: fallbackAt, src: "" });
    }
    return out.sort((a, b) => (a.at || 0) - (b.at || 0));
  }

  function fromDoc(docId, data) {
    const rawCode = extractStr(data,["ticketCode","ticket_code","ticketId","ticket_id","code","id"]) || docId;
    const code = rawCode.startsWith("#") ? rawCode : "#"+rawCode;
    const citizenName = extractCitizenName(data) || "Constituent";
    const pa    = extractPa(data, citizenName);
    const phone = extractPhone(data);
    const rawCat = extractStr(data,["category","type","ticketType","issueCategory","requestType"]) || "Issue";
    const category = rawCat.toLowerCase().includes("personal") ? "Personal" : "Issue";
    const subCategory = extractStr(data,["subCategory","subcategory","title","subject","issueType","problem","department","topic"]) || "General Request";
    const description  = extractStr(data,["description","details","desc","message","issue","content","note","body"]) || "";
    const location     = extractStr(data,["location","area","address","ward","colony","city","constituency","place"]) || "Constituency";
    const statusStr    = extractStr(data,["status","ticketStatus","state"]) || "";
    const isSolved = data.isSolved===true || data.solved===true ||
      ["solved","resolved","closed","completed"].includes(statusStr.toLowerCase());
    const createdAt = parseTs(
      data.createdAt ?? data.createdAtMillis ?? data.createdAtMs ??
      data.timestamp ?? data.created_at ?? data.date
    );
    const resolutionNotes = extractStr(data,["resolutionNotes","resolution_notes","notes","remarks",
      "solution","actionTaken","internalNotes","adminNotes","statusNote"]) || "";
    const entries = parseEntries(data.entries, pa, description, createdAt);
    const latestAt = entries.reduce((m, e) => Math.max(m, e.at || 0), 0) || createdAt;
    return { ticketCode:code, citizenName, phoneNumber:phone, category, subCategory,
             description, location, assignedPa:pa, isSolved, createdAt, resolutionNotes,
             entries, latestAt };
  }

  function fmtDT(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2,"0");
    const h = d.getHours(); const ampm = h>=12?"PM":"AM"; const h12 = h%12||12;
    return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}, ${p(h12)}:${p(d.getMinutes())} ${ampm}`;
  }
  window._fmtDT = fmtDT;

  // ── Real-time listener ──────────────────────────────────────────────────
  let anyOk = false;

  function setFsStatus(text, color){
    const el = document.getElementById("fs-status");
    if(!el) return;
    el.textContent = text;
    el.style.color = color;
  }

  function startListening() {
    for (const unsub of window._listeners) unsub();
    window._listeners = [];
    for (const colName of COLLECTIONS) {
      try {
        const unsub = onSnapshot(collection(db, colName), snap => {
          anyOk = true;
          snap.docChanges().forEach(change => {
            const docId = change.doc.id;
            // One store entry per Firestore document, keyed by its unique
            // document path. The derived ticket code is display data only —
            // it can repeat across documents, so it must never be the identity.
            const key = docKeyOf(colName, docId);
            if (change.type === "removed") {
              delete window._ticketStore[key];
              delete window._colMap[key];
            } else {
              const data  = change.doc.data ? change.doc.data() : {};
              const t = fromDoc(docId, data);
              t.docKey = key;
              t.colName = colName;
              t.docId   = docId;
              // Stamp each entry with the document it came from so a merge can
              // be replayed safely without ever duplicating a report.
              t.entries.forEach((e, i) => { if (!e.src) e.src = key + "#" + i; });
              window._ticketStore[key] = t;
              window._colMap[key] = { colName, docId };
            }
          });
          window.renderAll();
          reconcileTickets();
          setFsStatus(
            Object.keys(window._ticketStore).length
              ? "🟢 Firestore Connected"
              : "🟢 Connected · waiting for tickets",
            "#16a34a"
          );
        }, err => {
          console.warn("Firestore error:", colName, err.message);
          if (!anyOk) {
            setFsStatus("🔴 Firestore blocked — check security rules", "#dc2626");
          }
        });
        window._listeners.push(unsub);
      } catch(e) { console.warn("Listener failed:", colName, e); }
    }
  }

  // Deletes exactly ONE Firestore document: the selected ticket's own
  // document (collection + document id). It never touches a collection, a
  // parent document, the dashboard, or any other ticket/PA/user record.
  window.deleteTicketFromFirestore = async function(target){
    let info = null;
    if(target && typeof target === "object" && target.colName && target.docId){
      info = target;                                   // explicit {colName, docId}
    } else {
      const t = window._ticketStore[target];
      info = window._colMap[target]
        || (t && t.colName && t.docId ? { colName: t.colName, docId: t.docId } : null);
    }
    if(!info || !info.colName || !info.docId){
      throw new Error("No Firestore document reference for ticket " + target);
    }
    await deleteDoc(doc(db, info.colName, info.docId));
  };

  // Writes the merged report list onto an existing ticket document. Only the
  // `entries` field is touched — the original ticket code, citizen details and
  // status stay exactly as they were.
  window.mergeTicketEntries = async function(colName, docId, entries){
    await setDoc(doc(db, colName, docId), { entries: entries }, { merge: true });
  };

  startListening();

  // ── PA credentials: real-time sync with the Leader app collections ──────
  // Writes the app's exact document shape to pa_credentials + its mirrors.
  window._paSet = async (id, data) => {
    const payload = paCloudDoc(data);
    await setDoc(doc(db, PA_PRIMARY, id), payload);
    const rs = await Promise.allSettled(
      PA_MIRRORS.map(c => setDoc(doc(db, c, id), payload))
    );
    rs.forEach((r, i) => {
      if(r.status === "rejected")
        console.warn("PA mirror write skipped:", PA_MIRRORS[i], r.reason && r.reason.message);
    });
  };
  window._paDel = async id => {
    const cols = [PA_PRIMARY, ...PA_MIRRORS];

    // 1) delete the document itself (doc id = phone number)
    for (const c of cols){
      try { await deleteDoc(doc(db, c, id)); }
      catch(e){ console.warn("PA delete:", c, e.message); }
    }

    // 2) purge any doc that merely stores this phone in its fields
    for (const c of cols){
      for (const f of ["phone", "phoneNumber"]){
        try {
          const snap = await getDocs(query(collection(db, c), where(f, "==", id)));
          if(snap.size) await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        } catch(e){ console.warn("PA purge:", c, f, e.message); }
      }
    }

    // 3) verify — throw so the caller retries until the cloud is really clean
    const left = [];
    for (const c of cols){
      try {
        const s = await getDoc(doc(db, c, id));
        if(s.exists()) left.push(c);
        for (const f of ["phone", "phoneNumber"]){
          const snap = await getDocs(query(collection(db, c), where(f, "==", id)));
          if(snap.size && left.indexOf(c) === -1) left.push(c);
        }
      } catch(e){ left.push(c + " (verify failed: " + e.message + ")"); }
    }
    if(left.length) throw new Error("still present in " + left.join(", "));
  };

  // flush deletes queued before the SDK finished loading
  const queuedDeletes = window._paDelQueue;
  window._paDelQueue = null;
  if(queuedDeletes && queuedDeletes.size) queuedDeletes.forEach(id => paRemoveRemote(id));
  setPaSync("⟳ Syncing…", "#F5C542");
  try {
    onSnapshot(collection(db, PA_PRIMARY),
      snap => {
        const docs = snap.docs.map(d => Object.assign({ id: d.id }, d.data() || {}));
        window._paHydrate(docs);
      },
      err => {
        console.warn("pa_credentials listener error:", err.message);
        setPaSync("⚠ Local only", "#FCA5A5");
      }
    );
  } catch(e) {
    console.warn("pa_credentials listener failed:", e.message);
    setPaSync("⚠ Local only", "#FCA5A5");
  }
}

(function scheduleFirestoreConnect(){
  const connect = () => setTimeout(() => {
    initFirestore().catch(e => console.warn("Firestore init failed:", e));
  }, FIRESTORE_CONNECT_DELAY_MS);
  if(document.readyState === "complete") connect();
  else window.addEventListener("load", connect, {once:true});
})();
