/* save.js — Broken Frontier PWA Save System (bulletproof)
   - Fixes crash: loadDB() must never return null
   - Supports multiple saves + active save id
   - Uses localStorage only (GitHub Pages safe)
*/

(function () {
  const DB_KEY = "bf_rpg_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";

  function nowISO() { return new Date().toISOString(); }

  function safeJSONParse(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  function defaultDB() {
    return {
      version: 1,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      saves: []
    };
  }

  function defaultSaveSlot() {
    // Simple ID: time + random
    const id = `save_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return {
      id,
      title: "Save",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      character: {
        name: "Eli Brogan",
        background: "Park Ranger",
        grit: 1,
        instinct: 2,
        will: 1,
        presence: 0,
        discipline: 0,
        hp: 13,
        maxHp: 13,
        wounds: 0,
        stress: 0,
        exposed: false,
        ammo: 6
      },
      campaign: {
        campaignId: "oregon_brogan_v1",
        turn: 0,
        transcript: []
      },
      worldFlags: {},
      sessionLog: []
    };
  }

  function writeDB(db) {
    // Always enforce shape
    if (!db || typeof db !== "object") db = defaultDB();
    if (!Array.isArray(db.saves)) db.saves = [];
    db.updatedAt = nowISO();

    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      // If storage fails, we still return the db object so app can run.
    }
    return db;
  }

  function loadDB() {
    // IMPORTANT: must never return null
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch { raw = null; }

    if (!raw) {
      return writeDB(defaultDB());
    }

    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== "object") {
      // Corrupt DB, reset
      return writeDB(defaultDB());
    }

    // Enforce required shape
    if (!Array.isArray(parsed.saves)) parsed.saves = [];
    if (!parsed.version) parsed.version = 1;
    if (!parsed.createdAt) parsed.createdAt = nowISO();
    if (!parsed.updatedAt) parsed.updatedAt = nowISO();

    return parsed;
  }

  function patchSave(s) {
    // Make imported/old saves safe
    if (!s || typeof s !== "object") s = defaultSaveSlot();
    if (!s.id) s.id = `save_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    if (!s.title) s.title = "Save";
    if (!s.createdAt) s.createdAt = nowISO();
    s.updatedAt = nowISO();

    s.character = s.character || {};
    s.campaign = s.campaign || {};
    s.worldFlags = s.worldFlags || {};
    s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];

    s.character.name = s.character.name || "Eli Brogan";
    s.character.hp = Number.isFinite(Number(s.character.hp)) ? Number(s.character.hp) : 13;
    s.character.maxHp = Number.isFinite(Number(s.character.maxHp)) ? Number(s.character.maxHp) : 13;
    s.character.wounds = Number.isFinite(Number(s.character.wounds)) ? Number(s.character.wounds) : 0;
    s.character.stress = Number.isFinite(Number(s.character.stress)) ? Number(s.character.stress) : 0;
    s.character.ammo = Number.isFinite(Number(s.character.ammo)) ? Number(s.character.ammo) : 6;

    s.campaign.campaignId = s.campaign.campaignId || "oregon_brogan_v1";
    s.campaign.turn = Number.isFinite(Number(s.campaign.turn)) ? Number(s.campaign.turn) : 0;
    s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

    return s;
  }

  function getActiveSaveId() {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  }

  function setActiveSaveId(id) {
    try { localStorage.setItem(ACTIVE_KEY, String(id || "")); } catch {}
  }

  function getActiveSave() {
    const db = loadDB();
    const activeId = getActiveSaveId();

    // If no saves exist, create one automatically
    if (!db.saves.length) {
      const s = defaultSaveSlot();
      s.title = "Save 1";
      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);
      return s;
    }

    // If activeId missing or not found, pick first
    let found = null;
    if (activeId) found = db.saves.find(x => x.id === activeId) || null;
    if (!found) {
      setActiveSaveId(db.saves[0].id);
      return db.saves[0];
    }

    return found;
  }

  function commitActiveSave(save) {
    const db = loadDB();
    const patched = patchSave(save);

    const idx = db.saves.findIndex(x => x.id === patched.id);
    if (idx >= 0) db.saves[idx] = patched;
    else db.saves.push(patched);

    writeDB(db);
    setActiveSaveId(patched.id);
    return patched;
  }

  function hardResetAllSaves() {
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  }

  // Expose globals for app.js
  window.loadDB = loadDB;
  window.writeDB = writeDB;
  window.defaultDB = defaultDB;
  window.defaultSaveSlot = defaultSaveSlot;
  window.patchSave = patchSave;
  window.getActiveSaveId = getActiveSaveId;
  window.setActiveSaveId = setActiveSaveId;
  window.getActiveSave = getActiveSave;
  window.commitActiveSave = commitActiveSave;
  window.hardResetAllSaves = hardResetAllSaves;
})();
