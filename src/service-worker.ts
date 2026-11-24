/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = new Set([
	...build, // the app itself
	...files  // everything in `static`
]);

/**
 * 서버가 꺼져 있을 때 보여줄 안내 페이지.
 *
 * 점검 등으로 서버가 아예 내려가면 서버가 내보내는 페이지는 하나도 못 보여준다.
 * 그때 브라우저 기본 오류 화면("사이트에 연결할 수 없음")이 뜨면 회원은 앱이
 * 고장난 줄 안다. 미리 캐시해 둔 정적 페이지를 대신 내보낸다.
 *
 * static/에 있으므로 위 files에 포함되어 설치 때 함께 캐시된다.
 *
 * 주의: 회원 기기에 서비스워커가 들어가 있어야 동작한다. 서버가 멈춘 뒤에
 * 배포해도 늦으므로 **중단 전에 한 번 배포**해야 한다. 아래 skipWaiting과
 * clients.claim 덕에 배포 후 앱을 한 번 열면 바로 갱신된다.
 *
 * 검증은 운영 빌드로 해야 한다(dev 모드는 build 목록이 비어 동작이 다르다):
 *   npm run build && node build        # 띄운 뒤 브라우저로 한 번 접속
 *   → 서버를 죽이고 다시 접속하면 이 페이지가 떠야 한다
 * 실제로 그렇게 확인했다(서버 SIGKILL 후 안내 페이지 표시).
 */
const OFFLINE_PAGE = '/offline.html';

/**
 * 캐시가 통째로 날아가도 보여줄 최소 안내.
 *
 * 서버가 멈췄을 때 캐시에 안내 페이지가 없으면 예전에는 Response.error()를
 * 돌려줬다. 브라우저에서는 기본 오류 화면이 뜨지만, **홈 화면에 추가한 PWA에는
 * 그 화면이 없다** — 주소창도 오류 UI도 없어서 그냥 흰 화면이 된다. 실제로
 * 중단 시험에서 그렇게 나왔다.
 *
 * 그래서 마지막 수단은 캐시에 의존하지 않는다. 이 문자열은 서비스워커 안에
 * 있으므로 캐시가 비어 있어도 반드시 나온다.
 *
 * 날짜는 넣지 않는다. 여기 적으면 static/offline.html과 따로 놀아 한쪽만
 * 낡는다. 구체적인 일정은 캐시된 쪽(정상 경로)이 보여준다.
 */
const FALLBACK_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>정기 점검 중</title><style>
:root{color-scheme:light dark;--bg:#fff;--fg:#212529;--dim:#868e96}
@media(prefers-color-scheme:dark){:root{--bg:#1a1b1e;--fg:#e5e7eb;--dim:#9ca3af}}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--fg);display:flex;align-items:center;justify-content:center;
text-align:center;padding:1.5rem;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:var(--dim);font-size:.9375rem;line-height:1.6}
</style></head><body><main><div style="font-size:3rem;line-height:1">🛠️</div>
<h1>정기 점검 중입니다</h1><p>서버 점검 중이라 잠시 접속할 수 없습니다.<br>점검이 끝나면 그대로 다시 열립니다.</p>
</main></body></html>`;

function maintenanceResponse(): Response {
	return new Response(FALLBACK_HTML, {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);

		// 안내 페이지부터, 따로 캐시한다.
		//
		// 예전에는 전부 cache.addAll 한 번으로 넣었는데, addAll은 하나라도 실패하면
		// 통째로 거부된다. 에셋이 197개라 그중 하나만 어긋나도 아무것도 캐시되지
		// 않고, 아래 activate가 옛 캐시까지 지워서 결국 빈 상태가 된다.
		// 가장 중요한 파일이 가장 덜 중요한 파일 하나 때문에 사라지면 안 된다.
		await cache.add(OFFLINE_PAGE).catch(() => {});

		// 나머지는 하나씩, 실패를 허용한다. 일부가 빠져도 앱은 네트워크로 받으면
		// 되지만, 통째로 비는 것은 복구할 방법이 없다.
		// [...Set]으로 펼친다. Set.values().map()은 이터레이터 헬퍼라 구형 브라우저에
		// 없고, 서비스워커가 설치 단계에서 죽으면 캐시가 통째로 비는 쪽이 된다.
		await Promise.all([...ASSETS].map((asset) => cache.add(asset).catch(() => {})));
	}

	// 안내 페이지가 캐시된 뒤에 활성화한다. skipWaiting을 먼저 부르면 캐시가
	// 채워지기 전에 이 워커가 페이지를 넘겨받아, 그 사이 서버가 멈추면
	// 보여줄 것이 없다.
	event.waitUntil(addFilesToCache().then(() => (self as any).skipWaiting()));
});

self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
	// 새 SW가 즉시 모든 클라이언트를 제어
	(event as any).waitUntil((self as any).clients.claim());
});

self.addEventListener('fetch', (e) => {
	const event = e as FetchEvent;
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;

	// 정적 에셋은 캐시에서 서빙
	if (ASSETS.has(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(cache =>
				cache.match(event.request).then(cached =>
					cached || fetch(event.request)
				)
			)
		);
		return;
	}

	// 페이지 이동은 네트워크 우선, 실패하면 안내 페이지.
	//
	// 네비게이션만 가로챈다. fetch/API 요청까지 HTML로 바꿔 돌려주면 앱 코드가
	// JSON을 기대하던 자리에서 엉뚱하게 깨진다 — 호출한 쪽이 실패를 실패로
	// 받아야 재시도든 오류 표시든 제대로 한다.
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(async () => {
				// 캐시에 없어도(설치 직후이거나 캐시가 비워진 경우) 반드시 무언가
				// 보여준다. Response.error()를 돌려주면 PWA에서는 흰 화면이 된다.
				const cached = await caches.match(OFFLINE_PAGE);
				return cached ?? maintenanceResponse();
			})
		);
		return;
	}

	// 나머지는 모두 통과
});

// Push notification handler
self.addEventListener('push', (e) => {
	const event = e as PushEvent;
	if (!event.data) return;

	event.waitUntil(
		(self as unknown as ServiceWorkerGlobalScope).clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientList) => {
				const data = event.data!.json();
				const targetUrl = data.url || '/';

				// 해당 URL의 페이지를 보고 있으면 push 알림 스킵 (SSE 토스트가 처리)
				const isViewingTarget = clientList.some((c) => {
					if (!c.focused) return false;
					try {
						const clientUrl = new URL(c.url);
						return clientUrl.pathname === targetUrl || clientUrl.pathname.startsWith(targetUrl);
					} catch {
						return false;
					}
				});
				if (isViewingTarget) return;

				return (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(
					data.title,
					{
						body: data.body,
						icon: '/icon-192.png',
						badge: '/icon-192.png',
						data: { url: targetUrl },
						tag: data.type, // 같은 타입 알림 그룹핑
						renotify: true,
					}
				);
			})
	);
});

// 알림 클릭 시 해당 URL로 이동
self.addEventListener('notificationclick', (e) => {
	const event = e as NotificationEvent;
	event.notification.close();

	const url = event.notification.data?.url || '/';

	event.waitUntil(
		(self as unknown as ServiceWorkerGlobalScope).clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientList) => {
				// 기존 열린 창이 있으면 포커스 + 네비게이션
				for (const client of clientList) {
					if ('focus' in client) {
						(client as WindowClient).navigate(url);
						return (client as WindowClient).focus();
					}
				}
				// 없으면 새 창 열기
				return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(url);
			})
	);
});
