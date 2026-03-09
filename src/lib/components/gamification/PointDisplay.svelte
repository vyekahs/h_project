<script lang="ts">
    import { user } from '$lib/stores/user';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    
    // Refresh on mount if not loaded
    onMount(() => {
        if ($user.loading) {
            user.refresh();
        }
    });
</script>

{#if $user.points}
    <div class="user-status-badges" role="button" tabindex="0" onclick={() => goto('/shop')} onkeydown={(e) => e.key === 'Enter' && goto('/shop')}>
        <div class="profile-badge">
            {#if $user.currentTitle}
                <span class="title-badge">{$user.currentTitle.title_name}</span>
            {/if}
            <span class="name-text">{$user.name || 'Guest'}</span>
        </div>
        <div class="point-badge">
            <span class="icon">💎</span>
            <span class="amount">{$user.points.total_points.toLocaleString()} P</span>
        </div>
    </div>
{/if}

<style>
    .user-status-badges {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: transform 0.2s;
        z-index: 100;
        outline: none;
    }
    
    .user-status-badges:hover {
        transform: scale(1.03);
    }
    
    .user-status-badges:active {
        transform: scale(0.97);
    }

    .profile-badge {
        background: var(--shadow-deep);
        color: var(--bg-primary);
        font-size: 0.85rem;
        padding: 4px 10px;
        border-radius: 16px;
        display: flex;
        gap: 6px;
        align-items: center;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        white-space: nowrap;
        overflow: hidden;
    }

    .title-badge {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--text-primary);
        background: linear-gradient(135deg, var(--color-amber), var(--color-amber-dark));
        padding: 2px 7px;
        border-radius: 8px;
        flex-shrink: 0;
    }

    .name-text {
        color: var(--bg-primary);
        font-weight: 500;
    }

    .point-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding: 4px 10px;
        border-radius: 16px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.08);
        border: 1px solid var(--overlay-light);
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-primary);
    }
    
    .icon {
        font-size: 1.1rem;
    }
    
    .amount {
        font-variant-numeric: tabular-nums;
        color: var(--color-blue-bright);
    }
</style>
