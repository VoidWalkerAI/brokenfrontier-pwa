/* ============================================================
   🪨 CAVECODE — LOCKED BLOCK
   BROKEN FRONTIER RPG — LOCAL SAVE CORE v1.2

   PURPOSE:
   Persist player character, campaign-visible state, transcript,
   world compatibility state, and local logs in the browser.

   CAMPAIGN CONTRACT:
   - New saves enter bf_campaign_001.
   - Campaign-specific location/flags/clues/clocks/entities live under
     save.campaign as required by SAVE_FORMAT_v1.
   - Hidden Campaign 001 truth never lives here; it remains in the
     private Worker campaign cartridge.

   SELF-HEALING:
   Bad/missing JSON is repaired without wiping unrelated browser data.
   ============================================================ */

(function () {
  const DB_KEY = "bf_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";
  const CURRENT_CAMPAIGN_ID = "bf_campaign_001";

  function nowISO() { return new Date().toISOString(); }
  function safeJSONParse(s) { try { return JSON.parse(s); } catch { return null; } }
  function makeEmptyDB() { return { saves: [], meta: { createdAt: nowISO(), updatedAt: nowISO() } }; }

  function ensureCampaignShape(s) {
    s.campaign = s.campaign && typeof s.campaign === "object" ? s.campaign : {};

    // ==========================================================
    // 🪨 CAVECODE — LOCKED BLOCK
    // CAMPAIGN 001 MIGRATION
    // Old Oregon/Brogan test IDs are retired as campaign identity.
    // Eli remains a valid character; the campaign is independent of him.
    // ==========================================================
    if (!s.campaign.campaignId || s.campaign.campaignId === "oregon_brogan_v1" || s.campaign.campaignId === "default") {
      s.campaign.campaignId = CURRENT_CAMPAIGN_ID;
    }

    if (!Number.isFinite(Number(s.campaign.turn))) s.campaign.turn = 0;
    s.campaign.transcript = Array.isArray(s.campaign.transcript) ? s.campaign.transcript : [];
    s.campaign.location = s.campaign.location && typeof s.campaign.location === "object"
      ? s.campaign.location
      : { region: "Ohio Valley", site: "", room: "" };
    s.campaign.lastTurn = s.campaign.lastTurn && typeof s.campaign.lastTurn === "object"
      ? s.campaign.lastTurn
      : { summary: "", options: [] };
    s.campaign.flags = s.campaign.flags && typeof s.campaign.flags === "object" ? s.campaign.flags : {};
    s.campaign.clues = Array.isArray(s.campaign.clues) ? s.campaign.clues : [];
    s.campaign.clocks = s.campaign.clocks && typeof s.campaign.clocks === "object" ? s.campaign.clocks : {};
    s.campaign.entities = s.campaign.entities && typeof s.campaign.entities === "object" ? s.campaign.entities : {};
    return s;
  }

  window.loadDB = function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw || raw === "null" || raw === "undefined") return makeEmptyDB();
    const parsed = safeJSONParse(raw);
    if (!parsed || typeof parsed !== "object") return makeEmptyDB();
    if (!Array.isArray(parsed.saves)) parsed.saves = [];
    if (!parsed.meta || typeof parsed.meta !== "object") parsed.meta = {};
    if (!parsed.meta.createdAt) parsed.meta.createdAt = nowISO();
    parsed.meta.updatedAt = nowISO();
    return parsed;
  };

  window.writeDB = function writeDB(db) {
    if (!db || typeof db !== "object") db = makeEmptyDB();
    if (!Array.isArray(db.saves)) db.saves = [];
    db.meta = db.meta && typeof db.meta === "object" ? db.meta : {};
    db.meta.updatedAt = nowISO();
    if (!db.meta.createdAt) db.meta.createdAt = nowISO();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  };

  window.getActiveSaveId = function getActiveSaveId() { return localStorage.getItem(ACTIVE_KEY) || ""; };
  window.setActiveSaveId = function setActiveSaveId(id) { if (id) localStorage.setItem(ACTIVE_KEY, String(id)); };

  function uid() { return "s_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16); }

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
        hp: 13, maxHp: 13, wounds: 0, stress: 0, exposed: false, ammo: 6,
      },
      campaign: {
        campaignId: CURRENT_CAMPAIGN_ID,
        turn: 0,
        transcript: [],
        location: { region: "Ohio Valley", site: "", room: "" },
        lastTurn: { summary: "", options: [] },
        flags: {},
        clues: [],
        clocks: {},
        entities: {},
      },
      worldFlags: {},
      sessionLog: [],
    };
  };

  window.patchSave = function patchSave(s) {
    if (!s || typeof s !== "object") s = {};
    if (!s.id) s.id = uid();
    if (!s.title) s.title = "Save";
    if (!s.createdAt) s.createdAt = nowISO();
    s.updatedAt = nowISO();

    s.character = s.character && typeof s.character === "object" ? s.character : {};
    if (!("name" in s.character)) s.character.name = "Eli Brogan";
    if (!("background" in s.character)) s.character.background = "Park Ranger";
    if (!("grit" in s.character)) s.character.grit = 1;
    if (!("instinct" in s.character)) s.character.instinct = 2;
    if (!("will" in s.character)) s.character.will = 1;
    if (!("presence" in s.character)) s.character.presence = 0;
    if (!("discipline" in s.character)) s.character.discipline = 0;
    if (!("hp" in s.character)) s.character.hp = 13;
    if (!("maxHp" in s.character)) s.character.maxHp = 13;
    if (!("wounds" in s.character)) s.character.wounds = 0;
    if (!("stress" in s.character)) s.character.stress = 0;
    if (!("exposed" in s.character)) s.character.exposed = false;
    if (!("ammo" in s.character)) s.character.ammo = 6;

    ensureCampaignShape(s);
    s.worldFlags = s.worldFlags && typeof s.worldFlags === "object" ? s.worldFlags : {};
    s.settings = s.settings && typeof s.settings === "object" ? s.settings : {};
    if (typeof s.settings.letBonesDecide !== "boolean") s.settings.letBonesDecide = false;
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
    if (db.saves.length) {
      const s0 = window.patchSave(db.saves[0]);
      window.setActiveSaveId(s0.id);
      return s0;
    }
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
    if (idx >= 0) db.saves[idx] = s; else db.saves.push(s);
    window.writeDB(db);
    window.setActiveSaveId(s.id);
  };

  window.hardResetAllSaves = function hardResetAllSaves() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  };

  window.BF_DB = window.BF_DB || {
    loadDB: window.loadDB,
    writeDB: window.writeDB,
    getActiveSaveId: window.getActiveSaveId,
    setActiveSaveId: window.setActiveSaveId,
    getActiveSave: window.getActiveSave,
    commitActiveSave: window.commitActiveSave,
    defaultSaveSlot: window.defaultSaveSlot,
    hardResetAllSaves: window.hardResetAllSaves,
    patchSave: window.patchSave,
  };
  window.BF_DB_VERSION = window.BF_DB_VERSION || "bf_db_v1";
})();
