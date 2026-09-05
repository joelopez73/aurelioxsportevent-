/* AURELIOX - persistance locale (localStorage) + logique métier.
   Mode coach : l'état contient une liste de joueurs, chacun avec son
   propre profil / diagnostics / plan / matchs. Un usage solo n'est
   qu'un état à un seul joueur. */

var STORAGE_KEY = "aureliox_state_v2";
var STORAGE_KEY_LEGACY = "aureliox_state_v1";

function defaultPlayer(name) {
  return {
    id: uid(),
    profile: { name: name || "", sport: "Football", poste: "milieu-offensif", startDate: null },
    diagnostics: [],  // { id, date, entries: { skillId: { score, potential } } }
    plan: null,       // { generatedAt, startDate, priorities:[...], weeks: [ {objective, days:[{date,label,tasks:[]}x7]} x4 ] }
    matches: []       // { id, date, opponent, scoreText, skillId, problemText, drillText, addedToPlan }
  };
}

function defaultState() {
  var p = defaultPlayer("");
  return { players: [p], activePlayerId: p.id };
}

function migrateLegacyState(legacy) {
  var player = defaultPlayer(legacy.profile ? legacy.profile.name : "");
  if (legacy.profile) player.profile = Object.assign(player.profile, legacy.profile);
  player.diagnostics = legacy.diagnostics || [];
  player.plan = legacy.plan || null;
  player.matches = legacy.matches || [];
  return { players: [player], activePlayerId: player.id };
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.players && parsed.players.length) return parsed;
    }
    var legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacyRaw) {
      var migrated = migrateLegacyState(JSON.parse(legacyRaw));
      saveState(migrated);
      return migrated;
    }
    return defaultState();
  } catch (e) {
    console.warn("AURELIOX: lecture localStorage impossible, état par défaut utilisé.", e);
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("AURELIOX: écriture localStorage impossible.", e);
    return false;
  }
}

/* ---------- Gestion multi-joueurs ---------- */
function getActivePlayer(state) {
  var found = null;
  state.players.forEach(function (pl) { if (pl.id === state.activePlayerId) found = pl; });
  return found || state.players[0];
}

function addPlayer(state, name) {
  var p = defaultPlayer(name || "");
  state.players.push(p);
  state.activePlayerId = p.id;
  return p;
}

function removePlayer(state, id) {
  if (state.players.length <= 1) return false;
  state.players = state.players.filter(function (p) { return p.id !== id; });
  if (state.activePlayerId === id) state.activePlayerId = state.players[0].id;
  return true;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, n) {
  var d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  var a = new Date(isoA + "T00:00:00");
  var b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

/* ---------- Moteur de priorités ---------- */
/* score priorité = (10 - score actuel) x impact du poste x potentiel (1-5) */
function computePriorityRows(diagnostic, posteId) {
  if (!diagnostic) return [];
  var rows = [];
  for (var i = 0; i < SKILLS.length; i++) {
    var s = SKILLS[i];
    var entry = diagnostic.entries[s.id] || { score: 5, potential: 3 };
    var impact = (s.impact && s.impact[posteId] != null) ? s.impact[posteId] : 1;
    var gap = 10 - entry.score;
    var priorityScore = gap * impact * entry.potential;
    rows.push({
      skillId: s.id,
      label: s.label,
      category: s.category,
      score: entry.score,
      potential: entry.potential,
      impact: impact,
      gap: gap,
      priorityScore: Math.round(priorityScore * 10) / 10
    });
  }
  rows.sort(function (a, b) { return b.priorityScore - a.priorityScore; });
  return rows;
}

function computeTopPriorities(diagnostic, posteId, n) {
  return computePriorityRows(diagnostic, posteId).slice(0, n || 3);
}

function computeCategoryAverages(diagnostic) {
  var sums = {}, counts = {};
  CATEGORIES.forEach(function (c) { sums[c.id] = 0; counts[c.id] = 0; });
  if (diagnostic) {
    SKILLS.forEach(function (s) {
      var e = diagnostic.entries[s.id];
      if (e) { sums[s.category] += e.score; counts[s.category] += 1; }
    });
  }
  var out = {};
  CATEGORIES.forEach(function (c) {
    out[c.id] = counts[c.id] ? Math.round((sums[c.id] / counts[c.id]) * 10) / 10 : 0;
  });
  return out;
}

/* Moyenne des scores par catégorie sur le dernier diagnostic de chaque
   joueur du groupe (hors excludePlayerId), pour se situer par rapport
   au reste des joueurs enregistrés. */
function computeGroupAverages(players, excludePlayerId) {
  var sums = {}, count = 0;
  CATEGORIES.forEach(function (c) { sums[c.id] = 0; });
  players.forEach(function (p) {
    if (p.id === excludePlayerId || !p.diagnostics.length) return;
    var diag = p.diagnostics[p.diagnostics.length - 1];
    var avg = computeCategoryAverages(diag);
    CATEGORIES.forEach(function (c) { sums[c.id] += avg[c.id]; });
    count++;
  });
  var averages = {};
  CATEGORIES.forEach(function (c) {
    averages[c.id] = count ? Math.round((sums[c.id] / count) * 10) / 10 : 0;
  });
  return { averages: averages, count: count };
}

/* Historique d'une compétence à travers tous les diagnostics d'un joueur */
function getSkillHistory(diagnostics, skillId) {
  return diagnostics
    .filter(function (d) { return d.entries[skillId]; })
    .map(function (d) {
      return { date: d.date, score: d.entries[skillId].score, potential: d.entries[skillId].potential };
    });
}

/* Objectifs personnalisés : progression vers un score cible sur une compétence,
   évaluée sur le dernier diagnostic disponible (pas de statut "atteint" stocké,
   toujours recalculé pour rester cohérent si un nouveau diagnostic est ajouté). */
function computeGoalProgress(diagnostic, goal) {
  var skill = getSkill(goal.skillId);
  var current = (diagnostic && diagnostic.entries[goal.skillId]) ? diagnostic.entries[goal.skillId].score : null;
  var achieved = current != null && current >= goal.target;
  var pct = current != null ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
  return { skill: skill, current: current, achieved: achieved, pct: pct };
}

/* ---------- Générateur de plan 30 jours ---------- */
var FREQ_BY_RANK = [3, 2, 2]; // séances/semaine pour priorité #1, #2, #3
var DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function pickDrill(skillId, index) {
  var list = DRILLS[skillId] || ["Travail libre ciblé sur cette compétence."];
  return list[index % list.length];
}

function generatePlan(priorities, startDateISO) {
  var start = startDateISO || todayISO();
  var weeks = [];
  var drillCursor = {};

  for (var w = 0; w < 4; w++) {
    var weekStart = addDays(start, w * 7);
    var days = [];
    var slotsUsed = {}; // dayIndex -> true si déjà occupé cette semaine

    for (var d = 0; d < 7; d++) {
      days.push({
        date: addDays(weekStart, d),
        label: DAY_LABELS[d],
        tasks: []
      });
    }

    priorities.forEach(function (p, rankIdx) {
      var freq = FREQ_BY_RANK[rankIdx] || 1;
      var spacing = Math.floor(7 / freq);
      for (var s = 0; s < freq; s++) {
        var dayIdx = Math.min(6, s * spacing + rankIdx);
        drillCursor[p.skillId] = (drillCursor[p.skillId] || 0);
        var drillText = pickDrill(p.skillId, drillCursor[p.skillId] + w);
        days[dayIdx].tasks.push({
          id: uid(),
          skillId: p.skillId,
          skillLabel: p.label,
          text: drillText,
          done: false
        });
        drillCursor[p.skillId]++;
      }
    });

    weeks.push({
      objective: WEEK_OBJECTIVES[w],
      days: days
    });
  }

  return {
    generatedAt: todayISO(),
    startDate: start,
    priorities: priorities.map(function (p) { return { skillId: p.skillId, label: p.label }; }),
    weeks: weeks
  };
}

function addTaskToPlan(plan, skillId, skillLabel, text, dateISO) {
  if (!plan) return plan;
  for (var w = 0; w < plan.weeks.length; w++) {
    var days = plan.weeks[w].days;
    for (var d = 0; d < days.length; d++) {
      if (days[d].date === dateISO) {
        days[d].tasks.push({ id: uid(), skillId: skillId, skillLabel: skillLabel, text: text, done: false });
        return plan;
      }
    }
  }
  // date hors plan (avant début ou après J30) : on l'ajoute au premier jour du plan
  if (plan.weeks[0] && plan.weeks[0].days[0]) {
    plan.weeks[0].days[0].tasks.push({ id: uid(), skillId: skillId, skillLabel: skillLabel, text: text, done: false });
  }
  return plan;
}

function findNextOpenDay(plan, fromISO) {
  var today = fromISO || todayISO();
  var best = null;
  plan.weeks.forEach(function (week) {
    week.days.forEach(function (day) {
      if (day.date >= today && (!best || day.date < best)) best = day.date;
    });
  });
  return best || (plan.weeks[0] && plan.weeks[0].days[0] && plan.weeks[0].days[0].date);
}

function retestMilestones(startDateISO) {
  if (!startDateISO) return [];
  var today = todayISO();
  return [30, 60, 90].map(function (n) {
    var date = addDays(startDateISO, n);
    var diff = daysBetween(today, date);
    return {
      label: "J" + n,
      date: date,
      status: diff < 0 ? "due" : (diff <= 3 ? "soon" : "upcoming"),
      daysLeft: diff
    };
  });
}
