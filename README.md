# OCAT v2 — diagnostic organisationnel (pilote)

Next.js 14 (Pages Router, JavaScript) · Supabase (Postgres, Auth, RLS) · Vercel. Coût de services : 0 €.
Une installation par organisation : même code, base et déploiement séparés.

## Installation

1. **Supabase** : créer un projet, région UE (Francfort ou Paris).
   - SQL Editor : coller `supabase/setup_all.sql` (= les deux migrations, générées par `npm run sql`) et exécuter.
   - Facultatif : exécuter `supabase/tests/rls_test.sql` sur ce projet vide. Il affiche 14 lignes « OK » et annule tout.
   - Authentication > URL Configuration : *Site URL* = l'URL de l'app ; *Redirect URLs* : ajouter `https://votre-app.vercel.app/staff`.
   - Authentication > Providers > Email : désactiver « Allow new users to sign up ». Les comptes sont créés depuis l'app.
2. **Local** : `npm install`, copier `.env.example` en `.env.local` et le remplir (Settings > API pour les clés Supabase).
3. **Banque de questions** : déposer `ocat_osc.json` dans `data/` (le fichier n'est pas versionné), puis
   `node scripts/seed.js data/ocat_osc.json --admin vous@exemple.org`.
   Le script est relançable : il met à jour les questions par `concept_id`, sans doublon.
   Les guides de réponse se remplissent ensuite dans l'éditeur Supabase (table `questions`, colonnes `guide_fr`, `guide_en`).
4. **Logo** : déposer le SVG dans `public/brand/logo.svg` (versionné, un logo n'est pas un secret) : `NEXT_PUBLIC_LOGO_URL=/brand/logo.svg`.
5. **Vercel** : importer le dépôt GitHub, renseigner les variables de `.env.example`, déployer.
6. **Turnstile** (anti-robot) : Cloudflare > Turnstile > ajouter le domaine Vercel, copier les deux clés.
   Laissées vides, la vérification est désactivée (pratique en local, à éviter en production).
7. Se connecter sur `/login` avec l'e-mail administrateur, créer le projet (onglet Administration), inviter l'owner et les coachs, copier le lien public (onglet Projet).

## E-mails (`MAIL_PROVIDER`)

- `airtable` : l'app ajoute une ligne dans une table Airtable ; une automatisation envoie l'e-mail. Voir `docs/AIRTABLE_EMAIL.md`.
- `resend` : envoi direct (domaine vérifié requis). `RESEND_API_KEY` et `MAIL_FROM`.
- `console` : affiche les e-mails dans le terminal, en développement uniquement.

Tous les e-mails passent par `lib/mail.js`. Les textes sont dans `locales/*.json` (clé `email`).

## Variables d'environnement

Voir `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` reste côté serveur : ne jamais la préfixer par `NEXT_PUBLIC_`.

## Organisation du code

| Dossier | Contenu |
|---|---|
| `app.config.js` | Seul fichier propre à l'installation : couleurs, police, langues, règles de score, durée des liens |
| `locales/` | Tous les textes FR/EN (`npm run check:i18n` vérifie que les deux langues ont les mêmes clés) |
| `supabase/migrations/` | Schéma, RLS, journal. Toute évolution = un nouveau fichier numéroté |
| `pages/p/[slug]` | Lien public du projet (entrée OSC) |
| `pages/a/[token]` | Questionnaire et rapport de l'OSC (accès par routes API serveur uniquement) |
| `pages/staff/` | Espace équipe : cohorte, fiche OSC, session coach, plan, administration |
| `pages/api/` | `public/*` entrée, `osc/*` accès par jeton, `staff/*` actions qui exigent la clé service |
| `scripts/` | Seed, données de démo, test de fumée, extraction Fillout |

## Règles de sécurité appliquées

- RLS sur toutes les tables. Un coach ne voit que ses OSC, un owner son projet, l'administrateur tout. Révoquer un coach coupe l'accès à la requête suivante.
- Jeton OSC : 32 octets aléatoires, stocké en SHA-256, jamais journalisé. Validité 60 jours, prolongée à chaque réponse.
- Un nom ne rouvre jamais un dossier : un e-mail déjà connu reçoit un nouveau lien par e-mail, rien ne s'affiche à l'écran.
- Journal (`audit_log`) alimenté par la base : auteur, date, ancienne valeur.

## Tests

- Droits : `supabase/tests/rls_test.sql` (14 vérifications).
- Parcours OSC par l'API : `node scripts/smoke_osc.js https://votre-app <slug>` sur une installation de test avec Turnstile désactivé (14 vérifications).
- Scénario manuel complet : `docs/SCENARIO_TEST.md`.
- Données fictives : `node scripts/demo.js owner@… coach@…`.

## Banque de questions depuis Fillout

`scripts/extract_fillout.py export.json data/questions_fr.json` extrait les questions d'un export Fillout.
`node scripts/build_bank.js ancien/config.js data/questions_fr.json data/ocat_osc.json` fusionne avec les textes FR/EN de l'ancienne app et contrôle la cohérence.

## Mise à jour 2.1 (dashboard, fiche organisation, noms)

1. Supabase > SQL Editor : exécuter `supabase/migrations/0003_profile_fields.sql` (une seule fois).
2. Vercel > Settings > Environment Variables : vérifier `APP_URL` (adresse complète en https, sans slash final) et `NEXT_PUBLIC_ORG_NAME` (nom affiché dans les e-mails et le texte d'introduction). Ces variables sont figées au build : **Redeploy** après toute modification.
3. `git push`, puis se connecter une fois et compléter son prénom et son nom sur `/staff/profile`.

## Mise à jour 2.2 (fiche coach en onglets, sections de projet, nouveau design)

1. Supabase > SQL Editor : exécuter `supabase/migrations/0004_session_and_project_sections.sql` (une seule fois ; `0003` d'abord si ce n'est pas déjà fait).
2. `git push` : Vercel redéploie.
3. Sections propres à un projet : espace équipe > onglet « Sections du projet » (owner du projet ou administrateur).

## Mise à jour 2.3 (plan en PDF et Word, calendrier, session dépliable)

- Aucune migration SQL. Nouvelle dépendance : `docx` (export Word, chargée seulement au clic). Localement : `npm install`. Sur Vercel, c'est automatique.
- Les nouveaux liens personnels n'utilisent que des lettres et des chiffres (les caractères `_` et `-` étaient interprétés comme du formatage par certains e-mails). Les anciens liens restent valables.
- Un projet ne doit pas être protégé par « Vercel Authentication » : voir la section « Déploiement » ci-dessus. Les OSC n'ont pas de compte Vercel.

## Mise à jour 2.4 (graphiques avec valeurs provisoires)

Les graphiques de l'équipe (radar, barres, score global du Récapitulatif, de la cohorte et du plan PDF/Word) affichent une valeur **provisoire**, marquée `*`, tant qu'une section est incomplète (moyenne des réponses déjà données). Elle devient définitive quand la section est complète. Réglable avec `scoring.showProvisional` dans `app.config.js`. Aucune migration.

## Mise à jour 2.5 (profil en direct pour toute l'équipe)

Le bloc « profil en direct » (radar + répartition des réponses + état des sections) est partagé par `components/ProfileCharts.js` : tableau de bord de l'OSC (sans chiffres) et onglet Récapitulatif de la fiche (coach, owner, administrateur : chiffres au survol, une série par évaluation). Le radar relie seulement les sections renseignées (`components/radarShape.js`). Aucune migration.

## Mise à jour 2.6 (logo automatique)

Le logo est détecté tout seul : déposer une image dans `public/brand/` (de préférence `logo.svg`, `logo.png`…), la committer, redéployer. `NEXT_PUBLIC_LOGO_URL` reste possible et prioritaire. Le logo apparaît dans l'en-tête, le PDF et le fichier Word du plan. Vérification : ouvrir `https://votre-app/brand/logo.svg` (ou le nom de votre fichier) ; si la page affiche l'image, le fichier est bien déployé.

## Mise à jour 2.7 (sections libres, export suivi-évaluation, nouvelle palette)

**Ordre de déploiement : d'abord la base, ensuite le code.**
1. Supabase > SQL Editor : exécuter `supabase/migrations/0005_section_kinds.sql` (sinon l'application ne trouve pas la colonne `kind`).
2. Vercel : ajouter `AIRTABLE_SCORES_TABLE=Scores` (et facultativement `AIRTABLE_SCORES_AUTO=true`), puis `git push`.
3. Espace équipe > onglet Projet > « Suivi-évaluation » > « Créer la table dans Airtable » (jeton avec le droit `schema.bases:write`), puis « Synchroniser maintenant ». Détails : `docs/AIRTABLE_SCORES.md`.

- Sections de projet : **notée** (N/A, 1, 2, 3, score, radar) ou **libre** (texte long ou court, nombre, oui/non, liste de choix ; ni score ni radar ; facultative pour l'OSC).
- Couleurs : le bleu sert aux liens, à l'onglet actif et à la sélection ; le corail reste la couleur de la marque (graphiques, accents).

## Mise à jour 2.8 (nouveau thème)

Thème sobre inspiré des interfaces type Supabase : fond gris très clair, cartes blanches à bordure fine sans ombre, titres légers, police Figtree, onglets en pilules, champs gris clair. Un seul bouton plein (corail PULSE) pour l'action principale ; les autres boutons sont blancs et bordés ; les couleurs d'état (vert, ambre, rouge) restent réservées aux pastilles. Tout se règle dans `styles/globals.css` (variables en tête de fichier) et `app.config.js` (couleurs de marque, police). Les exports PDF et Word gardent leur style. Aucune migration.

## Mise à jour 2.9 (navigation et mise en page)

- Espace équipe : menu latéral (tous les projets, administration, rubriques du projet ouvert, profil, déconnexion) ; page d'accueil « Tous les projets » avec chiffres clés et une carte colorée par projet ; un projet s'ouvre par `/staff?p=<id>&tab=cohort`.
- Parcours OSC : menu latéral avec chaque section et son avancement (masqué sur petit écran, où les tuiles suffisent).
- En-têtes de page en deux tons, blocs en couleur pleine (lien public du projet, carte du diagnostic), encadré pastel pour le guide de session, sections de projet repliables.
- Aucune migration.

## Mise à jour 3.0 (administration par projet, Airtable pour tous les projets, plan individuel côté OSC)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0006_zone_and_settings.sql` (champ « zone » des projets, réglages de l'application).

- Administration : vues Projets (un clic sur un projet montre ses owners et coachs ; changer un rôle, révoquer, inviter), Comptes (rôles de chacun, droit d'administrateur), Airtable (une seule base pour tous les projets ; jeton saisi dans l'application, enregistré côté serveur, jamais réaffiché ; les variables `AIRTABLE_*` restent possibles en secours).
- Menu latéral collé au bord gauche, repliable (bouton en haut à gauche), avec la liste des projets.
- OSC : rubrique « Plan d'accompagnement individuel » en lecture seule (visible quand le coach l'a partagé).
- Cases à cocher instantanées, boutons avec indicateur d'envoi.

## Mise à jour 3.1

- Plan : export clarifié (menu « Langue du document » puis « Télécharger en PDF » / « Télécharger en Word ») ; le diagramme de répartition des réponses figure dans la vue d'ensemble du PDF et du Word.
- Cohorte : bloc « Lien du formulaire à partager » visible par tous les rôles. Le coach dispose aussi de « Mon lien de coach » (`/p/<slug>?coach=<id>`) : les organisations qui entrent par ce lien lui sont rattachées d'office. Le coach doit être membre du projet, sinon le paramètre est ignoré.
- Aucune migration.
