const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const APIPERU_TOKEN = defineSecret("APIPERU_TOKEN");

exports.consultarSunat = onRequest(
  {
    cors: ["https://erp-controlcostos.web.app", "https://erp-controlcostos.firebaseapp.com"],
    secrets: [APIPERU_TOKEN],
    maxInstances: 10
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido" });
    }

    try {
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const idToken = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(idToken);

      if (!decoded.email || !decoded.email.toLowerCase().endsWith("@marcan.com.pe")) {
        return res.status(403).json({ error: "Acceso restringido a @marcan.com.pe" });
      }

      const ruc = String(req.body?.ruc || "").trim();
      if (!/^\d{11}$/.test(ruc)) {
        return res.status(400).json({ error: "RUC inválido" });
      }

      const token = APIPERU_TOKEN.value();
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      };

      const [respRuc, respRep] = await Promise.all([
        fetch("https://apiperu.dev/api/ruc", { method: "POST", headers, body: JSON.stringify({ ruc }) }),
        fetch("https://apiperu.dev/api/ruc_representantes", { method: "POST", headers, body: JSON.stringify({ ruc }) })
      ]);

      const jsonRuc = respRuc.ok ? await respRuc.json() : null;
      const jsonRep = respRep.ok ? await respRep.json() : null;

      if (!jsonRuc?.success || !jsonRuc?.data) {
        return res.status(404).json({ error: "RUC no encontrado" });
      }

      const reps = Array.isArray(jsonRep?.data)
        ? jsonRep.data
            .map(item => ({
              nombre: String(item.nombre || item.nombres || "").replace(/\s+/g, " ").trim(),
              cargo: String(item.cargo || "Apoderado").trim(),
              tipoDoc: String(item.tipo_documento || item.tipoDocumento || "DNI").toUpperCase(),
              numDoc: String(item.numero_documento || item.numeroDocumento || "").trim()
            }))
            .filter(x => x.nombre)
        : [];

      return res.status(200).json({ data: jsonRuc.data, representantes: reps });
    } catch (err) {
      return res.status(500).json({ error: "Error interno consultando SUNAT" });
    }
  }
);