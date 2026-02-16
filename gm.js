async function callGM(save, playerAction) {
  const response = await fetch("/api/gm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      save,
      action: playerAction
    })
  });

  return await response.json();
}
