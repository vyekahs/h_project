/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = new Set([
	...build, // the app itself
	...files  // everything in `static`
]);

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

	// 정적 에셋만 캐시에서 서빙, 나머지는 모두 통과
	if (!ASSETS.has(url.pathname)) return;

	event.respondWith(
		caches.open(CACHE).then(cache =>
			cache.match(event.request).then(cached =>
				cached || fetch(event.request)
			)
		)
	);
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
