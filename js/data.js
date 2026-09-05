/* AURELIOX - référentiel de données
   Compétences, postes, pondérations d'impact et banque d'exercices.
   Ces pondérations sont des choix de conception par défaut : modifiables
   dans js/data.js selon le sport et le niveau réels des joueurs. */

var CATEGORIES = [
  { id: "technique", label: "Technique", color: "#ff6a3d" },
  { id: "intelligence", label: "Intelligence de jeu", color: "#3dd6ff" },
  { id: "defense", label: "Défense", color: "#7c5cff" },
  { id: "athletique", label: "Athlétique", color: "#ffd23d" },
  { id: "mental", label: "Mental", color: "#3dff8f" }
];

var POSITIONS = [
  { id: "gardien", label: "Gardien / poste spécifique" },
  { id: "defenseur", label: "Défenseur" },
  { id: "milieu", label: "Milieu / polyvalent" },
  { id: "attaquant", label: "Attaquant" }
];

/* impact[posteId] : poids de 0.3 (peu déterminant) à 1.6 (très déterminant) */
var SKILLS = [
  { id: "controle-balle", label: "Contrôle de balle", category: "technique",
    impact: { gardien: 0.6, defenseur: 0.8, milieu: 1.2, attaquant: 1.3 } },
  { id: "passe", label: "Qualité de passe", category: "technique",
    impact: { gardien: 1.0, defenseur: 1.1, milieu: 1.4, attaquant: 0.9 } },
  { id: "finition", label: "Finition / tir", category: "technique",
    impact: { gardien: 0.3, defenseur: 0.5, milieu: 0.9, attaquant: 1.6 } },
  { id: "dribble", label: "Dribble / 1 contre 1 offensif", category: "technique",
    impact: { gardien: 0.3, defenseur: 0.6, milieu: 1.1, attaquant: 1.4 } },

  { id: "decision", label: "Prise de décision", category: "intelligence",
    impact: { gardien: 1.1, defenseur: 1.2, milieu: 1.3, attaquant: 1.2 } },
  { id: "vision", label: "Vision de jeu", category: "intelligence",
    impact: { gardien: 0.8, defenseur: 1.0, milieu: 1.5, attaquant: 1.1 } },
  { id: "placement", label: "Placement / occupation de l'espace", category: "intelligence",
    impact: { gardien: 1.4, defenseur: 1.3, milieu: 1.2, attaquant: 1.1 } },
  { id: "anticipation", label: "Anticipation", category: "intelligence",
    impact: { gardien: 1.5, defenseur: 1.4, milieu: 1.1, attaquant: 1.0 } },

  { id: "duel-defensif", label: "Duel défensif (1 contre 1)", category: "defense",
    impact: { gardien: 0.7, defenseur: 1.6, milieu: 1.0, attaquant: 0.6 } },
  { id: "interception", label: "Interception / lecture", category: "defense",
    impact: { gardien: 0.8, defenseur: 1.5, milieu: 1.3, attaquant: 0.7 } },
  { id: "marquage", label: "Marquage", category: "defense",
    impact: { gardien: 0.6, defenseur: 1.5, milieu: 1.0, attaquant: 0.5 } },
  { id: "repli", label: "Repli défensif / transition", category: "defense",
    impact: { gardien: 0.5, defenseur: 1.3, milieu: 1.2, attaquant: 0.9 } },

  { id: "vitesse", label: "Vitesse", category: "athletique",
    impact: { gardien: 0.7, defenseur: 1.1, milieu: 1.1, attaquant: 1.4 } },
  { id: "endurance", label: "Endurance", category: "athletique",
    impact: { gardien: 0.6, defenseur: 1.1, milieu: 1.5, attaquant: 1.0 } },
  { id: "puissance", label: "Puissance / détente", category: "athletique",
    impact: { gardien: 1.3, defenseur: 1.2, milieu: 0.9, attaquant: 1.2 } },
  { id: "agilite", label: "Agilité / coordination", category: "athletique",
    impact: { gardien: 1.4, defenseur: 1.0, milieu: 1.1, attaquant: 1.2 } },

  { id: "concentration", label: "Concentration", category: "mental",
    impact: { gardien: 1.5, defenseur: 1.2, milieu: 1.1, attaquant: 1.0 } },
  { id: "pression", label: "Gestion de la pression", category: "mental",
    impact: { gardien: 1.4, defenseur: 1.2, milieu: 1.2, attaquant: 1.2 } },
  { id: "communication", label: "Communication sur le terrain", category: "mental",
    impact: { gardien: 1.3, defenseur: 1.3, milieu: 1.2, attaquant: 0.9 } },
  { id: "resilience", label: "Résilience après erreur", category: "mental",
    impact: { gardien: 1.5, defenseur: 1.1, milieu: 1.1, attaquant: 1.1 } }
];

var DRILLS = {
  "controle-balle": [
    "Jonglage à thème 3x3min : pied fort / pied faible / cuisse-poitrine, sans faire tomber le ballon.",
    "Contrôle orienté : passe d'un partenaire, contrôle en 1 touche vers l'espace libre, 20 répétitions par pied."
  ],
  "passe": [
    "Passes en mouvement sur 15m, 1ère touche puis passe tendue au sol, alterner pied droit/gauche, 10 min.",
    "Rondo à 4 contre 1 en espace réduit (6m x 6m), 5 min x3, objectif 8 passes sans perte."
  ],
  "finition": [
    "10 séries de 5 tirs après contrôle orienté, varier angle et surface de frappe.",
    "Finition sous pression : course + 1 contrôle + tir en moins de 3 secondes, 15 répétitions."
  ],
  "dribble": [
    "Slalom entre 6 plots + feinte de corps avant le dernier plot, 8 passages chronométrés.",
    "1 contre 1 face à un défenseur passif puis actif, 10 duels, varier le pied d'appui."
  ],
  "decision": [
    "Exercice à contrainte : 2 touches maximum en jeu réduit à 5 contre 5, débrief vidéo après 10 min.",
    "Scénarios flash : montrer une situation de match (photo/vidéo), le joueur annonce sa décision en 2 secondes."
  ],
  "vision": [
    "Jeu à thème avec joker : scanner le terrain avant chaque réception, verbaliser à voix haute ce qu'il voit.",
    "Passe et suit avec relance vers le joueur démarqué le plus loin, 15 répétitions."
  ],
  "placement": [
    "Occupation de zone en jeu positionnel 4 contre 4 + 3 appuis, rotation toutes les 4 minutes.",
    "Exercice de couloir : rester dans sa zone de référence pendant une possession de 6 passes."
  ],
  "anticipation": [
    "Réaction à un signal visuel (couleur/geste du coach) pour déclencher un appel ou une interception, 12 répétitions.",
    "Analyse vidéo de 10 situations de match pour lire les intentions adverses avant l'action."
  ],
  "duel-defensif": [
    "Duels 1 contre 1 défensifs sur 10m avec délai de réaction, 10 répétitions par joueur.",
    "Défense en recul face à un dribbleur, objectif : ne pas se faire éliminer sur 3 courses successives."
  ],
  "interception": [
    "Jeu réduit avec consigne de lecture de trajectoire, 1 point par interception réussie.",
    "Exercice de couverture : anticiper la passe intérieure en restant sur la ligne de passe, 10 min."
  ],
  "marquage": [
    "Marquage individuel en mouvement sur centres répétés, rester à une longueur de bras, 15 répétitions.",
    "Exercice de collaboration à 2 défenseurs sur un appui/soutien offensif, 10 min."
  ],
  "repli": [
    "Sprint de transition défensive sur 30m après perte de balle simulée, 8 répétitions.",
    "Jeu à thème avec transition immédiate : dès perte de balle, repli collectif organisé en moins de 5 secondes."
  ],
  "vitesse": [
    "6 sprints de 20m départ arrêté, récupération complète entre chaque, focus sur la fréquence des appuis.",
    "Sprints avec changement de direction en T, 6 répétitions, chronométrées."
  ],
  "endurance": [
    "Fractionné 30/30 (30s effort / 30s récupération) x 12 séries à intensité match.",
    "Course continue à intensité modérée 20-25 minutes, fréquence cardiaque contrôlée."
  ],
  "puissance": [
    "Pliométrie : squats sautés 4x8, sauts en contrebas 4x6, récupération complète.",
    "Départs explosifs sur 5m, 8 répétitions, à partir de différentes positions de départ."
  ],
  "agilite": [
    "Échelle de rythme (in/out, latéral) 3 passages x4 exercices différents.",
    "Parcours de plots multidirectionnel avec changement d'appui, chronométré, 6 passages."
  ],
  "concentration": [
    "Exercice technique simple sous fatigue (fin de séance) pour évaluer la constance de la concentration.",
    "Routine pré-action : respiration + point de focalisation avant chaque coup de pied arrêté, à répéter en match."
  ],
  "pression": [
    "Simulation de tirs au but / situations décisives devant public (coéquipiers qui chambrent gentiment).",
    "Exercice de respiration et de visualisation 5 minutes avant chaque séance ou match."
  ],
  "communication": [
    "Jeu à thème où chaque joueur doit donner une information vocale avant chaque passe.",
    "Exercice de communication défensive : annoncer 'homme libre' / 'marque' à voix haute sur chaque phase défensive."
  ],
  "resilience": [
    "Debrief immédiat après chaque erreur à l'entraînement : nommer l'erreur, l'action corrective, on repart.",
    "Journal de bord : noter après chaque séance une erreur et ce qui a été fait pour rebondir."
  ]
};

var WEEK_OBJECTIVES = [
  "Semaine 1 — Prise de repères : découvrir et répéter les gestes clés à faible intensité.",
  "Semaine 2 — Répétition & charge : augmenter le volume et la difficulté des exercices.",
  "Semaine 3 — Intensité & transfert : rapprocher les exercices de la situation de match.",
  "Semaine 4 — Consolidation : stabiliser les acquis et préparer le retest J30."
];

function getSkill(id) {
  for (var i = 0; i < SKILLS.length; i++) if (SKILLS[i].id === id) return SKILLS[i];
  return null;
}

function getCategory(id) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
  return null;
}

function getPosition(id) {
  for (var i = 0; i < POSITIONS.length; i++) if (POSITIONS[i].id === id) return POSITIONS[i];
  return null;
}
