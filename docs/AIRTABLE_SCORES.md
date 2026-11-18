# Export suivi-évaluation vers Airtable

Chaque évaluation (baseline, midline, endline) devient **une ligne** de la table `Scores` : contexte de l'OSC, score global, scores par section, complétion, nombre de réponses par niveau, appuis demandés, actions définies, besoins.

## Mise en place (une fois)

1. Le jeton Airtable (`AIRTABLE_TOKEN`) doit avoir les droits `data.records:write` (déjà nécessaire pour les e-mails) et, pour créer la table, `schema.bases:write`. Il doit couvrir la base `AIRTABLE_BASE_ID`.
2. Dans l'application : espace équipe > onglet **Projet** > **Suivi-évaluation** > **Créer la table dans Airtable**. Elle est créée avec toutes les colonnes. Vous pouvez aussi la créer à la main avec les mêmes noms de colonnes (voir `FIELD_DEFS` dans `lib/scoresExport.js`).
3. **Synchroniser maintenant** envoie toutes les évaluations du projet. Ensuite, chaque diagnostic soumis met à jour sa ligne automatiquement (désactivable avec `AIRTABLE_SCORES_AUTO=false`).

## Ce qu'il faut savoir

- La clé de mise à jour est la colonne `Cle` (identifiant de l'évaluation) : relancer la synchronisation ne crée pas de doublons.
- Le score d'une section n'est exporté que lorsque la section est **complète** ; sinon la cellule est vide. Le score global n'existe que lorsque toutes les sections du cadre commun sont complètes.
- `Evaluation` vaut Baseline, Midline ou Endline. Pays, type de structure et taille sont exportés sous forme de codes stables (par exemple `morocco`, `ngo`, `6-20`).
- Les colonnes `Score S1` à `Score S9` couvrent le cadre commun. Les sections propres à un projet figurent dans `Scores par section (JSON)`.
- Un coach qui modifie des réponses après l'envoi : relancer **Synchroniser maintenant** pour mettre la ligne à jour.
- Limites d'Airtable : nombre de lignes par table selon le plan (1 000 en gratuit). Une ligne par évaluation reste très en dessous.
- **Télécharger en CSV** donne le même contenu sans passer par Airtable.
