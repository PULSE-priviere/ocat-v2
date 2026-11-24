// Accueil du coach : prise en main, « à faire maintenant », avancement de ses organisations (uniquement celles qui lui sont affectées)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon';
import ShareLinks from './ShareLinks';
import { StageBadge } from './StageBadge';
import SearchBox from '../SearchBox';
import { matches } from '../../lib/search';
import { countryName } from '../../lib/countries';
import { useI18n } from '../../lib/i18n';
import { loadCohort } from '../../lib/cohort';
import { safeStr } from '../../lib/safe';
import { contactName } from '../../lib/names';
import { STAGES, STAGE_PRIORITY, STAGE_TAB, needsAction } from '../../lib/stage';

const href = r => `/staff/subject/${r.subject.id}?tab=${STAGE_TAB[r.stage]}`;

// Charge les organisations affectées au coach dans chacun de ses projets (même s'il est aussi owner : on ne garde que les siennes)
export default function CoachHome({ staff }) {
  const projects = (staff.projects || []).filter(p => !p.archived && (staff.roles?.[p.id] || []).includes('coach'));
  const key = projects.map(p => p.id).join(',');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      // Projets chargés en parallèle (et non l'un après l'autre)
      const cohorts = await Promise.all(projects.map(p => loadCohort(p)));
      const all = [];
      cohorts.forEach((c, i) => c.rows.filter(r => r.subject.coach_id === staff.profile.id).forEach(r => all.push({ ...r, project: projects[i] })));
      if (alive) setRows(all);
    })().catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <CoachDashboard staff={staff} projects={projects} rows={rows} />;
}

export function CoachDashboard({ staff, projects, rows }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const first = safeStr(staff.profile.first_name);
  const list = rows || [];
  const count = s => list.filter(r => r.stage === s).length;
  const todo = STAGE_PRIORITY.flatMap(s => list.filter(r => r.stage === s)).slice(0, 5);
  const top = todo[0];
  const shown = list.filter(r => (!filter || r.stage === filter) && matches(query, [r.subject.name, r.subject.email, contactName(r.subject), countryName(r.subject.country, lang)]));
  const fresh = list.every(r => ['questionnaire', 'to_plan'].includes(r.stage));   // aucune session commencée : la prise en main reste ouverte
  const multi = projects.length > 1;
  return (
    <>
      <section className="hero2">
        <div>
          <p className="eyebrow">{t('coach.eyebrow')}</p>
          <h1 className="display">{first ? t('coach.hello', { name: first }) : t('coach.hello_anon')}<br /><span className="accent">{t('coach.hero_accent')}</span></h1>
        </div>
        <div className="hero2-side">
          <p className="lead">{t('coach.hero_text')}</p>
          {rows === null ? null : top
            ? <Link className="btn primary big" href={href(top)}>{t(`stage.next_${top.stage}`)} · {safeStr(top.subject.name)} <Icon name="arrow" size={16} /></Link>
            : projects[0] ? <Link className="btn primary big" href={`/staff?p=${projects[0].id}&tab=cohort`}>{t('coach.cta_all')} <Icon name="arrow" size={16} /></Link> : null}
        </div>
      </section>

      <div className="kpis">
        <div className="kpi grad"><span className="v">{rows ? list.length : '…'}</span><span className="l">{t('coach.kpi_osc')}</span></div>
        <div className="kpi"><span className="v">{rows ? list.filter(r => r.current && r.current.status !== 'in_progress').length : '…'}</span><span className="l">{t('coach.kpi_submitted')}</span></div>
        <div className="kpi"><span className="v">{rows ? count('to_plan') : '…'}</span><span className="l">{t('coach.kpi_to_plan')}</span></div>
        <div className="kpi"><span className="v">{rows ? count('to_validate') : '…'}</span><span className="l">{t('coach.kpi_to_validate')}</span></div>
      </div>

      <details className="how" open={fresh}>
        <summary><Icon name="bulb" />{t('coach.how_title')}</summary>
        <ol className="steps">
          {[1, 2, 3, 4].map(n => (
            <li key={n}><span className="stepnum">{n}</span><div><b>{t(`coach.s${n}_title`)}</b><p>{t(`coach.s${n}_text`)}</p></div></li>
          ))}
        </ol>
        <div className="where">
          <b>{t('coach.where_title')}</b>
          <ul>{['cohort', 'needs', 'team', 'profile'].map(k => <li key={k}>{t(`coach.where_${k}`)}</li>)}</ul>
        </div>
      </details>

      <div className="todo-grid">
        <section className="card">
          <h2>{t('coach.todo_title')}</h2>
          {rows === null ? <p className="muted">{t('common.loading')}</p> : todo.length === 0 ? <p className="muted">{t('coach.todo_empty')}</p> : (
            <ul className="todolist">
              {todo.map(r => (
                <li key={r.subject.id}>
                  <div><b>{safeStr(r.subject.name)}</b>{multi ? <span className="muted small"> · {safeStr(r.project.name)}</span> : null}<br /><StageBadge stage={r.stage} date={r.current?.session_date} /></div>
                  <Link className="btn small" href={href(r)}>{t(`stage.next_${r.stage}`)} <Icon name="arrow" size={14} /></Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div>
          {projects.map(p => <ShareLinks key={p.id} project={p} staff={staff} onlyMine heading={multi ? safeStr(p.name) : ''} />)}
        </div>
      </div>

      <h2>{t('coach.table_title')}</h2>
      {rows !== null && list.length === 0 ? (
        <div className="callout"><Icon name="users" size={20} /><p>{t('coach.empty')}</p></div>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} />
          <div className="stagefilters" role="group" aria-label={t('coach.pipeline_title')}>
            <button type="button" className={`sf ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>{t('coach.pipeline_all')} <b>{list.length}</b></button>
            {STAGES.filter(s => count(s) > 0 || filter === s).map(s => (
              <button type="button" key={s} className={`sf ${filter === s ? 'on' : ''}`} data-stage={s} onClick={() => setFilter(filter === s ? '' : s)}>{t(`stage.${s}`)} <b>{count(s)}</b></button>
            ))}
          </div>
          <div className="card flush">
            <table className="table">
              <thead><tr><th>{t('coach.col_osc')}</th>{multi ? <th>{t('coach.col_project')}</th> : null}<th>{t('coach.col_questionnaire')}</th><th>{t('coach.col_stage')}</th><th /></tr></thead>
              <tbody>{shown.length === 0 ? <tr><td colSpan={multi ? 5 : 4} className="muted">{t('search.no_result')}</td></tr> : shown.map(r => (
                <tr key={r.subject.id}>
                  <td><Link href={`/staff/subject/${r.subject.id}`}><b>{safeStr(r.subject.name)}</b></Link><br /><small className="muted">{contactName(r.subject) || safeStr(r.subject.email)}</small></td>
                  {multi ? <td>{safeStr(r.project.name)}</td> : null}
                  <td><span className="bar inline"><span style={{ width: `${r.completion}%` }} /></span> {r.completion} %</td>
                  <td><StageBadge stage={r.stage} date={r.current?.session_date} /></td>
                  <td className="right">{needsAction(r.stage) || r.stage === 'questionnaire' ? <Link className="btn small" href={href(r)}>{t(`stage.next_${r.stage}`)}</Link> : <span className="muted small">{t('stage.next_shared')}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      <details className="how session-guide">
        <summary><Icon name="clipboard" />{t('coach.session_title')}</summary>
        <ol className="steps compact">{[1, 2, 3, 4, 5].map(n => <li key={n}><span className="stepnum">{n}</span><p>{t(`session.guide_${n}`)}</p></li>)}</ol>
      </details>
    </>
  );
}
