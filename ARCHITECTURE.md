# Architecture d'OCAT

Next.js 14 (Pages Router, JavaScript) · Supabase (Postgres + Auth, sécurité par ligne) · Vercel. Textes FR/EN dans `locales/`.

## Arborescence

```
ocat/
├── app.config.js           Réglages : couleurs, police, options de profil (types, tailles), règles de score
├── next.config.js          Configuration Next.js (logo détecté dans public/brand)
├── package.json            Dépendances : supabase-js, docx, exceljs, recharts, nodemailer, @vercel/functions
├── .env.example            Variables d'environnement (Supabase, e-mail, Airtable, APP_URL)
├── pages/
│   ├── index.js            Accueil neutre ; finit les anciens liens de connexion
│   ├── p/[slug].js         Entrée publique d'un projet : création du dossier d'une organisation
│   ├── a/[token].js        Parcours de l'organisation : tableau de bord, questionnaire, rapport, plan
│   ├── login.js            Connexion de l'équipe (lien par e-mail)
│   ├── activate.js         Activation d'un compte invité (lien sans date limite)
│   ├── auth/confirm.js     Confirmation d'un lien de connexion (au clic sur le bouton)
│   ├── staff/index.js      Espace équipe : accueil coach, tous les projets, onglets d'un projet, administration
│   ├── staff/subject/[id].js  Fiche d'une organisation : récapitulatif, session, plan, paramètres
│   ├── staff/plan/[id].js  Plan d'accompagnement imprimable (PDF) et export Word
│   ├── staff/profile.js    Mon profil et mes droits
│   └── api/
│       ├── public/         project.js (infos du lien public), enter.js (création du dossier)
│       ├── osc/            load, save, submit, resend : API de l'organisation (par jeton personnel)
│       ├── auth/           login.js, activate.js
│       └── staff/[action].js  Actions de l'équipe (invitations, Airtable, e-mails, sections…) avec droits vérifiés
├── components/
│   ├── Layout.js           En-tête, menu latéral repliable, langue
│   ├── OscDashboard.js, Intro.js, OrgInfoForm.js, ProfileCharts.js, PlanDocument.js   Écrans de l'organisation
│   ├── Check.js, SearchBox.js, CountryPicker.js, MailSent.js, Icon.js, LinkBox.js     Petits composants
│   └── staff/              Écrans de l'équipe : CoachHome, ProjectsHome, Cohort, Analytics, Needs, Questionnaire,
│                           Team, ProjectSettings, SessionTab, PlanEditor, Recap, Admin, MailSettings, ScoresExport…
│                           staff/analytics/ : les 8 blocs d'Analytics, ui.js, exportXlsx.js (exceljs, chargé au clic)
├── lib/
│   ├── supabase.js         Client navigateur + appels aux actions de l'équipe
│   ├── server.js           Client serveur (clé service), jetons, limitation des tentatives, APP_URL
│   ├── bank.js             Chargement des sections et questions (banque + projet + évaluation)
│   ├── scoring.js          Avancement et scores (ce qui compte, ce qui ne compte pas)
│   ├── stage.js            Étape d'accompagnement d'une organisation
│   ├── cohort.js           Données de la cohorte et des besoins (un appel : fonction SQL project_load)
│   ├── analytics.js        Onglet Analytics : calculs purs de chaque bloc et tables d'export (CSV, Excel)
│   ├── plan.js, planData.js, planCharts.js, planDocx.js   Plan d'accompagnement et ses exports
│   ├── mail.js, mailcheck.js, invite.js, activation.js, login.js   E-mails, invitations, connexion
│   ├── airtableSync.js, scoresExport.js, airtableActions.js        Export Airtable (table « Scores » ou trois tables)
│   ├── background.js       Tâches de fond sur Vercel (e-mails, Airtable)
│   └── i18n.js, countries.js, search.js, names.js, safe.js, csv.js   Utilitaires
├── locales/fr.json, en.json   Tous les textes de l'interface et des e-mails
├── styles/globals.css      Thème
├── supabase/
│   ├── migrations/0001…0018   Schéma, sécurité par ligne, puis évolutions (à exécuter dans l'ordre)
│   ├── setup_all.sql       Toutes les migrations réunies (généré par `npm run sql`)
│   └── tests/rls_test.sql  Tests des droits (base vide)
├── scripts/                seed.js (import de la banque), smoke_osc.js (test du parcours), build_bank.js, check_i18n.js, test_analytics.mjs…
├── data/example_bank.json  Exemple de banque de questions (la vraie, ocat_osc.json, n'est pas versionnée)
└── docs/                   EMAIL.md, AIRTABLE.md, AIRTABLE_EMAIL.md, SCENARIO_TEST.md
```

## Tables Supabase

| Table | Rôle | Colonnes principales |
|---|---|---|
| `frameworks` | Cadre de questionnaire | id, key, name, version |
| `sections` | Sections (communes, ou propres à un projet) | id, framework_id, num, name_fr/en, project_id (null = commune), kind (`scored` / `data`) |
| `questions` | Questions (banque, projet, ou ajoutées à une évaluation) | id, framework_id, section_id, concept_id, code, ord, format (`scale`, `yesno`, `text`, `short`, `number`, `choice`), text_fr/en, guide_fr/en, options, active, project_id, assessment_id |
| `profiles` | Comptes de l'équipe (liés à `auth.users`) | id, email, name, first_name, last_name, is_admin |
| `projects` | Projets | id, name, cohort, zone, countries[], framework_id, public_slug, public_active, welcome_fr/en, offer_coach_choice, archived |
| `memberships` | Rôles dans un projet (owner et/ou coach) | user_id, project_id, role, offered_to_osc |
| `subjects` | Organisations | id, project_id, name, email, contact_first_name/last_name, country (ISO), org_type, org_size, coach_id (droits), facilitator (texte libre, analyse), origin, support_org (plus utilisé par l’interface) |
| `assessments` | Diagnostics (baseline, midline, endline) | id, subject_id, type, status, token_hash, token_expires_at, section_comments, section_deepen, notes_shared, session_status, session_date, administration_mode (`self` / `guided`), submitted_at, locked_at |
| `answers` | Réponses | id, assessment_id, question_id, code, value_text, support, coach_notes, coach_action, coach_owner, edited_by_coach |
| `needs` / `answer_needs` | Besoins d'un projet et leur lien aux réponses | id, project_id, label / answer_id, need_id |
| `action_plans` | Plan d'accompagnement d'un diagnostic | assessment_id, items (échéances, « dans le plan »), status (`draft`, `validated`, `shared`) |
| `staff_invites` | Liens d'activation des invitations (empreinte seulement) | id, token_hash, user_id, email, created_by, used_at, revoked_at |
| `app_settings` | Réglages globaux (connexion Airtable) | key, value (jsonb) |
| `audit_log` | Journal des modifications | project_id, table_name, row_id, field, old_value, new_value, actor_id, at |
| `rate_events` | Limitation des tentatives par adresse IP | kind, ip_hash, at |

**Droits.** La sécurité par ligne s'appuie sur des fonctions (`is_admin`, `is_owner`, `is_member`, `can_subject`…). Un coach ne voit que ses organisations ; un owner voit tout son projet ; l'administrateur voit tout. Les organisations n'ont pas de compte : elles passent par l'API serveur avec leur jeton personnel. `staff_invites` et `app_settings` ne sont lisibles que par le serveur.

**Chargement d'un projet.** `project_load(p)` (migration 0016, `security invoker`) renvoie en un seul objet JSON les organisations, évaluations, réponses, plans, travail du coach, besoins et liens visibles par l'appelant. `lib/cohort.js` l'appelle et se replie sur des requêtes séparées si la fonction n'existe pas encore.

**Analytics.** `analytics_rows(p_project, p_type, p_include_in_progress)` (migration 0017, `security definer`) vérifie d'abord `is_owner`, puis renvoie en un objet JSON les organisations, évaluations et réponses notées du projet. L'action `analytics` de `pages/api/staff/[action].js` y ajoute la banque de questions ; `lib/analytics.js` fait tous les calculs (écran, CSV et Excel utilisent les mêmes fonctions).
