#!/usr/bin/env python3
"""티츄 플레이 기록(tichu_decision_log.plays) 분석.

SQL 리포트(scripts/tichu-decision-report.sql)는 선언·결과만 본다. 이 스크립트는 라운드의
플레이 순서를 되짚어 "AI가 어디서 새는가"를 센다. 손패(hand_14)에서 낸 카드를 빼 가며
각 시점의 손패를 복원한다.

  PSQL="/opt/homebrew/opt/libpq/bin/psql -h localhost -p 15432 -U claude_ro -d boardgameclub" \\
      python3 scripts/tichu-plays-analysis.py [--since 2026-09-22]

보는 것:
  1. 상대 싱글을 일반 카드로 이길 수 있었는데 패스한 비율 (싱글 주인 · 랭크대 · 자리별)
     → 2026-09-21에 "낱장 털기" 규칙을 넣기 전: 사람의 ≤10 싱글을 29% 통과시켰다
  2. AI가 두 장 남기고 선을 잡았을 때 높은 싱글을 먼저 내고 갇힌 횟수
     → 같은 날 고친 Q·A 리드 순서 실수. 배포 후에는 0에 가까워야 한다
  3. 트릭 획득 수와 패스율 (사람 / 파트너 AI / 상대 AI)
"""
import collections, json, os, shlex, subprocess, sys

since = sys.argv[sys.argv.index('--since') + 1] if '--since' in sys.argv else '2026-09-19'
psql = shlex.split(os.environ.get('PSQL', 'psql'))
sql = f"""select json_agg(json_build_object('u',user_id,'t',created_at,'r',round_number,'seat',seat,
  'st',seat_strategy,'h14',hand_14,'plays',plays) order by user_id, created_at, seat)
  from tichu_decision_log where target_score is not null and created_at >= '{since}'"""
rows = json.loads(subprocess.check_output(psql + ['-tA', '-c', sql]) or 'null') or []

def rank(c):
    return int(c.split('_')[1]) if '_' in c else {'mahjong': 1, 'dog': 0, 'phoenix': 14.5, 'dragon': 16}[c]
def name(c):
    if '_' not in c: return {'phoenix': '봉', 'dragon': '용', 'dog': '개', 'mahjong': '1'}[c]
    return {11: 'J', 12: 'Q', 13: 'K', 14: 'A'}.get(rank(c), str(rank(c)))
WHO = {0: '사람', 1: 'AI상대', 2: 'AI파트너', 3: 'AI상대'}

rounds = collections.defaultdict(dict)
for r in rows: rounds[(r['u'], r['t'][:19], r['r'])][r['seat']] = r

opp = collections.defaultdict(lambda: [0, 0])      # 이길 수 있었던 기회 → [패스, 전체]
tricks, passes, turns = collections.Counter(), collections.Counter(), collections.Counter()
two = collections.Counter(); stranded = []
n = 0
for key, rs in sorted(rounds.items()):
    if len(rs) < 4 or not rs[0]['plays']: continue
    n += 1
    hands = {s: set(rs[s]['h14']) for s in rs}
    top = top_seat = pending = None; single = False; led = True
    for seat, x in rs[0]['plays']:
        if x == 'W':
            tricks[WHO[seat]] += 1
            if pending:
                kept = seat == pending[0]
                two['선 유지' if kept else '잡혀서 갇힘'] += 1
                if not kept: stranded.append((key, rs[pending[0]]['st']) + pending[1:])
                pending = None
            top = None; led = True; continue
        if x[0] in 'GD': top = None; led = True; pending = None; continue
        if x[0] == 'T': continue
        turns[WHO[seat]] += 1
        if top is not None and single and seat % 2 != top_seat % 2 and seat != 0:
            if any('_' in c and rank(c) > top for c in hands[seat]):
                owner = '사람' if top_seat == 0 else 'AI'
                band = '≤10' if top <= 10 else 'J~K' if top <= 13 else 'A+'
                for k in ((owner, band), (owner, band, f'자리{seat}'), (owner, band, rs[seat]['st'])):
                    opp[k][1] += 1; opp[k][0] += x == 'P'
        if x == 'P': passes[WHO[seat]] += 1; continue
        cards = x.split(' ')
        if led and seat != 0 and len(hands[seat]) == 2 and len(cards) == 1:
            other = next(c for c in hands[seat] if c != cards[0])
            if rank(cards[0]) > rank(other) > 0: pending = (seat, name(cards[0]), name(other))
        for c in cards: hands[seat].discard(c)
        single = len(cards) == 1
        top = ((rank(cards[0]) if cards[0] != 'phoenix' else (top or 1) + 0.5) if single else 0)
        top_seat = seat; led = False

print(f'분석한 라운드: {n} (since {since})\n')
print('1. 일반 카드로 이길 수 있었던 기회 중 AI가 패스한 비율 (위에 놓인 싱글의 주인 / 랭크대 / 자리·성향)')
for k in sorted(opp, key=str):
    a, b = opp[k]; print(f"   {' / '.join(k):28} {a:4}/{b:<4} = {100 * a / b:3.0f}%")
print(f'\n2. AI가 두 장 남기고 높은 싱글을 먼저 낸 결과: {dict(two)}')
for s in stranded: print('   갇힘:', s)
print('\n3. 트릭 획득 / 패스율')
for w in ('사람', 'AI파트너', 'AI상대'):
    if turns[w]: print(f'   {w:6} 트릭 {tricks[w]:5}  차례 {turns[w]:5}  패스율 {100 * passes[w] / turns[w]:.0f}%')
