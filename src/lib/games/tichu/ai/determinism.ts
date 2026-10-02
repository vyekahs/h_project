/**
 * 측정용 결정론 스위치.
 *
 * 사람처럼 보이게 넣은 흔들림은 A/B 측정에서는 순수 노이즈다. 딜을 고정해도
 * 이 흔들림만으로 티츄 성공률이 약 4%p 요동쳐서, 그 이하의 효과를 볼 수 없다.
 *
 * strategy.ts가 아니라 별도 모듈에 두는 이유: monteCarlo.ts도 이 스위치를
 * 봐야 하는데 strategy.ts가 monteCarlo.ts를 import하므로 순환이 된다.
 */
export const __deterministic = { on: false };

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hashIds(items: { id: string }[], salt: number): number {
	let h = 2166136261 ^ salt;
	for (const it of items) {
		for (let i = 0; i < it.id.length; i++) {
			h ^= it.id.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
	}
	return h >>> 0;
}

/**
 * 몬테카를로 표본 추출용 셔플.
 *
 * 결정론 모드에서는 입력 카드 집합과 표본 번호로 시드를 만든다. 같은 입력이면
 * 같은 표본이 나오므로 판단이 재현 가능해진다 — 이게 없으면 "남의 패를
 * 안 본다" 같은 검사가 표본 흔들림 때문에 간헐적으로 실패하고, A/B 측정에도
 * 없앨 수 없는 잔여 노이즈가 남는다.
 */
export function sampleShuffle<T extends { id: string }>(arr: T[], sampleIndex: number): T[] {
	const a = [...arr];
	const rand = __deterministic.on
		? mulberry32(hashIds(arr, sampleIndex * 0x9e3779b1))
		: Math.random;
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
