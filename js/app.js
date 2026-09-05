/* AURELIOX - application. Tout est stocké en local (localStorage),
   aucune connexion réseau requise pour fonctionner (hors chargement
   initial de Chart.js pour les graphiques). */

var state = loadState();
var currentTab = state.profile.name ? "priorites" : "profil";
var pendingDrill = null; // { skillId, label, text } suggestion en cours dans l'onglet Match

function persist() { saveState(state); }

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function setTab(tab) {
  currentTab = tab;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- NAV ---------------- */
function renderNav() {
  var tabs = [
    { id: "profil", label: "Profil" },
    { id: "diagnostic", label: "Diagnostic" },
    { id: "priorites", label: "Priorités" },
    { id: "plan", label: "Plan 30 jours" },
    { id: "match", label: "Match → Drill" },
    { id: "progression", label: "Progression" }
  ];
  return tabs.map(function (t) {
    return '<button class="tab-btn' + (currentTab === t.id ? " active" : "") + '" onclick="setTab(\'' + t.id + '\')">' + t.label + "</button>";
  }).join("");
}

/* ---------------- PROFIL ---------------- */
function viewProfil() {
  var p = state.profile;
  var options = POSITIONS.map(function (pos) {
    return '<option value="' + pos.id + '"' + (p.poste === pos.id ? " selected" : "") + ">" + pos.label + "</option>";
  }).join("");

  return (
    '<section class="card">' +
    "<h2>Profil du joueur</h2>" +
    '<p class="muted">Ces informations servent au moteur de priorités (le poste pondère l\'impact de chaque compétence) et au calcul des dates de retest.</p>' +
    '<div class="form-grid">' +
    '<label>Prénom / pseudo<input id="f-name" type="text" value="' + escapeHtml(p.name) + '" placeholder="Ex. Lucas"></label>' +
    '<label>Sport<input id="f-sport" type="text" value="' + escapeHtml(p.sport) + '" placeholder="Ex. Football"></label>' +
    '<label>Poste<select id="f-poste">' + options + "</select></label>" +
    '<label>Date de départ du programme<input id="f-start" type="date" value="' + (p.startDate || "") + '"></label>' +
    "</div>" +
    '<div class="actions"><button class="btn primary" onclick="saveProfil()">Enregistrer</button></div>' +
    "</section>" +
    '<section class="card">' +
    "<h2>Données</h2>" +
    '<p class="muted">Tout reste dans ce navigateur (localStorage). Exporte régulièrement une sauvegarde si tu changes d\'appareil.</p>' +
    '<div class="actions">' +
    '<button class="btn" onclick="exportData()">Exporter (JSON)</button>' +
    '<label class="btn file-btn">Importer<input id="import-file" type="file" accept="application/json" onchange="importData(event)" hidden></label>' +
    '<button class="btn danger" onclick="resetData()">Réinitialiser</button>' +
    "</div>" +
    "</section>"
  );
}

function saveProfil() {
  state.profile.name = document.getElementById("f-name").value.trim();
  state.profile.sport = document.getElementById("f-sport").value.trim();
  state.profile.poste = document.getElementById("f-poste").value;
  state.profile.startDate = document.getElementById("f-start").value || state.profile.startDate;
  persist();
  setTab("diagnostic");
}

function exportData() {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "aureliox_" + (state.profile.name || "joueur") + "_" + todayISO() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(evt) {
  var file = evt.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(reader.result);
      state = Object.assign(defaultState(), parsed);
      persist();
      setTab("profil");
    } catch (e) {
      alert("Fichier invalide, import impossible.");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm("Effacer toutes les données AURELIOX de ce navigateur ? Cette action est irréversible.")) return;
  state = defaultState();
  persist();
  setTab("profil");
}

/* ---------------- DIAGNOSTIC ---------------- */
function latestDiagnostic() {
  var d = state.diagnostics;
  return d.length ? d[d.length - 1] : null;
}

function viewDiagnostic() {
  var showForm = state.__forceDiagnosticForm || state.diagnostics.length === 0;
  var html = "";

  if (state.diagnostics.length > 0) {
    html += '<section class="card">' +
      "<h2>Historique des diagnostics</h2>" +
      '<table class="table"><thead><tr><th>Date</th>' +
      CATEGORIES.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      state.diagnostics.map(function (diag) {
        var avg = computeCategoryAverages(diag);
        return "<tr><td>" + fmtDate(diag.date) + "</td>" +
          CATEGORIES.map(function (c) { return "<td>" + avg[c.id] + "/10</td>"; }).join("") +
          "</tr>";
      }).join("") +
      "</tbody></table>" +
      (showForm ? "" : '<div class="actions"><button class="btn primary" onclick="startNewDiagnostic()">+ Nouveau diagnostic (retest)</button></div>') +
      "</section>";
  }

  if (showForm) {
    var latest = latestDiagnostic();
    html += '<section class="card">' +
      "<h2>" + (state.diagnostics.length ? "Nouveau diagnostic" : "Diagnostic initial") + "</h2>" +
      '<p class="muted">Note chaque compétence de 1 à 10 (niveau actuel) et estime le potentiel de progression de 1 à 5 (1 = marge faible, 5 = grande marge). Sois honnête : ce sont tes scores, pas ton ressenti général.</p>' +
      '<form id="diagnostic-form">' +
      CATEGORIES.map(function (cat) {
        var skills = SKILLS.filter(function (s) { return s.category === cat.id; });
        return '<div class="cat-block"><h3 style="color:' + cat.color + '">' + cat.label + "</h3>" +
          skills.map(function (s) {
            var prev = latest ? latest.entries[s.id] : null;
            var score = prev ? prev.score : 5;
            var potential = prev ? prev.potential : 3;
            return '<div class="skill-row">' +
              '<div class="skill-name">' + s.label + "</div>" +
              '<div class="slider-group"><label>Niveau <span id="val-score-' + s.id + '">' + score + '</span>/10' +
              '<input type="range" min="1" max="10" value="' + score + '" data-skill="' + s.id + '" data-kind="score" oninput="onSliderInput(this)"></label>' +
              '<label>Potentiel <span id="val-potential-' + s.id + '">' + potential + '</span>/5' +
              '<input type="range" min="1" max="5" value="' + potential + '" data-skill="' + s.id + '" data-kind="potential" oninput="onSliderInput(this)"></label>' +
              "</div></div>";
          }).join("") +
          "</div>";
      }).join("") +
      "</form>" +
      '<div class="actions"><button class="btn primary" onclick="submitDiagnostic()">Valider le diagnostic</button>' +
      (state.diagnostics.length ? '<button class="btn" onclick="cancelNewDiagnostic()">Annuler</button>' : "") +
      "</div></section>";
  } else if (latest) {
    html += '<section class="card">' +
      "<h2>Vue d'ensemble — dernier diagnostic (" + fmtDate(latest.date) + ")</h2>" +
      '<div class="chart-box"><canvas id="chart-diag-radar"></canvas></div>' +
      "</section>";
  }

  return html;
}

function onSliderInput(el) {
  var span = document.getElementById("val-" + el.dataset.kind + "-" + el.dataset.skill);
  if (span) span.textContent = el.value;
}

function startNewDiagnostic() {
  state.__forceDiagnosticForm = true;
  render();
}
function cancelNewDiagnostic() {
  state.__forceDiagnosticForm = false;
  render();
}

function submitDiagnostic() {
  var entries = {};
  SKILLS.forEach(function (s) {
    var scoreEl = document.querySelector('input[data-skill="' + s.id + '"][data-kind="score"]');
    var potEl = document.querySelector('input[data-skill="' + s.id + '"][data-kind="potential"]');
    entries[s.id] = { score: parseInt(scoreEl.value, 10), potential: parseInt(potEl.value, 10) };
  });
  var diag = { id: uid(), date: todayISO(), entries: entries };
  state.diagnostics.push(diag);
  if (!state.profile.startDate) state.profile.startDate = todayISO();
  state.__forceDiagnosticForm = false;
  persist();
  setTab("priorites");
}

/* ---------------- PRIORITES ---------------- */
function viewPriorites() {
  var diag = latestDiagnostic();
  if (!diag) {
    return '<section class="card"><h2>Priorités</h2><p class="muted">Fais d\'abord ton diagnostic pour générer tes priorités.</p>' +
      '<div class="actions"><button class="btn primary" onclick="setTab(\'diagnostic\')">Aller au diagnostic</button></div></section>';
  }
  var rows = computePriorityRows(diag, state.profile.poste);
  var top3 = rows.slice(0, 3);
  var selected = state.__prioritySelection && state.__prioritySelection.length === 3
    ? state.__prioritySelection
    : top3.map(function (r) { return r.skillId; });

  return (
    '<section class="card">' +
    "<h2>Tes 3 priorités</h2>" +
    '<p class="muted">Calcul : (10 − score) × impact du poste × potentiel. Classement automatique sur le dernier diagnostic du ' + fmtDate(diag.date) + ".</p>" +
    '<div class="priority-cards">' +
    top3.map(function (r, i) {
      var cat = getCategory(r.category);
      return '<div class="priority-card"><span class="rank">#' + (i + 1) + '</span>' +
        '<h3>' + r.label + "</h3>" +
        '<span class="tag" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.label + "</span>" +
        '<div class="priority-stats">Score actuel : <b>' + r.score + "/10</b> · Potentiel : <b>" + r.potential + "/5</b> · Impact poste : <b>×" + r.impact + "</b></div>" +
        '<div class="priority-score">Priorité : ' + r.priorityScore + "</div></div>";
    }).join("") +
    "</div>" +
    '<div class="actions"><button class="btn primary" onclick="generatePlanFromSelection()">Générer mon plan 30 jours</button></div>' +
    "</section>" +
    '<section class="card">' +
    "<h2>Classement complet (20 compétences)</h2>" +
    '<p class="muted">Tu peux personnaliser les 3 priorités utilisées pour le plan en cochant exactement 3 lignes.</p>' +
    '<table class="table"><thead><tr><th></th><th>Compétence</th><th>Catégorie</th><th>Score</th><th>Potentiel</th><th>Impact</th><th>Priorité</th></tr></thead><tbody>' +
    rows.map(function (r) {
      var cat = getCategory(r.category);
      var checked = selected.indexOf(r.skillId) !== -1;
      return "<tr><td><input type=\"checkbox\" " + (checked ? "checked" : "") + " onchange=\"togglePrioritySelection('" + r.skillId + "')\"></td>" +
        "<td>" + r.label + "</td>" +
        '<td><span class="tag" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.label + "</span></td>" +
        "<td>" + r.score + "/10</td><td>" + r.potential + "/5</td><td>×" + r.impact + "</td><td><b>" + r.priorityScore + "</b></td></tr>";
    }).join("") +
    "</tbody></table></section>"
  );
}

function togglePrioritySelection(skillId) {
  var diag = latestDiagnostic();
  var rows = computePriorityRows(diag, state.profile.poste);
  var current = state.__prioritySelection && state.__prioritySelection.length === 3
    ? state.__prioritySelection.slice()
    : rows.slice(0, 3).map(function (r) { return r.skillId; });

  var idx = current.indexOf(skillId);
  if (idx !== -1) {
    current.splice(idx, 1);
  } else {
    if (current.length >= 3) {
      alert("Choisis exactement 3 priorités : décoche-en une avant d'en ajouter une nouvelle.");
      return;
    }
    current.push(skillId);
  }
  state.__prioritySelection = current;
  render();
}

function generatePlanFromSelection() {
  var diag = latestDiagnostic();
  var rows = computePriorityRows(diag, state.profile.poste);
  var selection = state.__prioritySelection && state.__prioritySelection.length === 3
    ? state.__prioritySelection
    : rows.slice(0, 3).map(function (r) { return r.skillId; });

  if (selection.length !== 3) {
    alert("Sélectionne exactement 3 priorités avant de générer le plan.");
    return;
  }
  if (state.plan && !confirm("Un plan existe déjà. Le régénérer va remplacer les tâches actuelles (y compris celles ajoutées manuellement). Continuer ?")) {
    return;
  }
  var chosen = selection.map(function (id) {
    var r = rows.filter(function (x) { return x.skillId === id; })[0];
    return r;
  });
  state.plan = generatePlan(chosen, todayISO());
  persist();
  setTab("plan");
}

/* ---------------- PLAN ---------------- */
function viewPlan() {
  var plan = state.plan;
  if (!plan) {
    return '<section class="card"><h2>Plan 30 jours</h2><p class="muted">Génère d\'abord tes priorités pour construire ton plan.</p>' +
      '<div class="actions"><button class="btn primary" onclick="setTab(\'priorites\')">Aller aux priorités</button></div></section>';
  }

  var total = 0, done = 0;
  plan.weeks.forEach(function (w) { w.days.forEach(function (d) { d.tasks.forEach(function (t) { total++; if (t.done) done++; }); }); });
  var pct = total ? Math.round((done / total) * 100) : 0;

  var html = '<section class="card">' +
    "<h2>Plan 30 jours</h2>" +
    '<p class="muted">Basé sur : ' + plan.priorities.map(function (p) { return p.label; }).join(", ") + ". Démarré le " + fmtDate(plan.startDate) + ".</p>" +
    '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
    '<p class="muted">' + done + "/" + total + " tâches réalisées (" + pct + "%)</p>" +
    '<div class="actions"><button class="btn" onclick="setTab(\'priorites\')">Ajuster les priorités / régénérer</button></div>' +
    "</section>";

  plan.weeks.forEach(function (week, wi) {
    html += '<section class="card"><h3>' + escapeHtml(week.objective) + '</h3><div class="week-grid">';
    week.days.forEach(function (day) {
      html += '<div class="day-col"><div class="day-head">' + day.label + " · " + fmtDate(day.date) + "</div>";
      day.tasks.forEach(function (t) {
        html += '<div class="task' + (t.done ? " done" : "") + '">' +
          '<label><input type="checkbox" ' + (t.done ? "checked" : "") + ' onchange="toggleTask(\'' + t.id + '\')">' +
          '<span>' + escapeHtml(t.skillLabel) + " — " + escapeHtml(t.text) + "</span></label>" +
          '<button class="icon-btn" title="Supprimer" onclick="deleteTask(\'' + t.id + '\')">✕</button></div>';
      });
      html += '<button class="btn small" onclick="quickAddTask(\'' + day.date + '\')">+ tâche</button>';
      html += "</div>";
    });
    html += "</div></section>";
  });

  return html;
}

function findTaskLocation(taskId) {
  for (var w = 0; w < state.plan.weeks.length; w++) {
    var days = state.plan.weeks[w].days;
    for (var d = 0; d < days.length; d++) {
      for (var t = 0; t < days[d].tasks.length; t++) {
        if (days[d].tasks[t].id === taskId) return { w: w, d: d, t: t };
      }
    }
  }
  return null;
}

function toggleTask(taskId) {
  var loc = findTaskLocation(taskId);
  if (!loc) return;
  var task = state.plan.weeks[loc.w].days[loc.d].tasks[loc.t];
  task.done = !task.done;
  persist();
  render();
}

function deleteTask(taskId) {
  var loc = findTaskLocation(taskId);
  if (!loc) return;
  state.plan.weeks[loc.w].days[loc.d].tasks.splice(loc.t, 1);
  persist();
  render();
}

function quickAddTask(dateISO) {
  var text = prompt("Décris la tâche à ajouter pour le " + fmtDate(dateISO) + " :");
  if (!text) return;
  addTaskToPlan(state.plan, "libre", "Tâche libre", text, dateISO);
  persist();
  render();
}

/* ---------------- MATCH -> DRILL ---------------- */
function viewMatch() {
  var options = CATEGORIES.map(function (cat) {
    var skills = SKILLS.filter(function (s) { return s.category === cat.id; });
    return '<optgroup label="' + cat.label + '">' +
      skills.map(function (s) { return '<option value="' + s.id + '">' + s.label + "</option>"; }).join("") +
      "</optgroup>";
  }).join("");

  var suggestionHtml = "";
  if (pendingDrill) {
    suggestionHtml = '<div class="drill-suggestion"><h4>Exercice suggéré — ' + escapeHtml(pendingDrill.label) + "</h4>" +
      "<p>" + escapeHtml(pendingDrill.text) + "</p>" +
      '<div class="actions"><button class="btn primary" onclick="addPendingDrillToPlan()">Ajouter au plan</button>' +
      '<button class="btn" onclick="rerollDrill()">Un autre exercice</button></div></div>';
  }

  var html = '<section class="card">' +
    "<h2>Après un match : transforme un problème en action</h2>" +
    '<p class="muted">Choisis UN problème observable pendant le match (pas une impression générale) et obtiens un exercice ciblé.</p>' +
    '<div class="form-grid">' +
    '<label>Date<input id="m-date" type="date" value="' + todayISO() + '"></label>' +
    '<label>Adversaire<input id="m-opponent" type="text" placeholder="Ex. FC Rivière"></label>' +
    '<label>Score<input id="m-score" type="text" placeholder="Ex. 2-1"></label>' +
    '<label>Compétence en cause<select id="m-skill">' + options + "</select></label>" +
    "</div>" +
    '<label>Problème observé (fait précis, pas une opinion)<textarea id="m-problem" rows="2" placeholder="Ex. deux ballons perdus en pression sur la première touche"></textarea></label>' +
    '<div class="actions"><button class="btn primary" onclick="generateDrillFromMatch()">Obtenir un exercice</button></div>' +
    suggestionHtml +
    "</section>";

  if (state.matches.length) {
    html += '<section class="card"><h2>Historique</h2><table class="table"><thead><tr><th>Date</th><th>Adversaire</th><th>Score</th><th>Problème</th><th>Exercice</th><th>Plan</th></tr></thead><tbody>' +
      state.matches.slice().reverse().map(function (m) {
        var skill = getSkill(m.skillId);
        return "<tr><td>" + fmtDate(m.date) + "</td><td>" + escapeHtml(m.opponent) + "</td><td>" + escapeHtml(m.scoreText) + "</td>" +
          "<td>" + escapeHtml(m.problemText || (skill ? skill.label : "")) + "</td><td>" + escapeHtml(m.drillText) + "</td>" +
          "<td>" + (m.addedToPlan ? "✅ ajouté" : "—") + "</td></tr>";
      }).join("") + "</tbody></table></section>";
  }

  return html;
}

function generateDrillFromMatch() {
  var skillId = document.getElementById("m-skill").value;
  var skill = getSkill(skillId);
  var idx = Math.floor(Math.random() * (DRILLS[skillId] ? DRILLS[skillId].length : 1));
  pendingDrill = { skillId: skillId, label: skill.label, text: pickDrill(skillId, idx) };
  render();
}

function rerollDrill() {
  if (!pendingDrill) return;
  var list = DRILLS[pendingDrill.skillId] || [];
  if (list.length > 1) {
    var current = list.indexOf(pendingDrill.text);
    pendingDrill.text = list[(current + 1) % list.length];
  }
  render();
}

function addPendingDrillToPlan() {
  if (!pendingDrill) return;
  var date = document.getElementById("m-date").value || todayISO();
  var opponent = document.getElementById("m-opponent").value.trim();
  var scoreText = document.getElementById("m-score").value.trim();
  var problemText = document.getElementById("m-problem").value.trim();

  var addedToPlan = false;
  if (state.plan) {
    var targetDay = findNextOpenDay(state.plan, todayISO());
    addTaskToPlan(state.plan, pendingDrill.skillId, pendingDrill.label, pendingDrill.text, targetDay);
    addedToPlan = true;
  }

  state.matches.push({
    id: uid(), date: date, opponent: opponent, scoreText: scoreText,
    skillId: pendingDrill.skillId, problemText: problemText,
    drillText: pendingDrill.text, addedToPlan: addedToPlan
  });
  persist();
  pendingDrill = null;
  render();
  if (!addedToPlan) alert("Exercice enregistré dans l'historique. Génère d'abord un plan (onglet Priorités) pour pouvoir l'y ajouter automatiquement.");
}

/* ---------------- PROGRESSION / RETEST ---------------- */
function viewProgression() {
  var milestones = retestMilestones(state.profile.startDate);
  var html = '<section class="card"><h2>Prochains retests</h2>';
  if (!state.profile.startDate) {
    html += '<p class="muted">Fais ton diagnostic initial pour démarrer le calendrier de retest.</p>';
  } else {
    html += '<div class="milestones">' + milestones.map(function (m) {
      var statusLabel = m.status === "due" ? "à faire" : (m.status === "soon" ? "bientôt" : "à venir");
      return '<div class="milestone ' + m.status + '"><b>' + m.label + "</b><span>" + fmtDate(m.date) + "</span><span class=\"tag\">" + statusLabel + "</span></div>";
    }).join("") + "</div>";
    html += '<div class="actions"><button class="btn primary" onclick="startNewDiagnosticFromProgression()">Faire le retest maintenant</button></div>';
  }
  html += "</section>";

  if (state.diagnostics.length >= 2) {
    var baseline = state.diagnostics[0];
    var latest = state.diagnostics[state.diagnostics.length - 1];
    var baseAvg = computeCategoryAverages(baseline);
    var latestAvg = computeCategoryAverages(latest);

    html += '<section class="card"><h2>Comparaison — ' + fmtDate(baseline.date) + " → " + fmtDate(latest.date) + '</h2>' +
      '<div class="chart-box"><canvas id="chart-progress-radar"></canvas></div></section>';

    var deltas = SKILLS.map(function (s) {
      var b = baseline.entries[s.id] ? baseline.entries[s.id].score : null;
      var l = latest.entries[s.id] ? latest.entries[s.id].score : null;
      return { label: s.label, delta: (b != null && l != null) ? (l - b) : 0 };
    }).sort(function (a, b) { return b.delta - a.delta; });

    html += '<section class="card"><h2>Évolution par compétence</h2><div class="chart-box tall"><canvas id="chart-progress-bar"></canvas></div></section>';
  } else {
    html += '<section class="card"><p class="muted">Fais au moins deux diagnostics (initial + retest) pour voir ta progression comparée.</p></section>';
  }

  return html;
}

function startNewDiagnosticFromProgression() {
  state.__forceDiagnosticForm = true;
  setTab("diagnostic");
}

/* ---------------- RENDER ROOT ---------------- */
function render() {
  document.getElementById("nav-tabs").innerHTML = renderNav();
  var content = document.getElementById("app-content");
  var viewFns = {
    profil: viewProfil, diagnostic: viewDiagnostic, priorites: viewPriorites,
    plan: viewPlan, match: viewMatch, progression: viewProgression
  };
  content.innerHTML = (viewFns[currentTab] || viewProfil)();
  postRenderCharts();
}

function postRenderCharts() {
  if (currentTab === "diagnostic") {
    var latest = latestDiagnostic();
    if (latest && !state.__forceDiagnosticForm) {
      var avg = computeCategoryAverages(latest);
      renderCategoryRadar("chart-diag-radar", "diag", [{
        label: "Niveau actuel", data: CATEGORIES.map(function (c) { return avg[c.id]; }),
        backgroundColor: "rgba(61,214,255,0.25)", borderColor: "#3dd6ff", pointBackgroundColor: "#3dd6ff"
      }], CATEGORIES.map(function (c) { return c.label; }));
    }
  }
  if (currentTab === "progression" && state.diagnostics.length >= 2) {
    var baseline = state.diagnostics[0];
    var latest2 = state.diagnostics[state.diagnostics.length - 1];
    var baseAvg = computeCategoryAverages(baseline);
    var latestAvg = computeCategoryAverages(latest2);
    renderCategoryRadar("chart-progress-radar", "progress", [
      { label: "Diagnostic initial (" + fmtDate(baseline.date) + ")", data: CATEGORIES.map(function (c) { return baseAvg[c.id]; }),
        backgroundColor: "rgba(143,163,184,0.15)", borderColor: "#8fa3b8", pointBackgroundColor: "#8fa3b8" },
      { label: "Dernier diagnostic (" + fmtDate(latest2.date) + ")", data: CATEGORIES.map(function (c) { return latestAvg[c.id]; }),
        backgroundColor: "rgba(61,255,143,0.25)", borderColor: "#3dff8f", pointBackgroundColor: "#3dff8f" }
    ], CATEGORIES.map(function (c) { return c.label; }));

    var deltas = SKILLS.map(function (s) {
      var b = baseline.entries[s.id] ? baseline.entries[s.id].score : 0;
      var l = latest2.entries[s.id] ? latest2.entries[s.id].score : 0;
      return { label: s.label, delta: l - b };
    }).sort(function (a, b) { return b.delta - a.delta; });
    renderSkillBar("chart-progress-bar", "progressbar",
      deltas.map(function (d) { return d.label; }),
      deltas.map(function (d) { return d.delta; }),
      "#3dff8f");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("year").textContent = new Date().getFullYear();
  render();
});
