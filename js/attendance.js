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

  function totalsForStudent(course, studentId) {
    const t = { absent: 0, late: 0, earlyLeave: 0, suspended: 0, official: 0 };
    const stu = (course.students || []).find((s) => s.id === studentId);
    for (const sess of course.sessions || []) {
      // Sessions on/after withdrawal date are excluded from counts
      if (stu && Roster.isWithdrawnOn(stu, sess.date)) continue;
      const st = sess.statuses?.[studentId];
      if (st === "absent") t.absent++;
      else if (st === "late") t.late++;
      else if (st === "earlyLeave") t.earlyLeave++;
      else if (st === "suspended") t.suspended++;
      else if (st === "official") t.official++;
    }
    return t;
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
    sessionsOnDate,
    recordSession,
    updateSessionDate,
    deleteSession,
    totalsForStudent,
    cycleMark,
    setStatus,
  };
})();
