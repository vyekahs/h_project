/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
import { PUBLIC_VAPID_KEY } from '$env/static/public';

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
//
// 푸시를 받으면 **항상** 알림을 띄운다. 예전에는 알림 대상 페이지를 보고 있으면
// 건너뛰었는데(SSE 토스트가 처리), 아이폰 사파리는 푸시를 받고 알림을 안 띄우는 일이
// 반복되면 구독을 몰래 취소한다. 서버가 이미 앱을 보고 있는 사람(SSE 연결)에게는
// 푸시를 보내지 않으므로, 여기서 건너뛸 일은 거의 없었다.
self.addEventListener('push', (e) => {
	const event = e as PushEvent;
	const sw = self as unknown as ServiceWorkerGlobalScope;
	let data: { title?: string; body?: string; url?: string; type?: string } = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		// 형식이 깨진 푸시여도 알림은 띄운다
	}

	event.waitUntil(
		sw.registration.showNotification(data.title || '새 알림', {
			body: data.body || '',
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { url: data.url || '/' },
			tag: data.type, // 같은 타입 알림 그룹핑
			renotify: true,
		})
	);
});

// 브라우저가 구독(주소)을 바꾸면 새 구독을 서버에 올린다.
// 이 처리가 없어서 폰에서 구독이 바뀌어도 서버는 옛 주소로 계속 보냈다.
self.addEventListener('pushsubscriptionchange', (e) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const event = e as any;
	const sw = self as unknown as ServiceWorkerGlobalScope;
	const toBase64url = (buf: ArrayBuffer | null) =>
		buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

	event.waitUntil((async () => {
		const oldSub: PushSubscription | null = event.oldSubscription ?? null;
		const newSub: PushSubscription = event.newSubscription
			?? await sw.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: oldSub?.options.applicationServerKey ?? urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
			});

		await fetch('/api/push/subscribe', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				endpoint: newSub.endpoint,
				keys: { p256dh: toBase64url(newSub.getKey('p256dh')), auth: toBase64url(newSub.getKey('auth')) },
			}),
		});
		if (oldSub && oldSub.endpoint !== newSub.endpoint) {
			await fetch('/api/push/unsubscribe', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: oldSub.endpoint }),
			});
		}
	})().catch(() => {}));
});

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const raw = atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

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
