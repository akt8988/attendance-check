/* Pack the static app into an Apps Script project under gas/dist. */

const fs = require("fs");
const path = require("path");

const gasDir = __dirname;
const root = path.join(gasDir, "..");
const dist = path.join(gasDir, "dist");

const clientFiles = [
  ["xlsx", path.join(root, "vendor/xlsx.full.min.js")],
  ["storage", path.join(gasDir, "storage-client.js")],
  ["roster", path.join(root, "js/roster.js")],
  ["seating", path.join(root, "js/seating.js")],
  ["attendance", path.join(root, "js/attendance.js")],
  ["app", path.join(root, "js/app.js")],
];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function stripNodeExport(source) {
  return source.replace(/\n*if \(typeof module !== "undefined" && module\.exports\) \{[\s\S]*$/, "\n");
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const [name, file] of clientFiles) {
  const source = read(file);
  if (/<\/script/i.test(source)) {
    throw new Error(`${file} contains a closing script tag`);
  }
  fs.writeFileSync(path.join(dist, `${name}.html`), source);
}

const css = read(path.join(root, "css/app.css"));
if (/<\/style/i.test(css)) throw new Error("css/app.css contains a closing style tag");
fs.writeFileSync(path.join(dist, "css.html"), css);

fs.copyFileSync(path.join(gasDir, "index.html"), path.join(dist, "index.html"));
fs.copyFileSync(path.join(gasDir, "Code.gs"), path.join(dist, "Code.gs"));
fs.copyFileSync(path.join(gasDir, "appsscript.json"), path.join(dist, "appsscript.json"));
fs.writeFileSync(path.join(dist, "chunks.js"), stripNodeExport(read(path.join(gasDir, "chunks.js"))));

const index = read(path.join(dist, "index.html"));
if (index.includes("Content-Security-Policy") || index.includes("btn-folder") || index.includes("btn-reconnect")) {
  throw new Error("GAS index still has the folder controls or the Pages content policy");
}
for (const name of ["css", ...clientFiles.map(([id]) => id)]) {
  if (!index.includes(`include('${name}')`)) {
    throw new Error(`index is missing include('${name}')`);
  }
}

const chunks = read(path.join(dist, "chunks.js"));
if (chunks.includes("module.exports")) {
  throw new Error("dist/chunks.js still exports to Node");
}

console.log(`built ${dist}`);
