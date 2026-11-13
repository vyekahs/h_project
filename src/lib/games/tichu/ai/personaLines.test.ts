import { describe, it, expect } from 'vitest';
import { pickLine, type LineEvent } from './personaLines';
import type { AiStrategy } from './types';

describe('캐릭터 한마디', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	const events: LineEvent[] = ['grand', 'small', 'bomb', 'first', 'dog'];

	it('모든 캐릭터·상황에 대사가 있다', () => {
		for (const s of strategies) for (const e of events) expect(pickLine(s, e).length).toBeGreaterThan(0);
	});

	it('같은 대사가 연달아 나오지 않는다', () => {
		const always0 = () => 0;
		const a = pickLine('aggressive', 'bomb', always0);
		const b = pickLine('aggressive', 'bomb', always0);
		expect(b).not.toBe(a);
	});
});
