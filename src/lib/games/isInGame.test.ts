import { describe, it, expect } from 'vitest';
import { isInGame } from './isInGame';
import { GAME_REGISTRY } from './gameRegistry';

describe('isInGame', () => {
	it('레지스트리의 모든 게임 경로를 플레이 중으로 본다', () => {
		for (const cfg of Object.values(GAME_REGISTRY)) {
			const path = cfg.gameUrl.split('?')[0];
			expect(isInGame(path), `${cfg.id} (${path})`).toBe(true);
		}
	});

	it('레지스트리에 없지만 라우트가 살아있는 티츄도 포함한다', () => {
		expect(isInGame('/minigames/tichu')).toBe(true);
	});

	it('예전에 하드코딩 목록에서 빠져 있던 게임들을 포함한다', () => {
		// 이 게임들이 빠져 있어서 플레이 도중 버전 체크 리로드가 걸렸다
		for (const path of [
			'/minigames/block-blaster',
			'/minigames/freecell',
			'/minigames/2048',
			'/minigames/triple-tile',
			'/minigames/train-tracks',
			'/minigames/regicide',
			'/minigames/match-crash'
		]) {
			expect(isInGame(path), path).toBe(true);
		}
	});

	it('쿼리스트링이 붙어도 판별한다', () => {
		expect(isInGame('/minigames/sudoku')).toBe(true);
		expect(isInGame('/minigames/block-blaster')).toBe(true);
	});

	it('라운지와 시작 화면은 게임이 아니다', () => {
		expect(isInGame('/minigames')).toBe(false);
		expect(isInGame('/minigames/start/freecell')).toBe(false);
		expect(isInGame('/minigames/start/block-blaster')).toBe(false);
	});

	it('오락실 밖 경로는 게임이 아니다', () => {
		for (const path of ['/', '/mypage', '/games', '/admin', '/rankings']) {
			expect(isInGame(path), path).toBe(false);
		}
	});
});
