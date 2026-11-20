# Airtable : suivi-évaluation

Une seule base Airtable pour tous les projets. Chaque ligne indique son **projet**. Deux modes, au choix dans *Administration > Airtable > Mode d'export*.

## Mode simple (par défaut, recommandé) : une table « Scores »

Une ligne par diagnostic (baseline, midline, endline) : organisation, contact, e-mail, projet, coach, pays, type de structure, taille ; évaluation, statut, dates ; complétion, score global, **score de chaque section** (S1 à S9, seulement quand la section est complète) ; répartition des réponses ; appuis demandés, actions définies, besoins d'accompagnement.

C'est tout ce qu'il faut pour le suivi-évaluation. Les colonnes sont celles de l'ancienne table « Scores » : une table existante continue de fonctionner sans rien modifier.

Droits du jeton Airtable : `data.records:read`, `data.records:write` (et `schema.bases:write` si l'application doit créer la table).

## Mode complet (option) : trois tables reliées

À ajouter si vous voulez **suivre l'accompagnement dans Airtable** :
- **Organisations** : une ligne par organisation ;
- **Diagnostics** : comme « Scores », plus l'étape d'accompagnement, les statuts de la session et du plan, les questions avec appui demandé ;
- **Accompagnement** : une ligne par besoin travaillé en session (notes du coach, action à mener, responsable, échéance, présence dans le plan).

Droits supplémentaires : `schema.bases:read` et `schema.bases:write`. Plus de requêtes vers Airtable, donc des envois un peu plus longs.

Les scores sont **identiques** dans les deux modes : choisir le mode complet ne change rien au calcul du suivi-évaluation.

## Mise en place

1. airtable.com/create/tokens : jeton avec les droits ci-dessus, et la base ajoutée.
2. Administration > Airtable : jeton, identifiant de la base, mode, nom de la table ; **Enregistrer** (la connexion est vérifiée tout de suite).
3. *Créer / mettre à jour la table* (rien à faire si la table existe déjà), puis *Synchroniser maintenant*.

Ne pas renommer la colonne clé (`Cle` en mode simple, `Identifiant` en mode complet) : l'application s'en sert pour retrouver chaque ligne.

## Quand les données partent-elles ?

Automatiquement : création d'une organisation, modification de sa fiche, envoi d'un diagnostic, plan validé ou partagé, session terminée. Une ligne est mise à jour, jamais dupliquée. Une ligne n'est pas supprimée d'Airtable si elle disparaît de l'application.

## CSV

Les mêmes données se téléchargent en CSV (Administration pour tous les projets, onglet Projet pour un projet).
