// Broken Frontier — App (clean) v1.0

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

  bar.append(btnSave, btnWound, btnReset, status);
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
    pre.textContent = JSON.stringify(save, null, 2);
  }

  render();
})();
