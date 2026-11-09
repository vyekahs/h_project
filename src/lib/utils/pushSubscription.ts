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

/** 이 기기의 구독을 서버에 등록한다. 같은 주소면 키만 갱신된다(서버에서 upsert). */
async function registerOnServer(subscription: PushSubscription): Promise<boolean> {
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

	return registerOnServer(subscription);
}

/**
 * 앱을 열 때 이 기기의 현재 구독을 서버에 다시 등록한다.
 *
 * 폰 브라우저는 구독(주소)을 바꾸거나 몰래 취소하기도 하는데, 예전에는 설정에서
 * 처음 켤 때 한 번만 서버에 올려서 서버가 옛 주소로 계속 보내고 있었다. 서버는
 * 전송이 만료로 실패하면 그 주소를 지우므로, 결국 서버에는 구독이 없는데 폰의
 * 설정 토글은 켜짐으로 보이는 상태가 됐다.
 * 권한을 묻지 않는다 — 이미 허용한 경우에만 조용히 맞춘다.
 */
export async function syncPushSubscription(): Promise<boolean> {
	if (!isPushSupported() || Notification.permission !== 'granted') return false;
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return false;
	return registerOnServer(subscription);
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
