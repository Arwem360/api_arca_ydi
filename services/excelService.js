const XLSX = require("xlsx");

function loadExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // header: 1 => devuelve array de arrays
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ""
  });

  // Sacar la primera fila (cabeceras)
  return rows.slice(1);
}

module.exports = {
  loadExcelRows
};