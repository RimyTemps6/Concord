import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,addDoc,arrayUnion,collection,query,where,orderBy,onSnapshot,getDocs,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const hue = n => [...String(n)].reduce((a, c) => a + c.charCodeAt(0) * 13, 0) % 360;
const img = s => typeof s === "string" && s.startsWith("data:image/") && !s.includes('"') ? s : "";   // só aceita imagem em base64
/* avatar: foto se existir, senão a inicial do nome */
const avP = (photo, n, cls = "") => photo
  ? `<div class="av ${cls}"><img src="${photo}" alt=""></div>`
  : `<div class="av ${cls}" style="background:hsl(${hue(n)},50%,42%)">${esc((n || "?").trim()[0] || "?").toUpperCase()}</div>`;
const av = n => avP("", n);
const avU = (uid, n, cls) => avP(P[uid]?.photo, P[uid]?.name || n, cls);
const hm = ts => ts ? ts.toDate().toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}) : "";
const MAIL = "@conecta.app", CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newId = () => Array.from({length: 8}, () => CH[Math.floor(Math.random() * CH.length)]).join("");
const COLORS = ["#00a884", "#128c7e", "#5865f2", "#e0567a", "#f5a623", "#9b6bff", "#2f9bff", "#4b4f58"];
let me = null, cur = null, unsubs = [], unsubMsgs = null, busy = false, scanner = null;
let P = {};                                   // cache de perfis: uid -> {name, photo, bio, publicId}
const S = {tab: "chats", chats: [], st: []};
const err = t => $("#err").textContent = t || "";

/* ---------- PWA: instalar no celular/computador ---------- */
if (matchMedia("(display-mode:standalone)").matches || navigator.standalone) document.documentElement.dataset.app = "1";
let installEv = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEv = e; });
addEventListener("appinstalled", () => { document.documentElement.dataset.app = "1"; installEv = null; });
document.addEventListener("click", async e => {
  if (!e.target.closest(".inst")) return;
  if (installEv) { installEv.prompt(); await installEv.userChoice; installEv = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal("<h3>Instalar o Conecta</h3><p>" + (ios
    ? "No iPhone/iPad (Safari): toque em <b>Compartilhar</b> (□↑) e depois em <b>Adicionar à Tela de Início</b>."
    : "No menu do navegador (⋮), toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.") + "</p>");
});
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

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

function paintMe() {
  $("#meAv").innerHTML = avP(img(me.photo), me.name);
  $("#meName").textContent = me.name + (me.admin ? " ★ admin" : ""); $("#meId").textContent = "ID: " + me.publicId;
}
async function enter(u) {
  const s = await getDoc(doc(db, "users", u.uid));
  if (!s.exists()) { await signOut(auth); return err("Conta sem perfil."); }
  me = {uid: u.uid, ...s.data()}; me.photo = img(me.photo);
  P[me.uid] = {name: me.name, photo: me.photo, bio: me.bio || "", publicId: me.publicId};
  $("#auth").hidden = true; $("#app").hidden = false;
  paintMe();
  unsubs = [
    onSnapshot(query(collection(db, "chats"), where("members", "array-contains", me.uid)), s => {
      S.chats = s.docs.map(d => ({id: d.id, ...d.data()}));
      if (cur) cur = S.chats.find(c => c.id === cur.id) || cur;
      renderList(); headChat();
    }),
    onSnapshot(query(collection(db, "statuses"), where("viewers", "array-contains", me.uid)), s => {
      const lim = Date.now() - 864e5;      // status valem por 24 horas
      S.st = s.docs.map(d => ({id: d.id, ...d.data()})).filter(x => !x.at || x.at.toMillis() > lim); renderList();
    }),
    // chamadas recebidas
    onSnapshot(query(collection(db, "calls"), where("callee", "==", me.uid), where("status", "==", "ringing")), s => {
      s.docChanges().forEach(ch => {
        const d = ch.doc.data();
        if (ch.type === "removed") { if (inc?.id === ch.doc.id) hideInc(); return; }
        if (ch.type !== "added") return;
        if (d.at && Date.now() - d.at.toMillis() > 60000) return;        // chamada velha
        if (call || inc) { updateDoc(ch.doc.ref, {status: "declined"}).catch(() => {}); return; }   // já em outra chamada
        showInc(ch.doc.id, d);
      });
    })
  ];
  renderList();
}
function leave() {
  unsubs.forEach(f => f()); unsubs = []; unsubMsgs && unsubMsgs();
  call && finish(call, 0); hideInc();
  me = cur = null; P = {}; S.chats = []; S.st = []; $("#app").hidden = true; $("#auth").hidden = false;
}

/* ---------- Perfis (nome + foto) em cache ---------- */
async function load(uids, force) {
  const need = [...new Set(uids)].filter(u => u && (force || !P[u]));
  if (!need.length) return;
  await Promise.all(need.map(async u => {
    if (!P[u]) P[u] = {};
    try {
      const s = await getDoc(doc(db, "users", u));
      if (s.exists()) { const d = s.data(); P[u] = {name: d.name, photo: img(d.photo), bio: d.bio || "", publicId: d.publicId}; }
    } catch {}
  }));
  if (me) { renderList(); headChat(); }
}

/* ---------- Abas e lista ---------- */
$$("#rail [data-t]").forEach(b => b.onclick = () => { S.tab = b.dataset.t; $("#app").classList.remove("inchat"); renderList(); });
$("#bAdd").onclick = () => ({chats: addPersonModal, groups: newGroup, status: postStatus}[S.tab])();
const other = c => c.members.find(m => m !== me.uid);
const title = c => c.type === "group" ? c.name : (P[other(c)]?.name || c.names[other(c)]);

function renderList() {
  if (!me) return;
  $$("#rail [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === S.tab));
  $("#bAdd").title = {chats: "Adicionar pessoa", groups: "Novo grupo", status: "Novo status"}[S.tab];
  load([...S.chats.filter(c => c.type !== "group").map(other), ...S.st.map(x => x.uid)]);
  const L = $("#chats"); L.innerHTML = "";
  if (S.tab === "status") return renderStatus(L);
  const g = S.tab === "groups";
  const ds = S.chats.filter(c => (c.type === "group") === g).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  if (!ds.length) L.innerHTML = `<p class="empty">${g ? "Nenhum grupo ainda. Toque em ＋ para criar." : "Nenhuma conversa ainda. Toque em ＋ para adicionar alguém."}</p>`;
  ds.forEach(c => {
    const b = document.createElement("button"); b.className = "ci" + (cur?.id === c.id ? " on" : "");
    b.innerHTML = (g ? av(title(c)) : avU(other(c), title(c))) + `<div><b>${esc(title(c))}</b><small>${esc(c.last || "Diga olá")}</small></div><time>${hm(c.updatedAt)}</time>`;
    b.onclick = () => openChat(c); L.append(b);
  });
}

/* ---------- Chat em tempo real ---------- */
function headChat() {
  if (!cur || !me) return;
  const g = cur.type === "group", o = g ? null : other(cur);
  $("#chHead").innerHTML = (g ? av(title(cur)) : avU(o, title(cur))) + `<div class="grow"><b>${esc(title(cur))}</b><small>${g ? esc(Object.values(cur.names).join(", ")) : "toque para ver o perfil"}</small></div>`;
  $("#bMem").hidden = !(g && cur.owner === me.uid);
  $("#bCall").hidden = $("#bVid").hidden = g;
}
$("#chHead").onclick = () => { if (cur && cur.type !== "group") showProfile(other(cur)); };
function openChat(c) {
  cur = c; unsubMsgs && unsubMsgs();
  const g = c.type === "group";
  if (!g) load([other(c)], true);
  headChat();
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
  const s = scanner; scanner = null;
  if (s) { try { await s.stop(); } catch {} try { s.clear(); } catch {} }
  $("#modal").hidden = true;
}
const say = t => { const e = $("#addErr"); if (e) e.textContent = t; };

/* ---------- Meu QR ---------- */
$("#bQr").onclick = () => {
  modal(`<h3>Meu QR</h3><canvas id="qr" width="240" height="240"></canvas><p>ID: <b>${esc(me.publicId)}</b></p><button id="cp">Copiar ID</button><small>Peça para a outra pessoa escanear este QR em "＋ Adicionar pessoa".</small>`);
  try {
    if (!window.QRCode) throw 0;
    QRCode.toCanvas($("#qr"), "CONECTA:" + me.publicId, {width: 240, margin: 2, color: {dark: "#000000", light: "#ffffff"}}, e => { if (e) $("#qr").replaceWith("QR indisponível. Use o ID."); });
  } catch { $("#qr").replaceWith("Não consegui gerar o QR (sem internet?). Use o ID."); }
  $("#cp").onclick = async () => { try { await navigator.clipboard.writeText(me.publicId); $("#cp").textContent = "Copiado ✓"; } catch {} };
};
const findUsers = async ids => {
  const clean = [...new Set(ids.map(x => x.replace(/CONECTA:/i, "").trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  if (!clean.length) return [];
  return (await getDocs(query(collection(db, "users"), where("publicId", "in", clean)))).docs;
};

/* ---------- Adicionar pessoa (QR ou ID) ---------- */
function addPersonModal() {
  modal('<h3>Adicionar pessoa</h3><button id="bScan">📷 Escanear QR com a câmera</button><div id="reader" hidden></div><button id="bFile">🖼️ Ler QR de uma foto</button><input id="fQr" type="file" accept="image/*" hidden><input id="addId" placeholder="Ou digite o ID" maxlength="8" autocapitalize="characters" autocomplete="off"><button id="go">Adicionar</button><p id="addErr"></p>');
  $("#go").onclick = () => addPerson($("#addId").value);
  $("#bScan").onclick = startScan;
  $("#bFile").onclick = () => $("#fQr").click();
  $("#fQr").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!window.Html5Qrcode) return say("Leitor de QR não carregou. Digite o ID.");
    try { const s = new Html5Qrcode("reader"); const t = await s.scanFile(f, false); try { s.clear(); } catch {} addPerson(t); }
    catch { say("Não encontrei um QR nessa foto."); }
  };
}
async function startScan() {
  if (scanner) return;
  if (!window.Html5Qrcode) return say("Leitor de QR não carregou. Digite o ID.");
  if (!navigator.mediaDevices?.getUserMedia) return say("A câmera só funciona em site seguro (https).");
  $("#reader").hidden = false; $("#bScan").hidden = true;
  const s = scanner = new Html5Qrcode("reader"); let lock = false;
  try {
    await s.start({facingMode: "environment"},
      {fps: 10, qrbox: (w, h) => { const q = Math.floor(Math.min(w, h) * .7); return {width: q, height: q}; }},
      async t => { if (lock) return; lock = true; if (!await addPerson(t)) setTimeout(() => lock = false, 2000); },
      () => {});
  } catch {
    if (scanner === s) scanner = null;
    $("#reader").hidden = true; $("#bScan").hidden = false;
    say("Não consegui abrir a câmera. Permita o acesso nas configurações do navegador ou digite o ID.");
  }
}
async function addPerson(raw) {
  try {
    const [o] = await findUsers([raw]);
    if (!o) { say("ID não encontrado."); return false; }
    if (o.id === me.uid) { say("Esse é o seu próprio ID."); return false; }
    const cid = [me.uid, o.id].sort().join("_"), names = {[me.uid]: me.name, [o.id]: o.data().name};
    await setDoc(doc(db, "chats", cid), {members: [me.uid, o.id], names}, {merge: true});
    P[o.id] = {name: o.data().name, photo: img(o.data().photo), bio: o.data().bio || "", publicId: o.data().publicId};
    await closeModal(); S.tab = "chats"; openChat({id: cid, members: [me.uid, o.id], names});
    return true;
  } catch (x) { say("Erro: " + (x.code || x.message)); return false; }
}

/* ---------- Grupos ---------- */
function newGroup() {
  modal('<h3>Novo grupo</h3><input id="gn" maxlength="30" placeholder="Nome do grupo"><textarea id="gm" placeholder="IDs das pessoas, separados por vírgula (opcional)"></textarea><button id="go">Criar grupo</button><p id="addErr"></p>');
  $("#go").onclick = async () => {
    const name = $("#gn").value.trim(); if (!name) return say("Dê um nome ao grupo.");
    const found = await findUsers($("#gm").value.split(/[,\s]+/));
    const members = [me.uid, ...found.map(d => d.id).filter(i => i !== me.uid)], names = {[me.uid]: me.name};
    found.forEach(d => names[d.id] = d.data().name);
    const ref = doc(collection(db, "chats")), data = {type: "group", name, owner: me.uid, members, names, last: "", updatedAt: serverTimestamp()};
    await setDoc(ref, data); await closeModal(); S.tab = "groups"; openChat({id: ref.id, ...data});
  };
}
$("#bMem").onclick = () => {
  modal('<h3>Adicionar ao grupo</h3><input id="addId" placeholder="ID da pessoa" maxlength="8" autocapitalize="characters"><button id="go">Adicionar</button><p id="addErr"></p>');
  $("#go").onclick = async () => {
    const [o] = await findUsers([$("#addId").value]); if (!o) return say("ID não encontrado.");
    if (cur.members.includes(o.id)) return say("Essa pessoa já está no grupo.");
    await updateDoc(doc(db, "chats", cur.id), {members: arrayUnion(o.id), ["names." + o.id]: o.data().name});
    cur.members.push(o.id); cur.names[o.id] = o.data().name; await closeModal(); openChat(cur);
  };
};

/* ---------- Status (valem por 24 horas) ---------- */
function renderStatus(L) {
  const by = {}; S.st.forEach(x => (by[x.uid] = by[x.uid] || []).push(x));
  for (const u in by) by[u].sort((a, b) => (a.at?.seconds || 9e9) - (b.at?.seconds || 9e9));
  const row = (uid, name, label, sub, list) => {
    const b = document.createElement("button"); b.className = "ci";
    b.innerHTML = `<div class="ring ${list ? "on" : ""}">${avU(uid, name)}</div><div><b>${esc(label)}</b><small>${sub}</small></div>`;
    b.onclick = () => list ? viewStatus(list, 0) : postStatus(); L.append(b);
  };
  const mine = by[me.uid];
  row(me.uid, me.name, "Meu status", mine ? mine.length + " nas últimas 24 h" : "Toque para postar", mine);
  const others = Object.keys(by).filter(u => u !== me.uid);
  L.insertAdjacentHTML("beforeend", '<div class="lbl">Recentes</div>');
  if (!others.length) L.insertAdjacentHTML("beforeend", '<p class="empty">Nenhum status dos seus contatos agora.</p>');
  others.forEach(u => { const l = by[u]; row(u, l[0].name, P[u]?.name || l[0].name, hm(l[l.length - 1].at) || "agora", l); });
}
function viewStatus(list, i) {
  const x = list[i], sv = $("#sv");
  if (!x) { sv.hidden = true; return; }
  sv.hidden = false; sv.style.background = x.color;
  sv.innerHTML = `<div class="svb">${list.map((_, k) => `<i class="${k <= i ? "f" : ""}"></i>`).join("")}</div>
    <div class="svh">${avU(x.uid, x.name)}<div class="grow"><b>${esc(P[x.uid]?.name || x.name)}</b><small style="color:#fffc">${hm(x.at)}</small></div>${x.uid === me.uid ? '<button id="svd">Apagar</button>' : ""}<button id="svx">✕</button></div><p>${esc(x.text)}</p>`;
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
    const viewers = [...new Set([me.uid, ...S.chats.filter(c => c.type !== "group").map(other)])];
    await setDoc(doc(collection(db, "statuses")), {uid: me.uid, name: me.name, text, color: col, at: serverTimestamp(), viewers});
    await closeModal(); S.tab = "status"; renderList();
  };
}

/* ---------- Perfil: foto, banner (inclusive GIF animado), nome e recado ---------- */
const loadImg = f => new Promise((ok, no) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = no; i.src = u; });
const readURL = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
/* recorta/reduz a imagem; GIF de até 600 KB mantém a animação */
async function fit(file, w, h, q, keepGif) {
  if (!file.type.startsWith("image/")) throw 0;
  if (keepGif && file.type === "image/gif" && file.size <= 600e3) return {url: await readURL(file)};
  const i = await loadImg(file), c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"), k = Math.max(w / i.width, h / i.height);
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  x.drawImage(i, (w - i.width * k) / 2, (h - i.height * k) / 2, i.width * k, i.height * k);
  return {url: c.toDataURL("image/jpeg", q), note: file.type === "image/gif" ? "GIF acima de 600 KB: usei só o primeiro quadro." : ""};
}
async function showProfile(uid) {
  const own = uid === me.uid;
  if (!own) await load([uid], true);
  const p = P[uid] || {};
  let photo = img(p.photo), banner = "", bchg = false;
  const paint = () => {
    $("#pAv").innerHTML = avP(photo, own ? ($("#pName")?.value || p.name) : p.name, "xl");
    $("#pBan").style.backgroundImage = banner ? `url("${banner}")` : "";
  };
  if (own) modal(`<div class="pb" id="pBan"></div><div class="pavw" id="pAv"></div>
    <input id="pName" maxlength="20" placeholder="Seu nome" value="${esc(p.name)}">
    <textarea id="pBio" maxlength="80" placeholder="Recado (opcional)">${esc(p.bio)}</textarea>
    <div class="row2"><button id="bPh">📷 Trocar foto</button><button id="bBn">🖼️ Trocar banner</button></div>
    <div class="row2"><button id="bPhX" class="ghost">Remover foto</button><button id="bBnX" class="ghost">Remover banner</button></div>
    <small>O banner aceita foto ou GIF animado (até 600 KB).</small>
    <input id="fPh" type="file" accept="image/*" hidden><input id="fBn" type="file" accept="image/*" hidden>
    <button id="pSave">Salvar perfil</button><button class="inst">📲 Instalar app</button><p id="addErr"></p>`);
  else modal(`<div class="pb" id="pBan"></div><div class="pavw" id="pAv"></div><div><b style="font-size:18px">${esc(p.name)}</b><small>ID: ${esc(p.publicId)}</small></div>${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}`);
  paint();
  getDoc(doc(db, "banners", uid)).then(s => { if (s.exists() && !bchg) { banner = img(s.data().img); paint(); } }).catch(() => {});
  if (!own) return;
  $("#pName").oninput = paint;
  $("#bPh").onclick = () => $("#fPh").click();
  $("#bBn").onclick = () => $("#fBn").click();
  $("#bPhX").onclick = () => { photo = ""; paint(); };
  $("#bBnX").onclick = () => { banner = ""; bchg = true; paint(); };
  $("#fPh").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = (await fit(f, 160, 160, .82, false)).url; paint(); say(""); } catch { say("Não consegui ler essa imagem."); }
  };
  $("#fBn").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await fit(f, 900, 300, .8, true); banner = r.url; bchg = true; paint(); say(r.note || ""); } catch { say("Não consegui ler essa imagem."); }
  };
  $("#pSave").onclick = async () => {
    const name = $("#pName").value.trim(), bio = $("#pBio").value.trim();
    if (!name) return say("O nome não pode ficar vazio.");
    $("#pSave").disabled = true; say("Salvando…");
    try {
      await updateDoc(doc(db, "users", me.uid), {name, bio, photo});
      if (bchg) { if (banner) await setDoc(doc(db, "banners", me.uid), {img: banner, at: serverTimestamp()}); else await deleteDoc(doc(db, "banners", me.uid)); }
      Object.assign(me, {name, bio, photo}); P[me.uid] = {name, photo, bio, publicId: me.publicId};
      paintMe(); renderList(); headChat(); await closeModal();
    } catch (x) { $("#pSave").disabled = false; say("Erro ao salvar: " + (x.code || x.message) + " (as regras novas já foram publicadas?)"); }
  };
}
$("#bProf").onclick = $("#me").onclick = () => showProfile(me.uid);

/* ---------- Chamadas de voz e vídeo (WebRTC, 1 a 1) ---------- */
// STUN do Google + TURN público gratuito (reserva para redes que bloqueiam conexão direta).
// Para chamadas 100% confiáveis em qualquer rede, troque o TURN por um seu (ex.: Metered, Twilio, coturn).
const ICE = {iceServers: [
  {urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]},
  {urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject"}
]};
let call = null, inc = null, ring = null;

function beep(on) {
  if (ring) { clearInterval(ring.i); ring.c.close().catch(() => {}); ring = null; }
  if (!on) return;
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const play = () => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 440; g.gain.value = .15; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .4); navigator.vibrate?.(300); };
    play(); ring = {c, i: setInterval(play, 1500)};
  } catch {}
}
const media = v => navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: v ? {facingMode: "user"} : false});
const setSt = t => { const e = $("#cst"); if (e) e.textContent = t; };

function mk(id, peer, video, stream, role) {
  const pc = new RTCPeerConnection(ICE);
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  const c = {id, pc, stream, peer, video, role, unsubs: [], pend: [], out: [], remote: false, ready: role === "callee", over: false};
  pc.onicecandidate = e => {
    if (!e.candidate) return;
    const x = JSON.stringify(e.candidate.toJSON());
    c.ready ? sendC(c, x) : c.out.push(x);
  };
  pc.ontrack = e => { const v = $("#rv"); v.srcObject = e.streams[0]; v.play?.().catch(() => {}); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected" && !c.t0) {
      c.t0 = Date.now(); clearTimeout(c.ringT);
      c.tm = setInterval(() => { const s = Math.floor((Date.now() - c.t0) / 1000); setSt(String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0")); }, 1000);
      setSt("00:00");
    }
    if (pc.connectionState === "failed") { setSt("Falha na conexão"); hang(); }
  };
  return c;
}
const sendC = (c, x) => addDoc(collection(db, "calls", c.id, "candidates"), {from: me.uid, c: x}).catch(() => {});
function flush(c) { c.pend.splice(0).forEach(x => c.pc.addIceCandidate(x).catch(() => {})); }
function watch(c) {
  c.unsubs.push(onSnapshot(doc(db, "calls", c.id), async s => {
    const d = s.data(); if (!d || c.over) return;
    if (c.role === "caller" && d.answer && !c.got) {
      c.got = true; setSt("Conectando…");
      try { await c.pc.setRemoteDescription(d.answer); c.remote = true; flush(c); } catch { hang(); }
    }
    if (d.status === "ended" || d.status === "declined") { setSt(d.status === "declined" ? "Chamada recusada" : "Chamada encerrada"); finish(c, 900); }
  }));
  c.unsubs.push(onSnapshot(collection(db, "calls", c.id, "candidates"), s => s.docChanges().forEach(ch => {
    if (ch.type !== "added") return;
    const d = ch.doc.data(); if (d.from === me.uid) return;
    const x = JSON.parse(d.c);
    c.remote ? c.pc.addIceCandidate(x).catch(() => {}) : c.pend.push(x);
  })));
}
function ui(name, uid, video) {
  $("#call").className = video ? "" : "voice"; $("#call").hidden = false;
  $("#cwho").innerHTML = avU(uid, name, "xl") + `<b>${esc(name)}</b><small id="cst"></small>`;
  $("#lv").srcObject = video ? call.stream : null;
  $("#cMute").classList.remove("off"); $("#cCam").classList.remove("off"); $("#cCam").hidden = !video;
}
async function startCall(video) {
  if (call || inc || !cur || cur.type === "group") return;
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return alert("Chamadas precisam de um navegador atual e de site seguro (https).");
  const peer = other(cur), name = title(cur);
  let stream;
  try { stream = await media(video); } catch { return alert("Permita o acesso ao microfone" + (video ? " e à câmera" : "") + " para ligar."); }
  const ref = doc(collection(db, "calls"));
  const c = call = mk(ref.id, peer, video, stream, "caller");
  ui(name, peer, video); setSt("Chamando…"); beep(true);
  try {
    const offer = await c.pc.createOffer(); await c.pc.setLocalDescription(offer);
    await setDoc(ref, {caller: me.uid, callee: peer, callerName: me.name, calleeName: name, video, status: "ringing", offer: {type: offer.type, sdp: offer.sdp}, at: serverTimestamp()});
    c.ready = true; c.out.splice(0).forEach(x => sendC(c, x));
    watch(c);
    c.ringT = setTimeout(() => { if (!c.t0) { setSt("Sem resposta"); hang(); } }, 45000);
  } catch (x) { finish(c, 0); alert("Não consegui iniciar a chamada: " + (x.code || x.message)); }
}
function showInc(id, d) {
  inc = {id, ...d};
  load([d.caller]);
  $("#incAv").innerHTML = avU(d.caller, d.callerName, "xl");
  $("#incT").textContent = P[d.caller]?.name || d.callerName;
  $("#incK").textContent = d.video ? "Chamada de vídeo…" : "Chamada de voz…";
  $("#inc").hidden = false; beep(true);
}
function hideInc() { inc = null; $("#inc").hidden = true; beep(false); }
$("#incNo").onclick = () => { const i = inc; hideInc(); i && updateDoc(doc(db, "calls", i.id), {status: "declined"}).catch(() => {}); };
$("#incYes").onclick = async () => {
  const d = inc; hideInc(); if (!d || call) return;
  let stream;
  try { stream = await media(d.video); } catch { updateDoc(doc(db, "calls", d.id), {status: "declined"}).catch(() => {}); return alert("Permita o acesso ao microfone" + (d.video ? " e à câmera" : "") + " para atender."); }
  const c = call = mk(d.id, d.caller, d.video, stream, "callee");
  ui(P[d.caller]?.name || d.callerName, d.caller, d.video); setSt("Conectando…");
  try {
    await c.pc.setRemoteDescription(d.offer); c.remote = true;
    const a = await c.pc.createAnswer(); await c.pc.setLocalDescription(a);
    await updateDoc(doc(db, "calls", d.id), {answer: {type: a.type, sdp: a.sdp}, status: "active"});
    watch(c);
  } catch (x) { finish(c, 0); alert("Não consegui atender: " + (x.code || x.message)); }
};
async function hang() {
  const c = call; if (!c) return;
  updateDoc(doc(db, "calls", c.id), {status: "ended"}).catch(() => {});
  finish(c, 0);
}
function finish(c, delay) {
  if (c.over) return; c.over = true; if (call === c) call = null;
  c.unsubs.forEach(f => f()); clearInterval(c.tm); clearTimeout(c.ringT); beep(false);
  c.stream.getTracks().forEach(t => t.stop()); try { c.pc.close(); } catch {}
  setTimeout(() => { if (!call) { $("#call").hidden = true; $("#rv").srcObject = null; $("#lv").srcObject = null; } }, delay);
}
$("#bCall").onclick = () => startCall(false);
$("#bVid").onclick = () => startCall(true);
$("#cEnd").onclick = hang;
$("#cMute").onclick = e => { if (!call) return; const t = call.stream.getAudioTracks(); t.forEach(x => x.enabled = !x.enabled); e.currentTarget.classList.toggle("off", !t[0]?.enabled); };
$("#cCam").onclick = e => { if (!call) return; const t = call.stream.getVideoTracks(); t.forEach(x => x.enabled = !x.enabled); e.currentTarget.classList.toggle("off", !t[0]?.enabled); };
