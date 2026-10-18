import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,arrayUnion,collection,query,where,orderBy,limit,onSnapshot,getDocs,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const hue = n => [...String(n)].reduce((a, c) => a + c.charCodeAt(0) * 13, 0) % 360;
const av = n => `<div class="av" style="background:hsl(${hue(n)},50%,42%)">${esc((n || "?").trim()[0] || "?").toUpperCase()}</div>`;
const hm = ts => ts ? ts.toDate().toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}) : "";
const MAIL = "@conecta.app", CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newId = () => Array.from({length: 8}, () => CH[Math.floor(Math.random() * CH.length)]).join("");
const COLORS = ["#00a884", "#128c7e", "#5865f2", "#e0567a", "#f5a623", "#9b6bff", "#2f9bff", "#4b4f58"];
let me = null, cur = null, unsubs = [], unsubMsgs = null, busy = false, scanner = null;
const S = {tab: "chats", chats: [], st: []};
const err = t => $("#err").textContent = t || "";

/* ---------- Tema claro/escuro ---------- */
try { document.documentElement.dataset.theme = localStorage.getItem("th") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"); } catch {}
function theme() {
  const d = document.documentElement, n = d.dataset.theme === "dark" ? "light" : "dark";
  d.dataset.theme = n; try { localStorage.setItem("th", n); } catch {}
}
$("#bTheme").onclick = $("#bTheme0").onclick = theme;

/* ---------- Login e cadastro ---------- */
function tab(entrar) {
  $("#fIn").hidden = !entrar; $("#fUp").hidden = entrar;
  $("#tabIn").classList.toggle("on", entrar); $("#tabUp").classList.toggle("on", !entrar); err();
}
$("#tabIn").onclick = () => tab(true);
$("#tabUp").onclick = () => tab(false);

$("#fUp").onsubmit = async e => {
  e.preventDefault(); err(); busy = true;
  const name = $("#upName").value.trim(), token = $("#upToken").value.trim(), pw = $("#upPw").value;
  try {
    let cred, id;
    for (let i = 0; i < 5 && !cred; i++) {
      id = newId();
      try { cred = await createUserWithEmailAndPassword(auth, id.toLowerCase() + MAIL, pw); }
      catch (x) { if (x.code !== "auth/email-already-in-use") throw x; }
    }
    try { await setDoc(doc(db, "users", cred.user.uid), {name, publicId: id, token, createdAt: serverTimestamp()}); }
    catch (x) { await cred.user.delete(); throw {code: x.code === "permission-denied" ? "token" : (x.code || x.message)}; }
    await enter(cred.user);
  } catch (x) {
    err(x.code === "token" ? "Token inválido, ou as regras do Firestore ainda não foram publicadas."
      : x.code === "auth/weak-password" ? "A senha precisa ter 6 ou mais caracteres."
      : x.code === "auth/operation-not-allowed" ? "Ative o login por E-mail/senha no Firebase (Authentication)."
      : x.code === "auth/unauthorized-domain" ? "Adicione este domínio em Authentication > Configurações > Domínios autorizados."
      : "Erro: " + (x.code || x.message));
  }
  busy = false;
};
$("#fIn").onsubmit = async e => {
  e.preventDefault(); err();
  try { await signInWithEmailAndPassword(auth, $("#inId").value.trim().toLowerCase() + MAIL, $("#inPw").value); }
  catch { err("ID ou senha incorretos."); }
};
onAuthStateChanged(auth, u => { if (busy) return; u ? enter(u) : leave(); });
$("#bOut").onclick = () => signOut(auth);

async function enter(u) {
  const s = await getDoc(doc(db, "users", u.uid));
  if (!s.exists()) { await signOut(auth); return err("Conta sem perfil."); }
  me = {uid: u.uid, ...s.data()};
  $("#auth").hidden = true; $("#app").hidden = false;
  $("#meAv").innerHTML = av(me.name);
  $("#meName").textContent = me.name + (me.admin ? " ★ admin" : ""); $("#meId").textContent = "ID: " + me.publicId;
  unsubs = [
    onSnapshot(query(collection(db, "chats"), where("members", "array-contains", me.uid)), s => { S.chats = s.docs.map(d => ({id: d.id, ...d.data()})); renderList(); }),
    onSnapshot(query(collection(db, "statuses"), where("viewers", "array-contains", me.uid)), s => {
      const lim = Date.now() - 864e5;      // status valem por 24 horas
      S.st = s.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.at || x.at.toMillis() > lim); renderList();
    })
  ];
  renderList();
}
function leave() {
  unsubs.forEach(f => f()); unsubs = []; unsubMsgs && unsubMsgs();
  me = cur = null; S.chats = []; S.st = []; $("#app").hidden = true; $("#auth").hidden = false;
}

/* ---------- Abas e lista ---------- */
$$("#rail [data-t]").forEach(b => b.onclick = () => { S.tab = b.dataset.t; $("#app").classList.remove("inchat"); renderList(); });
$("#bAdd").onclick = () => ({chats: addPersonModal, groups: newGroup, status: postStatus}[S.tab])();
const title = c => c.type === "group" ? c.name : c.names[c.members.find(m => m !== me.uid)];

function renderList() {
  if (!me) return;
  $$("#rail [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
  $("#bAdd").title = {chats: "Adicionar pessoa", groups: "Novo grupo", status: "Novo status"}[S.tab];
  const L = $("#chats"); L.innerHTML = "";
  if (S.tab === "status") return renderStatus(L);
  const g = S.tab === "groups";
  const ds = S.chats.filter(c => (c.type === "group") === g).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  if (!ds.length) L.innerHTML = `<p class="empty">${g ? "Nenhum grupo ainda. Toque em ＋ para criar." : "Nenhuma conversa ainda. Toque em ＋ para adicionar alguém."}</p>`;
  ds.forEach(c => {
    const b = document.createElement("button"); b.className = "ci" + (cur?.id === c.id ? " on" : "");
    b.innerHTML = av(title(c)) + `<div><b>${esc(title(c))}</b><small>${esc(c.last || "Diga olá")}</small></div><time>${hm(c.updatedAt)}</time>`;
    b.onclick = () => openChat(c); L.append(b);
  });
}

/* ---------- Chat em tempo real ---------- */
function openChat(c) {
  cur = c; unsubMsgs && unsubMsgs();
  const g = c.type === "group";
  $("#chHead").innerHTML = av(title(c)) + `<div class="grow"><b>${esc(title(c))}</b><small>${g ? esc(Object.values(c.names).join(", ")) : ""}</small></div>`;
  $("#bMem").hidden = !(g && c.owner === me.uid);
  $("#app").classList.add("inchat"); renderList();
  unsubMsgs = onSnapshot(query(collection(db, "chats", c.id, "messages"), orderBy("at")), s => {
    const box = $("#msgs"); box.innerHTML = "";
    s.docs.forEach(d => {
      const m = d.data(), mine = m.from === me.uid, p = document.createElement("div");
      p.className = "m" + (mine ? " me" : "");
      p.innerHTML = (g && !mine ? `<span class="who" style="color:hsl(${hue(m.name)},60%,60%)">${esc(m.name || "")}</span>` : "") + `<span>${esc(m.text)}</span><time>${hm(m.at)}</time>`;
      box.append(p);
    });
    box.scrollTop = box.scrollHeight;
  });
}
$("#fSend").onsubmit = async e => {
  e.preventDefault();
  const t = $("#txt").value.trim(); if (!t || !cur) return;
  $("#txt").value = "";
  const b = writeBatch(db);
  b.set(doc(collection(db, "chats", cur.id, "messages")), {from: me.uid, name: me.name, text: t, at: serverTimestamp()});
  b.update(doc(db, "chats", cur.id), {last: (cur.type === "group" ? me.name + ": " : "") + t, updatedAt: serverTimestamp()});
  await b.commit();
};
$("#bBack").onclick = () => $("#app").classList.remove("inchat");

/* ---------- Janelas ---------- */
const modal = h => { $("#box").innerHTML = h + '<button id="mx">Fechar</button>'; $("#modal").hidden = false; $("#mx").onclick = closeModal; };
async function closeModal() {
  if (scanner) { try { await scanner.stop(); } catch {} scanner = null; }
  $("#modal").hidden = true;
}
$("#bQr").onclick = () => {
  modal('<h3>Meu QR</h3><canvas id="qr"></canvas><p>ID: <b>' + me.publicId + '</b></p>');
  QRCode.toCanvas($("#qr"), "CONECTA:" + me.publicId, {width: 220});
};
const findUsers = async ids => {
  const clean = [...new Set(ids.map(x => x.replace("CONECTA:", "").trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  if (!clean.length) return [];
  return (await getDocs(query(collection(db, "users"), where("publicId", "in", clean)))).docs;
};

/* ---------- Adicionar pessoa (QR ou ID) ---------- */
function addPersonModal() {
  modal('<h3>Adicionar pessoa</h3><div id="reader"></div><input id="addId" placeholder="Ou digite o ID" maxlength="8"><button id="go">Adicionar</button><p id="addErr"></p>');
  $("#go").onclick = () => addPerson($("#addId").value);
  try {
    scanner = new Html5Qrcode("reader");
    scanner.start({facingMode: "environment"}, {fps: 10, qrbox: 200}, t => addPerson(t), () => {}).catch(() => {});
  } catch {}
}
async function addPerson(raw) {
  const msg = t => $("#addErr") && ($("#addErr").textContent = t);
  const [o] = await findUsers([raw]);
  if (!o) return msg("ID não encontrado.");
  if (o.id === me.uid) return msg("Esse é o seu próprio ID.");
  const cid = [me.uid, o.id].sort().join("_"), names = {[me.uid]: me.name, [o.id]: o.data().name};
  await setDoc(doc(db, "chats", cid), {members: [me.uid, o.id], names}, {merge: true});
  await closeModal(); S.tab = "chats"; openChat({id: cid, members: [me.uid, o.id], names});
}

/* ---------- Grupos ---------- */
function newGroup() {
  modal('<h3>Novo grupo</h3><input id="gn" maxlength="30" placeholder="Nome do grupo"><textarea id="gm" placeholder="IDs das pessoas, separados por vírgula (opcional)"></textarea><button id="go">Criar grupo</button><p id="addErr"></p>');
  $("#go").onclick = async () => {
    const name = $("#gn").value.trim(); if (!name) return $("#addErr").textContent = "Dê um nome ao grupo.";
    const found = await findUsers($("#gm").value.split(/[,\s]+/));
    const members = [me.uid, ...found.map(d => d.id).filter(i => i !== me.uid)], names = {[me.uid]: me.name};
    found.forEach(d => names[d.id] = d.data().name);
    const ref = doc(collection(db, "chats")), data = {type: "group", name, owner: me.uid, members, names, last: "", updatedAt: serverTimestamp()};
    await setDoc(ref, data); await closeModal(); S.tab = "groups"; openChat({id: ref.id, ...data});
  };
}
$("#bMem").onclick = () => {
  modal('<h3>Adicionar ao grupo</h3><input id="addId" placeholder="ID da pessoa" maxlength="8"><button id="go">Adicionar</button><p id="addErr"></p>');
  $("#go").onclick = async () => {
    const [o] = await findUsers([$("#addId").value]); if (!o) return $("#addErr").textContent = "ID não encontrado.";
    if (cur.members.includes(o.id)) return $("#addErr").textContent = "Essa pessoa já está no grupo.";
    await updateDoc(doc(db, "chats", cur.id), {members: arrayUnion(o.id), ["names." + o.id]: o.data().name});
    cur.members.push(o.id); cur.names[o.id] = o.data().name; await closeModal(); openChat(cur);
  };
};

/* ---------- Status (valem por 24 horas) ---------- */
function renderStatus(L) {
  const by = {}; S.st.forEach(x => (by[x.uid] = by[x.uid] || []).push(x));
  for (const u in by) by[u].sort((a, b) => (a.at?.seconds || 9e9) - (b.at?.seconds || 9e9));
  const row = (name, label, sub, list) => {
    const b = document.createElement("button"); b.className = "ci";
    b.innerHTML = `<div class="ring ${list ? "on" : ""}">${av(name)}</div><div><b>${esc(label)}</b><small>${sub}</small></div>`;
    b.onclick = () => list ? viewStatus(list, 0) : postStatus(); L.append(b);
  };
  const mine = by[me.uid];
  row(me.name, "Meu status", mine ? mine.length + " nas últimas 24 h" : "Toque para postar", mine);
  const others = Object.keys(by).filter(u => u !== me.uid);
  L.insertAdjacentHTML("beforeend", '<div class="lbl">Recentes</div>');
  if (!others.length) L.insertAdjacentHTML("beforeend", '<p class="empty">Nenhum status dos seus contatos agora.</p>');
  others.forEach(u => { const l = by[u]; row(l[0].name, l[0].name, hm(l[l.length - 1].at) || "agora", l); });
}
function viewStatus(list, i) {
  const x = list[i], sv = $("#sv");
  if (!x) { sv.hidden = true; return; }
  sv.hidden = false; sv.style.background = x.color;
  sv.innerHTML = `<div class="svb">${list.map((_, k) => `<i class="${k <= i ? "f" : ""}"></i>`).join("")}</div>
    <div class="svh">${av(x.name)}<div class="grow"><b>${esc(x.name)}</b><small style="color:#fffc">${hm(x.at)}</small></div>${x.uid === me.uid ? '<button id="svd">Apagar</button>' : ""}<button id="svx">✕</button></div><p>${esc(x.text)}</p>`;
  sv.onclick = e => {
    if (e.target.id === "svx") sv.hidden = true;
    else if (e.target.id === "svd") { deleteDoc(doc(db, "statuses", x.id)); sv.hidden = true; }
    else viewStatus(list, i + 1);
  };
}
function postStatus() {
  let col = COLORS[0];
  modal(`<h3>Novo status</h3><textarea id="stx" maxlength="140" placeholder="O que você está pensando?"></textarea><div class="sw">${COLORS.map((c, i) => `<i data-c="${c}" class="${i ? "" : "on"}" style="background:${c}"></i>`).join("")}</div><button id="spub">Publicar</button>`);
  $$(".sw i").forEach(i => i.onclick = () => { col = i.dataset.c; $$(".sw i").forEach(k => k.classList.toggle("on", k === i)); });
  $("#spub").onclick = async () => {
    const text = $("#stx").value.trim(); if (!text) return;
    const viewers = [...new Set([me.uid, ...S.chats.filter(c => c.type !== "group").map(c => c.members.find(m => m !== me.uid))])];
    await setDoc(doc(collection(db, "statuses")), {uid: me.uid, name: me.name, text, color: col, at: serverTimestamp(), viewers});
    await closeModal(); S.tab = "status"; renderList();
  };
}
