/* ============================================================
   🪨 CAVECODE — LOCKED BLOCK
   BROKEN FRONTIER RPG — PLAYER RUNTIME

   ROLE:
   Player-facing PWA runtime for character interaction, transcript,
   FateCaster presentation, saves, and transport to IPC.

   ARCHITECTURE CONTRACT:
   - PWA owns player input and presentation.
   - FateCaster generates or accepts exactly one natural d20.
   - IPC owns final roll arithmetic, consequences, and world truth.
   - One player action advances one campaign turn.
   - A roll_result resolves that same action; it is not a new turn.

   FRONTEND:
   GitHub Pages

   DEPENDS ON:
   save.js (window.BF_DB helpers)
   gm.schema.js (window.BF_GM)
   optional scenes.js legacy compatibility

   ENDPOINT:
   window.BF_GM_ENDPOINT = ".../api/turn"

   RUNTIME REPAIR 002:
   Reconciles the PWA → IPC roll contract without changing the
   player-facing FateCaster ritual or save UI.
   ============================================================ */

(function () {
  if (window.__BF_APP_RUNNING__) return;
  window.__BF_APP_RUNNING__ = true;

  // ASH PATCH A: Running proof stamp
  const TATTOO = `IPC ENGINE • BUILD 2026-08-23 • RUNTIME REPAIR 002 • RUNNING PROOF ${new Date().toISOString()}`;

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

  async function summonD20({ slotEl, messageEl, minMs = 500, maxMs = 1200, outcome = null } = {}) {
  const totalMs = randInt(minMs, maxMs);
  const start = performance.now();

  if (messageEl) {
    messageEl.textContent = "Awaiting your Fate…";
  }

  return await new Promise((resolve) => {
    const timer = setInterval(() => {
      const n = randInt(1, 20);
      if (slotEl) slotEl.textContent = String(n);

      if (performance.now() - start >= totalMs) {
        clearInterval(timer);

        const final = randInt(1, 20);
        if (slotEl) slotEl.textContent = String(final);

        // Optional tonal reinforcement
        let suffix = "";
        if (outcome === "success") suffix = " — The Fates favor you.";
        if (outcome === "failure") suffix = " — The Fates turn away.";

        if (messageEl) {
          messageEl.textContent = `Your Fate has been cast: ${final}${suffix}`;
        }

        setTimeout(() => resolve(final), 1200);
      }
    }, 35);
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

      // ASH PATCH C1: IPC SETTINGS (NEW SAVE)
      s.settings = (s.settings && typeof s.settings === "object") ? s.settings : {};
      if (typeof s.settings.letBonesDecide !== "boolean") s.settings.letBonesDecide = false;

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

    // ASH PATCH C2: IPC MIGRATION - heal older saves (safe, no drama)
    let changed = false;
    for (const s of db.saves) {
      if (!s || typeof s !== "object") continue;

      s.character = (s.character && typeof s.character === "object") ? s.character : {};
      s.campaign  = (s.campaign  && typeof s.campaign  === "object") ? s.campaign  : {};
      s.worldFlags = (s.worldFlags && typeof s.worldFlags === "object") ? s.worldFlags : {};
      s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];
      s.campaign.turn = Number(s.campaign.turn || 0);
      s.campaign.campaignId = String(s.campaign.campaignId || "oregon_brogan_v1");

      s.settings = (s.settings && typeof s.settings === "object") ? s.settings : {};
      if (typeof s.settings.letBonesDecide !== "boolean") { s.settings.letBonesDecide = false; changed = true; }
    }
    if (changed) writeDB(db);

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

  // ASH PATCH B: Upgrade ui to include autoToken
  const ui = { tab: "play", pendingRoll: null, inFlight: false, autoToken: 0 };

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

  function savesView() {
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

  // ASH PATCH D: Replace settingsView() with IPC Ritual Settings toggle
  function settingsView() {
    const s = safeGetActiveSave();
    s.settings = (s.settings && typeof s.settings === "object") ? s.settings : {};
    const checked = s.settings.letBonesDecide ? "checked" : "";

    return `
      <section class="bf-card">
        <div class="bf-card-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div class="bf-card-title">Settings</div>
            <div class="bf-dim">GM Endpoint: <b>${GM_ENDPOINT ? "SET" : "NOT SET"}</b></div>
          </div>
        </div>

        <div style="margin-top:12px; padding:12px; background:#0b0b0f; border:1px solid rgba(255,255,255,.08); border-radius:14px;">
          <div style="font-weight:800; margin-bottom:8px;">Ritual Settings</div>

          <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
            <input type="checkbox" id="toggleBones" ${checked}>
            <span><b>Let the Bones Decide</b> (Auto-Invocation)</span>
          </label>

          <div class="bf-dim" style="font-size:12px; margin-top:6px;">
            When ON: after a short grace period, IPC will roll automatically unless you roll manually or press Ask the Dark.
          </div>

          <hr style="opacity:0.1; margin:15px 0;">

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

    // ASH PATCH G: Cancel pending auto-roll when Ask the Dark is pressed
    document.getElementById("btnAskDark")?.addEventListener("click", async () => {
      if (ui.inFlight || !ui.pendingRoll) return;
      
      ui.autoToken++; // cancel pending auto-invocation
      
      document.querySelectorAll('button, input, textarea').forEach(el => el.disabled = true);
      
      const nat = await summonD20({
        slotEl: document.getElementById("rollSpinnerNumber"),
        messageEl: document.getElementById("rollSpinnerMessage")
      });

      processRoll(nat);
    });

    // ASH PATCH G: Cancel pending auto-roll when manual roll is submitted
    document.getElementById("btnRollNow")?.addEventListener("click", () => {
      if (ui.inFlight || !ui.pendingRoll) return;
      
      ui.autoToken++; // cancel pending auto-invocation
      
      const typed = Number(document.getElementById("rollNat")?.value || "");
      if (!Number.isFinite(typed) || typed < 1 || typed > 20) {
        alert("Please enter a valid natural roll between 1 and 20.");
        return;
      }
      processRoll(typed);
    });
  }

  // ============================================================
  // 🎮 CAVECODE — GAME LOGIC BLOCK
  // FATECASTER RESULT HANDOFF
  //
  // The PWA may calculate a preview so the local log is immediate,
  // but the preview is NOT authoritative. IPC receives the natural
  // d20 plus the roll request context and recalculates everything
  // from the saved character.
  //
  // This block must submit only ONE natural result for a pending
  // roll. Do not turn animation numbers into game results.
  // ============================================================
  async function processRoll(nat) {
    const live = safeGetActiveSave();
    const pending = ui.pendingRoll;
    if (!pending) return;

    const statName = String(pending.stat || "will").toLowerCase();
    const statValue = computeStat(live, statName);
    const mod = Number(pending.mod || 0);
    const wounds = Number((live.character && live.character.wounds) || 0);
    const stress = Number((live.character && live.character.stress) || 0);
    const penalty = wounds + Math.floor(stress / 3);

    const total = nat + statValue + mod - penalty;

    const rollPacket = {
      natural: nat,
      dice: pending.dice || "d20",
      kind: pending.kind || "Check",
      tn: Number(pending.tn || 12),
      stat: statName,
      mod,
      actionText: String(pending.actionText || ""),
      clientPreview: {
        statValue,
        penalty,
        total,
      },
    };

    ui.pendingRoll = null;

    pushLocalLog(
      null,
      "ROLL",
      `${rollPacket.kind} — ${rollPacket.dice} ${nat} → ${total} vs TN ${rollPacket.tn}`,
      rollPacket
    );

    live.campaign.transcript.push({
      who: "player",
      text: `[ I rolled a ${nat} on the d20 ]`,
    });
    commitActiveSave(live);

    if (typeof render === "function") render();

    await gmTurn({
      type: "roll_result",
      text: "Roll result attached.",
      roll: rollPacket,
    });
  }

  // ASH PATCH F: Add the Auto-Invocation function (Tier 3)
  async function handleAutoInvocation() {
    const save = safeGetActiveSave();
    const enabled = !!(save.settings && save.settings.letBonesDecide);
    if (!enabled) return;
    if (!ui.pendingRoll) return;
    if (ui.inFlight) return;

    const myToken = ++ui.autoToken;

    // Grace window so the player can type a roll or press Ask the Dark
    await new Promise(r => setTimeout(r, 1200));

    if (myToken !== ui.autoToken) return;
    if (!ui.pendingRoll) return;
    if (ui.inFlight) return;

    // Mirror Ask the Dark behavior
    document.querySelectorAll("button, input, textarea").forEach(el => el.disabled = true);

    const nat = await summonD20({
      slotEl: document.getElementById("rollSpinnerNumber"),
      messageEl: document.getElementById("rollSpinnerMessage")
    });

    processRoll(nat);
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
  
  // ASH PATCH E: Upgrade bindSettings() to save the toggle
  function bindSettings() {
    document.getElementById("toggleBones")?.addEventListener("change", (e) => {
      const fresh = safeGetActiveSave();
      fresh.settings = (fresh.settings && typeof fresh.settings === "object") ? fresh.settings : {};
      fresh.settings.letBonesDecide = !!e.target.checked;
      commitActiveSave(fresh);
      pushLocalLog(null, "SETTINGS", `Let the Bones Decide = ${fresh.settings.letBonesDecide}`, null);
    });

    document.getElementById("btnHardReset")?.addEventListener("click", () => hardResetAndRebuild("settings"));
  }

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

      // ========================================================
      // 🪨 CAVECODE — LOCKED BLOCK
      // TURN AUTHORITY
      //
      // The PWA records what the player said, but it does NOT
      // advance campaign.turn. IPC advances the turn exactly once
      // when it receives the player_action.
      // ========================================================
      if (event.type === "player_action") {
        save.campaign.transcript.push({ who: "player", text: event.text });
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
        // Keep the original action attached to the pending roll so
        // IPC resolves the consequence against what the character
        // actually attempted, not transport text such as
        // "Roll result attached."
        ui.pendingRoll = {
          dice: data.roll.dice || "d20",
          kind: data.roll.kind || "Check",
          tn: Number(data.roll.tn || 12),
          stat: data.roll.stat || "none",
          mod: Number(data.roll.mod || 0),
          prompt: data.roll.prompt || "Make a roll.",
          actionText: event.type === "player_action" ? String(event.text || "") : "",
        };
      } else {
        ui.pendingRoll = null;
      }

    } finally {
      ui.inFlight = false;
      render(safeGetActiveSave());
      const term = document.getElementById("term");
      if (term) term.scrollTop = term.scrollHeight;
      
      // ASH PATCH H: Fire auto-invocation after GM sets pendingRoll
      handleAutoInvocation();
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
