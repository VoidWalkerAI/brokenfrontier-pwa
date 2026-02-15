/* Broken Frontier RPG — Core Engine v1.0 (PWA Prototype)
   - Default: on-screen d20 roll
   - Saves: localStorage slots + export/import JSON
   - Engine: degrees of success (combat), HP+Wounds, Stress spillover, Exposed
*/

(function () {
  // ---------- PWA register ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  // ---------- Storage ----------
  const LS_KEY = "bf_rpg_saves_v1";
  const LS_ACTIVE = "bf_rpg_active_save_v1";

  /** @type {{ saves: SaveSlot[] }} */
  let db = loadDB();
  let activeSaveId = localStorage.getItem(LS_ACTIVE) || null;

  // ---------- Defaults ----------
  const DEFAULT_CHAR = () => ({
    name: "Eli Brogan",
    background: "Park Ranger",
    stats: { Grit: 1, Instinct: 2, Will: 1, Presence: 0, Discipline: 0 },
    hpMax: 14, // will recalc
    hpNow: 14,
    wounds: 0,
    stress: 0,
    exposed: false,
    ammo: 6,
    notes: "Revolver. Flashlight. Field dressing."
  });

  const DEFAULT_SETTINGS = () => ({
    combatScale: "on", // on/off
    enemyModel: "integrity",
    appNotes: ""
  });

  const newSaveSlot = () => ({
    id: uid(),
    name: `Save ${db.saves.length + 1}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    character: DEFAULT_CHAR(),
    log: [],
    settings: DEFAULT_SETTINGS(),
    worldFlags: {}
  });

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  // Tabs
  const tabButtons = [...document.querySelectorAll(".tab")];
  const tabPanels = {
    saves: $("tab-saves"),
    sheet: $("tab-sheet"),
    roll: $("tab-roll"),
    log: $("tab-log"),
    settings: $("tab-settings")
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.tab;
      Object.values(tabPanels).forEach((p) => p.classList.add("hidden"));
      tabPanels[key].classList.remove("hidden");
      renderAll();
    });
  });

  // Saves UI
  $("btnNewSave").addEventListener("click", () => {
    const s = newSaveSlot();
    db.saves.unshift(s);
    setActive(s.id);
    logEvent("SYSTEM", `Created new save: ${s.name}`);
    persist();
    renderAll();
  });

  // Export / Import
  $("btnExport").addEventListener("click", () => exportActive());
  $("fileImport").addEventListener("change", (e) => importFile(e));

  // Log
  $("btnClearLog").addEventListener("click", () => {
    const s = getActive();
    if (!s) return;
    s.log = [];
    persist();
    renderAll();
  });

  // Character sheet bindings
  const bindText = (elId, getter, setter) => {
    const el = $(elId);
    el.addEventListener("input", () => {
      const s = getActive(); if (!s) return;
      setter(s, el.value);
      touch(s);
      persist();
      renderAll();
    });
    el.value = getter(getActive() || newSaveSlot());
  };

  // Roll UI bindings
  $("btnRoll").addEventListener("click", () => {
    const s = getActive(); if (!s) return;
    const n = rollD20();
    $("natRoll").value = String(n);
    autoFillModifier();
    computeRollPreview();
  });

  $("btnClearRoll").addEventListener("click", () => {
    $("natRoll").value = "";
    $("gmNote").value = "";
    $("total").textContent = "--";
    $("margin").textContent = "--";
    $("outcome").textContent = "--";
    $("effects").textContent = "—";
  });

  ["rollType", "statUsed", "tn", "natRoll", "mod"].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (id === "statUsed") autoFillModifier();
      computeRollPreview();
    });
  });

  $("btnLogRoll").addEventListener("click", () => {
    const s = getActive(); if (!s) return;
    const entry = buildRollLogEntry();
    if (!entry) return;

    s.log.unshift(entry);
    touch(s);
    persist();
    renderAll();
  });

  // Sheet buttons
  $("hpMinus").addEventListener("click", () => bumpHP(-1));
  $("hpPlus").addEventListener("click", () => bumpHP(1));
  $("wdMinus").addEventListener("click", () => bumpWounds(-1));
  $("wdPlus").addEventListener("click", () => bumpWounds(1));
  $("stMinus").addEventListener("click", () => bumpStress(-1));
  $("stPlus").addEventListener("click", () => bumpStress(1));
  $("amMinus").addEventListener("click", () => bumpAmmo(-1));
  $("amPlus").addEventListener("click", () => bumpAmmo(1));
  $("expToggle").addEventListener("click", () => toggleExposed());
  $("btnDownCheck").addEventListener("click", () => downCheck());

  $("btnHealShort").addEventListener("click", () => takeCoverHeal());
  $("btnFirstAid").addEventListener("click", () => firstAid());

  // Settings bindings
  $("setCombatScale").addEventListener("change", () => {
    const s = getActive(); if (!s) return;
    s.settings.combatScale = $("setCombatScale").value;
    touch(s); persist(); renderAll();
  });
  $("setEnemyModel").addEventListener("change", () => {
    const s = getActive(); if (!s) return;
    s.settings.enemyModel = $("setEnemyModel").value;
    touch(s); persist(); renderAll();
  });
  $("appNotes").addEventListener("input", () => {
    const s = getActive(); if (!s) return;
    s.settings.appNotes = $("appNotes").value;
    touch(s); persist();
  });

  // ---------- Rendering ----------
  function renderAll() {
    renderSaveList();
    renderSheet();
    renderLog();
    renderSettings();
    // keep roll preview accurate
    autoFillModifier();
    computeRollPreview();
  }

  function renderSaveList() {
    const list = $("saveList");
    list.innerHTML = "";
    if (!db.saves.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `<div class="muted">No saves yet. Forge one.</div>`;
      list.appendChild(empty);
      return;
    }

    db.saves.forEach((s) => {
      const card = document.createElement("div");
      card.className = "card";
      const isActive = s.id === activeSaveId;

      card.innerHTML = `
        <div class="row split">
          <div>
            <div class="big" style="font-size:20px">${escapeHtml(s.name)}</div>
            <div class="muted small">Updated: ${fmtTime(s.updatedAt)}</div>
          </div>
          <div class="row">
            <span class="tag">${isActive ? "ACTIVE" : "SAVE"}</span>
          </div>
        </div>
        <div class="row split" style="margin-top:10px">
          <div class="muted small">${escapeHtml(s.character.name)} · HP ${s.character.hpNow}/${s.character.hpMax} · W ${s.character.wounds} · Stress ${s.character.stress}</div>
        </div>
        <div class="row split" style="margin-top:12px">
          <button class="btn ${isActive ? "ghost" : ""}" data-act="load">Load</button>
          <button class="btn danger" data-act="delete">Delete</button>
        </div>
      `;

      card.querySelector('[data-act="load"]').addEventListener("click", () => {
        setActive(s.id);
        logEvent("SYSTEM", `Loaded save: ${s.name}`);
        persist();
        renderAll();
      });

      card.querySelector('[data-act="delete"]').addEventListener("click", () => {
        const ok = confirm(`Delete "${s.name}"? This cannot be undone.`);
        if (!ok) return;
        db.saves = db.saves.filter((x) => x.id !== s.id);
        if (activeSaveId === s.id) activeSaveId = db.saves[0]?.id || null;
        localStorage.setItem(LS_ACTIVE, activeSaveId || "");
        persist();
        renderAll();
      });

      list.appendChild(card);
    });
  }

  function renderSheet() {
    const s = getActive();
    if (!s) return;

    // bind basic fields once each render (simple approach)
    $("chName").value = s.character.name;
    $("chBg").value = s.character.background;

    $("stGrit").value = s.character.stats.Grit;
    $("stInstinct").value = s.character.stats.Instinct;
    $("stWill").value = s.character.stats.Will;
    $("stPresence").value = s.character.stats.Presence;
    $("stDiscipline").value = s.character.stats.Discipline;

    // derived stats
    recalcDerived(s);

    $("hpNow").textContent = String(s.character.hpNow);
    $("hpMax").textContent = String(s.character.hpMax);
    $("wThresh").textContent = String(woundThreshold(s.character.hpMax));

    $("wdNow").textContent = String(s.character.wounds);
    $("stressNow").textContent = String(s.character.stress);
    $("stressPenalty").textContent = String(stressPenalty(s.character.stress));

    $("expNow").textContent = s.character.exposed ? "YES" : "NO";
    $("ammoNow").textContent = String(s.character.ammo);

    $("invNotes").value = s.character.notes;

    // inputs update
    $("chName").oninput = () => { s.character.name = $("chName").value; touch(s); persist(); };
    $("chBg").oninput = () => { s.character.background = $("chBg").value; touch(s); persist(); };

    $("stGrit").oninput = () => { s.character.stats.Grit = num($("stGrit").value); touch(s); persist(); renderSheet(); };
    $("stInstinct").oninput = () => { s.character.stats.Instinct = num($("stInstinct").value); touch(s); persist(); renderSheet(); };
    $("stWill").oninput = () => { s.character.stats.Will = num($("stWill").value); touch(s); persist(); renderSheet(); };
    $("stPresence").oninput = () => { s.character.stats.Presence = num($("stPresence").value); touch(s); persist(); renderSheet(); };
    $("stDiscipline").oninput = () => { s.character.stats.Discipline = num($("stDiscipline").value); touch(s); persist(); renderSheet(); };

    $("invNotes").oninput = () => { s.character.notes = $("invNotes").value; touch(s); persist(); };
  }

  function renderLog() {
    const s = getActive();
    const list = $("logList");
    list.innerHTML = "";
    if (!s) return;

    if (!s.log.length) {
      list.innerHTML = `<div class="muted">No entries yet. Roll or update your sheet.</div>`;
      return;
    }

    s.log.slice(0, 100).forEach((e) => {
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `
        <div class="log-top">
          <div class="row" style="gap:8px">
            <span class="tag">${escapeHtml(e.kind)}</span>
            <span class="muted small">${fmtTime(e.ts)}</span>
          </div>
          <div class="muted small">${escapeHtml(e.short || "")}</div>
        </div>
        ${e.detail ? `<div style="margin-top:8px" class="small">${escapeHtml(e.detail)}</div>` : ""}
      `;
      list.appendChild(item);
    });
  }

  function renderSettings() {
    const s = getActive();
    if (!s) return;
    $("setCombatScale").value = s.settings.combatScale;
    $("setEnemyModel").value = s.settings.enemyModel;
    $("appNotes").value = s.settings.appNotes || "";
  }

  // ---------- Engine ----------
  function rollD20() { return 1 + Math.floor(Math.random() * 20); }
  function stressPenalty(stress) { return -Math.floor(stress / 2); }
  function woundThreshold(hpMax) { return Math.ceil(hpMax / 2) + 1; }

  function recalcDerived(save) {
    const hpMax = 12 + num(save.character.stats.Grit);
    // keep hpNow not exceeding new hpMax
    const oldMax = save.character.hpMax || hpMax;
    save.character.hpMax = hpMax;
    if (save.character.hpNow > hpMax) save.character.hpNow = hpMax;
    // if hpMax increased, keep current hp proportionally? No. Keep as-is. (simple)
    if (save.character.hpNow <= 0) save.character.hpNow = 0;
    // clamp negatives
    save.character.wounds = clamp(num(save.character.wounds), 0, 9);
    save.character.stress = clamp(num(save.character.stress), 0, 99);
    save.character.ammo = clamp(num(save.character.ammo), 0, 999);
    save.character.exposed = !!save.character.exposed;
  }

  function computeModifierFromStat(save, statName) {
    const base = statName === "None" ? 0 : num(save.character.stats[statName] ?? 0);
    const woundPen = -num(save.character.wounds);
    const stressPen = stressPenalty(save.character.stress);
    return base + woundPen + stressPen;
  }

  function autoFillModifier() {
    const s = getActive();
    if (!s) return;
    const stat = $("statUsed").value;
    const computed = computeModifierFromStat(s, stat);
    $("mod").value = String(computed);
  }

  function computeRollPreview() {
    const s = getActive();
    if (!s) return;

    const nat = num($("natRoll").value);
    const mod = num($("mod").value);
    const tn = num($("tn").value);
    const type = $("rollType").value;

    if (!nat) {
      $("total").textContent = "--";
      $("margin").textContent = "--";
      $("outcome").textContent = "--";
      $("effects").textContent = "—";
      return;
    }

    const total = nat + mod;
    const margin = total - tn;

    $("total").textContent = String(total);
    $("margin").textContent = String(margin);

    const resolved = resolveOutcome({
      type,
      tn,
      nat,
      mod,
      total,
      margin,
      settings: s.settings
    });

    $("outcome").textContent = resolved.outcome;
    $("effects").textContent = resolved.effects;
  }

  function resolveOutcome({ type, tn, nat, mod, total, margin, settings }) {
    // combat degrees only for Attack by default (and when enabled)
    const combatScaled = (settings.combatScale === "on");

    if (type === "Attack" && combatScaled) {
      if (total >= tn) {
        if (margin >= 10) return { outcome: "CRITICAL HIT", effects: "+2 damage dice (enemy -2 Integrity)" };
        if (margin >= 5) return { outcome: "STRONG HIT", effects: "+1 damage die (enemy -1 Integrity)" };
        return { outcome: "HIT", effects: "Normal damage (enemy -1 Integrity on strong narrative hit)" };
      } else {
        const fail = tn - total;
        if (fail >= 10) return { outcome: "CATASTROPHIC", effects: "Exposed + immediate consequence (jam/stumble/counter)" };
        if (fail >= 5) return { outcome: "BAD MISS", effects: "Exposed (enemy pressure / closes distance)" };
        return { outcome: "MISS", effects: "No hit (position worsens)" };
      }
    }

    // non-attack checks: simple pass/fail (cleaner)
    if (total >= tn) {
      return { outcome: "SUCCESS", effects: margin >= 5 ? "Strong success (extra edge)" : "Success" };
    } else {
      const fail = tn - total;
      return { outcome: "FAIL", effects: fail >= 5 ? "Hard fail (pressure escalates)" : "Fail" };
    }
  }

  function buildRollLogEntry() {
    const s = getActive(); if (!s) return null;

    const type = $("rollType").value;
    const stat = $("statUsed").value;
    const tn = num($("tn").value);
    const nat = num($("natRoll").value);
    const mod = num($("mod").value);
    const note = ($("gmNote").value || "").trim();

    if (!nat || nat < 1 || nat > 20) {
      alert("Roll a d20 first (or enter a number 1–20).");
      return null;
    }

    const total = nat + mod;
    const margin = total - tn;
    const resolved = resolveOutcome({ type, tn, nat, mod, total, margin, settings: s.settings });

    // Apply a couple of core automatic effects (kept conservative)
    // - If Attack bad miss/catastrophic => set Exposed
    // - If Defense success => clear Exposed
    // - If Horror fail => +1 or +2 Stress (based on margin)
    applyRollEffects(s, { type, tn, nat, mod, total, margin, outcome: resolved.outcome });

    const short = `${type} · d20=${nat} ${mod >= 0 ? "+" : ""}${mod} = ${total} vs TN ${tn} → ${resolved.outcome}`;
    const detail = `${resolved.effects}${note ? " · " + note : ""}`;

    $("gmNote").value = "";
    return { kind: "ROLL", ts: Date.now(), short, detail };
  }

  function applyRollEffects(save, roll) {
    const ch = save.character;

    if (roll.type === "Attack") {
      if (roll.total < roll.tn) {
        const fail = roll.tn - roll.total;
        if (fail >= 5) {
          ch.exposed = true;
          logEvent("STATE", "Exposed set (bad miss)");
        }
      }
    }

    if (roll.type === "Defense") {
      if (roll.total >= roll.tn) {
        if (ch.exposed) logEvent("STATE", "Exposed cleared (defense success)");
        ch.exposed = false;
      }
    }

    if (roll.type === "Horror") {
      if (roll.total < roll.tn) {
        const fail = roll.tn - roll.total;
        const add = (fail >= 5) ? 2 : 1;
        ch.stress += add;
        logEvent("STATE", `Stress +${add} (horror fail)`);
        // If stress exceeds Will, prompt panic check via log
        if (ch.stress > num(ch.stats.Will)) {
          logEvent("PROMPT", "Stress exceeded Will — consider Panic check (Will vs TN 12).");
        }
      }
    }

    touch(save);
    persist();
    renderSheet();
  }

  // ---------- Sheet operations ----------
  function bumpHP(delta) {
    const s = getActive(); if (!s) return;
    recalcDerived(s);
    s.character.hpNow = clamp(s.character.hpNow + delta, 0, s.character.hpMax);
    touch(s);
    logEvent("STATE", `HP ${delta > 0 ? "+" : ""}${delta} → ${s.character.hpNow}/${s.character.hpMax}`);
    persist(); renderAll();
  }

  function bumpWounds(delta) {
    const s = getActive(); if (!s) return;
    s.character.wounds = clamp(s.character.wounds + delta, 0, 9);
    touch(s);
    logEvent("STATE", `Wounds ${delta > 0 ? "+" : ""}${delta} → ${s.character.wounds}`);
    persist(); renderAll();
  }

  function bumpStress(delta) {
    const s = getActive(); if (!s) return;
    s.character.stress = clamp(s.character.stress + delta, 0, 99);
    touch(s);
    logEvent("STATE", `Stress ${delta > 0 ? "+" : ""}${delta} → ${s.character.stress}`);
    persist(); renderAll();
  }

  function bumpAmmo(delta) {
    const s = getActive(); if (!s) return;
    s.character.ammo = clamp(s.character.ammo + delta, 0, 999);
    touch(s);
    logEvent("STATE", `Ammo ${delta > 0 ? "+" : ""}${delta} → ${s.character.ammo}`);
    persist(); renderAll();
  }

  function toggleExposed() {
    const s = getActive(); if (!s) return;
    s.character.exposed = !s.character.exposed;
    touch(s);
    logEvent("STATE", `Exposed → ${s.character.exposed ? "YES" : "NO"}`);
    persist(); renderAll();
  }

  function downCheck() {
    const s = getActive(); if (!s) return;
    recalcDerived(s);
    if (s.character.hpNow > 0) {
      alert("Down Check is for 0 HP only.");
      return;
    }
    const nat = rollD20();
    const mod = computeModifierFromStat(s, "Grit");
    const total = nat + mod;
    const tn = 12;
    const fail = tn - total;

    let woundsAdded = 0;
    let result = "STABILIZED";
    if (total < tn) {
      woundsAdded = (fail >= 5) ? 2 : 1;
      s.character.wounds += woundsAdded;
      result = (woundsAdded === 2) ? "DOWN FAIL (2 WOUNDS)" : "DOWN FAIL (1 WOUND)";
    }

    s.log.unshift({
      kind: "DOWN",
      ts: Date.now(),
      short: `0 HP Check · d20=${nat} ${mod >= 0 ? "+" : ""}${mod}=${total} vs 12 → ${result}`,
      detail: woundsAdded ? `Wounds +${woundsAdded}.` : `Stabilized (still prone).`
    });

    touch(s); persist(); renderAll();
  }

  function takeCoverHeal() {
    const s = getActive(); if (!s) return;
    // Take Cover: simple heal roll (Grit vs 10), recover 1d6 HP, capped at half max during combat (we don't track combat state yet)
    const nat = rollD20();
    const mod = computeModifierFromStat(s, "Grit");
    const total = nat + mod;
    const tn = 10;

    let healed = 0;
    if (total >= tn) {
      healed = rollDie(6);
      if ((total - tn) >= 5) healed += 2;
      const cap = Math.ceil(s.character.hpMax / 2);
      const newHp = Math.min(s.character.hpNow + healed, cap);
      healed = newHp - s.character.hpNow;
      s.character.hpNow = newHp;
    }

    s.log.unshift({
      kind: "COVER",
      ts: Date.now(),
      short: `Take Cover · d20=${nat} ${mod >= 0 ? "+" : ""}${mod}=${total} vs 10 → ${healed ? "RECOVER" : "NO RECOVERY"}`,
      detail: healed ? `HP +${healed} (cap half max).` : `No recovery.`
    });

    touch(s); persist(); renderAll();
  }

  function firstAid() {
    const s = getActive(); if (!s) return;
    // First Aid (combat): remove 1 wound + recover 1d6 HP on success (Medicine not tracked yet; use Discipline as placeholder)
    const nat = rollD20();
    const mod = computeModifierFromStat(s, "Discipline");
    const total = nat + mod;
    const tn = 12;

    let healed = 0;
    let removed = 0;

    if (total >= tn) {
      removed = (s.character.wounds > 0) ? 1 : 0;
      if (removed) s.character.wounds -= 1;
      healed = rollDie(6);
      if ((total - tn) >= 5) healed += 2;
      s.character.hpNow = clamp(s.character.hpNow + healed, 0, s.character.hpMax);
    } else {
      healed = Math.max(1, rollDie(3)); // small recovery even on failure if you want; keep it modest
      s.character.hpNow = clamp(s.character.hpNow + healed, 0, s.character.hpMax);
    }

    s.log.unshift({
      kind: "AID",
      ts: Date.now(),
      short: `First Aid · d20=${nat} ${mod >= 0 ? "+" : ""}${mod}=${total} vs 12`,
      detail: `HP +${healed}${removed ? " · Wound -1" : ""}`
    });

    touch(s); persist(); renderAll();
  }

  // ---------- Export / Import ----------
  function exportActive() {
    const s = getActive();
    if (!s) {
      alert("No active save to export.");
      return;
    }
    const payload = JSON.stringify(s, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeFilename(s.name)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || !obj.id || !obj.character) throw new Error("Invalid save file.");

        // prevent collisions
        obj.id = uid();
        obj.name = `${obj.name || "Imported Save"} (Imported)`;
        obj.updatedAt = Date.now();
        db.saves.unshift(obj);
        setActive(obj.id);
        persist();
        renderAll();
      } catch (err) {
        alert("Import failed. Not a valid save file.");
      } finally {
        $("fileImport").value = "";
      }
    };
    reader.readAsText(f);
  }

  // ---------- Helpers ----------
  function loadDB() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { saves: [] };
      const parsed = JSON.parse(raw);
      if (!parsed?.saves) return { saves: [] };
      return parsed;
    } catch {
      return { saves: [] };
    }
  }

  function persist() {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
    if (activeSaveId) localStorage.setItem(LS_ACTIVE, activeSaveId);
  }

  function touch(save) { save.updatedAt = Date.now(); }

  function getActive() {
    if (!activeSaveId) activeSaveId = db.saves[0]?.id || null;
    return db.saves.find((s) => s.id === activeSaveId) || null;
  }

  function setActive(id) {
    activeSaveId = id;
    localStorage.setItem(LS_ACTIVE, id);
  }

  function logEvent(kind, detail) {
    const s = getActive();
    if (!s) return;
    s.log.unshift({
      kind,
      ts: Date.now(),
      short: detail,
      detail: ""
    });
    touch(s);
  }

  function uid() {
    return "s_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function rollDie(sides) { return 1 + Math.floor(Math.random() * sides); }

  function fmtTime(ms) {
    try {
      const d = new Date(ms);
      return d.toLocaleString();
    } catch { return String(ms); }
  }

  function safeFilename(name) {
    return String(name || "bf-save").replace(/[^\w\-]+/g, "_").slice(0, 60);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Boot ----------
  if (!db.saves.length) {
    const s = newSaveSlot();
    db.saves.push(s);
    setActive(s.id);
    persist();
  } else if (!getActive()) {
    setActive(db.saves[0].id);
  }

  // initial derived calc
  const s0 = getActive();
  if (s0) { recalcDerived(s0); persist(); }

  renderAll();
})();