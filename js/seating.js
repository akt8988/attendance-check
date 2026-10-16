/* Seat assignment: COLSxROWS grid, teacher desk at bottom (teacher view). */

const Seating = (() => {
  const COLS = Roster.COLS;
  const ROWS = Roster.ROWS;

  function cloneSeats(seats) {
    const src = seats && seats.length ? seats : Roster.createEmptySeats();
    return src.map((row) => {
      const r = Array.isArray(row) ? row : [];
      const out = [];
      for (let c = 0; c < COLS; c++) {
        const v = r[c];
        out[c] = Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null;
      }
      return out;
    });
  }

  function normalize(seats) {
    const out = Roster.createEmptySeats();
    const src = seats || [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = src[r] && src[r][c];
        if (v == null || v === "") {
          out[r][c] = null;
        } else {
          const n = Number(v);
          out[r][c] = Number.isFinite(n) && n > 0 ? n : null;
        }
      }
    }
    return out;
  }

  /** Smallest unused serial in 1..studentCount (fills gaps after clear). */
  function nextSerial(seats, studentCount) {
    const used = new Set();
    for (const row of seats) {
      for (const v of row) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) used.add(v);
      }
    }
    for (let i = 1; i <= studentCount; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  /** Resolve student by 1-based serial. Pass sortedStudents to avoid re-sorting. */
  function studentBySerial(course, serial, sortedStudents) {
    if (!serial) return null;
    const sorted = sortedStudents || Roster.sortStudents(course.students);
    return sorted[serial - 1] || null;
  }

  function createController(course) {
    let seats = normalize(course.seats);
    const history = [];

    function snapshot() {
      history.push(cloneSeats(seats));
    }

    function findSerial(serial) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (seats[r][c] === serial) return { r: r, c: c };
        }
      }
      return null;
    }

    /** Place a roster serial. Moves it if already seated; swaps when the target is taken. */
    function assign(row, col, serial) {
      if (!seats[row] || serial == null || serial < 1) return false;
      const occupant = seats[row][col];
      const from = findSerial(serial);
      if (from && from.r === row && from.c === col) return false;
      snapshot();
      if (from) seats[from.r][from.c] = occupant;
      seats[row][col] = serial;
      return true;
    }

    function clearAt(row, col) {
      if (!seats[row] || seats[row][col] == null) return false;
      snapshot();
      seats[row][col] = null;
      return true;
    }

    function undo() {
      if (!history.length) return false;
      seats = history.pop();
      return true;
    }

    function clearAll() {
      snapshot();
      seats = Roster.createEmptySeats();
    }

    function getSeats() {
      return seats;
    }

    function canUndo() {
      return history.length > 0;
    }

    return { assign, clearAt, undo, clearAll, getSeats, canUndo, COLS, ROWS };
  }

  return {
    COLS,
    ROWS,
    cloneSeats,
    normalize,
    nextSerial,
    studentBySerial,
    createController,
  };
})();
