// SMART NURSE - Firebase-ready single-page app
// Replace firebaseConfig values with your Firebase project's Web App config.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};
const firebaseConfigured = !Object.values(firebaseConfig).some(v => String(v).includes("REPLACE_WITH"));
let db = null;
try { if(firebaseConfigured){ const app=initializeApp(firebaseConfig); db=getFirestore(app); } } catch(e){ console.warn("Firebase not configured; using local storage",e); }

const SHIFT = {
 M:{label:"صباحي",color:"#1565C0",group:["MORNING"],price:"M"},
 D:{label:"نهاري",color:"#0277BD",group:["MORNING"],price:"M"},
 E:{label:"مسائي",color:"#E65100",group:["AFTERNOON"],price:"E"},
 N:{label:"ليلي",color:"#4A148C",group:["NIGHT"],price:"N"},
 L:{label:"12 ساعة",color:"#005B5C",group:["MORNING","AFTERNOON"],price:"L"},
 LD:{label:"24 ساعة",color:"#880E4F",group:["MORNING","AFTERNOON","NIGHT"],price:"LD"},
 X:{label:"إجازة مطلوبة",color:"#546E7A",group:[],price:null},
 AL:{label:"إجازة سنوية",color:"#2E7D32",group:[],price:null},
 SL:{label:"إجازة مرضية",color:"#B71C1C",group:[],price:null},
 TR:{label:"تدريب",color:"#37474F",group:[],price:null}
};
const $ = id => document.getElementById(id);
const state = {user:null, nurses:[], schedules:{}, published:{}, month:new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0"), masterMonth:new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0"), activeDay:null, activeNurse:null, individualDay:null, cell:null};
const WD = ["أح","اث","ثل","أر","خم","جم","سب"];
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const uid = () => "n_"+Math.random().toString(36).slice(2,10);
const key = (nurseId, month=state.month) => `${month}_${nurseId}`;
const monthParts = m => m.split("-").map(Number);
const daysIn = m => {const [y,mo]=monthParts(m);return new Date(y,mo,0).getDate()};
const dateName = (m,d) => {const [y,mo]=monthParts(m);return new Date(y,mo-1,d).toLocaleDateString("ar-EG",{weekday:"long"});};
const monthTitle = m => {const [y,mo]=monthParts(m);return `${AR_MONTHS[mo-1]} ${y}`;};
const escapeHTML = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add("hidden"),2800);}
function saveLocal(){localStorage.setItem("smartNurseData",JSON.stringify({nurses:state.nurses,schedules:state.schedules,published:state.published}));}
function loadLocal(){try{const d=JSON.parse(localStorage.getItem("smartNurseData")||"{}");state.nurses=d.nurses||[];state.schedules=d.schedules||{};state.published=d.published||{};}catch{}}
async function saveCloud(path,id,data){if(!db){saveLocal();return;}await setDoc(doc(db,path,id),data,{merge:true});}
async function loadCloud(){
 if(!db)return;
 try{
  const [ns,ss,ps]=await Promise.all([getDocs(collection(db,"nurses")),getDocs(collection(db,"nurseSchedules")),getDocs(collection(db,"publishedRosters"))]);
  if(!ns.empty)state.nurses=ns.docs.map(d=>({uid:d.id,...d.data()}));
  if(!ss.empty){state.schedules={};ss.docs.forEach(d=>state.schedules[d.id]=d.data().days||{});}
  if(!ps.empty){state.published={};ps.docs.forEach(d=>state.published[d.id]=d.data());}
  saveLocal();
 }catch(e){console.error(e);showToast("تعذر تحميل بيانات Firebase، يتم استخدام البيانات المحلية");}
}
async function persistNurse(n){await saveCloud("nurses",n.uid,n);}
async function persistSchedule(nurseId,month){await saveCloud("nurseSchedules",key(nurseId,month),{nurseId,month,days:state.schedules[key(nurseId,month)]||{},updatedAt:Date.now(),status:"submitted"});}
async function persistPublished(month){await saveCloud("publishedRosters",month,{month,published:true,roster:buildMaster(month),publishedAt:Date.now()});}
function getSchedule(nurseId,month=state.month){const k=key(nurseId,month);if(!state.schedules[k])state.schedules[k]={};return state.schedules[k];}
function countShifts(nurseId,month=state.month){return Object.keys(getSchedule(nurseId,month)).filter(d=>getSchedule(nurseId,month)[d]).length;}
function currentNurse(){return state.nurses.find(n=>n.uid===state.user?.uid);}
function changeMonth(delta,which="nurse"){let m=which==="nurse"?state.month:state.masterMonth;let [y,mo]=monthParts(m);mo+=delta;if(mo<1){mo=12;y--}if(mo>12){mo=1;y++}m=`${y}-${String(mo).padStart(2,"0")}`;if(which==="nurse")state.month=m;else state.masterMonth=m;renderAll();}
function login(code){
 if(code==="ADMIN123"){state.user={uid:"admin",name:"رئيسة التمريض",role:"Admin"};showApp();return true;}
 const n=state.nurses.find(x=>x.code===code&&x.active!==false);
 if(!n)return false;state.user={uid:n.uid,name:n.name,role:"Nurse"};showApp();return true;
}
function showApp(){
 $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");$("headerName").textContent=state.user.name;
 const admin=state.user.role==="Admin";$("adminView").classList.toggle("hidden",!admin);$("nurseView").classList.toggle("hidden",admin);
 $("shiftCounter").textContent=admin?"لوحة الإدارة":`${countShifts(state.user.uid)} شيفت`;
 if(admin){renderNurses();renderMaster();fillIndividualSelect();}else{renderAll();}
}
function logout(){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginCode").value="";state.user=null;}
function renderAll(){if(!state.user||state.user.role!=="Nurse")return;renderCalendar("calendar",state.user.uid,state.month,false);$("monthLabel").textContent=monthTitle(state.month);$("shiftCounter").textContent=`${countShifts(state.user.uid)} شيفت`;renderLegend();renderSalary();renderStats();renderProfile();$("viewMasterFromNurse").classList.toggle("hidden",!state.published[state.month]);}
function renderLegend(){$("legend").innerHTML=Object.entries(SHIFT).map(([code,s])=>`<span class="legend-chip" style="background:${s.color}">${code} · ${s.label}</span>`).join("");}
function renderCalendar(target,nurseId,month,adminMode){
 const root=$(target);if(!root)return;const [y,mo]=monthParts(month),first=new Date(y,mo-1,1).getDay(),total=daysIn(month),schedule=getSchedule(nurseId,month);
 let html=WD.map((d,i)=>`<div class="weekday ${i===5||i===6?'weekend':''}">${d}</div>`).join("");
 for(let i=0;i<first;i++)html+=`<div class="day-empty"></div>`;
 for(let d=1;d<=total;d++){const code=schedule[d],s=SHIFT[code],dow=new Date(y,mo-1,d).getDay();html+=`<div class="day-cell ${dow===5||dow===6?'weekend':''}" data-day="${d}" style="${s?`background:${s.color};border-color:${s.color}`:''}" aria-label="اليوم ${d}"><span class="day-number" style="${s?'color:#fff':''}">${d}</span>${s?`<span class="day-code">${code}</span>`:''}</div>`;}
 root.innerHTML=html;
 root.querySelectorAll(".day-cell").forEach(cell=>{
  let timer=null,long=false;const d=Number(cell.dataset.day);
  cell.addEventListener("pointerdown",()=>{long=false;timer=setTimeout(()=>{long=true;if(getSchedule(nurseId,month)[d]){delete getSchedule(nurseId,month)[d];afterScheduleChange(nurseId,month,adminMode);showToast("تم مسح الشيفت");}},600);});
  ["pointerup","pointerleave","pointercancel"].forEach(ev=>cell.addEventListener(ev,()=>clearTimeout(timer)));
  cell.addEventListener("contextmenu",e=>{e.preventDefault();if(getSchedule(nurseId,month)[d]){delete getSchedule(nurseId,month)[d];afterScheduleChange(nurseId,month,adminMode);}});
  cell.addEventListener("click",()=>{if(!long)openShiftModal(nurseId,month,d,adminMode);});
 });
}
function afterScheduleChange(nurseId,month,adminMode){saveLocal();if(db)persistSchedule(nurseId,month).catch(console.error);if(adminMode){renderCalendar("individualCalendar",nurseId,month,true);renderMaster();}else renderAll();}
function openShiftModal(nurseId,month,day,adminMode){state.activeNurse=nurseId;state.activeDay=day;state.activeMonth=month;state.activeAdmin=adminMode;$("modalTitle").textContent=`اختر شيفت يوم ${day}/${monthParts(month)[1]}`;$("shiftChoices").innerHTML=Object.entries(SHIFT).map(([code,s])=>`<button class="shift-choice" data-code="${code}" style="background:${s.color}">${code}<small>${s.label}</small></button>`).join("");$("shiftChoices").querySelectorAll("button").forEach(b=>b.onclick=()=>{getSchedule(nurseId,month)[day]=b.dataset.code;closeModal("shiftModal");afterScheduleChange(nurseId,month,adminMode);});$("clearShift").onclick=()=>{delete getSchedule(nurseId,month)[day];closeModal("shiftModal");afterScheduleChange(nurseId,month,adminMode);};openModal("shiftModal");}
function openModal(id){$(id).classList.remove("hidden");}
function closeModal(id){$(id).classList.add("hidden");}
function renderSalary(){
 const n=currentNurse(),s=getSchedule(n.uid),prices=n.prices||{},totals={};let total=0;
 Object.values(s).forEach(code=>{const shift=SHIFT[code];if(!shift?.price)return;const p=Number(prices[shift.price]??prices[code]??0);totals[code]??={count:0,price:p,sum:0,label:shift.label};totals[code].count++;totals[code].sum+=p;total+=p;});
 $("salaryTotal").textContent=`${total.toLocaleString("ar-EG")} ج.م`;
 $("salaryDetails").innerHTML=`<table class="data-table"><thead><tr><th>الشيفت</th><th>العدد</th><th>سعر الشيفت</th><th>الإجمالي</th></tr></thead><tbody>${Object.entries(totals).map(([c,v])=>`<tr><td><b>${c}</b> - ${v.label}</td><td>${v.count}</td><td>${v.price} ج.م</td><td><b>${v.sum} ج.م</b></td></tr>`).join("")||'<tr><td colspan="4" class="text-center text-slate-400">لا توجد شيفتات مدفوعة مسجلة</td></tr>'}<tr><td colspan="3"><b>الإجمالي</b></td><td><b>${total} ج.م</b></td></tr></tbody></table>`;
}
function renderStats(){const s=getSchedule(state.user.uid),entries=Object.entries(SHIFT).map(([c,v])=>({c,label:v.label,count:Object.values(s).filter(x=>x===c).length,color:v.color}));$("statsGrid").innerHTML=entries.map(x=>`<div class="stat-card"><strong style="color:${x.color}">${x.count}</strong><span>${x.c} · ${x.label}</span></div>`).join("");}
function renderProfile(){const n=currentNurse();$("nurseProfile").innerHTML=[["الاسم",n.name],["كود الدخول",n.code],["الصفة",n.role==="Senior"?"ممرض سنيور":"ممرض Staff"],["القسم",n.department||"ICU"],["الحالة",n.active===false?"معطل":"نشط"]].map(([a,b])=>`<div class="flex justify-between gap-3 border-b border-slate-100 py-3"><span class="text-slate-500">${a}</span><b>${escapeHTML(b)}</b></div>`).join("");}
function renderNurses(){
 $("nursesTable").innerHTML=state.nurses.map(n=>`<tr><td><b>${escapeHTML(n.name)}</b></td><td dir="ltr">${escapeHTML(n.code)}</td><td><span class="role-pill ${n.role==="Senior"?"":"staff"}">${n.role==="Senior"?"Senior":"Staff"}</span></td><td class="text-xs">M/D: ${n.prices?.M??0} · E: ${n.prices?.E??0} · N: ${n.prices?.N??0}<br>L: ${n.prices?.L??0} · LD: ${n.prices?.LD??0}</td><td>${n.active===false?"<span class='text-red-600'>معطل</span>":"<span class='text-emerald-700'>نشط</span>"}</td><td><button class="mini-btn" data-edit="${n.uid}">تعديل</button><button class="mini-btn" data-toggle="${n.uid}">${n.active===false?"تفعيل":"تعطيل"}</button><button class="mini-btn danger" data-delete="${n.uid}">حذف</button></td></tr>`).join("")||'<tr><td colspan="6" class="text-center text-slate-400">لا يوجد ممرضون. اضغط تعبئة بيانات تجريبية للبدء.</td></tr>';
 $("nursesTable").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editNurse(b.dataset.edit));
 $("nursesTable").querySelectorAll("[data-toggle]").forEach(b=>b.onclick=async()=>{const n=state.nurses.find(n=>n.uid===b.dataset.toggle);n.active=n.active===false;saveLocal();await persistNurse(n).catch(console.error);renderNurses();fillIndividualSelect();showToast(n.active?"تم تفعيل الحساب":"تم تعطيل الحساب");});
 $("nursesTable").querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const n=state.nurses.find(n=>n.uid===b.dataset.delete);if(!confirm(`حذف ${n.name}؟ سيتم حذف ملفه من قائمة الفريق فقط.`))return;state.nurses=state.nurses.filter(x=>x.uid!==n.uid);saveLocal();if(db)await deleteDoc(doc(db,"nurses",n.uid)).catch(console.error);renderNurses();fillIndividualSelect();});
}
function openNurseForm(n=null){$("nurseForm").reset();$("editUid").value=n?.uid||"";$("nurseModalTitle").textContent=n?"تعديل بيانات الممرض":"إضافة ممرض";$("nurseName").value=n?.name||"";$("nurseCode").value=n?.code||"";$("nurseRole").value=n?.role||"Staff";$("nurseActive").value=String(n?.active!==false);$("priceM").value=n?.prices?.M??250;$("priceE").value=n?.prices?.E??250;$("priceN").value=n?.prices?.N??350;$("priceL").value=n?.prices?.L??500;$("priceLD").value=n?.prices?.LD??900;openModal("nurseModal");}
function editNurse(id){openNurseForm(state.nurses.find(n=>n.uid===id));}
async function handleNurseSave(e){e.preventDefault();const oldId=$("editUid").value;const code=$("nurseCode").value.trim();if(state.nurses.some(n=>n.code===code&&n.uid!==oldId)){showToast("كود الدخول مستخدم بالفعل");return;}const n={uid:oldId||uid(),name:$("nurseName").value.trim(),code,role:$("nurseRole").value,active:$("nurseActive").value==="true",department:"ICU",prices:{M:+$("priceM").value||0,E:+$("priceE").value||0,N:+$("priceN").value||0,L:+$("priceL").value||0,LD:+$("priceLD").value||0},updatedAt:Date.now()};if(oldId)state.nurses=state.nurses.map(x=>x.uid===oldId?n:x);else state.nurses.push(n);saveLocal();await persistNurse(n).catch(e=>{console.error(e);showToast("حُفظ محليًا، راجع اتصال Firebase");});closeModal("nurseModal");renderNurses();fillIndividualSelect();showToast("تم حفظ بيانات الممرض");}
function fillIndividualSelect(){const sel=$("individualNurse");if(!sel)return;const previous=sel.value;sel.innerHTML=state.nurses.filter(n=>n.active!==false).map(n=>`<option value="${n.uid}">${escapeHTML(n.name)} (${n.role})</option>`).join("");if(state.nurses.some(n=>n.uid===previous))sel.value=previous;renderIndividual();}
function renderIndividual(){const id=$("individualNurse").value;if(!id)return;renderCalendar("individualCalendar",id,state.masterMonth,true);}
function buildMaster(month){
 const result={};for(let d=1;d<=daysIn(month);d++){result[d]={MORNING:{senior:[],staff:[]},AFTERNOON:{senior:[],staff:[]},NIGHT:{senior:[],staff:[]}};for(const n of state.nurses.filter(x=>x.active!==false)){const code=getSchedule(n.uid,month)[d],s=SHIFT[code];if(!s)continue;for(const group of s.group){const target=result[d][group][n.role==="Senior"?"senior":"staff"];if(!target.includes(n.uid))target.push(n.uid);}}}return result;
}
function renderMaster(){
 $("masterMonth").textContent=monthTitle(state.masterMonth);const roster=buildMaster(state.masterMonth),published=!!state.published[state.masterMonth];let html=published?'<div class="published-banner">تم اعتماد ونشر جدول هذا الشهر</div>':"";
 html+='<table class="master-table"><thead><tr><th rowspan="2" class="date-col">التاريخ</th><th colspan="5" class="period-morning">MORNING</th><th colspan="5" class="period-afternoon">AFTERNOON</th><th colspan="5" class="period-night">NIGHT</th></tr><tr>';
 for(const period of ["MORNING","AFTERNOON","NIGHT"])for(let i=0;i<5;i++)html+=`<th class="${i===0?'senior-cell':''}">${i===0?"Senior":`Staff ${i}`}</th>`;
 html+="</tr></thead><tbody>";
 for(let d=1;d<=daysIn(state.masterMonth);d++){
  const [y,mo]=monthParts(state.masterMonth),date=new Date(y,mo-1,d),weekend=[5,6].includes(date.getDay());
  html+=`<tr><td class="date-col ${weekend?'weekend-date':''}">${d}/${mo}/${y}<br><small>${dateName(state.masterMonth,d)}</small></td>`;
  for(const period of ["MORNING","AFTERNOON","NIGHT"]){
   const group=roster[d][period],sen=group.senior,staff=group.staff;
   html+=`<td class="senior-cell ${sen.length!==1?'deficit':''}" data-period="${period}" data-day="${d}" data-kind="senior">${sen.map(id=>nameOf(id)).join(" / ")||"—"}</td>`;
   for(let slot=0;slot<4;slot++){const ids=slot===3?staff.slice(3):staff.slice(slot,slot+1);html+=`<td class="staff-cell ${slot===0&&staff.length<1?'deficit':''}" data-period="${period}" data-day="${d}" data-kind="staff" data-slot="${slot}">${ids.length?ids.map(id=>`<span class="staff-name ${state.user?.uid===id?'mine':''}">${escapeHTML(nameOf(id))}</span>`).join(''):"—"}</td>`;}
  }html+="</tr>";
 }html+="</tbody></table>";$("masterRoster").innerHTML=html;
 $("masterRoster").querySelectorAll("[data-period]").forEach(cell=>cell.onclick=()=>openCellEditor(Number(cell.dataset.day),cell.dataset.period,cell.dataset.kind,Number(cell.dataset.slot)));
}
function nameOf(id){return state.nurses.find(n=>n.uid===id)?.name||"غير معروف";}
function openCellEditor(day,period,kind,slot){state.cell={day,period,kind,slot,month:state.masterMonth};$("cellModalTitle").textContent=`تعديل ${period} · يوم ${day}`;const opts=state.nurses.filter(n=>n.active!==false&&(kind==="senior"?n.role==="Senior":n.role!=="Senior"));$("cellNurseSelect").innerHTML=opts.map(n=>`<option value="${n.uid}">${escapeHTML(n.name)}</option>`).join("");openModal("cellModal");}
function alterCell(remove=false){
 const c=state.cell;if(!c)return;const id=$("cellNurseSelect").value;if(!id){showToast("أضف ممرضين أولًا");return;}const s=getSchedule(id,c.month),d=c.day,group=c.period;const current=s[d],groupCodes={MORNING:["M","D","L","LD"],AFTERNOON:["E","L","LD"],NIGHT:["N","LD"]};
 if(remove){if(current&&SHIFT[current].group.includes(group))delete s[d];}
 else {const desired=groupCodes[group].includes(current)?current:({MORNING:"M",AFTERNOON:"E",NIGHT:"N"})[group];s[d]=desired;}
 saveLocal();if(db)persistSchedule(id,c.month).catch(console.error);closeModal("cellModal");renderMaster();showToast(remove?"تم حذف الشيفت":"تم تحديث شيفت الممرض");
}
async function seedData(){
 if(!confirm("إضافة مجموعة ممرضين وشيفتات تجريبية؟ يمكن تعديلها أو حذفها لاحقًا."))return;
 const names=[["ياسمين","Senior"],["شروق","Senior"],["دعاء","Staff"],["محمد خالد","Staff"],["شهد حسن","Staff"],["مريم حسن","Staff"],["نور","Staff"],["بسمة","Staff"],["سارة رشدي","Staff"],["مصطفى","Staff"],["أميرة","Staff"],["شيماء سعد","Staff"]];
 for(let i=0;i<names.length;i++){const [name,role]=names[i];let n=state.nurses.find(x=>x.name===name);if(!n)n={uid:uid(),name,code:`N${String(i+1).padStart(3,"0")}`,role,active:true,department:"ICU",prices:{M:250,E:250,N:350,L:500,LD:900}};state.nurses=state.nurses.filter(x=>x.uid!==n.uid);state.nurses.push(n);}
 const codes=["M","E","N","L","LD","D","M","E","N","X","AL","TR"];
 for(const n of state.nurses){const s=getSchedule(n.uid,state.masterMonth);for(let d=1;d<=daysIn(state.masterMonth);d++){if(!s[d]&&((d+state.nurses.indexOf(n))%4===0))s[d]=codes[(d+state.nurses.indexOf(n))%codes.length];}}
 saveLocal();if(db){try{const batch=writeBatch(db);state.nurses.forEach(n=>batch.set(doc(db,"nurses",n.uid),n,{merge:true}));await batch.commit();for(const n of state.nurses)await persistSchedule(n.uid,state.masterMonth);}catch(e){console.error(e);showToast("حُفظت البيانات محليًا، تعذر رفع بعضها إلى Firebase");}}
 renderNurses();fillIndividualSelect();renderMaster();showToast("تم تجهيز بيانات التجربة");
}
async function submitRoster(){const n=currentNurse();await persistSchedule(n.uid,state.month).catch(console.error);$("submitStatus").textContent="تم إرسال الروستر لرئيسة التمريض.";showToast("تم إرسال الجدول");}
async function publishRoster(){state.published[state.masterMonth]={published:true,at:Date.now()};saveLocal();try{await persistPublished(state.masterMonth);}catch(e){console.error(e);} $("publishStatus").textContent="تم اعتماد الجدول ونشره للممرضين.";renderMaster();showToast("تم اعتماد الجدول");}
function showMasterForNurse(){state.masterMonth=state.month;renderMaster();state.user._viewingMaster=true;document.querySelectorAll("#nurseTabs .tab").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));$("tab-roster").classList.remove("hidden");$("calendar").classList.add("hidden");$("legend").classList.add("hidden");$("submitRoster").classList.add("hidden");$("viewMasterFromNurse").classList.add("hidden");let old=$("nurseMasterWrap");if(!old){old=document.createElement("div");old.id="nurseMasterWrap";old.className="master-wrap mt-4";$("tab-roster").querySelector(".panel").appendChild(old);}old.classList.remove("hidden");const previous=$("masterRoster");old.innerHTML=previous?.innerHTML||"";old.querySelectorAll("[data-period]").forEach(c=>c.onclick=null);if(!old.innerHTML)old.innerHTML="<p class='p-4'>لا يوجد جدول منشور.</p>";}
function setupEvents(){
 $("loginForm").addEventListener("submit",e=>{e.preventDefault();const ok=login($("loginCode").value.trim());$("loginError").classList.toggle("hidden",ok);if(!ok)$("loginError").textContent="كود الدخول غير صحيح أو الحساب غير نشط.";});
 $("logoutBtn").onclick=logout;$("settingsLogout").onclick=logout;$("closeModal").onclick=()=>closeModal("shiftModal");$("closeNurseModal").onclick=()=>closeModal("nurseModal");$("cancelNurse").onclick=()=>closeModal("nurseModal");$("closeCellModal").onclick=()=>closeModal("cellModal");
 document.querySelectorAll(".modal-backdrop").forEach(b=>b.onclick=()=>b.parentElement.classList.add("hidden"));
 $("nurseTabs").querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("#nurseTabs .tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".tab-panel").forEach(p=>p.classList.toggle("hidden",p.id!==`tab-${b.dataset.tab}`));});
 $("adminTabs").querySelectorAll("[data-admin-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("#adminTabs .tab").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".admin-panel").forEach(p=>p.classList.toggle("hidden",p.id!==`admin-${b.dataset.adminTab}`));if(b.dataset.adminTab==="master")renderMaster();});
 $("prevMonth").onclick=()=>changeMonth(-1);$("nextMonth").onclick=()=>changeMonth(1);$("masterPrev").onclick=()=>changeMonth(-1,"admin");$("masterNext").onclick=()=>changeMonth(1,"admin");
 $("submitRoster").onclick=submitRoster;$("viewMasterFromNurse").onclick=showMasterForNurse;$("addNurseBtn").onclick=()=>openNurseForm();$("nurseForm").onsubmit=handleNurseSave;$("seedBtn").onclick=seedData;$("publishBtn").onclick=publishRoster;$("adminExport").onclick=()=>window.print();$("printMaster").onclick=()=>window.print();$("individualNurse").onchange=renderIndividual;$("cellAdd").onclick=()=>alterCell(false);$("cellRemove").onclick=()=>alterCell(true);
}
loadLocal();setupEvents();renderLegend();loadCloud().then(()=>{if(state.user?.role==="Admin")showApp();});
