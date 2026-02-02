import { query } from '$lib/server/db';
import { PointService } from './pointService';

export const TitleService = {
    async assignTitle(userId: number, titleCode: string) {
        const titleRes = await query('SELECT id FROM minigame_titles WHERE title_code = $1', [titleCode]);
        if (titleRes.rows.length === 0) return false;
        
        const titleId = titleRes.rows[0].id;
        
        try {
            await query(`
                INSERT INTO minigame_user_titles (user_id, title_id)
                VALUES ($1, $2)
                ON CONFLICT (title_id) DO UPDATE
                SET user_id = EXCLUDED.user_id, acquired_at = NOW()
            `, [userId, titleId]); // This basically "steals" the title if unique constraint exists on title_id
            return true;
        } catch (e) {
            console.error('Failed to assign title', e);
            return false;
        }
    },
    
    async getUserTitle(userId: number) {
        const sql = `
            SELECT t.title_name, t.title_code
            FROM minigame_user_titles ut
            JOIN minigame_titles t ON ut.title_id = t.id
            WHERE ut.user_id = $1 AND ut.is_displayed = TRUE
            LIMIT 1
        `;
        const res = await query(sql, [userId]);
        return res.rows[0] || null;
    }
};

export const ShopService = {
    async getItems() {
        const res = await query('SELECT * FROM minigame_shop_items WHERE is_active = TRUE ORDER BY price ASC');
        return res.rows;
    },
    
    async purchaseItem(userId: number, itemCode: string) {
        const itemRes = await query('SELECT * FROM minigame_shop_items WHERE item_code = $1', [itemCode]);
        if (itemRes.rows.length === 0) throw new Error('Item not found');
        const item = itemRes.rows[0];
        
        // Deduct points
        const success = await PointService.deductPoints(userId, item.price, 'purchase', itemCode);
        if (!success) return { success: false, message: 'Not enough points' };
        
        // Add to inventory
        await query(`
            INSERT INTO minigame_user_inventory (user_id, item_id, quantity)
            VALUES ($1, $2, 1)
            ON CONFLICT (user_id, item_id)
            DO UPDATE SET quantity = minigame_user_inventory.quantity + 1
        `, [userId, item.id]);
        
        return { success: true, message: 'Purchased' };
    },
    
    async useItem(userId: number, itemCode: string) {
         const itemRes = await query('SELECT id FROM minigame_shop_items WHERE item_code = $1', [itemCode]);
         if (itemRes.rows.length === 0) return false;
         const itemId = itemRes.rows[0].id;
         
         const invRes = await query('SELECT quantity FROM minigame_user_inventory WHERE user_id=$1 AND item_id=$2', [userId, itemId]);
         if (invRes.rows.length === 0 || invRes.rows[0].quantity <= 0) return false;
         
         await query('UPDATE minigame_user_inventory SET quantity = quantity - 1 WHERE user_id=$1 AND item_id=$2', [userId, itemId]);
         return true;
    },

    async getInventory(userId: number) {
        const sql = `
            SELECT i.item_code, i.item_name, i.item_type, u.quantity
            FROM minigame_user_inventory u
            JOIN minigame_shop_items i ON u.item_id = i.id
            WHERE u.user_id = $1 AND u.quantity > 0
        `;
        return (await query(sql, [userId])).rows;
    }
};
