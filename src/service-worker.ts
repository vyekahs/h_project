/// <reference types="@sveltejs/kit" />
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

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip: API requests, different origins
	if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

	async function respond() {
		const cache = await caches.open(CACHE);

		// Static assets (build/files) → cache first
		if (ASSETS.includes(url.pathname)) {
			const cached = await cache.match(event.request);
			if (cached) return cached;
		}

		// Everything else → network only (no caching pages/navigation)
		return fetch(event.request);
	}

	event.respondWith(respond());
});
