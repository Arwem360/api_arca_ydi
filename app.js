const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { generateOutputFile } = require("./services/fileGenerator");

const app = express();
const PORT = 3000;

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({ storage });

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Servicio levantado" });
});

app.post(
  "/upload",
  upload.fields([
    { name: "csvFile", maxCount: 1 },
    { name: "excelFile", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const csvFile = req.files?.csvFile?.[0];
      const excelFile = req.files?.excelFile?.[0];

      if (!csvFile || !excelFile) {
        return res.status(400).json({
          ok: false,
          message: "Debés enviar ambos archivos: csvFile y excelFile"
        });
      }

      let payload;
      try {
        payload = JSON.parse(req.body.payload);
      } catch (e) {
        return res.status(400).json({
          ok: false,
          message: "El campo payload no contiene un JSON válido"
        });
      }

      if (String(payload.Tipo || "").padStart(2, "0") !== "01") {
        return res.status(400).json({
          ok: false,
          message: "El header debe tener payload.Tipo = '01'"
        });
      }

      const output = await generateOutputFile({
        outputDir,
        excelFile,
        csvFile,
        payload
      });

      return res.json({
        ok: true,
        message: "Archivo generado correctamente",
        output
      });
    } catch (error) {
      console.error("Error en /upload:", error);
      return res.status(500).json({
        ok: false,
        message: "Error interno del servidor",
        detail: error.message
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});