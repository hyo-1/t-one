// =====================================================================
//  탁구동호회 운영 웹앱  (GitHub Pages + Firebase Firestore)
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ---------------------------------------------------------------------
//  ★ 설정: 아래 3가지만 바꾸면 됩니다
// ---------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB_c5lRTqxhDCJgSNmDRWcZVVjxJekEGgo",
  authDomain: "lets-go-d160a.firebaseapp.com",
  projectId: "lets-go-d160a",
  storageBucket: "lets-go-d160a.firebasestorage.app",
  messagingSenderId: "34767262598",
  appId: "1:34767262598:web:55bd8904ca7027e61e9207",
};
// 관리자 이메일 (firestore.rules 의 목록과 똑같이 맞춰 주세요)
// 두 번째 관리자를 따로 두려면 ["gydnjshw@naver.com", "두번째@이메일"] 처럼 추가
const ADMIN_EMAILS = ["gydnjshw@naver.com"];
// 회원 탭에서 한 번에 불러올 기본 명단
const DEFAULT_MEMBERS = ["김효원", "김용채", "김재훈", "김진", "김충희", "김형태", "노동호", "강동식", "류동흠", "박범준", "박찬우",
  "선우혁", "성준형", "송예영", "김승혁", "신동호", "유탁민", "윤홍균", "이호열", "정가람", "최자헌", "최형구"];
const CLUB_NAME = "티원 탁구동호회";
// ---------------------------------------------------------------------

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WD = "일월화수목금토";
const pad = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return `${m}월 ${d}일 (${WD[new Date(y, m - 1, d).getDay()]})`;
};
const ts = (m) => m.createdAt?.toMillis?.() ?? Date.now();
const fmtTime = (m) => { const d = new Date(ts(m)); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dday = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - n) / 86400000);
};
const linkify = (h) => h.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
const pct = (x) => (x < 0 ? "-" : (x * 100).toFixed(1) + "%");

document.title = CLUB_NAME;
$("#clubName").textContent = CLUB_NAME;

if (firebaseConfig.apiKey.startsWith("YOUR")) {
  $("#view").innerHTML = `<div class="card"><h3>⚙️ Firebase 설정이 필요합니다</h3>
    <p>app.js 맨 위의 <code>firebaseConfig</code>와 <code>ADMIN_EMAILS</code>를 내 프로젝트 값으로 바꿔 주세요.
    자세한 순서는 README.md에 있습니다.</p></div>`;
  throw new Error("firebaseConfig 미설정");
}

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

// ---------------------------------------------------------------------
//  상태
// ---------------------------------------------------------------------
const state = {
  user: null,
  members: [], events: [], matches: [],
  loaded: { members: false, events: false, matches: false },
  year: new Date().getFullYear(),
  matchYear: null, unsubMatches: null,
  pick: { winner: null, loser: null, score: "" },
  editAttend: false, attendDraft: new Set(),
  showNewEvent: false, editEvent: false,
  placePick: null, placeDraft: new Set(),
  sortBy: "points", minGames: 0,
};
const isAdmin = () => !!state.user && ADMIN_EMAILS.includes(state.user.email);
const memberName = (id) => state.members.find((m) => m.id === id)?.name ?? "(삭제된 회원)";
const byName = (ids) => ids.map((id) => ({ id, name: memberName(id) }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

// ---------------------------------------------------------------------
//  실시간 구독
// ---------------------------------------------------------------------
const onErr = (e) => { console.error(e); toast("데이터를 불러오지 못했습니다: " + e.code); };

onSnapshot(collection(db, "members"), (s) => {
  state.members = s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  state.loaded.members = true; render();
}, onErr);

onSnapshot(collection(db, "events"), (s) => {
  state.events = s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date.localeCompare(a.date));
  state.loaded.events = true; render();
}, onErr);

function watchMatches(year) {
  if (state.matchYear === year) return;
  state.unsubMatches?.();
  state.matchYear = year; state.matches = []; state.loaded.matches = false;
  state.unsubMatches = onSnapshot(
    query(collection(db, "matches"), where("year", "==", year)),
    (s) => {
      state.matches = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.loaded.matches = true; render();
    }, onErr);
}

onAuthStateChanged(auth, (u) => { state.user = u; render(); });

window.addEventListener("hashchange", () => {
  state.pick = { winner: null, loser: null, score: "" };
  state.editAttend = false; state.editEvent = false; state.showNewEvent = false; state.placePick = null;
  render(true);
  window.scrollTo(0, 0);
});

// ---------------------------------------------------------------------
//  렌더링 (입력 중에는 화면을 다시 그리지 않음)
// ---------------------------------------------------------------------
let pendingRender = false;
function isTyping() {
  const a = document.activeElement;
  return a && a.closest?.("#view") &&
    (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(a.type)));
}
document.addEventListener("focusout", () => setTimeout(() => { if (pendingRender) render(); }, 0));

function render(force = false) {
  if (!force && isTyping()) { pendingRender = true; return; }
  pendingRender = false;

  $("#authBtn").innerHTML = isAdmin() ? "관리자 ✓ <span>로그아웃</span>" : state.user ? "로그아웃" : "🔒";
  $("#authBtn").classList.toggle("on", isAdmin());
  $("#authBtn").title = isAdmin() ? "로그아웃" : "관리자 로그인";
  document.body.classList.toggle("admin", isAdmin());

  const [route = "", id] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll(".tabs a, .bottom-nav a").forEach((a) =>
    a.classList.toggle("active", a.dataset.route === (route === "event" || !route ? "home" : route)));

  let html;
  if (route === "event") html = viewEvent(id);
  else if (route === "ranking") html = viewRanking();
  else if (route === "members") html = viewMembers();
  else html = viewHome();

  if (state.user && !isAdmin()) {
    html = `<p class="notice">로그인한 계정(${esc(state.user.email)})은 운영진 목록에 없어 일부 기능이 제한됩니다.</p>` + html;
  }
  $("#view").innerHTML = html;
}

const yearBar = () => `<div class="yearbar">
  <button class="icon" data-act="year" data-d="-1" aria-label="이전 해">‹</button>
  <b>${state.year}년</b>
  <button class="icon" data-act="year" data-d="1" aria-label="다음 해">›</button></div>`;

// ----- 일정(행사 목록) -----------------------------------------------
function viewHome() {
  watchMatches(state.year);
  if (!state.loaded.events) return `<p class="muted center">불러오는 중…</p>`;
  const evs = state.events.filter((e) => e.year === state.year);
  const cnt = {};
  state.matches.forEach((m) => (cnt[m.eventId] = (cnt[m.eventId] || 0) + 1));
  const t = today();

  const form = !isAdmin() ? "" : state.showNewEvent ? `
    <form class="card" data-form="newEvent">
      <h3>새 행사</h3>
      <label>날짜<input type="date" name="date" required value="${t}"></label>
      <label>행사명<input name="title" required placeholder="예) 정기 모임, 월례 리그"></label>
      <label>장소<input name="place" placeholder="(선택)"></label>
      <label>행사 안내 <small>(단톡방 공지를 그대로 붙여넣어도 됩니다)</small><textarea name="notice" rows="8" placeholder="(선택)"></textarea></label>
      <div class="row"><button type="button" class="btn" data-act="hideNewEvent">취소</button>
        <span class="spacer"></span><button class="btn primary">만들기</button></div>
    </form>` : `<button class="btn primary block" data-act="showNewEvent">+ 새 행사 만들기</button>`;

  const list = evs.length ? evs.map((e) => `
    <a class="card event-card ${e.date === t ? "today" : ""} ${e.date > t ? "upcoming" : ""}" href="#/event/${e.id}">
      <div class="date">${fmtDate(e.date)} ${e.date === t ? '<span class="badge">오늘</span>' : e.date > t ? '<span class="badge soft">예정</span>' : ""}</div>
      <div class="title">${esc(e.title)}${e.notice ? ' <span class="has-notice">📢</span>' : ""}</div>
      <div class="meta">${e.place ? esc(e.place) + " · " : ""}참가 ${(e.attendees || []).length}명 · 경기 ${cnt[e.id] || 0}</div>
    </a>`).join("") : `<p class="muted center pad">${state.year}년에 등록된 행사가 없습니다.</p>`;

  const next = [...state.events].filter((e) => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const hero = next && next.year === state.year ? `<a class="hero" href="#/event/${next.id}">
      <div class="hero-label">${next.date === t ? "🔥 오늘 행사" : `📅 다가오는 행사 · D-${dday(next.date)}`}</div>
      <div class="hero-title">${esc(next.title)}</div>
      <div class="hero-meta">${fmtDate(next.date)}${next.place ? " · " + esc(next.place) : ""} · 참가 ${(next.attendees || []).length}명</div>
      <div class="hero-go">자세히 보기 →</div></a>` : "";

  return hero + yearBar() + form + `<div class="list">${list}</div>`;
}

// ----- 행사 페이지 ---------------------------------------------------
function viewEvent(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return state.loaded.events
    ? `<div class="card"><p>행사를 찾을 수 없습니다.</p><a href="#/">← 목록으로</a></div>`
    : `<p class="muted center">불러오는 중…</p>`;
  watchMatches(ev.year);

  const att = ev.attendees || [];
  const ms = state.matches.filter((m) => m.eventId === id).sort((a, b) => ts(b) - ts(a));
  const admin = isAdmin();

  // 헤더
  const head = state.editEvent ? `
    <form class="card" data-form="editEvent" data-id="${ev.id}">
      <h3>행사 수정</h3>
      <label>날짜<input type="date" name="date" required value="${ev.date}"></label>
      <label>행사명<input name="title" required value="${esc(ev.title)}"></label>
      <label>장소<input name="place" value="${esc(ev.place)}"></label>
      <label>행사 안내<textarea name="notice" rows="12">${esc(ev.notice)}</textarea></label>
      <div class="row"><button type="button" class="btn danger" data-act="deleteEvent" data-id="${ev.id}">행사 삭제</button>
        <span class="spacer"></span><button type="button" class="btn" data-act="cancelEditEvent">취소</button>
        <button class="btn primary">저장</button></div>
    </form>` : `
    <div class="event-head">
      <a href="#/" class="back">← 일정</a>
      <div class="date">${fmtDate(ev.date)}</div>
      <h2>${esc(ev.title)}</h2>
      ${ev.place ? `<div class="muted">📍 ${esc(ev.place)}</div>` : ""}
      ${admin ? `<button class="mini" data-act="editEvent">행사 수정</button>` : ""}
    </div>`;

  // 참가자
  let attBody;
  if (state.editAttend) {
    const pool = state.members.filter((m) => m.active !== false || att.includes(m.id));
    attBody = pool.length ? `
      <p class="muted">탭해서 참가자를 고르세요 · <b>${state.attendDraft.size}명</b> 선택</p>
      <div class="chips">${pool.map((m) => `<button class="chip ${state.attendDraft.has(m.id) ? "on" : ""}" data-act="toggleAttend" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div>
      <form class="quick-add" data-form="quickMember"><input name="name" placeholder="명단에 없는 사람 바로 추가 (이름)" autocomplete="off"><button class="btn">+ 추가</button></form>
      <div class="row"><button class="btn" data-act="attendAll">전체 선택</button><button class="btn" data-act="attendNone">전체 해제</button>
        <span class="spacer"></span><button class="btn" data-act="cancelAttend">취소</button>
        <button class="btn primary" data-act="saveAttend" data-id="${ev.id}">저장</button></div>`
      : `<p class="muted">등록된 회원이 없습니다. <a href="#/members">회원 탭</a>에서 먼저 추가하세요.</p>
        <form class="quick-add" data-form="quickMember"><input name="name" placeholder="이름" autocomplete="off"><button class="btn">+ 추가</button></form>`;
  } else {
    attBody = att.length
      ? `<div class="chips">${byName(att).map((m) => `<span class="chip static">${esc(m.name)}</span>`).join("")}</div>`
      : `<p class="muted">아직 참가자가 없습니다.</p>`;
  }
  const attSection = `<section class="card">
    <div class="sec-head"><h3>참가자 <small>${att.length}명</small></h3>
      ${admin && !state.editAttend ? `<button class="mini" data-act="editAttend" data-id="${ev.id}">참가자 넣기·빼기</button>` : ""}</div>
    ${attBody}</section>`;

  // 경기 입력
  const inputSection = admin ? `<section class="card match-input"><h3>🏓 경기 결과 입력</h3>${matchInput(ev, att)}</section>` : "";

  // 오늘의 성적
  const tally = {};
  ms.forEach((m) => {
    (tally[m.winnerId] ??= { w: 0, l: 0 }).w++;
    (tally[m.loserId] ??= { w: 0, l: 0 }).l++;
  });
  const tallyRows = Object.entries(tally)
    .map(([id, r]) => ({ id, ...r, name: memberName(id) }))
    .sort((a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name, "ko"));
  const tallySection = tallyRows.length ? `<section class="card"><h3>이날 성적</h3>
    <table class="tbl"><thead><tr><th>이름</th><th>승</th><th>패</th><th>승률</th></tr></thead><tbody>
    ${tallyRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${pct(r.w / (r.w + r.l))}</td></tr>`).join("")}
    </tbody></table></section>` : "";

  // 경기 기록
  const logSection = `<section class="card"><h3>경기 기록 <small>${ms.length}경기</small></h3>
    ${ms.length ? `<ul class="log">${ms.map((m) => {
      return `<li><span class="t">${fmtTime(m)}</span>
        <span class="w">${esc(memberName(m.winnerId))}</span><span class="vs">승</span>
        <span class="l">${esc(memberName(m.loserId))}</span>
        ${m.score ? `<span class="score">${esc(m.score)}</span>` : ""}
        ${admin ? `<button class="mini danger" data-act="deleteMatch" data-id="${m.id}">삭제</button>` : ""}</li>`;
    }).join("")}</ul>` : `<p class="muted">아직 입력된 경기가 없습니다.</p>`}</section>`;

  const noticeSection = ev.notice && !state.editEvent ? `<details class="card notice-card" ${ms.length || (ev.scoring?.games || []).some((g) => Object.values(g.places || {}).some((a) => a.length)) ? "" : "open"}>
    <summary><h3>📢 행사 안내</h3></summary><div class="notice-body">${linkify(esc(ev.notice))}</div></details>` : "";

  if (!admin) return head + noticeSection + scoringSection(ev, att) + tallySection + attSection + logSection;
  return head + noticeSection + attSection + inputSection + scoringSection(ev, att) + tallySection + logSection;
}

// ----- 종합 점수 (종목별 순위 → 점수 합산) -------------------------
const MEDAL = ["🥇", "🥈", "🥉"];
const placeLabel = (i) => MEDAL[i] ? `${MEDAL[i]} ${i + 1}등` : `${i + 1}등`;

function scoreTotals(sc) {
  const scale = sc.scale || [];
  const tot = {};
  (sc.games || []).forEach((g) => scale.forEach((pt, i) =>
    (g.places?.[i + 1] || []).forEach((id) => {
      const r = (tot[id] ??= { id, sum: 0, per: {} });
      r.sum += pt; r.per[g.id] = (r.per[g.id] || 0) + pt;
    })));
  const rows = Object.values(tot).map((r) => ({ ...r, name: memberName(r.id) }))
    .sort((a, b) => b.sum - a.sum || a.name.localeCompare(b.name, "ko"));
  let prev = null, rank = 0;
  rows.forEach((r, i) => { if (r.sum !== prev) { rank = i + 1; prev = r.sum; } r.rank = rank; });
  return rows;
}

function scoringSection(ev, att) {
  const sc = ev.scoring;
  const admin = isAdmin();
  if (!sc) return admin ? `<section class="card"><h3>🏆 종합 점수</h3>
    <p class="muted">종목별 순위에 점수를 매겨 최종 순위를 정하는 행사라면 켜세요.</p>
    <button class="btn primary" data-act="scoringOn" data-id="${ev.id}">종합 점수 사용하기</button></section>` : "";

  const scale = sc.scale || [10, 8, 5];
  const games = sc.games || [];
  const rows = scoreTotals(sc);
  const pool = att.length ? byName(att) : state.members.filter((m) => m.active !== false);

  const board = rows.length ? `<div class="tbl-wrap"><table class="tbl rank final"><thead><tr><th></th><th>이름</th>
      ${games.map((g) => `<th>${esc(g.name)}</th>`).join("")}<th>합계</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.rank <= 3 ? "podium" : ""}"><td class="rk">${MEDAL[r.rank - 1] || r.rank}</td><td class="nm">${esc(r.name)}</td>
        ${games.map((g) => `<td>${r.per[g.id] ?? "-"}</td>`).join("")}<td class="rate">${r.sum}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">종목 순위를 입력하면 여기에 최종 순위가 나옵니다.</p>`;

  const gameCards = games.map((g) => `<div class="game">
    <div class="game-head"><b>${esc(g.name)}</b>
      ${admin ? `<button class="mini danger" data-act="delGame" data-id="${ev.id}" data-g="${g.id}">종목 삭제</button>` : ""}</div>
    ${scale.map((pt, i) => {
      const pl = i + 1;
      const ids = g.places?.[pl] || [];
      const picking = state.placePick && state.placePick.g === g.id && state.placePick.p === pl;
      if (picking) return `<div class="place picking"><div class="place-top"><span class="medal">${placeLabel(i)}</span><span class="pt">${pt}점</span></div>
        <p class="muted small">해당하는 사람을 모두 고르세요 (단체전이면 팀원 전원)</p>
        <div class="chips">${pool.map((m) => `<button class="chip ${state.placeDraft.has(m.id) ? "on" : ""}" data-act="togglePlace" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div>
        <div class="row"><span class="spacer"></span><button class="btn" data-act="cancelPlace">취소</button>
          <button class="btn primary" data-act="savePlace" data-id="${ev.id}">저장</button></div></div>`;
      return `<div class="place"><div class="place-top"><span class="medal">${placeLabel(i)}</span><span class="pt">${pt}점</span>
        ${admin ? `<button class="mini" data-act="pickPlace" data-g="${g.id}" data-p="${pl}">${ids.length ? "변경" : "지정"}</button>` : ""}</div>
        ${ids.length ? `<div class="chips">${byName(ids).map((m) => `<span class="chip static">${esc(m.name)}</span>`).join("")}</div>` : ""}</div>`;
    }).join("")}</div>`).join("");

  const tools = admin ? `<details class="score-tools"><summary>⚙️ 종목·점수 설정</summary>
      <form data-form="addGame" data-id="${ev.id}" class="quick-add"><input name="names" placeholder="종목 추가 (예: 탁구, 100초 미션, 스크린야구)" autocomplete="off"><button class="btn">+ 추가</button></form>
      <form data-form="scale" data-id="${ev.id}" class="quick-add"><input name="scale" value="${scale.join(", ")}" placeholder="1등, 2등, 3등 점수"><button class="btn">점수 저장</button></form>
      <p class="muted small">점수는 1등부터 순서대로 쉼표로 적습니다. 4등까지 주려면 "10, 8, 5, 3"</p>
      <button class="mini danger" data-act="scoringOff" data-id="${ev.id}">종합 점수 끄기</button></details>` : "";

  return `<section class="card scoring">
    <h3>🏆 최종 순위 <small>${scale.map((pt, i) => `${i + 1}등 ${pt}점`).join(" · ")}</small></h3>
    ${board}
    ${games.length ? `<h4>종목별 순위</h4>${gameCards}` : admin ? `<p class="muted small">아래 설정에서 종목을 먼저 추가하세요.</p>` : ""}
    ${tools}</section>`;
}

function matchInput(ev, att) {
  if (att.length < 2) return `<p class="muted">참가자가 2명 이상이어야 경기를 입력할 수 있습니다.</p>`;
  const p = state.pick;
  const people = byName(att);
  if (!p.winner) return `
    <p class="step"><b>①</b> 이긴 사람을 고르세요</p>
    <div class="grid">${people.map((m) => `<button class="pick" data-act="pickWinner" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div>`;
  if (!p.loser) return `
    <p class="step"><b>②</b> <span class="w">${esc(memberName(p.winner))}</span> 님이 이긴 상대는?</p>
    <div class="grid">${people.filter((m) => m.id !== p.winner).map((m) => `<button class="pick lose" data-act="pickLoser" data-id="${m.id}">${esc(m.name)}</button>`).join("")}</div>
    <button class="btn" data-act="resetPick">← 다시 고르기</button>`;
  return `
    <div class="vsbox"><div class="side win"><small>승</small><b>${esc(memberName(p.winner))}</b></div>
      <div class="x">VS</div><div class="side lose"><small>패</small><b>${esc(memberName(p.loser))}</b></div></div>
    <p class="step"><b>③</b> 세트 스코어 (선택)</p>
    <div class="chips">${["2:0", "2:1", "3:0", "3:1", "3:2"].map((s) => `<button class="chip ${p.score === s ? "on" : ""}" data-act="pickScore" data-s="${s}">${s}</button>`).join("")}</div>
    <div class="row"><button class="btn" data-act="resetPick">취소</button><span class="spacer"></span>
      <button class="btn primary big" data-act="saveMatch" data-id="${ev.id}">결과 저장</button></div>`;
}

// ----- 연간 순위 -----------------------------------------------------
function viewRanking() {
  watchMatches(state.year);
  if (!state.loaded.events || !state.loaded.matches || !state.loaded.members) return yearBar() + `<p class="muted center">불러오는 중…</p>`;
  const t = today();
  const evs = state.events.filter((e) => e.year === state.year && e.date <= t).sort((a, b) => a.date.localeCompare(b.date));
  const total = evs.length;
  const known = (id) => state.members.some((m) => m.id === id);
  const tab = state.sortBy;
  const segBtn = (k, label) => `<button class="seg ${tab === k ? "on" : ""}" data-act="sort" data-k="${k}">${label}</button>`;
  const segs = `<div class="segs wide">${segBtn("points", "🏆 종합 포인트")}${segBtn("rate", "🏓 탁구 승률")}${segBtn("att", "📅 출석")}</div>`;
  const rankCell = (rank) => MEDAL[rank - 1] || rank;
  const withRank = (rows, val) => { let prev = null, rank = 0; rows.forEach((r, i) => { const v = val(r); if (v !== prev) { rank = i + 1; prev = v; } r.rank = rank; }); return rows; };
  let body = "";

  if (tab === "points") {
    const scored = evs.filter((e) => e.scoring?.games?.length);
    const st = {};
    scored.forEach((e) => scoreTotals(e.scoring).forEach((r) => {
      const x = (st[r.id] ??= { id: r.id, sum: 0, per: {} });
      x.sum += r.sum; x.per[e.id] = r.sum;
    }));
    const rows = withRank(Object.values(st).filter((r) => known(r.id)).map((r) => ({ ...r, name: memberName(r.id) }))
      .sort((a, b) => b.sum - a.sum || a.name.localeCompare(b.name, "ko")), (r) => r.sum);
    const short = (e) => { const [, m, d] = e.date.split("-").map(Number); return `${m}/${d}`; };
    body = `<p class="muted small">모임마다 종목별 순위 점수(탁구 + 레크리에이션)를 1년 동안 합산한 순위예요.</p>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl rank"><thead><tr><th></th><th>이름</th>
        ${scored.map((e) => `<th><a href="#/event/${e.id}">${short(e)}</a></th>`).join("")}<th>합계</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.rank <= 3 ? "podium" : ""}"><td class="rk">${rankCell(r.rank)}</td><td class="nm">${esc(r.name)}</td>
          ${scored.map((e) => `<td>${r.per[e.id] != null ? r.per[e.id] : (e.attendees || []).includes(r.id) ? 0 : '<span class="muted">·</span>'}</td>`).join("")}
          <td class="rate">${r.sum}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">· 표시는 그 모임에 불참</p>`
      : `<p class="muted center pad">아직 점수가 입력된 모임이 없어요.<br>행사 페이지의 🏆 종합 점수에서 종목 순위를 입력하면 여기에 쌓여요.</p>`}`;
  }

  if (tab === "rate") {
    const st = {};
    const g = (id) => (st[id] ??= { id, w: 0, l: 0 });
    state.matches.forEach((m) => { g(m.winnerId).w++; g(m.loserId).l++; });
    const min = state.minGames;
    const all = Object.values(st).filter((r) => known(r.id)).map((r) => ({ ...r, n: r.w + r.l, name: memberName(r.id), rate: r.w / (r.w + r.l) }));
    const ok = all.filter((r) => r.n >= min).sort((a, b) => b.rate - a.rate || b.w - a.w || a.name.localeCompare(b.name, "ko"));
    const rest = all.filter((r) => r.n < min).sort((a, b) => b.n - a.n);
    withRank(ok, (r) => r.rate + "|" + r.w);
    body = `<div class="controls"><p class="muted small" style="margin:0">탁구 경기 ${state.matches.length}경기 기준</p>
        <label class="inline">최소 경기
        <select data-act-change="minGames">${[0, 3, 5, 10, 20].map((n) => `<option value="${n}" ${n === min ? "selected" : ""}>${n ? n + "경기" : "제한없음"}</option>`).join("")}</select></label></div>
      ${all.length ? `<div class="tbl-wrap"><table class="tbl rank"><thead><tr><th></th><th>이름</th><th>경기</th><th>승</th><th>패</th><th>승률</th></tr></thead><tbody>
        ${ok.map((r) => `<tr class="${r.rank <= 3 ? "podium" : ""}"><td class="rk">${rankCell(r.rank)}</td><td class="nm">${esc(r.name)}</td><td>${r.n}</td><td>${r.w}</td><td>${r.l}</td><td class="rate">${pct(r.rate)}</td></tr>`).join("")}
        ${rest.map((r) => `<tr class="dim"><td class="rk">-</td><td class="nm">${esc(r.name)}</td><td>${r.n}</td><td>${r.w}</td><td>${r.l}</td><td>${pct(r.rate)}</td></tr>`).join("")}
        </tbody></table></div>${rest.length ? `<p class="muted small">흐린 줄은 최소 경기 수 미달</p>` : ""}`
      : `<p class="muted center pad">아직 입력된 탁구 경기가 없어요.</p>`}`;
  }

  if (tab === "att") {
    const cnt = {};
    evs.forEach((e) => (e.attendees || []).forEach((id) => (cnt[id] = (cnt[id] || 0) + 1)));
    const rows = withRank(state.members.filter((m) => m.active !== false || cnt[m.id])
      .map((m) => ({ id: m.id, name: m.name, att: cnt[m.id] || 0 }))
      .sort((a, b) => b.att - a.att || a.name.localeCompare(b.name, "ko")), (r) => r.att);
    const full = total && rows.filter((r) => r.att === total).length;
    body = `<p class="muted small">${state.year}년 진행된 모임 ${total}회${full ? ` · 🏅 개근 ${full}명` : ""}</p>
      ${total ? `<ul class="att-list">${rows.map((r) => `<li class="${r.att === total ? "full" : ""}">
          <span class="rk">${r.att ? rankCell(r.rank) : "-"}</span><span class="nm">${esc(r.name)}</span>
          <span class="dots">${evs.map((e) => `<i class="${(e.attendees || []).includes(r.id) ? "on" : ""}" title="${fmtDate(e.date)}"></i>`).join("")}</span>
          <span class="cnt">${r.att}/${total}회</span>${r.att === total ? '<span class="badge">🏅 개근</span>' : ""}</li>`).join("")}</ul>`
      : `<p class="muted center pad">아직 진행된 모임이 없어요.</p>`}`;
  }

  return yearBar() + `<div class="card">${segs}${body}</div>`;
}

// ----- 회원 ---------------------------------------------------------
function viewMembers() {
  const admin = isAdmin();
  const active = state.members.filter((m) => m.active !== false).length;
  const sleeping = state.members.length - active;
  const add = admin ? `
    <form class="card" data-form="addMembers">
      <h3>회원 추가</h3>
      <textarea name="names" rows="3" placeholder="이름 입력 (여러 명은 줄바꿈이나 쉼표로 구분)"></textarea>
      <button class="btn primary block">추가</button>
    </form>` : "";
  const missing = DEFAULT_MEMBERS.filter((n) => !state.members.some((m) => m.name === n));
  const seed = admin && state.loaded.members && missing.length ? `<div class="card seed">
      <b>기본 명단 ${missing.length}명이 아직 등록되지 않았어요</b>
      <p class="muted small">${missing.map(esc).join(", ")}</p>
      <button class="btn primary block" data-act="seedMembers">한 번에 등록하기</button></div>` : "";
  if (!admin) return `<div class="card"><h3>회원 <small>${active}명</small></h3>
    <div class="member-grid">${state.members.filter((m) => m.active !== false).map((m) => `<span>${esc(m.name)}</span>`).join("")}</div></div>`;
  return seed + add + `<div class="card"><h3>회원 <small>${active}명${sleeping ? ` · 휴면 ${sleeping}명` : ""}</small></h3>
    ${state.members.length ? `<ul class="members">${state.members.map((m) => `
      <li class="${m.active === false ? "inactive" : ""}"><span>${esc(m.name)}${m.active === false ? " <small>휴면</small>" : ""}</span>
      ${admin ? `<span class="acts">
        <button class="mini" data-act="renameMember" data-id="${m.id}">이름</button>
        <button class="mini" data-act="toggleActive" data-id="${m.id}">${m.active === false ? "복귀" : "휴면"}</button>
        <button class="mini danger" data-act="deleteMember" data-id="${m.id}">삭제</button></span>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">등록된 회원이 없습니다.</p>`}
    ${admin ? `<p class="muted small">탈퇴 회원은 <b>휴면</b>으로 두면 기록이 유지되고 참가자 선택 목록에서만 빠집니다.</p>` : ""}</div>`;
}

// ---------------------------------------------------------------------
//  동작
// ---------------------------------------------------------------------
const actions = {
  auth() { state.user ? signOut(auth).then(() => toast("로그아웃했습니다")) : openLogin(); },
  closeModal,
  year(d) { state.year += Number(d.d); render(true); },
  showNewEvent() { state.showNewEvent = true; render(true); },
  hideNewEvent() { state.showNewEvent = false; render(true); },
  editEvent() { state.editEvent = true; render(true); },
  cancelEditEvent() { state.editEvent = false; render(true); },
  async deleteEvent(d) {
    const n = state.matches.filter((m) => m.eventId === d.id).length;
    if (!confirm(`이 행사를 삭제할까요?${n ? `\n이 행사의 경기 기록 ${n}건도 함께 삭제됩니다.` : ""}`)) return;
    const b = writeBatch(db);
    state.matches.filter((m) => m.eventId === d.id).forEach((m) => b.delete(doc(db, "matches", m.id)));
    b.delete(doc(db, "events", d.id));
    await b.commit();
    toast("행사를 삭제했습니다");
    location.hash = "#/";
  },
  editAttend(d) {
    const ev = state.events.find((e) => e.id === d.id);
    state.attendDraft = new Set(ev?.attendees || []);
    state.editAttend = true; render(true);
  },
  toggleAttend(d) {
    state.attendDraft.has(d.id) ? state.attendDraft.delete(d.id) : state.attendDraft.add(d.id);
    render(true);
  },
  attendAll() { state.members.filter((m) => m.active !== false).forEach((m) => state.attendDraft.add(m.id)); render(true); },
  attendNone() { state.attendDraft.clear(); render(true); },
  cancelAttend() { state.editAttend = false; render(true); },
  async saveAttend(d) {
    await updateDoc(doc(db, "events", d.id), { attendees: [...state.attendDraft] });
    state.editAttend = false; toast(`참가자 ${state.attendDraft.size}명 저장`); render(true);
  },
  async seedMembers() {
    const missing = DEFAULT_MEMBERS.filter((n) => !state.members.some((m) => m.name === n));
    const b = writeBatch(db);
    missing.forEach((name) => b.set(doc(collection(db, "members")), { name, active: true, createdAt: serverTimestamp() }));
    await b.commit();
    toast(`${missing.length}명을 등록했습니다`);
  },
  async scoringOn(d) {
    await updateDoc(doc(db, "events", d.id), { scoring: { scale: [10, 8, 5], games: [] } });
  },
  async scoringOff(d) {
    if (!confirm("종합 점수를 끌까요? 입력한 종목 순위가 모두 지워집니다.")) return;
    await updateDoc(doc(db, "events", d.id), { scoring: null });
  },
  async delGame(d) {
    const sc = scoringOf(d.id);
    const g = sc.games.find((x) => x.id === d.g);
    if (!confirm(`'${g?.name}' 종목을 삭제할까요?`)) return;
    sc.games = sc.games.filter((x) => x.id !== d.g);
    await saveScoring(d.id, sc);
  },
  pickPlace(d) {
    const ev = state.events.find((e) => e.id === location.hash.split("/")[2]);
    const g = ev?.scoring?.games?.find((x) => x.id === d.g);
    state.placePick = { g: d.g, p: Number(d.p) };
    state.placeDraft = new Set(g?.places?.[d.p] || []);
    render(true);
  },
  togglePlace(d) {
    state.placeDraft.has(d.id) ? state.placeDraft.delete(d.id) : state.placeDraft.add(d.id);
    render(true);
  },
  cancelPlace() { state.placePick = null; render(true); },
  async savePlace(d) {
    const sc = scoringOf(d.id);
    const g = sc.games.find((x) => x.id === state.placePick.g);
    g.places = { ...(g.places || {}) };
    const picked = [...state.placeDraft];
    // 같은 종목의 다른 순위에서 중복으로 들어간 사람은 빼 줌
    Object.keys(g.places).forEach((k) => {
      if (Number(k) !== state.placePick.p) g.places[k] = g.places[k].filter((id) => !state.placeDraft.has(id));
    });
    g.places[state.placePick.p] = picked;
    await saveScoring(d.id, sc);
    state.placePick = null; toast("순위를 저장했습니다"); render(true);
  },
  pickWinner(d) { state.pick.winner = d.id; render(true); },
  pickLoser(d) { state.pick.loser = d.id; render(true); },
  pickScore(d) { state.pick.score = state.pick.score === d.s ? "" : d.s; render(true); },
  resetPick() { state.pick = { winner: null, loser: null, score: "" }; render(true); },
  async saveMatch(d, el) {
    const ev = state.events.find((e) => e.id === d.id);
    const { winner, loser, score } = state.pick;
    if (!ev || !winner || !loser) return;
    el.disabled = true;
    await addDoc(collection(db, "matches"), {
      eventId: ev.id, date: ev.date, year: ev.year,
      winnerId: winner, loserId: loser, score: score || "",
      createdAt: serverTimestamp(),
    });
    toast(`${memberName(winner)} 승 · ${memberName(loser)} 패 저장!`);
    state.pick = { winner: null, loser: null, score: "" }; render(true);
  },
  async deleteMatch(d) {
    const m = state.matches.find((x) => x.id === d.id);
    if (!m || !confirm(`${memberName(m.winnerId)} 승 / ${memberName(m.loserId)} 패 기록을 지울까요?`)) return;
    await deleteDoc(doc(db, "matches", d.id));
    toast("경기 기록을 지웠습니다");
  },
  sort(d) { state.sortBy = d.k; render(true); },
  async renameMember(d) {
    const name = prompt("새 이름", memberName(d.id))?.trim();
    if (!name || name === memberName(d.id)) return;
    if (state.members.some((m) => m.name === name)) return toast("같은 이름이 이미 있습니다");
    await updateDoc(doc(db, "members", d.id), { name });
  },
  async toggleActive(d) {
    const m = state.members.find((x) => x.id === d.id);
    await updateDoc(doc(db, "members", d.id), { active: m.active === false });
  },
  async deleteMember(d) {
    if (!confirm(`${memberName(d.id)} 님을 완전히 삭제할까요?\n경기 기록에는 '(삭제된 회원)'으로 남습니다. 보통은 '휴면'을 권장합니다.`)) return;
    await deleteDoc(doc(db, "members", d.id));
  },
};

function scoringOf(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  return JSON.parse(JSON.stringify(ev?.scoring || { scale: [10, 8, 5], games: [] }));
}
const saveScoring = (eventId, sc) => updateDoc(doc(db, "events", eventId), { scoring: sc });

const forms = {
  async addGame(fd, f) {
    const names = fd.get("names").split(",").map((x) => x.trim()).filter(Boolean);
    if (!names.length) return toast("종목 이름을 입력하세요");
    const sc = scoringOf(f.dataset.id);
    names.forEach((name, i) => sc.games.push({ id: Date.now().toString(36) + i, name, places: {} }));
    await saveScoring(f.dataset.id, sc);
    f.reset(); toast(`종목 ${names.length}개 추가`);
  },
  async scale(fd, f) {
    const scale = fd.get("scale").split(/[,\s]+/).map(Number).filter((n) => n > 0);
    if (!scale.length) return toast("점수를 숫자로 입력하세요 (예: 10, 8, 5)");
    const sc = scoringOf(f.dataset.id);
    sc.scale = scale;
    sc.games.forEach((g) => Object.keys(g.places || {}).forEach((k) => { if (Number(k) > scale.length) delete g.places[k]; }));
    await saveScoring(f.dataset.id, sc);
    document.activeElement?.blur(); toast("점수를 저장했습니다"); render(true);
  },
  async quickMember(fd, f) {
    const name = fd.get("name").trim();
    if (!name) return;
    const exist = state.members.find((m) => m.name === name);
    if (exist) {
      state.attendDraft.add(exist.id);
      if (exist.active === false) await updateDoc(doc(db, "members", exist.id), { active: true });
    } else {
      const ref = doc(collection(db, "members"));
      await setDoc(ref, { name, active: true, createdAt: serverTimestamp() });
      state.attendDraft.add(ref.id);
    }
    f.reset(); document.activeElement?.blur();
    toast(`${name} 님을 참가자에 넣었습니다 (저장을 눌러 확정)`); render(true);
  },
  async login(fd) {
    try {
      const pw = fd.get("pw");
      let ok = false;
      for (const email of ADMIN_EMAILS) {
        try { await signInWithEmailAndPassword(auth, email, pw); ok = true; break; } catch { /* 다음 계정 */ }
      }
      if (!ok) throw new Error();
      closeModal(); toast("관리자 모드로 전환했습니다");
    } catch { toast("비밀번호가 맞지 않습니다"); }
  },
  async newEvent(fd) {
    const date = fd.get("date");
    const ref = await addDoc(collection(db, "events"), {
      date, year: Number(date.slice(0, 4)),
      title: fd.get("title").trim(), place: fd.get("place").trim(),
      notice: fd.get("notice").trim(),
      attendees: [], createdAt: serverTimestamp(),
    });
    state.showNewEvent = false;
    location.hash = "#/event/" + ref.id;
  },
  async editEvent(fd, f) {
    const date = fd.get("date");
    const id = f.dataset.id;
    const year = Number(date.slice(0, 4));
    const b = writeBatch(db);
    b.update(doc(db, "events", id), { date, year, title: fd.get("title").trim(), place: fd.get("place").trim(), notice: fd.get("notice").trim() });
    // 날짜가 바뀌면 경기 기록의 날짜/연도도 맞춰 줌
    state.matches.filter((m) => m.eventId === id && (m.date !== date || m.year !== year))
      .forEach((m) => b.update(doc(db, "matches", m.id), { date, year }));
    await b.commit();
    state.editEvent = false; toast("행사를 수정했습니다"); render(true);
  },
  async addMembers(fd, f) {
    const names = [...new Set(fd.get("names").split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
    const exist = new Set(state.members.map((m) => m.name));
    const fresh = names.filter((n) => !exist.has(n));
    if (!fresh.length) return toast(names.length ? "이미 등록된 이름입니다" : "이름을 입력하세요");
    const b = writeBatch(db);
    fresh.forEach((name) => b.set(doc(collection(db, "members")), { name, active: true, createdAt: serverTimestamp() }));
    await b.commit();
    f.reset(); document.activeElement?.blur();
    toast(`${fresh.length}명 추가${names.length > fresh.length ? ` (중복 ${names.length - fresh.length}명 제외)` : ""}`);
  },
};

function handleError(e) {
  console.error(e);
  toast(e?.code === "permission-denied" ? "권한이 없습니다 (운영진 로그인이 필요하거나 입력 시간이 지났어요)" : "오류: " + (e?.message || e));
  render(true);
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !actions[el.dataset.act]) return;
  e.preventDefault();
  Promise.resolve(actions[el.dataset.act](el.dataset, el)).catch(handleError);
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.actChange === "minGames") { state.minGames = Number(e.target.value); render(true); }
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector("button:not([type=button])");
  if (btn) btn.disabled = true;
  Promise.resolve(forms[f.dataset.form](new FormData(f), f))
    .catch(handleError)
    .finally(() => { if (btn) btn.disabled = false; });
});

// ---------------------------------------------------------------------
//  모달 / 토스트
// ---------------------------------------------------------------------
function openLogin() {
  $("#modal").innerHTML = `<form class="card modal-box" data-form="login">
    <h3>🔐 관리자 로그인</h3>
    <p class="muted small">관리자만 행사·참가자·경기 결과를 입력할 수 있어요. 다른 분들은 로그인 없이 보기만 하면 됩니다.</p>
    <input type="email" name="email" value="${esc(ADMIN_EMAILS[0])}" autocomplete="username" hidden>
    <label>관리자 비밀번호<input type="password" name="pw" required minlength="6" autocomplete="current-password" placeholder="비밀번호 입력"></label>
    <div class="row"><button type="button" class="btn" data-act="closeModal">취소</button>
      <span class="spacer"></span><button class="btn primary">로그인</button></div></form>`;
  $("#modal").classList.remove("hidden");
  $("#modal input").focus();
}
function closeModal() { $("#modal").classList.add("hidden"); $("#modal").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

render();
