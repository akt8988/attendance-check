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
    seatingCtrl: null,
  };

  const el = {
    navi1: document.getElementById("navi1"),
    navi2: document.getElementById("navi2"),
    contents: document.getElementById("contents"),
    folderStatus: document.getElementById("folder-status"),
    btnFolder: document.getElementById("btn-folder"),
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

  function updateFolderStatus() {
    if (typeof Storage.statusLabel === "function") {
      el.folderStatus.textContent = Storage.statusLabel();
    } else if (Storage.hasFolder()) {
      el.folderStatus.textContent = `保存先: ${Storage.folderName()} / ${Storage.DATA_FILE}`;
    } else {
      el.folderStatus.textContent = "未選択（データフォルダを選んでください）";
    }
    const needs = typeof Storage.needsFolder === "function" && Storage.needsFolder();
    el.folderStatus.classList.toggle("folder-needed", needs);
    el.btnFolder.classList.toggle("folder-needed", needs);
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
    try {
      await Storage.pickFolder();
      updateFolderStatus();
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
      updateFolderStatus();
      state.courseId = null;
      state.seatingCtrl = null;
      render();
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
  }

  function showModal({ message, input, buttons }) {
    return new Promise((resolve) => {
      el.modalMessage.textContent = message;
      if (input) {
        el.modalInputWrap.classList.remove("hidden");
        el.modalInput.value = input.value || "";
        el.modalInput.placeholder = input.placeholder || "";
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
        btn.addEventListener("click", () => {
          const value = input ? el.modalInput.value.trim() : null;
          closeModal();
          resolve({ action: b.action, value });
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
        state.seatingCtrl = null;
        render();
      });
      el.navi1.appendChild(a);
    });
  }

  function renderNavi2() {
    el.navi2.innerHTML = "";
    if (!state.main) return;

    if (state.main === "roster") {
      courses().forEach((c) => {
        const a = document.createElement("a");
        a.href = "#";
        a.textContent = c.name;
        if (state.courseId === c.id) a.classList.add("active");
        a.addEventListener("click", (e) => {
          e.preventDefault();
          state.courseId = c.id;
          render();
        });
        el.navi2.appendChild(a);
      });
      return;
    }

    courses().forEach((c) => {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = c.name;
      if (state.courseId === c.id) a.classList.add("active");
      a.addEventListener("click", (e) => {
        e.preventDefault();
        state.courseId = c.id;
        state.marks = {};
        state.seatingCtrl = null;
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
    const btnLoad = document.createElement("button");
    btnLoad.type = "button";
    btnLoad.className = "box-btn";
    btnLoad.textContent = "名簿読み込み";
    btnLoad.addEventListener("click", onLoadRoster);
    actions.appendChild(btnLoad);
    head.appendChild(actions);
    panel.appendChild(head);

    const course = currentCourse();
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
      table.innerHTML = `<tr><th>年</th><th>組</th><th>番号</th><th>氏名</th></tr>`;
      Roster.sortStudents(course.students).forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(s.year)}</td><td>${escapeHtml(s.class)}</td><td>${escapeHtml(s.number)}</td><td>${escapeHtml(s.name)}</td>`;
        table.appendChild(tr);
      });
      wrap.appendChild(table);
      panel.appendChild(wrap);
    }

    el.contents.appendChild(panel);
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
      input.accept = ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
      input.addEventListener("change", () => {
        resolve(input.files && input.files[0] ? input.files[0] : null);
      });
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
      course.seats = Seating.normalize(ctrl.getSeats());
      try {
        await saveData();
        await alertModal("座席を保存しました。");
        state.seatingCtrl = null;
        render();
      } catch (_) {
        /* already alerted */
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
    header.innerHTML = `<div>No.</div><div></div><div></div>`;
    list.appendChild(header);
    Roster.sortStudents(course.students).forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "student-row";
      row.innerHTML = `<div>${i + 1}</div><div>${escapeHtml(Roster.labelStudent(s))}&nbsp;&nbsp;${escapeHtml(s.name)}</div><div></div>`;
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

  function renderInput() {
    const panel = document.createElement("div");
    panel.className = "panel";
    const course = currentCourse();

    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>出欠の入力${course ? " — " + escapeHtml(course.name) : ""}</h2>`;

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
    legend.textContent = "タップ: 欠席 → 遅刻 → 出席";
    const btnRecord = document.createElement("button");
    btnRecord.type = "button";
    btnRecord.className = "box-btn";
    btnRecord.textContent = "記録";
    btnRecord.addEventListener("click", () => onRecord(course));
    actions.append(legend, btnRecord);
    head.appendChild(actions);
    panel.appendChild(head);

    const stage = document.createElement("div");
    stage.className = "input-stage";

    const grid = document.createElement("div");
    grid.className = "input-seat-grid";
    const seats = Seating.normalize(course.seats);

    // Hide rows that have no assigned seats at all
    const activeRows = [];
    for (let r = 0; r < Seating.ROWS; r++) {
      if (seats[r].some((serial) => serial != null)) activeRows.push(r);
    }
    grid.style.gridTemplateRows = `repeat(${Math.max(activeRows.length, 1)}, auto)`;

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
          const stu = Seating.studentBySerial(course, serial);
          if (!stu) {
            cell.classList.add("empty-slot");
            cell.disabled = true;
          } else {
            const mark = state.marks[stu.id] || null;
            if (mark === "absent") cell.classList.add("absent");
            if (mark === "late") cell.classList.add("late");
            cell.innerHTML = `<div class="seat-meta">${escapeHtml(Roster.labelStudent(stu))}</div><div class="seat-name">${escapeHtml(stu.name)}</div>`;
            cell.addEventListener("click", () => {
              state.marks[stu.id] = Attendance.cycleMark(state.marks[stu.id] || null);
              if (!state.marks[stu.id]) delete state.marks[stu.id];
              render();
            });
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

  async function onRecord(course) {
    if (!(await ensureFolder())) return;

    let result = Attendance.recordSession(course, state.marks, { forceAdd: false });
    if (result.needConfirm) {
      const ok = await confirmModal("すでに記録されています。加算しますか？");
      if (!ok) return;
      result = Attendance.recordSession(course, state.marks, { forceAdd: true });
    }

    try {
      await saveData();
      state.marks = {};
      await alertModal("出欠を記録しました。");
      render();
    } catch (_) {
      /* already alerted */
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
      <th class="col-name"></th>
      <th class="col-count">欠席</th>
      <th class="col-count">遅刻</th>
      <th class="col-count">出停</th>
      <th class="col-count">公欠</th>
    </tr>`;

    Roster.sortStudents(course.students).forEach((s) => {
      const t = Attendance.totalsForStudent(course, s.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="col-name">${escapeHtml(Roster.labelStudent(s))} ${escapeHtml(s.name)}</td>
        <td class="col-count">${t.absent}</td>
        <td class="col-count">${t.late}</td>
        <td class="col-count">${t.suspended}</td>
        <td class="col-count">${t.official}</td>`;
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
    hr.innerHTML = `<th class="sticky-col"></th>`;
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
      const nameTd = document.createElement("td");
      nameTd.className = "sticky-col";
      nameTd.textContent = `${Roster.labelStudent(s)} ${s.name}`;
      tr.appendChild(nameTd);

      sessions.forEach((sess) => {
        const td = document.createElement("td");
        const sel = document.createElement("select");
        Object.entries(Attendance.STATUS).forEach(([key, label]) => {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = label;
          sel.appendChild(opt);
        });
        const current = sess.statuses?.[s.id] || "present";
        sel.value = current;
        applySelectClass(sel);
        sel.addEventListener("change", async () => {
          if (!(await ensureFolder())) {
            sel.value = current;
            applySelectClass(sel);
            return;
          }
          Attendance.setStatus(course, sess.id, s.id, sel.value);
          applySelectClass(sel);
          try {
            await saveData();
          } catch (_) {
            sel.value = current;
            applySelectClass(sel);
          }
        });
        td.appendChild(sel);
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
      updateFolderStatus();
      state.courseId = null;
      state.seatingCtrl = null;
      render();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      await alertModal(err.message || String(err));
    }
  });

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
