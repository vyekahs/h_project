import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { NotificationService } from './notificationService';
import { GAME_REGISTRY } from '$lib/games/gameRegistry';
import { emitPartyChatMessage } from '$lib/server/liveEvents';

export interface CommentWithUser {
	id: number;
	game_id: string;
	user_id: number;
	content: string;
	created_at: string;
	nickname: string;
	title_name: string | null;
}

export const CommentService = {
	/**
	 * Get comments for a game, cursor-based pagination.
	 * Returns newest first (caller reverses for chat-style display).
	 */
	async getComments(gameId: string, beforeId?: number, limit = 20): Promise<{ comments: CommentWithUser[]; hasMore: boolean }> {
		let res;
		if (beforeId) {
			res = await db.execute(sql`
				SELECT
					c.id, c.game_id, c.user_id, c.content, c.created_at,
					a.name as nickname,
					mt.title_name
				FROM minigame_game_comments c
				LEFT JOIN attendees a ON c.user_id = a.id
				LEFT JOIN minigame_user_points mup ON c.user_id = mup.user_id
				LEFT JOIN minigame_titles mt ON mup.equipped_title_id = mt.id
				WHERE c.game_id = ${gameId} AND c.id < ${beforeId}
				ORDER BY c.id DESC
				LIMIT ${limit + 1}
			`);
		} else {
			res = await db.execute(sql`
				SELECT
					c.id, c.game_id, c.user_id, c.content, c.created_at,
					a.name as nickname,
					mt.title_name
				FROM minigame_game_comments c
				LEFT JOIN attendees a ON c.user_id = a.id
				LEFT JOIN minigame_user_points mup ON c.user_id = mup.user_id
				LEFT JOIN minigame_titles mt ON mup.equipped_title_id = mt.id
				WHERE c.game_id = ${gameId}
				ORDER BY c.id DESC
				LIMIT ${limit + 1}
			`);
		}

		const rows = res as unknown as CommentWithUser[];
		const hasMore = rows.length > limit;
		const comments = hasMore ? rows.slice(0, limit) : rows;

		return { comments, hasMore };
	},

	/**
	 * Create a comment and trigger mention notifications.
	 */
	async createComment(userId: number, gameId: string, content: string): Promise<{ comment: CommentWithUser }> {
		// Validate content
		const trimmed = content.trim();
		if (!trimmed || trimmed.length > 200) {
			throw new Error('댓글은 1~200자로 작성해주세요');
		}

		// Spam check: party는 쿨다운 없음, wtp은 1초, 나머지는 60초
		const isWtp = gameId.startsWith('wtp_');
		const isParty = gameId.startsWith('party_');
		if (!isParty) {
			const cooldownInterval = isWtp ? sql`INTERVAL '1 second'` : sql`INTERVAL '60 seconds'`;
			const recent = await db.execute(sql`
				SELECT 1 FROM minigame_game_comments
				WHERE user_id = ${userId} AND game_id = ${gameId}
				  AND created_at > NOW() - ${cooldownInterval}
				LIMIT 1
			`);
			if (recent.length > 0) {
				throw new Error(isWtp ? '천천히 입력해 주세요' : '1분에 한번씩만 작성할 수 있습니다');
			}
		}

		// Insert
		const inserted = await db.execute(sql`
			INSERT INTO minigame_game_comments (game_id, user_id, content)
			VALUES (${gameId}, ${userId}, ${trimmed})
			RETURNING id, game_id, user_id, content, created_at
		`);
		const row = (inserted as any[])[0];

		// Get user info
		const userInfo = await db.execute(sql`
			SELECT a.name as nickname, mt.title_name
			FROM attendees a
			LEFT JOIN minigame_user_points mup ON a.id = mup.user_id
			LEFT JOIN minigame_titles mt ON mup.equipped_title_id = mt.id
			WHERE a.id = ${userId}
		`);
		const user = (userInfo as any[])[0];

		const comment: CommentWithUser = {
			...row,
			nickname: user?.nickname ?? '익명',
			title_name: user?.title_name ?? null,
		};

		if (isParty) {
			// 고정팟: 멤버 전원에게 실시간 채팅 알림
			try {
				await this.notifyPartyMembers(userId, gameId, comment, user?.nickname ?? '익명');
			} catch (e) {
				console.error('[CommentService] notifyPartyMembers failed:', e);
			}
		} else if (isWtp) {
			// wtp: 멘션 없음, 대신 참여자 전원에게 메시지 알림
			try {
				await this.notifyWtpParticipants(userId, gameId, user?.nickname ?? '익명');
			} catch (e) {
				console.error('[CommentService] notifyWtpParticipants failed:', e);
			}
		} else {
			// 미니게임: 멘션 알림
			const mentions = this.parseMentions(trimmed);
			if (mentions.length > 0) {
				try {
					await this.processMentions(userId, gameId, comment.id, mentions, user?.nickname ?? '익명');
				} catch (e) {
					console.error('[CommentService] processMentions failed:', e);
				}
			}
		}

		return { comment };
	},

	async deleteComment(commentId: number, userId: number, isAdmin: boolean): Promise<void> {
		if (isAdmin) {
			const res = await db.execute(sql`
				DELETE FROM minigame_game_comments WHERE id = ${commentId} RETURNING id
			`);
			if (res.length === 0) throw new Error('댓글을 찾을 수 없습니다');
		} else {
			const res = await db.execute(sql`
				DELETE FROM minigame_game_comments WHERE id = ${commentId} AND user_id = ${userId} RETURNING id
			`);
			if (res.length === 0) throw new Error('삭제 권한이 없습니다');
		}
	},

	/**
	 * Parse @mentions from comment content.
	 * Matches @username patterns (Korean/English/numbers, 1-50 chars).
	 */
	parseMentions(content: string): string[] {
		const regex = /@([\w가-힣]{1,50})/g;
		const mentions: string[] = [];
		let match;
		while ((match = regex.exec(content)) !== null) {
			if (!mentions.includes(match[1])) {
				mentions.push(match[1]);
			}
		}
		return mentions;
	},

	async notifyPartyMembers(fromUserId: number, gameId: string, comment: CommentWithUser, fromName: string) {
		const partyId = parseInt(gameId.slice(6)); // 'party_' = 6 chars
		const membersResult = await db.execute(sql`
			SELECT gpm.attendee_id, gp.name as party_name
			FROM game_party_members gpm
			JOIN game_parties gp ON gpm.party_id = gp.id
			WHERE gpm.party_id = ${partyId}
		`);
		const partyName = (membersResult[0] as any)?.party_name ?? '고정팟';
		const referenceId = `party_chat:${partyId}`;

		for (const row of membersResult as any[]) {
			if (row.attendee_id === fromUserId) continue;
			// SSE 실시간 채팅 메시지 전달
			emitPartyChatMessage(row.attendee_id, { partyId, comment });
			// DB 알림 저장 (upsert로 중복 방지)
			await NotificationService.upsertNotify(
				row.attendee_id,
				{
					type: 'party_message',
					title: '고정팟 대화',
					body: `${fromName}님이 "${partyName}" 대화방에 메시지를 보냈습니다`,
					url: `/party/${partyId}/chat`,
				},
				fromUserId,
				referenceId
			);
		}
	},

	async notifyWtpParticipants(fromUserId: number, gameId: string, fromName: string) {
		const wtpId = parseInt(gameId.slice(4));
		const [postResult, participantsResult] = await Promise.all([
			db.execute(sql`SELECT game_name FROM want_to_play_posts WHERE id = ${wtpId}`),
			db.execute(sql`SELECT attendee_id FROM want_to_play_participants WHERE post_id = ${wtpId}`),
		]);
		const gameName = (postResult[0] as any)?.game_name ?? '같이하기';
		const referenceId = `wtp:${wtpId}`;

		for (const row of participantsResult as any[]) {
			if (row.attendee_id === fromUserId) continue;
			await NotificationService.upsertNotify(
				row.attendee_id,
				{
					type: 'wtp_message',
					title: '같이하기 대화',
					body: `${fromName}님이 "${gameName}" 대화방에 메시지를 보냈습니다`,
					url: '/?tab=games',
				},
				fromUserId,
				referenceId
			);
		}
	},

	async processMentions(fromUserId: number, gameId: string, commentId: number, mentionedNames: string[], fromName: string) {
		if (mentionedNames.length === 0) return;

		// Look up user IDs for mentioned names
		const nameConditions = sql.join(mentionedNames.map(n => sql`${n}`), sql`, `);
		const users = await db.execute(sql`
			SELECT id, name FROM attendees
			WHERE name IN (${nameConditions})
		`);

		let gameName: string;
		let mentionUrl: string;
		if (gameId.startsWith('wtp_')) {
			const wtpId = parseInt(gameId.slice(4));
			const wtpResult = await db.execute(sql`SELECT game_name FROM want_to_play_posts WHERE id = ${wtpId}`);
			gameName = (wtpResult[0] as any)?.game_name ?? '같이하기';
			mentionUrl = '/?tab=games';
		} else {
			gameName = GAME_REGISTRY[gameId]?.name ?? gameId;
			mentionUrl = `/minigames/start/${gameId}?tab=comments`;
		}

		for (const u of users as any[]) {
			if (u.id === fromUserId) continue; // Don't notify self
			await NotificationService.notify(
				u.id,
				{
					type: 'mention',
					title: '멘션 알림',
					body: `${fromName}님이 ${gameName} 댓글에서 당신을 언급했습니다`,
					url: mentionUrl,
				},
				fromUserId,
				`game:${gameId}:comment:${commentId}`
			);
		}
	},
};
