/* Broken Frontier RPG — PWA v1.1 (Story Terminal UI)
   - Uses save.js (your save core)
   - Uses scenes.js (story content)
   - No frameworks. Mobile-first.
*/

(function () {
  // PWA register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  const $app = document.getElementById("app");
  const SCENES = window.BF_SCENES || {};

  // ---- Load active save (from your save.js) ----
  let save = getActiveSave();

  // ---- Helpers ----
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  function pushLog(type, text, data) {
    save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];
    save.sessionLog.unshift({
      at: new Date().toISOString(),
      type,
      text,
      data: data || null
    });
    commitActiveSave(save);
  }

  function setScene(sceneId) {
    save.campaign = save.campaign || {};
    save.campaign.sceneId = sceneId;
    commitActiveSave(save);
  }

  function currentScene() {
    const id = (save.campaign && save.campaign.sceneId) || "warehouse_entry";
    return SCENES[id] ? { id, ...SCENES[id] } : { id, title:"Unknown Scene", text:["(Scene not found)"], options:[] };
  }

  function modHP(delta) {
    save.character.hp = Math.max(0, Math.min(save.character.maxHp, save.character.hp + delta));
    commitActiveSave(save);
  }

  function modStress(delta) {
    save.character.stress = Math.max(0, save.character.stress + delta);
    commitActiveSave(save);
  }

  function modWounds(delta) {
    save.character.wounds = Math.max(0, save.character.wounds + delta);
    commitActiveSave(save);
  }

  function toggleExposed(force) {
    if (typeof force === "boolean") save.character.exposed = force;
    else save.character.exposed = !save.character.exposed;
    commitActiveSave(save);
  }

  // ---- UI ----
  const state = { tab: "play" };

  function render() {
    // refresh save each render (in case import/load changed it)
    save = getActiveSave();

    const scene = currentScene();
    const hp = save.character.hp;
    const maxHp = save.character.maxHp;
    const wounds = save.character.wounds;
    const stress = save.character.stress;
    const exposed = !!save.character.exposed;

    $app.innerHTML = `
      <div class="bf-shell">
        <header class="bf-header">
          <div class="bf-brand">
            <div class="bf-badge">BF</div>
            <div class="bf-title">
              <div class="bf-name">Broken Frontier RPG</div>
              <div class="bf-sub">Core Engine — Story Terminal</div>
            </div>
          </div>

          <div class="bf-actions">
            <button class="bf-btn ghost" id="exportBtn">Export Save</button>
            <button class="bf-btn ghost" id="importBtn">Import Save</button>
          </div>
        </header>

        <nav class="bf-tabs">
          ${tabBtn("play","Play")}
          ${tabBtn("saves","Saves")}
          ${tabBtn("character","Character")}
          ${tabBtn("roll","Roll")}
          ${tabBtn("log","Log")}
          ${tabBtn("settings","Settings")}
        </nav>

        <main class="bf-main">
          ${state.tab === "play" ? playView(scene) : ""}
          ${state.tab === "saves" ? savesView() : ""}
          ${state.tab === "character" ? characterView() : ""}
          ${state.tab === "roll" ? rollView() : ""}
          ${state.tab === "log" ? logView() : ""}
          ${state.tab === "settings" ? settingsView() : ""}
        </main>

        <footer class="bf-footer">
          <div class="bf-hud">
            <div><b>${esc(save.character.name)}</b> — HP ${hp}/${maxHp} • W ${wounds} • Stress ${stress} • Exposed ${exposed ? "YES" : "NO"}</div>
            <div class="bf-dim">Campaign: ${(save.campaign && save.campaign.campaignId) || "—"} • Scene: ${scene.id}</div>
          </div>
        </footer>
      </div>
    `;

    // bind nav
    document.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-tab");
        render();
      });
    });

    // export/import
    document.getElementById("exportBtn").onclick = exportActiveSave;
    document.getElementById("importBtn").onclick = importSavePrompt;

    // bind view-specific buttons
    bindPlay(scene);
    bindSaves();
    bindCharacter();
    bindRoll();
    bindLog();
    bindSettings();
  }

  function tabBtn(id, label) {
    const active = state.tab === id ? "active" : "";
    return `<button class="bf-tab ${active}" data-tab="${id}">${label}</button>`;
  }

  // ---- Views ----
  function playView(scene) {
    const lines = (scene.text || []).map(t => `<div class="bf-line">${esc(t)}</div>`).join("");
    const opts = (scene.options || []).map((o, i) => `
      <button class="bf-choice" data-next="${esc(o.next)}">${esc(o.label)}</button>
    `).join("");

    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">${esc(scene.title || "Scene")}</div>
          <div class="bf-mini">
            <button class="bf-btn ghost" id="btnCover">Take Cover (HP)</button>
            <button class="bf-btn ghost" id="btnAid">First Aid</button>
          </div>
        </div>

        <div class="bf-terminal">
          ${lines}
        </div>

        <div class="bf-choices">
          ${opts || `<div class="bf-dim">No options set for this scene yet.</div>`}
        </div>
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
            <div class="bf-dim">${esc((s.character && s.character.name) || "")} — HP ${(s.character && s.character.hp) || 0}/${(s.character && s.character.maxHp) || 0} • W ${(s.character && s.character.wounds) || 0} • Stress ${(s.character && s.character.stress) || 0}</div>
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

  function characterView() {
    const c = save.character;
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Character Sheet</div>
          <div class="bf-mini">
            <button class="bf-btn ghost" id="btnExposed">${c.exposed ? "Clear Exposed" : "Set Exposed"}</button>
            <button class="bf-btn ghost" id="btn0hp">0 HP Check</button>
          </div>
        </div>

        <div class="bf-grid">
          ${field("Name","char_name",c.name)}
          ${field("Background","char_bg",c.background)}
          ${num("Grit","char_grit",c.grit)}
          ${num("Instinct","char_instinct",c.instinct)}
          ${num("Will","char_will",c.will)}
          ${num("Presence","char_presence",c.presence)}
          ${num("Discipline","char_disc",c.discipline)}
        </div>

        <div class="bf-row">
          <div class="bf-stat">
            <div class="bf-stat-label">HP</div>
            <div class="bf-stat-val">${c.hp} / ${c.maxHp}</div>
            <div class="bf-mini">
              <button class="bf-btn ghost" id="hpMinus">-</button>
              <button class="bf-btn ghost" id="hpPlus">+</button>
            </div>
          </div>
          <div class="bf-stat">
            <div class="bf-stat-label">Wounds</div>
            <div class="bf-stat-val">${c.wounds}</div>
            <div class="bf-mini">
              <button class="bf-btn ghost" id="wMinus">-</button>
              <button class="bf-btn ghost" id="wPlus">+</button>
            </div>
          </div>
          <div class="bf-stat">
            <div class="bf-stat-label">Stress</div>
            <div class="bf-stat-val">${c.stress}</div>
            <div class="bf-mini">
              <button class="bf-btn ghost" id="sMinus">-</button>
              <button class="bf-btn ghost" id="sPlus">+</button>
            </div>
          </div>
        </div>

        <div class="bf-row">
          <div class="bf-stat">
            <div class="bf-stat-label">Ammo</div>
            <div class="bf-stat-val">${c.ammo}</div>
            <div class="bf-mini">
              <button class="bf-btn ghost" id="aMinus">-</button>
              <button class="bf-btn ghost" id="aPlus">+</button>
            </div>
          </div>
          <div class="bf-stat">
            <div class="bf-stat-label">Exposed</div>
            <div class="bf-stat-val">${c.exposed ? "YES" : "NO"}</div>
          </div>
        </div>

        <div class="bf-note">
          <div class="bf-dim">Inventory / Notes</div>
          <textarea id="char_notes" class="bf-textarea" rows="3">${esc(c.notes || "")}</textarea>
        </div>
      </section>
    `;
  }

  function rollView() {
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Roll Resolver</div>
          <button class="bf-btn" id="rollD20">Roll d20</button>
        </div>

        <div class="bf-grid">
          ${select("Roll Type","roll_type",["Check","Attack","Defense","Fear"],"Check")}
          ${select("Stat Used","roll_stat",["None","Grit","Instinct","Will","Presence","Discipline"],"None")}
          ${num("Target Number (TN)","roll_tn",12)}
          ${num("Modifier","roll_mod",0)}
        </div>

        <div class="bf-note">
          <div class="bf-dim">GM Note (optional)</div>
          <input id="roll_note" class="bf-input" placeholder="What happened?" />
        </div>

        <div class="bf-row">
          <div class="bf-stat">
            <div class="bf-stat-label">Natural</div>
            <div class="bf-stat-val" id="out_nat">—</div>
          </div>
          <div class="bf-stat">
            <div class="bf-stat-label">Total</div>
            <div class="bf-stat-val" id="out_total">—</div>
          </div>
          <div class="bf-stat">
            <div class="bf-stat-label">Outcome</div>
            <div class="bf-stat-val" id="out_outcome">—</div>
          </div>
        </div>

        <div class="bf-mini" style="margin-top:10px;">
          <button class="bf-btn ghost" id="logRollBtn">Log Roll</button>
        </div>
      </section>
    `;
  }

  function logView() {
    const items = (save.sessionLog || []).slice(0, 40).map(e => `
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
          <div class="bf-card-title">Session Log</div>
          <button class="bf-btn ghost" id="btnClearLog">Clear Log</button>
        </div>
        <div class="bf-stack">
          ${items || `<div class="bf-dim">No entries yet.</div>`}
        </div>
      </section>
    `;
  }

  function settingsView() {
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Settings</div>
          <button class="bf-btn danger" id="btnHardReset">Hard Reset All</button>
        </div>

        <div class="bf-dim" style="margin-top:8px;">
          Minimal prototype settings live here later. For now: don’t overbuild it.
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
  function select(label, id, options, chosen) {
    const opts = options.map(o => `<option ${o===chosen?"selected":""}>${esc(o)}</option>`).join("");
    return `
      <label class="bf-field">
        <div class="bf-label">${esc(label)}</div>
        <select class="bf-input" id="${esc(id)}">${opts}</select>
      </label>
    `;
  }

  // ---- Bindings ----
  function bindPlay(scene) {
    document.querySelectorAll(".bf-choice").forEach(btn => {
      btn.onclick = () => {
        const next = btn.getAttribute("data-next");
        // update “GM memory”
        save.campaign.lastTurn = save.campaign.lastTurn || {};
        save.campaign.lastTurn.summary = (scene.text || []).join(" ").slice(0, 200);
        save.campaign.lastTurn.options = (scene.options || []).map(o => o.label);

        commitActiveSave(save);
        setScene(next);
        pushLog("SCENE", `Moved to ${next}`);
        render();
      };
    });

    const cover = document.getElementById("btnCover");
    if (cover) cover.onclick = () => {
      // Simple prototype effect: small HP recovery, clears Exposed
      modHP(+2);
      toggleExposed(false);
      pushLog("ACTION", "Took cover (+2 HP, Exposed cleared)");
      render();
    };

    const aid = document.getElementById("btnAid");
    if (aid) aid.onclick = () => {
      // Prototype: reduce stress a bit; don’t erase wounds for free
      modStress(-1);
      pushLog("ACTION", "First aid (-1 Stress)");
      render();
    };
  }

  function bindSaves() {
    const btnNew = document.getElementById("btnNewSave");
    if (btnNew) btnNew.onclick = () => {
      const db = loadDB();
      const s = defaultSaveSlot();
      s.title = `Save ${((db.saves || []).length) + 1}`;
      db.saves = Array.isArray(db.saves) ? db.saves : [];
      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);
      save = s;
      pushLog("SAVE", "Created new save");
      render();
    };

    document.querySelectorAll("[data-load]").forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute("data-load");
        setActiveSaveId(id);
        save = getActiveSave();
        pushLog("SAVE", `Loaded ${id}`);
        render();
      };
    });

    document.querySelectorAll("[data-del]").forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute("data-del");
        const db = loadDB();
        db.saves = (db.saves || []).filter(s => s.id !== id);
        writeDB(db);
        if (getActiveSaveId() === id) {
          localStorage.removeItem("bf_active_save_id_v1");
        }
        render();
      };
    });
  }

  function bindCharacter() {
    const c = save.character;

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

    const notes = document.getElementById("char_notes");
    if (notes) {
      notes.onchange = () => {
        c.notes = notes.value;
        commitActiveSave(save);
      };
    }

    const btnExposed = document.getElementById("btnExposed");
    if (btnExposed) btnExposed.onclick = () => { toggleExposed(); pushLog("STATE","Toggled Exposed"); render(); };

    const btn0 = document.getElementById("btn0hp");
    if (btn0) btn0.onclick = () => {
      if (save.character.hp <= 0) {
        modWounds(+1);
        modStress(+1);
        pushLog("DANGER", "0 HP check: +1 Wound, +1 Stress");
      } else {
        pushLog("INFO", "0 HP check: not at 0 HP");
      }
      render();
    };

    // +/- buttons
    const hpMinus = document.getElementById("hpMinus");
    const hpPlus = document.getElementById("hpPlus");
    if (hpMinus) hpMinus.onclick = () => { modHP(-1); pushLog("STATE","HP -1"); render(); };
    if (hpPlus) hpPlus.onclick = () => { modHP(+1); pushLog("STATE","HP +1"); render(); };

    const wMinus = document.getElementById("wMinus");
    const wPlus = document.getElementById("wPlus");
    if (wMinus) wMinus.onclick = () => { modWounds(-1); pushLog("STATE","Wounds -1"); render(); };
    if (wPlus) wPlus.onclick = () => { modWounds(+1); pushLog("STATE","Wounds +1"); render(); };

    const sMinus = document.getElementById("sMinus");
    const sPlus = document.getElementById("sPlus");
    if (sMinus) sMinus.onclick = () => { modStress(-1); pushLog("STATE","Stress -1"); render(); };
    if (sPlus) sPlus.onclick = () => { modStress(+1); pushLog("STATE","Stress +1"); render(); };

    const aMinus = document.getElementById("aMinus");
    const aPlus = document.getElementById("aPlus");
    if (aMinus) aMinus.onclick = () => { save.character.ammo = Math.max(0, save.character.ammo - 1); commitActiveSave(save); pushLog("STATE","Ammo -1"); render(); };
    if (aPlus) aPlus.onclick = () => { save.character.ammo = save.character.ammo + 1; commitActiveSave(save); pushLog("STATE","Ammo +1"); render(); };
  }

  // roll UI output cache
  let lastRoll = null;

  function bindRoll() {
    const btn = document.getElementById("rollD20");
    const logBtn = document.getElementById("logRollBtn");
    if (!btn) return;

    btn.onclick = () => {
      const nat = Math.floor(Math.random() * 20) + 1;

      const tn = Number(document.getElementById("roll_tn").value || 12);
      const mod = Number(document.getElementById("roll_mod").value || 0);

      const statName = document.getElementById("roll_stat").value;
      let stat = 0;
      if (statName && statName !== "None") {
        const key = statName.toLowerCase();
        stat = Number(save.character[key] || 0);
      }

      // Simple pressure: wounds + stress reduce your edge
      const penalty = Number(save.character.wounds || 0) + Math.floor(Number(save.character.stress || 0) / 3);

      const total = nat + mod + stat - penalty;
      const margin = total - tn;

      let outcome = "FAIL";
      if (margin >= 5) outcome = "STRONG";
      else if (margin >= 0) outcome = "SUCCESS";

      // Catastrophic miss sets Exposed (prototype)
      if (nat === 1) {
        save.character.exposed = true;
        commitActiveSave(save);
        outcome = "CATASTROPHIC";
      }

      lastRoll = { nat, total, tn, margin, outcome, statName, mod, stat, penalty };

      document.getElementById("out_nat").textContent = String(nat);
      document.getElementById("out_total").textContent = String(total);
      document.getElementById("out_outcome").textContent = outcome;
    };

    if (logBtn) {
      logBtn.onclick = () => {
        if (!lastRoll) return;
        const note = (document.getElementById("roll_note").value || "").trim();
        pushLog("ROLL", `${lastRoll.outcome} — d20 ${lastRoll.nat} → ${lastRoll.total} vs TN ${lastRoll.tn}${note ? " — " + note : ""}`, lastRoll);
        render();
      };
    }
  }

  function bindLog() {
    const c = document.getElementById("btnClearLog");
    if (c) c.onclick = () => {
      save.sessionLog = [];
      commitActiveSave(save);
      render();
    };
  }

  function bindSettings() {
    const r = document.getElementById("btnHardReset");
    if (r) r.onclick = () => {
      hardResetAllSaves();
      location.reload();
    };
  }

  // ---- Export / Import ----
  function exportActiveSave() {
    const s = getActiveSave();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(s.title || "save").replace(/\s+/g,"_").toLowerCase()}.json`;
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

      // patch + store
      imported = patchSave(imported);
      const db = loadDB();
      db.saves = Array.isArray(db.saves) ? db.saves : [];
      // if same id exists, replace it
      const idx = db.saves.findIndex(x => x.id === imported.id);
      if (idx >= 0) db.saves[idx] = imported;
      else db.saves.push(imported);
      writeDB(db);
      setActiveSaveId(imported.id);
      render();
    };
    input.click();
  }

  // ---- Boot ----
  if (!save.campaign || !save.campaign.sceneId) {
    save.campaign = save.campaign || {};
    save.campaign.campaignId = save.campaign.campaignId || "oregon_brogan_v1";
    save.campaign.sceneId = "warehouse_entry";
    commitActiveSave(save);
  }

  render();
})();
