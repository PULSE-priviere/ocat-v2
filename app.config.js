// Configuration unique de l'installation (section 8). Les noms et le logo viennent des variables d'environnement.
const appConfig = {
  orgName: process.env.NEXT_PUBLIC_ORG_NAME || 'Organisation',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'OCAT',
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || '',
  languages: ['fr', 'en'],
  defaultLanguage: 'fr',
  colors: {
    accent: '#E0533D',      // corail PULSE : action principale, graphiques
    accentSoft: '#FDF1EE',
    ink: '#171717',         // texte principal
    muted: '#707070',       // texte secondaire
    line: '#EDEDED',        // bordures
    surface: '#FFFFFF',
    page: '#FCFCFC',        // fond de page, gris très clair
    ok: '#3F9A63',
    warn: '#E2A33B',
    ui: '#171717',
    // Teintes d'état (étiquettes, pastilles)
    coralBg: '#FDF1EE', coralFg: '#B6452D',
    greenBg: '#EEF7F1', greenFg: '#1E6B41',
    blueBg: '#EEF4FC', blueFg: '#1F5FA8',
    amberBg: '#FFF6E5', amberFg: '#8A5A00',
    redBg: '#FEF1F0', redFg: '#B42318',
    greyBg: '#F3F3F3', greyFg: '#525252',
  },
  font: { family: 'Figtree', googleUrl: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap' },
  // Règles de calcul (staff uniquement — l'OSC ne voit jamais de score)
  scoring: {
    excludeCodes: ['NA'],          // codes exclus de la moyenne
    global: 'mean_of_sections',    // ou 'mean_of_questions'
    requireCompleteSection: true,  // F5 : score seulement si la section est complète
    showProvisional: true,         // graphiques de l'équipe : valeur provisoire (marquée *) tant qu'une section est incomplète
    globalIncludesProjectSections: false, // les sections propres à un projet ont leur score mais n'entrent pas dans le global (comparabilité)
  },
  // Listes de choix de la fiche organisation (libellés FR/EN dans locales/*.json, clés profile.opt.*)
  profileOptions: {
    // Le pays n'a pas de liste fixe : il vient des pays du projet (codes ISO, voir lib/countries.js)
    org_type: ['association', 'ngo', 'cooperative', 'social_enterprise', 'foundation', 'chamber_of_commerce', 'network', 'public_institution', 'company'],
    org_size: ['1-5', '6-20', '21-50', '50+'],
  },
  // Graphiques montrés à l'OSC pendant qu'elle répond. Aucun chiffre de score n'est affiché.
  oscView: { radar: true, distribution: true, liveBeforeComplete: true },
  tools: ['ocat'],                 // outils proposés sur le Dashboard (point d'entrée)
  tokenDays: 60,                   // validité du lien personnel, prolongée à chaque réponse
  publicEntryLimit: { max: 5, perHours: 1 },  // créations par IP
  frameworkKey: 'ocat_osc',
};
module.exports = appConfig;
