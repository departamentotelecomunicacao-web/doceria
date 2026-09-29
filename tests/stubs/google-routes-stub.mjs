// Stub do contrato da Google Routes API (computeRoutes) para testes locais/E2E.
// Exercita o GoogleRoutesProvider real (requisição, cabeçalhos, parsing) sem
// custo nem chave real. NUNCA é usado em produção.
//
// Comportamento determinístico pelo endereço de destino:
//   rua contém "Falha"       -> HTTP 503 (API indisponível)
//   rua contém "Lenta"       -> responde após 15 s (timeout)
//   rua contém "Inexistente" -> geocoder NOT_FOUND
//   rua contém "Imprecisa"   -> geocodificação só em nível de cidade
//   bairro -> distância: Centro 2100 m, Gilberto Machado 4200 m,
//             Independência 6800 m, Aeroporto 9500 m, Itaoca 15000 m,
//             outros 3500 m
import http from "node:http";

const port = Number(process.env.STUB_PORT ?? 54400);
const expectedKey = process.env.STUB_API_KEY ?? "test-google-key";
let requests = 0;

const distances = {
  centro: 2100,
  "gilberto machado": 4200,
  independencia: 6800,
  aeroporto: 9500,
  itaoca: 15000,
};

function normalize(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__stats") return send(res, 200, { requests });
  if (req.method === "POST" && req.url === "/__reset") {
    requests = 0;
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST" || !req.url?.startsWith("/directions/v2:computeRoutes")) {
    return send(res, 404, { error: { message: "not found" } });
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    requests += 1;
    if (req.headers["x-goog-api-key"] !== expectedKey) {
      return send(res, 403, { error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED" } });
    }
    if (!req.headers["x-goog-fieldmask"]) {
      return send(res, 400, { error: { code: 400, message: "FieldMask is required" } });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: { code: 400, message: "invalid json" } });
    }
    if (body.routingPreference !== "TRAFFIC_UNAWARE" || body.travelMode !== "DRIVE") {
      return send(res, 400, { error: { code: 400, message: "unexpected routing options" } });
    }

    const destination = String(body.destination?.address ?? "");
    const [streetPart = "", neighborhoodPart = ""] = destination.split(" - ");
    const street = normalize(streetPart);
    const neighborhood = normalize(neighborhoodPart.split(",")[0] ?? "");

    if (street.includes("falha")) return send(res, 503, { error: { code: 503, message: "backend unavailable" } });
    if (street.includes("inexistente")) {
      return send(res, 200, {
        geocodingResults: { destination: { geocoderStatus: { code: 5, message: "NOT_FOUND" } } },
      });
    }
    if (street.includes("imprecisa")) {
      return send(res, 200, {
        routes: [{ distanceMeters: 3000, duration: "420s" }],
        geocodingResults: { destination: { geocoderStatus: {}, type: ["locality", "political"] } },
      });
    }

    const distanceMeters = distances[neighborhood] ?? 3500;
    const payload = {
      routes: [{ distanceMeters, duration: `${Math.round(distanceMeters / 8.3)}s` }],
      geocodingResults: { destination: { geocoderStatus: {}, type: ["street_address"] } },
    };
    if (street.includes("lenta")) {
      setTimeout(() => send(res, 200, payload), 15_000);
      return;
    }
    send(res, 200, payload);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`google-routes-stub ouvindo em :${port}`);
});
