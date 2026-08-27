// 페이지가 느릴 때 "내 와이파이/셀룰러가 느린 건지"를 감지해서 알려주는 스토어.
// 서버가 느린 건지 네트워크가 느린 건지 구분하기 위해, DB 조회가 전혀 없는
// /api/ping 엔드포인트의 왕복 시간만 측정한다 — 이게 느리면 서버 로직과 무관하게
// 순수 네트워크(전송) 구간이 느리다는 뜻이다. 가능하면 브라우저의
// Network Information API(navigator.connection)도 보조 신호로 같이 본다.

let isSlowNetwork = $state(false);

const PING_TIMEOUT_MS = 5000;
const SLOW_THRESHOLD_MS = 600;
const CHECK_INTERVAL_MS = 20000;
const QUICK_RECHECK_MS = 3000;

let checking = false;
let consecutiveSlowCount = 0;
let consecutiveFastCount = 0;
let started = false;

export function getIsSlowNetwork() {
	return isSlowNetwork;
}

async function pingOnce(): Promise<number | null> {
	const start = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
	try {
		const res = await fetch('/api/ping', { cache: 'no-store', signal: controller.signal });
		if (!res.ok) return null;
		await res.json();
		return performance.now() - start;
	} catch {
		// 타임아웃/네트워크 에러 — 매우 느리거나 끊긴 것으로 간주
		return null;
	} finally {
		clearTimeout(timer);
	}
}

// Network Information API — 지원 브라우저(대부분 Chrome/Android 계열)에서 즉시 판단.
// Safari 등 미지원 브라우저에서는 null 반환, ping 측정 결과만으로 판단한다.
function evaluateConnectionApi(): boolean | null {
	const conn = (navigator as any).connection;
	if (!conn) return null;
	if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return true;
	if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1) return true;
	if (typeof conn.rtt === 'number' && conn.rtt > 500) return true;
	return false;
}

async function checkOnce() {
	if (checking) return;
	checking = true;
	try {
		const apiSlow = evaluateConnectionApi();
		const rtt = await pingOnce();
		const pingSlow = rtt === null || rtt > SLOW_THRESHOLD_MS;
		const slow = apiSlow === true || pingSlow;

		if (slow) {
			consecutiveSlowCount++;
			consecutiveFastCount = 0;
		} else {
			consecutiveFastCount++;
			consecutiveSlowCount = 0;
		}

		if (consecutiveSlowCount >= 2) {
			isSlowNetwork = true;
		} else if (consecutiveFastCount >= 1) {
			isSlowNetwork = false;
		} else if (slow && consecutiveSlowCount === 1) {
			// 처음 느린 걸 감지하면 20초 주기를 기다리지 않고 3초 뒤 바로 재확인
			// (한 번의 튐으로 오탐하지 않으면서도 반응은 빠르게)
			setTimeout(checkOnce, QUICK_RECHECK_MS);
		}
	} finally {
		checking = false;
	}
}

export function initNetworkHealthCheck() {
	if (started || typeof window === 'undefined') return;
	started = true;

	checkOnce();

	setInterval(() => {
		if (document.visibilityState === 'visible') checkOnce();
	}, CHECK_INTERVAL_MS);

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') checkOnce();
	});

	const conn = (navigator as any).connection;
	if (conn && typeof conn.addEventListener === 'function') {
		conn.addEventListener('change', checkOnce);
	}
}
