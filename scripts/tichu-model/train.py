"""사람 기록으로 수 선택 모델 학습 → humanModel.json 형식으로 내보내기.

  python3 scripts/tichu-model/train.py <작업 폴더> --cv                    교차 검증만
  python3 scripts/tichu-model/train.py <작업 폴더> src/lib/games/tichu/ai/humanModel.json

작업 폴더에 replay/all.jsonl 이 있어야 한다 (README 참고)."""
import json, sys, hashlib, collections
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
S=sys.argv[1]; OUT=next((a for a in sys.argv[2:] if not a.startswith('--')),None)
L=[json.loads(l) for l in open(f'{S}/replay/all.jsonl')]
FN=next(x for x in L if x['kind']=='meta')['features']
PERS={1:0,22:1,20:2,10:3}; PN=['u_arang','u_memo','u_odin','u_rami']
ALL=[x for x in L if x['kind']=='turn' and x['u']!=14 and len(x['cands'])>=2]
# 소원 때문에 낸 것일 수 있는 수는 뺀다 — 사람이 고른 게 아니라서, 넣으면 "참새 위에는 A"처럼 엉뚱한 습관을 배운다
forced=lambda x: bool(x.get('wish',{}).get('forced'))
T=ALL if '--with-wish' in sys.argv else [x for x in ALL if not forced(x)]
print('고를 게 있던 판단',len(ALL),'· 소원일 수 있어 뺀 판단',sum(forced(x) for x in ALL))
rows=[];ys=[];dec=[];grp=[]
for di,x in enumerate(T):
    hi=next((i for i,c in enumerate(x['cands']) if c['k']==x['human']),-1)
    if hi<0: continue
    per=[0,0,0,0]
    if x['u'] in PERS: per[PERS[x['u']]]=1
    for i,c in enumerate(x['cands']):
        rows.append(c['f']+per); ys.append(int(i==hi)); dec.append(di); grp.append(x['k'])
X=np.array(rows,dtype=float); y=np.array(ys); dec=np.array(dec)
print('판단',len(set(dec)),'후보 행',len(y),'특징',X.shape[1], '라운드',len(set(grp)))
fold=np.array([int(hashlib.md5(g.encode()).hexdigest(),16)%5 for g in grp])
def top1(pred,mask=None):
    best={}
    for i in range(len(y)):
        if mask is not None and not mask[i]: continue
        d=dec[i]
        if d not in best or pred[i]>best[d][0]: best[d]=(pred[i],y[i])
    ok=collections.Counter(); n=collections.Counter()
    for d,(p_,yy) in best.items():
        k={1:'아랭',22:'메모',20:'오딘',10:'라미'}.get(T[d]['u'],'기타'); ok[k]+=yy; n[k]+=1; ok['전체']+=yy; n['전체']+=1
    return ' '.join(f"{k} {100*ok[k]/n[k]:.1f}%" for k in ['전체','아랭','메모','오딘','라미'])
def make(iters,depth,lr,leaf=20,leaves=31):
    return HistGradientBoostingClassifier(max_iter=iters,learning_rate=lr,max_depth=depth,max_leaf_nodes=leaves,min_samples_leaf=leaf,l2_regularization=1.0,early_stopping=False,random_state=0)
def cv(cols,**kw):
    pred=np.zeros(len(y))
    for f in range(5):
        tr=fold!=f; te=fold==f
        m=make(**kw).fit(X[tr][:,cols],y[tr]); pred[te]=m.predict_proba(X[te][:,cols])[:,1]
    return pred
allc=list(range(X.shape[1])); oldc=[i for i in range(X.shape[1]) if i<44 or i>=len(FN)]
if '--cv' in sys.argv:
    print('기존 특징      ',top1(cv(oldc,iters=300,depth=6,lr=0.06)))
    for kw in [dict(iters=300,depth=6,lr=0.06),dict(iters=200,depth=5,lr=0.08),dict(iters=400,depth=6,lr=0.04),dict(iters=300,depth=7,lr=0.05,leaf=30),dict(iters=250,depth=6,lr=0.06,leaf=40,leaves=24)]:
        print(kw, top1(cv(allc,**kw)))
if OUT:
    kw=dict(iters=300,depth=7,lr=0.05,leaf=30)
    m=make(**kw).fit(X,y)
    base=float(m._baseline_prediction.ravel()[0])
    trees=[]
    for it in m._predictors:
        nodes=it[0].nodes; t=[]
        for nd in nodes:
            if nd['is_leaf']: t.append([-1,round(float(nd['value']),6)])
            else: t.append([int(nd['feature_idx']),float(nd['num_threshold']),int(nd['left']),int(nd['right'])])
        trees.append(t)
    model={'features':FN+PN,'baseline':base,'trees':trees}
    # 내보낸 트리로 다시 계산해 sklearn과 같은지 확인
    def score(f):
        s=base
        for t in trees:
            n=0
            while t[n][0]>=0: n=t[n][2] if f[t[n][0]]<=t[n][1] else t[n][3]
            s+=t[n][1]
        return s
    raw=m.decision_function(X[:300]); mine=np.array([score(X[i]) for i in range(300)])
    print('내보내기 오차(최대):',float(np.abs(raw-mine).max()))
    json.dump(model,open(OUT,'w'),separators=(',',':'))
    import os; print('트리',len(trees),'노드',sum(len(t) for t in trees),'파일',os.path.getsize(OUT)//1024,'KB')
    print('학습 자료 안에서 일치:',top1(m.predict_proba(X)[:,1]))
    imp=collections.Counter()
    for t in trees:
        for nd in t:
            if nd[0]>=0: imp[(FN+PN)[nd[0]]]+=1
    print('많이 쓰인 특징:',imp.most_common(25))
