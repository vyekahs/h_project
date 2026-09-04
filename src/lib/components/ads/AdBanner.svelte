<script lang="ts">
    import { onMount } from 'svelte';
    import { user } from '$lib/stores/user';

    interface Props {
        adSlot: string;
        format?: 'auto' | 'fluid' | 'rectangle';
        style?: string;
        client?: string;
    }

    /*
        퍼블리셔 id. 예전에는 이 값이 app.html의 스크립트 태그에만 있었고
        여기 기본값은 자리표시자였다 — ENABLE_ADS를 켜는 순간 광고 단위가
        존재하지 않는 id로 요청됐을 것이다. 한 곳에서 온다.
    */
    const AD_CLIENT = 'ca-pub-5932511769216952';

    let { 
        adSlot, 
        format = 'auto', 
        style = 'display:block', 
        client = AD_CLIENT
    }: Props = $props();

    import { GAME_CONFIG } from '$lib/config';

    let isPremium = $derived($user.inventory.some((i: any) => 
        (i.item_code === 'ad_remove' || i.item_code === 'premium_pass') && 
        (i.expires_at ? new Date(i.expires_at) > new Date() : true)
    ));
    
    // Better check: The backend 'ad_remove' item might be a consumable that applies a status, 
    // OR it sits in inventory and expires. 
    // Based on migration: 'use_limit': {'duration_days': 30}.
    // If it's in inventory, let's assume it's active for now.
    
    // Actually, simpler logic: check if user has 'ad_remove' item in inventory.
    let showAd = $derived(GAME_CONFIG.ENABLE_ADS && !isPremium);
    
    /*
        AdSense 스크립트는 app.html에 있었다. 그 자리는 조건을 걸 수 없어서
        광고가 뜨지 않는 모든 문서 — 미니게임, 도구, 그리고 운영진의 인증된
        어드민 콘솔까지 — 가 구글 광고·reCAPTCHA 프레임을 셋 띄웠다.
        ENABLE_ADS가 false인 동안에는 어디에도 광고 단위가 없었으므로 순수한
        군더더기이기도 했다. 배너가 실제로 그려지는 자리에서만 불러온다.
    */
    function loadAdSense() {
        const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
        if (document.querySelector(`script[src="${src}"]`)) return;
        const el = document.createElement('script');
        el.async = true;
        el.src = src;
        el.crossOrigin = 'anonymous';
        document.head.appendChild(el);
    }

    onMount(() => {
        if (showAd && typeof window !== 'undefined') {
            try {
                loadAdSense();
                // @ts-ignore
                (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (e) {
                console.error('AdSense error', e);
            }
        }
    });
</script>

{#if showAd}
    <div class="ad-container">
        <!-- Google AdSense Unit -->
        <ins class="adsbygoogle"
             {style}
             data-ad-client={client}
             data-ad-slot={adSlot}
             data-ad-format={format}
             data-full-width-responsive="true"></ins>
         <div class="ad-label">광고</div>
    </div>
{/if}

<style>
    .ad-container {
        margin: 1rem auto;
        text-align: center;
        background: var(--bg-secondary);
        min-height: 90px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    
    .ad-label {
        font-size: 0.7rem;
        color: var(--border-default);
        margin-top: 4px;
    }
</style>
