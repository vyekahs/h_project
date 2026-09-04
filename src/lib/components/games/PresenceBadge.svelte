<script lang="ts">
    import { onMount } from 'svelte';

    // 오락실 안에서 "지금 혼놀에 누가 있는지"를 보여주는 헤더 배지.
    // 오락실의 목적이 "밖에서 게임하다가 오늘 누구 있나 보고 가볼까"로 이어지는 것이라,
    // 게임 화면에서 홈(현황판)으로 나가는 다리 역할을 한다.
    //
    // 0을 그대로 노출하면 오히려 방문을 막는 신호가 되므로 표시하지 않는다.
    //   혼놀에 있음        → 혼놀 N
    //   없지만 올 예정 있음 → N명 예정
    //   둘 다 없음          → 배지 숨김

    type Presence = {
        isOpen: boolean;
        present: number;
        presentNames: string[];
        planned: number;
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

    const showPresent = $derived(!!data && data.present > 0);
    const showPlanned = $derived(!!data && !showPresent && data.planned > 0);

    const aria = $derived.by(() => {
        if (!data) return '';
        if (showPresent) {
            const names = data.presentNames.join(', ');
            const more = data.present > data.presentNames.length ? ' 외' : '';
            return `혼놀에 ${data.present}명 있습니다${names ? ` (${names}${more})` : ''}. 현황 보러 가기`;
        }
        return `오늘 ${data.planned}명이 올 예정입니다. 현황 보러 가기`;
    });
</script>

{#if data && (showPresent || showPlanned)}
    <a href="/" class="presence-badge" aria-label={aria} title={aria}>
        <span class="dot" class:planned={showPlanned} aria-hidden="true"></span>
        <span class="txt">
            {#if showPresent}혼놀 {data.present}{:else}{data.planned}명 예정{/if}
        </span>
    </a>
{/if}

<style>
    /* 헤더의 .glass-btn과 같은 유리 표면을 쓰되, 숫자가 들어가므로 알약 형태로 넓힌다. */
    .presence-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        height: 34px;
        padding: 0 0.65rem;
        border-radius: 999px;
        background: var(--glass-surface-faint);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid var(--glass-border-strong);
        color: var(--text-primary);
        text-decoration: none;
        white-space: nowrap;
        transition: all 0.2s;
    }

    .presence-badge:active {
        transform: scale(0.95);
        background: var(--glass-surface-strong);
    }

    .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
        background: var(--color-green);
        animation: pulse 2s ease-out infinite;
    }

    /* 예정은 "지금 있음"과 헷갈리면 안 되므로 색과 움직임을 모두 죽인다. */
    .dot.planned {
        background: var(--color-slate);
        animation: none;
    }

    .txt {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: -0.3px;
    }

    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-green) 50%, transparent); }
        70% { box-shadow: 0 0 0 5px transparent; }
        100% { box-shadow: 0 0 0 0 transparent; }
    }

    /* 좁은 화면에서는 헤더에 게임 제목과 나란히 들어가야 해서 배지를 줄인다.
       (280~300px에서 'N명 예정' 같은 긴 문구가 제목을 덮는 문제) */
    @media (max-width: 360px) {
        .presence-badge {
            height: 30px;
            padding: 0 0.5rem;
            gap: 0.28rem;
        }

        .txt {
            font-size: 0.62rem;
        }

        .dot {
            width: 6px;
            height: 6px;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .dot { animation: none; }
    }
</style>
