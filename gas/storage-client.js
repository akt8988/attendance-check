/* Persistence for the Apps Script web app. Same calls as js/storage.js. */

const Storage = (() => {
  let data = emptyData();
  let ready = false;
  let lastError = "";

  function emptyData() {
    return { version: 1, courses: [] };
  }

  function getData() {
    return data;
  }

  function needsFolder() {
    return false;
  }

  function hasRememberedFolder() {
    return false;
  }

  function supported() {
    return true;
  }

  function hasFolder() {
    return ready;
  }

  function hasServer() {
    return false;
  }

  function ensureReady() {
    return ready;
  }

  function statusLabel() {
    if (!ready && lastError) return `読み込み失敗: ${lastError}`;
    if (!ready) return "読み込み中…";
    return "保存先: スプレッドシート";
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function run(name, arg) {
    return new Promise((resolve, reject) => {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((err) => {
          const message = err && err.message ? err.message : String(err || "保存に失敗しました。");
          reject(new Error(message));
        });
      if (arg === undefined) runner[name]();
      else runner[name](arg);
    });
  }

  async function init() {
    try {
      const loaded = await run("loadData");
      data = loaded && Array.isArray(loaded.courses) ? loaded : emptyData();
      ready = true;
      lastError = "";
    } catch (err) {
      ready = false;
      lastError = err && err.message ? err.message : String(err);
      throw err;
    }
    return { data, needsFolder: false, hasFolder: ready };
  }

  async function save() {
    if (!ready) {
      throw new Error(lastError || "スプレッドシートを読み込めていません。ページを開き直してください。");
    }
    await run("saveData", data);
  }

  /** Browser-only cleanup in the folder build. The spreadsheet stays as it is. */
  async function clearLocalBackup() {}

  return {
    getData,
    needsFolder,
    hasRememberedFolder,
    supported,
    hasFolder,
    hasServer,
    ensureReady,
    statusLabel,
    uid,
    init,
    save,
    clearLocalBackup,
  };
})();
