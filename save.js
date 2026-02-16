// Broken Frontier — Save Core (clean) v1.1
const BF_SAVE_DB_KEY = "bf_save_db_v1";
const BF_ACTIVE_ID_KEY = "bf_active_save_id_v1";

function nowISO() {
  return new Date().toISOString();
}

function defaultWorldFlags() {
  return {
    awarenessLevel: 0,
    entityIntegrity: 3,
    stationPowerOnline: false,
    civiliansMissing: 0,
    entityHostile: false,
    panicThresholdTriggered: false
  };
}

function defaultCampaign() {
  return {
    campaignId: "oregon_brogan_v1",
    chapter: 1,
    sceneId: "warehouse_entry",
    location: { region: "Oregon", site: "Cold Storage", room: "Loading Bay" },

    // What the GM “remembers” right now
    lastTurn: {
      summary: "The shot sparks off shelving. The thing closes. Brogan is exposed.",
      options: ["Take cover", "Run", "Shoot", "Shove past", "First aid"]
    },

    // Persistent changes in the world
    flags: {
      powerOn: false,
      alarmTriggered: false,
      gateLocked: true,
      radioWorking: false
    },

    // Investigation memory
    clues: [
      // { id:"clue_001", text:"Footprints end mid-floor.", foundAt:"warehouse_entry", tags:["impossible"] }
    ],

    // Threat / pressure trackers (0–6 clocks)
    clocks: {
      entityAwareness: 2,
      containmentFailure: 1,
      nightfall: 3
    },

    // NPCs / entities you’ve met or revealed
    entities: {
      // it_that_wasnt: { integrity: 3, seen: true, notes: "Doesn't flinch at gunfire." }
    }
  };
}

function defaultCharacter() {
  return {
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
  };
}

function defaultSaveSlot() {
  return {
    id: "save_" + Math.random().toString(16).slice(2),
    title: "Save 1",
    updatedAt: nowISO(),

    character: defaultCharacter(),
    worldFlags: defaultWorldFlags(),
    campaign: defaultCampaign(),

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

function patchSave(save) {
  // Ensure all new fields exist on older saves
  save.character = save.character || defaultCharacter();
  save.worldFlags = save.worldFlags || defaultWorldFlags();
  save.campaign = save.campaign || defaultCampaign();
  save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];

  // Deep patch campaign subfields (in case only part exists)
  save.campaign.location = save.campaign.location || defaultCampaign().location;
  save.campaign.lastTurn = save.campaign.lastTurn || defaultCampaign().lastTurn;
  save.campaign.flags = save.campaign.flags || defaultCampaign().flags;
  save.campaign.clues = Array.isArray(save.campaign.clues) ? save.campaign.clues : [];
  save.campaign.clocks = save.campaign.clocks || defaultCampaign().clocks;
  save.campaign.entities = save.campaign.entities || defaultCampaign().entities;

  return save;
}

function getActiveSave() {
  const db = loadDB();
  const id = getActiveSaveId();
  let save = db.saves.find(s => s.id === id) || null;

  if (!save) {
    save = defaultSaveSlot();
    db.saves = [save];
    writeDB(db);
    setActiveSaveId(save.id);
  }

  save = patchSave(save);
  return save;
}

function commitActiveSave(save) {
  const db = loadDB();
  const idx = db.saves.findIndex(s => s.id === save.id);

  save.updatedAt = nowISO();
  save = patchSave(save);

  if (idx >= 0) db.saves[idx] = save;
  else db.saves.push(save);

  writeDB(db);
  setActiveSaveId(save.id);
}

function hardResetAllSaves() {
  localStorage.removeItem(BF_SAVE_DB_KEY);
  localStorage.removeItem(BF_ACTIVE_ID_KEY);
}
