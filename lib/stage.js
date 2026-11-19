// Étape d'accompagnement d'une organisation : questionnaire → session → plan.
// Déduite du statut de la session (choisi par le coach), du travail déjà saisi et du statut du plan.
export const STAGES = ['questionnaire', 'to_plan', 'planned', 'in_progress', 'to_validate', 'validated', 'shared'];

export function stageOf({ assessment, plan, hasWork }) {
  if (!assessment) return 'questionnaire';
  if (plan?.status === 'shared') return 'shared';
  if (plan?.status === 'validated') return 'validated';
  const ss = assessment.session_status || 'to_plan';
  if (ss === 'done') return 'to_validate';                           // session terminée : le plan attend sa validation
  if (hasWork || ss === 'in_progress') return 'in_progress';         // dès qu'une note ou une action existe, la session est en cours
  if (ss === 'planned') return 'planned';
  return assessment.status === 'in_progress' ? 'questionnaire' : 'to_plan';
}

// Position dans le bandeau de progression : 0 questionnaire, 1 planification, 2 session, 3 plan, 4 partagé
export const stageStep = s => ({ questionnaire: 0, to_plan: 1, planned: 1, in_progress: 2, to_validate: 3, validated: 3, shared: 4 }[s] ?? 0);

// Ordre d'urgence pour « À faire maintenant »
export const STAGE_PRIORITY = ['to_validate', 'to_plan', 'in_progress', 'planned', 'validated'];
export const needsAction = s => STAGE_PRIORITY.includes(s);

// Onglet de la fiche à ouvrir pour la prochaine action
export const STAGE_TAB = { questionnaire: 'recap', to_plan: 'session', planned: 'session', in_progress: 'session', to_validate: 'plan', validated: 'plan', shared: 'plan' };

// Statut de session effectivement affiché : un travail saisi fait passer « à planifier » et « planifiée » à « en cours »
export const effectiveSession = (assessment, hasWork) => {
  const ss = assessment?.session_status || 'to_plan';
  return hasWork && (ss === 'to_plan' || ss === 'planned') ? 'in_progress' : ss;
};
