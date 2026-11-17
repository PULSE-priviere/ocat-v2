// Configuration unique de l'installation (section 8). Les noms et le logo viennent des variables d'environnement.
const appConfig = {
  orgName: process.env.NEXT_PUBLIC_ORG_NAME || 'Organisation',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'OCAT',
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || '',
  languages: ['fr', 'en'],
  defaultLanguage: 'fr',
  colors: {
    accent: '#E0503A',      // corail
    accentSoft: '#FBEDEA',  // fond de l'élément actif
    ink: '#13222F',         // texte principal
    muted: '#66727F',       // texte secondaire
    line: '#E4E7EB',        // bordures
    surface: '#FFFFFF',
    page: '#FFFFFF',
    ok: '#2F8F5B',
    warn: '#C7861A',
  },
  font: { family: 'Manrope', googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap' },
  // Règles de calcul (staff uniquement — l'OSC ne voit jamais de score)
  scoring: {
    excludeCodes: ['NA'],          // codes exclus de la moyenne
    global: 'mean_of_sections',    // ou 'mean_of_questions'
    requireCompleteSection: true,  // F5 : score seulement si la section est complète
  },
  tokenDays: 60,                   // validité du lien personnel, prolongée à chaque réponse
  publicEntryLimit: { max: 5, perHours: 1 },  // créations par IP
  frameworkKey: 'ocat_osc',
};
module.exports = appConfig;
