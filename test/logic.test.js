/* Tests de la logique métier (js/data.js + js/storage.js), sans dépendance
   externe : lancer avec `node --test test/`.
   js/*.js sont des scripts globaux pensés pour le navigateur (pas de
   module.exports) ; on les charge donc dans un contexte vm partagé,
   comme le fait index.html avec des <script> successifs. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeFakeLocalStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };
}

function loadApp() {
  const sandbox = { console, localStorage: makeFakeLocalStorage() };
  vm.createContext(sandbox);
  ["data.js", "storage.js"].forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  });
  return sandbox;
}

function uniformDiagnostic(app, score, potential) {
  const entries = {};
  app.SKILLS.forEach((s) => { entries[s.id] = { score: score, potential: potential }; });
  return { id: "d1", date: "2024-01-01", entries: entries };
}

test("computePriorityRows: formule (10-score) x impact x potentiel", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const rows = app.computePriorityRows(diag, "attaquant");
  const finition = rows.find((r) => r.skillId === "finition");
  const finitionSkill = app.getSkill("finition");
  const expected = Math.round((10 - 5) * finitionSkill.impact.attaquant * 3 * 10) / 10;
  assert.equal(finition.priorityScore, expected);
  assert.equal(rows.length, app.SKILLS.length);
});

test("computePriorityRows: poste inconnu retombe sur un impact neutre (1)", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const rows = app.computePriorityRows(diag, "poste-qui-nexiste-pas");
  rows.forEach((r) => assert.equal(r.priorityScore, 15)); // (10-5) * 1 * 3
});

test("computeTopPriorities: renvoie le nombre demandé, triés par priorité décroissante", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const top3 = app.computeTopPriorities(diag, "attaquant", 3);
  assert.equal(top3.length, 3);
  for (let i = 1; i < top3.length; i++) {
    assert.ok(top3[i - 1].priorityScore >= top3[i].priorityScore);
  }
});

test("computeCategoryAverages: diagnostic uniforme -> moyenne = score uniforme", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 7, 2);
  const avg = app.computeCategoryAverages(diag);
  app.CATEGORIES.forEach((c) => assert.equal(avg[c.id], 7));
});

test("computeCategoryAverages: sans diagnostic, toutes les moyennes à 0", () => {
  const app = loadApp();
  const avg = app.computeCategoryAverages(null);
  app.CATEGORIES.forEach((c) => assert.equal(avg[c.id], 0));
});

test("generatePlan: 4 semaines de 7 jours, 28 tâches pour 3 priorités (3+2+2/semaine)", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const top3 = app.computeTopPriorities(diag, "attaquant", 3);
  const plan = app.generatePlan(top3, "2024-01-01");

  assert.equal(plan.weeks.length, 4);
  plan.weeks.forEach((w) => assert.equal(w.days.length, 7));

  let total = 0;
  plan.weeks.forEach((w) => w.days.forEach((d) => { total += d.tasks.length; }));
  assert.equal(total, 28);

  const usedSkillIds = new Set();
  plan.weeks.forEach((w) => w.days.forEach((d) => d.tasks.forEach((t) => usedSkillIds.add(t.skillId))));
  top3.forEach((p) => assert.ok(usedSkillIds.has(p.skillId)));
});

test("addTaskToPlan: ajoute au bon jour quand la date existe dans le plan", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const top3 = app.computeTopPriorities(diag, "attaquant", 3);
  const plan = app.generatePlan(top3, "2024-01-01");
  const targetDate = plan.weeks[1].days[2].date;

  app.addTaskToPlan(plan, "finition", "Finition / tir", "Exercice ajouté manuellement", targetDate);

  const found = plan.weeks[1].days[2].tasks.some((t) => t.text === "Exercice ajouté manuellement");
  assert.ok(found);
});

test("addTaskToPlan: retombe sur le premier jour si la date est hors plan", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const top3 = app.computeTopPriorities(diag, "attaquant", 3);
  const plan = app.generatePlan(top3, "2024-01-01");

  app.addTaskToPlan(plan, "vitesse", "Vitesse", "Tâche hors plan", "2099-01-01");

  const found = plan.weeks[0].days[0].tasks.some((t) => t.text === "Tâche hors plan");
  assert.ok(found);
});

test("findNextOpenDay: renvoie la date la plus proche >= aujourd'hui", () => {
  const app = loadApp();
  const diag = uniformDiagnostic(app, 5, 3);
  const top3 = app.computeTopPriorities(diag, "attaquant", 3);
  const plan = app.generatePlan(top3, "2024-01-01");

  const next = app.findNextOpenDay(plan, "2024-01-15");
  assert.equal(next, "2024-01-15");

  const nextBeforeStart = app.findNextOpenDay(plan, "2020-01-01");
  assert.equal(nextBeforeStart, "2024-01-01");
});

test("retestMilestones: statuts dus/à venir cohérents avec les dates", () => {
  const app = loadApp();
  const realToday = app.todayISO();
  const startDate = app.addDays(realToday, -32); // J30 est passé, J60/J90 à venir
  const milestones = app.retestMilestones(startDate);

  const j30 = milestones.find((m) => m.label === "J30");
  const j90 = milestones.find((m) => m.label === "J90");
  assert.equal(j30.status, "due");
  assert.equal(j90.status, "upcoming");
});

test("retestMilestones: tableau vide sans date de départ", () => {
  const app = loadApp();
  // comparaison par longueur plutôt que deepEqual : le tableau vient d'un
  // autre "realm" vm, deepStrictEqual le traiterait comme un type différent.
  assert.equal(app.retestMilestones(null).length, 0);
});

test("getSkillHistory: renvoie les entrées dans l'ordre des diagnostics", () => {
  const app = loadApp();
  const d1 = uniformDiagnostic(app, 4, 2);
  d1.date = "2024-01-01";
  const d2 = uniformDiagnostic(app, 6, 4);
  d2.date = "2024-02-01";

  const history = app.getSkillHistory([d1, d2], "vitesse");
  assert.equal(history.length, 2);
  assert.equal(history[0].score, 4);
  assert.equal(history[1].score, 6);
});

test("addDays / daysBetween: arithmétique de dates cohérente", () => {
  const app = loadApp();
  assert.equal(app.addDays("2024-01-01", 30), "2024-01-31");
  assert.equal(app.daysBetween("2024-01-01", "2024-01-31"), 30);
  assert.equal(app.daysBetween("2024-01-31", "2024-01-01"), -30);
});

test("uid: génère des identifiants non vides et différents à chaque appel", () => {
  const app = loadApp();
  const a = app.uid();
  const b = app.uid();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("migrateLegacyState: convertit un état v1 (mono-joueur) en un état v2 à un joueur", () => {
  const app = loadApp();
  const legacy = {
    profile: { name: "Ancien Joueur", sport: "Football", poste: "attaquant", startDate: "2024-01-01" },
    diagnostics: [uniformDiagnostic(app, 5, 3)],
    plan: null,
    matches: []
  };
  const migrated = app.migrateLegacyState(legacy);
  assert.equal(migrated.players.length, 1);
  assert.equal(migrated.players[0].profile.name, "Ancien Joueur");
  assert.equal(migrated.players[0].diagnostics.length, 1);
  assert.equal(migrated.activePlayerId, migrated.players[0].id);
});

test("mode coach: addPlayer / removePlayer gèrent le joueur actif et interdisent de tout supprimer", () => {
  const app = loadApp();
  const state = app.defaultState();
  const firstId = state.players[0].id;

  const second = app.addPlayer(state, "Emma");
  assert.equal(state.players.length, 2);
  assert.equal(state.activePlayerId, second.id);

  const removedNonActive = app.removePlayer(state, firstId);
  assert.equal(removedNonActive, true);
  assert.equal(state.players.length, 1);
  assert.equal(state.activePlayerId, second.id); // inchangé, ce n'était pas le joueur actif

  const refusedLastRemoval = app.removePlayer(state, second.id);
  assert.equal(refusedLastRemoval, false);
  assert.equal(state.players.length, 1);
});
