"""Extrait la banque de questions d'un export Fillout vers questions.json (seed)."""
import json, re, sys
src, out = sys.argv[1], sys.argv[2]
S = json.load(open(src))['template']['steps']
val = lambda o: (o or {}).get('logic', {}).get('value', '') if isinstance(o, dict) else ''
txt = lambda h: re.sub(r'<[^>]+>', ' ', h or '').strip()
qs, issues = [], []
for step in S.values():
    m = re.match(r'S(\d)\s*:\s*(.+)', step['name'])
    if not m: continue
    sec = int(m.group(1))
    ws = sorted(step['template']['widgets'].values(), key=lambda w: w['position'].get('row', 0))
    for w in ws:
        lab = val(w['template'].get('label'))
        q = re.match(r'\[(\d+\.\d+)\]\s*(.+)', lab, re.S)
        if w['type'] != 'MultipleChoice' or not q: continue
        opts = [val(o['label']) for o in w['template']['options']['staticOptions']]
        guide = txt(val(w['template'].get('caption')))
        qs.append({'concept_id': f"OCAT-OSC-{q.group(1)}", 'code': q.group(1), 'section': sec,
                   'order': len([x for x in qs if x['section'] == sec]) + 1,
                   'text_fr': q.group(2).strip(), 'guide_fr': guide or None, 'options_fr': opts})
codes = [q['code'] for q in qs]
dups = {c for c in codes if codes.count(c) > 1}
json.dump(qs, open(out, 'w'), ensure_ascii=False, indent=1)
print(len(qs), 'questions; doublons:', dups or 'aucun')
from collections import Counter; print(dict(sorted(Counter(q['section'] for q in qs).items())))
print('avec guide:', sum(1 for q in qs if q['guide_fr']))
print('options non standard:', [q['code'] for q in qs if len(q['options_fr']) != 4])
