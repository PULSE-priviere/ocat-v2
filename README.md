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
