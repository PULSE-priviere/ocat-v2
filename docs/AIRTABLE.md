# Airtable : trois tables reliées

Une seule base Airtable pour tous les projets. Chaque ligne indique son **projet**.

| Table | Une ligne par… | Contenu |
|---|---|---|
| **Organisations** | organisation | Organisation, Projet, Pays, Type de structure, Taille, Contact, E-mail, Coach, Origine (lien public / créée par l'équipe), Date de création |
| **Diagnostics** | diagnostic (baseline, midline, endline) | lien vers l'organisation ; Évaluation, Statut, Étape d'accompagnement, Statut de la session et du plan ; Complétion, Score global, Score S1 à S9 (seulement quand la section est complète) ; répartition des réponses ; **Besoins d'accompagnement**, Appuis demandés, Questions avec appui demandé, Sections à approfondir |
| **Accompagnement** | besoin travaillé en session | liens vers l'organisation et le diagnostic ; Section, Question, Réponse de l'organisation, Appui demandé ; **Notes du coach, Action à mener, Responsable, Échéance** ; Dans le plan, Statut du plan, Statut et date de la session |

Une question a sa ligne d'accompagnement dès qu'un appui est demandé, ou qu'une note, une action ou un responsable existe.

## Mise en place

1. Sur airtable.com/create/tokens, créer un jeton avec les droits `data.records:read`, `data.records:write`, `schema.bases:read` et `schema.bases:write`, et y ajouter la base.
2. Administration > Airtable : coller le jeton et l'identifiant de la base, puis **Enregistrer** (la connexion est vérifiée tout de suite).
3. **Créer / mettre à jour les tables** : l'application crée les trois tables et leurs liens. À refaire après une mise à jour qui ajoute des colonnes ; rien n'est jamais supprimé.
4. **Synchroniser maintenant** : envoie tout (environ 2 à 3 minutes pour 350 organisations).

Ne pas créer les tables à la main ni renommer les colonnes « Identifiant » (clé de mise à jour) : l'application s'en sert pour retrouver chaque ligne.

## Quand les données partent-elles ?

Automatiquement : création d'une organisation (lien public ou par l'équipe), modification de sa fiche, envoi d'un diagnostic, plan validé ou partagé, session marquée « Terminée ». Les notes prises entre-temps partent à l'un de ces moments, ou avec **Synchroniser maintenant**.

Une ligne est mise à jour, jamais dupliquée. Si une note est supprimée dans l'application, sa ligne Airtable n'est pas supprimée : à retirer à la main.

## CSV

Les mêmes trois tables se téléchargent en CSV (Administration pour tous les projets, onglet Projet pour un projet).
