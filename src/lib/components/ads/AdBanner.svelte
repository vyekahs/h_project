<script lang="ts">
    import { onMount } from 'svelte';
    import { user } from '$lib/stores/user';

    interface Props {
        adSlot: string;
        format?: 'auto' | 'fluid' | 'rectangle';
        style?: string;
        client?: string;
    }

    let { 
        adSlot, 
        format = 'auto', 
        style = 'display:block', 
        client = 'ca-pub-XXXXXXXXXXXXXXXX' // Placeholder
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
    
    onMount(() => {
        if (showAd && typeof window !== 'undefined') {
            try {
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
        background: #f8f9fa;
        min-height: 90px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    
    .ad-label {
        font-size: 0.7rem;
        color: #ddd;
        margin-top: 4px;
    }
</style>
