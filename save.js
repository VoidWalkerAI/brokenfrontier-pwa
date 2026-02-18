/* save.js — Broken Frontier multi-save DB
   Stores EVERYTHING, including sessionLog.
   LocalStorage-based, GitHub Pages safe.
*/

(function () {
  const DB_KEY = "bf_save_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";

  function nowISO() { return new Date().toISOString(); }

  function uid() {
    return "bf_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  // --- DB IO ---
  function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    const db = raw ? safeParse(raw, null) : null;
    return patchDB(db);
  }

  function writeDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function patchDB(db) {
    if (!db || typeof db !== "object") db = {};
    db.saves = Array.isArray(db.saves) ? db.saves : [];

    // Ensure at least one save exists
    if (db.saves.length === 0) {
      const s = defaultSaveSlot();
      s.title = "Save 1";
      db.saves.push(s);
      localStorage.setItem(ACTIVE_KEY, s.id);
      writeDB(db);
    }

    // Patch every save
    db.saves = db.saves.map(patchSave);

    return db;
  }

  // --- Save shape ---
  function defaultSaveSlot() {
    return patchSave({
      id: uid(),
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
      sessionLog: []   // <-- IMPORTANT: kept and persisted
    });
  }

  function patchSave(s) {
    if (!s || typeof s !== "object") s = {};
    if (!s.id) s.id = uid();
    if (!s.createdAt) s.createdAt = nowISO();
    if (!s.updatedAt) s.updatedAt = nowISO();
    if (!s.title) s.title = "Save";

    s.character = s.character && typeof s.character === "object" ? s.character : {};
    s.campaign = s.campaign && typeof s.campaign === "object" ? s.campaign : {};
    s.worldFlags = s.worldFlags && typeof s.worldFlags === "object" ? s.worldFlags : {};
    s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];

    // Campaign defaults
    if (!s.campaign.campaignId) s.campaign.campaignId = "oregon_brogan_v1";
    s.campaign.turn = Number(s.campaign.turn || 0);
    s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

    // Character defaults (don’t overwrite existing)
    if (!("name" in s.character)) s.character.name = "Eli Brogan";
    if (!("hp" in s.character)) s.character.hp = 13;
    if (!("maxHp" in s.character)) s.character.maxHp = 13;
    if (!("wounds" in s.character)) s.character.wounds = 0;
    if (!("stress" in s.character)) s.character.stress = 0;
    if (!("exposed" in s.character)) s.character.exposed = false;
    if (!("ammo" in s.character)) s.character.ammo = 6;

    return s;
  }

  // --- Active save ---
  function getActiveSaveId() {
    return localStorage.getItem(ACTIVE_KEY) || "";
  }

  function setActiveSaveId(id) {
    localStorage.setItem(ACTIVE_KEY, id);
  }

  function getActiveSave() {
    const db = loadDB();
    const id = getActiveSaveId();
    let s = db.saves.find(x => x.id === id) || db.saves[0];
    s = patchSave(s);

    // If active id was missing, repair it
    if (s && s.id && s.id !== id) setActiveSaveId(s.id);

    return s;
  }

  function commitActiveSave(save) {
    const db = loadDB();
    const fixed = patchSave(save);
    fixed.updatedAt = nowISO();

    const id = getActiveSaveId() || fixed.id;
    setActiveSaveId(id);

    const idx = db.saves.findIndex(x => x.id === id);
    if (idx >= 0) db.saves[idx] = fixed;
    else db.saves.push(fixed);

    writeDB(db);
  }

  function hardResetAllSaves() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  // Export these to window for app.js
  window.loadDB = loadDB;
  window.writeDB = writeDB;
  window.defaultSaveSlot = defaultSaveSlot;
  window.patchSave = patchSave;
  window.getActiveSave = getActiveSave;
  window.getActiveSaveId = getActiveSaveId;
  window.setActiveSaveId = setActiveSaveId;
  window.commitActiveSave = commitActiveSave;
  window.hardResetAllSaves = hardResetAllSaves;
})();
