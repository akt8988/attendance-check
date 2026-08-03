/* Persistence: data folder (primary on Pages) + local server API (dev) + IndexedDB backup. */

const Storage = (() => {
  const DATA_FILE = "attendance-data.json";
  const API_PATH = "/api/data";
  const DB_NAME = "attendance-local";
  const STORE = "handles";

  let dirHandle = null;
  /** True only when dirHandle currently has readwrite permission. */
  let folderGranted = false;
  let data = emptyData();
  let serverAvailable = false;

  function emptyData() {
    return { version: 1, courses: [] };
  }

  function normalize(parsed) {
    if (!parsed || !Array.isArray(parsed.courses)) return emptyData();
    return parsed;
  }

  function getData() {
    return data;
  }

  function supported() {
    return typeof window.showDirectoryPicker === "function";
  }

  /** True when there is no writable folder and no local server (typical GitHub Pages). */
  function needsFolder() {
    return !(dirHandle && folderGranted) && !serverAvailable;
  }

  /** Handle remembered in IndexedDB, even if permission is not granted yet. */
  function hasRememberedFolder() {
    return !!dirHandle;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function queryGranted(handle, mode = "readwrite") {
    if (!handle) return false;
    try {
      return (await handle.queryPermission({ mode })) === "granted";
    } catch (_) {
      return false;
    }
  }

  /**
   * requestPermission requires a user gesture (click). Do not call during boot.
   */
  async function ensurePermission(handle, mode = "readwrite") {
    if (!handle) return false;
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    try {
      if ((await handle.requestPermission(opts)) === "granted") return true;
    } catch (_) {
      /* NotAllowedError when called without user activation */
    }
    return false;
  }

  async function readJsonFromDir(handle) {
    try {
      const fileHandle = await handle.getFileHandle(DATA_FILE);
      const file = await fileHandle.getFile();
      const text = await file.text();
      if (!text.trim()) return emptyData();
      return normalize(JSON.parse(text));
    } catch (err) {
      if (err && err.name === "NotFoundError") return emptyData();
      throw err;
    }
  }

  async function writeJsonToDir(handle, payload) {
    const fileHandle = await handle.getFileHandle(DATA_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
  }

  async function probeServer() {
    try {
      const res = await fetch(API_PATH, { method: "GET", cache: "no-store" });
      if (!res.ok) return null;
      const parsed = normalize(await res.json());
      serverAvailable = true;
      return parsed;
    } catch (_) {
      serverAvailable = false;
      return null;
    }
  }

  async function writeServer(payload) {
    const res = await fetch(API_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload, null, 2),
    });
    if (!res.ok) {
      throw new Error(
        "サーバーへの保存に失敗しました。開発用サーバーが起動しているか確認してください。"
      );
    }
    serverAvailable = true;
  }

  async function writeIdbBackup(payload) {
    try {
      await idbSet("payload", payload);
    } catch (_) {
      /* non-fatal */
    }
  }

  function folderUnsupportedMessage() {
    return "このブラウザはフォルダ保存に対応していません。Chrome または Edge で、https:// のページ（またはローカル開発時の http://127.0.0.1）から開いてください。";
  }

  function folderRequiredMessage() {
    return "保存先がありません。右上の「データフォルダ」を選び、名簿・出欠を保存するフォルダを指定してください。データはこの端末のフォルダにだけ保存され、ネットには送りません。";
  }

  async function pickFolder() {
    if (!supported()) {
      throw new Error(folderUnsupportedMessage());
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirHandle = handle;
    folderGranted = true;
    await idbSet("dir", handle);
    data = await readJsonFromDir(handle);
    if (!data.courses.length) {
      await writeJsonToDir(handle, data);
    }
    await writeIdbBackup(data);
    if (serverAvailable) {
      try {
        await writeServer(data);
      } catch (_) {
        /* optional sync */
      }
    }
    return { name: handle.name, data };
  }

  /**
   * Restore directory handle from IndexedDB. Permission often resets after the tab
   * is closed; only queryPermission here (requestPermission needs a click).
   */
  async function restoreFolder() {
    if (!supported()) return null;
    const handle = await idbGet("dir");
    if (!handle) return null;
    dirHandle = handle;
    const granted = await queryGranted(handle, "readwrite");
    folderGranted = granted;
    if (!granted) {
      return { name: handle.name, data: null, granted: false };
    }
    data = await readJsonFromDir(handle);
    return { name: handle.name, data, granted: true };
  }

  /**
   * Re-request permission for the remembered folder. Must run from a user gesture.
   */
  async function reconnectFolder() {
    if (!dirHandle) return false;
    const ok = await ensurePermission(dirHandle, "readwrite");
    if (!ok) {
      folderGranted = false;
      return false;
    }
    folderGranted = true;
    data = await readJsonFromDir(dirHandle);
    await writeIdbBackup(data);
    return true;
  }

  function hasCourses(payload) {
    return payload && Array.isArray(payload.courses) && payload.courses.length > 0;
  }

  /**
   * Boot: restore from folder (if permitted), else server (dev), else IndexedDB preview.
   * On GitHub Pages, folder is required before durable saves.
   */
  async function init() {
    let folderRestored = null;
    try {
      folderRestored = await restoreFolder();
    } catch (_) {
      folderRestored = null;
    }

    const serverData = await probeServer();
    let idbData = null;
    try {
      idbData = normalize(await idbGet("payload"));
    } catch (_) {
      idbData = null;
    }

    if (folderRestored && folderRestored.granted && hasCourses(folderRestored.data)) {
      data = folderRestored.data;
    } else if (serverData && hasCourses(serverData)) {
      data = serverData;
    } else if (folderRestored && folderRestored.granted) {
      data = folderRestored.data;
    } else if (serverData) {
      data = serverData;
    } else if (idbData && hasCourses(idbData)) {
      // Preview only until folder permission is re-granted (Pages) or server is up (dev)
      data = idbData;
    } else if (idbData) {
      data = idbData;
    } else {
      data = emptyData();
    }

    await writeIdbBackup(data);

    if (serverAvailable && hasCourses(data)) {
      try {
        const current = await probeServer();
        if (!hasCourses(current)) await writeServer(data);
      } catch (_) {
        /* ignore */
      }
    }

    return {
      data,
      serverAvailable,
      hasFolder: !!(dirHandle && folderGranted),
      hasRememberedFolder: !!dirHandle,
      needsFolder: needsFolder(),
    };
  }

  async function save() {
    let folderWritten = false;

    if (dirHandle) {
      const ok = await ensurePermission(dirHandle, "readwrite");
      if (!ok) {
        folderGranted = false;
        throw new Error("フォルダへの書き込み許可がありません。再度「データフォルダ」を選択するか、再接続してください。");
      }
      folderGranted = true;
      await writeJsonToDir(dirHandle, data);
      folderWritten = true;
    }

    if (serverAvailable) {
      try {
        await writeServer(data);
      } catch (err) {
        // Folder already durable — treat server sync failure as non-fatal
        if (!folderWritten) throw err;
        serverAvailable = false;
      }
    } else if (!folderWritten) {
      // Dev server may have started after boot; probe once only when needed
      const probed = await probeServer();
      if (probed !== null) {
        await writeServer(data);
      } else {
        throw new Error(folderRequiredMessage());
      }
    }

    await writeIdbBackup(data);
  }

  async function ensureReady() {
    if ((dirHandle && folderGranted) || serverAvailable) return true;
    const probed = await probeServer();
    return probed !== null;
  }

  function hasFolder() {
    return !!(dirHandle && folderGranted);
  }

  function hasServer() {
    return serverAvailable;
  }

  function folderName() {
    return dirHandle ? dirHandle.name : "";
  }

  function statusLabel() {
    if (dirHandle && folderGranted) {
      return `保存先: ${dirHandle.name} / ${DATA_FILE}`;
    }
    if (dirHandle) {
      return `前回のフォルダ: ${dirHandle.name}（再接続が必要）`;
    }
    if (serverAvailable) {
      return `保存先: data/${DATA_FILE}（自動）`;
    }
    return "未選択（データフォルダを選んでください）";
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    DATA_FILE,
    emptyData,
    getData,
    supported,
    needsFolder,
    pickFolder,
    restoreFolder,
    reconnectFolder,
    init,
    save,
    ensureReady,
    hasFolder,
    hasRememberedFolder,
    hasServer,
    folderName,
    statusLabel,
    folderRequiredMessage,
    folderUnsupportedMessage,
    uid,
  };
})();
