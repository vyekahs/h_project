/**
 * 동시 실행 개수를 제한하면서 배열을 처리한다.
 *
 * `Promise.all(items.map(fn))`은 항목 수만큼 작업을 한꺼번에 띄운다. 각 작업이
 * DB 쿼리나 외부 요청을 하면 인원이 늘어난 만큼 커넥션 풀(max 20)이 순식간에
 * 바닥나고, 그 뒤에 들어온 일반 요청까지 커넥션을 기다리며 멈춘다.
 * 반대로 순차 처리하면 항목 수만큼 지연이 누적된다.
 *
 * 이 헬퍼는 그 중간 — 워커를 limit개만 띄우고 각 워커가 큐에서 다음 항목을
 * 가져가는 방식이라, 총 동시 실행이 절대 limit을 넘지 않는다.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	if (items.length === 0) return [];

	const workerCount = Math.max(1, Math.min(limit, items.length));
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker() {
		for (;;) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}
