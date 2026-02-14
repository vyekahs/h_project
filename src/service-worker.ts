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

	// Skip: API requests, different origins
	if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

	async function respond() {
		const cache = await caches.open(CACHE);

		// Static assets (build/files) → cache first
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(event.request);
			if (response) return response;
		}

		// 데이터 요청 및 페이지 네비게이션 → network only (항상 최신 데이터)
		// SvelteKit __data.json, 페이지 HTML 등은 캐시하지 않음
		if (url.pathname.includes('__data.json') ||
			event.request.headers.get('accept')?.includes('text/html')) {
			try {
				return await fetch(event.request);
			} catch {
				return new Response('Offline', { status: 408 });
			}
		}

		// 기타 리소스 (이미지, 폰트 등) → network first, 오프라인 시 캐시
		try {
			const response = await fetch(event.request);
			if (response.status === 200) {
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
