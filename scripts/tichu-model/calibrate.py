"""캐릭터별 상황 보정 — "같은 상황에서 모델이 예상한 것보다 이 사람이 얼마나 더/덜 냈는가".
학습에 안 쓴 판으로 낸 예측(교차 검증)과 실제를 비교해, 그 차이만큼만 점수를 옮긴다."""
import json, sys, math, hashlib, collections, itertools
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
S=sys.argv[1]
L=[json.loads(l) for l in open(f'{S}/replay/all.jsonl') if l.startswith('{"kind":"turn"')]
N={1:'아랭',22:'메모',20:'오딘',10:'라미'}; P={1:'aggressive',22:'tricky',20:'balanced',10:'wild'}; PERS={1:0,22:1,20:2,10:3}
PRE=['aggressive','tricky','balanced','wild']
T=[x for x in L if x['kind']=='turn' and x['u']!=14 and len(x['cands'])>=2 and not x.get('wish',{}).get('forced')]  # 소원 때문일 수 있는 수는 뺀다
for x in T: x['hi']=next((i for i,c in enumerate(x['cands']) if c['k']==x['human']),-1)
T=[x for x in T if x['hi']>=0]
rows=[];ys=[];dec=[];ci=[]
for di,x in enumerate(T):
    per=[0,0,0,0]
    if x['u'] in PERS: per[PERS[x['u']]]=1
    for i,c in enumerate(x['cands']): rows.append(c['f']+per); ys.append(int(i==x['hi'])); dec.append(di); ci.append(i)
X=np.array(rows,dtype=float); y=np.array(ys); dec=np.array(dec)
fold=np.array([int(hashlib.md5(T[d]['k'].encode()).hexdigest(),16)%5 for d in dec])
oof=np.zeros(len(y))
for f in range(5):
    tr=fold!=f; te=fold==f
    m=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.05,max_depth=7,min_samples_leaf=30,l2_regularization=1.0,early_stopping=False,random_state=0).fit(X[tr],y[tr])
    oof[te]=m.decision_function(X[te])
for x in T: x['oof']=[0.0]*len(x['cands'])
for r in range(len(y)): T[dec[r]]['oof'][ci[r]]=float(oof[r])
sig=lambda v:1/(1+math.exp(-v))
TAGS=['passFree_near','passFree_far','passBreak_near','passBreak_far','passHigh_near','passHigh_far','dragonLowOnly_near','dragonLowOnly_far','dragonLowSpare','dragonAce_near','dragonAce_far','aceOnly_near','aceOnly_far','aceSpare','phoenixAce_far','passPartner','bigLead']
K=20; ZMIN=2.0
out={}
def pick(x,p,w):
    sc=x['sc'][p]; best=-1; bs=-1e18
    for i in range(len(sc)):
        t=x['tags'][i]; s=sc[i]+(w.get(t,0) if t else 0)
        if s>bs: bs=s; best=i
    return best
for p in PRE:
    u=[k for k,v in P.items() if v==p][0]; d=[x for x in T if x['u']==u]; w={}
    print(f"== {N[u]} ({p})")
    for t in TAGS:
        # bigLead 는 한 순간에 후보가 여럿 — 태그 붙은 후보들 중 최고점 하나로 본다
        ss=[];hh=[]
        for x in d:
            idx=[i for i,tg in enumerate(x['tags']) if tg==t]
            if not idx: continue
            ss.append([x['oof'][i] for i in idx]); hh.append(int(x['tags'][x['hi']]==t))
        n=len(ss)
        if n<20: continue
        pr=lambda g,w_=0.0: min(0.999,sum(sig(v+w_) for v in g))     # 태그 붙은 후보 중 하나를 고를 확률
        h=sum(hh); E=sum(pr(g) for g in ss); V=sum(pr(g)*(1-pr(g)) for g in ss)
        z=(h-E)/math.sqrt(max(V,1e-9))
        if abs(z)<ZMIN: continue
        # 표본이 적으면 0 쪽으로 당긴다: 목표 = 예상에 n/(n+K) 만큼만 다가간 값
        target=E+(h-E)*n/(n+K)
        lo,hi=-4.0,4.0
        for _ in range(40):
            mid=(lo+hi)/2
            if sum(pr(g,mid) for g in ss)<target: lo=mid
            else: hi=mid
        w[t]=round((lo+hi)/2,2)
        before=sum(1 for x in d if t in x['tags'] and x['tags'][pick(x,p,{})]==t)/n
        after=sum(1 for x in d if t in x['tags'] and x['tags'][pick(x,p,w)]==t)/n
        print(f"   {t:20s} n={n:4d} 사람 {100*h/n:5.1f}%  모델 예상 {100*E/n:5.1f}% (z={z:+.1f})  w={w[t]:+.2f} | 캐릭터가 고르는 비율 {100*before:5.1f}% → {100*after:5.1f}%")
    out[p]=w
    a0=sum(1 for x in d if pick(x,p,{})==x['hi'])/len(d); a1=sum(1 for x in d if pick(x,p,w)==x['hi'])/len(d)
    print(f"   사람과 같은 수(학습 자료 안) {100*a0:.1f}% → {100*a1:.1f}%")
json.dump(out,open(f'{S}/situation_bias.json','w'),indent=1)
print('\n// TS')
for p in PRE: print(f"\t{p}: {{ "+', '.join(f"{t}: {v}" for t,v in out[p].items())+" },")
allw=dict(out); allw['defensive']={}
ps=PRE+['defensive']
print('캐릭터끼리 같은 수(%):',' | '.join(f"{a[:3]}-{b[:3]} {100*sum(1 for x in T if pick(x,a,allw[a])==pick(x,b,allw[b]))/len(T):.1f}" for a,b in itertools.combinations(ps,2)))
# 교차 검증 예측의 사람별 일치율 (참고)
ok=collections.Counter(); nn=collections.Counter()
for x in T:
    k=N.get(x['u'],'기타'); b=max(range(len(x['oof'])),key=lambda i:x['oof'][i]); ok[k]+=(b==x['hi']); nn[k]+=1
print('안 본 판 일치:',' '.join(f"{k} {100*ok[k]/nn[k]:.1f}%" for k in ['아랭','메모','오딘','라미','기타']), '전체', f"{100*sum(ok.values())/sum(nn.values()):.1f}%")
