/* save.js — Broken Frontier Saves (self-healing)
   - Never returns null DB
   - Survives bad JSON, missing keys, and “null” being stored
   - Multi-save support
*/

(function () {
  const DB_KEY = "bf_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";

  function nowISO() { return new Date().toISOString(); }

  function safeJSONParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function makeEmptyDB() {
    return { saves: [], meta: { createdAt: nowISO(), updatedAt: nowISO() } };
  }

  // ---- Public API ----
  window.loadDB = function loadDB() {
    const raw = localStorage.getItem(DB_KEY);

    // Nothing saved yet
    if (!raw) return makeEmptyDB();

    // If someone accidentally stored literal "null"
    if (raw === "null" || raw === "undefined") return makeEmptyDB();

    const parsed = safeJSONParse(raw);

    // If parse failed or parsed is null/primitive
    if (!parsed || typeof parsed !== "object") return makeEmptyDB();

    // Ensure shape
    if (!Array.isArray(parsed.saves)) parsed.saves = [];
    if (!parsed.meta || typeof parsed.meta !== "object") parsed.meta = {};
    if (!parsed.meta.createdAt) parsed.meta.createdAt = nowISO();
    parsed.meta.updatedAt = nowISO();

    return parsed;
  };

  window.writeDB = function writeDB(db) {
    // Self-heal shape before write
    if (!db || typeof db !== "object") db = makeEmptyDB();
    if (!Array.isArray(db.saves)) db.saves = [];
    db.meta = db.meta && typeof db.meta === "object" ? db.meta : {};
    db.meta.updatedAt = nowISO();
    if (!db.meta.createdAt) db.meta.createdAt = nowISO();

    localStorage.setItem(DB_KEY, JSON.stringify(db));
  };

  window.getActiveSaveId = function getActiveSaveId() {
    return localStorage.getItem(ACTIVE_KEY) || "";
  };

  window.setActiveSaveId = function setActiveSaveId(id) {
    if (!id) return;
    localStorage.setItem(ACTIVE_KEY, String(id));
  };

  function uid() {
    return "s_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  window.defaultSaveSlot = function defaultSaveSlot() {
    const id = uid();
    return {
      id,
      title: "Save",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      character: {
        name: "Eli Brogan",
        background: "Park Ranger",
        grit: 1, instinct: 2, will: 1, presence: 0, discipline: 0,
        hp: 13, maxHp: 13, wounds: 0, stress: 0, exposed: false, ammo: 6
      },
      campaign: {
        campaignId: "oregon_brogan_v1",
        turn: 0,
        transcript: []
      },
      worldFlags: {},
      sessionLog: []
    };
  };

  window.patchSave = function patchSave(s) {
    // Used when importing older saves or malformed saves
    if (!s || typeof s !== "object") s = {};
    if (!s.id) s.id = uid();
    if (!s.title) s.title = "Save";
    if (!s.createdAt) s.createdAt = nowISO();
    s.updatedAt = nowISO();

    s.character = s.character && typeof s.character === "object" ? s.character : {};
    if (!("name" in s.character)) s.character.name = "Eli Brogan";
    if (!("hp" in s.character)) s.character.hp = 13;
    if (!("maxHp" in s.character)) s.character.maxHp = 13;
    if (!("wounds" in s.character)) s.character.wounds = 0;
    if (!("stress" in s.character)) s.character.stress = 0;
    if (!("exposed" in s.character)) s.character.exposed = false;
    if (!("ammo" in s.character)) s.character.ammo = 6;

    s.campaign = s.campaign && typeof s.campaign === "object" ? s.campaign : {};
    if (!s.campaign.campaignId) s.campaign.campaignId = "oregon_brogan_v1";
    if (!Number.isFinite(Number(s.campaign.turn))) s.campaign.turn = 0;
    s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

    s.worldFlags = s.worldFlags && typeof s.worldFlags === "object" ? s.worldFlags : {};
    s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];

    return s;
  };

  window.getActiveSave = function getActiveSave() {
    const db = window.loadDB();
    const activeId = window.getActiveSaveId();

    if (activeId) {
      const found = db.saves.find(s => s && s.id === activeId);
      if (found) return window.patchSave(found);
    }

    // No active set or missing — pick first if exists
    if (db.saves.length) {
      const s0 = window.patchSave(db.saves[0]);
      window.setActiveSaveId(s0.id);
      return s0;
    }

    // None exist — create one
    const fresh = window.defaultSaveSlot();
    fresh.title = "Save 1";
    fresh.sessionLog.unshift({ at: nowISO(), type: "BOOT", text: "Fresh DB created (save.js self-heal)", data: null });

    db.saves.push(fresh);
    window.writeDB(db);
    window.setActiveSaveId(fresh.id);
    return fresh;
  };

  window.commitActiveSave = function commitActiveSave(save) {
    const s = window.patchSave(save);
    const db = window.loadDB();

    const idx = db.saves.findIndex(x => x && x.id === s.id);
    if (idx >= 0) db.saves[idx] = s;
    else db.saves.push(s);

    window.writeDB(db);
    window.setActiveSaveId(s.id);
  };

  window.hardResetAllSaves = function hardResetAllSaves() {
    // Only wipe our keys, not the user’s whole browser
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  };

  // ---- Compatibility bundle: some app.js builds look for window.BF_DB ----
  window.BF_DB = window.BF_DB || {
    loadDB: window.loadDB,
    writeDB: window.writeDB,
    getActiveSaveId: window.getActiveSaveId,
    setActiveSaveId: window.setActiveSaveId,
    getActiveSave: window.getActiveSave,
    commitActiveSave: window.commitActiveSave,
    defaultSaveSlot: window.defaultSaveSlot,
    hardResetAllSaves: window.hardResetAllSaves,
    patchSave: window.patchSave
  };
  window.BF_DB_VERSION = window.BF_DB_VERSION || "bf_db_v1";
})();
