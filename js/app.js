/* App shell: alva-noto style layered navigation + screens. */

(() => {
  const MAIN_ITEMS = [
    { id: "input", label: "出欠の入力" },
    { id: "confirm", label: "出欠の確認" },
    { id: "edit", label: "出欠の変更" },
    { id: "roster", label: "名簿データ" },
    { id: "seating", label: "座席の設定" },
  ];

  const state = {
    main: null,
    courseId: null,
    marks: {}, // studentId -> absent|late
    inputDate: null, // YYYY-MM-DD for past attendance; null = today
    seatingCtrl: null,
  };

  const el = {
    navi1: document.getElementById("navi1"),
    navi2: document.getElementById("navi2"),
    contents: document.getElementById("contents"),
    folderStatus: document.getElementById("folder-status"),
    btnFolder: document.getElementById("btn-folder"),
    btnReconnect: document.getElementById("btn-reconnect"),
    modal: document.getElementById("modal"),
    modalMessage: document.getElementById("modal-message"),
    modalInputWrap: document.getElementById("modal-input-wrap"),
    modalInput: document.getElementById("modal-input"),
    modalActions: document.getElementById("modal-actions"),
  };

  function data() {
    return Storage.getData();
  }

  function courses() {
    return data().courses || [];
  }

  function currentCourse() {
    return Roster.findCourse(data(), state.courseId);
  }

  function needsReconnect() {
    return (
      typeof Storage.needsFolder === "function" &&
      Storage.needsFolder() &&
      typeof Storage.hasRememberedFolder === "function" &&
      Storage.hasRememberedFolder()
    );
  }

  function updateFolderStatus() {
    if (typeof Storage.statusLabel === "function") {
      el.folderStatus.textContent = Storage.statusLabel();
    } else if (Storage.hasFolder()) {
      el.folderStatus.textContent = `保存先: ${Storage.folderName()} / ${Storage.DATA_FILE}`;
    } else {
      el.folderStatus.textContent = "未選択（データフォルダを選んでください）";
    }
    const needs = typeof Storage.needsFolder === "function" && Storage.needsFolder();
    const reconnect = needsReconnect();
    el.folderStatus.classList.toggle("folder-needed", needs);
    el.btnFolder.classList.toggle("folder-needed", needs && !reconnect);
    if (el.btnReconnect) {
      el.btnReconnect.classList.toggle("hidden", !reconnect);
      el.btnReconnect.classList.toggle("folder-needed", reconnect);
    }
  }

  async function afterFolderConnected() {
    updateFolderStatus();
    state.courseId = null;
    state.seatingCtrl = null;
    render();
  }

  async function tryReconnectFolder() {
    if (!(typeof Storage.reconnectFolder === "function")) return false;
    if (!(typeof Storage.hasRememberedFolder === "function" && Storage.hasRememberedFolder())) {
      return false;
    }
    const ok = await Storage.reconnectFolder();
    if (!ok) return false;
    await afterFolderConnected();
    return true;
  }

  async function ensureFolder() {
    if (Storage.hasFolder()) return true;
    if (Storage.hasServer && Storage.hasServer()) return true;
    if (typeof Storage.ensureReady === "function") {
      const ready = await Storage.ensureReady();
      if (ready) {
        updateFolderStatus();
        return true;
      }
    }
    // Permission often expires after closing the tab; reconnect on this click.
    if (await tryReconnectFolder()) return true;
    try {
      await Storage.pickFolder();
      await afterFolderConnected();
      return true;
    } catch (err) {
      if (err && err.name === "AbortError") return false;
      await alertModal(err.message || String(err));
      return false;
    }
  }

  async function promptForDataFolder() {
    if (!(typeof Storage.needsFolder === "function" && Storage.needsFolder())) return;
    if (!Storage.supported()) {
      await alertModal(
        typeof Storage.folderUnsupportedMessage === "function"
          ? Storage.folderUnsupportedMessage()
          : "Chrome または Edge でこのページを開いてください。"
      );
      return;
    }

    const remembered =
      typeof Storage.hasRememberedFolder === "function" && Storage.hasRememberedFolder();
    const name = Storage.folderName ? Storage.folderName() : "";

    if (remembered && name) {
      const r = await showModal({
        message: `前回選んだフォルダ「${name}」への接続許可が切れています。再接続すると、同じフォルダのデータを引き続き使えます（ネットには送りません）。`,
        buttons: [
          { label: "後で", action: "later" },
          { label: "別のフォルダ", action: "pick" },
          {
            label: "再接続",
            action: "reconnect",
            run: () => Storage.reconnectFolder(),
          },
        ],
      });
      if (r.action === "later") return;
      if (r.action === "reconnect") {
        if (r.error) {
          await alertModal(r.error.message || String(r.error));
          return;
        }
        if (!r.runResult) {
          await alertModal(
            "許可が得られませんでした。「別のフォルダ」で同じフォルダを選び直してください。"
          );
          return;
        }
        await afterFolderConnected();
        return;
      }
      // pick
      try {
        await Storage.pickFolder();
        await afterFolderConnected();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        await alertModal(err.message || String(err));
      }
      return;
    }

    const r = await showModal({
      message:
        "名簿・出欠を保存する「データフォルダ」を選んでください。データはこの端末のフォルダだけに保存され、ネットには送りません。",
      buttons: [
        { label: "後で", action: "later" },
        { label: "フォルダを選ぶ", action: "pick" },
      ],
    });
    if (r.action !== "pick") return;
    try {
      await Storage.pickFolder();
      await afterFolderConnected();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      await alertModal(err.message || String(err));
    }
  }

  async function saveData() {
    try {
      await Storage.save();
    } catch (err) {
      await alertModal(err.message || String(err));
      throw err;
    }
  }

  /* ---------- modal ---------- */

  function closeModal() {
    el.modal.classList.add("hidden");
    el.modalActions.innerHTML = "";
    el.modalInputWrap.classList.add("hidden");
    el.modalInput.value = "";
    el.modalInput.type = "text";
    el.modalInput.placeholder = "";
  }

  function showModal({ message, input, buttons }) {
    return new Promise((resolve) => {
      el.modalMessage.textContent = message;
      if (input) {
        el.modalInputWrap.classList.remove("hidden");
        el.modalInput.type = input.type || "text";
        el.modalInput.value = input.value || "";
        el.modalInput.placeholder = input.placeholder || "";
        if (input.max) el.modalInput.max = input.max;
        else el.modalInput.removeAttribute("max");
        if (input.min) el.modalInput.min = input.min;
        else el.modalInput.removeAttribute("min");
        setTimeout(() => el.modalInput.focus(), 0);
      } else {
        el.modalInputWrap.classList.add("hidden");
      }
      el.modalActions.innerHTML = "";
      buttons.forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "box-btn";
        btn.textContent = b.label;
        btn.addEventListener("click", async () => {
          // Run before close so File System Access requestPermission keeps user activation.
          let runResult;
          if (typeof b.run === "function") {
            btn.disabled = true;
            try {
              runResult = await b.run();
            } catch (err) {
              btn.disabled = false;
              closeModal();
              resolve({ action: b.action, value: null, runResult: null, error: err });
              return;
            }
          }
          const value = input ? el.modalInput.value.trim() : null;
          closeModal();
          resolve({ action: b.action, value, runResult });
        });
        el.modalActions.appendChild(btn);
      });
      el.modal.classList.remove("hidden");
    });
  }

  function alertModal(message) {
    return showModal({
      message,
      buttons: [{ label: "OK", action: "ok" }],
    });
  }

  function confirmModal(message) {
    return showModal({
      message,
      buttons: [
        { label: "いいえ", action: "no" },
        { label: "はい", action: "yes" },
      ],
    }).then((r) => r.action === "yes");
  }

  /* ---------- navigation ---------- */

  function renderNavi1() {
    el.navi1.innerHTML = "";
    MAIN_ITEMS.forEach((item) => {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = item.label;
      if (state.main === item.id) a.classList.add("active");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        state.main = item.id;
        state.courseId = null;
        state.marks = {};
        state.inputDate = null;
        state.seatingCtrl = null;
        render();
      });
      el.navi1.appendChild(a);
    });
  }

  function renderNavi2() {
    el.navi2.innerHTML = "";
    if (!state.main) return;

    courses().forEach((c) => {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = c.name;
      if (state.courseId === c.id) a.classList.add("active");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        state.courseId = c.id;
        if (state.main !== "roster") {
          state.marks = {};
          state.inputDate = null;
          state.seatingCtrl = null;
        }
        render();
      });
      el.navi2.appendChild(a);
    });
  }

  function render() {
    renderNavi1();
    renderNavi2();
    el.contents.innerHTML = "";
    if (!state.main) {
      el.contents.innerHTML = `<p class="empty-state">左の項目を選択してください。</p>`;
      return;
    }
    switch (state.main) {
      case "input":
        renderInput();
        break;
      case "confirm":
        renderConfirm();
        break;
      case "edit":
        renderEdit();
        break;
      case "roster":
        renderRoster();
        break;
      case "seating":
        renderSeating();
        break;
      default:
        break;
    }
  }

  /* ---------- roster ---------- */

  function renderRoster() {
    const panel = document.createElement("div");
    panel.className = "panel";

    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>名簿データ</h2>`;
    const actions = document.createElement("div");
    actions.className = "panel-actions";

    const course = currentCourse();

    if (course) {
      const btnRename = document.createElement("button");
      btnRename.type = "button";
      btnRename.className = "box-btn";
      btnRename.textContent = "講座名の変更";
      btnRename.addEventListener("click", () => onRenameCourse(course));
      actions.appendChild(btnRename);
    }

    const btnLoad = document.createElement("button");
    btnLoad.type = "button";
    btnLoad.className = "box-btn";
    btnLoad.textContent = "名簿読み込み";
    btnLoad.addEventListener("click", onLoadRoster);
    actions.appendChild(btnLoad);
    head.appendChild(actions);
    panel.appendChild(head);

    if (!courses().length) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">まだ名簿がありません。「名簿読み込み」から追加してください。</p>`
      );
    } else if (!course) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">左の講座名を選択すると名簿を表示します。</p>`
      );
    } else {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap roster-wrap";
      const table = document.createElement("table");
      table.className = "general compact-table";
      table.innerHTML = `<tr><th>年</th><th>組</th><th>番</th><th>氏名</th><th>転退学</th><th></th></tr>`;
      Roster.sortStudents(course.students).forEach((s) => {
        const tr = document.createElement("tr");
        if (s.withdrawnDate) tr.classList.add("withdrawn");
        const dateLabel = s.withdrawnDate
          ? Attendance.formatDateLabel(s.withdrawnDate, 1)
          : "—";
        tr.innerHTML =
          `<td>${escapeHtml(s.year)}</td>` +
          `<td>${escapeHtml(s.class)}</td>` +
          `<td>${escapeHtml(s.number)}</td>` +
          `<td>${escapeHtml(s.name)}</td>` +
          `<td class="col-withdrawn">${escapeHtml(dateLabel)}</td>` +
          `<td class="col-action"></td>`;
        const actionTd = tr.querySelector(".col-action");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "box-btn";
        if (s.withdrawnDate) {
          btn.textContent = "取消";
          btn.addEventListener("click", () => onClearWithdrawn(course, s));
        } else {
          btn.textContent = "転退学";
          btn.addEventListener("click", () => onSetWithdrawn(course, s));
        }
        actionTd.appendChild(btn);
        table.appendChild(tr);
      });
      wrap.appendChild(table);
      panel.appendChild(wrap);
    }

    el.contents.appendChild(panel);
  }

  async function onRenameCourse(course) {
    if (!(await ensureFolder())) return;
    const res = await showModal({
      message: "新しい講座名を入力してください",
      input: { value: course.name, placeholder: "講座名" },
      buttons: [
        { label: "キャンセル", action: "cancel" },
        { label: "OK", action: "ok" },
      ],
    });
    if (res.action !== "ok") return;
    const prevName = course.name;
    try {
      Roster.renameCourse(data(), course.id, res.value);
    } catch (err) {
      await alertModal(err.message || String(err));
      return;
    }
    try {
      await saveData();
      render();
    } catch (_) {
      course.name = prevName;
    }
  }

  async function onSetWithdrawn(course, student) {
    if (!(await ensureFolder())) return;
    const res = await showModal({
      message: `${student.name} さんの転退学日を選択してください。\n転退学日以降は出欠の入力・変更ができず、欠席等のカウントにも含めません。`,
      input: { type: "date", value: Attendance.todayStr() },
      buttons: [
        { label: "キャンセル", action: "cancel" },
        { label: "OK", action: "ok" },
      ],
    });
    if (res.action !== "ok") return;
    if (!res.value) {
      await alertModal("転退学日を選択してください。");
      return;
    }
    const prev = student.withdrawnDate || null;
    try {
      Roster.setWithdrawnDate(course, student.id, res.value);
    } catch (err) {
      await alertModal(err.message || String(err));
      return;
    }
    try {
      await saveData();
      delete state.marks[student.id];
      render();
    } catch (_) {
      Roster.setWithdrawnDate(course, student.id, prev);
    }
  }

  async function onClearWithdrawn(course, student) {
    if (!(await ensureFolder())) return;
    const ok = await confirmModal(
      `${student.name} さんの転退学を取り消しますか？`
    );
    if (!ok) return;
    const prev = student.withdrawnDate || null;
    Roster.setWithdrawnDate(course, student.id, null);
    try {
      await saveData();
      render();
    } catch (_) {
      Roster.setWithdrawnDate(course, student.id, prev);
    }
  }

  async function onLoadRoster() {
    if (!(await ensureFolder())) return;

    const nameRes = await showModal({
      message: "講座名を入力してください",
      input: { placeholder: "例: 1年A組 数学" },
      buttons: [
        { label: "キャンセル", action: "cancel" },
        { label: "OK", action: "ok" },
      ],
    });
    if (nameRes.action !== "ok") return;
    const courseName = nameRes.value;
    if (!courseName) {
      await alertModal("講座名を入力してください。");
      return;
    }

    const existing = Roster.findCourseByName(data(), courseName);
    if (existing) {
      const ok = await confirmModal(
        `「${courseName}」は既にあります。名簿を上書きしますか？（座席設定はクリアされます）`
      );
      if (!ok) return;
    } else if (courses().length >= Roster.MAX_COURSES) {
      await alertModal(`講座は最大${Roster.MAX_COURSES}個までです。`);
      return;
    }

    const notice = await showModal({
      message:
        "エクセルファイルをアップロードしてください（注意：１行目はデータ項目とし、２行目以降を読み込みます）\nA列:年次 / B列:クラス / C列:出席番号 / D列:氏名",
      buttons: [
        { label: "キャンセル", action: "cancel" },
        { label: "OK", action: "ok" },
      ],
    });
    if (notice.action !== "ok") return;

    const file = await pickExcelFile();
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const students = Roster.parseWorkbook(buf);
      const { course } = Roster.upsertCourse(data(), courseName, students);
      await saveData();
      state.courseId = course.id;
      await alertModal(`「${courseName}」に ${students.length} 名を読み込みました。`);
      render();
    } catch (err) {
      await alertModal(err.message || String(err));
    }
  }

  function pickExcelFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept =
        ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
      let settled = false;
      const done = (file) => {
        if (settled) return;
        settled = true;
        resolve(file);
      };
      input.addEventListener("change", () => {
        done(input.files && input.files[0] ? input.files[0] : null);
      });
      // File dialog cancel does not fire "change"; resolve null after focus returns
      window.addEventListener(
        "focus",
        () => {
          setTimeout(() => done(null), 400);
        },
        { once: true }
      );
      input.click();
    });
  }

  /* ---------- seating ---------- */

  function renderSeating() {
    const panel = document.createElement("div");
    panel.className = "panel";

    const course = currentCourse();
    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>座席の設定${course ? " — " + escapeHtml(course.name) : ""}</h2>`;

    if (!course) {
      panel.appendChild(head);
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">左の講座名を選択してください。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    // Recreate controller if course changed or missing
    if (
      !state.seatingCtrl ||
      state.seatingCtrl.courseId !== course.id
    ) {
      state.seatingCtrl = Seating.createController(course);
      state.seatingCtrl.courseId = course.id;
    }
    const ctrl = state.seatingCtrl;

    const actions = document.createElement("div");
    actions.className = "panel-actions";
    const btnUndo = document.createElement("button");
    btnUndo.type = "button";
    btnUndo.className = "box-btn";
    btnUndo.textContent = "undo";
    btnUndo.disabled = !ctrl.canUndo();
    btnUndo.addEventListener("click", () => {
      ctrl.undo();
      render();
    });
    const btnClear = document.createElement("button");
    btnClear.type = "button";
    btnClear.className = "box-btn";
    btnClear.textContent = "座席のクリア";
    btnClear.addEventListener("click", async () => {
      const ok = await confirmModal("座席をすべてクリアしますか？");
      if (!ok) return;
      ctrl.clearAll();
      render();
    });
    const btnDecide = document.createElement("button");
    btnDecide.type = "button";
    btnDecide.className = "box-btn";
    btnDecide.textContent = "決定";
    btnDecide.addEventListener("click", async () => {
      if (!(await ensureFolder())) return;
      const prevSeats = course.seats;
      course.seats = Seating.normalize(ctrl.getSeats());
      try {
        await saveData();
        await alertModal("座席を保存しました。");
        state.seatingCtrl = null;
        render();
      } catch (_) {
        course.seats = prevSeats;
      }
    });
    actions.append(btnUndo, btnClear, btnDecide);
    head.appendChild(actions);
    panel.appendChild(head);

    const layout = document.createElement("div");
    layout.className = "seating-layout";

    const list = document.createElement("div");
    list.className = "student-list";
    const header = document.createElement("div");
    header.className = "student-row header";
    header.innerHTML = `<div>No.</div><div>年</div><div>組</div><div class="col-num">番</div><div>氏名</div>`;
    list.appendChild(header);
    Roster.sortStudents(course.students).forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "student-row";
      if (s.withdrawnDate) row.classList.add("withdrawn");
      row.innerHTML =
        `<div>${i + 1}</div>` +
        `<div>${escapeHtml(s.year)}</div>` +
        `<div>${escapeHtml(s.class)}</div>` +
        `<div class="col-num">${escapeHtml(s.number)}</div>` +
        `<div>${escapeHtml(s.name)}</div>`;
      list.appendChild(row);
    });

    const gridWrap = document.createElement("div");
    gridWrap.className = "seat-grid-wrap";
    gridWrap.innerHTML = `<div class="perspective-label">黒板側</div>`;
    const grid = document.createElement("div");
    grid.className = "seat-grid setup";
    const seats = ctrl.getSeats();
    for (let r = 0; r < Seating.ROWS; r++) {
      for (let c = 0; c < Seating.COLS; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "seat-cell";
        const v = seats[r][c];
        if (v != null) {
          cell.textContent = String(v);
          cell.classList.add("filled");
        } else {
          cell.textContent = "";
        }
        cell.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (ctrl.place(r, c)) {
            // Keep editing the same course controller after re-render
            render();
          }
        });
        grid.appendChild(cell);
      }
    }
    gridWrap.appendChild(grid);
    const desk = document.createElement("div");
    desk.className = "teacher-desk";
    desk.textContent = "教卓";
    gridWrap.appendChild(desk);

    layout.append(list, gridWrap);
    panel.appendChild(layout);
    el.contents.appendChild(panel);
  }

  /* ---------- input ---------- */

  function inputTargetDate() {
    return state.inputDate && Attendance.isValidDateStr(state.inputDate)
      ? state.inputDate
      : Attendance.todayStr();
  }

  function renderInput() {
    const panel = document.createElement("div");
    panel.className = "panel";
    const course = currentCourse();
    const targetDate = inputTargetDate();
    const isPast = !!state.inputDate;

    const head = document.createElement("div");
    head.className = "panel-head";
    const titleParts = ["出欠の入力"];
    if (course) titleParts.push(" — " + course.name);
    if (isPast) titleParts.push(`（${Attendance.formatDateLabel(targetDate, 1)}）`);
    head.innerHTML = `<h2>${titleParts.map(escapeHtml).join("")}</h2>`;

    if (!course) {
      panel.appendChild(head);
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">左の講座名を選択してください。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    const hasSeat = (course.seats || []).some((row) => row.some((v) => v != null));
    if (!hasSeat) {
      panel.appendChild(head);
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">座席が未設定です。「座席の設定」で座席を決めてから入力してください。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    const actions = document.createElement("div");
    actions.className = "panel-actions";
    const legend = document.createElement("span");
    legend.className = "hint";
    legend.textContent = isPast
      ? `${Attendance.formatDateLabel(targetDate, 1)} の出欠 ／ タップ: 欠席 → 遅刻 → 出席`
      : "タップ: 欠席 → 遅刻 → 出席";
    actions.appendChild(legend);

    if (isPast) {
      const btnToday = document.createElement("button");
      btnToday.type = "button";
      btnToday.className = "box-btn";
      btnToday.textContent = "今日の入力に戻る";
      btnToday.addEventListener("click", () => {
        state.inputDate = null;
        state.marks = {};
        render();
      });
      actions.appendChild(btnToday);
    } else {
      const btnPast = document.createElement("button");
      btnPast.type = "button";
      btnPast.className = "box-btn";
      btnPast.textContent = "過去の出欠入力";
      btnPast.addEventListener("click", () => onPastInput());
      actions.appendChild(btnPast);
    }

    const btnRecord = document.createElement("button");
    btnRecord.type = "button";
    btnRecord.className = "box-btn";
    btnRecord.textContent = "記録";
    btnRecord.addEventListener("click", () => onRecord(course));
    actions.appendChild(btnRecord);
    head.appendChild(actions);
    panel.appendChild(head);

    const stage = document.createElement("div");
    stage.className = "input-stage";

    const grid = document.createElement("div");
    grid.className = "input-seat-grid";
    const seats = Seating.normalize(course.seats);
    const sorted = Roster.sortStudents(course.students);

    // Hide rows that have no assigned seats at all
    const activeRows = [];
    for (let r = 0; r < Seating.ROWS; r++) {
      if (seats[r].some((serial) => serial != null)) activeRows.push(r);
    }
    const rowCount = Math.max(activeRows.length, 1);
    grid.style.setProperty("--rows", String(rowCount));
    grid.style.setProperty("--cols", String(Seating.COLS));

    activeRows.forEach((r) => {
      for (let c = 0; c < Seating.COLS; c++) {
        const serial = seats[r][c];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "seat-cell";
        if (serial == null) {
          cell.classList.add("empty-slot");
          cell.disabled = true;
        } else {
          const stu = Seating.studentBySerial(course, serial, sorted);
          if (!stu) {
            cell.classList.add("empty-slot");
            cell.disabled = true;
          } else {
            const withdrawn = Roster.isWithdrawnOn(stu, targetDate);
            if (withdrawn) {
              cell.classList.add("withdrawn");
              cell.disabled = true;
              delete state.marks[stu.id];
            } else {
              const mark = state.marks[stu.id] || null;
              if (mark === "absent") cell.classList.add("absent");
              if (mark === "late") cell.classList.add("late");
              cell.addEventListener("click", () => {
                state.marks[stu.id] = Attendance.cycleMark(state.marks[stu.id] || null);
                if (!state.marks[stu.id]) delete state.marks[stu.id];
                render();
              });
            }
            cell.innerHTML =
              `<span class="seat-label">` +
              `<span class="seat-meta">${escapeHtml(Roster.labelStudent(stu))}</span>` +
              `<span class="seat-name">${escapeHtml(stu.name)}</span>` +
              `</span>`;
          }
        }
        grid.appendChild(cell);
      }
    });
    stage.appendChild(grid);

    const desk = document.createElement("div");
    desk.className = "teacher-desk";
    desk.textContent = "教卓";
    stage.appendChild(desk);

    panel.appendChild(stage);
    el.contents.appendChild(panel);
  }

  async function onPastInput() {
    const yesterday = Attendance.yesterdayStr();
    const r = await showModal({
      message: "出欠を入力する日付を選んでください。",
      input: {
        type: "date",
        value: state.inputDate || yesterday,
        max: yesterday,
      },
      buttons: [
        { label: "キャンセル", action: "cancel" },
        { label: "この日付で入力", action: "ok" },
      ],
    });
    if (r.action !== "ok") return;
    if (!Attendance.isValidDateStr(r.value)) {
      await alertModal("日付を選択してください。");
      return;
    }
    if (r.value > yesterday) {
      await alertModal("今日より前の日付を選んでください。");
      return;
    }
    state.inputDate = r.value;
    state.marks = {};
    render();
  }

  async function onRecord(course) {
    if (!(await ensureFolder())) return;

    const date = inputTargetDate();
    let result = Attendance.recordSession(course, state.marks, {
      forceAdd: false,
      date,
    });
    if (result.needConfirm) {
      const label = Attendance.formatDateLabel(date, 1);
      const ok = await confirmModal(
        `${label} はすでに記録されています。加算しますか？`
      );
      if (!ok) return;
      result = Attendance.recordSession(course, state.marks, {
        forceAdd: true,
        date,
      });
    }

    try {
      await saveData();
      state.marks = {};
      const label = Attendance.formatDateLabel(date, 1);
      await alertModal(
        state.inputDate
          ? `${label} の出欠を記録しました。`
          : "出欠を記録しました。"
      );
      render();
    } catch (_) {
      // Roll back the session added in memory
      if (result.session && course.sessions) {
        const idx = course.sessions.findIndex((s) => s.id === result.session.id);
        if (idx >= 0) course.sessions.splice(idx, 1);
      }
    }
  }

  /* ---------- confirm ---------- */

  function renderConfirm() {
    const panel = document.createElement("div");
    panel.className = "panel";
    const course = currentCourse();

    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>出欠の確認${course ? " — " + escapeHtml(course.name) : ""}</h2>`;
    panel.appendChild(head);

    if (!course) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">左の講座名を選択してください。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "table-wrap confirm-wrap";
    const table = document.createElement("table");
    table.className = "general confirm-table";
    table.innerHTML = `<tr>
      <th class="col-year">年</th>
      <th class="col-class">組</th>
      <th class="col-num">番</th>
      <th class="col-name">氏名</th>
      <th class="col-count">欠席</th>
      <th class="col-count">遅刻</th>
      <th class="col-count">出停</th>
      <th class="col-count">公欠</th>
    </tr>`;

    Roster.sortStudents(course.students).forEach((s) => {
      const t = Attendance.totalsForStudent(course, s.id);
      const tr = document.createElement("tr");
      if (s.withdrawnDate) tr.classList.add("withdrawn");
      tr.innerHTML =
        `<td class="col-year">${escapeHtml(s.year)}</td>` +
        `<td class="col-class">${escapeHtml(s.class)}</td>` +
        `<td class="col-num">${escapeHtml(s.number)}</td>` +
        `<td class="col-name">${escapeHtml(s.name)}</td>` +
        `<td class="col-count">${t.absent}</td>` +
        `<td class="col-count">${t.late}</td>` +
        `<td class="col-count">${t.suspended}</td>` +
        `<td class="col-count">${t.official}</td>`;
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    panel.appendChild(wrap);
    el.contents.appendChild(panel);
  }

  /* ---------- edit ---------- */

  function renderEdit() {
    const panel = document.createElement("div");
    panel.className = "panel";
    const course = currentCourse();

    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>出欠の変更${course ? " — " + escapeHtml(course.name) : ""}</h2>`;
    panel.appendChild(head);

    if (!course) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">左の講座名を選択してください。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    const sessions = course.sessions || [];
    if (!sessions.length) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<p class="empty-state">まだ出欠記録がありません。</p>`
      );
      el.contents.appendChild(panel);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "edit-wrap";
    const table = document.createElement("table");
    table.className = "edit-matrix";

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    hr.innerHTML =
      `<th class="sticky-col sticky-year">年</th>` +
      `<th class="sticky-col sticky-class">組</th>` +
      `<th class="sticky-col sticky-num">番</th>` +
      `<th class="sticky-col sticky-name">氏名</th>`;
    sessions.forEach((sess) => {
      const th = document.createElement("th");
      th.textContent = Attendance.formatDateLabel(sess.date, sess.sessionIndex || 1);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    Roster.sortStudents(course.students).forEach((s) => {
      const tr = document.createElement("tr");
      if (s.withdrawnDate) tr.classList.add("withdrawn");
      tr.insertAdjacentHTML(
        "beforeend",
        `<td class="sticky-col sticky-year">${escapeHtml(s.year)}</td>` +
          `<td class="sticky-col sticky-class">${escapeHtml(s.class)}</td>` +
          `<td class="sticky-col sticky-num">${escapeHtml(s.number)}</td>` +
          `<td class="sticky-col sticky-name">${escapeHtml(s.name)}</td>`
      );

      sessions.forEach((sess) => {
        const td = document.createElement("td");
        const locked = Roster.isWithdrawnOn(s, sess.date);
        if (locked) {
          td.className = "locked-cell";
          td.textContent = "—";
          td.title = "転退学日以降のため変更できません";
        } else {
          const sel = document.createElement("select");
          Object.entries(Attendance.STATUS).forEach(([key, label]) => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = label;
            sel.appendChild(opt);
          });
          sel.value = sess.statuses?.[s.id] || "present";
          applySelectClass(sel);
          sel.addEventListener("change", async () => {
            const previous = sess.statuses?.[s.id] || "present";
            const next = sel.value;
            if (!(await ensureFolder())) {
              sel.value = previous;
              applySelectClass(sel);
              return;
            }
            Attendance.setStatus(course, sess.id, s.id, next);
            applySelectClass(sel);
            try {
              await saveData();
            } catch (_) {
              Attendance.setStatus(course, sess.id, s.id, previous);
              sel.value = previous;
              applySelectClass(sel);
            }
          });
          td.appendChild(sel);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    el.contents.appendChild(panel);

    // Show the latest session (rightmost) when horizontal scroll is needed
    requestAnimationFrame(() => {
      wrap.scrollLeft = wrap.scrollWidth;
    });
  }

  function applySelectClass(sel) {
    sel.classList.remove(
      "status-absent",
      "status-late",
      "status-suspended",
      "status-official"
    );
    if (sel.value === "absent") sel.classList.add("status-absent");
    if (sel.value === "late") sel.classList.add("status-late");
    if (sel.value === "suspended") sel.classList.add("status-suspended");
    if (sel.value === "official") sel.classList.add("status-official");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- boot ---------- */

  el.btnFolder.addEventListener("click", async () => {
    try {
      await Storage.pickFolder();
      await afterFolderConnected();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      await alertModal(err.message || String(err));
    }
  });

  if (el.btnReconnect) {
    el.btnReconnect.addEventListener("click", async () => {
      try {
        const ok = await tryReconnectFolder();
        if (!ok) {
          await alertModal(
            "許可が得られませんでした。「データフォルダ」で同じフォルダを選び直してください。"
          );
        }
      } catch (err) {
        await alertModal(err.message || String(err));
      }
    });
  }

  async function boot() {
    try {
      if (typeof Storage.init === "function") {
        await Storage.init();
      } else if (Storage.supported()) {
        await Storage.restoreFolder();
      }
    } catch (_) {
      /* fall through with empty data */
    }
    updateFolderStatus();
    render();
    await promptForDataFolder();
  }

  boot();
})();
