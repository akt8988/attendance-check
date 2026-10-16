/**
 * Web app bound to one spreadsheet.
 * The attendance document is the same { version, courses } object as the local app.
 * It is stored in hidden sheets, split so a cell never holds the whole file.
 */

function doGet() {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("出欠管理")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Raw file contents. Included scripts are not evaluated as templates. */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).getRawContent();
}

function loadData() {
  const ss = activeSpreadsheet_();
  const sheet = ss.getSheetByName("store");
  if (!sheet) return emptyData_();
  const text = joinChunks(sheet.getDataRange().getValues());
  if (!text) return emptyData_();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("保存データを読み取れませんでした。store_backup シートに直前の内容があります。");
  }
  if (!parsed || !Array.isArray(parsed.courses)) return emptyData_();
  return parsed;
}

function saveData(payload) {
  if (!payload || !Array.isArray(payload.courses)) {
    throw new Error("保存データが不正です。");
  }
  const ss = activeSpreadsheet_();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) {
    throw new Error("別の保存が終わっていません。少し待ってからもう一度操作してください。");
  }
  try {
    const store = getOrCreateSheet_(ss, "store");
    const backup = getOrCreateSheet_(ss, "store_backup");
    copyValues_(store, backup);
    try {
      writeChunks_(store, JSON.stringify(payload));
    } catch (err) {
      copyValues_(backup, store);
      throw err;
    }
    try {
      writeGuide_(ss);
      hideDataSheet_(store);
      hideDataSheet_(backup);
    } catch (err) {
      // The attendance document is already in the store sheet.
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function emptyData_() {
  return { version: 1, courses: [] };
}

function activeSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("スプレッドシートの「拡張機能」から作ったスクリプトで開いてください。");
  }
  return ss;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function copyValues_(fromSheet, toSheet) {
  const values = fromSheet.getDataRange().getValues();
  toSheet.clear();
  if (!values.length) return;
  const range = toSheet.getRange(1, 1, values.length, values[0].length);
  range.setNumberFormat("@");
  range.setValues(values);
}

function writeChunks_(sheet, text) {
  const rows = splitChunks(text).map(function (part) {
    return [CHUNK_PREFIX + part];
  });
  sheet.clear();
  const range = sheet.getRange(1, 1, rows.length, 1);
  range.setNumberFormat("@");
  range.setValues(rows);
}

function writeGuide_(ss) {
  let front = null;
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name !== "store" && name !== "store_backup") {
      front = sheets[i];
      break;
    }
  }
  if (!front) front = ss.insertSheet("ご案内", 0);
  if (!front.getRange("A1").getValue()) {
    front
      .getRange("A1")
      .setValue("出欠データはウェブアプリから読み書きします。store シートのセルは編集しないでください。");
    front.setColumnWidth(1, 640);
  }
}

function hideDataSheet_(sheet) {
  const sheets = sheet.getParent().getSheets();
  let visible = 0;
  for (let i = 0; i < sheets.length; i++) {
    if (!sheets[i].isSheetHidden()) visible++;
  }
  if (visible > 1 && !sheet.isSheetHidden()) sheet.hideSheet();
}
