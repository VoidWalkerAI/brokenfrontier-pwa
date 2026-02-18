/* app.js — Broken Frontier RPG (BUILD-TATTOO DEBUG)
   If you do not see the BUILD banner, you are running an old cached app.js.
*/

(function () {
  // HARD GUARD: prevent double-boot
  if (window.__BF_APP_LOADED__) return;
  window.__BF_APP_LOADED__ = true;

  const BUILD_ID = "BUILD 2026-02-18 / TATTOO-v1";

  // Paint build banner immediately (does NOT rely on save.js)
  const banner = document.createElement("div");
  banner.id = "bfBuildBanner";
  banner.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:999999",
    "padding:8px 10px",
    "font:12px/1.2 monospace",
    "background:#111",
    "color:#0f0",
    "border-bottom:1px solid #333"
  ].join(";");
  banner.textContent = `${BUILD_ID} — booting...`;
  document.documentElement.appendChild(banner);

  function bannerSay(msg) {
    banner.textContent = `${BUILD_ID} — ${msg}`;
  }

  // PWA register
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  const $app = document.getElementById("app");
  if (!$app) {
    bannerSay("ERROR: #app not found");
    return;
  }

  // Must be set in index.html
  const GM_ENDPOINT = window.BF_GM_ENDPOINT || "";
  bannerSay(GM_ENDPOINT ? "GM endpoint SET" : "GM endpoint NOT SET");

  // ---- Helpers ----
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  function nowISO() { return new Date().toISOString(); }

  // Save-layer wrappers (so we can still show life even if save.js breaks)
  function safeGetActiveSave() {
    try { return getActiveSave(); } catch { return null; }
  }
  function safeCommit(save) {
    try { commitActiveSave(save); } catch {}
  }

  function pushLocalLog(save, type, text, data) {
    if (!save) return;
    save.sessionLog = Array.isArray(save.sessionLog) ? save.sessionLog : [];
    save.sessionLog.unshift({ at: nowISO(), type, text, data: data || null });
    safeCommit(save);
  }

  function computeStat(save, statName) {
    const c = (save && save.character) || {};
    const key = String(statName || "").toLowerCase();
    return Number(c[key] || 0);
  }

  function rollD20() { return Math.floor(Math.random() * 20) + 1; }
  function roll2d6() { return (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1); }

  const ui = { tab: "play", pendingRoll: null };

  function tabBtn(id, label) {
    const active = ui.tab === id ? "active" : "";
    return `<button class="bf-tab ${active}" data-tab="${id}" type="button">${label}</button>`;
  }

  function render() {
    const save = safeGetActiveSave() || { character: {}, campaign: { transcript: [], campaignId: "—", turn: 0 }, sessionLog: [] };
    const c = save.character || {};
    const hp = Number(c.hp || 0);
    const maxHp = Number(c.maxHp || 0);
    const wounds = Number(c.wounds || 0);
    const stress = Number(c.stress || 0);
    const exposed = !!c.exposed;

    const campaignId = (save.campaign && save.campaign.campaignId) || "—";
    const turn = Number((save.campaign && save.campaign.turn) || 0);

    // Push content down so banner doesn’t cover it
    $app.style.marginTop = "38px";

    $app.innerHTML = `
      <div class="bf-shell">
        <header class="bf-header">
          <div class="bf-brand">
            <div class="bf-badge">BF</div>
            <div class="bf-title">
              <div class="bf-name">Broken Frontier RPG</div>
              <div class="bf-sub">AI-GM Runtime — ${esc(campaignId)} — Turn ${turn}</div>
            </div>
          </div>

          <div class="bf-actions">
            <button class="bf-btn ghost" id="exportBtn" type="button">Export Save</button>
            <button class="bf-btn ghost" id="importBtn" type="button">Import Save</button>
          </div>
        </header>

        <nav class="bf-tabs">
          ${tabBtn("play","Play")}
          ${tabBtn("saves","Saves")}
          ${tabBtn("character","Character")}
          ${tabBtn("log","Log")}
          ${tabBtn("settings","Settings")}
        </nav>

        <main class="bf-main">
          ${ui.tab === "play" ? playView(save) : ""}
          ${ui.tab === "log" ? logView(save) : ""}
          ${ui.tab === "settings" ? settingsView() : ""}
          ${ui.tab === "character" ? `<section class="bf-card"><div class="bf-card-head"><div class="bf-card-title">Character</div><div class="bf-dim">(debug build)</div></div></section>` : ""}
          ${ui.tab === "saves" ? `<section class="bf-card"><div class="bf-card-head"><div class="bf-card-title">Saves</div><div class="bf-dim">(debug build)</div></div></section>` : ""}
        </main>

        <footer class="bf-footer">
          <div class="bf-hud">
            <div><b>${esc(c.name || "—")}</b> — HP ${hp}/${maxHp} • W ${wounds} • Stress ${stress} • Exposed ${exposed ? "YES" : "NO"}</div>
            <div class="bf-dim">Campaign: ${esc(campaignId)} • Turn: ${turn}</div>
          </div>
        </footer>
      </div>
    `;

    document.querySelectorAll("[data-tab]").forEach(btn => {
      btn.onclick = () => { ui.tab = btn.getAttribute("data-tab"); render(); };
    });

    // export/import might not exist if save.js is missing — keep safe
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.onclick = () => bannerSay("EXPORT pressed (debug)");

    const importBtn = document.getElementById("importBtn");
    if (importBtn) importBtn.onclick = () => bannerSay("IMPORT pressed (debug)");

    if (ui.tab === "play") bindPlay();
    if (ui.tab === "log") bindLog();
  }

  function playView(save) {
    const transcript = (save.campaign && save.campaign.transcript) || [];
    const last = transcript.slice(-18);

    const lines = last.map(m => {
      const who = m.who === "player" ? "YOU" : "GM";
      return `<div class="bf-line"><b class="bf-who">${who}:</b> ${esc(m.text)}</div>`;
    }).join("");

    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Story Terminal</div>
          <div class="bf-dim">Talk to the world. The world talks back.</div>
        </div>

        <div class="bf-terminal" id="term">
          ${lines || `<div class="bf-dim">No transcript yet. Type what you do.</div>`}
        </div>

        <div class="bf-note" style="margin-top:12px;">
          <div class="bf-dim">What do you do?</div>
          <textarea id="playerInput" class="bf-textarea" rows="3"></textarea>
        </div>

        <div class="bf-mini" style="margin-top:10px;">
          <button class="bf-btn" id="btnSend" type="button">Send</button>
          <button class="bf-btn ghost" id="btnNudge" type="button">Nudge GM</button>
        </div>
      </section>
    `;
  }

  function logView(save) {
    const items = (save.sessionLog || []).slice(0, 60).map(e => `
      <div class="bf-log">
        <div class="bf-log-top">
          <div><b>${esc(e.type || "LOG")}</b> — ${esc(e.text || "")}</div>
          <div class="bf-dim">${esc(e.at || "")}</div>
        </div>
      </div>
    `).join("");

    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Log</div>
          <button class="bf-btn ghost" id="btnClearLog" type="button">Clear Log</button>
        </div>
        <div class="bf-stack">
          ${items || `<div class="bf-dim">No log entries yet.</div>`}
        </div>
      </section>
    `;
  }

  function settingsView() {
    return `
      <section class="bf-card">
        <div class="bf-card-head">
          <div class="bf-card-title">Settings</div>
        </div>
        <div class="bf-dim" style="margin-top:8px;">
          GM Endpoint: <b>${esc(GM_ENDPOINT ? "SET" : "NOT SET")}</b><br/>
          Debug Build: <b>${esc(BUILD_ID)}</b>
        </div>
      </section>
    `;
  }

  function bindPlay() {
    const send = document.getElementById("btnSend");
    const nudge = document.getElementById("btnNudge");
    const input = document.getElementById("playerInput");

    if (send) send.onclick = async () => {
      bannerSay("SEND pressed");
      const live = safeGetActiveSave();
      pushLocalLog(live, "UI", "SEND pressed");
      render();

      const text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      await gmTurn({ type: "player_action", text });
    };

    if (nudge) nudge.onclick = async () => {
      bannerSay("NUDGE pressed");
      const live = safeGetActiveSave();
      pushLocalLog(live, "UI", "NUDGE pressed");
      render();

      await gmTurn({ type: "nudge", text: "NUDGE: escalate with one concrete clue + one direct question." });
    };
  }

  function bindLog() {
    const live = safeGetActiveSave();
    const btn = document.getElementById("btnClearLog");
    if (btn) btn.onclick = () => {
      bannerSay("CLEAR LOG pressed");
      if (live) {
        live.sessionLog = [];
        safeCommit(live);
      }
      render();
    };
  }

  async function gmTurn(event) {
    const save = safeGetActiveSave();
    if (!save) {
      bannerSay("ERROR: save.js not responding");
      return;
    }

    save.campaign = save.campaign || {};
    save.campaign.transcript = Array.isArray(save.campaign.transcript) ? save.campaign.transcript : [];
    save.campaign.turn = Number(save.campaign.turn || 0);

    if (event.type === "player_action") {
      save.campaign.transcript.push({ who: "player", text: event.text });
      save.campaign.turn += 1;
      safeCommit(save);
      render();
    }

    if (!GM_ENDPOINT) {
      pushLocalLog(save, "ERROR", "GM endpoint not set in index.html");
      bannerSay("ERROR: endpoint not set");
      render();
      return;
    }

    const payload = {
      save: {
        character: save.character,
        campaign: {
          campaignId: save.campaign.campaignId,
          turn: save.campaign.turn,
          transcript: (save.campaign.transcript || []).slice(-24)
        },
        worldFlags: save.worldFlags
      },
      event
    };

    try {
      const res = await fetch(GM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const raw = await res.text();

      if (!res.ok) {
        pushLocalLog(save, "ERROR", `GM HTTP ${res.status} — ${raw.slice(0, 200)}`);
        bannerSay(`GM HTTP ${res.status}`);
        render();
        return;
      }

      const data = JSON.parse(raw);
      const say = Array.isArray(data.say) ? data.say : [];

      for (const line of say) save.campaign.transcript.push({ who: "gm", text: line });
      safeCommit(save);
      bannerSay("GM responded");
      render();
    } catch (e) {
      pushLocalLog(save, "ERROR", `GM fetch failed — ${String(e)}`);
      bannerSay("GM fetch failed");
      render();
    }
  }

  // Boot: attempt to write a log immediately
  const bootSave = safeGetActiveSave();
  if (bootSave) {
    pushLocalLog(bootSave, "BOOT", "app.js loaded (debug tattoo build)");
  }

  render();
})();
