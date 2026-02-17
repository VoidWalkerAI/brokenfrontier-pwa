/* save.js — Broken Frontier Save Core (Unified)
   - Supports multi-save DB (db.saves[])
   - Supports active save id
   - Provides patchSave() to keep schema stable
*/

(function () {
  const DB_KEY = "bf_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";

  function nowISO() { return new Date().toISOString(); }
  function uid() {
    return "bf_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  // ---- DB helpers ----
  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return { saves: [] };
      const db = JSON.parse(raw);
      db.saves = Array.isArray(db.saves) ? db.saves : [];
      return db;
    } catch {
      return { saves: [] };
    }
  }

  function writeDB(db) {
    db = db || {};
    db.saves = Array.isArray(db.saves) ? db.saves : [];
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function getActiveSaveId() {
    return localStorage.getItem(ACTIVE_KEY) || "";
  }

  function setActiveSaveId(id) {
    if (!id) return;
    localStorage.setItem(ACTIVE_KEY, String(id));
  }

  // ---- Save schema ----
  function defaultSaveSlot() {
    const s = {
      id: uid(),
      title: "Save 1",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      character: {
        name: "Eli Brogan",
        background: "Park Ranger",
        // core stats (keep simple)
        grit: 1,
        instinct: 2,
        will: 1,
        presence: 0,
        discipline: 0,

        // trackables
        hp: 13,
        maxHp: 13,
        wounds: 0,
        stress: 0,
        exposed: false,
        ammo: 6,

        notes: ""
      },
      campaign: {
        campaignId: "oregon_brogan_v1",
        turn: 0,
        transcript: []
      },
      worldFlags: {},
      sessionLog: []
    };
    return s;
  }

  function patchSave(s) {
    // If someone imports older JSON, force it into the current shape
    s = (s && typeof s === "object") ? s : {};
    if (!s.id) s.id = uid();
    if (!s.title) s.title = "Save";
    if (!s.createdAt) s.createdAt = nowISO();
    s.updatedAt = nowISO();

    s.character = (s.character && typeof s.character === "object") ? s.character : {};
    const c = s.character;

    if (!c.name) c.name = "Eli Brogan";
    if (!c.background) c.background = "Park Ranger";

    // stats
    c.grit = Number.isFinite(Number(c.grit)) ? Number(c.grit) : 1;
    c.instinct = Number.isFinite(Number(c.instinct)) ? Number(c.instinct) : 2;
    c.will = Number.isFinite(Number(c.will)) ? Number(c.will) : 1;
    c.presence = Number.isFinite(Number(c.presence)) ? Number(c.presence) : 0;
    c.discipline = Number.isFinite(Number(c.discipline)) ? Number(c.discipline) : 0;

    // trackables
    c.maxHp = Number.isFinite(Number(c.maxHp)) ? Number(c.maxHp) : 13;
    c.hp = Number.isFinite(Number(c.hp)) ? Number(c.hp) : c.maxHp;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp));

    c.wounds = Number.isFinite(Number(c.wounds)) ? Number(c.wounds) : 0;
    c.stress = Number.isFinite(Number(c.stress)) ? Number(c.stress) : 0;
    c.ammo = Number.isFinite(Number(c.ammo)) ? Number(c.ammo) : 6;
    c.exposed = !!c.exposed;

    if (typeof c.notes !== "string") c.notes = "";

    s.campaign = (s.campaign && typeof s.campaign === "object") ? s.campaign : {};
    s.campaign.campaignId = s.campaign.campaignId || "oregon_brogan_v1";
    s.campaign.turn = Number.isFinite(Number(s.campaign.turn)) ? Number(s.campaign.turn) : 0;
    s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];

    s.worldFlags = (s.worldFlags && typeof s.worldFlags === "object") ? s.worldFlags : {};
    s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];

    return s;
  }

  // ---- Core operations ----
  function getActiveSave() {
    const db = loadDB();
    const id = getActiveSaveId();

    // If no saves exist, create one
    if (!db.saves.length) {
      const s = defaultSaveSlot();
      db.saves.push(s);
      writeDB(db);
      setActiveSaveId(s.id);
      return patchSave(s);
    }

    // If active id missing, point to the first
    if (!id) {
      setActiveSaveId(db.saves[0].id);
      return patchSave(db.saves[0]);
    }

    const found = db.saves.find(x => x.id === id);
    if (found) return patchSave(found);

    // active id points to nothing: reset
    setActiveSaveId(db.saves[0].id);
    return patchSave(db.saves[0]);
  }

  function commitActiveSave(save) {
    const db = loadDB();
    save = patchSave(save);

    db.saves = Array.isArray(db.saves) ? db.saves : [];
    const idx = db.saves.findIndex(x => x.id === save.id);
    if (idx >= 0) db.saves[idx] = save;
    else db.saves.push(save);

    writeDB(db);
    setActiveSaveId(save.id);
  }

  function hardResetAllSaves() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  // ---- Export to global ----
  window.loadDB = loadDB;
  window.writeDB = writeDB;
  window.getActiveSaveId = getActiveSaveId;
  window.setActiveSaveId = setActiveSaveId;

  window.defaultSaveSlot = defaultSaveSlot;
  window.patchSave = patchSave;

  window.getActiveSave = getActiveSave;
  window.commitActiveSave = commitActiveSave;
  window.hardResetAllSaves = hardResetAllSaves;
})();
