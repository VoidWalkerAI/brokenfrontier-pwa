/* app.js — Broken Frontier RPG (AI-GM Terminal + Saves)
   - Frontend (GitHub Pages)
   - Uses save.js (multi-save DB)
   - Uses gm.schema.js (optional patch rules)
   - Calls Cloudflare Worker endpoint: window.BF_GM_ENDPOINT (/api/turn)

   FIX v2:
   - Hard Reset no longer strands the app in a black screen.
   - App self-heals if DB/active save is missing.
*/

(function () {
  const TATTOO = "BUILD 2026-02-18 — TATTOO V1.1 — Hard Reset self-heal";

  // PWA register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  const $app = document.getElementById("app");
  if (!$app) return;

  const GM_ENDPOINT = window.BF_GM_ENDPOINT || "";

  // ---- Helpers ----
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));

  function nowISO() {
    return new Date().toISOString();
  }

  // If anything fatal happens, show it instead of black screen
  function fatalScreen(err) {
    const msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
    $app.innerHTML = `
      <div style="padding:16px; color:#fff; font-family:system-ui; background:#0b0b0f; min-height:100vh;">
        <div style="padding:10px 12px; background:#3b0a0a; border:1px solid #6b1010; border-radius:10px;">
          <b>FATAL — App crashed</b>
          <div style="opacity:.85; margin-top:6px; font-family:monospace; white-space:pre-wrap;">${esc(msg)}</div>
        </div>
        <div style="margin-top:12px; opacity:.8;">
          This should not happen anymore. If you see this, copy the error text and paste it to me.
        </div>
      </div>
    `;
  }

  // ---- DB Self-Heal Layer ----
  function bootstrapFreshDB() {
    const db = loadDB();
    db.saves = Array.isArray(db.saves) ? db.saves : [];

    // create a default save if none exist
    if (!db.saves.length) {
      const s = defaultSaveSlot();
      s.title = "Save 1";
      s.updatedAt = nowISO();

      // default character seed (safe)
      s.character = s.character || {
        name: "Eli Brogan",
        background: "Park Ranger",
        grit: 1, instinct: 2, will: 1, presence: 0, discipline: 0,
        hp: 13, maxHp: 13, wounds: 0, stress: 0, exposed: false, ammo: 6
      };

      // default campaign seed
      s.campaign = s.campaign || {};
      s.campaign.campaignId = s.campaign.campaignId || "oregon_brogan_v1";
      s.campaign.turn = Number(s.campaign.turn || 0);
      s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

      // ensure log exists
      s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];
      s.sessionLog.unshift({ at: nowISO(), type: "BOOT", text: `Fresh DB created (${TATTOO})`, data: null });

      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);
      return s;
    }

    // ensure active id points at something real
    const activeId = getActiveSaveId();
    const hasActive = db.saves.some(x => x.id === activeId);
    if (!hasActive) {
      setActiveSaveId(db.saves[0].id);
    }

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

  function pushLocalLog(save, type, text, data) {
    save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];
    save.sessionLog.unshift({ at: nowISO(), type, text, data: data || null });
    commitActiveSave(save);
  }

  function computeStat(save, statName) {
    const c = save.character || {};
    const key = String(statName || "").toLowerCase();
    return Number(c[key] || 0);
  }

  function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
  }
  function roll2d6() {
    return (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);
  }

  // ---- UI State ----
  const ui = { tab: "play", pendingRoll: null };

  function tabBtn(id, label) {
    const active = ui.tab === id ? "active" : "";
    return `<button class="bf-tab ${active}" data-tab="${id}">${label}</button>`;
  }

  // ---- Views ----
  function playView(save) {
    const transcript = (save.campaign && save.campaign.transcript) || [];
    const last = transcript.slice(-18);

    const lines = last.map(m => {
      const who = m.who === "player" ? "YOU" : "GM";
      return `<div class="bf-line"><b class="bf-who">${who}:</b> ${esc(m.text)}</div>`;
    }).join("");

    const rollPanel = ui.pendingRoll ? `
      <section class="bf-card" style="margin-top:10px;">
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

        <div class="bf-dim" style="margin-top:8px;">Roll physical dice if you want. Tap Roll Now, then type your natural result.</div>
        <div class="bf-mini" style="margin-top:10px;">
          <input class="bf-input" id="rollNat" placeholder="Enter natural roll (optional)" inputmode="numeric"/>
        </div>

        <div class="bf-mini" style="margin-top:10px;">
          <button class="bf-btn" id="btnRollNow">Roll Now</button>
          <button class="bf-btn ghost" id="btnCancelRoll">Cancel</button>
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
          ${lines || `<div class="bf-dim">No transcript yet. Type what you do.</div>`}
        </div>

        <div class="bf-note" style="margin-top:12px;">
          <div class="bf-dim">What do you do?</div>
          <textarea id="playerInput" class="bf-textarea" rows="3" placeholder="Example: I shoulder the door open, light first, gun low, and listen."></textarea>
        </div>

        <div class="bf-mini" style="margin-top:10px;">
          <button class="bf-btn" id="btnSend">Send</button>
          <button class="bf-btn ghost" id="btnNudge">Nudge GM</button>
        </div>

        ${rollPanel}
      </section>
    `;
  }

  function savesView() {
    const db = loadDB();
    const activeId = getActiveSaveId();

    const cards = (db.saves || []).map(s => `
      <div class="bf-save">
        <div class="bf-save-top">
          <div>
            <div class="bf-save-title">${esc(s.title || "Save")}</div>
            <div class="bf-dim">${esc(s.updatedAt || "")}</div>
            <div class="bf-dim">${esc((s.character && s.character.name) || "")} — HP ${(s.character && s.character.hp) || 0}/${(s.character && s.character.maxHp) || 0}</div>
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
        <div class="bf-card-head">
          <div class="bf-card-title">Continue / New Game</div>
          <button class="bf-btn" id="btnNewSave">New Save</button>
        </div>
        <div class="bf-stack">
          ${cards || `<div class="bf-dim">No saves yet.</div>`}
        </div>
      </section>
    `;
  }

  function characterView(save) {
    const c = save.character || {};
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Character</div>
          <div class="bf-dim">Edit basics. The GM handles the rest.</div>
        </div>

        <div class="bf-grid">
          ${field("Name","char_name",c.name || "Eli Brogan")}
          ${field("Background","char_bg",c.background || "Park Ranger")}
          ${num("Grit","char_grit",c.grit || 1)}
          ${num("Instinct","char_instinct",c.instinct || 2)}
          ${num("Will","char_will",c.will || 1)}
          ${num("Presence","char_presence",c.presence || 0)}
          ${num("Discipline","char_disc",c.discipline || 0)}
        </div>
      </section>
    `;
  }

  function logView(save) {
    const items = (save.sessionLog || []).slice(0, 80).map(e => `
      <div class="bf-log">
        <div class="bf-log-top">
          <div><b>${esc(e.type || "LOG")}</b> — ${esc(e.text || "")}</div>
          <div class="bf-dim">${esc(e.at || "")}</div>
        </div>
      </div>
    `).join("");

    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Log</div>
          <button class="bf-btn ghost" id="btnClearLog">Clear Log</button>
        </div>
        <div class="bf-stack">
          ${items || `<div class="bf-dim">No log entries yet.</div>`}
        </div>
      </section>
    `;
  }

  function settingsView() {
    const endpointSet = GM_ENDPOINT ? "SET" : "NOT SET";
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Settings</div>
          <button class="bf-btn danger" id="btnHardReset">Hard Reset All</button>
        </div>

        <div class="bf-dim" style="margin-top:8px;">
          GM Endpoint: <b>${esc(endpointSet)}</b><br/>
          (Set window.BF_GM_ENDPOINT in index.html. Must include /api/turn)
        </div>
      </section>
    `;
  }

  // ---- Components ----
  function field(label, id, val) {
    return `
      <label class="bf-field">
        <div class="bf-label">${esc(label)}</div>
        <input class="bf-input" id="${esc(id)}" value="${esc(val ?? "")}">
      </label>
    `;
  }
  function num(label, id, val) {
    return `
      <label class="bf-field">
        <div class="bf-label">${esc(label)}</div>
        <input class="bf-input" id="${esc(id)}" type="number" value="${Number(val ?? 0)}">
      </label>
    `;
  }

  // ---- Bindings ----
  function bindPlay() {
    const input = document.getElementById("playerInput");

    const send = document.getElementById("btnSend");
    if (send) send.onclick = async () => {
      const live = safeGetActiveSave();
      pushLocalLog(live, "UI", "SEND pressed");

      const text = (input.value || "").trim();
      if (!text) return;

      input.value = "";
      await gmTurn({ type: "player_action", text });
    };

    const nudge = document.getElementById("btnNudge");
    if (nudge) nudge.onclick = async () => {
      const live = safeGetActiveSave();
      pushLocalLog(live, "UI", "NUDGE pressed");
      await gmTurn({ type: "nudge", text: "Escalate tension. Present danger. Force a meaningful decision." });
    };

    const rollNow = document.getElementById("btnRollNow");
    const cancelRoll = document.getElementById("btnCancelRoll");
    const rollNat = document.getElementById("rollNat");

    if (rollNow) rollNow.onclick = async () => {
      if (!ui.pendingRoll) return;

      const typed = Number((rollNat && rollNat.value || "").trim());
      const dice = ui.pendingRoll.dice || "d20";
      const nat =
        Number.isFinite(typed) && typed > 0
          ? typed
          : (dice === "2d6" ? roll2d6() : rollD20());

      const live = safeGetActiveSave();
      const stat = computeStat(live, ui.pendingRoll.stat);
      const mod = Number(ui.pendingRoll.mod || 0);

      const wounds = Number(live.character.wounds || 0);
      const stress = Number(live.character.stress || 0);
      const penalty = wounds + Math.floor(stress / 3);

      const total = nat + stat + mod - penalty;

      const rollPacket = {
        nat, total, dice,
        kind: ui.pendingRoll.kind || "Check",
        tn: Number(ui.pendingRoll.tn || 12),
        statName: ui.pendingRoll.stat || "none",
        mod, stat, penalty
      };

      ui.pendingRoll = null;
      if (rollNat) rollNat.value = "";

      pushLocalLog(live, "ROLL", `${rollPacket.kind} — ${dice} ${nat} → ${total} vs TN ${rollPacket.tn}`, rollPacket);

      await gmTurn({ type: "roll_result", text: "Roll result attached.", roll: rollPacket });
    };

    if (cancelRoll) cancelRoll.onclick = () => {
      ui.pendingRoll = null;
      render();
    };
  }

  function bindSaves() {
    const btnNew = document.getElementById("btnNewSave");
    if (btnNew) btnNew.onclick = () => {
      const db = loadDB();
      const s = defaultSaveSlot();
      s.title = `Save ${((db.saves || []).length) + 1}`;
      s.updatedAt = nowISO();

      db.saves = Array.isArray(db.saves) ? db.saves : [];
      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);

      pushLocalLog(s, "SAVE", "Created new save");
      ui.tab = "play";
      render();
    };

    document.querySelectorAll("[data-load]").forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute("data-load");
        setActiveSaveId(id);
        const s = safeGetActiveSave();
        pushLocalLog(s, "SAVE", `Loaded ${id}`);
        ui.tab = "play";
        render();
      };
    });

    document.querySelectorAll("[data-del]").forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute("data-del");
        const db = loadDB();
        db.saves = (db.saves || []).filter(s => s.id !== id);
        writeDB(db);

        // self-heal active slot after delete
        bootstrapFreshDB();

        render();
      };
    });
  }

  function bindCharacter() {
    const save = safeGetActiveSave();
    const c = save.character || (save.character = {});
    const bindInput = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.onchange = () => {
        fn(el.value);
        commitActiveSave(save);
        render();
      };
    };

    bindInput("char_name", (v) => (c.name = v));
    bindInput("char_bg", (v) => (c.background = v));
    bindInput("char_grit", (v) => (c.grit = Number(v)));
    bindInput("char_instinct", (v) => (c.instinct = Number(v)));
    bindInput("char_will", (v) => (c.will = Number(v)));
    bindInput("char_presence", (v) => (c.presence = Number(v)));
    bindInput("char_disc", (v) => (c.discipline = Number(v)));
  }

  function bindLog() {
    const save = safeGetActiveSave();
    const btn = document.getElementById("btnClearLog");
    if (btn) btn.onclick = () => {
      save.sessionLog = [];
      commitActiveSave(save);
      render();
    };
  }

  function bindSettings() {
    const btn = document.getElementById("btnHardReset");
    if (btn) btn.onclick = () => hardResetAndRebuild("settings");
  }

  // ---- Hard Reset: wipe + rebuild + render (NO BLACK SCREEN) ----
  function hardResetAndRebuild(from) {
    try {
      // wipe (use your existing helper if present)
      if (typeof hardResetAllSaves === "function") {
        hardResetAllSaves();
      } else {
        // fallback nuking, just in case
        localStorage.clear();
      }

      // rebuild immediately
      const s = bootstrapFreshDB();
      pushLocalLog(s, "SYS", `Hard Reset executed (${from}) — DB rebuilt`);
      ui.tab = "play";
      ui.pendingRoll = null;
      render();
    } catch (e) {
      fatalScreen(e);
    }
  }

  // ---- GM Turn (calls backend) ----
  async function gmTurn(event) {
    let save = safeGetActiveSave();

    save.campaign = save.campaign || {};
    save.campaign.transcript = Array.isArray(save.campaign.transcript) ? save.campaign.transcript : [];
    save.campaign.turn = Number(save.campaign.turn || 0);

    if (event.type === "player_action") {
      save.campaign.transcript.push({ who: "player", text: event.text });
      save.campaign.turn += 1;
      commitActiveSave(save);
      render();
    }

    if (!GM_ENDPOINT) {
      pushLocalLog(save, "ERROR", "GM endpoint not set. Add window.BF_GM_ENDPOINT in index.html.");
      render();
      return;
    }

    const transcript = (save.campaign.transcript || []).slice(-24);

    const payload = {
      schema: window.BF_GM && window.BF_GM.schema ? window.BF_GM.schema : null,
      save: {
        character: save.character,
        campaign: {
          campaignId: save.campaign.campaignId,
          turn: save.campaign.turn,
          transcript
        },
        worldFlags: save.worldFlags
      },
      event
    };

    pushLocalLog(save, "NET", `POST → ${GM_ENDPOINT}`);

    let data;
    try {
      const res = await fetch(GM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const raw = await res.text();
      pushLocalLog(save, "NET", `RAW ← ${raw.slice(0, 200)}`);

      if (!res.ok) {
        pushLocalLog(save, "ERROR", `GM HTTP ${res.status} ${res.statusText} — ${raw.slice(0, 200)}`);
        render();
        return;
      }

      try {
        data = JSON.parse(raw);
      } catch {
        pushLocalLog(save, "ERROR", `GM returned non-JSON — ${raw.slice(0, 200)}`);
        render();
        return;
      }

      pushLocalLog(save, "NET", `HTTP ${res.status}`);
    } catch (e) {
      pushLocalLog(save, "ERROR", `GM fetch failed — ${String(e)}`);
      render();
      return;
    }

const say = Array.isArray(data.say) ? data.say : ["(GM returned nothing.)"];
const patch = data.patch || null;
const roll = data.roll || null;

save = safeGetActiveSave();

// HARDEN campaign every time (prevents null/undefined campaign after reset/import)
save.campaign = save.campaign || {};
save.campaign.transcript = Array.isArray(save.campaign.transcript) ? save.campaign.transcript : [];

const beforeLen = save.campaign.transcript.length;
for (const line of say) {
  save.campaign.transcript.push({ who: "gm", text: line });
}
const afterLen = save.campaign.transcript.length;

// PROOF LOG: did we actually append?
pushLocalLog(save, "SYS", `TRANSCRIPT +${afterLen - beforeLen} (now ${afterLen})`);

if (patch && window.BF_GM && typeof window.BF_GM.applyPatch === "function") {
  save = window.BF_GM.applyPatch(save, patch);
  save.campaign = save.campaign || {};
  if (!Array.isArray(save.campaign.transcript)) save.campaign.transcript = transcriptKeep;
}

commitActiveSave(save);
    if (roll && roll.needRoll) {
      ui.pendingRoll = {
        dice: roll.dice || "d20",
        kind: roll.kind || "Check",
        tn: Number(roll.tn || 12),
        stat: roll.stat || "none",
        mod: Number(roll.mod || 0),
        prompt: roll.prompt || "Make a roll."
      };
    } else {
      ui.pendingRoll = null;
    }

    render();

    const term = document.getElementById("term");
    if (term) term.scrollTop = term.scrollHeight;
  }

  // ---- Export / Import ----
  function exportActiveSave() {
    const s = safeGetActiveSave();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(s.title || "save").replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importSavePrompt() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const text = await file.text();
      let imported;
      try { imported = JSON.parse(text); } catch { return; }

      imported = patchSave(imported);
      const db = loadDB();
      db.saves = Array.isArray(db.saves) ? db.saves : [];
      const idx = db.saves.findIndex(x => x.id === imported.id);
      if (idx >= 0) db.saves[idx] = imported;
      else db.saves.push(imported);

      writeDB(db);
      setActiveSaveId(imported.id);
      render();
    };
    input.click();
  }

  // ---- Render Shell ----
  function render() {
    try {
      const save = safeGetActiveSave();
      const c = save.character || {};

      const hp = Number(c.hp || 0);
      const maxHp = Number(c.maxHp || 0);
      const wounds = Number(c.wounds || 0);
      const stress = Number(c.stress || 0);
      const exposed = !!c.exposed;

      const campaignId = (save.campaign && save.campaign.campaignId) || "—";
      const turn = Number((save.campaign && save.campaign.turn) || 0);

      $app.innerHTML = `
        <div class="bf-shell">

          <div style="padding:8px 12px; background:#0b2b12; color:#61ff9a; font-family:monospace; font-size:12px;">
            ${esc(TATTOO)} • Endpoint: ${GM_ENDPOINT ? "SET" : "NOT SET"}
          </div>

          <header class="bf-header">
            <div class="bf-brand">
              <div class="bf-badge">BF</div>
              <div class="bf-title">
                <div class="bf-name">Broken Frontier RPG</div>
                <div class="bf-sub">AI-GM Runtime — ${esc(campaignId)} — Turn ${turn}</div>
              </div>
            </div>

            <div class="bf-actions">
              <button class="bf-btn ghost" id="exportBtn">Export Save</button>
              <button class="bf-btn ghost" id="importBtn">Import Save</button>
              <button class="bf-btn danger" id="hardResetTop">Hard Reset</button>
            </div>
          </header>

          <nav class="bf-tabs">
            ${tabBtn("play","Play")}
            ${tabBtn("saves","Saves")}
            ${tabBtn("character","Character")}
            ${tabBtn("log","Log")}
            ${tabBtn("settings","Settings")}
          </nav>

          <main class="bf-main">
            ${ui.tab === "play" ? playView(save) : ""}
            ${ui.tab === "saves" ? savesView() : ""}
            ${ui.tab === "character" ? characterView(save) : ""}
            ${ui.tab === "log" ? logView(save) : ""}
            ${ui.tab === "settings" ? settingsView() : ""}
          </main>

          <footer class="bf-footer">
            <div class="bf-hud">
              <div><b>${esc(c.name || "—")}</b> — HP ${hp}/${maxHp} • W ${wounds} • Stress ${stress} • Exposed ${exposed ? "YES" : "NO"}</div>
              <div class="bf-dim">Campaign: ${esc(campaignId)} • Turn: ${turn}</div>
            </div>
          </footer>
        </div>
      `;

      // tabs
      document.querySelectorAll("[data-tab]").forEach(btn => {
        btn.onclick = () => { ui.tab = btn.getAttribute("data-tab"); render(); };
      });

      // export/import
      const ex = document.getElementById("exportBtn");
      const im = document.getElementById("importBtn");
      if (ex) ex.onclick = exportActiveSave;
      if (im) im.onclick = importSavePrompt;

      // hard reset (top) — NO reload, rebuild instantly
      const topReset = document.getElementById("hardResetTop");
      if (topReset) topReset.onclick = () => hardResetAndRebuild("top");

      // per-tab binds
      if (ui.tab === "play") bindPlay();
      if (ui.tab === "saves") bindSaves();
      if (ui.tab === "character") bindCharacter();
      if (ui.tab === "log") bindLog();
      if (ui.tab === "settings") bindSettings();

    } catch (e) {
      fatalScreen(e);
    }
  }

  // ---- Start ----
  try {
    bootstrapFreshDB();
    render();
  } catch (e) {
    fatalScreen(e);
  }
})();
