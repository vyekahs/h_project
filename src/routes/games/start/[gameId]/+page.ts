import { GAME_REGISTRY } from '$lib/games/gameRegistry';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ params }) => {
	const config = GAME_REGISTRY[params.gameId];
	if (!config) {
		throw error(404, 'Game not found');
	}
	return { gameConfig: config };
};
