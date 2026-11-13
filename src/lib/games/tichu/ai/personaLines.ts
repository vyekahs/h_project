/**
 * AI 캐릭터의 한마디 — 티츄 선언, 폭탄, 1등, 개를 낼 때 말풍선으로 띄운다.
 *
 * 실력과는 상관없다. 말투는 실제 사람 기록의 성향에 맞췄다(카드 내는 습관은
 * humanModel.ts의 경향 보정에 반영돼 있다).
 *  - 아랭: 티츄를 자주 부르고 빠르게 나간다
 *  - 메모: 티츄를 거의 안 부르고, 부를 땐 확실할 때만. 높은 카드를 아낀다
 *  - 오딘: 가장 잘 참는다, 스몰 티츄를 즐겨 부른다
 *  - 라미: 덜 참고 큰 조합부터 낸다, 그랜드를 즐겨 부른다
 *  - 이리: 모두의 평균, 무난하다
 */
import type { AiStrategy } from './types';

export type LineEvent = 'grand' | 'small' | 'bomb' | 'first' | 'dog';

const LINES: Record<AiStrategy, Record<LineEvent, string[]>> = {
	aggressive: {
		grand: ['그랜드 간다!', '이 패면 그랜드지', '8장이면 충분해'],
		small: ['티츄!', '이번 판 내가 먼저 나간다', '티츄 부른다, 따라와'],
		bomb: ['펑!', '여기서 터뜨려야지', '이건 못 참지'],
		first: ['1등!', '역시 내가 먼저지', '먼저 간다~'],
		dog: ['부탁해!', '네가 해결해 줘']
	},
	tricky: {
		grand: ['…이번엔 부를게', '계산해 보니 된다. 그랜드'],
		small: ['계산 끝났어. 티츄', '확실할 때만 부르는 거야', '이번엔 된다, 티츄'],
		bomb: ['아껴 둔 거야', '지금이 타이밍', '계산대로'],
		first: ['계산대로야', '예상한 순서야'],
		dog: ['여기선 네가 낫겠어', '넘길게']
	},
	balanced: {
		grand: ['그랜드…? 해 보자', '오랜만에 그랜드'],
		small: ['스몰 티츄 갑니다', '천천히, 그래도 1등은 내 거', '티츄 한번 불러 볼게'],
		bomb: ['기다렸지', '참을 만큼 참았어'],
		first: ['참은 보람이 있네', '천천히 가도 1등'],
		dog: ['네 차례야', '선 넘길게']
	},
	wild: {
		grand: ['그랜드!!', '고민은 사치야, 그랜드', '8장 보고 바로 감'],
		small: ['티츄! 따라와', '패스는 없다, 티츄'],
		bomb: ['막아 봐!', '다 쓸어버린다', '폭탄 나갑니다~'],
		first: ['먼저 간다~', '안 참으니까 빠르지?'],
		dog: ['가져가!', '선 줄게, 달려!']
	},
	defensive: {
		grand: ['그랜드 티츄 할게요', '이번엔 그랜드요'],
		small: ['티츄 부를게요', '먼저 나가 볼게요'],
		bomb: ['폭탄이요', '여기서 막을게요'],
		first: ['먼저 나갈게요', '1등이에요'],
		dog: ['선 넘겨요', '부탁해요']
	}
};

/** 같은 대사가 연달아 나오지 않게 고른다 */
const lastPicked = new Map<string, number>();

export function pickLine(strategy: AiStrategy, event: LineEvent, random: () => number = Math.random): string {
	const pool = LINES[strategy][event];
	const key = `${strategy}:${event}`;
	let i = Math.floor(random() * pool.length);
	if (pool.length > 1 && i === lastPicked.get(key)) i = (i + 1) % pool.length;
	lastPicked.set(key, i);
	return pool[i];
}
