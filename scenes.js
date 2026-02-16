/* Broken Frontier — Scene Engine (Contextual) v1.0
   Drop-in scene runner:
   - Reads/writes: save.campaign.sceneId + save.campaign.lastTurn + clocks/flags
   - Context checks: Exposed / Stress / Wounds / clocks
   - Returns: { text, choices[] } and applies results when a choice is clicked
*/

(function () {
  // ---- Public API this file provides ----
  // window.BF_SCENES.getScene(save)
  // window.BF_SCENES.choose(save, choiceId)
  // window.BF_SCENES.ensureCampaign(save)

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function ensureCampaign(save) {
    save.campaign = save.campaign || {};
    save.campaign.sceneId = save.campaign.sceneId || "warehouse_entry";
    save.campaign.lastTurn = save.campaign.lastTurn || { summary: "", options: [] };
    save.campaign.flags = save.campaign.flags || { powerOn:false, alarmTriggered:false, gateLocked:true, radioWorking:false };
    save.campaign.clocks = save.campaign.clocks || { entityAwareness:0, containmentFailure:0, nightfall:0 };
    save.campaign.clues = Array.isArray(save.campaign.clues) ? save.campaign.clues : [];
    save.campaign.entities = save.campaign.entities || {};
    return save;
  }

  // -------- Context helpers --------
  function ctx(save) {
    const c = save.character || {};
    const camp = ensureCampaign(save).campaign;
    return {
      exposed: !!c.exposed,
      stress: Number(c.stress || 0),
      wounds: Number(c.wounds || 0),
      hp: Number(c.hp || 0),
      ammo: Number(c.ammo || 0),
      clocks: camp.clocks,
      flags: camp.flags
    };
  }

  function bumpClock(save, key, amt) {
    ensureCampaign(save);
    const clocks = save.campaign.clocks;
    clocks[key] = clamp(Number(clocks[key] || 0) + amt, 0, 6);
  }

  function logEvent(save, type, detail) {
    save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];
    save.sessionLog.unshift({
      at: new Date().toISOString(),
      type,
      detail
    });
  }

  // -------- Scene definitions --------
  const SCENES = {
    warehouse_entry: {
      title: "Cold Storage — Loading Bay",

      // What the player sees BEFORE choosing
      render(save) {
        const x = ctx(save);

        // Contextual text shifts if Exposed
        const base = [
          "The shot tears through shelving behind it.",
          "Sparks.",
          "Metal screams.",
          "The thing doesn’t recoil.",
          "It doesn’t flinch.",
          "It’s suddenly closer.",
          "Too close."
        ];

        if (x.exposed) {
          base.push("");
          base.push("You’re exposed — no cover between you and it.");
        } else {
          base.push("");
          base.push("You have a heartbeat of space. Barely.");
        }

        // Contextual choice list (changes)
        const choices = [];

        // Take cover is always present, but changes behavior
        choices.push({ id: "take_cover", label: "Take cover" });

        // If exposed, running is riskier but available
        choices.push({ id: "run", label: x.exposed ? "Run (desperate)" : "Run" });

        // Shooting depends on ammo
        if (x.ammo > 0) choices.push({ id: "shoot", label: "Shoot" });
        else choices.push({ id: "shoot_click", label: "Dry click" });

        // Shove past is only reasonable if not too wounded
        if (x.wounds <= 1) choices.push({ id: "shove_past", label: "Shove past" });
        else choices.push({ id: "shove_past_bad", label: "Shove past (hurt)" });

        // First aid only if wounded or stressed
        if (x.wounds > 0 || x.stress > 0) choices.push({ id: "first_aid", label: "First aid" });

        return { title: this.title, text: base.join("\n"), choices };
      },

      // What happens AFTER choosing
      choose(save, choiceId) {
        const x = ctx(save);

        // Default “result packet”
        let summary = "";
        let nextScene = "warehouse_entry"; // stay unless changed

        // Context rules:
        // - Exposed makes everything worse (stress/HP pressure)
        // - High stress can cause “freeze / panic”
        // - Wounds reduce physical options effectiveness

        // Panic check (simple, but brutal)
        const panicRisk = (x.stress >= 5) || (x.exposed && x.stress >= 3);
        if (panicRisk && (choiceId === "run" || choiceId === "shove_past")) {
          bumpClock(save, "entityAwareness", 1);
          save.character.stress = clamp(x.stress + 1, 0, 12);
          summary = "Your lungs seize. Panic spikes. The thing learns your rhythm.";
          logEvent(save, "panic", summary);
          save.campaign.lastTurn = { summary, options: [] };
          return { summary, nextScene: "warehouse_entry" };
        }

        // ---- Choices ----
        if (choiceId === "take_cover") {
          if (x.exposed) {
            // Exposed cover attempt succeeds but costs
            save.character.exposed = false;
            save.character.stress = clamp(x.stress + 1, 0, 12);
            bumpClock(save, "entityAwareness", 1);
            summary = "You dive hard behind a pallet jack. You’re not exposed anymore — but the scrape of steel gives you away.";
          } else {
            // Already not exposed: better outcome
            save.character.stress = clamp(x.stress - 1, 0, 12);
            summary = "You sink into cover and control your breathing. For a moment, the world narrows to angles and exits.";
          }
          nextScene = "under_cover";
        }

        else if (choiceId === "run") {
          // Running while exposed is dangerous
          if (x.exposed) {
            save.character.hp = clamp(x.hp - 2, 0, x.hp);
            save.character.stress = clamp(x.stress + 1, 0, 12);
            bumpClock(save, "entityAwareness", 2);
            summary = "You bolt. Something slaps your shoulder like wet rope. Pain blooms. You keep moving anyway.";
          } else {
            save.character.stress = clamp(x.stress + 0, 0, 12);
            bumpClock(save, "entityAwareness", 1);
            summary = "You break left into the aisles, using shelving as a maze.";
          }
          nextScene = "aisle_run";
        }

        else if (choiceId === "shoot") {
          // Spend ammo
          save.character.ammo = clamp(x.ammo - 1, 0, 999);

          // Shooting while exposed has a nasty recoil risk
          if (x.exposed) {
            save.character.stress = clamp(x.stress + 1, 0, 12);
            bumpClock(save, "entityAwareness", 1);
            summary = "You fire at point range. The report is deafening. The thing doesn’t stop — but it hesitates, recalculating.";
          } else {
            save.character.stress = clamp(x.stress + 0, 0, 12);
            bumpClock(save, "entityAwareness", 1);
            summary = "You fire through the gap. The shot sparks hard off metal — and buys you one step of distance.";
          }
          nextScene = "after_shot";
        }

        else if (choiceId === "shoot_click") {
          // No ammo
          save.character.stress = clamp(x.stress + 2, 0, 12);
          bumpClock(save, "entityAwareness", 1);
          summary = "Click. Nothing. Your stomach drops through the floor. The thing leans in like it heard a joke.";
          nextScene = "warehouse_entry";
        }

        else if (choiceId === "shove_past" || choiceId === "shove_past_bad") {
          const hurtPenalty = (choiceId === "shove_past_bad") ? 1 : 0;

          // Physical push is risky if wounded
          save.character.stress = clamp(x.stress + 1 + hurtPenalty, 0, 12);
          bumpClock(save, "entityAwareness", 1);

          if (x.exposed) {
            save.character.hp = clamp(x.hp - (1 + hurtPenalty), 0, x.hp);
            summary = "You slam through the gap. Something brushes your ribs — not claws, not hands — pressure, like a shape changing mid-swing.";
          } else {
            summary = "You shoulder past frozen crates and force a lane. You’re moving before it understands you moved.";
          }
          nextScene = "service_door";
        }

        else if (choiceId === "first_aid") {
          // First aid is only meaningful if you can breathe
          if (x.exposed) {
            save.character.stress = clamp(x.stress + 1, 0, 12);
            summary = "You try to patch yourself while exposed. Your hands shake. You gain nothing but time you can’t afford.";
            nextScene = "warehouse_entry";
          } else {
            // Recover a little stress, and possibly stabilize
            save.character.stress = clamp(x.stress - 2, 0, 12);
            summary = "You press gauze, tighten the wrap, breathe. You don’t heal the world — you just keep your hands steady.";
            nextScene = "under_cover";
          }
        }

        // Write campaign state
        ensureCampaign(save);
        save.campaign.sceneId = nextScene;
        save.campaign.lastTurn = {
          summary,
          options: [] // UI will rebuild choices from next scene render
        };

        logEvent(save, "choice", `${choiceId} -> ${nextScene} | ${summary}`);

        return { summary, nextScene };
      }
    },

    // ---- Next scenes (lightweight placeholders; easy to expand) ----
    under_cover: {
      title: "Cold Storage — Under Cover",
      render(save) {
        const x = ctx(save);
        const lines = [
          "Dust hangs in the flashlight beam.",
          "Somewhere close, something breathes without lungs.",
          "",
          x.exposed ? "You are exposed again somehow. That shouldn’t be possible." : "You are behind cover."
        ];
        const choices = [
          { id: "peek", label: "Peek" },
          { id: "move", label: "Move" },
          { id: "listen", label: "Listen" }
        ];
        return { title: this.title, text: lines.join("\n"), choices };
      },
      choose(save, choiceId) {
        const x = ctx(save);
        let summary = "";
        let nextScene = "under_cover";

        if (choiceId === "peek") {
          bumpClock(save, "entityAwareness", 1);
          summary = "You peek. You see it wrong — like a person copied from memory, missing details that matter.";
          nextScene = "after_peek";
        } else if (choiceId === "move") {
          summary = "You slide along the shadow line, keeping metal between you and it.";
          nextScene = "aisle_run";
        } else if (choiceId === "listen") {
          save.character.stress = clamp(x.stress - 1, 0, 12);
          summary = "You listen. The warehouse speaks back in tiny creaks and settling steel.";
          nextScene = "under_cover";
        }

        ensureCampaign(save);
        save.campaign.sceneId = nextScene;
        save.campaign.lastTurn = { summary, options: [] };
        logEvent(save, "choice", `${choiceId} -> ${nextScene} | ${summary}`);
        return { summary, nextScene };
      }
    },

    aisle_run: {
      title: "Cold Storage — Aisles",
      render() {
        return {
          title: this.title,
          text: [
            "You run between tall shelving.",
            "The cold turns your breath into a trail.",
            "Every corner is a question."
          ].join("\n"),
          choices: [
            { id: "hide", label: "Hide" },
            { id: "keep_running", label: "Keep running" },
            { id: "turn_and_fire", label: "Turn and fire" }
          ]
        };
      },
      choose(save, choiceId) {
        let summary = "";
        let nextScene = "aisle_run";

        if (choiceId === "hide") {
          bumpClock(save, "entityAwareness", -1);
          summary = "You wedge yourself into darkness between pallets and pray the world forgets you exist.";
          nextScene = "under_cover";
        } else if (choiceId === "keep_running") {
          bumpClock(save, "nightfall", 1);
          summary = "You keep running. Time moves. The building feels larger than it was five minutes ago.";
          nextScene = "aisle_run";
        } else if (choiceId === "turn_and_fire") {
          summary = "You whirl and bring the revolver up — but the sight picture refuses to settle.";
          nextScene = "after_shot";
        }

        ensureCampaign(save);
        save.campaign.sceneId = nextScene;
        save.campaign.lastTurn = { summary, options: [] };
        logEvent(save, "choice", `${choiceId} -> ${nextScene} | ${summary}`);
        return { summary, nextScene };
      }
    },

    after_shot: {
      title: "Cold Storage — After the Shot",
      render(save) {
        const x = ctx(save);
        return {
          title: this.title,
          text: [
            "The gunshot rolls through the warehouse like thunder in a coffin.",
            "",
            `Ammo remaining: ${x.ammo}`,
            "It’s still coming."
          ].join("\n"),
          choices: [
            { id: "take_cover", label: "Take cover" },
            { id: "run", label: "Run" }
          ]
        };
      },
      choose(save, choiceId) {
        // Reuse the main scene logic for these actions
        save.campaign.sceneId = "warehouse_entry";
        return SCENES.warehouse_entry.choose(save, choiceId);
      }
    },

    after_peek: {
      title: "Cold Storage — Wrong Shape",
      render() {
        return {
          title: this.title,
          text: [
            "For half a second, it looks like a man.",
            "Then it looks like a memory of a man.",
            "Then it looks like your own stance, mirrored.",
            "",
            "The smile is new."
          ].join("\n"),
          choices: [
            { id: "freeze", label: "Freeze" },
            { id: "back_up", label: "Back up" },
            { id: "run", label: "Run" }
          ]
        };
      },
      choose(save, choiceId) {
        let summary = "";
        let nextScene = "after_peek";
        const x = ctx(save);

        if (choiceId === "freeze") {
          save.character.stress = clamp(x.stress + 1, 0, 12);
          bumpClock(save, "entityAwareness", 1);
          summary = "You freeze. It doesn’t rush. It just… adjusts.";
          nextScene = "warehouse_entry";
          save.character.exposed = true;
        } else if (choiceId === "back_up") {
          summary = "You back up slow, slow… pretending you’re not prey.";
          nextScene = "under_cover";
        } else if (choiceId === "run") {
          nextScene = "aisle_run";
          summary = "You choose speed over certainty.";
        }

        ensureCampaign(save);
        save.campaign.sceneId = nextScene;
        save.campaign.lastTurn = { summary, options: [] };
        logEvent(save, "choice", `${choiceId} -> ${nextScene} | ${summary}`);
        return { summary, nextScene };
      }
    }
  };

  function getScene(save) {
    ensureCampaign(save);
    const id = save.campaign.sceneId;
    return SCENES[id] || SCENES.warehouse_entry;
  }

  function choose(save, choiceId) {
    const s = getScene(save);
    if (!s.choose) return { summary: "(No handler)", nextScene: save.campaign.sceneId };
    return s.choose(save, choiceId);
  }

  window.BF_SCENES = { getScene, choose, ensureCampaign };
})();
