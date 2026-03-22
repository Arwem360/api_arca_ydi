const fs = require("fs");
const path = require("path");
const { loadExcelRows } = require("./excelService");
const { buildCsvIndexByField9 } = require("./csvService");

// ======================================================
// Helpers generales
// ======================================================

function formatField(value, length, type = "string") {
  let str = value == null ? "" : String(value);

  if (str.length > length) {
    str = str.substring(0, length);
  }

  if (type === "number") {
    return str.padStart(length, "0");
  }

  return str.padEnd(length, " ");
}

function onlyDigits(value) {
  return String(value == null ? "" : value).replace(/\D/g, "");
}

function parseAmountToCents(value) {
  let str = String(value == null ? "" : value).trim();

  if (!str) return 0;

  str = str.replace(/\s/g, "");
  str = str.replace(/\./g, "");

  const parts = str.split(",");

  let integerPart = onlyDigits(parts[0] ?? "");
  let decimalPart = onlyDigits(parts[1] ?? "");

  if (!integerPart) integerPart = "0";

  if (decimalPart.length === 0) {
    decimalPart = "00";
  } else if (decimalPart.length === 1) {
    decimalPart = decimalPart + "0";
  } else if (decimalPart.length > 2) {
    decimalPart = decimalPart.substring(0, 2);
  }

  return Number(integerPart + decimalPart);
}

function parseAmountToNumber(value) {
  return parseAmountToCents(value) / 100;
}

function normalizeAmount(value, length) {
  const cents = parseAmountToCents(value);
  return String(cents).padStart(length, "0").substring(0, length);
}

function normalizeRoundedIntegerAmount(value, length) {
  const rounded = Math.round(parseAmountToNumber(value));
  return String(rounded).padStart(length, "0").substring(0, length);
}

// ======================================================
// Registro 01
// ======================================================

function buildHeaderRecord(payload, totalRegistros = 0) {
  const campo13 = String(totalRegistros).padStart(10, "0");

  const record =
    formatField(payload.Tipo, 2, "number") +
    formatField(payload.CUIT, 11, "number") +
    formatField(payload.Periodo, 6, "number") +
    formatField(payload.Secuencia, 2, "number") +
    formatField(payload.Denominacion, 200, "string") +
    formatField(payload.Hora, 6, "number") +
    formatField(payload.Codigo, 4, "number") +
    formatField(payload.CodigoConcepto, 3, "number") +
    formatField(payload.NumeroVerif, 6, "number") +
    formatField(payload.NumeroForm, 4, "number") +
    formatField(payload.NumeroVersion, 5, "number") +
    formatField(payload.Establecimiento, 2, "number") +
    formatField(campo13, 10, "number");

  if (record.length !== 261) {
    throw new Error(`Registro 01 inválido (${record.length})`);
  }

  return record;
}

// ======================================================
// Registro 02
// ======================================================

function getCampo6Registro02(excelCol1, payloadPeriodo) {
  const fechaExcel = String(excelCol1 ?? "").trim(); // YYYYMMDD
  const periodoExcel = fechaExcel.substring(0, 6);
  const periodoPayload = String(payloadPeriodo ?? "").trim();

  return periodoExcel === periodoPayload ? "01" : "04";
}

function buildDetail02Record(excelRow, index, payload) {
  const col1 = excelRow[0] ?? ""; // YYYYMMDD
  const col4 = excelRow[3] ?? "";
  const col8 = excelRow[7] ?? "";

  const cuenta = `CUENTA${index}`;
  const campo6 = getCampo6Registro02(col1, payload?.Periodo);
  const campo9 = onlyDigits(col8).padStart(12, "0").substring(0, 12);

  const record =
    formatField("02", 2, "number") +
    formatField("01", 2, "number") +
    formatField(cuenta, 100, "string") +
    formatField("01", 2, "number") +
    formatField(col1, 8, "string") +
    formatField(campo6, 2, "number") +
    formatField(col1, 8, "string") +
    formatField("0", 1, "number") +
    formatField(campo9, 12, "number") +
    formatField("0", 1, "number") +
    formatField("000000000000", 12, "number") +
    formatField("0", 1, "number") +
    formatField("000000000000", 12, "number") +
    formatField(col4, 22, "string");

  if (record.length !== 185) {
    throw new Error(`Registro 02 inválido (${record.length})`);
  }

  return record;
}

// ======================================================
// Registro 03
// ======================================================

function buildDetail03Record(excelRow) {
  const col2 = excelRow[1] ?? "";
  const col3 = excelRow[2] ?? "";

  const record =
    formatField("03", 2, "number") +
    formatField("96", 2, "number") +
    formatField(col2, 50, "string") +
    formatField("", 20, "string") +
    formatField(col3, 60, "string") +
    formatField("1", 1, "number") +
    formatField("1", 1, "number") +
    formatField("200", 3, "number") +
    formatField("01", 2, "number");

  if (record.length !== 141) {
    throw new Error(`Registro 03 inválido (${record.length})`);
  }

  return record;
}

// ======================================================
// Registro 04 - helpers
// ======================================================

function getCampo2FromCsv(csvCols) {
  const val = String(csvCols[1] ?? "").trim().toUpperCase();
  return val === "DEPOSITO" ? "01" : "02";
}

function getCampo3FromCsv(csvCols) {
  const val = String(csvCols[6] ?? "").trim().toUpperCase();
  return val === "CVU" ? "03" : "02";
}

function groupCsvMatchesFor04(csvMatches) {
  const groups = new Map();

  for (const csvCols of csvMatches) {
    const campo2 = getCampo2FromCsv(csvCols);
    const campo3 = getCampo3FromCsv(csvCols);
    const importe = parseAmountToCents(csvCols[4]); // columna 5 del CSV

    const key = `${campo2}|${campo3}`;

    if (!groups.has(key)) {
      groups.set(key, {
        campo2,
        campo3,
        total: 0 // en centavos
      });
    }

    groups.get(key).total += importe;
  }

  return Array.from(groups.values());
}

function getRoundedImportFromGroup(group) {
  return Math.round(group.total / 100);
}

// ======================================================
// Registro 04
// ======================================================

function buildDetail04RecordFromGroup(group) {
  const importeRedondeado = getRoundedImportFromGroup(group);
  const importe = String(importeRedondeado).padStart(12, "0");

  const record =
    formatField("04", 2, "number") +
    formatField(group.campo2, 2, "number") +
    formatField(group.campo3, 2, "number") +
    formatField("001", 3, "number") +
    formatField(importe, 12, "number") +
    formatField(importe, 12, "number");

  if (record.length !== 33) {
    throw new Error(`Registro 04 inválido (${record.length})`);
  }

  return record;
}

// ======================================================
// Registro 05
// ======================================================

function buildRecord05FromCsv(csvCols) {
  const csvCol9 = String(csvCols[8] ?? "").trim();
  const csvCol5 = csvCols[4] ?? "";

  const importe = normalizeRoundedIntegerAmount(csvCol5, 12);

  const record =
    formatField("05", 2, "number") +
    formatField(csvCol9, 22, "string") +
    formatField(importe, 12, "number");

  if (record.length !== 36) {
    throw new Error(`Registro 05 inválido (${record.length})`);
  }

  return record;
}

function buildRecord05LinesForBlock(csvMatches) {
  const output05 = [];

  for (const csvCols of csvMatches) {
    const amountRounded = Math.round(parseAmountToNumber(csvCols[4]));

    if (amountRounded > 1400000) {
      output05.push(buildRecord05FromCsv(csvCols));
    }
  }

  return output05;
}

// ======================================================
// PROCESO PRINCIPAL
// ======================================================

async function generateOutputFile({ outputDir, excelFile, csvFile, payload }) {
  const timestamp = Date.now();
  const fileName = `resultado-${timestamp}.txt`;
  const filePath = path.join(outputDir, fileName);

  const lines = [];

  // Placeholder del 01
  lines.push("");

  const excelRows = loadExcelRows(excelFile.path);
  const csvIndex = await buildCsvIndexByField9(csvFile.path);

  let total04 = 0;
  let total05 = 0;
  let totalBloquesIncluidos = 0;
  let totalBloquesExcluidos = 0;

  // --------------------------------------------------
  // Bloques 02 / 03 / 04 / 05
  // --------------------------------------------------
  excelRows.forEach((excelRow, idx) => {
    const record02 = buildDetail02Record(excelRow, idx + 1, payload);
    const record03 = buildDetail03Record(excelRow);

    // Relación:
    // campo 9 del CSV == columna 4 del Excel
    const excelCol4 = String(excelRow[3] ?? "").trim();
    const csvMatches = csvIndex.get(excelCol4) || [];

    const grouped04 = groupCsvMatchesFor04(csvMatches);

    // Suma del bloque usando importes ya redondeados de los 04
    const sumaBloque04 = grouped04.reduce((acc, group) => {
      return acc + getRoundedImportFromGroup(group);
    }, 0);

    // Solo se incluye el bloque si la suma es > 400000
    if (sumaBloque04 > 400000) {
      lines.push(record02);
      lines.push(record03);

      // Primero los 04 del bloque
      grouped04.forEach((group) => {
        lines.push(buildDetail04RecordFromGroup(group));
        total04++;
      });

      // Después los 05 relacionados a ese mismo bloque
      const records05 = buildRecord05LinesForBlock(csvMatches);
      records05.forEach((record05) => {
        lines.push(record05);
        total05++;
      });

      totalBloquesIncluidos++;
    } else {
      totalBloquesExcluidos++;
    }
  });

  // --------------------------------------------------
  // Reemplazar el 01 con el total real de registros
  // --------------------------------------------------
  const totalRegistros = lines.length;
  lines[0] = buildHeaderRecord(payload, totalRegistros);

  // --------------------------------------------------
  // Escribir archivo
  // --------------------------------------------------
  await fs.promises.writeFile(filePath, lines.join("\n") + "\n", "utf8");

  return {
    fileName,
    path: filePath,
    totalLines: lines.length,
    registros04: total04,
    registros05: total05,
    bloquesIncluidos: totalBloquesIncluidos,
    bloquesExcluidos: totalBloquesExcluidos
  };
}

module.exports = {
  generateOutputFile
};