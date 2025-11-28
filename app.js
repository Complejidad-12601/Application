let nodes = [];
let adjacencyList = {};
let adjacencyListUndirected = {};

const origenSelect = document.getElementById("origenSelect");
const destinoSelect = document.getElementById("destinoSelect");
const modoSelect = document.getElementById("modoSelect");
const calcularBtn = document.getElementById("calcularBtn");

const seccionResultados = document.getElementById("resultados");
const seccionMensajes = document.getElementById("mensajes");
const mensajeTexto = document.getElementById("mensajeTexto");

const resultadoOrigen = document.getElementById("resultadoOrigen");
const resultadoDestino = document.getElementById("resultadoDestino");
const resultadoDistancia = document.getElementById("resultadoDistancia");
const resultadoResumen = document.getElementById("resultadoResumen");
const tituloLista = document.getElementById("tituloLista");
const listaRuta = document.getElementById("listaRuta");

const canvasGeneral = document.getElementById("canvasGeneral");
const canvasRegion = document.getElementById("canvasRegion");
const regionActualSpan = document.getElementById("regionActual");

Papa.parse("peru_red_referencias_sintetico_10reg.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: (result) => {
    procesarCSV(result.data);
    llenarSelects();
    dibujarGrafoGeneral(null, null);
    dibujarGrafoRegion(null, null, null);
  }
});

function procesarCSV(filas) {
  nodes = [];
  adjacencyList = {};
  adjacencyListUndirected = {};

  filas.forEach(fila => {
    const id = String(fila.id || "").trim();
    if (!id) return;

    const name = fila.name || "";
    const level = fila.level || "";
    const region = fila.region || "";
    const lat = Number(fila.lat);
    const lon = Number(fila.lon);

    nodes.push({ id, name, level, region, lat, lon });

    if (!adjacencyList[id]) adjacencyList[id] = [];
    if (!adjacencyListUndirected[id]) adjacencyListUndirected[id] = [];

    const relations = fila.relations;
    if (relations && typeof relations === "string") {
      try {
        const relArray = JSON.parse(relations);
        relArray.forEach(r => {
          const to = String(r.target_id || "").trim();
          const weight = Number(r.weight_km);
          if (!to || !isFinite(weight)) return;

          adjacencyList[id].push({ to, weight });

          if (!adjacencyListUndirected[to]) adjacencyListUndirected[to] = [];
          adjacencyListUndirected[id].push({ to, weight });
          adjacencyListUndirected[to].push({ to: id, weight });
        });
      } catch (e) {
        console.error("Error parseando relations", e);
      }
    }
  });
}

function llenarSelects() {
  origenSelect.innerHTML = `<option value="">-- Seleccionar origen (nivel I) --</option>`;
  destinoSelect.innerHTML = `<option value="">-- Seleccionar destino (opcional) --</option>`;

  nodes
    .filter(n => /^I(\-|$)/.test((n.level || "").trim().toUpperCase()))
    .forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.name} [${n.level}]`;
      origenSelect.appendChild(opt);
    });

  nodes
    .filter(n => {
      const lvl = (n.level || "").trim().toUpperCase();
      return lvl.startsWith("II") || lvl.startsWith("III");
    })
    .forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.name} [${n.level}]`;
      destinoSelect.appendChild(opt);
    });
}

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
  const hospitales = nodes.filter(n => {
    const lvl = (n.level || "").toUpperCase();
    return lvl.startsWith("II") || lvl.startsWith("III");
  });

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

function reconstruirRuta(prev, start, end) {
  const path = [];
  let curr = end;

  while (curr) {
    path.unshift(curr);
    if (curr === start) break;
    curr = prev[curr];
  }

  if (path[0] !== start) return null;
  return path;
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

// COMPONENTES CONEXAS (DFS)

function componentesConexas() {
  const visited = new Set();
  const comps = [];

  nodes.forEach(n => {
    const startId = n.id;
    if (visited.has(startId)) return;

    const stack = [startId];
    const comp = [];
    visited.add(startId);

    while (stack.length) {
      const u = stack.pop();
      comp.push(u);

      (adjacencyListUndirected[u] || []).forEach(edge => {
        const v = edge.to;
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      });
    }

    comps.push(comp);
  });

  return comps;
}

// BOTÓN CALCULAR

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

  if (modo === "ruta") {
    if (!origenId) {
      mostrarError("Debe seleccionar un establecimiento de origen de nivel I.");
      return;
    }

    const { dist, prev } = dijkstra(origenId);

    let destinoFinal;
    if (destinoId) {
      destinoFinal = nodes.find(n => n.id === destinoId);
    } else {
      destinoFinal = buscarHospitalMasCercano(dist);
    }

    if (!destinoFinal) {
      mostrarError("No se encontró una ruta de referencia hacia hospitales de mayor nivel.");
      const origenNodo = nodes.find(n => n.id === origenId);
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(origenNodo ? origenNodo.region : null, null, null);
      return;
    }

    const ruta = reconstruirRuta(prev, origenId, destinoFinal.id);
    if (!ruta) {
      mostrarError("El establecimiento seleccionado no tiene conexiones válidas hacia el destino.");
      const origenNodo = nodes.find(n => n.id === origenId);
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(origenNodo ? origenNodo.region : null, null, null);
      return;
    }

    mostrarResultadosRuta(origenId, destinoFinal.id, dist[destinoFinal.id], ruta);

  } else if (modo === "mst") {
    const mst = mstPrim();
    if (!mst.edges.length) {
      mostrarError("No se pudo construir una red mínima de referencia (MST).");
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(null, null, null);
      return;
    }
    mostrarResultadosMST(mst);

    const origenNodo = origenId ? nodes.find(n => n.id === origenId) : null;
    dibujarGrafoGeneral(null, null);
    dibujarGrafoRegion(origenNodo ? origenNodo.region : null, null, null);

  } else if (modo === "componentes") {
    const comps = componentesConexas();
    if (!comps.length) {
      mostrarError("No se encontraron componentes conexas en la red.");
      dibujarGrafoGeneral(null, null);
      dibujarGrafoRegion(null, null, null);
      return;
    }
    mostrarResultadosComponentes(comps);

    const origenNodo = origenId ? nodes.find(n => n.id === origenId) : null;
    dibujarGrafoGeneral(null, null);
    dibujarGrafoRegion(origenNodo ? origenNodo.region : null, null, null);
  }
});

// MOSTRAR RESULTADOS

function mostrarResultadosRuta(origenId, destinoId, distancia, ruta) {
  const origenNodo = nodes.find(n => n.id === origenId);
  const destinoNodo = nodes.find(n => n.id === destinoId);

  resultadoOrigen.textContent = origenNodo ? origenNodo.name : origenId;
  resultadoDestino.textContent = destinoNodo ? destinoNodo.name : destinoId;
  resultadoDistancia.textContent = distancia.toFixed(2);
  resultadoResumen.textContent =
    `Ruta mínima desde el establecimiento de nivel I hacia el hospital de mayor complejidad, con ${ruta.length - 1} saltos intermedios.`;

  tituloLista.textContent = "Ruta óptima:";
  listaRuta.innerHTML = "";
  ruta.forEach(id => {
    const nodo = nodes.find(n => n.id === id);
    const item = document.createElement("li");
    item.textContent = nodo ? `${nodo.name} [${nodo.level}]` : id;
    listaRuta.appendChild(item);
  });

  seccionResultados.classList.remove("hidden");

  // Dibujo: resaltar ruta
  dibujarGrafoGeneral(ruta, null);
  dibujarGrafoRegion(origenNodo ? origenNodo.region : null, ruta, null);
}

function mostrarResultadosMST(mst) {
  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = mst.totalWeight.toFixed(2);
  resultadoResumen.textContent =
    `Red mínima de referencia (árbol de expansión mínima) con ${mst.edges.length} conexiones efectivas.`;

  tituloLista.textContent = "Aristas de la red mínima (MST):";
  listaRuta.innerHTML = "";
  mst.edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    const li = document.createElement("li");
    li.textContent = `${from ? from.name : e.from} → ${to ? to.name : e.to} (${e.weight.toFixed(2)} km)`;
    listaRuta.appendChild(li);
  });

  seccionResultados.classList.remove("hidden");
}

function mostrarResultadosComponentes(comps) {
  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = "-";
  resultadoResumen.textContent =
    `Se identificaron ${comps.length} componentes conexas en la red de referencia médica.`;

  tituloLista.textContent = "Componentes conexas y posibles zonas aisladas:";
  listaRuta.innerHTML = "";

  comps.forEach((comp, idx) => {
    const size = comp.length;
    const nombresEjemplo = comp.slice(0, 3).map(id => {
      const n = nodes.find(nn => nn.id === id);
      return n ? n.name : id;
    });
    let texto = `Componente ${idx + 1}: ${size} nodos`;
    if (nombresEjemplo.length) {
      texto += ` (ej.: ${nombresEjemplo.join(", ")}...)`;
    }
    if (size <= 5) {
      texto += " ← zona potencialmente aislada";
    }
    const li = document.createElement("li");
    li.textContent = texto;
    listaRuta.appendChild(li);
  });

  seccionResultados.classList.remove("hidden");
}

function mostrarError(msg) {
  mensajeTexto.textContent = msg;
  seccionMensajes.classList.remove("hidden");
  seccionMensajes.classList.add("error");
}

// DIBUJO DE GRAFOS

function construirSetsResaltado(path) {
  const nodeSet = new Set();
  const edgeSet = new Set();

  if (Array.isArray(path)) {
    path.forEach(id => nodeSet.add(id));
    for (let i = 0; i < path.length - 1; i++) {
      edgeSet.add(`${path[i]}->${path[i + 1]}`);
    }
  }
  return { nodeSet, edgeSet };
}

function dibujarGrafoGeneral(path, dummy) {
  if (!canvasGeneral) return;
  const ctx = canvasGeneral.getContext("2d");
  dibujarGrafo(canvasGeneral, ctx, nodes, adjacencyList, path);
}

function dibujarGrafoRegion(regionName, path, dummy) {
  if (!canvasRegion) return;
  const ctx = canvasRegion.getContext("2d");

  let nodosRegion;
  if (!regionName) {
    nodosRegion = [];
    regionActualSpan.textContent = "-";
  } else {
    nodosRegion = nodes.filter(n => n.region === regionName);
    regionActualSpan.textContent = regionName;

    if (Array.isArray(path)) {
      path.forEach(id => {
        const n = nodes.find(nn => nn.id === id);
        if (n && !nodosRegion.some(m => m.id === n.id)) {
          nodosRegion.push(n);
        }
      });
    }
  }

  dibujarGrafo(canvasRegion, ctx, nodosRegion, adjacencyList, path);
}

function dibujarGrafo(canvas, ctx, nodesSub, adj, path) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!nodesSub || nodesSub.length === 0) return;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  nodesSub.forEach(n => {
    if (!isFinite(n.lat) || !isFinite(n.lon)) return;
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
  });

  if (!isFinite(minLat) || !isFinite(maxLat) || !isFinite(minLon) || !isFinite(maxLon)) {
    return;
  }

  const margin = 20;
  const width = canvas.width - 2 * margin;
  const height = canvas.height - 2 * margin;

  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;

  const pos = {};
  nodesSub.forEach(n => {
    const x = margin + ((n.lon - minLon) / lonRange) * width;
    const y = margin + (1 - (n.lat - minLat) / latRange) * height;
    pos[n.id] = { x, y };
  });

  const { nodeSet, edgeSet } = construirSetsResaltado(path);

  // Aristas
  nodesSub.forEach(n => {
    const u = n.id;
    (adj[u] || []).forEach(edge => {
      const v = edge.to;
      if (!pos[u] || !pos[v]) return;

      const key = `${u}->${v}`;
      const highlighted = edgeSet.has(key);

      ctx.beginPath();
      ctx.moveTo(pos[u].x, pos[u].y);
      ctx.lineTo(pos[v].x, pos[v].y);
      ctx.strokeStyle = highlighted ? "#ff5722" : "#b0c4de";
      ctx.lineWidth = highlighted ? 2.5 : 0.7;
      ctx.globalAlpha = highlighted ? 1.0 : 0.6;
      ctx.stroke();
    });
  });

  ctx.globalAlpha = 1.0;

  // Nodos
  nodesSub.forEach(n => {
    const p = pos[n.id];
    if (!p) return;

    const level = (n.level || "").toUpperCase();
    let radius = 3;
    let fill = "#1e88e5";
    if (level.startsWith("II")) fill = "#43a047";
    if (level.startsWith("III")) fill = "#f4511e";

    if (nodeSet.has(n.id)) {
      radius = 5;
      ctx.strokeStyle = "#f57f17";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      fill = "#ffeb3b";
    }

    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}
