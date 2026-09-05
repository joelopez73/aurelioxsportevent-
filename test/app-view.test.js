/* Tests des fonctions "pures" de js/app.js (constructeurs de HTML et
   utilitaires qui ne touchent pas le DOM) : échappement HTML, formatage,
   export CSV, logique du rappel de sauvegarde, et quelques vues.
   Chargé dans un contexte vm avec un stub minimal de `document`/`window`
   (seulement `addEventListener`/`scrollTo`, jamais appelés dans ces
   tests) — juste assez pour que app.js se charge sans lever d'erreur au
   niveau module. Les fonctions qui manipulent réellement le DOM
   (render(), exportData(), submitDiagnostic()...) restent hors scope :
   elles sont vérifiées manuellement en navigateur à chaque session. */

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
  const sandbox = {
    console,
    localStorage: makeFakeLocalStorage(),
    document: { addEventListener: () => {} },
    window: { scrollTo: () => {} }
  };
  vm.createContext(sandbox);
  ["data.js", "storage.js", "app.js"].forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  });
  return sandbox;
}

test("escapeHtml: échappe les caractères dangereux, laisse le texte normal intact", () => {
  const app = loadApp();
  assert.equal(app.escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(app.escapeHtml("Jean & Marie's"), "Jean &amp; Marie&#39;s");
  assert.equal(app.escapeHtml("Lucas"), "Lucas");
  assert.equal(app.escapeHtml(null), "");
});

test("fmtDate: formate une date ISO, gère l'absence de date", () => {
  const app = loadApp();
  assert.equal(app.fmtDate(null), "—");
  assert.match(app.fmtDate("2024-03-15"), /mars/);
});

test("csvField: neutralise l'injection de formule sans casser les cas normaux", () => {
  const app = loadApp();
  assert.equal(app.csvField("=CMD(calc)"), "'=CMD(calc)");
  assert.equal(app.csvField("+1234"), "'+1234");
  assert.equal(app.csvField("-5"), "'-5");
  assert.equal(app.csvField("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(app.csvField("Lucas"), "Lucas");
  assert.equal(app.csvField("Lucas, Junior"), '"Lucas, Junior"');
  assert.equal(app.csvField('Lu"cas'), '"Lu""cas"');
  assert.equal(app.csvField(null), "");
});

test("needsBackupReminder: caché sans donnée, affiché sans export, masqué après export récent", () => {
  const app = loadApp();
  assert.equal(app.needsBackupReminder(), false); // aucun diagnostic

  app.player().diagnostics.push({ id: "d1", date: "2024-01-01", entries: {} });
  assert.equal(app.needsBackupReminder(), true); // diagnostic présent, jamais exporté

  app.state.lastExportAt = app.todayISO();
  assert.equal(app.needsBackupReminder(), false); // export du jour

  app.state.lastExportAt = app.addDays(app.todayISO(), -20);
  assert.equal(app.needsBackupReminder(), true); // export vieux de 20 jours

  app.state.reminderDismissedOn = app.todayISO();
  assert.equal(app.needsBackupReminder(), false); // reporté pour aujourd'hui
});

test("viewProfil: pré-remplit le nom et sélectionne le poste actif", () => {
  const app = loadApp();
  app.player().profile.name = "Lucas <3";
  app.player().profile.poste = "ailier";
  const html = app.viewProfil();
  assert.match(html, /value="Lucas &lt;3"/);
  assert.match(html, /<option value="ailier" selected>/);
});

test("viewDiagnosticStep: affiche 4 compétences pour l'étape en cours", () => {
  const app = loadApp();
  app.state.__diagnosticDraft = app.initDiagnosticDraft();
  app.state.__diagnosticStep = 0;
  let html = app.viewDiagnosticStep();
  assert.equal((html.match(/class="skill-row"/g) || []).length, 4);
  assert.match(html, /Étape 1\/5/);

  app.state.__diagnosticStep = 4;
  html = app.viewDiagnosticStep();
  assert.match(html, /Étape 5\/5/);
  assert.match(html, /Valider le diagnostic/);
  assert.doesNotMatch(html, />Suivant/);
});

test("viewClub: liste chaque joueur avec ses priorités ou 'aucun diagnostic'", () => {
  const app = loadApp();
  app.player().profile.name = "Lucas";
  const diag = { id: "d1", date: "2024-01-01", entries: {} };
  app.SKILLS.forEach((s) => { diag.entries[s.id] = { score: 5, potential: 3 }; });
  app.player().diagnostics.push(diag);

  app.addPlayer(app.state, "Emma");

  const html = app.viewClub();
  assert.match(html, /Lucas/);
  assert.match(html, /Emma/);
  assert.match(html, /aucun diagnostic/);
});

test("printableDiagnosticHtml / printablePlanHtml: message explicite quand rien n'existe encore", () => {
  const app = loadApp();
  assert.match(app.printableDiagnosticHtml(), /Aucun diagnostic disponible/);
  assert.match(app.printablePlanHtml(), /Aucun plan disponible/);
});
