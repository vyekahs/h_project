import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { NotificationService } from './notificationService';
import { GAME_REGISTRY } from '$lib/games/gameRegistry';

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

		// Spam check: 60s cooldown per user per game
		const recent = await db.execute(sql`
			SELECT 1 FROM minigame_game_comments
			WHERE user_id = ${userId} AND game_id = ${gameId}
			  AND created_at > NOW() - INTERVAL '60 seconds'
			LIMIT 1
		`);
		if (recent.length > 0) {
			throw new Error('1분에 한번씩만 작성할 수 있습니다');
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

		// Parse mentions and send notifications (non-blocking — don't fail comment on notification error)
		const mentions = this.parseMentions(trimmed);
		if (mentions.length > 0) {
			try {
				await this.processMentions(userId, gameId, comment.id, mentions, user?.nickname ?? '익명');
			} catch (e) {
				console.error('[CommentService] processMentions failed:', e);
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

	async processMentions(fromUserId: number, gameId: string, commentId: number, mentionedNames: string[], fromName: string) {
		if (mentionedNames.length === 0) return;

		// Look up user IDs for mentioned names
		const nameConditions = sql.join(mentionedNames.map(n => sql`${n}`), sql`, `);
		const users = await db.execute(sql`
			SELECT id, name FROM attendees
			WHERE name IN (${nameConditions})
		`);

		const gameName = GAME_REGISTRY[gameId]?.name ?? gameId;

		for (const u of users as any[]) {
			if (u.id === fromUserId) continue; // Don't notify self
			await NotificationService.notify(
				u.id,
				{
					type: 'mention',
					title: '멘션 알림',
					body: `${fromName}님이 ${gameName} 댓글에서 당신을 언급했습니다`,
					url: `/minigames/start/${gameId}?tab=comments`,
				},
				fromUserId,
				`game:${gameId}:comment:${commentId}`
			);
		}
	},
};
