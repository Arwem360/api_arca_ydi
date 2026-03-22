const fs = require("fs");
const readline = require("readline");

async function buildCsvIndexByField9(filePath) {
  const index = new Map();

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;

  for await (const line of rl) {
    if (!line || !line.trim()) {
      continue;
    }

    // si el CSV tiene cabecera, la saltamos
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const cols = line.split(";");

    // campo 9 => índice 8
    const field9 = String(cols[8] ?? "").trim();

    if (!field9) {
      continue;
    }

    if (!index.has(field9)) {
      index.set(field9, []);
    }

    index.get(field9).push(cols);
  }

  return index;
}

module.exports = {
  buildCsvIndexByField9
};