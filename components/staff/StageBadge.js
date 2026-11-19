// Étape d'accompagnement : pastille et bandeau de progression
import { useI18n } from '../../lib/i18n';
import { stageStep } from '../../lib/stage';
import { fmtDate } from '../../lib/planData';

export function StageBadge({ stage, date }) {
  const { t, lang } = useI18n();
  const when = stage === 'planned' && date ? ` · ${fmtDate(date, lang, { day: 'numeric', month: 'short' })}` : '';
  return <span className="stagepill" data-stage={stage}>{t(`stage.${stage}`)}{when}</span>;
}

const STEPS = ['questionnaire', 'planning', 'session', 'plan', 'shared'];

export function StageTracker({ stage, date }) {
  const { t } = useI18n();
  const cur = stageStep(stage);
  const all = stage === 'shared';
  return (
    <div className="trackerwrap">
      <ol className="tracker" aria-label={t('stage.title')}>
        {STEPS.map((k, i) => (
          <li key={k} className={all || i < cur ? 'done' : i === cur ? 'cur' : ''}>
            <span className="trk-dot">{all || i < cur ? '✓' : i + 1}</span>
            <span className="trk-label">{t(`stage.s_${k}`)}</span>
          </li>
        ))}
      </ol>
      <StageBadge stage={stage} date={date} />
    </div>
  );
}
