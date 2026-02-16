// BROKEN FRONTIER SAVE SYSTEM v1.0

const SAVE_KEY = "BF_SaveSlot1";

// Default starting state
function createDefaultSave() {
  return {
    character: {
      name: "Eli Brogan",
      hp: 13,
      maxHp: 13,
      wounds: 0,
      stress: 0,
      grit: 1,
      instinct: 2,
      will: 1
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

// Load or initialize
function loadSave() {
  const existing = localStorage.getItem(SAVE_KEY);

  if (existing) {
    return JSON.parse(existing);
  } else {
    const newSave = createDefaultSave();
    localStorage.setItem(SAVE_KEY, JSON.stringify(newSave));
    return newSave;
  }
}

// Save current state
function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

// Reset
function resetSave() {
  localStorage.removeItem(SAVE_KEY);
}
