"""폭탄 상황 표 — 폭탄을 쥐고 있던 순간마다, 조건 조합별로 사람이 낸 비율과 같은 순간 AI가 낼 비율.

  python3 scripts/tichu-model/situations_bomb.py <작업 폴더>

실제로 승부가 난 트릭만 센다(그 카드가 그대로 트릭을 먹었거나 내가 폭탄으로 덮은 경우).
바닥에 카드가 놓이자마자 세면, 다른 사람이 덮어서 폭탄이 필요 없던 순간까지 "안 냄"으로 잡힌다.
AI 쪽은 끼어들기 판단 또는 "내 차례가 왔다고 치면 폭탄을 고르는가"(근사값)다.
작업 폴더에 tichu_log.json 과 replay/all.jsonl 이 있어야 한다 (README 참고).
"""
import json, collections, sys
S=sys.argv[1]
rows=json.load(open(f'{S}/tichu_log.json'))
plays={}
for r in rows:
    if r['seat']==0 and r['plays']: plays[f"{r['u']}|{r['t'][:19]}|{r['r']}"]=r['plays']
L=[json.loads(l) for l in open(f'{S}/replay/all.jsonl')]
N={1:'아랭',22:'메모',20:'오딘',10:'라미'}; P={1:'aggressive',22:'tricky',20:'balanced',10:'wild'}
tp=[x for x in L if x['kind']=='top' and x['u']!=14]
def final(x):
    """이 카드가 그대로 트릭을 먹었거나(다른 사람이 안 덮음) 내가 폭탄으로 덮은 경우만"""
    pl=plays[x['k']]
    for j in range(x['i']+1,len(pl)):
        s,y=pl[j]
        if y[0]=='T' or y=='P': continue
        if y=='W' or y[0]=='G': return True
        return bool(x['bombed']) and s==0
    return True
cells={}
for x in tp:
    if not final(x): continue
    t=x['top']; ol=x['left'][t['seat']]; at=min(x['afterTurns']); u=x['u']
    owner='나' if t['seat']==0 else '파트너' if t['seat']==2 else '상대'
    fin='폭탄 내면 0~1턴에 나감' if at<=1 else '폭탄 내도 2턴 이상'
    if owner!='상대': name=f"{'내' if owner=='나' else '파트너'} 카드가 먹는 트릭 · {fin}"
    else:
        o='그 상대 2장 이하' if ol<=2 else '그 상대 3~5장' if ol<=5 else '그 상대 6장 이상'
        name=f"상대가 먹는 트릭 · {o} · {fin} · {'15점 이상' if x['pts']>=15 else '15점 미만'}"
    c=cells.setdefault(name,collections.Counter()); k=N.get(u,'기타'); a=P.get(u,'defensive')
    ai=bool(x['interrupt'].get(a) or x['turnBomb'].get(a))
    c['n']+=1; c['h']+=bool(x['bombed']); c['ai']+=ai; c['n_'+k]+=1; c['h_'+k]+=bool(x['bombed']); c['a_'+k]+=ai
    for p in ['aggressive','tricky','balanced','wild','defensive']:
        c['p_'+p]+=bool(x['interrupt'].get(p) or x['turnBomb'].get(p))
print(f"{'조건':56s}{'순간':>5s}{'사람':>6s}   아랭(사람/AI)   메모        오딘        라미     | AI 캐릭터별(같은 순간 전체): 아랭 메모 오딘 라미 이리")
for name in sorted(cells):
    c=cells[name]
    pp=lambda k: f"{c['h_'+k]}/{c['a_'+k]} ({c['n_'+k]})" if c['n_'+k] else '-'
    print(f"{name:56s}{c['n']:5d}{100*c['h']/c['n']:5.0f}%   {pp('아랭'):>12s} {pp('메모'):>10s} {pp('오딘'):>10s} {pp('라미'):>10s}   | "+' '.join(f"{100*c['p_'+p]/c['n']:4.0f}%" for p in ['aggressive','tricky','balanced','wild','defensive']))
