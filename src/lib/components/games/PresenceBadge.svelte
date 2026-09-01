<script lang="ts">
    import { onMount } from 'svelte';

    // 오락실 안에서 "지금 카페 상황"을 보여주는 헤더 배지.
    // 오락실의 목적이 "밖에서 게임하다가 오늘 누구 있나 보고 가볼까"로 이어지는 것이라,
    // 게임 화면에서 홈(현황판)으로 나가는 다리 역할을 한다.
    //
    // 카페(오프라인)와 앱 접속(온라인)을 나눠 보여준다. 숫자 하나만 띄우면
    // "지금 같이 게임하는 사람 수"로 읽히기 때문이다. 서버에서 서로 겹치지 않게
    // 집계하므로 두 숫자를 더하면 실제 인원이 된다.
    //
    // 0을 그대로 노출하면 오히려 방문을 막는 신호가 되므로 0인 쪽은 생략한다.
    //   카페·온라인 둘 다 0이고 예정만 있음 → "N명 예정"
    //   전부 0                              → 배지 숨김

    type Presence = {
        isOpen: boolean;
        present: number;
        presentNames: string[];
        planned: number;
        online: number;
    };

    let data = $state<Presence | null>(null);

    async function load() {
        try {
            const res = await fetch('/api/presence');
            if (!res.ok) return;
            data = await res.json();
        } catch {
            // 배지는 부가 정보라 실패해도 조용히 숨긴다.
        }
    }

    onMount(() => {
        load();
        // 게임을 한 판 하고 돌아오면 상황이 바뀌어 있을 수 있어 탭 복귀 시 갱신한다.
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    });

    const hasLive = $derived(!!data && (data.present > 0 || data.online > 0));
    const showPlanned = $derived(!!data && !hasLive && data.planned > 0);
    const visible = $derived(hasLive || showPlanned);

    const aria = $derived.by(() => {
        if (!data) return '';
        if (!hasLive) return `오늘 ${data.planned}명이 올 예정입니다. 현황 보러 가기`;
        const parts: string[] = [];
        if (data.present > 0) {
            const names = data.presentNames.join(', ');
            const more = data.present > data.presentNames.length ? ' 외' : '';
            parts.push(`혼놀에 ${data.present}명${names ? ` (${names}${more})` : ''}`);
        }
        if (data.online > 0) parts.push(`앱에 ${data.online}명 접속 중`);
        return `${parts.join(', ')}. 현황 보러 가기`;
    });
</script>

{#if visible && data}
    <a href="/" class="presence-badge" aria-label={aria} title={aria}>
        {#if hasLive}
            {#if data.present > 0}
                <span class="seg">
                    <span class="dot cafe" aria-hidden="true"></span>
                    <span class="txt">혼놀 {data.present}</span>
                </span>
            {/if}
            {#if data.online > 0}
                <span class="seg">
                    <span class="dot app" aria-hidden="true"></span>
                    <span class="txt">온라인 {data.online}</span>
                </span>
            {/if}
        {:else}
            <span class="seg">
                <span class="dot planned" aria-hidden="true"></span>
                <span class="txt">{data.planned}명 예정</span>
            </span>
        {/if}
    </a>
{/if}

<style>
    /* 헤더의 .glass-btn과 같은 유리 표면을 쓰되, 숫자가 들어가므로 알약 형태로 넓힌다. */
    .presence-badge {
        /* 헤더 폭이 좁아(390px 화면에서 제목 160px + 좌우 대칭) 가로로 나열하면
           배지가 제목을 덮는다. 두 줄로 쌓아 폭을 절반으로 줄인다. */
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 0.1rem;
        height: 36px;
        padding: 0 0.5rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.6);
        color: var(--text-primary);
        text-decoration: none;
        white-space: nowrap;
        transition: all 0.2s;
    }

    .presence-badge:active {
        transform: scale(0.95);
        background: rgba(255, 255, 255, 0.7);
    }

    .seg {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
    }

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    /* 카페에 실제로 있는 사람 — 유일하게 움직이는 요소로 시선을 끈다. */
    .dot.cafe {
        background: var(--color-green);
        animation: pulse 2s ease-out infinite;
    }

    .dot.app {
        background: var(--color-blue);
    }

    /* 예정은 "지금 있음"과 헷갈리면 안 되므로 색을 죽인다. */
    .dot.planned {
        background: var(--color-slate);
    }

    .txt {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: -0.3px;
        line-height: 1.25;
    }

    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
        70% { box-shadow: 0 0 0 5px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    @media (prefers-reduced-motion: reduce) {
        .dot.cafe { animation: none; }
    }
</style>
