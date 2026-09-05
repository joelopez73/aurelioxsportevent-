/* AURELIOX - rendu des graphiques (Chart.js, chargé depuis un CDN).
   Si Chart.js n'a pas pu charger (pas de connexion), l'app reste
   fonctionnelle : les graphiques sont simplement remplacés par un message. */

var chartInstances = {};

function chartsAvailable() {
  return typeof Chart !== "undefined";
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function renderCategoryRadar(canvasId, key, datasets, labels) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!chartsAvailable()) {
    canvas.replaceWith(offlineNotice(canvas));
    return;
  }
  destroyChart(key);
  chartInstances[key] = new Chart(canvas.getContext("2d"), {
    type: "radar",
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 10, ticks: { stepSize: 2, showLabelBackdrop: false, color: "#8fa3b8" },
          grid: { color: "rgba(143,163,184,0.15)" },
          angleLines: { color: "rgba(143,163,184,0.15)" },
          pointLabels: { color: "#dbe7f2", font: { size: 11 } }
        }
      },
      plugins: { legend: { labels: { color: "#dbe7f2" } } }
    }
  });
}

function renderSkillBar(canvasId, key, labels, values, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!chartsAvailable()) {
    canvas.replaceWith(offlineNotice(canvas));
    return;
  }
  destroyChart(key);
  chartInstances[key] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels: labels, datasets: [{ label: "Progression", data: values, backgroundColor: color || "#3dff8f" }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#8fa3b8" }, grid: { color: "rgba(143,163,184,0.1)" } },
        y: { ticks: { color: "#dbe7f2" }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function offlineNotice(canvas) {
  var div = document.createElement("div");
  div.className = "chart-offline";
  div.textContent = "Graphique indisponible hors connexion — les données restent visibles dans les tableaux ci-dessous.";
  return div;
}
