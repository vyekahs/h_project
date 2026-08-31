import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { NotificationService } from './notificationService';

export interface WtpTag {
	id: number;
	name: string;
}

let tagsCache: WtpTag[] | null = null;
let tagsCacheTime = 0;
const TAGS_CACHE_TTL = 5 * 60 * 1000;

export interface WtpPost {
	id: number;
	game_id: number | null;
	game_name: string;
	message: string;
	created_by: number;
	creator_name: string;
	creator_title: string | null;
	status: string;
	image_url: string | null;
	min_players: number | null;
	max_players: number | null;
	created_at: string;
	participant_count: number;
	participants: { id: number; name: string; title_name: string | null }[];
	tags: WtpTag[];
}

export const WantToPlayService = {
	async getOpenPosts(): Promise<WtpPost[]> {
		const posts = await db.execute(sql`
			SELECT
				p.id, p.game_id, p.game_name, p.message, p.created_by,
				a.name as creator_name,
				mt.title_name as creator_title,
				p.status, p.image_url, p.min_players, p.max_players, p.created_at
			FROM want_to_play_posts p
			LEFT JOIN attendees a ON p.created_by = a.id
			LEFT JOIN minigame_user_points mup ON p.created_by = mup.user_id
			LEFT JOIN minigame_titles mt ON mup.equipped_title_id = mt.id
			WHERE p.status = 'open'
			ORDER BY p.created_at DESC
		`);

		const postIds = (posts as any[]).map(p => p.id as number);
		if (postIds.length === 0) return [];

		const idList = sql.join(postIds.map(id => sql`${id}`), sql`, `);
		// 둘 다 postIds에만 의존하고 서로 독립적이라 병렬로 조회
		const [participants, tags] = await Promise.all([
			db.execute(sql`
				SELECT
					wp.post_id,
					wp.attendee_id as id,
					a.name,
					mt.title_name
				FROM want_to_play_participants wp
				LEFT JOIN attendees a ON wp.attendee_id = a.id
				LEFT JOIN minigame_user_points mup ON wp.attendee_id = mup.user_id
				LEFT JOIN minigame_titles mt ON mup.equipped_title_id = mt.id
				WHERE wp.post_id IN (${idList})
				ORDER BY wp.joined_at ASC
			`),
			db.execute(sql`
				SELECT pt.post_id, t.id, t.name
				FROM wtp_post_tags pt
				JOIN wtp_tags t ON pt.tag_id = t.id
				WHERE pt.post_id IN (${idList})
				ORDER BY t.sort_order ASC
			`),
		]);

		const participantsByPost = new Map<number, { id: number; name: string; title_name: string | null }[]>();
		for (const p of participants as any[]) {
			if (!participantsByPost.has(p.post_id)) participantsByPost.set(p.post_id, []);
			participantsByPost.get(p.post_id)!.push({ id: p.id, name: p.name, title_name: p.title_name });
		}

		const tagsByPost = new Map<number, WtpTag[]>();
		for (const t of tags as any[]) {
			if (!tagsByPost.has(t.post_id)) tagsByPost.set(t.post_id, []);
			tagsByPost.get(t.post_id)!.push({ id: t.id, name: t.name });
		}

		return (posts as any[]).map(p => ({
			...p,
			participants: participantsByPost.get(p.id) ?? [],
			participant_count: (participantsByPost.get(p.id) ?? []).length,
			tags: tagsByPost.get(p.id) ?? [],
		}));
	},

	async createPost(userId: number, gameId: number | null, gameName: string, message?: string, tagIds?: number[]): Promise<{ id: number }> {
		// 최대 5개 open 글 제한
		const openCount = await db.execute(sql`
			SELECT COUNT(*)::int as cnt FROM want_to_play_posts
			WHERE created_by = ${userId} AND status = 'open'
		`);
		if ((openCount[0] as any).cnt >= 5) {
			throw new Error('최대 5개까지만 등록할 수 있습니다');
		}

		let imageUrl: string | null = null;
		let minPlayers: number | null = null;
		let maxPlayers: number | null = null;

		if (gameId) {
			const game = await db.execute(sql`
				SELECT image_url, min_players, max_players FROM games WHERE id = ${gameId}
			`);
			if (game.length > 0) {
				const g = game[0] as any;
				imageUrl = g.image_url;
				minPlayers = g.min_players;
				maxPlayers = g.max_players;
			}
		}

		const trimmedMessage = message?.trim() || '같이 하실 분!';

		const result = await db.execute(sql`
			INSERT INTO want_to_play_posts (game_id, game_name, message, created_by, image_url, min_players, max_players)
			VALUES (${gameId}, ${gameName}, ${trimmedMessage}, ${userId}, ${imageUrl}, ${minPlayers}, ${maxPlayers})
			RETURNING id
		`);
		const postId = (result[0] as any).id;

		// 작성자 자동 참여
		await db.execute(sql`
			INSERT INTO want_to_play_participants (post_id, attendee_id)
			VALUES (${postId}, ${userId})
		`);

		// 태그 저장
		if (tagIds && tagIds.length > 0) {
			const tagValues = tagIds.map(tagId => sql`(${postId}, ${tagId})`);
			await db.execute(sql`
				INSERT INTO wtp_post_tags (post_id, tag_id)
				VALUES ${sql.join(tagValues, sql`, `)}
				ON CONFLICT DO NOTHING
			`);
		}

		return { id: postId };
	},

	async joinPost(userId: number, postId: number): Promise<void> {
		// 글 존재/상태 확인
		const post = await db.execute(sql`
			SELECT id, created_by, game_name, status FROM want_to_play_posts WHERE id = ${postId}
		`);
		if (post.length === 0) throw new Error('글을 찾을 수 없습니다');
		const p = post[0] as any;
		if (p.status !== 'open') throw new Error('이미 마감된 글입니다');

		// 중복 참여 방지
		try {
			await db.execute(sql`
				INSERT INTO want_to_play_participants (post_id, attendee_id)
				VALUES (${postId}, ${userId})
			`);
		} catch (e: any) {
			if (e.code === '23505') throw new Error('이미 참여 중입니다');
			throw e;
		}

		// 작성자에게 알림
		// 참여 자체는 이미 완료됐으므로, 알림(DB 조회 + 웹 푸시 외부 호출)이
		// 응답을 막지 않도록 백그라운드로 돌린다.
		if (p.created_by !== userId) {
			(async () => {
				const joiner = await db.execute(sql`SELECT name FROM attendees WHERE id = ${userId}`);
				const joinerName = (joiner[0] as any)?.name ?? '누군가';

				await NotificationService.notify(
					p.created_by,
					{
						type: 'wtp_join',
						title: '같이하기 알림',
						body: `${joinerName}님이 "${p.game_name}" 같이하기에 참여했습니다`,
						url: '/?tab=games',
					},
					userId,
					`wtp:${postId}`
				);
			})().catch(e => console.error('[WtpService] notification failed:', e));
		}
	},

	async leavePost(userId: number, postId: number): Promise<{ deleted: boolean }> {
		const post = await db.execute(sql`
			SELECT created_by FROM want_to_play_posts WHERE id = ${postId} AND status = 'open'
		`);
		if (post.length === 0) throw new Error('글을 찾을 수 없습니다');

		// 작성자가 나가면 글 자체를 삭제
		if ((post[0] as any).created_by === userId) {
			await db.execute(sql`DELETE FROM want_to_play_posts WHERE id = ${postId}`);
			return { deleted: true };
		}

		const result = await db.execute(sql`
			DELETE FROM want_to_play_participants
			WHERE post_id = ${postId} AND attendee_id = ${userId}
			RETURNING id
		`);
		if (result.length === 0) throw new Error('참여 중이 아닙니다');
		return { deleted: false };
	},

	async getAvailableTags(): Promise<WtpTag[]> {
		// 태그 목록은 앱 코드에서 절대 안 바뀌므로(관리 스크립트로만 수정) 캐시로 매 홈 로드마다
		// 도는 조회를 없앤다.
		if (tagsCache && Date.now() - tagsCacheTime < TAGS_CACHE_TTL) return tagsCache;
		const tags = await db.execute(sql`
			SELECT id, name FROM wtp_tags ORDER BY sort_order ASC
		`);
		tagsCache = (tags as any[]).map(t => ({ id: t.id, name: t.name }));
		tagsCacheTime = Date.now();
		return tagsCache;
	},

	async closePost(userId: number, postId: number, isAdmin: boolean): Promise<void> {
		const post = await db.execute(sql`
			SELECT created_by FROM want_to_play_posts WHERE id = ${postId} AND status = 'open'
		`);
		if (post.length === 0) throw new Error('글을 찾을 수 없습니다');
		if (!isAdmin && (post[0] as any).created_by !== userId) throw new Error('작성자만 마감할 수 있습니다');

		await db.execute(sql`
			UPDATE want_to_play_posts
			SET status = 'closed', closed_at = NOW()
			WHERE id = ${postId}
		`);
	},
};
