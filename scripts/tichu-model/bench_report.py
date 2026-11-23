"""시뮬레이션 결과 정리.

  python3 scripts/tichu-model/bench_report.py parity <결과 폴더>   캐릭터끼리 실력·행동 비교 (characterBench)
  python3 scripts/tichu-model/bench_report.py ab <결과 폴더>       새 팀 − 예전 팀 (characterBench AB=1: 모델 비교, LOGIC_AB=1: 끝내기 계산 켬/끔)
  python3 scripts/tichu-model/bench_report.py stop <결과 폴더>     티츄 저지 전술별 선언 성공률 (tichuStopBench)

결과 폴더: 프로세스마다 OUT 으로 남긴 *.json 을 모아 둔 곳.
오차는 패 묶음 단위로 낸 95% 구간이다 — 라운드 단위로 내면 같은 묶음 안의 상관 때문에 너무 좁게 나온다.
"""
import json, glob, math, sys
mode, folder = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(f'{folder}/*.json'))
names = {'aggressive': '아랭', 'tricky': '메모', 'balanced': '오딘', 'wild': '라미', 'defensive': '이리'}
def ci(x):
    if len(x) < 2: return ''
    mu = sum(x) / len(x); sd = math.sqrt(sum((v - mu) ** 2 for v in x) / (len(x) - 1))
    return f"{mu:+.1f} ±{1.96 * sd / math.sqrt(len(x)):.1f}"
pct = lambda a, b: f"{100 * a / b:.1f}%" if b else '-'

if mode == 'parity':
    tot = {p: {} for p in names}; per = []; rounds = 0
    for f in files:
        d = json.load(open(f)); rounds += d['totalRounds']; per += d['perSet']
        for p, s in d['stats'].items():
            for k, v in s.items(): tot[p][k] = tot[p].get(k, 0) + v
    devs = {p: [] for p in names}
    for s in per:
        m = {p: s[p]['diff'] / max(1, s[p]['rounds']) for p in names}; avg = sum(m.values()) / 5
        for p in names: devs[p].append(m[p] - avg)
    def row(label, f): print(f"{label:16s}" + ''.join(f"{f(p):>16s}" for p in names))
    print(f"{rounds}라운드, 패 묶음 {len(per)}개")
    row('', lambda p: names[p])
    row('점수차/R(평균 대비)', lambda p: ci(devs[p]))
    row('게임 승률', lambda p: pct(tot[p]['wins'], tot[p]['games']))
    row('1등', lambda p: pct(tot[p]['first'], tot[p]['rounds']))
    row('그랜드(성공)', lambda p: f"{pct(tot[p]['gt'], tot[p]['rounds'])}({pct(tot[p]['gtOk'], tot[p]['gt'])})")
    row('스몰(성공)', lambda p: f"{pct(tot[p]['st'], tot[p]['rounds'])}({pct(tot[p]['stOk'], tot[p]['st'])})")
    row('상대 위 패스', lambda p: pct(tot[p]['oppChoicePass'], tot[p]['oppChoice']))
    row('파트너 위 패스', lambda p: pct(tot[p]['partnerChoicePass'], tot[p]['partnerChoice']))
    row('9장+ 큰 리드', lambda p: pct(tot[p]['bigHandBigLead'], tot[p]['bigHandLeads']))
    row('받을 때 A·용·봉', lambda p: pct(tot[p]['followHigh'], tot[p]['followSingles']))
    row('폭탄/100R', lambda p: f"{100 * tot[p]['bombs'] / tot[p]['rounds']:.1f}")
    row('내 카드 위 폭탄', lambda p: str(tot[p]['ownBomb']))
    row('개/100R', lambda p: f"{100 * tot[p]['dog'] / tot[p]['rounds']:.1f}")
elif mode == 'ab':
    sets = []; rounds = diff = games = wins = 0; logic = {}
    for f in files:
        d = json.load(open(f))
        a = d['ab']; rounds += a['rounds']; diff += a['diff']; games += a['games']; wins += a['wins']; sets += a['perSet']
        for k, v in d.get('logic', {}).items(): logic[k] = logic.get(k, 0) + v
    m = [s['diff'] / s['rounds'] for s in sets]
    print(f"새 팀 − 예전 팀: 라운드당 {ci(m)}점 ({len(m)}묶음, {rounds}라운드)")
    print(f"새 팀 게임 승률 {pct(wins, games)} ({wins}/{games}), 묶음 부호 +{sum(1 for v in m if v > 0)}/−{sum(1 for v in m if v < 0)}")
    if logic.get('twoLeft') or logic.get('sure'):
        # 끝내기 계산이 실제로 끼어든 횟수 (켠 팀의 판단만 센다)
        r = rounds
        print(f"둘만 남았을 때 계산: {logic['twoLeft']}번 ({logic['twoLeft'] / r:.2f}번/라운드), 그중 모델의 수를 바꿈 {logic['twoLeftChanged']}번 "
              f"({pct(logic['twoLeftChanged'], logic['twoLeft'])}), 바꿔서 얻은 점수 합 {logic['twoLeftGain']} · 계산량 초과로 포기 {logic['twoLeftBudget']}번")
        print(f"확실한 마무리: {logic['sure']}번 ({logic['sure'] / r:.2f}번/라운드), 그중 모델의 수를 바꿈 {logic['sureChanged']}번 ({pct(logic['sureChanged'], logic['sure'])})")
elif mode == 'stop':
    acc = {}; per = []
    for f in files:
        d = json.load(open(f)); per += d['perSet']
        for k, a in d['acc'].items():
            t = acc.setdefault(k, {})
            for kk, v in a.items(): t[kk] = t.get(kk, 0) + v
    off = acc['off']
    print(f"묶음 {len(per)}개 | 기준: {off['rounds']}라운드, 선언 {off['decl']} (그랜드 {off['gt']} / 스몰 {off['st']})")
    print(f"{'전술':24s}{'선언 성공':>9s}{'그랜드':>8s}{'스몰':>8s}{'성공률 차이':>14s}{'부른 팀 점수차/R':>16s}{'점수 차이':>12s}")
    for k, a in acc.items():
        ds = [100 * (s[k]['ok'] / s[k]['decl'] - s['off']['ok'] / s['off']['decl']) for s in per if s[k]['decl'] and s['off']['decl']]
        dd = [s[k]['diff'] / s[k]['rounds'] - s['off']['diff'] / s['off']['rounds'] for s in per if s[k]['rounds'] and s['off']['rounds']]
        print(f"{k:24s}{pct(a['ok'], a['decl']):>9s}{pct(a['gtOk'], a['gt']):>8s}{pct(a['stOk'], a['st']):>8s}{(ci(ds) if k != 'off' else ''):>14s}{a['diff'] / a['rounds']:16.1f}{(ci(dd) if k != 'off' else ''):>12s}")
