import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,query,where,orderBy,limit,onSnapshot,getDocs,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = s => document.querySelector(s);
const MAIL = "@conecta.app";                       // o ID da conta vira um "e-mail" interno
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newId = () => Array.from({length: 8}, () => CH[Math.floor(Math.random() * CH.length)]).join("");
let me = null, cur = null, unsubMsgs = null, unsubChats = null, busy = false, scanner = null;
const err = t => $("#err").textContent = t || "";

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
    for (let i = 0; i < 5 && !cred; i++) {         // gera um ID único (repete se já existir)
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
  $("#meName").textContent = me.name + (me.admin ? " ★ admin" : ""); $("#meId").textContent = "ID: " + me.publicId;
  unsubChats = onSnapshot(query(collection(db, "chats"), where("members", "array-contains", me.uid)), renderChats);
}
function leave() {
  unsubChats && unsubChats(); unsubMsgs && unsubMsgs();
  me = cur = null; $("#app").hidden = true; $("#auth").hidden = false;
}

/* ---------- Conversas e mensagens em tempo real ---------- */
function renderChats(s) {
  const ds = s.docs.map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  $("#chats").innerHTML = ds.length ? "" : '<p class="empty">Nenhuma conversa ainda. Toque em + para adicionar alguém.</p>';
  ds.forEach(c => {
    const o = c.members.find(m => m !== me.uid), b = document.createElement("button");
    b.className = "ci"; b.innerHTML = "<b></b><small></small>";
    b.firstChild.textContent = c.names[o]; b.lastChild.textContent = c.last || "Diga olá";
    b.onclick = () => openChat(c.id, c.names[o]);
    $("#chats").append(b);
  });
}

function openChat(id, name) {
  cur = {id}; unsubMsgs && unsubMsgs();
  $("#chName").textContent = name; $("#app").classList.add("inchat");
  unsubMsgs = onSnapshot(query(collection(db, "chats", id, "messages"), orderBy("at")), s => {
    const box = $("#msgs"); box.innerHTML = "";
    s.docs.forEach(d => {
      const m = d.data(), p = document.createElement("div");
      p.className = "m" + (m.from === me.uid ? " me" : ""); p.textContent = m.text; box.append(p);
    });
    box.scrollTop = box.scrollHeight;
  });
}

$("#fSend").onsubmit = async e => {
  e.preventDefault();
  const t = $("#txt").value.trim(); if (!t || !cur) return;
  $("#txt").value = "";
  const b = writeBatch(db);
  b.set(doc(collection(db, "chats", cur.id, "messages")), {from: me.uid, text: t, at: serverTimestamp()});
  b.update(doc(db, "chats", cur.id), {last: t, updatedAt: serverTimestamp()});
  await b.commit();
};
$("#bBack").onclick = () => $("#app").classList.remove("inchat");

/* ---------- QR code: mostrar o meu e ler o de outra pessoa ---------- */
const modal = h => { $("#box").innerHTML = h + '<button id="mx">Fechar</button>'; $("#modal").hidden = false; $("#mx").onclick = closeModal; };
async function closeModal() {
  if (scanner) { try { await scanner.stop(); } catch {} scanner = null; }
  $("#modal").hidden = true;
}
$("#bQr").onclick = () => {
  modal('<h3>Meu QR</h3><canvas id="qr"></canvas><p>ID: <b>' + me.publicId + '</b></p>');
  QRCode.toCanvas($("#qr"), "CONECTA:" + me.publicId, {width: 220});
};
$("#bAdd").onclick = () => {
  modal('<h3>Adicionar pessoa</h3><div id="reader"></div><input id="addId" placeholder="Ou digite o ID" maxlength="8"><button id="go">Adicionar</button><p id="addErr"></p>');
  $("#go").onclick = () => addPerson($("#addId").value);
  try {                                             // a câmera só funciona em https ou localhost
    scanner = new Html5Qrcode("reader");
    scanner.start({facingMode: "environment"}, {fps: 10, qrbox: 200}, t => addPerson(t), () => {}).catch(() => {});
  } catch {}
};
async function addPerson(raw) {
  const id = raw.replace("CONECTA:", "").trim().toUpperCase(), msg = t => $("#addErr").textContent = t;
  if (id === me.publicId) return msg("Esse é o seu próprio ID.");
  const s = await getDocs(query(collection(db, "users"), where("publicId", "==", id), limit(1)));
  if (s.empty) return msg("ID não encontrado.");
  const o = s.docs[0], cid = [me.uid, o.id].sort().join("_");
  await setDoc(doc(db, "chats", cid), {members: [me.uid, o.id], names: {[me.uid]: me.name, [o.id]: o.data().name}}, {merge: true});
  await closeModal(); openChat(cid, o.data().name);
}
