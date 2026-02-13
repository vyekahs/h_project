import { EventEmitter } from 'events';

export function getLiveEmitter(): EventEmitter {
	if (!(globalThis as any).__liveEmitter) {
		(globalThis as any).__liveEmitter = new EventEmitter();
		(globalThis as any).__liveEmitter.setMaxListeners(100);
	}
	return (globalThis as any).__liveEmitter;
}

export function emitLiveEvent(type: 'visitors' | 'games') {
	getLiveEmitter().emit('change', type);
}
