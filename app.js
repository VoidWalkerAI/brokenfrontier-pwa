// Broken Frontier — App (clean) v1.1 (campaign-visible)

(function () {
  const save = getActiveSave();

  // Minimal UI: inject a tiny control strip at top of page
  const bar = document.createElement("div");
  bar.style.cssText = `
    position: sticky; top: 0; z-index: 9999;
    background: rgba(10,10,14,.92);
    border-bottom: 1px solid rgba(255,255,255,.08);
    padding: 10px; display: flex; gap: 10px; align-items: center;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    flex-wrap: wrap;
  `;

  const btnSave = document.createElement("button");
  btnSave.textContent = "Commit Save";
  btnSave.onclick = () => {
    commitActiveSave(save);
    render();
  };

  const btnWound = document.createElement("button");
  btnWound.textContent = "+1 Wound";
  btnWound.onclick = () => {
    save.character.wounds += 1;
    save.sessionLog.push({ t: nowISO(), type: "char", msg: "Wound +1" });
    commitActiveSave(save);
    render();
  };

  // NEW: Advance scene (proves campaign save)
  const btnNextScene = document.createElement("button");
  btnNextScene.textContent = "Next Scene";
  btnNextScene.onclick = () => {
    // simple scene hop list
    const scenes = ["warehouse_entry", "loading_bay", "breaker_room", "yard_gate", "truck_escape"];
    const cur = save.campaign.sceneId || scenes[0];
    const i = Math.max(0, scenes.indexOf(cur));
    const next = scenes[Math.min(scenes.length - 1, i + 1)];

    save.campaign.sceneId = next;
    save.campaign.lastTurn = {
      summary: `Scene advanced to ${next}.`,
      options: ["Investigate", "Move", "Hide", "Call it in", "Push forward"]
    };
    save.sessionLog.push({ t: nowISO(), type: "campaign", msg: `Scene → ${next}` });

    commitActiveSave(save);
    render();
  };

  const btnReset = document.createElement("button");
  btnReset.textContent = "Hard Reset";
  btnReset.onclick = () => {
    hardResetAllSaves();
    location.reload();
  };

  const status = document.createElement("div");
  status.style.cssText = "margin-left:auto; opacity:.8; font-size: 12px;";

  // NEW: Campaign header (human-readable)
  const campaignLine = document.createElement("div");
  campaignLine.style.cssText = "width:100%; opacity:.9; font-size: 12px; padding-top:6px;";

  bar.append(btnSave, btnWound, btnNextScene, btnReset, status, campaignLine);
  document.body.prepend(bar);

  const pre = document.createElement("pre");
  pre.style.cssText = `
    white-space: pre-wrap;
    padding: 12px;
    opacity: .95;
  `;
  document.body.prepend(pre);

  function render() {
    status.textContent = `Active: ${save.id} | Updated: ${save.updatedAt}`;

    const c = save.campaign || {};
    const loc = c.location ? `${c.location.site || ""} / ${c.location.room || ""}` : "";
    const last = c.lastTurn && c.lastTurn.summary ? c.lastTurn.summary : "(no lastTurn.summary)";

    campaignLine.textContent =
      `Campaign: ${c.campaignId || "(none)"} | Scene: ${c.sceneId || "(none)"} | Location: ${loc} | Last: ${last}`;

    pre.textContent = JSON.stringify(save, null, 2);
  }

  render();
})();
