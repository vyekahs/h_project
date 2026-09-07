/**
 * 화면 상태 초기화 누락 감지.
 *
 * gameState.svelte.ts의 상태는 컴포넌트가 아니라 모듈 스코프라 화면을 나갔다
 * 와도 살아남는다. 판을 새로 시작하거나 이어하기 할 때 초기화되지 않으면
 * 이전 판의 배너·모달이 그대로 떠 있는다(실제로 "AI 아랭 승리"가 계속 뜨는
 * 버그가 있었다).
 *
 * 새 상태를 추가할 때 resetTransientUi에 넣는 것을 잊기 쉬우므로,
 * 소스를 읽어 자동으로 확인한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 판이 바뀌어도 유지되어야 하는 상태 (설정·튜토리얼·전역) */
const PERSISTENT = new Set([
	// 설정
	'partnerStrategy', 'aiSpeed', 'targetScore',
	// 엔진/뷰 자체
	'engine', 'view', 'stateVersion', 'lastPhase',
	// 판과 무관하게 유지
	'savedGameAvailable', 'showVisitPrompt', 'toasts', 'selectedCards',
	// 튜토리얼 (별도 수명주기)
	'tutorialEngine', 'tutorialStep', 'tutorialStepIndex', 'tutorialTotalSteps',
	'highlightCardIds', 'tutorialLessonId', 'showGrandTichuInTutorial'
]);

describe('화면 상태 초기화', () => {
	it('모든 일시적 상태가 resetTransientUi에서 초기화된다', () => {
		const src = readFileSync(
			join(process.cwd(), 'src/routes/minigames/tichu/gameState.svelte.ts'),
			'utf-8'
		);

		const declared = [...src.matchAll(/^\tlet (\w+) = \$state[<(]/gm)].map(m => m[1]);
		expect(declared.length, '상태 선언을 하나도 못 찾음 — 정규식 확인 필요').toBeGreaterThan(10);

		const fnStart = src.indexOf('function resetTransientUi()');
		expect(fnStart, 'resetTransientUi를 못 찾음').toBeGreaterThan(0);
		const fnEnd = src.indexOf('\n\t}', fnStart);
		const body = src.slice(fnStart, fnEnd);

		const missing = declared.filter(
			name => !PERSISTENT.has(name) && !new RegExp(`\\b${name}\\s*=`).test(body)
		);
		expect(missing, `resetTransientUi에서 초기화되지 않는 상태: ${missing.join(', ')}`).toEqual([]);
	});

	it('resetTransientUi가 모든 진입점에서 호출된다', () => {
		const src = readFileSync(
			join(process.cwd(), 'src/routes/minigames/tichu/gameState.svelte.ts'),
			'utf-8'
		);
		const entryPoints = ['function startGame()', 'function resumeGame()', 'function cleanup()'];
		const missing: string[] = [];
		for (const ep of entryPoints) {
			const i = src.indexOf(ep);
			if (i < 0) { missing.push(`${ep} 없음`); continue; }
			// 함수 본문 대략 범위
			const body = src.slice(i, i + 1600);
			if (!body.includes('resetTransientUi()')) missing.push(ep);
		}
		expect(missing, `resetTransientUi를 호출하지 않는 진입점: ${missing.join(', ')}`).toEqual([]);
	});
});
