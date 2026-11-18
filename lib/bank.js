// Chargement des sections et questions d'une évaluation :
// banque commune + sections propres au projet + questions ajoutées par le coach à cette évaluation
const QCOLS = 'id, section_id, code, ord, format, text_fr, text_en, guide_fr, guide_en, assessment_id, project_id, options';

export async function loadBank(db, frameworkId, assessmentId, projectId) {
  let secQ = db.from('sections').select('id, num, name_fr, name_en, project_id, kind').eq('framework_id', frameworkId).order('num');
  let bankQ = db.from('questions').select(QCOLS).eq('framework_id', frameworkId).is('assessment_id', null).eq('active', true).order('ord');
  if (projectId) {
    const f = `project_id.is.null,project_id.eq.${projectId}`;
    secQ = secQ.or(f); bankQ = bankQ.or(f);
  } else { secQ = secQ.is('project_id', null); bankQ = bankQ.is('project_id', null); }
  const [{ data: sections }, { data: bank }, { data: extra }] = await Promise.all([
    secQ, bankQ,
    assessmentId
      ? db.from('questions').select(QCOLS).eq('assessment_id', assessmentId).order('created_at')
      : Promise.resolve({ data: [] }),
  ]);
  // idx : position affichée (S1, S2…), stable même si le numéro interne d'une section de projet est plus grand
  return { sections: (sections || []).map((s, i) => ({ ...s, idx: i + 1 })), questions: [...(bank || []), ...(extra || [])] };
}
