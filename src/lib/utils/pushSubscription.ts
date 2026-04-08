import { PUBLIC_VAPID_KEY } from '$env/static/public';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i++) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
	const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isPushSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(display-mode: standalone)').matches
		|| (navigator as any).standalone === true;
}

export async function isPushSubscribed(): Promise<boolean> {
	if (!isPushSupported()) return false;
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	return !!subscription;
}

export async function subscribeToPush(): Promise<boolean> {
	if (!isPushSupported()) return false;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	const registration = await navigator.serviceWorker.ready;

	let subscription = await registration.pushManager.getSubscription();
	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
		});
	}

	const res = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			endpoint: subscription.endpoint,
			keys: {
				p256dh: arrayBufferToBase64url(subscription.getKey('p256dh')!),
				auth: arrayBufferToBase64url(subscription.getKey('auth')!),
			},
		}),
	});

	return res.ok;
}

export async function unsubscribeFromPush(): Promise<boolean> {
	if (!isPushSupported()) return false;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();

	if (subscription) {
		const endpoint = subscription.endpoint;
		await subscription.unsubscribe();
		await fetch('/api/push/unsubscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint }),
		});
	}

	return true;
}
