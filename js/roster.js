/* Roster import / sort helpers. */

const Roster = (() => {
  const MAX_COURSES = 15;

  function sortStudents(students) {
    return [...students].sort((a, b) => {
      const ay = Number(a.year) || 0;
      const by = Number(b.year) || 0;
      if (ay !== by) return ay - by;
      const ac = Number(a.class) || 0;
      const bc = Number(b.class) || 0;
      if (ac !== bc) return ac - bc;
      const an = Number(a.number) || 0;
      const bn = Number(b.number) || 0;
      if (an !== bn) return an - bn;
      return String(a.name).localeCompare(String(b.name), "ja");
    });
  }

  function labelStudent(s) {
    const num = String(s.number ?? "");
    const padded = num.length === 1 ? ` ${num}` : num;
    return `${s.year}年${s.class}組${padded}番`;
  }

  function parseWorkbook(arrayBuffer) {
    if (typeof XLSX === "undefined") {
      throw new Error("Excel読込ライブラリが読み込めていません。");
    }
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("シートが見つかりません。");
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (rows.length < 2) throw new Error("2行目以降にデータがありません。");

    const students = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const year = String(row[0] ?? "").trim();
      const klass = String(row[1] ?? "").trim();
      const number = String(row[2] ?? "").trim();
      const name = String(row[3] ?? "").trim();
      if (!year && !klass && !number && !name) continue;
      if (!name) {
        throw new Error(`${i + 1}行目: 氏名（D列）が空です。`);
      }
      students.push({
        id: Storage.uid("stu"),
        year: year,
        class: klass,
        number: number,
        name: name,
      });
    }
    if (!students.length) throw new Error("有効な生徒データがありません。");
    return sortStudents(students);
  }

  function findCourse(data, courseId) {
    return data.courses.find((c) => c.id === courseId) || null;
  }

  function findCourseByName(data, name) {
    return data.courses.find((c) => c.name === name) || null;
  }

  function createCourse(name, students) {
    return {
      id: Storage.uid("course"),
      name: name,
      students: sortStudents(students),
      seats: createEmptySeats(),
      sessions: [],
    };
  }

  function createEmptySeats() {
    // 8 rows x 6 cols, teacher desk is separate UI under the grid
    return Array.from({ length: 8 }, () => Array(6).fill(null));
  }

  function upsertCourse(data, name, students) {
    const existing = findCourseByName(data, name);
    if (existing) {
      existing.students = sortStudents(students);
      // Clear seat map when roster replaced (serial numbers change meaning)
      existing.seats = createEmptySeats();
      return { course: existing, created: false };
    }
    if (data.courses.length >= MAX_COURSES) {
      throw new Error(`講座は最大${MAX_COURSES}個までです。`);
    }
    const course = createCourse(name, students);
    data.courses.push(course);
    return { course, created: true };
  }

  return {
    MAX_COURSES,
    sortStudents,
    labelStudent,
    parseWorkbook,
    findCourse,
    findCourseByName,
    createCourse,
    createEmptySeats,
    upsertCourse,
  };
})();
