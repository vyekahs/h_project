import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actions } from './+page.server';

// +page.server 가 DB에 접근하지 않도록 모킹 (import 시점 부작용 방지)
vi.mock('$lib/server/db/index', () => ({
	db: { execute: vi.fn(), transaction: vi.fn() }
}));

/**
 * 대시보드 페이지의 모든 <form action="?/xxx"> 참조가 실제 서버 액션과 일치하는지 검증.
 * SvelteKit 액션 이름은 대소문자를 구분하므로 오타(예: toggleblacklist vs toggleBlacklist)는
 * 런타임 404 + 조용한 실패로 이어진다. 이 테스트가 그걸 배포 전에 잡는다.
 */
describe('dashboard form action refs', () => {
	const page = readFileSync(
		resolve(process.cwd(), 'src/routes/admin/(dashboard)/+page.svelte'),
		'utf-8'
	);
	const referenced = [...page.matchAll(/action="\?\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
	const defined = new Set(Object.keys(actions));

	it('references at least one action', () => {
		expect(referenced.length).toBeGreaterThan(0);
	});

	it.each([...new Set(referenced)])('?/%s has a matching server action', (name) => {
		expect(defined.has(name)).toBe(true);
	});
});
