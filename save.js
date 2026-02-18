/* save.js — Broken Frontier Save System (multi-save DB)
   - Local-first (localStorage)
   - Stable schema (future-proof)
   - Includes Integrity Spine fields
*/

(function () {
  const DB_KEY = "bf_db_v1";
  const ACTIVE_KEY = "bf_active_save_id_v1";

  // ---- Helpers ----
  function nowISO() { return new Date().toISOString(); }

  function uid() {
    // short id, good enough for local saves
    return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 6);
  }

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  // ---- DB ----
  function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    const db = safeParse(raw, { saves: [] });
    db.saves = Array.isArray(db.saves) ? db.saves : [];
    return db;
  }

  function writeDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function getActiveSaveId() {
    return localStorage.getItem(ACTIVE_KEY) || "";
  }

  function setActiveSaveId(id) {
    localStorage.setItem(ACTIVE_KEY, String(id || ""));
  }

  // ---- Integrity Spine (LOCKED DEFAULTS) ----
  function defaultIntegrity() {
    return {
      value: 100,          // 0–100
      max: 100,
      layer: "surface",    // surface | fracture | zero
      visible: "hidden",   // hidden | danger | full
      surfaceStrain: 0,    // accumulates & bleeds off
      deepFracture: 0,     // accumulates & requires ritual/sanctuary
      scars: [],           // permanent marks (narrative + mechanical)
      lastSymptomAt: "",   // timestamp of last symptom narration trigger
      lastRecoveryAt: ""   // timestamp of last recovery event
    };
  }

  function patchCharacter(c) {
    c = c || {};
    // Stats (you already use these in app.js)
    c.name = c.name ?? "Eli Brogan";
    c.background = c.background ?? "Park Ranger";
    c.grit = Number.isFinite(Number(c.grit)) ? Number(c.grit) : 1;
    c.instinct = Number.isFinite(Number(c.instinct)) ? Number(c.instinct) : 2;
    c.will = Number.isFinite(Number(c.will)) ? Number(c.will) : 1;
    c.presence = Number.isFinite(Number(c.presence)) ? Number(c.presence) : 0;
    c.discipline = Number.isFinite(Number(c.discipline)) ? Number(c.discipline) : 0;

    // Combat-ish fields (safe defaults)
    c.hp = Number.isFinite(Number(c.hp)) ? Number(c.hp) : 13;
    c.maxHp = Number.isFinite(Number(c.maxHp)) ? Number(c.maxHp) : 13;
    c.wounds = Number.isFinite(Number(c.wounds)) ? Number(c.wounds) : 0;
    c.stress = Number.isFinite(Number(c.stress)) ? Number(c.stress) : 0;
    c.exposed = !!c.exposed;
    c.ammo = Number.isFinite(Number(c.ammo)) ? Number(c.ammo) : 6;

    // ✅ Integrity Spine
    c.integrity = c.integrity || defaultIntegrity();

    // Hard safety clamps
    c.integrity.max = Number.isFinite(Number(c.integrity.max)) ? Number(c.integrity.max) : 100;
    c.integrity.value = Number.isFinite(Number(c.integrity.value)) ? Number(c.integrity.value) : 100;
    if (c.integrity.max <= 0) c.integrity.max = 100;

    // clamp 0..max
    if (c.integrity.value < 0) c.integrity.value = 0;
    if (c.integrity.value > c.integrity.max) c.integrity.value = c.integrity.max;

    // normalize enums
    const layer = String(c.integrity.layer || "surface");
    c.integrity.layer = (layer === "surface" || layer === "fracture" || layer === "zero") ? layer : "surface";

    const vis = String(c.integrity.visible || "hidden");
    c.integrity.visible = (vis === "hidden" || vis === "danger" || vis === "full") ? vis : "hidden";

    c.integrity.surfaceStrain = Number.isFinite(Number(c.integrity.surfaceStrain)) ? Number(c.integrity.surfaceStrain) : 0;
    c.integrity.deepFracture = Number.isFinite(Number(c.integrity.deepFracture)) ? Number(c.integrity.deepFracture) : 0;

    c.integrity.scars = Array.isArray(c.integrity.scars) ? c.integrity.scars : [];
    c.integrity.lastSymptomAt = String(c.integrity.lastSymptomAt || "");
    c.integrity.lastRecoveryAt = String(c.integrity.lastRecoveryAt || "");

    return c;
  }

  function patchCampaign(cam) {
    cam = cam || {};
    cam.campaignId = cam.campaignId || "oregon_brogan_v1";
    cam.turn = Number.isFinite(Number(cam.turn)) ? Number(cam.turn) : 0;
    cam.transcript = Array.isArray(cam.transcript) ? cam.transcript : [];
    return cam;
  }

  function patchWorldFlags(flags) {
    flags = flags && typeof flags === "object" ? flags : {};
    return flags;
  }

  // ---- Save Slot ----
  function defaultSaveSlot() {
    const id = uid();
    const s = {
      id,
      title: "New Game",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      schemaVersion: 1,

      character: patchCharacter({}),
      campaign: patchCampaign({}),
      worldFlags: patchWorldFlags({}),

      // local-only log (debug, audit trail)
      sessionLog: []
    };
    return s;
  }

  function patchSave(s) {
    s = s && typeof s === "object" ? s : {};
    s.id = s.id || uid();
    s.title = s.title || "Save";
    s.createdAt = s.createdAt || nowISO();
    s.updatedAt = nowISO();
    s.schemaVersion = Number.isFinite(Number(s.schemaVersion)) ? Number(s.schemaVersion) : 1;

    s.character = patchCharacter(s.character);
    s.campaign = patchCampaign(s.campaign);
    s.worldFlags = patchWorldFlags(s.worldFlags);
    s.sessionLog = Array.isArray(s.sessionLog) ? s.sessionLog : [];

    return s;
  }

  function ensureAtLeastOneSave() {
    const db = loadDB();
    if (!db.saves || db.saves.length === 0) {
      const s = defaultSaveSlot();
      s.title = "Save 1";
      db.saves = [s];
      writeDB(db);
      setActiveSaveId(s.id);
      return s;
    }
    return null;
  }

  function getActiveSave() {
    ensureAtLeastOneSave();
    const db = loadDB();
    const id = getActiveSaveId();

    let s = db.saves.find(x => x.id === id);
    if (!s) {
      s = db.saves[0];
      setActiveSaveId(s.id);
    }

    s = patchSave(s);

    // persist patched save back into DB
    const idx = db.saves.findIndex(x => x.id === s.id);
    if (idx >= 0) db.saves[idx] = s;
    writeDB(db);

    return s;
  }

  function commitActiveSave(save) {
    const db = loadDB();
    const s = patchSave(save);
    const idx = db.saves.findIndex(x => x.id === s.id);
    if (idx >= 0) db.saves[idx] = s;
    else db.saves.push(s);
    writeDB(db);
    return s;
  }

  function hardResetAllSaves() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  // ---- Expose API (used by app.js) ----
  window.loadDB = loadDB;
  window.writeDB = writeDB;

  window.getActiveSaveId = getActiveSaveId;
  window.setActiveSaveId = setActiveSaveId;

  window.defaultSaveSlot = defaultSaveSlot;
  window.patchSave = patchSave;

  window.getActiveSave = getActiveSave;
  window.commitActiveSave = commitActiveSave;

  window.hardResetAllSaves = hardResetAllSaves;

  // boot ensure
  ensureAtLeastOneSave();
})();
