// Broken Frontier — GM Schema + Helpers v1.0

window.BF_GM = window.BF_GM || {};

window.BF_GM.schema = {
  name: "bf_gm_turn_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["say", "patch"],
    properties: {
      // What the GM says to the player (rendered in the terminal)
      say: {
        type: "array",
        items: { type: "string" }
      },

      // Patch: minimal changes to apply to the save
      patch: {
        type: "object",
        additionalProperties: false,
        required: ["character", "campaign", "worldFlags", "log"],
        properties: {
          character: {
            type: "object",
            additionalProperties: false,
            properties: {
              hp: { type: "integer" },
              maxHp: { type: "integer" },
              wounds: { type: "integer" },
              stress: { type: "integer" },
              exposed: { type: "boolean" },
              ammo: { type: "integer" },
              notes: { type: "string" }
            }
          },
          campaign: {
            type: "object",
            additionalProperties: true
          },
          worldFlags: {
            type: "object",
            additionalProperties: true
          },
          log: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "text"],
              properties: {
                type: { type: "string" },
                text: { type: "string" }
              }
            }
          }
        }
      },

      // Optional: GM asks for a roll
      roll: {
        type: "object",
        additionalProperties: false,
        required: ["needRoll"],
        properties: {
          needRoll: { type: "boolean" },
          dice: { type: "string", enum: ["d20", "2d6"] },
          kind: { type: "string" },   // "Attack", "Check", "Fear", etc.
          tn: { type: "integer" },    // target number
          stat: { type: "string" },   // "grit", "instinct", "will", etc.
          mod: { type: "integer" },   // situational modifier
          prompt: { type: "string" }  // what to roll for
        }
      }
    }
  }
};

window.BF_GM.applyPatch = function applyPatch(save, patch) {
  save.character = save.character || {};
  save.campaign = save.campaign || {};
  save.worldFlags = save.worldFlags || {};
  save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];

  if (patch.character) {
    for (const k of Object.keys(patch.character)) save.character[k] = patch.character[k];
  }
  if (patch.campaign) {
    for (const k of Object.keys(patch.campaign)) save.campaign[k] = patch.campaign[k];
  }
  if (patch.worldFlags) {
    for (const k of Object.keys(patch.worldFlags)) save.worldFlags[k] = patch.worldFlags[k];
  }

  if (Array.isArray(patch.log)) {
    for (const e of patch.log) {
      save.sessionLog.unshift({
        at: new Date().toISOString(),
        type: e.type || "LOG",
        text: e.text || "",
        data: null
      });
    }
  }

  return save;
};