/* Attendance input, totals, and edit helpers. */

const Attendance = (() => {
  const STATUS = {
    present: "出席",
    absent: "欠席",
    late: "遅刻",
    suspended: "出停",
    official: "公欠",
  };

  const INPUT_CYCLE = [null, "absent", "late"];

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
      if (mark === "absent") statuses[stu.id] = "absent";
      else if (mark === "late") statuses[stu.id] = "late";
      else statuses[stu.id] = "present";
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
    course.sessions.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.sessionIndex || 1) - (b.sessionIndex || 1);
    });
    return { needConfirm: false, session };
  }

  function totalsForStudent(course, studentId) {
    const t = { absent: 0, late: 0, suspended: 0, official: 0 };
    const stu = (course.students || []).find((s) => s.id === studentId);
    for (const sess of course.sessions || []) {
      // Sessions on/after withdrawal date are excluded from counts
      if (stu && Roster.isWithdrawnOn(stu, sess.date)) continue;
      const st = sess.statuses?.[studentId];
      if (st === "absent") t.absent++;
      else if (st === "late") t.late++;
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
    totalsForStudent,
    cycleMark,
    setStatus,
  };
})();
