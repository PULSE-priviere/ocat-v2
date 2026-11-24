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

## Mise à jour 3.2 (équipe et rôles)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0007_team_roles.sql`.

- Une personne peut cumuler les rôles owner et coach dans un projet ; un projet peut avoir plusieurs owners.
- Onglet Équipe : un owner invite (coach et/ou owner), attribue les rôles case par case et révoque ; un coach voit l'équipe en lecture seule. Jamais de rôle administrateur ici : seul un administrateur en crée un (page Administration).
- Un projet garde toujours au moins un owner (garde en base ; l'administrateur n'est pas concerné).
- Mon profil : carte « Mes droits » (administrateur, et rôle dans chaque projet).

## Mise à jour 3.3 (espace coach)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0008_session_status.sql`.

- Accueil du coach (`/staff`) : prise en main en 4 étapes (partager son lien, suivre les questionnaires, mener la session, valider et partager le plan), « où trouver quoi », « À faire maintenant », chiffres clés, liste de ses organisations par étape, guide de session, lien de coach.
- Étape d'accompagnement de chaque organisation : questionnaire en cours, session à planifier, session planifiée, session en cours, plan en attente de validation, plan validé, plan partagé. Elle est déduite du statut de la session (choisi par le coach, avec une date), du travail déjà saisi (une note ou une action fait passer la session « en cours » toute seule) et du statut du plan (brouillon, validé, partagé) ; voir `lib/stage.js`.
- Fiche d'une organisation : bandeau de progression, statut et date de la session (onglet Session).
- Cohorte : colonne Étape, filtres par étape ; le filtre par coach et la colonne Coach sont réservés aux owners et à l'administrateur. Un coach ne voit que ses organisations (règle en base, inchangée).

## Mise à jour 3.4 (pays du projet, profil à l'entrée, recherche)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0009_project_countries.sql` (colonne `projects.countries`, conversion des anciens pays en codes ISO).

- Pays d'un projet : plusieurs possibles, choisis à la création (Administration) et modifiables (Administration > projet, ou onglet Projet pour un owner). Stockés en codes ISO ; les noms s'affichent dans la langue de l'écran (`lib/countries.js`, via `Intl.DisplayNames`).
- Début du questionnaire (page d'entrée) : pays (parmi ceux du projet ; appliqué d'office s'il n'y en a qu'un ; tous les pays si le projet n'en a aucun), type de structure, taille, accompagnateur. Pays, type et taille sont obligatoires et vérifiés côté serveur.
- « Chambre de commerce » ajouté aux types de structure (`app.config.js`).
- « Commencer le diagnostic » (page de confirmation) ouvre directement le diagnostic (`?start=1`), et non plus le tableau de bord.
- Recherche d'une organisation : cohorte (tous rôles), accueil du coach, et recherche globale sur « Tous les projets » (administrateur, owners). Insensible aux accents.
- L'export Airtable écrit désormais des libellés lisibles (Pays, Type de structure, Taille).

## Mise à jour 3.5 (diagnostic Airtable)

- « Connectée » n'est affiché qu'après une vraie vérification auprès d'Airtable (jeton, droits, puis base et table) ; sinon l'écran dit pourquoi, avec la marche à suivre (erreurs 401, 403, 404, 422, droits manquants).
- Le jeton collé est nettoyé (sans « Bearer », espaces ni guillemets) et doit commencer par « pat » ; l'identifiant de base peut être collé sous forme d'adresse complète.
- Après « Enregistrer », la connexion est testée immédiatement. L'écran indique quel jeton est utilisé (application ou variable Vercel).
- Aucune migration.

## Mise à jour 3.6 (Airtable : trois tables reliées)

Aucune migration. Voir `docs/AIRTABLE.md`.

- L'export vers Airtable passe de une table (« Scores ») à trois tables reliées : **Organisations**, **Diagnostics** (scores par section, besoins d'accompagnement) et **Accompagnement** (notes du coach, action, responsable, échéance, par besoin). Les liens se font par identifiant d'enregistrement : deux organisations de même nom ne se confondent pas.
- « Créer / mettre à jour les tables » crée les tables absentes et ajoute les colonnes manquantes. Le jeton doit avoir en plus `schema.bases:read` et `schema.bases:write`.
- Envoi automatique : création d'une organisation, modification de sa fiche, diagnostic soumis, plan validé ou partagé, session terminée. Rythme limité à 5 requêtes par seconde (limite d'Airtable).
- Trois CSV (un par table) en plus de l'envoi.
- Vocabulaire : « organisation » remplace « OSC » / « CSO » dans toute l'interface.

## Mise à jour 3.7 (e-mails d'invitation et activation)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0010_staff_invites.sql`.

- Invitation d'un coach, d'un owner ou d'un administrateur : un vrai message (qui invite, quel projet, quel rôle), en texte et en HTML, avec un lien d'activation **sur le domaine de l'application** et **sans date d'expiration** (valable jusqu'à son utilisation). Il ne se consomme qu'au clic sur le bouton : un antivirus d'e-mail qui ouvre le lien ne le « use » pas. Seule l'empreinte du jeton est stockée.
- « Renvoyer l'invitation » (onglet Équipe, Administration > Comptes). L'invitant ne voit jamais le lien ; il est prévenu si l'e-mail n'est pas parti.
- Liens de connexion : également sur le domaine de l'application (`/auth/confirm`, page à bouton).
- Administration > E-mails : fournisseur, expéditeur, SPF/DKIM/DMARC, e-mail de test. Procédure de passage à Resend : `docs/EMAIL.md`.
- Resend : version HTML, nom d'expéditeur, adresse de réponse (`MAIL_REPLY_TO`).

## Mise à jour 3.8 (envoi direct par SMTP, boutons réactifs)

Aucune migration. **Nouvelles dépendances** : `nodemailer` et `@vercel/functions` (déjà dans `package.json` et `package-lock.json` ; Vercel les installe au déploiement).

- `MAIL_PROVIDER=smtp` : envoi direct depuis l'application par un serveur SMTP, par exemple Gmail avec un mot de passe d'application (variables `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`). Plus besoin d'Airtable pour les e-mails. Voir `docs/EMAIL.md`.
- Administration > E-mails reconnaît SMTP, signale l'adresse d'expédition remplacée par Gmail, et donne un message précis en cas d'échec (mot de passe refusé, serveur injoignable…).
- Boutons : chargement immédiat au clic, puis « E-mail envoyé : vérifiez aussi vos indésirables » (connexion, nouveau lien, invitation, renvoi).
- Rapidité : l'e-mail et l'envoi vers Airtable partent en tâche de fond (`lib/background.js`, `waitUntil` de Vercel) à la connexion, à l'entrée d'une organisation, au nouveau lien, à la soumission et à la modification de la fiche. Hors Vercel, l'application attend (comportement sûr).

## Mise à jour 3.9 (Airtable simple par défaut, diagnostic des invitations)

**Si ce n'est pas déjà fait** : Supabase > SQL Editor : exécuter `supabase/migrations/0010_staff_invites.sql` (nécessaire aux invitations).

- Airtable : **mode simple par défaut** (une table « Scores », mêmes colonnes que l'ancienne version, une table existante continue de fonctionner). Le mode complet (trois tables) est une option dans Administration > Airtable. Voir `docs/AIRTABLE.md`.
- Invitations : le message d'échec distingue « lien d'invitation non créé » (base de données pas à jour) de « e-mail refusé » ; Administration > E-mails vérifie la présence de la table des invitations.

## Mise à jour 3.10 (questionnaire visible par les coachs et les owners)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0011_question_guard.sql`.

- L'onglet « Sections du projet » (réservé aux owners) devient **« Questionnaire »**, visible par tous les membres du projet : une carte par section (sections de base et sections propres au projet), au clic les questions.
- **Coachs** : lecture seule. **Owners** : ajoutent des sections propres au projet et des questions à la fin de n'importe quelle section ; les questions de base ne se modifient pas (aucun droit en base, vérifié).
- Une question **ajoutée à une section commune** (échelle 1 à 3, texte, nombre, oui/non, choix) est facultative et **ne compte ni dans le score de la section, ni dans le score global, ni dans la complétion** (`isScored` dans `lib/scoring.js`) ; elle est marquée « Question complémentaire » pour l'organisation.
- Les sections propres au projet portent le badge « Section spécifique <projet> ».
- Barre de recherche (insensible aux accents) : cartes grisées ou comptées par section, résultats groupés avec surlignage, liste des sections où le sujet est absent.
- La migration 0011 interdit de rattacher une question d'un projet à la section d'un autre projet.

## Mise à jour 3.11 (chargement plus rapide)

**Ordre : d'abord la base, ensuite le code.** Supabase > SQL Editor : exécuter `supabase/migrations/0016_project_load.sql`.
Si le code part avant la migration, rien ne casse : l'application se replie sur l'ancien chargement (amélioré), simplement moins rapide.

- Ouvrir un projet (cohorte, besoins, équipe…) demandait 9 à 22 requêtes en 5 à 8 vagues successives : 2 à 6 s selon le projet, car chaque aller-retour vers Supabase coûte environ 0,45 s depuis Madagascar, quel que soit le volume de données.
- La fonction SQL `project_load` renvoie tout en **un seul appel** (organisations, évaluations, réponses, plans, besoins). Elle s'exécute avec les droits de l'appelant : un coach ne reçoit que ses organisations, comme avant (3 vérifications ajoutées à `rls_test.sql`).
- Besoins : une seule requête par projet au lieu d'une par lot de 150 réponses.
- Retour sur un projet déjà ouvert (depuis une fiche, par exemple) : la dernière version s'affiche aussitôt, puis se met à jour. Ces données restent en mémoire le temps de la visite, par compte.
- Accueil du coach : ses projets se chargent en parallèle.
- Aucune nouvelle dépendance.

## Mise à jour 3.12 (Analytics)

**Ordre : d'abord la base, ensuite le code.**
1. Supabase > SQL Editor : exécuter `supabase/migrations/0017_analytics.sql` (et `0016_project_load.sql` si ce n'est pas déjà fait).
2. **Nouvelle dépendance** : `exceljs` (déjà dans `package.json` et `package-lock.json`). Localement : `npm install` ; Vercel l'installe au déploiement. Elle n'est chargée qu'au clic sur « Exporter tout (Excel) ».
3. `git push` : Vercel redéploie.

Si le code part avant la migration, l'onglet Analytics affiche « migration 0017 requise » ; le reste de l'application fonctionne.

- **Onglet « Analytics »** (owners et administrateur), après « Cohorte » : `/staff?p=<id>&tab=analytics`. Les filtres sont dans l'adresse : un lien copié ouvre la même vue.
- Filtres : évaluation (baseline par défaut), structure d'accompagnement, coach, taille, type, mode de passation, pays (si plusieurs), « inclure les évaluations en cours ». Le nombre d'organisations retenues reste affiché ; avertissement sous 10.
- Huit blocs : chiffres clés, maturité par section, tableau des questions (tri, recherche, détail par organisation), top et flop, comparaison par segment (carte de chaleur), évolution (organisations appariées), qualité des données, commentaires.
- Exports : un CSV par bloc (exactement ce qui est affiché ; UTF-8, séparateur `;`) et un classeur Excel (une feuille par bloc, plus « Méthodologie » et « Organisations »). Aucun e-mail ni jeton exporté.
- Règles : échelle 1-3, N/A jamais compté comme 0 ; seules les questions notées comptent (`isScored`) ; score global = moyenne des sections, hors sections propres au projet (comme ailleurs dans l'application). Seuils réglables dans `app.config.js`, section `analytics`.
- Périmètre par défaut : évaluations soumises, et verrouillées **après** soumission. Une évaluation verrouillée sans avoir été soumise n'entre qu'avec « inclure les évaluations en cours ».
- **Mode de passation** (auto-évaluation ou guidée) : choisi par le coach dans l'onglet Session de la fiche. **Structure d'accompagnement** : saisie par un owner dans Paramètres de la fiche, avec suggestions (garde en base : un coach ne peut pas la modifier). Les deux sont journalisés.
- Données : une seule fonction SQL, `analytics_rows`, réservée aux owners (`forbidden` sinon) ; un seul appel pour tout l'onglet.
- Tests : `npm run test:analytics` (calculs, sans base) ; `rls_test.sql` (droits). Données de démonstration : `node scripts/demo.js owner@… coach@…` crée 14 organisations, dont 5 avec un suivi.
