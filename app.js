// =========================
// Variables globales
// =========================
let nodes = [];
let adjacencyList = {};
let adjacencyListUndirected = {};
let currentRegion = "ALL";
let lastPath = [];               
let graphNodePositions = {};     
let hoverNodeId = null;          

let servicesList = [];
let lastServiceFilter = null;

// Informe MST
let lastMstReportText = "";

// =========================
// Referencias a elementos
// =========================
const copiarInformeMstBtn = document.getElementById("copiarInformeMstBtn");
const origenSelect = document.getElementById("origenSelect");
const destinoSelect = document.getElementById("destinoSelect");
const modoSelect = document.getElementById("modoSelect");
const calcularBtn = document.getElementById("calcularBtn");
const regionSelect = document.getElementById("regionSelect");

// Modo de destino y servicio requerido
const searchModeSelect = document.getElementById("searchModeSelect");
const serviceSelect = document.getElementById("serviceSelect");

const seccionResultados = document.getElementById("resultados");
const seccionMensajes = document.getElementById("mensajes");
const mensajeTexto = document.getElementById("mensajeTexto");

const resultadoOrigen = document.getElementById("resultadoOrigen");
const resultadoDestino = document.getElementById("resultadoDestino");
const resultadoDistancia = document.getElementById("resultadoDistancia");
const resultadoResumen = document.getElementById("resultadoResumen");
const tituloLista = document.getElementById("tituloLista");
const listaRuta = document.getElementById("listaRuta");

const graphCanvas = document.getElementById("graphCanvas");
const graphCtx = graphCanvas.getContext("2d");

// Tooltip flotante para el grafo
const tooltip = document.createElement("div");
tooltip.id = "graphTooltip";
Object.assign(tooltip.style, {
  position: "fixed",
  background: "rgba(15,23,42,0.95)",
  color: "white",
  padding: "6px 8px",
  borderRadius: "6px",
  fontSize: "12px",
  pointerEvents: "none",
  zIndex: 9999,
  display: "none",
  boxShadow: "0 2px 8px rgba(15,23,42,0.5)",
  maxWidth: "260px"
});
document.body.appendChild(tooltip);

// =========================
// Carga del CSV
// =========================
Papa.parse("peru_red_referencias_10reg.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: (result) => {
    procesarCSV(result.data);
    llenarRegionSelect();
    llenarServicioSelect();
    llenarSelects();
    configurarSearchModeSelect();
    ajustarCanvas();
    dibujarGrafo();
    actualizarCamposSegunModo();
  }
});

window.addEventListener("resize", () => {
  ajustarCanvas();
  dibujarGrafo();
});

// =========================
// Procesar CSV
// =========================
function procesarCSV(filas) {
  nodes = [];
  adjacencyList = {};
  adjacencyListUndirected = {};
  const servicesSet = new Set();

  filas.forEach(fila => {
    const id = String(fila.id || "").trim();
    if (!id) return; // si no hay id, se ignora la fila

    const name   = fila.name   || "";
    const level  = fila.level  || "";
    const region = fila.region || "";
    const lat    = Number(fila.lat);
    const lon    = Number(fila.lon);

    // ---- Parse de servicios ----
    let servicesArr = [];
    const servicesRaw = fila.services;
    if (servicesRaw) {
      if (Array.isArray(servicesRaw)) {
        servicesArr = servicesRaw;
      } else if (typeof servicesRaw === "string") {
        try {
          const parsed = JSON.parse(servicesRaw);
          servicesArr = Array.isArray(parsed) ? parsed : [];
        } catch {
          servicesArr = servicesRaw
            .split(/[;,]/)
            .map(s => s.trim())
            .filter(Boolean);
        }
      }
    }

    servicesArr.forEach(s => servicesSet.add(s));

    // Guardar nodo
    nodes.push({ id, name, level, region, lat, lon, services: servicesArr });

    // Inicializar listas de adyacencia
    if (!adjacencyList[id])          adjacencyList[id] = [];
    if (!adjacencyListUndirected[id]) adjacencyListUndirected[id] = [];

    // ---- Parse de relaciones (aristas) ----
    const relations = fila.relations;
    if (relations && typeof relations === "string") {
      try {
        const relArray = JSON.parse(relations);
        relArray.forEach(r => {
          const to     = String(r.target_id || "").trim();
          const weight = Number(r.weight_km);
          if (!to || !isFinite(weight)) return;

          // Grafo dirigido
          adjacencyList[id].push({ to, weight });

          // Grafo no dirigido (para MST y componentes)
          if (!adjacencyListUndirected[to]) {
            adjacencyListUndirected[to] = [];
          }
          adjacencyListUndirected[id].push({ to, weight });
          adjacencyListUndirected[to].push({ to: id, weight });
        });
      } catch (e) {
        console.error("Error parseando relations:", e);
      }
    }
  });

  servicesList = Array.from(servicesSet).sort();
}


// =========================
// Select de servicios
// =========================
function llenarServicioSelect() {
  if (!serviceSelect) return;
  serviceSelect.innerHTML = `<option value="">-- Seleccionar servicio --</option>`;
  servicesList.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    serviceSelect.appendChild(opt);
  });
}

// =========================
// Select de región
// =========================
function llenarRegionSelect() {
  const regiones = new Set();
  nodes.forEach(n => {
    if (n.region) regiones.add(n.region);
  });

  regionSelect.innerHTML = `<option value="ALL">Todas las regiones</option>`;
  Array.from(regiones).sort().forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionSelect.appendChild(opt);
  });

  regionSelect.addEventListener("change", () => {
    currentRegion = regionSelect.value;
    llenarSelects();
    lastPath = [];
    dibujarGrafo();
  });
}

// =========================
// Configurar modo de destino
// =========================
function configurarSearchModeSelect() {
  if (!searchModeSelect || !serviceSelect) return;

  serviceSelect.disabled = true;

  searchModeSelect.addEventListener("change", () => {
    const mode = searchModeSelect.value;
    if (mode === "service") {
      serviceSelect.disabled = false;
      destinoSelect.disabled = true;
      destinoSelect.value = "";
    } else {
      serviceSelect.disabled = true;
      serviceSelect.value = "";
      destinoSelect.disabled = false;
    }
    lastPath = [];
    lastServiceFilter = null;
    dibujarGrafo();
  });
}

// =========================
// Habilitar / deshabilitar campos según modo
// =========================
function actualizarCamposSegunModo() {
  const modo = modoSelect.value;
  const esRuta = (modo === "ruta");

  if (!esRuta) {
    // Análisis global: MST / Componentes
    origenSelect.disabled = true;
    destinoSelect.disabled = true;
    searchModeSelect.disabled = true;
    serviceSelect.disabled = true;

    origenSelect.value = "";
    destinoSelect.value = "";
    serviceSelect.value = "";
    searchModeSelect.value = "hospital";

    lastPath = [];
    lastServiceFilter = null;
    dibujarGrafo();
  } else {
    // Modo ruta
    origenSelect.disabled = false;
    searchModeSelect.disabled = false;

    const mode = searchModeSelect.value;
    if (mode === "service") {
      serviceSelect.disabled = false;
      destinoSelect.disabled = true;
      destinoSelect.value = "";
    } else {
      serviceSelect.disabled = true;
      destinoSelect.disabled = false;
    }
  }

  if (copiarInformeMstBtn) {
    copiarInformeMstBtn.classList.add("hidden");
  }
  lastMstReportText = "";
}

// =========================
// Llenar selects origen/destino
// =========================
function llenarSelects() {
  origenSelect.innerHTML = `<option value="">-- Seleccionar origen (nivel I) --</option>`;
  destinoSelect.innerHTML = `<option value="">-- Seleccionar destino (opcional) --</option>`;

  const filtrado = nodes.filter(n =>
    currentRegion === "ALL" || n.region === currentRegion
  );

  filtrado
    .filter(n => /^I(\-|$)/.test(n.level.trim().toUpperCase()))
    .forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.name} [${n.level}]`;
      origenSelect.appendChild(opt);
    });

  filtrado
    .filter(n =>
      n.level.trim().toUpperCase().startsWith("II") ||
      n.level.trim().toUpperCase().startsWith("III")
    )
    .forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.name} [${n.level}]`;
      destinoSelect.appendChild(opt);
    });
}

// =========================
// Canvas / Grafo
// =========================
function ajustarCanvas() {
  const rect = graphCanvas.parentElement.getBoundingClientRect();
  graphCanvas.width = rect.width;
  graphCanvas.height = rect.height;
}

function colorPorNivel(level) {
  const lv = (level || "").toUpperCase();
  if (lv.startsWith("I-")) return "#16a34a";   // verde
  if (lv.startsWith("II")) return "#f97316";   // naranja
  if (lv.startsWith("III")) return "#ef4444";  // rojo
  return "#64748b";
}

function dibujarGrafo() {
  if (!graphCtx) return;

  graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

  const regionNodes = nodes.filter(n =>
    currentRegion === "ALL" || n.region === currentRegion
  );

  if (!regionNodes.length) {
    graphNodePositions = {};
    return;
  }

  const lats = regionNodes.map(n => n.lat);
  const lons = regionNodes.map(n => n.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const padding = 40;
  const w = graphCanvas.width;
  const h = graphCanvas.height;

  function project(n) {
    const x = padding + ((n.lon - minLon) / (maxLon - minLon || 1)) * (w - 2 * padding);
    const y = padding + ((maxLat - n.lat) / (maxLat - minLat || 1)) * (h - 2 * padding);
    return { x, y };
  }

  const nodeMap = {};
  regionNodes.forEach(n => {
    nodeMap[n.id] = project(n);
  });
  graphNodePositions = nodeMap;

  const idsRegion = new Set(regionNodes.map(n => n.id));

  //1) Aristas generales
  graphCtx.lineWidth = 0.7;
  graphCtx.strokeStyle = "rgba(30,64,175,0.35)";
  for (const n of regionNodes) {
    const fromPos = nodeMap[n.id];
    (adjacencyList[n.id] || []).forEach(edge => {
      if (!idsRegion.has(edge.to)) return;
      const toPos = nodeMap[edge.to];
      graphCtx.beginPath();
      graphCtx.moveTo(fromPos.x, fromPos.y);
      graphCtx.lineTo(toPos.x, toPos.y);
      graphCtx.stroke();
    });
  }

  //2) Resaltar ruta mínima (si existe)
  if (lastPath && lastPath.length > 1) {
    graphCtx.lineWidth = 3;
    graphCtx.strokeStyle = "#0f766e";

    for (let i = 0; i < lastPath.length - 1; i++) {
      const a = lastPath[i];
      const b = lastPath[i + 1];
      if (!nodeMap[a] || !nodeMap[b]) continue;
      if (!idsRegion.has(a) || !idsRegion.has(b)) continue;

      const fromPos = nodeMap[a];
      const toPos = nodeMap[b];

      graphCtx.beginPath();
      graphCtx.moveTo(fromPos.x, fromPos.y);
      graphCtx.lineTo(toPos.x, toPos.y);
      graphCtx.stroke();
    }
  }

  const origenId = origenSelect.value;
  const destinoId = destinoSelect.value;
  const pathSet = new Set(lastPath || []);

  //3) Calcular nodos “problemáticos” (en modo componentes)
  const componentesAisladas = new Set(); //nodos de componentes pequeñas o sin III
  if (modoSelect.value === "componentes") {
    const comps = componentesConexas();
    const nodesMap = Object.fromEntries(nodes.map(n => [n.id, n]));

    comps.forEach(comp => {
      const stats = analizarComponente(comp, nodesMap);
      if (stats.size <= 5 || stats.niveles.III === 0) {
        comp.forEach(id => componentesAisladas.add(id));
      }
    });
  }

  //4) Dibujar nodos
  regionNodes.forEach(n => {
    const pos = nodeMap[n.id];
    const baseColor = colorPorNivel(n.level);

    let radius = 4;
    let stroke = "white";
    let strokeWidth = 1.2;

    const isOrigin = n.id === origenId;
    const isDest = n.id === destinoId;
    const isInPath = pathSet.has(n.id);
    const isHover = n.id === hoverNodeId;
    const esAislado = componentesAisladas.has(n.id);

    if (isInPath) {
      radius = 5.5;
      stroke = "#0f766e";
      strokeWidth = 1.8;
    }
    if (isOrigin) {
      radius = 7;
      stroke = "#14532d";
      strokeWidth = 2.2;
    }
    if (isDest) {
      radius = 7;
      stroke = "#881337";
      strokeWidth = 2.2;
    }
    if (esAislado) {
      radius += 1;
      stroke = "#b91c1c"; 
      strokeWidth = 2.4;
    }
    if (isHover) {
      radius += 2;
      stroke = "#0369a1";
      strokeWidth = 2.4;
    }

    graphCtx.beginPath();
    graphCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    graphCtx.fillStyle = baseColor;
    graphCtx.fill();
    graphCtx.lineWidth = strokeWidth;
    graphCtx.strokeStyle = stroke;
    graphCtx.stroke();
  });
}


// =========================
// Tooltip sobre el canvas
// =========================
graphCanvas.addEventListener("mousemove", (e) => {
  if (!graphNodePositions || Object.keys(graphNodePositions).length === 0) {
    hoverNodeId = null;
    tooltip.style.display = "none";
    return;
  }
  const rect = graphCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const hitRadius = 10;
  let encontrado = null;
  let minDist = Infinity;

  for (const [id, pos] of Object.entries(graphNodePositions)) {
    const dx = x - pos.x;
    const dy = y - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < hitRadius && d < minDist) {
      minDist = d;
      encontrado = id;
    }
  }

  if (encontrado) {
    hoverNodeId = encontrado;
    const nodo = nodes.find(n => n.id === encontrado);
    if (nodo) {
      tooltip.innerHTML =
        `<strong>${nodo.name}</strong><br>` +
        `Nivel: ${nodo.level}<br>` +
        `Región: ${nodo.region}`;
      tooltip.style.left = (e.clientX + 12) + "px";
      tooltip.style.top = (e.clientY + 12) + "px";
      tooltip.style.display = "block";
    }
  } else {
    hoverNodeId = null;
    tooltip.style.display = "none";
  }

  dibujarGrafo();
});

graphCanvas.addEventListener("mouseleave", () => {
  hoverNodeId = null;
  tooltip.style.display = "none";
  dibujarGrafo();
});

// =========================
// Algoritmos de grafos
// =========================
function dijkstra(startId) {
  const dist = {};
  const prev = {};
  const visited = new Set();

  nodes.forEach(n => {
    dist[n.id] = Infinity;
    prev[n.id] = null;
  });
  dist[startId] = 0;

  while (visited.size < nodes.length) {
    let currentId = null;
    let currentDist = Infinity;

    nodes.forEach(n => {
      if (!visited.has(n.id) && dist[n.id] < currentDist) {
        currentDist = dist[n.id];
        currentId = n.id;
      }
    });

    if (!currentId) break;

    visited.add(currentId);

    (adjacencyList[currentId] || []).forEach(edge => {
      const alt = dist[currentId] + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = currentId;
      }
    });
  }

  return { dist, prev };
}

function buscarHospitalMasCercano(dist) {
  const hospitales = nodes.filter(n =>
    n.level.toUpperCase().startsWith("II") ||
    n.level.toUpperCase().startsWith("III")
  );

  let mejor = null;
  let mejorDist = Infinity;

  hospitales.forEach(h => {
    if (dist[h.id] < mejorDist) {
      mejorDist = dist[h.id];
      mejor = h;
    }
  });

  if (!mejor || mejorDist === Infinity) return null;
  return mejor;
}

// Hospital más cercano que ofrece un servicio específico
function buscarHospitalPorServicio(dist, servicio) {
  if (!servicio) return null;

  const candidatos = nodes.filter(n => {
    const lv = (n.level || "").toUpperCase();
    const esHospital = lv.startsWith("II") || lv.startsWith("III");
    const tieneServicio = Array.isArray(n.services) && n.services.includes(servicio);
    const respetaRegion = (currentRegion === "ALL") || (n.region === currentRegion);
    return esHospital && tieneServicio && respetaRegion;
  });

  let mejor = null;
  let mejorDist = Infinity;

  candidatos.forEach(n => {
    const d = dist[n.id];
    if (d < mejorDist) {
      mejorDist = d;
      mejor = n;
    }
  });

  if (!mejor || mejorDist === Infinity) return null;
  return mejor;
}

function mstPrim() {
  const ids = nodes.map(n => n.id);
  if (!ids.length) return { edges: [], totalWeight: 0 };

  const inMST = new Set();
  const dist = {};
  const parent = {};

  ids.forEach(id => {
    dist[id] = Infinity;
    parent[id] = null;
  });

  const start = ids[0];
  dist[start] = 0;

  while (inMST.size < ids.length) {
    let u = null;
    let best = Infinity;
    ids.forEach(id => {
      if (!inMST.has(id) && dist[id] < best) {
        best = dist[id];
        u = id;
      }
    });
    if (u === null) break;

    inMST.add(u);

    (adjacencyListUndirected[u] || []).forEach(edge => {
      const v = edge.to;
      const w = edge.weight;
      if (!inMST.has(v) && w < dist[v]) {
        dist[v] = w;
        parent[v] = u;
      }
    });
  }

  const edges = [];
  let total = 0;
  ids.forEach(id => {
    if (parent[id] && isFinite(dist[id])) {
      edges.push({ from: parent[id], to: id, weight: dist[id] });
      total += dist[id];
    }
  });

  return { edges, totalWeight: total };
}

function componentesConexas() {
  const visited = new Set();
  const comps = [];

  // Filtrar nodos según región actual
  const regionNodes = nodes.filter(n =>
    currentRegion === "ALL" || n.region === currentRegion
  );
  const regionIds = new Set(regionNodes.map(n => n.id));

  regionNodes.forEach(n => {
    const id = n.id;
    if (!visited.has(id)) {
      const stack = [id];
      const comp = [];
      visited.add(id);

      // DFS iterativo
      while (stack.length > 0) {
        const u = stack.pop();
        comp.push(u);

        (adjacencyListUndirected[u] || []).forEach(edge => {
          const v = edge.to;
          if (!visited.has(v) && regionIds.has(v)) {
            visited.add(v);
            stack.push(v);
          }
        });
      }

      comps.push(comp);
    }
  });

  return comps;
}



// =========================
// Eventos de UI
// =========================
calcularBtn.addEventListener("click", () => {
  seccionResultados.classList.add("hidden");
  seccionMensajes.classList.add("hidden");
  seccionMensajes.classList.remove("error");

  listaRuta.innerHTML = "";
  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = "-";
  resultadoResumen.textContent = "-";

  const modo = modoSelect.value || "ruta";
  const origenId = origenSelect.value;
  const destinoId = destinoSelect.value;
  const searchMode = (searchModeSelect && searchModeSelect.value) || "hospital";

  if (modo !== "ruta") {
    lastPath = [];
    lastServiceFilter = null;
  }

  if (modo === "ruta") {
    if (!origenId) {
      mostrarError("Debe seleccionar un establecimiento de origen de nivel I.");
      return;
    }

    const { dist, prev } = dijkstra(origenId);
    let destinoFinal = null;

    if (searchMode === "service") {
      const servicio = serviceSelect.value;
      if (!servicio) {
        mostrarError("Debe seleccionar un servicio requerido.");
        return;
      }
      lastServiceFilter = servicio;
      destinoFinal = buscarHospitalPorServicio(dist, servicio);
    } else {
      lastServiceFilter = null;
      destinoFinal = destinoId ? nodes.find(n => n.id === destinoId)
                               : buscarHospitalMasCercano(dist);
    }

    if (!destinoFinal) {
      mostrarError("No se encontró un establecimiento que cumpla las condiciones de destino.");
      lastPath = [];
      dibujarGrafo();
      return;
    }

    const ruta = reconstruirRuta(prev, origenId, destinoFinal.id);
    if (!ruta) {
      mostrarError("El establecimiento seleccionado no tiene conexiones válidas hacia el destino.");
      lastPath = [];
      dibujarGrafo();
      return;
    }

    lastPath = ruta;
    if (searchMode === "service" || !destinoId) {
      destinoSelect.value = destinoFinal.id;
    }

    mostrarResultadosRuta(origenId, destinoFinal.id, dist[destinoFinal.id], ruta);
    dibujarGrafo();

  } else if (modo === "mst") {
    const mst = mstPrim();
    if (!mst.edges.length) {
      mostrarError("No se pudo construir una red mínima de referencia (MST).");
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(null, null, null);
      return;
    }
    mostrarResultadosMST(mst);
    dibujarGrafo();

  } else if (modo === "componentes") {
    const comps = componentesConexas();
    if (!comps.length) {
      mostrarError("No se encontraron componentes conexas en la red.");
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(null, null, null);
      return;
    }
    mostrarResultadosComponentes(comps);
    dibujarGrafo();
  }
});

origenSelect.addEventListener("change", () => {
  lastPath = [];
  lastServiceFilter = null;
  dibujarGrafo();
});

destinoSelect.addEventListener("change", () => {
  lastPath = [];
  lastServiceFilter = null;
  dibujarGrafo();
});

modoSelect.addEventListener("change", () => {
  actualizarCamposSegunModo();
});

// =========================
// Mostrar resultados / errores
// =========================
function mostrarResultadosRuta(origenId, destinoId, distancia, ruta) {
  const origenNodo = nodes.find(n => n.id === origenId);
  const destinoNodo = nodes.find(n => n.id === destinoId);

  resultadoOrigen.textContent = origenNodo ? origenNodo.name : origenId;
  resultadoDestino.textContent = destinoNodo ? destinoNodo.name : destinoId;
  resultadoDistancia.textContent = distancia.toFixed(2);

  let resumen = "";
  if (lastServiceFilter) {
    resumen =
      `Ruta mínima desde el establecimiento de nivel I hacia un establecimiento que ofrece ` +
      `el servicio de "${lastServiceFilter}", con ${ruta.length - 1} saltos intermedios.`;
  } else {
    resumen =
      `Ruta mínima desde el establecimiento de nivel I hacia el hospital de mayor complejidad, ` +
      `con ${ruta.length - 1} saltos intermedios.`;
  }
  resultadoResumen.textContent = resumen;

  tituloLista.textContent = "Ruta óptima:";
  listaRuta.innerHTML = "";
  ruta.forEach(id => {
    const nodo = nodes.find(n => n.id === id);
    const item = document.createElement("li");
    item.textContent = nodo ? `${nodo.name} [${nodo.level}]` : id;
    listaRuta.appendChild(item);
  });

  // En modo ruta no hay informe MST
  lastMstReportText = "";
  if (copiarInformeMstBtn) {
    copiarInformeMstBtn.classList.add("hidden");
  }

  seccionResultados.classList.remove("hidden");

  // Dibujo: resaltar ruta
  dibujarGrafoGeneral(ruta, null);
  dibujarGrafoRegion(origenNodo ? origenNodo.region : null, ruta, null);
}

function mostrarResultadosMST(mst) {
  const numNodos = nodes.length;
  const numAristas = mst.edges.length;
  const total = mst.totalWeight;
  const promedio = numAristas ? (total / numAristas) : 0;

  // Arista más corta y más larga
  let shortest = null;
  let longest = null;
  mst.edges.forEach(e => {
    if (!shortest || e.weight < shortest.weight) shortest = e;
    if (!longest || e.weight > longest.weight) longest = e;
  });

  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = total.toFixed(2);

  let extra = "";
  if (shortest && longest) {
    const fromShort = nodes.find(n => n.id === shortest.from);
    const toShort = nodes.find(n => n.id === shortest.to);
    const fromLong = nodes.find(n => n.id === longest.from);
    const toLong = nodes.find(n => n.id === longest.to);

    extra =
      ` La conexión más corta es ${fromShort ? fromShort.name : shortest.from} → ` +
      `${toShort ? toShort.name : shortest.to} (${shortest.weight.toFixed(2)} km) ` +
      `y la más larga es ${fromLong ? fromLong.name : longest.from} → ` +
      `${toLong ? toLong.name : longest.to} (${longest.weight.toFixed(2)} km).`;
  }

  resultadoResumen.textContent =
    `Red mínima de referencia que conecta ${numNodos} establecimientos ` +
    `con ${numAristas} conexiones efectivas y un costo total de ` +
    `${total.toFixed(2)} km (promedio ${promedio.toFixed(2)} km por conexión).` +
    extra;

  tituloLista.textContent = "Aristas de la red mínima (MST):";
  listaRuta.innerHTML = "";
  mst.edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    const li = document.createElement("li");
    li.textContent =
      `${from ? from.name : e.from} → ${to ? to.name : e.to} (${e.weight.toFixed(2)} km)`;
    listaRuta.appendChild(li);
  });

  // Generar informe MST de texto
  let report = "";
  report += "Informe de red mínima de referencia (MST)\n\n";
  report += `Nodos conectados: ${numNodos}\n`;
  report += `Conexiones efectivas: ${numAristas}\n`;
  report += `Distancia total: ${total.toFixed(2)} km\n`;
  report += `Distancia promedio por conexión: ${promedio.toFixed(2)} km\n\n`;

  if (shortest && longest) {
    const fromShort = nodes.find(n => n.id === shortest.from);
    const toShort = nodes.find(n => n.id === shortest.to);
    const fromLong = nodes.find(n => n.id === longest.from);
    const toLong = nodes.find(n => n.id === longest.to);

    report += "Conexiones extrema:\n";
    report += `- Más corta: ${(fromShort ? fromShort.name : shortest.from)} → ` +
              `${(toShort ? toShort.name : shortest.to)} ` +
              `(${shortest.weight.toFixed(2)} km)\n`;
    report += `- Más larga: ${(fromLong ? fromLong.name : longest.from)} → ` +
              `${(toLong ? toLong.name : longest.to)} ` +
              `(${longest.weight.toFixed(2)} km)\n\n`;
  }

  const limite = Math.min(numAristas, 50);
  report += `Primeras ${limite} conexiones del MST:\n`;
  for (let i = 0; i < limite; i++) {
    const e = mst.edges[i];
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    report += `${i + 1}) ${(from ? from.name : e.from)} → ` +
              `${(to ? to.name : e.to)} (${e.weight.toFixed(2)} km)\n`;
  }

  lastMstReportText = report;

  if (copiarInformeMstBtn) {
    copiarInformeMstBtn.classList.remove("hidden");
  }

  seccionResultados.classList.remove("hidden");
}
function analizarComponente(component, nodesMap) {
  const niveles = { I: 0, II: 0, III: 0 };
  const regiones = new Set();

  component.forEach(id => {
    const n = nodesMap[id];
    if (!n) return;

    regiones.add(n.region);

    // Normalizar nivel
    const lvl = (n.level || "").toUpperCase().trim();

    // MUY IMPORTANTE: comprobar primero III, luego II y al final I
    if (lvl.startsWith("III")) {
      niveles.III++;
    } else if (lvl.startsWith("II")) {
      niveles.II++;
    } else if (lvl.startsWith("I")) {
      niveles.I++;
    }
  });

  const size = component.length;
  let etiqueta = "";

  if (size <= 5) {
    if (niveles.I > 0 && niveles.II === 0 && niveles.III === 0)
      etiqueta = " ← microcomponente aislada (solo nivel I)";
    else
      etiqueta = " ← microcomponente pequeña";
  } else if (niveles.I > 0 && niveles.II > 0 && niveles.III === 0) {
    etiqueta = " ← red parcial (sin hospitales III)";
  } else if (niveles.III > 0) {
    etiqueta = " ← red con acceso a alta complejidad";
  }

  return {
    size,
    niveles,
    regiones: Array.from(regiones),
    etiqueta
  };
}



function mostrarResultadosComponentes(comps) {
  const nodesMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // Ordenar por tamaño descendente
  comps.sort((a,b) => b.length - a.length);

  const totalNodes = nodes.filter(n =>
    currentRegion === "ALL" || n.region === currentRegion
  ).length;

  const componentePrincipal = comps[0];
  const statsPrincipal = analizarComponente(componentePrincipal, nodesMap);

  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = "-";

  resultadoResumen.textContent =
    `La región "${currentRegion === "ALL" ? "Perú completo" : currentRegion}" ` +
    `tiene ${comps.length} componentes conexas. ` +
    `La componente principal contiene ${statsPrincipal.size} nodos ` +
    `(${((statsPrincipal.size / totalNodes) * 100).toFixed(1)}% del total).`;

  tituloLista.textContent = "Componentes detectadas:";
  listaRuta.innerHTML = "";

  comps.forEach((comp, idx) => {
    const st = analizarComponente(comp, nodesMap);

    let txt = `Componente ${idx + 1}: ${st.size} nodos — ` +
      `Niveles: I:${st.niveles.I}, II:${st.niveles.II}, III:${st.niveles.III}` +
      st.etiqueta;

    const li = document.createElement("li");
    li.textContent = txt;
    listaRuta.appendChild(li);
  });

  // Determinar si el origen pertenece a una microcomponente
  const ori = origenSelect.value;
  if (ori) {
    const compOri = comps.find(c => c.includes(ori));
    if (compOri) {
      const infoOri = analizarComponente(compOri, nodesMap);
      if (infoOri.size <= 5 || infoOri.niveles.III === 0) {
        const aviso = document.createElement("p");
        aviso.style.color = "#b91c1c";
        aviso.textContent =
          "⚠ El establecimiento de origen pertenece a una red aislada o sin conexión a hospitales III.";
        listaRuta.appendChild(aviso);
      }
    }
  }

  seccionResultados.classList.remove("hidden");
}


function mostrarError(msg) {
  mensajeTexto.textContent = msg;
  seccionMensajes.classList.remove("hidden");
  seccionMensajes.classList.remove("success");
  seccionMensajes.classList.add("error");
}

// =========================
// Copiar informe MST al portapapeles
// =========================
if (copiarInformeMstBtn) {
  copiarInformeMstBtn.addEventListener("click", async () => {
    if (!lastMstReportText) {
      mostrarError("No hay un informe MST generado para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(lastMstReportText);
      mensajeTexto.textContent =
        "Informe MST copiado al portapapeles. Puede pegarlo en Word, Google Docs o guardarlo como PDF.";
      seccionMensajes.classList.remove("hidden");
      seccionMensajes.classList.remove("error");
      seccionMensajes.classList.add("success");
    } catch (e) {
      console.error(e);
      mostrarError("No se pudo copiar el informe. Intente de nuevo o copie manualmente el texto de la pantalla.");
    }
  });
}

// Inicializar estado de campos por si el CSV tarda
actualizarCamposSegunModo();
