// scenes.js — Broken Frontier Scenes v1.0
// Simple: title + text + options (each option points to next sceneId)

window.BF_SCENES = {
  warehouse_entry: {
    title: "Cold Storage — Loading Bay",
    text: [
      "The shot tears through shelving behind it.",
      "Sparks.",
      "Metal screams.",
      "",
      "The thing doesn’t recoil.",
      "It doesn’t flinch.",
      "",
      "It’s suddenly closer.",
      "Too close."
    ],
    options: [
      { label: "Take cover", next: "behind_shelving" },
      { label: "Run", next: "loading_corridor" },
      { label: "Shoot", next: "close_shot" },
      { label: "Shove past", next: "shove_past" },
      { label: "First aid", next: "first_aid" }
    ]
  },

  behind_shelving: {
    title: "Behind Shelving",
    text: [
      "You slam down behind the shelving.",
      "Cold air bites your lungs.",
      "The thing drifts—wrong—like it’s half in a different place."
    ],
    options: [
      { label: "Peek and fire", next: "close_shot" },
      { label: "Move deeper", next: "loading_corridor" }
    ]
  },

  loading_corridor: {
    title: "Service Corridor",
    text: [
      "You scramble into the corridor.",
      "Your boots slap wet concrete.",
      "Somewhere behind you: breath through plastic."
    ],
    options: [
      { label: "Keep moving", next: "corridor_end" },
      { label: "Stop and listen", next: "listen_check" }
    ]
  },

  close_shot: {
    title: "Point-Blank",
    text: [
      "You fire at near-contact range.",
      "The report is deafening in the cold room."
    ],
    options: [
      { label: "Backpedal", next: "loading_corridor" },
      { label: "Take cover", next: "behind_shelving" }
    ]
  },

  first_aid: {
    title: "Field Dressing",
    text: [
      "You tear open your field dressing with your teeth.",
      "Hands shaking. Breath ragged.",
      "You can’t do this forever. You can do it once—right."
    ],
    options: [
      { label: "Finish and move", next: "loading_corridor" },
      { label: "Finish and take cover", next: "behind_shelving" }
    ]
  },

  shove_past: {
    title: "Shoulder Through",
    text: [
      "You lunge past it.",
      "Your shoulder hits something that isn’t fully solid.",
      "For a split second you feel cold inside your bones."
    ],
    options: [
      { label: "Run", next: "loading_corridor" }
    ]
  },

  corridor_end: {
    title: "Corridor End",
    text: [
      "A door. A panel. A dead red light above it.",
      "The building feels like it’s holding its breath."
    ],
    options: [
      { label: "Try the door", next: "door_check" },
      { label: "Look for power", next: "power_room" }
    ]
  },

  listen_check: {
    title: "Listen",
    text: [
      "You stop.",
      "You listen.",
      "Something listens back."
    ],
    options: [
      { label: "Move NOW", next: "corridor_end" }
    ]
  },

  door_check: {
    title: "Security Door",
    text: [
      "Locked.",
      "A keypad with grime in the edges.",
      "Someone used this recently."
    ],
    options: [
      { label: "Back off", next: "corridor_end" }
    ]
  },

  power_room: {
    title: "Power Room",
    text: [
      "You find the power room door half-open.",
      "Inside: humming silence. Like a throat before a scream."
    ],
    options: [
      { label: "Step in", next: "power_room_in" },
      { label: "Don’t. Go back.", next: "corridor_end" }
    ]
  },

  power_room_in: {
    title: "Power Room — Inside",
    text: [
      "Panels. Switches. A breaker box.",
      "Your flashlight beam shakes across labels you can barely read."
    ],
    options: [
      { label: "Flip main breaker", next: "breaker_flip" },
      { label: "Back out", next: "corridor_end" }
    ]
  },

  breaker_flip: {
    title: "Breaker",
    text: [
      "You flip it.",
      "A deep vibration runs through the building.",
      "Something wakes up."
    ],
    options: [
      { label: "Move", next: "corridor_end" }
    ]
  }
};
