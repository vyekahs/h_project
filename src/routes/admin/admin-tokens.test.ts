import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * 어드민 디자인 토큰이 /admin 전체에 닿는지 지키는 테스트.
 *
 * 실제로 났던 사고: --space-* / --text-* 같은 토큰이
 * src/routes/admin/(dashboard)/+layout.svelte 의 .force-light 블록 안에만
 * 선언돼 있었다. /admin/login 과 /admin/qr 은 (dashboard) 라우트 그룹 밖이라
 * 토큰을 받지 못했는데도 그 두 파일이 var(--space-N) 을 쓰고 있었다.
 * CSS 는 정의 없는 var() 를 만나면 선언 전체를 버리므로
 * .login-box { padding: var(--space-6) } 가 조용히 padding:0px 이 됐다.
 * 빌드도 svelte-check 도 통과했고, 화면에서만 무너졌다 — 그래서 테스트로 잡는다.
 *
 * 못박는 것 셋:
 *  1) 토큰의 원본은 src/lib/styles/admin-tokens.css 하나뿐이다.
 *  2) /admin/* 전부를 덮는 src/routes/admin/+layout.svelte 가 그 파일을 불러오고,
 *     토큰이 걸리는 .force-light 로 감싼다.
 *  3) /admin 아래 .svelte 가 대비값 없이 쓰는 var(--x) 는 전부 실제로 선언돼 있다.
 *     (var(--x, 400) 처럼 대비값이 있으면 선언이 무효가 되지 않으므로 허용한다.)
 */

const ROOT = process.cwd();
const TOKENS_CSS = resolve(ROOT, 'src/lib/styles/admin-tokens.css');
const ADMIN_LAYOUT = resolve(ROOT, 'src/routes/admin/+layout.svelte');
const ADMIN_DIR = resolve(ROOT, 'src/routes/admin');

/** 화면 리듬을 정하는 스케일 토큰 — 여기저기서 다시 선언되면 값이 갈라진다 */
const SCALE_PREFIXES = ['--space-', '--text-', '--radius-', '--weight-'];

function svelteFilesUnder(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...svelteFilesUnder(p));
		else if (name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/** `--foo: value` 형태로 선언된 커스텀 프로퍼티 이름 */
function declaredIn(css: string): Set<string> {
	return new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** 대비값 없이 `var(--foo)` 로만 참조된 이름 — 선언이 없으면 규칙이 통째로 버려진다 */
function referencedWithoutFallback(css: string): Set<string> {
	return new Set(
		[...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]*[a-zA-Z0-9])\s*\)/g)].map((m) => m[1])
	);
}

const tokensCss = readFileSync(TOKENS_CSS, 'utf-8');
const declaredTokens = declaredIn(tokensCss);
const adminFiles = svelteFilesUnder(ADMIN_DIR);

describe('어드민 디자인 토큰 도달 범위', () => {
	it('토큰은 .force-light 로 감싼 한 파일에서만 선언된다', () => {
		expect(tokensCss).toMatch(/^\.force-light\s*\{/m);
		for (const t of ['--space-1', '--space-6', '--text-xs', '--radius-card', '--weight-bold']) {
			expect(declaredTokens.has(t)).toBe(true);
		}
	});

	it('/admin 전체를 덮는 레이아웃이 토큰을 불러오고 .force-light 로 감싼다', () => {
		const layout = readFileSync(ADMIN_LAYOUT, 'utf-8');
		// 줄 시작에서 찾는다 — 주석 처리된 import 를 통과시키면 안 된다
		expect(layout).toMatch(/^\s*import\s+['"]\$lib\/styles\/admin-tokens\.css['"]/m);
		expect(layout).toMatch(/class="[^"]*force-light/);
		expect(layout).toMatch(/@render children\(\)/);
	});

	it('라우트 그룹 밖의 화면도 같은 레이아웃 아래에 있다', () => {
		// (dashboard) 그룹 밖 화면들이 실제로 존재하고, 위 레이아웃이 이들의 부모다.
		for (const f of ['login/+page.svelte', 'qr/+page.svelte']) {
			expect(adminFiles).toContain(join(ADMIN_DIR, ...f.split('/')));
		}
	});

	it.each(adminFiles.map((f) => [f.slice(ROOT.length + 1), f] as const))(
		'%s — 대비값 없는 var() 가 전부 선언돼 있다',
		(_label, file) => {
			const source = readFileSync(file, 'utf-8');
			const local = declaredIn(source); // 그 파일이 스스로 선언한 지역 변수는 허용
			const missing = [...referencedWithoutFallback(source)].filter(
				(t) => !declaredTokens.has(t) && !local.has(t)
			);
			expect(missing).toEqual([]);
		}
	);

	it('스케일 토큰을 어드민 .svelte 안에서 다시 선언하지 않는다 (원본은 하나)', () => {
		const dupes: string[] = [];
		for (const file of adminFiles) {
			for (const t of declaredIn(readFileSync(file, 'utf-8'))) {
				if (SCALE_PREFIXES.some((p) => t.startsWith(p))) {
					dupes.push(`${file.slice(ROOT.length + 1)}: ${t}`);
				}
			}
		}
		expect(dupes).toEqual([]);
	});
});

/**
 * 채움 빨강(빨간 배경 + 흰 글자)이 무엇을 뜻하는지 지키는 테스트.
 *
 * 실제로 났던 일: 채움 빨강이 동시에 「하루를 닫음 · 회원 영구 배제 ·
 * 예정 게임 취소 · 되돌릴 수 있는 페널티 1점」을 뜻했다. 넷이 같은 색이면
 * 그 색은 아무것도 말하지 않고, 유일하게 되돌릴 수 없는 것(블랙 등록)이
 * 나머지 셋에 묻힌다. "채움 빨강은 블랙 등록만"이라는 규칙은 한 번 세워도
 * 다음 버튼을 만들 때 조용히 깨지므로 — 실제로 관리 시트 안에서만
 * 참이었다 — 여기서 못박는다.
 *
 * 못박는 것 셋:
 *  1) 채움 빨강은 --danger-solid-* 토큰으로만 입는다 (원본 하나).
 *  2) 그 토큰을 입는 셀렉터는 블랙 등록 경로뿐이다.
 *  3) 확인창의 심각도 'irreversible'도 블랙 등록 하나뿐이다.
 */
describe('채움 빨강은 블랙 등록 경로에만', () => {
	/** 빨간 배경을 만드는 선언. 토큰이든 하드코딩이든 다 잡는다. */
	const FILLED_RED =
		/background(?:-color)?\s*:\s*[^;]*(?:--color-red|--danger-solid|#d32f2f|#ef4444|#b71c1c|(?<![\w-])red(?![\w-]))/i;

	/** `선택자 { 선언 }` 평면 스캔 — @media 안쪽 블록도 이 형태로 잡힌다 */
	function filledRedSelectors(source: string): string[] {
		const out: string[] = [];
		for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			const selector = m[1]
				.replace(/\/\*[\s\S]*?\*\//g, '') // 규칙 앞 주석은 선택자가 아니다
				.trim()
				.replace(/\s+/g, ' ');
			if (!selector || selector.startsWith('@')) continue;
			if (m[2].split(';').some((d) => FILLED_RED.test(d))) out.push(selector);
		}
		return out;
	}

	/**
	 * 블랙리스트 등록 버튼과 그 확인 버튼, 그리고 같은 상태를 가리키는 배지.
	 * 이 목록에 뭔가를 더하려면 먼저 "정말 되돌릴 수 없는가"에 답해야 한다.
	 */
	const ALLOWED = new Set([
		'.btn-role.is-irreversible',
		'.btn-role.is-irreversible:hover',
		'.btn-confirm-action.is-irreversible',
		'.btn-confirm-action.is-irreversible:hover',
		'.badge.blacklist'
	]);

	it('채움 빨강을 입는 셀렉터가 블랙 등록 경로뿐이다', () => {
		const offenders: string[] = [];
		for (const file of adminFiles) {
			for (const sel of filledRedSelectors(readFileSync(file, 'utf-8'))) {
				if (!ALLOWED.has(sel)) offenders.push(`${file.slice(ROOT.length + 1)}: ${sel}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('사다리 토큰의 원본은 admin-tokens.css 하나뿐이다', () => {
		for (const t of [
			'--danger-solid-bg',
			'--danger-solid-bg-hover',
			'--danger-solid-fg',
			'--danger-outline-fg',
			'--danger-outline-bg',
			'--danger-outline-bg-hover'
		]) {
			expect(declaredTokens.has(t)).toBe(true);
		}
		const dupes: string[] = [];
		for (const file of adminFiles) {
			for (const t of declaredIn(readFileSync(file, 'utf-8'))) {
				if (t.startsWith('--danger-')) dupes.push(`${file.slice(ROOT.length + 1)}: ${t}`);
			}
		}
		expect(dupes).toEqual([]);
	});

	it("확인창 심각도 'irreversible'은 블랙리스트 등록 한 곳에서만 쓴다", () => {
		const sites: string[] = [];
		for (const file of adminFiles) {
			const source = readFileSync(file, 'utf-8');
			for (const line of source.split('\n')) {
				if (/severity:\s*'irreversible'/.test(line)) sites.push(line.trim());
			}
		}
		expect(sites).toHaveLength(1);
		expect(sites[0]).toContain('toggleBlacklist');
	});
});
