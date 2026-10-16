/* Split attendance JSON so each spreadsheet cell stays under the 50,000 character limit. */

var CHUNK_SIZE = 30000;
var CHUNK_PREFIX = "#";

function splitChunks(text) {
  var src = text == null ? "" : String(text);
  var parts = [];
  if (!src.length) return [""];
  for (var i = 0; i < src.length; i += CHUNK_SIZE) {
    parts.push(src.substring(i, i + CHUNK_SIZE));
  }
  return parts;
}

/** `rows` is a sheet column: [[cell], [cell], ...]. */
function joinChunks(rows) {
  var out = "";
  for (var i = 0; i < rows.length; i++) {
    var cell = rows[i] && rows[i][0];
    if (cell == null || cell === "") continue;
    var s = String(cell);
    if (s.charAt(0) === CHUNK_PREFIX) s = s.substring(1);
    out += s;
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CHUNK_SIZE: CHUNK_SIZE,
    CHUNK_PREFIX: CHUNK_PREFIX,
    splitChunks: splitChunks,
    joinChunks: joinChunks,
  };
}
