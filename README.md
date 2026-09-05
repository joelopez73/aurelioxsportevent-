# AURELIOX

Application web pour joueurs de sport collectif (13–19 ans) : diagnostic sur 20 compétences, moteur de priorités, plan d'entraînement 30 jours, module « match → drill » et suivi de progression (retest J30/J60/J90).

## Lancer l'application

Aucune installation requise : ouvre `index.html` dans un navigateur, ou sers le dossier avec un serveur statique (ex. `python3 -m http.server`) pour un rendu optimal des graphiques.

Toutes les données (profil, diagnostics, plan, matchs) sont stockées localement dans le navigateur (`localStorage`) — aucun compte, aucun serveur, aucun envoi de données.

## Fonctionnalités

- **Profil** : nom, sport, poste, date de départ. Export/import JSON pour sauvegarder ou changer d'appareil.
- **Diagnostic** : notation de 20 compétences (technique, intelligence de jeu, défense, athlétique, mental) sur un score /10 et un potentiel de progression /5.
- **Priorités** : calcul automatique `(10 − score) × impact du poste × potentiel`, avec possibilité d'ajuster manuellement les 3 priorités retenues.
- **Plan 30 jours** : planning jour par jour sur 4 semaines généré à partir des 3 priorités, tâches cochables et personnalisables.
- **Match → Drill** : après un match, choix d'un problème observable et suggestion d'un exercice ciblé, ajoutable directement au plan.
- **Progression** : rappels de retest à J30/J60/J90 et comparaison graphique entre le diagnostic initial et le dernier diagnostic.

## Structure

```
index.html
css/styles.css
js/data.js      référentiel des compétences, postes, pondérations, banque d'exercices
js/storage.js   persistance locale + logique du moteur de priorités / génération du plan
js/charts.js    rendu des graphiques (Chart.js via CDN, avec repli hors-ligne)
js/app.js       vues et logique d'interface
```

## Note honnête

Les pondérations d'impact par poste et la banque d'exercices sont des choix de conception par défaut (dans `js/data.js`), pas des données validées scientifiquement — à ajuster selon le sport, le niveau et le regard du coach.
