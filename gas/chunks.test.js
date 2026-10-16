const { splitChunks, joinChunks, CHUNK_SIZE, CHUNK_PREFIX } = require("./chunks");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const payload = {
  version: 1,
  courses: [
    {
      id: "course_1",
      name: "数学",
      students: [{ id: "stu_1", year: "1", class: "2", number: "3", name: "山田" }],
      seats: [[null, "stu_1"]],
      sessions: [],
    },
  ],
};

let text = JSON.stringify(payload);
while (text.length <= CHUNK_SIZE) text += "0";

const parts = splitChunks(text);
assert(parts.length >= 2, "long text splits");
assert(parts[0].length === CHUNK_SIZE, "first chunk uses the full size");
assert(parts[1].startsWith("0"), "boundary stays in the string");

const cells = parts.map((part) => [CHUNK_PREFIX + part]);
assert(joinChunks(cells) === text, "roundtrip");
assert(joinChunks([[CHUNK_PREFIX]]) === "", "empty document");
assert(joinChunks([[""], [null], [CHUNK_PREFIX + "abc"]]) === "abc", "blank cells are skipped");
assert(splitChunks("").length === 1 && joinChunks([[CHUNK_PREFIX + splitChunks("")[0]]]) === "", "empty split");

const exact = "a".repeat(CHUNK_SIZE * 2);
assert(joinChunks(splitChunks(exact).map((part) => [CHUNK_PREFIX + part])) === exact, "exact multiple");

console.log("chunks ok");
