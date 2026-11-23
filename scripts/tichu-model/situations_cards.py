"""카드별 상황 표 — 사람이 그 카드를 **어떤 조건이 겹칠 때** 내는지, 같은 순간에 지금 AI 캐릭터는 어떤지.

  python3 scripts/tichu-model/situations_cards.py <작업 폴더>

용·봉황·A·개·큰 조합·패스를 조건 조합별로 센다(사람% / 그 캐릭터 AI% (순간 수)).
각 표 앞의 결정 트리는 사람의 선택을 가장 잘 가르는 조건을 찾아 본 것이다 — 칸을 나눌 기준을 고를 때 본다.
작업 폴더에 replay/all.jsonl 이 있어야 한다 (README 참고).
"""
import json, collections, sys
import numpy as np
from sklearn.tree import DecisionTreeClassifier, export_text
S=sys.argv[1]
L=[json.loads(l) for l in open(f'{S}/replay/all.jsonl') if '"kind":"turn"' in l[:20]]
N={1:'아랭',22:'메모',20:'오딘',10:'라미'}; P={1:'aggressive',22:'tricky',20:'balanced',10:'wild'}
ai_of=lambda u:P.get(u,'defensive')
# 소원 때문에 낸 것일 수 있는 수는 뺀다 (사람이 고른 게 아니다)
turns=[x for x in L if x['kind']=='turn' and x['u']!=14 and not x.get('wish',{}).get('forced')]
FN=['lead','hand','oppMin','partnerCards','partnerOut','topPartner','topRank','trickPts','meDecl','partnerDecl','oppDecl','turnsNow','pass','n','t_single','t_pair','t_triple','t_full_house','t_straight','t_stairs','t_four_bomb','t_straight_flush_bomb','rank','high','phoenix','dragon','mahjong','dTurns','turnsAfter','remaining','loose','winProb','exitAfter','pureAfter','aiScore','aiScoreRank','rankOrder','isLowest','isHighest']
FI={n:i for i,n in enumerate(FN)}
def g(c,name): return c['f'][FI[name]]
def rk(c): return int(c.split('_')[1]) if '_' in c else {'mahjong':1,'dog':0,'phoenix':15,'dragon':25}[c]
def table(title,recs,cellfn,order=None):
    cells={}
    for d in recs:
        name=cellfn(d)
        if name is None: continue
        c=cells.setdefault(name,collections.Counter()); k=N.get(d['u'],'기타')
        c['n']+=1; c['h']+=d['y']; c['ai']+=d['ai']; c['n_'+k]+=1; c['h_'+k]+=d['y']; c['a_'+k]+=d['ai']
    print(f"\n=== {title}  (사람%/그 캐릭터 AI% (순간 수))")
    print(f"{'조건':50s}{'순간':>5s}{'사람':>6s}{'AI':>6s}   {'아랭':>16s} {'메모':>15s} {'오딘':>15s} {'라미':>15s}")
    for name in (order or sorted(cells)):
        if name not in cells: continue
        c=cells[name]
        pp=lambda k: f"{100*c['h_'+k]/c['n_'+k]:.0f}%/{100*c['a_'+k]/c['n_'+k]:.0f}% ({c['n_'+k]})" if c['n_'+k] else '-'
        print(f"{name:50s}{c['n']:5d}{100*c['h']/c['n']:5.0f}%{100*c['ai']/c['n']:5.0f}%   {pp('아랭'):>16s} {pp('메모'):>15s} {pp('오딘'):>15s} {pp('라미'):>15s}")
def tree(recs,cols,depth=3,leaf=40):
    X=np.array([[d[c] for c in cols] for d in recs]); y=np.array([d['y'] for d in recs])
    t=DecisionTreeClassifier(max_depth=depth,min_samples_leaf=leaf,random_state=0).fit(X,y)
    print(export_text(t,feature_names=cols,show_weights=True))
def common(x):
    left=x['left']; out=set(x['out']); t=x['top']
    opps=[s for s in (1,3) if s not in out]
    d=dict(x=x,u=x['u'],pts=x['pts'],myLeft=left[0],handTurns=x['handTurns'],oppMin=min([left[s] for s in opps],default=99),partnerLeft=left[2],partnerOut=int(2 in out),
        meDecl=int(x['decl'][0]!=''),partnerDecl=int(x['decl'][2]!='' and 2 not in out),oppDecl=int(any(x['decl'][s]!='' and s not in out for s in (1,3))))
    if t: d.update(owner='파트너' if t['seat']==2 else '상대',opp=int(t['seat']!=2),topRank=t['rank'],ownerLeft=left[t['seat']],topType=t['type'])
    return d
# ---------- 봉황 낱장 (상대/파트너 낱장 위)
ph=[]
for x in turns:
    t=x['top']
    if not t or t['type']!='single' or 'phoenix' not in x['hand']: continue
    if not any(c['k']=='phoenix' for c in x['cands']): continue
    d=common(x); other=[c for c in x['cands'] if c['type']=='single' and c['k'] not in('phoenix','dragon')]
    d.update(hasOther=int(len(other)>0),hasDragon=int('dragon' in x['hand']),y=int(x['human']=='phoenix'),ai=int(x['picks'][ai_of(x['u'])]=='phoenix'))
    ph.append(d)
print('봉황 낱장 기회',len(ph)); tree([d for d in ph if d['opp']],['topRank','pts','myLeft','handTurns','ownerLeft','oppMin','hasOther','hasDragon','meDecl','oppDecl'])
def phcell(d):
    if d['owner']=='파트너': return '파트너 낱장 위'
    a='상대 낱장 A 이상' if d['topRank']>=14 else '상대 낱장 K' if d['topRank']>=13 else '상대 낱장 Q 이하'
    o='다른 낱장으로는 못 이김' if not d['hasOther'] else '다른 낱장으로도 이김'
    return f"{a} · {o} · {'3턴 이내' if d['handTurns']<=3 else '4턴 이상'}"
table('봉황을 낱장으로 냄',ph,phcell)
# ---------- A 낱장 (상대 낱장 위, A를 쥐고 있고 봉황/용 아닌 A가 후보)
ac=[]
for x in turns:
    t=x['top']
    if not t or t['type']!='single' or t['rank']>=14: continue
    aces=[c for c in x['cands'] if c['type']=='single' and c['rank']==14 and c['ids'] and '_' in c['ids'][0]]
    if not aces: continue
    d=common(x); lower=[c for c in x['cands'] if c['type']=='single' and c['rank']<14 and c['ids'] and '_' in c['ids'][0]]
    nA=sum(1 for c in x['hand'] if '_' in c and rk(c)==14)
    d.update(hasLower=int(len(lower)>0),nA=nA,aLoose=int(g(aces[0],'loose')),hasDragon=int('dragon' in x['hand']),
        y=int(x['human']=='14'),ai=int(x['picks'][ai_of(x['u'])]=='14'))
    ac.append(d)
print('A 낱장 기회',len(ac)); tree([d for d in ac if d['opp']],['topRank','pts','myLeft','handTurns','ownerLeft','oppMin','hasLower','nA','hasDragon','meDecl','oppDecl'])
def accell(d):
    if d['owner']=='파트너': return '파트너 낱장 위'
    a='상대 낱장 K' if d['topRank']>=13 else '상대 낱장 10~Q' if d['topRank']>=10 else '상대 낱장 9 이하'
    o='A보다 낮은 카드로는 못 이김' if not d['hasLower'] else '낮은 카드로도 이김'
    return f"{a} · {o} · {'3턴 이내' if d['handTurns']<=3 else '4턴 이상'}"
table('A를 낱장으로 냄',ac,accell)
# ---------- 개 (리드, 개를 쥠)
dg=[]
for x in turns:
    if x['top'] is not None or 'dog' not in x['hand'] or len(x['hand'])<2: continue
    d=common(x)
    d.update(y=int(x['humanIds']==['dog']),ai=int(x['picks'][ai_of(x['u'])]=='dog'),first=int(x['left'][0]>=13))
    dg.append(d)
print('개 리드 기회',len(dg)); tree(dg,['myLeft','handTurns','partnerLeft','oppMin','meDecl','partnerDecl','oppDecl','partnerOut'],leaf=25)
def dgcell(d):
    if d['partnerOut']: return '파트너가 이미 나감'
    a='내가 선언함' if d['meDecl'] else '파트너가 선언함' if d['partnerDecl'] else '선언 없음'
    b='내 손패 10장+' if d['myLeft']>=10 else '내 손패 5~9장' if d['myLeft']>=5 else '내 손패 4장 이하'
    return f"{a} · {b}"
table('개를 리드로 냄',dg,dgcell)
# ---------- 큰 조합 리드 (5장 이상 조합 후보가 있을 때)
bg=[]
for x in turns:
    if x['top'] is not None: continue
    big=[c for c in x['cands'] if c['ids'] and len(c['ids'])>=5 and c['type'] in('straight','full_house','stairs')]
    if not big: continue
    d=common(x); hk=x['human']; ak=x['picks'][ai_of(x['u'])]
    bk={c['k'] for c in big}
    d.update(y=int(hk in bk),ai=int(ak in bk),nLoose=sum(1 for c in x['cands'] if c['type']=='single' and g(c,'loose')==1 and c['rank']<=10))
    bg.append(d)
print('큰 조합 리드 기회',len(bg)); tree(bg,['myLeft','handTurns','partnerLeft','oppMin','meDecl','partnerDecl','oppDecl','nLoose'])
def bgcell(d):
    a='손패 12장+' if d['myLeft']>=12 else '손패 9~11장' if d['myLeft']>=9 else '손패 8장 이하'
    b='낮은 낱장 없음' if d['nLoose']==0 else '낮은 낱장 1~2장' if d['nLoose']<=2 else '낮은 낱장 3장+'
    return f"{a} · {b}"
table('5장 이상 조합을 리드로 냄',bg,bgcell)
# ---------- 패스 (상대 카드 위, 폭탄 아닌 카드로 이길 수 있을 때)
ps=[]
for x in turns:
    t=x['top']
    if not t: continue
    beat=[c for c in x['cands'] if c['ids'] and c['type'] not in('four_bomb','straight_flush_bomb')]
    if not beat: continue
    d=common(x)
    cheap=min(beat,key=lambda c:(c['rank'],len(c['ids'])))
    d.update(cheapRank=cheap['rank'],cheapCost=g(cheap,'dTurns'),cheapLoose=int(g(cheap,'loose')),cheapHigh=int(cheap['type']=='single' and (cheap['rank']>=14)),
        topSingle=int(t['type']=='single'),y=int(x['human']=='P'),ai=int(x['picks'][ai_of(x['u'])]=='P'))
    ps.append(d)
print('패스 기회(이길 수 있는데)',len(ps)); tree([d for d in ps if d['opp']],['topSingle','topRank','pts','myLeft','handTurns','ownerLeft','oppMin','partnerLeft','cheapRank','cheapCost','cheapLoose','cheapHigh','meDecl','oppDecl','partnerDecl'],depth=4,leaf=60)
def pscell(d):
    if d['owner']=='파트너':
        return f"파트너 카드 위 · {'파트너 카드 9 이하' if d['topRank']<=9 else '파트너 카드 10~K' if d['topRank']<=13 else '파트너 카드 A 이상'} · {'내가 선언함' if d['meDecl'] else '선언 안 함'}"
    c='가장 싼 수가 A·용·봉' if d['cheapHigh'] or d['cheapRank']>=14 else '가장 싼 수가 조합을 깸' if d['cheapCost']>0 else '가장 싼 수가 공짜(남는 카드)'
    return f"상대 {'낱장' if d['topSingle'] else '조합'} 위 · {c} · {'4턴 이상' if d['handTurns']>=4 else '3턴 이내'}"
table('이길 수 있는데 패스함',ps,pscell)

# ---------- 용 (상대/파트너 낱장 위에서 용을 쥐고 있을 때)
dr=[]
for x in turns:
    t=x['top']
    if not t or t['type']!='single' or not any(c['k']=='dragon' for c in x['cands']): continue
    d=common(x); other=[c for c in x['cands'] if c['type']=='single' and c['k']!='dragon']
    d.update(hasOther=int(len(other)>0),y=int(x['human']=='dragon'),ai=int(x['picks'][ai_of(x['u'])]=='dragon'))
    dr.append(d)
def drcell(d):
    if d['owner']=='파트너': return '파트너 낱장 위'
    a='상대 낱장 A 이상' if d['topRank']>=14 else '상대 낱장 K 이하'
    o='용 말고는 못 이김' if not d['hasOther'] else '다른 카드로도 이김'
    return f"{a} · {o} · {'3턴 이내' if d['handTurns']<=3 else '4턴 이상'}"
table('용을 냄',dr,drcell)
