<script lang="ts">
    import { onMount } from 'svelte';

    // 오락실 안에서 "지금 카페 상황"을 보여주는 헤더 배지.
    // 오락실의 목적이 "밖에서 게임하다가 오늘 누구 있나 보고 가볼까"로 이어지는 것이라,
    // 게임 화면에서 홈(현황판)으로 나가는 유일한 다리 역할을 한다.
    //
    // 0명일 때 "0명"을 그대로 노출하면 오히려 방문을 막는 신호가 되므로 표시하지 않는다.
    //   있음        → 🟢 N명
    //   없지만 예정 → N명 예정
    //   둘 다 없음  → 배지 자체를 숨김

    type Presence = { isOpen: boolean; present: number; presentNames: string[]; planned: number };

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

    const mode = $derived.by(() => {
        if (!data) return 'none';
        if (data.present > 0) return 'present';
        if (data.planned > 0) return 'planned';
        return 'none';
    });

    const label = $derived.by(() => {
        if (!data) return '';
        return mode === 'present' ? `${data.present}명` : `${data.planned}명 예정`;
    });

    const aria = $derived.by(() => {
        if (!data) return '';
        if (mode === 'present') {
            const names = data.presentNames.join(', ');
            const more = data.present > data.presentNames.length ? ' 외' : '';
            return `지금 카페에 ${data.present}명 있습니다${names ? ` (${names}${more})` : ''}. 현황 보러 가기`;
        }
        return `오늘 ${data.planned}명이 올 예정입니다. 현황 보러 가기`;
    });
</script>

{#if mode !== 'none'}
    <a href="/" class="presence-badge" class:planned={mode === 'planned'} aria-label={aria}>
        <span class="dot" aria-hidden="true"></span>
        <span class="count">{label}</span>
    </a>
{/if}

<style>
    /* 헤더의 .glass-btn과 같은 유리 표면을 쓰되, 숫자가 들어가므로 알약 형태로 넓힌다. */
    .presence-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        height: 40px;
        padding: 0 0.75rem;
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

    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-green);
        box-shadow: 0 0 0 0 var(--color-green);
        animation: pulse 2s ease-out infinite;
    }

    /* 예정 상태는 "지금 있는 것"과 헷갈리면 안 되므로 색과 움직임을 모두 죽인다. */
    .presence-badge.planned .dot {
        background: var(--color-slate);
        animation: none;
        box-shadow: none;
    }

    .count {
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: -0.2px;
    }

    @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
        70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    @media (prefers-reduced-motion: reduce) {
        .dot { animation: none; }
    }
</style>
