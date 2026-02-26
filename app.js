/* app.js — Broken Frontier RPG (AI-GM Terminal + Saves)
   Frontend: GitHub Pages
   Depends on: save.js (window.BF_DB helpers) + optional gm.schema.js (window.BF_GM)
   Endpoint: window.BF_GM_ENDPOINT = ".../api/turn"

   BUILD 2026-02-21 — V1.7 — UX Polish (Ask the Dark + Conjuring + Auto-Start)
*/

(function () {
  if (window.__BF_APP_RUNNING__) return;
  window.__BF_APP_RUNNING__ = true;

  const TATTOO = "BUILD 2026-02-21 — TATTOO V55 — UX Polish (Ask the Dark)";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  const $app = document.getElementById("app");
  if (!$app) return;

  const GM_ENDPOINT = String(window.BF_GM_ENDPOINT || "");
  const BF_SCENES = window.BF_SCENES || null;
  const dbApi = window.BF_DB || null;

  if (!dbApi) {
    $app.innerHTML = `<pre style="padding:16px;color:#fff;background:#0b0b0f;">FATAL — save.js not loaded (window.BF_DB missing)</pre>`;
    return;
  }

  const {
    loadDB, writeDB, getActiveSaveId, setActiveSaveId,
    getActiveSave, commitActiveSave, defaultSaveSlot, hardResetAllSaves,
  } = dbApi;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[c]));

  const nowISO = () => new Date().toISOString();

  function fatalScreen(err) {
    const msg = err && (err.stack || err.message) ? err.stack || err.message : String(err);
    $app.innerHTML = `
      <div style="padding:16px; color:#fff; font-family:system-ui; background:#0b0b0f; min-height:100vh;">
        <div style="padding:10px 12px; background:#3b0a0a; border:1px solid #6b1010; border-radius:10px;">
          <b>FATAL — App crashed</b>
          <div style="opacity:.9; margin-top:6px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; white-space:pre-wrap;">${esc(msg)}</div>
        </div>
      </div>
    `;
  }

  // ---- UX Animation Helpers ----
  function randInt(min, max) {
    min = Math.ceil(min); max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function summonD20({ slotEl, messageEl, minMs = 450, maxMs = 1100 } = {}) {
    const totalMs = randInt(minMs, maxMs);
    const start = performance.now();
    const tick = 35; 
    return await new Promise((resolve) => {
      const timer = setInterval(() => {
        const now = performance.now();
        const n = randInt(1, 20);
        if (slotEl) slotEl.textContent = String(n);
        
        if (now - start >= totalMs) {
          clearInterval(timer);
          const final = randInt(1, 20);
          if (slotEl) slotEl.textContent = String(final);
          if (messageEl) messageEl.textContent = `The dark answers: ${final}`;
          
          // THE FIX: Pause for 1.5 seconds before resolving so you can read it!
          setTimeout(() => {
            resolve(final);
          }, 1500);
        }
      }, tick);
    });
}


  // ---- DB Self-Heal ----
  function bootstrapFreshDB() {
    const db = loadDB();
    db.saves = Array.isArray(db.saves) ? db.saves : [];

    if (!db.saves.length) {
      const s = defaultSaveSlot();
      s.title = "Save 1";
      s.updatedAt = nowISO();

      s.character = s.character || {
        name: "Eli Brogan", background: "Park Ranger",
        grit: 1, instinct: 2, will: 1, presence: 0, discipline: 0,
        hp: 13, maxHp: 13, wounds: 0, stress: 0, exposed: false, ammo: 6,
      };

      s.campaign = s.campaign || {};
      s.campaign.campaignId = s.campaign.campaignId || "oregon_brogan_v1";
      s.campaign.turn = Number(s.campaign.turn || 0);
      s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

      if (BF_SCENES && typeof BF_SCENES.ensureCampaign === "function") {
        try { BF_SCENES.ensureCampaign(s); } catch {}
      }

      s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];
      s.sessionLog.unshift({ at: nowISO(), type: "SCENES", text: `BF_SCENES ${BF_SCENES ? "LOADED" : "MISSING"} (new save)`, data: null });
      s.sessionLog.unshift({ at: nowISO(), type: "BOOT", text: `Fresh DB created (${TATTOO})`, data: null });

      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);
      return s;
    }

    const activeId = getActiveSaveId();
    const hasActive = db.saves.some((x) => x && x.id === activeId);
    if (!hasActive) setActiveSaveId(db.saves[0].id);

    writeDB(db);
    return getActiveSave();
  }

  function safeGetActiveSave() {
    try {
      const s = getActiveSave();
      if (!s || typeof s !== "object") return bootstrapFreshDB();
      return s;
    } catch {
      return bootstrapFreshDB();
    }
  }

  function pushLocalLog(_saveIgnored, type, text, data) {
    try {
      const fresh = safeGetActiveSave();
      fresh.sessionLog = Array.isArray(fresh.sessionLog) ? fresh.sessionLog : [];
      fresh.sessionLog.unshift({ at: nowISO(), type, text, data: data || null });
      commitActiveSave(fresh);
    } catch {}
  }

  function computeStat(save, statName) {
    const c = save.character || {};
    return Number(c[String(statName || "").toLowerCase()] || 0);
  }

  const ui = { tab: "play", pendingRoll: null, inFlight: false };

  function tabBtn(id, label) {
    const active = ui.tab === id ? "bf-tab-on" : "";
    return `<button class="bf-tab ${active}" data-tab="${id}">${label}</button>`;
  }
  const disAttr = () => (ui.inFlight ? "disabled" : "");

  const FALLBACK_CSS = `
    <style>
      :root { color-scheme: dark; }
      body { margin:0; background:#0b0b0f; }
      .bf-shell { min-height:100vh; color:#fff; font-family:system-ui, sans-serif; }
      .bf-topbar { padding:8px 12px; background:#0b2b12; color:#61ff9a; font-family:monospace; font-size:12px; }
      .bf-header { display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid rgba(255,255,255,.08); }
      .bf-brand { display:flex; gap:10px; align-items:center; }
      .bf-badge { width:36px; height:36px; border-radius:10px; background:#1b1b22; display:flex; align-items:center; justify-content:center; font-weight:800; }
      .bf-name { font-weight:800; }
      .bf-sub { opacity:.75; font-size:12px; margin-top:2px; }
      .bf-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .bf-btn { background:#1b1b22; border:1px solid rgba(255,255,255,.12); color:#fff; padding:8px 10px; border-radius:10px; cursor:pointer; }
      .bf-btn:hover:not([disabled]) { border-color: rgba(255,255,255,.3); }
      .bf-btn.danger { background:#3b0a0a; border-color:#6b1010; }
      .bf-btn.ghost { background:transparent; }
      .bf-btn[disabled] { opacity:.5; cursor:not-allowed; }
      .bf-tabs { display:flex; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); flex-wrap:wrap; }
      .bf-tab { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.12); padding:6px 10px; border-radius:999px; cursor:pointer; }
      .bf-tab-on { background:#1b1b22; }
      .bf-main { padding:12px; }
      .bf-card { background:#111118; border:1px solid rgba(255,255,255,.10); border-radius:16px; padding:12px; }
      .bf-card-head { margin-bottom:10px; }
      .bf-card-title { font-weight:800; }
      .bf-dim { opacity:.75; }
      .bf-terminal { background:#050509; border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; height:42vh; overflow:auto; color:#eaeaea; font-family:system-ui; }
      .bf-line { padding:6px 0; border-bottom:1px dashed rgba(255,255,255,.06); line-height:1.35; margin:0 0 10px 0; }
      .bf-who { color:#b8ffcf; font-family:monospace; display:inline-block; min-width:44px; }
      .bf-textarea { width:100%; padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0b0b0f; color:#fff; margin-top:10px; }
      .bf-mini { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .bf-row { display:flex; gap:10px; flex-wrap:wrap; }
      .bf-stat { background:#0b0b0f; border:1px solid rgba(255,255,255,.10); border-radius:12px; padding:8px 10px; }
      .bf-stat-label { opacity:.7; font-size:12px; }
      .bf-stat-val { font-weight:800; }
      .bf-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
      .bf-field .bf-label { opacity:.75; font-size:12px; margin-bottom:4px; }
      .bf-input { width:100%; padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0b0b0f; color:#fff; }
      .bf-footer { padding:12px; border-top:1px solid rgba(255,255,255,.08); }
      .bf-hud { opacity:.9; font-size:13px; display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .bf-stack { display:flex; flex-direction:column; gap:10px; }
      .bf-save { background:#0b0b0f; border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:10px; }
      .bf-save-top { display:flex; justify-content:space-between; gap:10px; }
      .bf-pill { padding:4px 10px; border-radius:999px; background:#1b1b22; font-size:12px; }
      .bf-pill.on { background:#0b2b12; color:#61ff9a; }
      .bf-save-actions { display:flex; gap:8px; margin-top:10px; }
      .bf-log { background:#0b0b0f; border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:10px; }
      .bf-log-top { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      @keyframes bf-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
    </style>
  `;

  function playView(save) {
    const transcript = save.campaign && Array.isArray(save.campaign.transcript) ? save.campaign.transcript : [];
    const lines = transcript.slice(-18).map((m) => {
      const isObj = m && typeof m === "object";
      const w = String(isObj ? m.who : "").toLowerCase();
      const who = w === "player" || w === "you" || w === "pc" ? "YOU" : "GM";
      const text = typeof m === "string" ? m : (isObj && (m.text || m.say || m.content)) || "";
      return `<div class="bf-line"><b class="bf-who">${who}:</b> <span style="white-space:pre-wrap;">${esc(text)}</span></div>`;
    }).join("");

    const conjuringState = ui.inFlight 
      ? `<div class="bf-line" style="border:none;"><b class="bf-who" style="color:#61ff9a;">SYS:</b> <span style="color:#61ff9a; animation: bf-pulse 1.5s infinite;">Conjuring response...</span></div>` 
      : "";

    const rollPanel = ui.pendingRoll ? `
      <section class="bf-card" style="margin-top:10px; border-color:#61ff9a;">
        <div class="bf-card-head">
          <div class="bf-card-title">Roll Required</div>
          <div class="bf-dim">${esc(ui.pendingRoll.prompt || "")}</div>
        </div>
        <div class="bf-row">
          <div class="bf-stat"><div class="bf-stat-label">Dice</div><div class="bf-stat-val">${esc(ui.pendingRoll.dice)}</div></div>
          <div class="bf-stat"><div class="bf-stat-label">TN</div><div class="bf-stat-val">${Number(ui.pendingRoll.tn || 0)}</div></div>
          <div class="bf-stat"><div class="bf-stat-label">Stat</div><div class="bf-stat-val">${esc(ui.pendingRoll.stat || "none")}</div></div>
          <div class="bf-stat"><div class="bf-stat-label">Mod</div><div class="bf-stat-val">${Number(ui.pendingRoll.mod || 0)}</div></div>
        </div>

        <div style="margin-top:12px; padding:16px; background:#0b0b0f; border:1px solid rgba(255,255,255,.05); border-radius:8px; text-align:center;">
          <div id="rollSpinnerNumber" style="font-size:36px; font-weight:900; font-family:monospace; color:#61ff9a; min-height:42px;">--</div>
          <div id="rollSpinnerMessage" class="bf-dim" style="min-height:20px; margin-top:4px;">Awaiting the bones...</div>
          <button class="bf-btn" id="btnAskDark" ${disAttr()} style="margin-top:12px; background:#0b2b12; border-color:#61ff9a; color:#61ff9a; width:100%; max-width:200px; font-weight:bold;">Ask the Dark</button>
        </div>

        <div class="bf-dim" style="margin-top:16px; font-size:12px; text-align:center;">Or enter a physical roll manually:</div>
        <div class="bf-mini" style="margin-top:6px; justify-content:center;">
          <input class="bf-input" id="rollNat" placeholder="Natural roll" inputmode="numeric" style="max-width:110px;"/>
          <button class="bf-btn ghost" id="btnRollNow" ${disAttr()}>Submit</button>
        </div>
      </section>
    ` : "";

    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Story Terminal</div>
          <div class="bf-dim">Talk to the world. The world talks back.</div>
        </div>
        <div class="bf-terminal" id="term">
          ${lines ? lines : `<div class="bf-dim">No transcript yet.</div>`}
          ${conjuringState}
        </div>
        <textarea id="playerInput" class="bf-textarea" rows="3" placeholder="What do you do?" ${disAttr()}></textarea>
        <div class="bf-mini" style="margin-top:10px;">
          <button class="bf-btn" id="btnSend" ${disAttr()}>Send</button>
          <button class="bf-btn ghost" id="btnNudge" ${disAttr()}>Nudge GM</button>
        </div>
        ${rollPanel}
      </section>
    `;
  }

  function savesView() { /* omitted for brevity, keeping exact layout from your file */
    const db = loadDB();
    const activeId = getActiveSaveId();
    const cards = (db.saves || []).map((s) => `
      <div class="bf-save">
        <div class="bf-save-top">
          <div>
            <div style="font-weight:800;">${esc(s.title || "Save")}</div>
            <div class="bf-dim">${esc(s.updatedAt || "")}</div>
            <div class="bf-dim">${esc((s.character && s.character.name) || "")}</div>
          </div>
          <div class="bf-pill ${s.id === activeId ? "on" : ""}">${s.id === activeId ? "ACTIVE" : ""}</div>
        </div>
        <div class="bf-save-actions">
          <button class="bf-btn" data-load="${esc(s.id)}">Load</button>
          <button class="bf-btn danger" data-del="${esc(s.id)}">Delete</button>
        </div>
      </div>
    `).join("");

    return `
      <section class="bf-card">
        <div class="bf-card-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div><div class="bf-card-title">Continue / New Game</div><div class="bf-dim">Pick a save, or forge a new one.</div></div>
          <button class="bf-btn" id="btnNewSave">New Save</button>
        </div>
        <div class="bf-stack" style="margin-top:10px;">${cards || `<div class="bf-dim">No saves yet.</div>`}</div>
      </section>
    `;
  }

  function characterView(save) {
    const c = save.character || {};
    const field = (lbl, id, val) => `<label class="bf-field"><div class="bf-label">${esc(lbl)}</div><input class="bf-input" id="${esc(id)}" value="${esc(val ?? "")}"></label>`;
    const num = (lbl, id, val) => `<label class="bf-field"><div class="bf-label">${esc(lbl)}</div><input class="bf-input" id="${esc(id)}" type="number" value="${Number(val ?? 0)}"></label>`;
    return `
      <section class="bf-card">
        <div class="bf-card-head"><div class="bf-card-title">Character</div><div class="bf-dim">Edit basics. The GM handles the rest.</div></div>
        <div class="bf-grid" style="margin-top:10px;">
          ${field("Name","char_name",c.name || "Eli Brogan")} ${field("Background","char_bg",c.background || "Park Ranger")}
          ${num("Grit","char_grit",c.grit || 1)} ${num("Instinct","char_instinct",c.instinct || 2)} ${num("Will","char_will",c.will || 1)}
          ${num("Presence","char_presence",c.presence || 0)} ${num("Discipline","char_disc",c.discipline || 0)}
        </div>
      </section>
    `;
  }

  function logView(save) {
    const items = (save.sessionLog || []).slice(0, 120).map((e) => `
      <div class="bf-log">
        <div class="bf-log-top"><div><b>${esc(e.type || "LOG")}</b> — ${esc(e.text || "")}</div><div class="bf-dim">${esc(e.at || "")}</div></div>
      </div>
    `).join("");
    return `
      <section class="bf-card">
        <div class="bf-card-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div class="bf-card-title">Log</div><button class="bf-btn ghost" id="btnClearLog">Clear Log</button>
        </div>
        <div class="bf-stack" style="margin-top:10px;">${items || `<div class="bf-dim">No log entries yet.</div>`}</div>
      </section>
    `;
  }

  function settingsView() {
    return `
      <section class="bf-card">
        <div class="bf-card-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div><div class="bf-card-title">Settings</div><div class="bf-dim">GM Endpoint: <b>${GM_ENDPOINT ? "SET" : "NOT SET"}</b></div></div>
          <button class="bf-btn danger" id="btnHardReset">Hard Reset All</button>
        </div>
      </section>
    `;
  }

  // ---- Bindings ----
  function bindPlay() {
    const input = document.getElementById("playerInput");
    
    document.getElementById("btnSend")?.addEventListener("click", () => {
      if (ui.inFlight) return;
      const t = (input?.value || "").trim();
      if (!t) return;
      input.value = "";
      gmTurn({ type: "player_action", text: t });
    });

    document.getElementById("btnNudge")?.addEventListener("click", () => {
      if (ui.inFlight) return;
      gmTurn({ type: "nudge", text: "Escalate tension. Present danger. Force a meaningful decision." });
    });

    // UX Upgrade: Ask The Dark Drumroll
    document.getElementById("btnAskDark")?.addEventListener("click", async () => {
      if (ui.inFlight || !ui.pendingRoll) return;
      
      document.querySelectorAll('button, input, textarea').forEach(el => el.disabled = true);
      
      const nat = await summonD20({
        slotEl: document.getElementById("rollSpinnerNumber"),
        messageEl: document.getElementById("rollSpinnerMessage")
      });

      processRoll(nat);
    });

    // UX Upgrade: Manual Roll Validation
    document.getElementById("btnRollNow")?.addEventListener("click", () => {
      if (ui.inFlight || !ui.pendingRoll) return;
      const typed = Number(document.getElementById("rollNat")?.value || "");
      if (!Number.isFinite(typed) || typed < 1 || typed > 20) {
        alert("Please enter a valid natural roll between 1 and 20.");
        return;
      }
      processRoll(typed);
    });
  }

  async function processRoll(nat) {
    const live = safeGetActiveSave();
    const stat = computeStat(live, ui.pendingRoll.stat);
    const mod = Number(ui.pendingRoll.mod || 0);
    const wounds = Number((live.character && live.character.wounds) || 0);
    const stress = Number((live.character && live.character.stress) || 0);
    const penalty = wounds + Math.floor(stress / 3);

    const total = nat + stat + mod - penalty;
    const rollPacket = {
      nat, total, dice: ui.pendingRoll.dice || "d20",
      kind: ui.pendingRoll.kind || "Check",
      tn: Number(ui.pendingRoll.tn || 12),
      statName: ui.pendingRoll.stat || "none",
      mod, stat, penalty,
    };

      ui.pendingRoll = null;
      pushLocalLog(null, "ROLL", `${rollPacket.kind} — ${rollPacket.dice} ${nat} → ${total} vs TN ${rollPacket.tn}`, rollPacket);
    
      // --- STORY TERMINAL FIX ---
      live.campaign.transcript.push({ who: "player", text: `[ I rolled a ${nat} on the d20 ]` });
      commitActiveSave(live);
      // --------------------------

      if (typeof render === "function") render();

     
    await gmTurn({ type: "roll_result", text: "Roll result attached.", roll: rollPacket });
  }

  function bindSaves() {
    document.getElementById("btnNewSave")?.addEventListener("click", () => {
      const db = loadDB();
      const s = defaultSaveSlot();
      s.title = `Save ${(db.saves?.length || 0) + 1}`;
      s.updatedAt = nowISO();
      db.saves = db.saves || []; db.saves.push(s);
      writeDB(db); setActiveSaveId(s.id);
      ui.tab = "play"; render();
    });
    document.querySelectorAll("[data-load]").forEach(b => b.onclick = () => { setActiveSaveId(b.dataset.load); ui.tab = "play"; render(); });
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      const db = loadDB(); db.saves = db.saves.filter(s => s.id !== b.dataset.del);
      writeDB(db); bootstrapFreshDB(); render();
    });
  }

  function bindCharacter() {
    const bindInput = (id, setter) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = () => {
        const fresh = safeGetActiveSave();
        setter(el.value, fresh.character || (fresh.character = {}));
        commitActiveSave(fresh); render();
      };
    };
    bindInput("char_name", (v, c) => c.name = v); bindInput("char_bg", (v, c) => c.background = v);
    bindInput("char_grit", (v, c) => c.grit = Number(v)); bindInput("char_instinct", (v, c) => c.instinct = Number(v));
    bindInput("char_will", (v, c) => c.will = Number(v)); bindInput("char_presence", (v, c) => c.presence = Number(v));
    bindInput("char_disc", (v, c) => c.discipline = Number(v));
  }

  function bindLog() { document.getElementById("btnClearLog")?.addEventListener("click", () => { const s = safeGetActiveSave(); s.sessionLog = []; commitActiveSave(s); render(); }); }
  function bindSettings() { document.getElementById("btnHardReset")?.addEventListener("click", () => hardResetAndRebuild("settings")); }

  function hardResetAndRebuild(from) {
    if (typeof hardResetAllSaves === "function") hardResetAllSaves(); else localStorage.clear();
    bootstrapFreshDB();
    pushLocalLog(null, "SYS", `Hard Reset executed (${from}) — DB rebuilt`);
    ui.tab = "play"; ui.pendingRoll = null; render();
  }

  async function gmTurn(event) {
    if (ui.inFlight) return;
    ui.inFlight = true;

    try {
      let save = safeGetActiveSave();
      save.campaign = save.campaign || {};
      save.campaign.transcript = Array.isArray(save.campaign.transcript) ? save.campaign.transcript : [];
      save.campaign.turn = Number(save.campaign.turn || 0);

      if (event.type === "player_action") {
        save.campaign.transcript.push({ who: "player", text: event.text });
        save.campaign.turn += 1;
        commitActiveSave(save);
      }

      // UX Upgrade: Instantly render to trigger the "Conjuring..." animation
      render(save);
      const term = document.getElementById("term");
      if (term) term.scrollTop = term.scrollHeight;

      if (!GM_ENDPOINT) { pushLocalLog(null, "ERROR", "GM endpoint not set."); return; }

      const payload = {
        schema: window.BF_GM?.schema || null,
        save: { character: save.character, campaign: { campaignId: save.campaign.campaignId, turn: save.campaign.turn, transcript: save.campaign.transcript.slice(-24) }, worldFlags: save.worldFlags },
        event,
      };

      const res = await fetch(GM_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const raw = await res.text();
      if (!res.ok) { pushLocalLog(null, "ERROR", `HTTP ${res.status} — ${raw.slice(0, 200)}`); return; }

      const data = JSON.parse(raw);
      save = safeGetActiveSave();
      const safeTranscript = save.campaign.transcript.slice();

      if (data.patch && window.BF_GM?.applyPatch) save = window.BF_GM.applyPatch(save, data.patch);
      save.campaign.transcript = safeTranscript;

      for (const line of Array.isArray(data.say) ? data.say : ["(No response)"]) {
        save.campaign.transcript.push({ who: "gm", text: String(line) });
      }
      commitActiveSave(save);

      if (data.roll?.needRoll) {
        ui.pendingRoll = { dice: data.roll.dice || "d20", kind: data.roll.kind || "Check", tn: Number(data.roll.tn || 12), stat: data.roll.stat || "none", mod: Number(data.roll.mod || 0), prompt: data.roll.prompt || "Make a roll." };
      } else { ui.pendingRoll = null; }

    } finally {
      ui.inFlight = false;
      render(safeGetActiveSave());
      const term = document.getElementById("term");
      if (term) term.scrollTop = term.scrollHeight;
    }
  }

  function render(saveArg) {
    const save = saveArg || safeGetActiveSave();
    const c = save.character || {};
    const campaignId = save.campaign?.campaignId || "—";
    const turn = save.campaign?.turn || 0;
    const activeId = getActiveSaveId ? getActiveSaveId() : "—";

    $app.innerHTML = `
      ${FALLBACK_CSS}
      <div class="bf-shell">
        <div class="bf-topbar">${esc(TATTOO)} • Save: ${esc(activeId)}</div>
        <nav class="bf-tabs">${tabBtn("play","Play")}${tabBtn("saves","Saves")}${tabBtn("character","Character")}${tabBtn("log","Log")}${tabBtn("settings","Settings")}</nav>
        <main class="bf-main">
          ${ui.tab === "play" ? playView(save) : ""}
          ${ui.tab === "saves" ? savesView() : ""}
          ${ui.tab === "character" ? characterView(save) : ""}
          ${ui.tab === "log" ? logView(save) : ""}
          ${ui.tab === "settings" ? settingsView() : ""}
        </main>
        <footer class="bf-footer"><div class="bf-hud"><div><b>${esc(c.name || "—")}</b> — HP ${c.hp}/${c.maxHp} • W ${c.wounds} • Stress ${c.stress}</div><div class="bf-dim">Turn: ${turn}</div></div></footer>
      </div>
    `;

    document.querySelectorAll("[data-tab]").forEach(btn => btn.onclick = () => { ui.tab = btn.dataset.tab; render(); });
    document.getElementById("exportBtn")?.addEventListener("click", () => {}); 
    document.getElementById("hardResetTop")?.addEventListener("click", () => hardResetAndRebuild("top"));

    if (ui.tab === "play") bindPlay();
    if (ui.tab === "saves") bindSaves();
    if (ui.tab === "character") bindCharacter();
    if (ui.tab === "log") bindLog();
    if (ui.tab === "settings") bindSettings();
  }

  // ---- Start & Auto-Seed ----
  try {
    const s = bootstrapFreshDB();
    render();
    
    // UX Fix: The Blank Start - Auto-seed the game if transcript is empty
    if (s.campaign && (!s.campaign.transcript || s.campaign.transcript.length === 0)) {
      setTimeout(() => { gmTurn({ type: "nudge", text: "Begin the campaign." }); }, 300);
    }
  } catch (e) { fatalScreen(e); }
})();
