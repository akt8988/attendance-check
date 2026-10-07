/* Attendance input, totals, and edit helpers. */

const Attendance = (() => {
  const STATUS = {
    present: "出席",
    absent: "欠席",
    late: "遅刻",
    earlyLeave: "早退",
    suspended: "停忌",
    official: "公欠",
  };

  const INPUT_CYCLE = [null, "absent", "late", "earlyLeave"];

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /** Yesterday as YYYY-MM-DD (for past-attendance date pickers). */
  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isValidDateStr(dateStr) {
    return typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  }

  function formatDateLabel(dateStr, sessionIndex) {
    const [, m, d] = dateStr.split("-");
    const base = `${Number(m)}/${Number(d)}`;
    return sessionIndex > 1 ? `${base}#${sessionIndex}` : base;
  }

  /** Add days to YYYY-MM-DD (local calendar, not UTC). */
  function addDays(dateStr, days) {
    if (!isValidDateStr(dateStr)) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${dt.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Semester bucket for a session date.
   * count 2 (二期制): ① through ends.first, then ② after that.
   * count 3 (三期制): ① through ends.first, ② through ends.second, then ③.
   * Until ①'s end is set, every date stays in ①.
   * In a 3-term year, dates after ① stay in ② until ②'s end is set.
   */
  function termForDate(dateStr, ends) {
    const count = ends && ends.count === 2 ? 2 : 3;
    const first = ends && isValidDateStr(ends.first) ? ends.first : "";
    const second =
      count === 3 &&
      first &&
      ends &&
      isValidDateStr(ends.second) &&
      ends.second > first
        ? ends.second
        : "";
    if (!first || dateStr <= first) return 1;
    if (count === 2 || !second || dateStr <= second) return 2;
    return 3;
  }

  function sessionsOnDate(course, dateStr) {
    return (course.sessions || []).filter((s) => s.date === dateStr);
  }

  function nextSessionIndex(course, dateStr) {
    const list = sessionsOnDate(course, dateStr);
    if (!list.length) return 1;
    return Math.max(...list.map((s) => s.sessionIndex || 1)) + 1;
  }

  function sortSessions(course) {
    if (!course.sessions) return;
    course.sessions.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.sessionIndex || 1) - (b.sessionIndex || 1);
    });
  }

  /** Renumber sessionIndex 1..n for sessions on the same date (stable by previous index). */
  function reindexSessionsOnDate(course, dateStr) {
    const list = sessionsOnDate(course, dateStr).slice().sort((a, b) => {
      return (a.sessionIndex || 1) - (b.sessionIndex || 1);
    });
    list.forEach((s, i) => {
      s.sessionIndex = i + 1;
    });
  }

  function findSession(course, sessionId) {
    return (course.sessions || []).find((s) => s.id === sessionId) || null;
  }

  /**
   * Change a session's date. Reassigns sessionIndex on the new date and
   * reindexes remaining sessions on the old date.
   */
  function updateSessionDate(course, sessionId, newDate) {
    if (!isValidDateStr(newDate)) return { ok: false, error: "日付が正しくありません。" };
    const sess = findSession(course, sessionId);
    if (!sess) return { ok: false, error: "出欠記録が見つかりません。" };
    if (sess.date === newDate) return { ok: true, session: sess, unchanged: true };

    const oldDate = sess.date;
    const othersOnNew = sessionsOnDate(course, newDate).filter((s) => s.id !== sessionId);
    sess.date = newDate;
    sess.sessionIndex = othersOnNew.length
      ? Math.max(...othersOnNew.map((s) => s.sessionIndex || 1)) + 1
      : 1;
    reindexSessionsOnDate(course, oldDate);
    reindexSessionsOnDate(course, newDate);
    sortSessions(course);
    return { ok: true, session: sess, oldDate };
  }

  /** Remove a session and reindex remaining sessions on that date. */
  function deleteSession(course, sessionId) {
    if (!course.sessions) return { ok: false, error: "出欠記録が見つかりません。", session: null, index: -1 };
    const idx = course.sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return { ok: false, error: "出欠記録が見つかりません。", session: null, index: -1 };
    const [removed] = course.sessions.splice(idx, 1);
    reindexSessionsOnDate(course, removed.date);
    return { ok: true, session: removed, index: idx };
  }

  function buildStatusesFromMarks(course, marks, dateStr) {
    const date = isValidDateStr(dateStr) ? dateStr : todayStr();
    const statuses = {};
    for (const stu of course.students) {
      if (Roster.isWithdrawnOn(stu, date)) {
        // Withdrawn on/after the session date: not counted; store as present for schema consistency
        statuses[stu.id] = "present";
        continue;
      }
      const mark = marks[stu.id];
      if (mark === "absent" || mark === "late" || mark === "earlyLeave") {
        statuses[stu.id] = mark;
      } else {
        statuses[stu.id] = "present";
      }
    }
    return statuses;
  }

  function recordSession(course, marks, { forceAdd, date: dateOpt } = {}) {
    const date = isValidDateStr(dateOpt) ? dateOpt : todayStr();
    const existing = sessionsOnDate(course, date);
    if (existing.length && !forceAdd) {
      return { needConfirm: true, date, count: existing.length };
    }
    const session = {
      id: Storage.uid("sess"),
      date,
      sessionIndex: nextSessionIndex(course, date),
      statuses: buildStatusesFromMarks(course, marks, date),
    };
    if (!course.sessions) course.sessions = [];
    course.sessions.push(session);
    sortSessions(course);
    return { needConfirm: false, session };
  }

  function emptyTotals() {
    return { absent: 0, late: 0, earlyLeave: 0, suspended: 0, official: 0 };
  }

  function addStatus(t, status) {
    if (status === "absent") t.absent++;
    else if (status === "late") t.late++;
    else if (status === "earlyLeave") t.earlyLeave++;
    else if (status === "suspended") t.suspended++;
    else if (status === "official") t.official++;
  }

  function totalsForStudent(course, studentId) {
    const t = emptyTotals();
    const stu = (course.students || []).find((s) => s.id === studentId);
    for (const sess of course.sessions || []) {
      // Sessions on/after withdrawal date are excluded from counts
      if (stu && Roster.isWithdrawnOn(stu, sess.date)) continue;
      addStatus(t, sess.statuses?.[studentId]);
    }
    return t;
  }

  /** Per-semester counts. `ends` is { first, second } (YYYY-MM-DD, either may be empty). */
  function totalsByTerm(course, studentId, ends) {
    const by = { 1: emptyTotals(), 2: emptyTotals(), 3: emptyTotals() };
    const stu = (course.students || []).find((s) => s.id === studentId);
    for (const sess of course.sessions || []) {
      if (stu && Roster.isWithdrawnOn(stu, sess.date)) continue;
      const term = termForDate(sess.date, ends);
      addStatus(by[term], sess.statuses?.[studentId]);
    }
    return by;
  }

  function cycleMark(current) {
    const idx = INPUT_CYCLE.indexOf(current == null ? null : current);
    const next = INPUT_CYCLE[(idx + 1) % INPUT_CYCLE.length];
    return next;
  }

  function setStatus(course, sessionId, studentId, status) {
    const sess = (course.sessions || []).find((s) => s.id === sessionId);
    if (!sess) return false;
    if (!STATUS[status]) return false;
    const stu = (course.students || []).find((s) => s.id === studentId);
    if (stu && Roster.isWithdrawnOn(stu, sess.date)) return false;
    sess.statuses[studentId] = status;
    return true;
  }

  return {
    STATUS,
    todayStr,
    yesterdayStr,
    isValidDateStr,
    formatDateLabel,
    addDays,
    termForDate,
    sessionsOnDate,
    recordSession,
    updateSessionDate,
    deleteSession,
    totalsForStudent,
    totalsByTerm,
    cycleMark,
    setStatus,
  };
})();
