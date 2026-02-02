<script lang="ts">
    import { onMount } from 'svelte';
    import { user } from '$lib/stores/user';
    import { fade, fly } from 'svelte/transition';

    let shopItems: any[] = $state([]);
    let loading = $state(true);
    let error = $state(null);
    let purchasing: string | null = $state(null);
    let activeTab: 'shop' | 'inventory' = $state('shop');

    onMount(async () => {
        await loadShop();
        user.refresh();
    });

    async function loadShop() {
        try {
            const res = await fetch('/api/shop/items');
            if (res.ok) {
                shopItems = await res.json();
            } else {
                error = 'Failed to load shop items';
            }
        } catch (e) {
            error = 'Error loading shop';
        } finally {
            loading = false;
        }
    }

    async function purchase(itemCode: string, price: number) {
        if (!$user.points || $user.points.total_points < price) {
            alert('포인트가 부족합니다!');
            return;
        }
        
        if (!confirm('정말 구매하시겠습니까?')) return;

        purchasing = itemCode;
        try {
            const res = await fetch('/api/shop/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemCode })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert('구매 성공!');
                user.refresh(); // Update points and inventory
            } else {
                alert(data.error || '구매 실패');
            }
        } catch (e) {
            alert('구매 중 오류가 발생했습니다.');
        } finally {
            purchasing = null;
        }
    }
    
    // Helper to check if owned (for one-time items or showing quantity)
    function getOwnedCount(itemCode: string) {
        const item = $user.inventory.find((i: any) => i.item_code === itemCode);
        return item ? item.quantity : 0;
    }
</script>

<div class="page-container">
    <div class="header">
        <h1>🛍️ 포인트 상점</h1>
        <p>게임을 즐기고 포인트를 모아 아이템을 구매하세요!</p>
    </div>
    
    <div class="tabs">
        <button class="tab" class:active={activeTab === 'shop'} onclick={() => activeTab = 'shop'}>
            🛒 상점
        </button>
        <button class="tab" class:active={activeTab === 'inventory'} onclick={() => activeTab = 'inventory'}>
            🎒 인벤토리
        </button>
    </div>

    {#if activeTab === 'shop'}
        <div class="shop-grid" in:fade>
            {#if loading}
                <div class="loading">로딩 중...</div>
            {:else if error}
                <div class="error">{error}</div>
            {:else}
                {#each shopItems as item}
                    <div class="item-card">
                        <div class="icon">{item.item_type === 'cosmetic' ? '🎨' : '🛡️'}</div>
                        <div class="info">
                            <h3>{item.item_name}</h3>
                            <p>{item.description}</p>
                            <div class="meta">
                                <span class="price">
                                    💎 {item.price.toLocaleString()}
                                </span>
                                {#if getOwnedCount(item.item_code) > 0 && item.item_type !== 'game_assist'}
                                    <span class="owned-badge">보유중</span>
                                {/if}
                            </div>
                        </div>
                        <button 
                            class="btn-buy" 
                            disabled={purchasing === item.item_code || ($user.points?.total_points || 0) < item.price}
                            onclick={() => purchase(item.item_code, item.price)}
                        >
                            {#if purchasing === item.item_code}
                                ⏳
                            {:else}
                                구매
                            {/if}
                        </button>
                    </div>
                {/each}
            {/if}
        </div>
    {:else}
        <div class="inventory-list" in:fade>
            {#if $user.inventory.length === 0}
                <div class="empty-state">
                    <div class="empty-icon">🎒</div>
                    <p>인벤토리가 비어있습니다.</p>
                    <button class="btn-link" onclick={() => activeTab = 'shop'}>상점으로 가기</button>
                </div>
            {:else}
                {#each $user.inventory as item}
                    <div class="inv-item">
                        <div class="inv-info">
                            <h3>{item.item_name}</h3>
                            <span class="count">x{item.quantity}</span>
                        </div>
                        <button class="btn-use" disabled>사용 (게임 내에서)</button>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}
</div>

<style>
    .page-container {
        padding: 5rem 1rem 7rem 1rem; /* Top padding for header, Bottom for nav */
        max-width: 600px;
        margin: 0 auto;
    }
    
    .header {
        text-align: center;
        margin-bottom: 2rem;
    }
    
    .header h1 {
        font-size: 2rem;
        margin-bottom: 0.5rem;
    }
    
    .header p {
        color: #888;
        font-size: 0.95rem;
    }
    
    .tabs {
        display: flex;
        background: #eee;
        padding: 4px;
        border-radius: 12px;
        margin-bottom: 1.5rem;
    }
    
    .tab {
        flex: 1;
        border: none;
        background: none;
        padding: 0.8rem;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        color: #888;
        transition: all 0.2s;
    }
    
    .tab.active {
        background: white;
        color: #333;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    
    .shop-grid {
        display: grid;
        gap: 1rem;
    }
    
    .item-card {
        background: white;
        padding: 1.2rem;
        border-radius: 16px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        display: flex;
        align-items: center;
        gap: 1rem;
        transition: transform 0.2s;
    }
    
    .item-card:active {
        transform: scale(0.98);
    }
    
    .icon {
        font-size: 2rem;
        background: #f5f5f7;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
    }
    
    .info {
        flex: 1;
    }
    
    .info h3 {
        margin: 0 0 0.3rem 0;
        font-size: 1.05rem;
    }
    
    .info p {
        margin: 0;
        font-size: 0.85rem;
        color: #888;
    }
    
    .meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .price {
        font-weight: 600;
        color: #007aff;
        font-size: 0.9rem;
    }
    
    .owned-badge {
        background: #e3f2fd;
        color: #1565c0;
        font-size: 0.7rem;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
    }
    
    .btn-buy {
        background: linear-gradient(135deg, #007aff, #0056b3);
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.9rem;
    }
    
    .btn-buy:disabled {
        background: #ddd;
        color: #999;
        cursor: not-allowed;
    }
    
    .inventory-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .inv-item {
        background: white;
        padding: 1.2rem;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 2px 10px rgba(0,0,0,0.03);
    }
    
    .inv-info h3 {
        margin: 0;
        font-size: 1.1rem;
    }
    
    .count {
        color: #888;
        font-size: 0.9rem;
    }
    
    .btn-use {
        background: #f5f5f7;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        color: #888;
        font-size: 0.85rem;
    }
    
    .empty-state {
        text-align: center;
        padding: 3rem;
        color: #888;
    }
    
    .empty-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }
    
    .btn-link {
        background: none;
        border: none;
        color: #007aff;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        margin-top: 1rem;
    }
</style>
