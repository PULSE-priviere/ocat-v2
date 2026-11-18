// Configuration unique de l'installation (section 8). Les noms et le logo viennent des variables d'environnement.
const appConfig = {
  orgName: process.env.NEXT_PUBLIC_ORG_NAME || 'Organisation',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'OCAT',
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || '',
  languages: ['fr', 'en'],
  defaultLanguage: 'fr',
  colors: {
    accent: '#D9694A',      // corail adouci
    accentSoft: '#FBEBE5',  // fond de l'élément actif
    ink: '#27323D',         // texte principal
    muted: '#6B7680',       // texte secondaire
    line: '#E6E2DB',        // bordures
    surface: '#FFFFFF',
    page: '#F6F4F0',        // fond de page, ton chaud et reposant
    ok: '#4E9A6C',
    warn: '#D9A441',
    // Boutons et pastilles : fond pastel + texte foncé, selon la fonction
    ui: '#4A7BC4',                            // bleu d'interface : liens, onglet actif, sélection
    coralBg: '#FBE6DF', coralFg: '#A8452B',   // action principale
    greenBg: '#E3F1E8', greenFg: '#23683F',   // valider, partager, rouvrir
    blueBg: '#E5EEF8', blueFg: '#2C5A92',     // liens, envois
    amberBg: '#FBF0D8', amberFg: '#85590A',   // clôturer, attention
    redBg: '#FBE4E2', redFg: '#A02A22',       // révoquer, supprimer
    greyBg: '#EDEBE6', greyFg: '#454B52',     // neutre
  },
  font: { family: 'Manrope', googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap' },
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
    country: ['morocco', 'algeria', 'tunisia', 'libya', 'egypt', 'mauritania', 'south_africa', 'other'],
    org_type: ['association', 'ngo', 'cooperative', 'social_enterprise', 'foundation', 'network'],
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
