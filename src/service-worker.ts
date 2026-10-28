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

self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll([...ASSETS]);
	}

	event.waitUntil(addFilesToCache());
	// 새 SW가 설치되면 즉시 활성화 (대기 상태 건너뜀)
	(self as any).skipWaiting();
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
				const cached = await caches.match(OFFLINE_PAGE);
				// 캐시에 없으면(설치 전이거나 캐시가 비워진 경우) 브라우저 기본
				// 오류 화면으로 넘긴다. 빈 응답을 만들어 주면 더 헷갈린다.
				return cached ?? Response.error();
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
