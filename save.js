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
    name: "
