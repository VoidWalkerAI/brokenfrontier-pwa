// Broken Frontier — Save Core (clean) v1.0
const BF_SAVE_DB_KEY = "bf_save_db_v1";
const BF_ACTIVE_ID_KEY = "bf_active_save_id_v1";

function nowISO() {
  return new Date().toISOString();
}

function defaultSaveSlot() {
  return {
    id: "save_" + Math.random().toString(16).slice(2),
    title: "Save 1",
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
      ammo: 6,
      notes: "Revolver. Flashlight. Field dressing."
    },

    worldFlags: {
      awarenessLevel: 0,
      entityIntegrity: 3,
      stationPowerOnline: false,
      civiliansMissing: 0,
      entityHostile: false,
      panicThresholdTriggered: false
    },

    sessionLog: []
  };
}

function loadDB() {
  const raw = localStorage.getItem(BF_SAVE_DB_KEY);
  if (!raw) return { saves: [] };
  try {
    const db = JSON.parse(raw);
    db.saves = Array.isArray(db.saves) ? db.saves : [];
    return db;
  } catch {
    return { saves: [] };
  }
}

function writeDB(db) {
  localStorage.setItem(BF_SAVE_DB_KEY, JSON.stringify(db));
}

function getActiveSaveId() {
  return localStorage.getItem(BF_ACTIVE_ID_KEY);
}

function setActiveSaveId(id) {
  localStorage.setItem(BF_ACTIVE_ID_KEY, id);
}

function getActiveSave() {
  const db = loadDB();
  const id = getActiveSaveId();
  let save = db.saves.find(s => s.id === id) || null;

  if (!save) {
    // If no save exists, create one
    save = defaultSaveSlot();
    db.saves = [save];
    writeDB(db);
    setActiveSaveId(save.id);
  }

  // Patch for future fields
  save.worldFlags = save.worldFlags || defaultSaveSlot().worldFlags;
  save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];

  return save;
}

function commitActiveSave(save) {
  const db = loadDB();
  const idx = db.saves.findIndex(s => s.id === save.id);

  save.updatedAt = nowISO();

  if (idx >= 0) db.saves[idx] = save;
  else db.saves.push(save);

  writeDB(db);
  setActiveSaveId(save.id);
}

function hardResetAllSaves() {
  localStorage.removeItem(BF_SAVE_DB_KEY);
  localStorage.removeItem(BF_ACTIVE_ID_KEY);
}
