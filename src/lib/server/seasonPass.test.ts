import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/*
    2026-09-10, 「만료된 정기권이 다 사라졌다」를 추적하는 데 반나절이 들었다.
    원인 후보를 하나씩 지우는 데 오래 걸린 이유는 정기권 만료일을 쓰는 곳이
    여러 군데였고, 그중 하나(회원 상세 페이지)가 아무 이력도 남기지 않았기
    때문이다. 무슨 일이 있었는지 DB에 물어볼 방법이 없었다.

    그래서 규칙을 코드로 고정한다: attendees.season_pass_expires_at 을 쓰는 곳은
    seasonPass.ts 하나뿐이다. 되돌리기는 그 기록을 되감는 역할이라 예외다.

    이 테스트가 깨졌다면 새 쓰기 경로가 생긴 것이다. 그 경로가 이력을 남기지
    않으면 같은 사고가 반복된다 — seasonPass.ts 의 함수를 부르도록 고칠 것.
*/
const WRITERS_ALLOWED = new Set(['src/lib/server/seasonPass.ts', 'src/lib/server/adminUndo.ts']);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(ts|svelte)$/.test(name)) out.push(full);
	}
	return out;
}

describe('정기권 쓰기 경로', () => {
	const root = process.cwd();
	const files = walk(resolve(root, 'src'));

	const writers = files.filter((f) => {
		const src = readFileSync(f, 'utf-8');
		return /UPDATE\s+attendees\s+SET[\s\S]{0,120}?season_pass_expires_at\s*=/i.test(src);
	});

	it('만료일을 쓰는 파일은 허용된 곳뿐이다', () => {
		const rel = writers.map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).sort();
		expect(rel).toEqual([...WRITERS_ALLOWED].sort());
	});

	it('발급·조정·해지가 모두 이력을 남긴다', () => {
		const src = readFileSync(resolve(root, 'src/lib/server/seasonPass.ts'), 'utf-8');
		for (const fn of ['issuePass', 'adjustPassDays', 'cancelPass']) {
			const body = src.slice(src.indexOf(`export async function ${fn}`));
			const end = body.indexOf('\nexport ', 1);
			expect(
				(end === -1 ? body : body.slice(0, end)).includes('INSERT INTO season_pass_logs'),
				`${fn} 이 season_pass_logs 에 쓰지 않는다`
			).toBe(true);
		}
	});

	it('캐시 재구성은 기본이 dry-run 이다', () => {
		const src = readFileSync(resolve(root, 'src/lib/server/seasonPass.ts'), 'utf-8');
		const body = src.slice(src.indexOf('export async function rebuildPassCache'));
		expect(body.includes('if (!opts.apply) return')).toBe(true);
	});
});
