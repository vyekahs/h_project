import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { WantToPlayService } from '$lib/server/services/wantToPlayService';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const posts = await WantToPlayService.getOpenPosts();
	return json({ posts });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sessionToken = cookies.get('user_session');
	if (!sessionToken) return json({ error: '로그인이 필요합니다' }, { status: 401 });
	const user = await verifyAttendeeSession(sessionToken);
	if (!user) return json({ error: '세션이 만료되었습니다' }, { status: 401 });

	const { gameId, gameName, message } = await request.json();

	if (!gameName || typeof gameName !== 'string' || gameName.trim().length === 0) {
		return json({ error: '게임 이름이 필요합니다' }, { status: 400 });
	}
	if (gameName.trim().length > 100) {
		return json({ error: '게임 이름은 100자 이내로 입력해주세요' }, { status: 400 });
	}
	if (message && typeof message === 'string' && message.length > 200) {
		return json({ error: '메시지는 200자 이내로 입력해주세요' }, { status: 400 });
	}

	try {
		const result = await WantToPlayService.createPost(
			user.id,
			gameId ?? null,
			gameName.trim(),
			message
		);
		return json(result, { status: 201 });
	} catch (e: any) {
		return json({ error: e.message }, { status: 400 });
	}
};
