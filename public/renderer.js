const api = window.whatsappMcp;

const versionEl = document.getElementById("version");
const accessToggle = document.getElementById("access-toggle");
const accessStatus = document.getElementById("access-status");
const databaseStatus = document.getElementById("database-status");
const copyButton = document.getElementById("copy-config");
const resetTokenButton = document.getElementById("reset-token");
const quitButton = document.getElementById("quit");
const copyLabel = copyButton.textContent;

function render(state) {
  versionEl.textContent = "v" + state.version;
  accessToggle.checked = state.accessEnabled;
  accessStatus.textContent = state.accessEnabled
    ? "On: Claude can read your recent chats"
    : "Off: nothing can be read";
  databaseStatus.textContent = state.databaseReadable ? "Readable" : state.databaseError || "Not readable";
}

function showError(err) {
  accessStatus.textContent = "Error: " + (err && err.message ? err.message : String(err));
}

function refresh() {
  return api.getState().then(render).catch(showError);
}

accessToggle.addEventListener("change", async () => {
  const enabled = accessToggle.checked;
  accessToggle.disabled = true;
  try {
    render(await api.setAccess(enabled));
  } catch (err) {
    showError(err);
  } finally {
    accessToggle.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  copyButton.disabled = true;
  try {
    await api.copyConfig();
    copyButton.textContent = "Copied";
  } catch (err) {
    showError(err);
  }
  setTimeout(() => {
    copyButton.textContent = copyLabel;
    copyButton.disabled = false;
  }, 1500);
});

resetTokenButton.addEventListener("click", async () => {
  const label = resetTokenButton.textContent;
  resetTokenButton.disabled = true;
  try {
    await api.resetToken();
    resetTokenButton.textContent = "New token created";
  } catch (err) {
    showError(err);
  }
  setTimeout(() => {
    resetTokenButton.textContent = label;
    resetTokenButton.disabled = false;
  }, 1500);
});

quitButton.addEventListener("click", () => {
  api.quit();
});

window.addEventListener("focus", refresh);
refresh();
