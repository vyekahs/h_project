import { db } from '$lib/server/db/index';
import { sql, eq, and, gt } from 'drizzle-orm';
import { minigameTitles, minigameUserTitles, minigameShopItems, minigameUserInventory } from '$lib/server/db/schema/minigame';
import { PointService } from './pointService';

export const TitleService = {
    async assignTitle(userId: number, titleCode: string) {
        const titleRes = await db
            .select({ id: minigameTitles.id })
            .from(minigameTitles)
            .where(eq(minigameTitles.titleCode, titleCode));
        if (titleRes.length === 0) return false;

        const titleId = titleRes[0].id;

        try {
            await db.insert(minigameUserTitles)
                .values({ userId, titleId })
                .onConflictDoUpdate({
                    target: minigameUserTitles.titleId,
                    set: { userId, acquiredAt: sql`NOW()` }
                });
            return true;
        } catch (e) {
            console.error('Failed to assign title', e);
            return false;
        }
    },

    async getUserTitle(userId: number) {
        const res = await db.execute(sql`
            SELECT t.title_name, t.title_code
            FROM minigame_user_titles ut
            JOIN minigame_titles t ON ut.title_id = t.id
            WHERE ut.user_id = ${userId} AND ut.is_displayed = TRUE
            LIMIT 1
        `);
        return res[0] || null;
    }
};

export const ShopService = {
    async getItems() {
        return await db
            .select()
            .from(minigameShopItems)
            .where(eq(minigameShopItems.isActive, true))
            .orderBy(minigameShopItems.price);
    },

    async purchaseItem(userId: number, itemCode: string) {
        const itemRes = await db
            .select()
            .from(minigameShopItems)
            .where(eq(minigameShopItems.itemCode, itemCode));
        if (itemRes.length === 0) throw new Error('Item not found');
        const item = itemRes[0];

        const success = await PointService.deductPoints(userId, item.price, 'purchase', itemCode);
        if (!success) return { success: false, message: 'Not enough points' };

        await db.insert(minigameUserInventory)
            .values({ userId, itemId: item.id, quantity: 1 })
            .onConflictDoUpdate({
                target: [minigameUserInventory.userId, minigameUserInventory.itemId],
                set: { quantity: sql`${minigameUserInventory.quantity} + 1` }
            });

        return { success: true, message: 'Purchased' };
    },

    async useItem(userId: number, itemCode: string) {
        const itemRes = await db
            .select({ id: minigameShopItems.id })
            .from(minigameShopItems)
            .where(eq(minigameShopItems.itemCode, itemCode));
        if (itemRes.length === 0) return false;
        const itemId = itemRes[0].id;

        const invRes = await db
            .select({ quantity: minigameUserInventory.quantity })
            .from(minigameUserInventory)
            .where(and(
                eq(minigameUserInventory.userId, userId),
                eq(minigameUserInventory.itemId, itemId)
            ));
        if (invRes.length === 0 || (invRes[0].quantity ?? 0) <= 0) return false;

        await db.update(minigameUserInventory)
            .set({ quantity: sql`${minigameUserInventory.quantity} - 1` })
            .where(and(
                eq(minigameUserInventory.userId, userId),
                eq(minigameUserInventory.itemId, itemId)
            ));
        return true;
    },

    async getInventory(userId: number) {
        const res = await db.execute(sql`
            SELECT i.item_code, i.item_name, i.item_type, u.quantity
            FROM minigame_user_inventory u
            JOIN minigame_shop_items i ON u.item_id = i.id
            WHERE u.user_id = ${userId} AND u.quantity > 0
        `);
        return res;
    }
};
