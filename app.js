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

Papa.parse("peru_red_referencias_sintetico_10reg.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: (result) => {
    procesarCSV(result.data);
    llenarSelects();
  }
});

function procesarCSV(filas) {
  nodes = [];
  adjacencyList = {};
  adjacencyListUndirected = {};

  filas.forEach(fila => {
    const id = String(fila.id || "").trim();
    const name = fila.name || "";
    const level = fila.level || "";

    if (!id) return;

    nodes.push({ id, name, level });

    if (!adjacencyList[id]) adjacencyList[id] = [];
    if (!adjacencyListUndirected[id]) adjacencyListUndirected[id] = [];

    const relations = fila.relations;
    if (relations && typeof relations === "string") {
      try {
        const relArray = JSON.parse(relations);
        relArray.forEach(r => {
          const to = String(r.target_id).trim();
          const weight = Number(r.weight_km);

          if (!to || !isFinite(weight)) return;

          adjacencyList[id].push({
            to,
            weight
          });

          if (!adjacencyListUndirected[to]) {
            adjacencyListUndirected[to] = [];
          }
          adjacencyListUndirected[id].push({ to, weight });
          adjacencyListUndirected[to].push({ to: id, weight });
        });
      } catch (e) {
        console.error("Error en relations:", e);
      }
    }
  });
}


function llenarSelects() {

  origenSelect.innerHTML = `<option value="">-- Seleccionar origen (nivel I) --</option>`;
  destinoSelect.innerHTML = `<option value="">-- Seleccionar destino (opcional) --</option>`;

  nodes
    .filter(n => /^I(\-|$)/.test(n.level.trim().toUpperCase()))
    .forEach(n => {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${n.name} [${n.level}]`;
      origenSelect.appendChild(opt);
    });


  nodes
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

function reconstruirRuta(prev, start, end) {
  const path = [];
  let curr = end;

  while (curr) {
    path.unshift(curr);
    if (curr === start) break;
    curr = prev[curr];
  }

  return path[0] === start ? path : null;
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


function mstPrim() {
  const ids = nodes.map(n => n.id);
  if (ids.length === 0) return { edges: [], totalWeight: 0 };

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
      edges.push({
        from: parent[id],
        to: id,
        weight: dist[id]
      });
      total += dist[id];
    }
  });

  return { edges, totalWeight: total };
}


function componentesConexas() {
  const visited = new Set();
  const comps = [];

  nodes.forEach(n => {
    const id = n.id;
    if (!visited.has(id)) {
      const stack = [id];
      const comp = [];
      visited.add(id);

      while (stack.length > 0) {
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
    }
  });

  return comps;
}

calcularBtn.addEventListener("click", () => {

  seccionResultados.classList.add("hidden");
  seccionMensajes.classList.add("hidden");
  seccionMensajes.classList.remove("error");
  seccionMensajes.classList.remove("success");

  const modo = modoSelect.value || "ruta";
  const origenId = origenSelect.value;
  const destinoId = destinoSelect.value;

  if (modo === "ruta") {
    if (!origenId) {
      mostrarError("Debe seleccionar un establecimiento de origen de nivel I.");
      return;
    }

    const { dist, prev } = dijkstra(origenId);

    let destinoFinal = destinoId ? nodes.find(n => n.id === destinoId)
                                 : buscarHospitalMasCercano(dist);

    if (!destinoFinal) {
      mostrarError("No se encontró una ruta de referencia hacia hospitales de mayor nivel.");
      return;
    }

    const ruta = reconstruirRuta(prev, origenId, destinoFinal.id);
    if (!ruta) {
      mostrarError("El establecimiento seleccionado no tiene conexiones válidas hacia el destino.");
      return;
    }

    mostrarResultadosRuta(origenId, destinoFinal.id, dist[destinoFinal.id], ruta);

  } else if (modo === "mst") {
    const mst = mstPrim();
    if (!mst.edges.length) {
      mostrarError("No se pudo construir una red mínima de referencia (MST).");
      return;
    }
    mostrarResultadosMST(mst);

  } else if (modo === "componentes") {
    const comps = componentesConexas();
    if (!comps.length) {
      mostrarError("No se encontraron componentes conexas en la red.");
      return;
    }
    mostrarResultadosComponentes(comps);
  }
});


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
}

function mostrarResultadosMST(mst) {

  resultadoOrigen.textContent = "-";
  resultadoDestino.textContent = "-";
  resultadoDistancia.textContent = mst.totalWeight.toFixed(2);
  resultadoResumen.textContent =
    `Red mínima de referencia (árbol de expansión mínima) con ${mst.edges.length} conexiones efectivas.`;

  tituloLista.textContent = "Aristas de la red mínima de referencia (MST):";
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
