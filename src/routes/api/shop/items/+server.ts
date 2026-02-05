import { json } from '@sveltejs/kit';
import { ShopService } from '$lib/server/services/shopService';

export async function GET() {
    try {
        const items = await ShopService.getItems();
        return json(items);
    } catch (e) {
        console.error(e);
        return json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
