/* AURELIOX - application. Tout est stocké en local (localStorage),
   aucune connexion réseau requise pour fonctionner (hors chargement
   initial de Chart.js pour les graphiques). Mode coach : plusieurs
   joueurs peuvent être gérés dans la même app, chacun avec ses propres
   données. */

var state = loadState();
var currentTab = getActivePlayer(state).profile.name ? "priorites" : "profil";
var pendingDrill = null; // { skillId, label, text } suggestion en cours dans l'onglet Match
var progressionSkillId = SKILLS[0].id;

function player() { return getActivePlayer(state); }
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

/* ---------------- JOUEURS (mode coach) ---------------- */
function renderPlayerBar() {
  var options = state.players.map(function (p) {
    var label = p.profile.name || "Joueur sans nom";
    return '<option value="' + p.id + '"' + (p.id === state.activePlayerId ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }).join("");

  return '<div class="player-bar">' +
    '<span class="player-bar-label">Joueur</span>' +
    '<select id="player-select" onchange="switchPlayer(this.value)">' + options + "</select>" +
    '<button class="btn small" onclick="addNewPlayer()">+ Nouveau joueur</button>' +
    '<button class="btn small" onclick="renameActivePlayer()">Renommer</button>' +
    (state.players.length > 1 ? '<button class="btn small danger" onclick="removeActivePlayer()">Supprimer</button>' : "") +
    "</div>";
}

function switchPlayer(id) {
  state.activePlayerId = id;
  state.__forceDiagnosticForm = false;
  state.__prioritySelection = null;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = null;
  persist();
  currentTab = player().profile.name ? "priorites" : "profil";
  render();
}

function addNewPlayer() {
  var name = prompt("Nom du nouveau joueur :");
  if (name === null) return;
  addPlayer(state, name.trim());
  state.__forceDiagnosticForm = false;
  state.__prioritySelection = null;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = null;
  persist();
  setTab("profil");
}

function renameActivePlayer() {
  var name = prompt("Nouveau nom :", player().profile.name);
  if (name === null) return;
  player().profile.name = name.trim();
  persist();
  render();
}

function removeActivePlayer() {
  if (!confirm("Supprimer ce joueur et toutes ses données (diagnostics, plan, matchs) ? Action irréversible.")) return;
  removePlayer(state, state.activePlayerId);
  persist();
  setTab("priorites");
}

/* ---------------- NAV ---------------- */
function renderNav() {
  var tabs = [
    { id: "profil", label: "Profil" },
    { id: "diagnostic", label: "Diagnostic" },
    { id: "priorites", label: "Priorités" },
    { id: "plan", label: "Plan 30 jours" },
    { id: "match", label: "Match → Drill" },
    { id: "progression", label: "Progression" },
    { id: "club", label: "Club" }
  ];
  return tabs.map(function (t) {
    return '<button class="tab-btn' + (currentTab === t.id ? " active" : "") + '" onclick="setTab(\'' + t.id + '\')">' + t.label + "</button>";
  }).join("");
}

/* ---------------- PROFIL ---------------- */
function viewProfil() {
  var p = player().profile;
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
    '<p class="muted">Tout reste dans ce navigateur (localStorage), pour tous les joueurs enregistrés. Exporte régulièrement une sauvegarde si tu changes d\'appareil.</p>' +
    '<div class="actions">' +
    '<button class="btn" onclick="exportData()">Exporter tout (JSON)</button>' +
    '<label class="btn file-btn">Importer<input id="import-file" type="file" accept="application/json" onchange="importData(event)" hidden></label>' +
    '<button class="btn danger" onclick="resetData()">Réinitialiser tout</button>' +
    "</div>" +
    "</section>"
  );
}

function saveProfil() {
  var p = player().profile;
  p.name = document.getElementById("f-name").value.trim();
  p.sport = document.getElementById("f-sport").value.trim();
  p.poste = document.getElementById("f-poste").value;
  p.startDate = document.getElementById("f-start").value || p.startDate;
  persist();
  setTab("diagnostic");
}

function exportData() {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "aureliox_export_" + todayISO() + ".json";
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
      if (parsed && parsed.players && parsed.players.length) {
        state = parsed;
      } else if (parsed && parsed.profile) {
        state = migrateLegacyState(parsed);
      } else {
        throw new Error("format inconnu");
      }
      persist();
      setTab("profil");
    } catch (e) {
      alert("Fichier invalide, import impossible.");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm("Effacer toutes les données AURELIOX de ce navigateur (tous les joueurs) ? Cette action est irréversible.")) return;
  state = defaultState();
  persist();
  setTab("profil");
}

/* ---------------- DIAGNOSTIC ---------------- */
function latestDiagnostic() {
  var d = player().diagnostics;
  return d.length ? d[d.length - 1] : null;
}

function viewDiagnostic() {
  var showForm = state.__forceDiagnosticForm || player().diagnostics.length === 0;
  var latest = latestDiagnostic();
  var html = "";

  if (player().diagnostics.length > 0) {
    html += '<section class="card">' +
      "<h2>Historique des diagnostics</h2>" +
      '<table class="table"><thead><tr><th>Date</th>' +
      CATEGORIES.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      player().diagnostics.map(function (diag) {
        var avg = computeCategoryAverages(diag);
        return "<tr><td>" + fmtDate(diag.date) + "</td>" +
          CATEGORIES.map(function (c) { return "<td>" + avg[c.id] + "/10</td>"; }).join("") +
          "</tr>";
      }).join("") +
      "</tbody></table>" +
      (showForm ? "" : '<div class="actions"><button class="btn primary" onclick="startNewDiagnostic()">+ Nouveau diagnostic (retest)</button>' +
        '<button class="btn" onclick="printDiagnostic()">Exporter le diagnostic en PDF</button>' +
        '<button class="btn" onclick="exportDiagnosticsCSV()">Exporter en CSV</button></div>') +
      "</section>";
  }

  if (showForm) {
    if (!state.__diagnosticDraft) state.__diagnosticDraft = initDiagnosticDraft();
    html += viewDiagnosticStep();
  } else if (latest) {
    html += '<section class="card">' +
      "<h2>Vue d'ensemble — dernier diagnostic (" + fmtDate(latest.date) + ")</h2>" +
      '<div class="chart-box"><canvas id="chart-diag-radar"></canvas></div>' +
      "</section>";
  }

  return html;
}

/* Diagnostic en 5 étapes (une catégorie à la fois, 4 compétences par écran)
   plutôt qu'un formulaire de 20 lignes d'un coup. Les valeurs saisies sont
   conservées dans state.__diagnosticDraft en avançant/reculant entre les
   étapes, et ne sont écrites dans un vrai diagnostic qu'à la validation
   finale. */
function initDiagnosticDraft() {
  var latest = latestDiagnostic();
  var draft = {};
  SKILLS.forEach(function (s) {
    var prev = latest ? latest.entries[s.id] : null;
    draft[s.id] = { score: prev ? prev.score : 5, potential: prev ? prev.potential : 3 };
  });
  return draft;
}

function viewDiagnosticStep() {
  var step = state.__diagnosticStep || 0;
  var cat = CATEGORIES[step];
  var skills = SKILLS.filter(function (s) { return s.category === cat.id; });
  var draft = state.__diagnosticDraft;
  var isFirst = step === 0;
  var isLast = step === CATEGORIES.length - 1;
  var pct = Math.round(((step + 1) / CATEGORIES.length) * 100);

  return '<section class="card">' +
    "<h2>" + (player().diagnostics.length ? "Nouveau diagnostic" : "Diagnostic initial") + "</h2>" +
    '<p class="muted">Étape ' + (step + 1) + "/" + CATEGORIES.length + " — " + cat.label + '</p>' +
    '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + "%;background:" + cat.color + '"></div></div>' +
    '<p class="muted">Note chaque compétence de 1 à 10 (niveau actuel) et estime le potentiel de progression de 1 à 5 (1 = marge faible, 5 = grande marge). Sois honnête : ce sont tes scores, pas ton ressenti général.</p>' +
    '<form id="diagnostic-form">' +
    '<div class="cat-block"><h3 style="color:' + cat.color + '">' + cat.label + "</h3>" +
    skills.map(function (s) {
      var v = draft[s.id];
      return '<div class="skill-row">' +
        '<div class="skill-name">' + s.label + "</div>" +
        '<div class="slider-group"><label>Niveau <span id="val-score-' + s.id + '">' + v.score + '</span>/10' +
        '<input type="range" min="1" max="10" value="' + v.score + '" data-skill="' + s.id + '" data-kind="score" oninput="onSliderInput(this)"></label>' +
        '<label>Potentiel <span id="val-potential-' + s.id + '">' + v.potential + '</span>/5' +
        '<input type="range" min="1" max="5" value="' + v.potential + '" data-skill="' + s.id + '" data-kind="potential" oninput="onSliderInput(this)"></label>' +
        "</div></div>";
    }).join("") +
    "</div></form>" +
    '<div class="actions">' +
    (isFirst ? "" : '<button class="btn" onclick="diagnosticStepBack()">← Précédent</button>') +
    (isLast
      ? '<button class="btn primary" onclick="submitDiagnostic()">Valider le diagnostic</button>'
      : '<button class="btn primary" onclick="diagnosticStepNext()">Suivant →</button>') +
    (player().diagnostics.length ? '<button class="btn" onclick="cancelNewDiagnostic()">Annuler</button>' : "") +
    "</div></section>";
}

function captureDiagnosticStepInputs() {
  var step = state.__diagnosticStep || 0;
  var cat = CATEGORIES[step];
  SKILLS.filter(function (s) { return s.category === cat.id; }).forEach(function (s) {
    var scoreEl = document.querySelector('input[data-skill="' + s.id + '"][data-kind="score"]');
    var potEl = document.querySelector('input[data-skill="' + s.id + '"][data-kind="potential"]');
    if (scoreEl && potEl) {
      state.__diagnosticDraft[s.id] = { score: parseInt(scoreEl.value, 10), potential: parseInt(potEl.value, 10) };
    }
  });
}

function diagnosticStepNext() {
  captureDiagnosticStepInputs();
  state.__diagnosticStep = Math.min(CATEGORIES.length - 1, (state.__diagnosticStep || 0) + 1);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function diagnosticStepBack() {
  captureDiagnosticStepInputs();
  state.__diagnosticStep = Math.max(0, (state.__diagnosticStep || 0) - 1);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onSliderInput(el) {
  var span = document.getElementById("val-" + el.dataset.kind + "-" + el.dataset.skill);
  if (span) span.textContent = el.value;
}

function startNewDiagnostic() {
  state.__forceDiagnosticForm = true;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = initDiagnosticDraft();
  render();
}
function cancelNewDiagnostic() {
  state.__forceDiagnosticForm = false;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = null;
  render();
}

function submitDiagnostic() {
  captureDiagnosticStepInputs();
  var entries = {};
  SKILLS.forEach(function (s) { entries[s.id] = state.__diagnosticDraft[s.id]; });
  var diag = { id: uid(), date: todayISO(), entries: entries };
  player().diagnostics.push(diag);
  if (!player().profile.startDate) player().profile.startDate = todayISO();
  state.__forceDiagnosticForm = false;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = null;
  persist();
  setTab("priorites");
}

function csvField(v) {
  var s = String(v == null ? "" : v);
  /* Neutralise l'injection de formule CSV (OWASP) : un champ commençant par
     =, +, -, @, tab ou CR peut être exécuté comme une formule par Excel/
     Sheets à l'ouverture du fichier. On le préfixe d'une apostrophe pour
     forcer une interprétation en texte brut. */
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportDiagnosticsCSV() {
  var p = player();
  if (!p.diagnostics.length) { alert("Aucun diagnostic à exporter."); return; }
  var rows = [["Joueur", "Date", "Compétence", "Catégorie", "Score /10", "Potentiel /5", "Priorité (poste actuel)"]];
  p.diagnostics.forEach(function (diag) {
    var priorityRows = computePriorityRows(diag, p.profile.poste);
    var bySkill = {};
    priorityRows.forEach(function (r) { bySkill[r.skillId] = r; });
    SKILLS.forEach(function (s) {
      var r = bySkill[s.id];
      rows.push([p.profile.name || "Joueur", diag.date, s.label, getCategory(s.category).label, r.score, r.potential, r.priorityScore]);
    });
  });
  var csv = rows.map(function (row) { return row.map(csvField).join(","); }).join("\r\n");
  var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "aureliox_diagnostics_" + (p.profile.name || "joueur") + "_" + todayISO() + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- PRIORITES ---------------- */
function viewPriorites() {
  var diag = latestDiagnostic();
  if (!diag) {
    return '<section class="card"><h2>Priorités</h2><p class="muted">Fais d\'abord ton diagnostic pour générer tes priorités.</p>' +
      '<div class="actions"><button class="btn primary" onclick="setTab(\'diagnostic\')">Aller au diagnostic</button></div></section>';
  }
  var rows = computePriorityRows(diag, player().profile.poste);
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
  var rows = computePriorityRows(diag, player().profile.poste);
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
  var rows = computePriorityRows(diag, player().profile.poste);
  var selection = state.__prioritySelection && state.__prioritySelection.length === 3
    ? state.__prioritySelection
    : rows.slice(0, 3).map(function (r) { return r.skillId; });

  if (selection.length !== 3) {
    alert("Sélectionne exactement 3 priorités avant de générer le plan.");
    return;
  }
  if (player().plan && !confirm("Un plan existe déjà. Le régénérer va remplacer les tâches actuelles (y compris celles ajoutées manuellement). Continuer ?")) {
    return;
  }
  var chosen = selection.map(function (id) {
    return rows.filter(function (x) { return x.skillId === id; })[0];
  });
  player().plan = generatePlan(chosen, todayISO());
  persist();
  setTab("plan");
}

/* ---------------- PLAN ---------------- */
function viewPlan() {
  var plan = player().plan;
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
    '<div class="actions"><button class="btn" onclick="setTab(\'priorites\')">Ajuster les priorités / régénérer</button>' +
    '<button class="btn" onclick="printPlan()">Exporter le plan en PDF</button></div>' +
    "</section>";

  plan.weeks.forEach(function (week) {
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
  var plan = player().plan;
  for (var w = 0; w < plan.weeks.length; w++) {
    var days = plan.weeks[w].days;
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
  var task = player().plan.weeks[loc.w].days[loc.d].tasks[loc.t];
  task.done = !task.done;
  persist();
  render();
}

function deleteTask(taskId) {
  var loc = findTaskLocation(taskId);
  if (!loc) return;
  player().plan.weeks[loc.w].days[loc.d].tasks.splice(loc.t, 1);
  persist();
  render();
}

function quickAddTask(dateISO) {
  var text = prompt("Décris la tâche à ajouter pour le " + fmtDate(dateISO) + " :");
  if (!text) return;
  addTaskToPlan(player().plan, "libre", "Tâche libre", text, dateISO);
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

  if (player().matches.length) {
    html += '<section class="card"><h2>Historique</h2><table class="table"><thead><tr><th>Date</th><th>Adversaire</th><th>Score</th><th>Problème</th><th>Exercice</th><th>Plan</th></tr></thead><tbody>' +
      player().matches.slice().reverse().map(function (m) {
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
  if (player().plan) {
    var targetDay = findNextOpenDay(player().plan, todayISO());
    addTaskToPlan(player().plan, pendingDrill.skillId, pendingDrill.label, pendingDrill.text, targetDay);
    addedToPlan = true;
  }

  player().matches.push({
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
  var milestones = retestMilestones(player().profile.startDate);
  var html = '<section class="card"><h2>Prochains retests</h2>';
  if (!player().profile.startDate) {
    html += '<p class="muted">Fais ton diagnostic initial pour démarrer le calendrier de retest.</p>';
  } else {
    html += '<div class="milestones">' + milestones.map(function (m) {
      var statusLabel = m.status === "due" ? "à faire" : (m.status === "soon" ? "bientôt" : "à venir");
      return '<div class="milestone ' + m.status + '"><b>' + m.label + "</b><span>" + fmtDate(m.date) + "</span><span class=\"tag\">" + statusLabel + "</span></div>";
    }).join("") + "</div>";
    html += '<div class="actions"><button class="btn primary" onclick="startNewDiagnosticFromProgression()">Faire le retest maintenant</button></div>';
  }
  html += "</section>";

  html += viewNotificationSettings();

  if (player().diagnostics.length >= 2) {
    var baseline = player().diagnostics[0];
    var latest = player().diagnostics[player().diagnostics.length - 1];

    html += '<section class="card"><h2>Comparaison — ' + fmtDate(baseline.date) + " → " + fmtDate(latest.date) + '</h2>' +
      '<div class="chart-box"><canvas id="chart-progress-radar"></canvas></div></section>';

    html += '<section class="card"><h2>Évolution par compétence (catégories)</h2><div class="chart-box tall"><canvas id="chart-progress-bar"></canvas></div></section>';
  } else {
    html += '<section class="card"><p class="muted">Fais au moins deux diagnostics (initial + retest) pour voir ta progression comparée.</p></section>';
  }

  if (player().diagnostics.length >= 1) {
    var skillOptions = CATEGORIES.map(function (cat) {
      var skills = SKILLS.filter(function (s) { return s.category === cat.id; });
      return '<optgroup label="' + cat.label + '">' +
        skills.map(function (s) { return '<option value="' + s.id + '"' + (s.id === progressionSkillId ? " selected" : "") + '>' + s.label + "</option>"; }).join("") +
        "</optgroup>";
    }).join("");

    html += '<section class="card"><h2>Historique détaillé par compétence</h2>' +
      '<p class="muted">Suis l\'évolution d\'une compétence précise, diagnostic après diagnostic.</p>' +
      '<div class="form-grid"><label>Compétence<select id="progression-skill" onchange="changeProgressionSkill(this.value)">' + skillOptions + '</select></label></div>' +
      '<div class="chart-box"><canvas id="chart-skill-line"></canvas></div>' +
      "</section>";
  }

  return html;
}

/* ---------------- RAPPELS NAVIGATEUR (J30/J60/J90) ----------------
   Notifications via l'API Notification du navigateur : ne fonctionnent
   que si l'app est ouverte dans un onglet (pas d'envoi en arrière-plan,
   pas de vraie notification "push" — cette app n'a pas de serveur). */
function notificationsSupported() {
  return typeof Notification !== "undefined";
}

function viewNotificationSettings() {
  if (!notificationsSupported()) return "";
  var perm = Notification.permission;
  var statusText = perm === "granted" ? "Activés sur cet appareil / navigateur."
    : perm === "denied" ? "Bloqués — réactive-les dans les réglages du navigateur pour ce site si tu changes d'avis."
    : "Pas encore activés.";
  return '<section class="card">' +
    "<h3>Rappels navigateur</h3>" +
    '<p class="muted">Une notification s\'affiche quand un retest (J30/J60/J90) approche ou est dû — uniquement si cette page est ouverte dans un onglet de ce navigateur (pas de notification si l\'app est fermée, il n\'y a pas de serveur derrière).</p>' +
    '<p class="muted">Statut : ' + statusText + "</p>" +
    (perm === "default" ? '<div class="actions"><button class="btn" onclick="requestNotificationPermission()">Activer les rappels</button></div>' : "") +
    "</section>";
}

function requestNotificationPermission() {
  if (!notificationsSupported()) return;
  Notification.requestPermission().then(function () {
    checkMilestoneNotifications();
    render();
  });
}

function checkMilestoneNotifications() {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  if (!state.notified) state.notified = {};
  var changed = false;
  state.players.forEach(function (p) {
    if (!p.profile.startDate) return;
    retestMilestones(p.profile.startDate).forEach(function (m) {
      if (m.status !== "due" && m.status !== "soon") return;
      var key = p.id + ":" + m.label;
      if (state.notified[key]) return;
      var name = p.profile.name || "Joueur";
      try {
        new Notification("AURELIOX — " + m.label + " pour " + name, {
          body: m.status === "due"
            ? "Le retest " + m.label + " est dû (prévu le " + fmtDate(m.date) + ")."
            : "Le retest " + m.label + " approche (" + fmtDate(m.date) + ").",
          tag: key
        });
      } catch (e) { /* Notification indisponible dans ce contexte, on ignore silencieusement */ }
      state.notified[key] = todayISO();
      changed = true;
    });
  });
  if (changed) persist();
}

function changeProgressionSkill(skillId) {
  progressionSkillId = skillId;
  render();
}

function startNewDiagnosticFromProgression() {
  state.__forceDiagnosticForm = true;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = initDiagnosticDraft();
  setTab("diagnostic");
}

/* ---------------- CLUB (vue agrégée multi-joueurs) ---------------- */
function viewClub() {
  var rows = state.players.map(function (p) {
    var diag = p.diagnostics.length ? p.diagnostics[p.diagnostics.length - 1] : null;
    var top3 = diag ? computeTopPriorities(diag, p.profile.poste, 3) : [];
    var pos = getPosition(p.profile.poste);
    return { player: p, diag: diag, top3: top3, posLabel: pos ? pos.label : "—" };
  });

  var html = '<section class="card">' +
    "<h2>Vue Club</h2>" +
    '<p class="muted">Vue d\'ensemble de tous les joueurs enregistrés dans cette app : dernier diagnostic et priorités actuelles.</p>' +
    '<table class="table"><thead><tr><th>Joueur</th><th>Poste</th><th>Dernier diagnostic</th><th>Priorité #1</th><th>Priorité #2</th><th>Priorité #3</th><th></th></tr></thead><tbody>' +
    rows.map(function (r) {
      var name = r.player.profile.name || "Joueur sans nom";
      var top3Cells = [0, 1, 2].map(function (i) {
        return "<td>" + (r.top3[i] ? escapeHtml(r.top3[i].label) : "—") + "</td>";
      }).join("");
      return "<tr><td>" + escapeHtml(name) + "</td><td>" + escapeHtml(r.posLabel) + "</td>" +
        "<td>" + (r.diag ? fmtDate(r.diag.date) : "aucun diagnostic") + "</td>" +
        top3Cells +
        "<td><button class=\"btn small\" onclick=\"viewPlayerFromClub('" + r.player.id + "')\">Voir</button></td></tr>";
    }).join("") +
    "</tbody></table>" +
    "</section>";

  return html;
}

function viewPlayerFromClub(id) {
  state.activePlayerId = id;
  state.__forceDiagnosticForm = false;
  state.__prioritySelection = null;
  state.__diagnosticStep = 0;
  state.__diagnosticDraft = null;
  persist();
  setTab("priorites");
}

/* ---------------- EXPORT PDF (impression navigateur) ---------------- */
function printableDiagnosticHtml() {
  var p = player();
  var diag = latestDiagnostic();
  if (!diag) return "<p>Aucun diagnostic disponible.</p>";
  var rows = computePriorityRows(diag, p.profile.poste);
  var avg = computeCategoryAverages(diag);

  var html = '<h1>AURELIOX — Diagnostic</h1>' +
    "<p><b>Joueur :</b> " + escapeHtml(p.profile.name || "—") + " · <b>Sport :</b> " + escapeHtml(p.profile.sport || "—") +
    " · <b>Poste :</b> " + (getPosition(p.profile.poste) || {}).label + " · <b>Date :</b> " + fmtDate(diag.date) + "</p>" +
    "<h2>Moyennes par catégorie</h2><table><thead><tr>" +
    CATEGORIES.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") + "</tr></thead><tbody><tr>" +
    CATEGORIES.map(function (c) { return "<td>" + avg[c.id] + "/10</td>"; }).join("") + "</tr></tbody></table>" +
    "<h2>Détail des 20 compétences</h2><table><thead><tr><th>Compétence</th><th>Catégorie</th><th>Score</th><th>Potentiel</th><th>Priorité</th></tr></thead><tbody>" +
    rows.map(function (r) {
      var cat = getCategory(r.category);
      return "<tr><td>" + escapeHtml(r.label) + "</td><td>" + cat.label + "</td><td>" + r.score + "/10</td><td>" + r.potential + "/5</td><td>" + r.priorityScore + "</td></tr>";
    }).join("") + "</tbody></table>";
  return html;
}

function printablePlanHtml() {
  var p = player();
  var plan = p.plan;
  if (!plan) return "<p>Aucun plan disponible.</p>";
  var html = '<h1>AURELIOX — Plan 30 jours</h1>' +
    "<p><b>Joueur :</b> " + escapeHtml(p.profile.name || "—") + " · <b>Priorités :</b> " + plan.priorities.map(function (x) { return escapeHtml(x.label); }).join(", ") +
    " · <b>Début :</b> " + fmtDate(plan.startDate) + "</p>";
  plan.weeks.forEach(function (week) {
    html += "<h2>" + escapeHtml(week.objective) + "</h2><table><thead><tr><th>Jour</th><th>Date</th><th>Tâches</th></tr></thead><tbody>";
    week.days.forEach(function (day) {
      var tasks = day.tasks.map(function (t) { return (t.done ? "☑ " : "☐ ") + escapeHtml(t.skillLabel) + " — " + escapeHtml(t.text); }).join("<br>");
      html += "<tr><td>" + day.label + "</td><td>" + fmtDate(day.date) + "</td><td>" + (tasks || "—") + "</td></tr>";
    });
    html += "</tbody></table>";
  });
  return html;
}

function runPrint(html) {
  var area = document.getElementById("print-area");
  area.innerHTML = html;
  window.print();
}

function printDiagnostic() { runPrint(printableDiagnosticHtml()); }
function printPlan() { runPrint(printablePlanHtml()); }

/* ---------------- RENDER ROOT ---------------- */
function render() {
  document.getElementById("player-bar").innerHTML = renderPlayerBar();
  document.getElementById("nav-tabs").innerHTML = renderNav();
  var content = document.getElementById("app-content");
  var viewFns = {
    profil: viewProfil, diagnostic: viewDiagnostic, priorites: viewPriorites,
    plan: viewPlan, match: viewMatch, progression: viewProgression, club: viewClub
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
  if (currentTab === "progression") {
    if (player().diagnostics.length >= 2) {
      var baseline = player().diagnostics[0];
      var latest2 = player().diagnostics[player().diagnostics.length - 1];
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
    if (player().diagnostics.length >= 1) {
      var history = getSkillHistory(player().diagnostics, progressionSkillId);
      renderSkillLine("chart-skill-line", "skillline",
        history.map(function (h) { return fmtDate(h.date); }),
        history.map(function (h) { return h.score; }),
        history.map(function (h) { return h.potential; }));
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("year").textContent = new Date().getFullYear();
  render();
  checkMilestoneNotifications();
});
