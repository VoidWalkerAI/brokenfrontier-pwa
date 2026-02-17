# Broken Frontier — SAVE FORMAT v1 (Locked)

## Save Slot
- id, title, updatedAt
- character
- campaign
- worldFlags
- sessionLog

## Campaign (player-owned)
- campaignId: string
- turn: number
- transcript: {who:"player"|"gm", text:string}[]
- location: {region, site, room}
- lastTurn: {summary, options[]}
- flags: persistent booleans/values
- clues: array
- clocks: 0–6 pressure trackers
- entities: discovered threats/NPCs w/ notes

## Rule: The UI can display it nicely.
The save is JSON, but the player never has to “stare at JSON.”
The UI renders character sheet, journal, clues, clocks, and transcript as readable panels.
