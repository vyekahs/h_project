<script lang="ts">
    import type { PageData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    let { data }: { data: PageData } = $props();

    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    function mdLabel(iso: string) {
        if (!iso) return '';
        const [, m, d] = iso.split('-');
        return `${Number(m)}/${Number(d)}`;
    }
    function dowLabel(iso: string) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-').map(Number);
        return DOW[new Date(y, m - 1, d).getDay()];
    }
    function formatDuration(mins: number): string {
        const n = Math.round(Number(mins) || 0);
        if (n <= 0) return '기록 없음';
        if (n < 60) return `${n}분`;
        const h = Math.floor(n / 60);
        const m = n % 60;
        return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
    }

    const s = $derived(data.summary);
    const w = $derived(data.window);
    /* 하루 평균은 문 연 날로 나눈다 — 닫은 날까지 나누면 실제보다 낮아진다 */
    const perOpenDay = $derived(
        w.openDays > 0 ? Math.round((s.windowVisits / w.openDays) * 10) / 10 : 0
    );
    const topHours = $derived(data.hourly.filter((h) => h.avg > 0).slice(0, 3));
    const busiestDow = $derived(
        [...data.byDow].sort((a, b) => b.avg - a.avg)[0] ?? { dow: 0, avg: 0, count: 0 }
    );
    const hasData = $derived(w.openDays > 0);

    const maxGame = $derived(Math.max(...data.popularGames.map((g) => g.n), 1));
    const maxVisitor = $derived(Math.max(...data.topVisitors.map((v) => v.n), 1));
    const minVisitor = $derived(Math.min(...data.topVisitors.map((v) => v.n), Infinity));
    /* 전원이 같은 값이면 막대는 서열을 그리는 척만 한다 */
    const visitorBarsUseful = $derived(data.topVisitors.length > 1 && maxVisitor !== minVisitor);

    let showTopVisitors = $state(false);
    $effect(() => {
        if (!showTopVisitors) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    });
</script>

<svelte:head><title>통계 · 어드민</title></svelte:head>

<div class="stats-page">
    <header class="page-head">
        <h1>통계</h1>
        <p class="window-note">
            <span class="window-range">{mdLabel(w.from)} – {mdLabel(w.to)}</span>
            최근 {w.days}일 · 문 연 날 {w.openDays}일
        </p>
    </header>

    {#if data.loadError}
        <p class="load-error">
            통계를 불러오지 못했습니다. 새로고침해 주세요 — 계속 실패하면 데이터베이스 상태를 확인해야 합니다.
        </p>
    {/if}

    <!--
        차트를 걷어내고 문장으로 바꿨다. 24칸 막대가 실제로 주던 정보량은
        「저녁에 사람이 있다」 한 줄이었고, 그걸 그리느라 축척이 최댓값에서
        무너져(100% 막대가 76% 막대보다 짧게 렌더) 캡션과 반대를 그리고 있었다.
        문장은 축척이 없으므로 그 오류가 존재할 자리가 없다.

        「지금 방에 N명」도 뺐다 — 실시간은 어드민 메인의 일이고, 두 화면이
        같은 것을 각자 세면 언젠가 서로 다른 수를 말한다.
    -->
    <section class="findings" aria-labelledby="sec-pattern">
        <h2 id="sec-pattern">방의 패턴</h2>
        {#if !hasData}
            <p class="empty">최근 {w.days}일 동안 기록된 방문이 없습니다.</p>
        {:else}
            <ul class="fact-list">
                <li>
                    <span class="fact">{w.days}일 중 <b>{w.openDays}일</b> 문을 열었고, 문 연 날 하루 평균 <b>{perOpenDay}명</b>이 왔습니다.</span>
                    <span class="fact-sub">이 기간 방문 합계 {s.windowVisits}회 (한 사람이 하루에 두 번 와도 1회)</span>
                </li>
                {#if s.peakDay}
                    <li>
                        <span class="fact">가장 붐빈 날은 <b>{mdLabel(s.peakDay)}({dowLabel(s.peakDay)})</b>, <b>{s.peakDayCount}명</b>이 왔습니다.</span>
                    </li>
                {/if}
                {#if topHours.length > 0}
                    <li>
                        <span class="fact">가장 붐비는 시간은 <b>{topHours[0].hour}시</b>입니다 — 문 연 날 평균 <b>{topHours[0].avg}명</b>이 방에 있었습니다.</span>
                        {#if topHours.length > 1}
                            <span class="fact-sub">
                                그다음은 {#each topHours.slice(1) as h, i}{i > 0 ? ' · ' : ''}{h.hour}시 {h.avg}명{/each}
                            </span>
                        {/if}
                    </li>
                {/if}
                <li>
                    {#if s.staySamples > 0}
                        <span class="fact">한 번 오면 평균 <b>{formatDuration(s.avgStay)}</b> 머뭅니다.</span>
                        <span class="fact-sub">퇴장까지 기록된 {s.staySamples}회 기준 · 한 방문당 최대 {w.maxStayHours}시간으로 잘라 계산</span>
                    {:else}
                        <span class="fact">체류 시간은 아직 잴 수 없습니다.</span>
                        <span class="fact-sub">퇴장까지 기록된 방문이 없습니다</span>
                    {/if}
                </li>
                <li>
                    <!--
                        표본이 얇을 때 「화요일이 붐빈다」고 말하면 거짓말이다.
                        문 연 날이 충분히 쌓이기 전에는 그 사실 자체를 말한다.
                    -->
                    {#if w.dowReady && busiestDow.avg > 0}
                        <span class="fact">요일로는 <b>{DOW[busiestDow.dow]}요일</b>이 가장 붐빕니다 — 그 요일 문 연 날 평균 {busiestDow.avg}명.</span>
                    {:else}
                        <span class="fact">요일 패턴은 아직 말하기 이릅니다.</span>
                        <span class="fact-sub">문 연 날이 {w.openDays}일뿐입니다 — 요일별로 나누기에 부족합니다</span>
                    {/if}
                </li>
            </ul>
        {/if}
    </section>

    <!--
        40명짜리 동아리에서 운영을 바꾸는 건 평균이 아니라 이름이다.
        이 섹션만 「그래서 무엇을 하면 되나」에 답한다.
    -->
    <section class="findings" aria-labelledby="sec-people">
        <h2 id="sec-people">챙길 사람</h2>

        <div class="people-group">
            <h3>뜸해진 사람</h3>
            {#if data.lapsed.length === 0}
                <p class="empty-inline">최근 {w.days}일 안에 안 온 회원이 없습니다.</p>
            {:else}
                <ul class="name-list">
                    {#each data.lapsed as p (p.name + p.meta)}
                        <li>
                            <span class="name">{p.name}</span>
                            <span class="name-meta">마지막 {mdLabel(p.meta ?? '')} · {p.n}일 전</span>
                        </li>
                    {/each}
                </ul>
                <p class="group-note">전에는 왔는데 최근 {w.days}일 동안 한 번도 안 온 회원입니다. 최근에 끊긴 순서.</p>
            {/if}
        </div>

        <div class="people-group">
            <h3>정기권 만료 임박</h3>
            {#if data.expiring.length === 0}
                <p class="empty-inline">{w.expirySoonDays}일 안에 만료되는 정기권이 없습니다.</p>
            {:else}
                <ul class="name-list">
                    {#each data.expiring as p (p.name + p.meta)}
                        <li>
                            <span class="name">{p.name}</span>
                            <span class="name-meta">{mdLabel(p.meta ?? '')} 만료 · {p.n}일 남음</span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </section>

    <section class="findings" aria-labelledby="sec-games">
        <h2 id="sec-games">많이 나온 게임</h2>
        {#if data.popularGames.length === 0}
            <p class="empty">이 기간에 진행된 게임이 없습니다.</p>
        {:else}
            <!-- 서수를 붙이지 않는다. 판수가 곧 서열이고, 동점일 때 서수는
                 없는 순위를 약속한다(전에는 가나다순이 「1위」였다). -->
            <ul class="rank-list">
                {#each data.popularGames as game (game.name)}
                    <li class="rank-item">
                        <span class="rank-name">{game.name}</span>
                        <span class="rank-count">{game.n}판</span>
                        <span class="rank-track" aria-hidden="true">
                            <span class="rank-fill" style="width: {(game.n / maxGame) * 100}%"></span>
                        </span>
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    <section class="ledger" aria-labelledby="sec-ledger">
        <h2 id="sec-ledger">그 밖의 숫자</h2>
        <dl>
            <div>
                <dt>활성 유저</dt>
                <dd>{s.activeUsers} / {s.totalMembers}명</dd>
                <p>전체 회원 {s.totalMembers}명 중, 최근 {w.days}일에 2일 이상 온 사람 (운영진·블랙 제외)</p>
            </div>
            <div>
                <dt>정기권 보유</dt>
                <dd>{s.seasonPassUsers}명</dd>
                <p>지금 유효한 정기권</p>
            </div>
            <div>
                <dt>누적 방문</dt>
                <dd>{s.totalVisitsAllTime}회</dd>
                <p>전체 기간 · 한 사람이 하루에 두 번 와도 1회</p>
            </div>
        </dl>
        <button type="button" class="btn-drilldown" onclick={() => (showTopVisitors = true)}>
            많이 온 사람 Top 10 보기
        </button>
    </section>
</div>

{#if showTopVisitors}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={() => (showTopVisitors = false)} role="presentation">
        <div
            class="modal-content"
            use:trapFocus={() => (showTopVisitors = false)}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="dlg-visitors" tabindex="-1"
        >
            <div class="modal-head">
                <h3 id="dlg-visitors">많이 온 사람 Top 10</h3>
                <button type="button" class="modal-close" aria-label="닫기" onclick={() => (showTopVisitors = false)}>
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <p class="modal-sub">최근 {w.days}일 방문 일수 기준</p>
            {#if data.topVisitors.length === 0}
                <p class="empty">이 기간에 기록된 방문이 없습니다.</p>
            {:else}
                <ul class="rank-list">
                    {#each data.topVisitors as v (v.name)}
                        <li class="rank-item">
                            <span class="rank-name">{v.name}</span>
                            <span class="rank-count">{v.n}일</span>
                            {#if visitorBarsUseful}
                                <span class="rank-track" aria-hidden="true">
                                    <span class="rank-fill" style="width: {(v.n / maxVisitor) * 100}%"></span>
                                </span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
{/if}

<style>
    .stats-page { max-width: 60rem; }
    .page-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-5);
    }
    .page-head h1 { margin: 0; font-size: var(--text-xl); }
    /* 기간은 여기서 한 번만 말한다 — 예전에는 「최근 28일」이 한 화면에 열 번 있었다 */
    .window-note { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); }
    .window-range {
        font-variant-numeric: var(--numeric);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
    }
    /* SSR 로 이미 DOM 에 있는 문구에 role="status" 를 걸면 스크린리더가 읽지 않는다 */
    .load-error {
        margin: 0 0 var(--space-5);
        padding: var(--space-4);
        border: 1px solid var(--color-orange-text);
        border-radius: var(--radius-control);
        background: var(--color-warning-bg);
        color: var(--color-orange-text);
        font-size: var(--text-sm);
    }

    .findings {
        margin-bottom: var(--space-6);
        padding: var(--space-5);
        background: var(--bg-primary);
        /* 경계는 하나로만 — 테두리 아래 그림자를 겹치면 유령 카드가 된다 */
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
    }
    .findings h2 { margin: 0 0 var(--space-4); font-size: var(--text-lg); }

    .fact-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    .fact-list li {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding-left: var(--space-3);
        border-left: 1px solid var(--border-default);
    }
    /*
        문장이 데이터다. 숫자만 굵게 세워 훑을 때 눈이 걸리게 하고,
        문장 자체는 본문 크기를 지킨다 — 40px 숫자 하나가 답이던 화면이 아니다.
    */
    .fact {
        font-size: var(--text-base);
        line-height: 1.55;
        color: var(--text-primary);
        /* 한국어는 기본 줄바꿈이 글자 단위다 — 「평 / 균」으로 쪼개진다.
           화면이 전부 문장이 된 이상 이건 본문 조판 문제다. */
        word-break: keep-all;
    }
    .fact b {
        font-weight: var(--weight-bold);
        font-variant-numeric: var(--numeric);
    }
    .fact-sub {
        font-size: var(--text-xs);
        line-height: 1.5;
        color: var(--text-secondary);
        font-variant-numeric: var(--numeric);
        word-break: keep-all;
    }

    .people-group + .people-group {
        margin-top: var(--space-5);
        padding-top: var(--space-5);
        border-top: 1px solid var(--border-light);
    }
    .people-group h3 {
        margin: 0 0 var(--space-3);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
    }
    .name-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .name-list li {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .name {
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }
    .name-meta {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        font-variant-numeric: var(--numeric);
        white-space: nowrap;
    }
    .group-note {
        margin: var(--space-3) 0 0;
        font-size: var(--text-xs);
        line-height: 1.5;
        color: var(--text-secondary);
        word-break: keep-all;
    }
    .empty, .empty-inline {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    .empty { padding: var(--space-4) 0; text-align: center; }

    .rank-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    .rank-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: baseline;
        gap: var(--space-2);
    }
    /* 이름은 길이에 상한이 없다. 잘라서 title 에 숨기면 폰에서 볼 방법이 없다. */
    .rank-name {
        min-width: 0;
        font-size: var(--text-sm);
        line-height: 1.4;
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }
    .rank-count {
        font-size: var(--text-sm);
        font-variant-numeric: var(--numeric);
        font-weight: var(--weight-medium);
        color: var(--text-primary);
    }
    .rank-track {
        grid-column: 1 / -1;
        height: 6px;
        border-radius: var(--radius-pill);
        background: var(--bg-hover);
        overflow: hidden;
    }
    .rank-fill {
        display: block;
        height: 100%;
        border-radius: var(--radius-pill);
        background: var(--color-blue-bright);
    }

    .ledger h2 { margin: 0 0 var(--space-4); font-size: var(--text-lg); }
    .ledger dl {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
        gap: var(--space-4) var(--space-5);
        margin: 0 0 var(--space-5);
    }
    .ledger dl > div {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding-left: var(--space-3);
        border-left: 1px solid var(--border-default);
    }
    .ledger dt { font-size: var(--text-xs); color: var(--text-secondary); }
    .ledger dd {
        margin: 0;
        font-size: var(--text-lg);
        font-weight: var(--weight-medium);
        font-variant-numeric: var(--numeric);
        color: var(--text-primary);
    }
    .ledger dl p {
        margin: 0;
        font-size: var(--text-xs);
        line-height: 1.5;
        color: var(--text-secondary);
        word-break: keep-all;
    }
    .btn-drilldown {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 var(--space-4);
        background: var(--bg-primary);
        border: 1px solid var(--border-control);
        border-radius: var(--radius-control);
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
    }
    .btn-drilldown:hover { background: var(--bg-secondary); }

    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: var(--overlay-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        z-index: 1000;
    }
    .modal-content {
        width: 100%;
        max-width: 460px;
        padding: var(--space-5);
        background: var(--bg-primary);
        border-radius: var(--radius-card);
        /* vh 는 주소창이 보일 때도 큰 뷰포트를 가리켜 아래가 잘렸다 */
        max-height: 90vh;
        max-height: 90dvh;
        overflow-y: auto;
        box-shadow: 0 4px 20px var(--shadow-lg);
    }
    .modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
    }
    .modal-head h3 { margin: 0; font-size: var(--text-lg); }
    .modal-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        margin-right: calc(var(--space-2) * -1);
        padding: 0;
        background: none;
        border: none;
        border-radius: var(--radius-control);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
    .modal-sub {
        margin: var(--space-1) 0 var(--space-4);
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }

    @media (max-width: 560px) {
        .findings { padding: var(--space-4); }
        .ledger dl { grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
    }
</style>
