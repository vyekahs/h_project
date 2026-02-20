/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [
	...build, // the app itself
	...files  // everything in `static`
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove previous cached data from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (e) => {
	const event = e as FetchEvent;
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip: API requests, different origins, data requests, navigation, SSE
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api')) return;
	if (url.pathname.includes('__data.json')) return;
	if (event.request.mode === 'navigate') return;
	if (event.request.headers.get('accept')?.includes('text/event-stream')) return;

	async function respond(): Promise<Response> {
		const cache = await caches.open(CACHE);

		// Static assets (build/files) → cache first
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(event.request);
			if (response) return response;
		}

		// 기타 리소스 (이미지, 폰트 등) → network first, 오프라인 시 캐시
		try {
			const response = await fetch(event.request);
			if (response.status === 200 && response.type === 'basic') {
				cache.put(event.request, response.clone()).catch(() => {});
			}
			return response;
		} catch {
			const cached = await cache.match(event.request);
			if (cached) return cached;
			return new Response('Offline', { status: 408 });
		}
	}

	event.respondWith(respond());
});
