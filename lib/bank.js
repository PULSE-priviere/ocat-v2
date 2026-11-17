// Chargement des sections et questions d'une évaluation (banque + questions ajoutées par le coach)
export async function loadBank(db, frameworkId, assessmentId) {
  const [{ data: sections }, { data: bank }, { data: extra }] = await Promise.all([
    db.from('sections').select('id, num, name_fr, name_en').eq('framework_id', frameworkId).order('num'),
    db.from('questions').select('id, section_id, code, ord, format, text_fr, text_en, guide_fr, guide_en, assessment_id')
      .eq('framework_id', frameworkId).is('assessment_id', null).eq('active', true).order('ord'),
    assessmentId
      ? db.from('questions').select('id, section_id, code, ord, format, text_fr, text_en, guide_fr, guide_en, assessment_id')
          .eq('assessment_id', assessmentId).order('created_at')
      : Promise.resolve({ data: [] }),
  ]);
  return { sections: sections || [], questions: [...(bank || []), ...(extra || [])] };
}
