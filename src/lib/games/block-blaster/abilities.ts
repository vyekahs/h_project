/**
 * 블록블라스터 특수능력 모드 — 능력 데이터/타입/추첨 로직
 */

export type AbilityCategory = 'clear' | 'manipulate' | 'defense' | 'passive';
export type AbilityRarity = 'common' | 'rare' | 'epic';

/**
 * targetType
 * - instant: 슬롯 클릭 즉시 발동
 * - cell/row/col/block: 보드/트레이의 타겟 선택 후 발동
 * - passive: 보유만으로 효과, 클릭 비활성
 */
export type AbilityTargetType =
	| 'instant'
	| 'cell'
	| 'row'
	| 'col'
	| 'block'
	| 'passive';

export interface Ability {
	id: string;
	name: string;
	description: string;
	category: AbilityCategory;
	rarity: AbilityRarity;
	icon: string;
	targetType: AbilityTargetType;
}

export interface OwnedAbility {
	ability: Ability;
	level: 1 | 2 | 3;
	cooldownRemaining: number;
}

export const MAX_LEVEL = 3;
export const INVENTORY_SLOTS = 5;

// 게임당 최대 능력 종류 수
export const MAX_OWNED_KINDS = 6;
// 희귀도별 등장 상한
export const MAX_EPIC_OWNED = 1;
export const MAX_RARE_OWNED = 3;


// 추첨 가중치
const RARITY_WEIGHT: Record<AbilityRarity, number> = {
	common: 60,
	rare: 30,
	epic: 10
};

export const ABILITY_POOL: Ability[] = [
	// === Clear (4종) ===
	{
		id: 'clear-row',
		name: '한 줄 정리',
		description: '선택한 가로줄을 제거합니다.',
		category: 'clear',
		rarity: 'common',
		icon: '↔️',
		targetType: 'row'
	},
	{
		id: 'clear-col',
		name: '한 열 정리',
		description: '선택한 세로열을 제거합니다.',
		category: 'clear',
		rarity: 'common',
		icon: '↕️',
		targetType: 'col'
	},
	{
		id: 'bomb-3x3',
		name: '폭탄',
		description: '선택한 셀을 중심으로 영역을 폭파합니다.',
		category: 'clear',
		rarity: 'rare',
		icon: '💣',
		targetType: 'cell'
	},
	{
		id: 'clear-color',
		name: '같은 색 블록 지우기',
		description: '선택한 색의 셀을 보드에서 모두 제거합니다.',
		category: 'clear',
		rarity: 'epic',
		icon: '🎨',
		targetType: 'instant'
	},
	// === Manipulate (3종) ===
	{
		id: 'single-cell',
		name: '커스텀 블록',
		description: '원하는 모양의 블록을 트레이에 추가합니다.',
		category: 'manipulate',
		rarity: 'rare',
		icon: '⬜',
		targetType: 'instant'
	},
	{
		id: 'swap-block',
		name: '블록 교체',
		description: '선택한 트레이 블록을 새로 뽑습니다.',
		category: 'manipulate',
		rarity: 'common',
		icon: '🔁',
		targetType: 'block'
	},
	{
		id: 'rotate-block',
		name: '블록 변형',
		description: '선택한 블록을 변형합니다.',
		category: 'manipulate',
		rarity: 'common',
		icon: '🔃',
		targetType: 'block'
	},

	// === Defense — 액티브 (1종) ===
	{
		id: 'undo',
		name: '되돌리기',
		description: '마지막 블록 배치를 취소합니다.',
		category: 'defense',
		rarity: 'rare',
		icon: '↩️',
		targetType: 'instant'
	},

	// === Passive (3종) ===
	{
		id: 'peek-next',
		name: '미리보기',
		description: '다음에 등장할 블록을 미리 볼 수 있습니다.',
		category: 'passive',
		rarity: 'rare',
		icon: '👁️',
		targetType: 'passive'
	},
	{
		id: 'revive',
		name: '부활',
		description: '게임오버 시 자동 발동되어 보드를 정리하고 게임을 이어갑니다.',
		category: 'passive',
		rarity: 'epic',
		icon: '💖',
		targetType: 'passive'
	},
	{
		id: 'extra-slot',
		name: '추가 트레이 슬롯',
		description: '블록 트레이 슬롯이 늘어납니다.',
		category: 'passive',
		rarity: 'rare',
		icon: '📦',
		targetType: 'passive'
	}
];

/** 능력의 특정 레벨 효과를 풀어쓴 설명으로 반환 */
export function getLevelEffect(id: string, level: number): string {
	switch (id) {
		case 'clear-row':
			if (level === 1) return '선택한 가로줄 1줄을 통째로 제거합니다.';
			if (level === 2) return '선택한 가로줄과 바로 아래 줄까지 총 2줄을 제거합니다.';
			return '선택한 가로줄과 그 아래 2줄까지 총 3줄을 한 번에 제거합니다.';
		case 'clear-col':
			if (level === 1) return '선택한 세로열 1열을 통째로 제거합니다.';
			if (level === 2) return '선택한 세로열과 바로 오른쪽 열까지 총 2열을 제거합니다.';
			return '선택한 세로열과 그 오른쪽 2열까지 총 3열을 한 번에 제거합니다.';
		case 'bomb-3x3':
			if (level === 1) return '선택한 셀을 중심으로 3×3 영역(총 9칸)을 폭파합니다.';
			if (level === 2) return '선택한 셀을 중심으로 4×4 영역(총 16칸)을 폭파합니다.';
			return '선택한 셀을 중심으로 5×5 영역(총 25칸)을 폭파합니다.';
		case 'clear-color':
			if (level === 1) return '보드에서 1가지 색을 골라 그 색의 셀을 모두 제거합니다.';
			if (level === 2) return '보드에서 최대 2가지 색을 골라 해당 색의 셀을 모두 제거합니다.';
			return '보드에서 최대 3가지 색을 골라 해당 색의 셀을 모두 제거합니다.';
		case 'single-cell':
			if (level === 1) return '1×1 단일 블록 1개를 추가합니다.';
			if (level === 2) return '인접한 2셀로 이루어진 블록을 직접 그려 추가합니다.';
			return '인접한 3셀로 이루어진 블록을 직접 그려 추가합니다.';
		case 'swap-block':
			if (level === 1) return '선택한 트레이 블록 1개를 무작위 새 블록으로 교체합니다.';
			if (level === 2) return '선택한 트레이 블록을 후보 2개 중 원하는 모양으로 골라 교체합니다.';
			return '선택한 트레이 블록을 후보 3개 중 원하는 모양으로 골라 교체합니다.';
		case 'rotate-block':
			if (level === 1) return '선택한 블록을 90도 회전한 모양으로 변경합니다.';
			if (level === 2) return '선택한 블록을 90/180/270도 회전 중 원하는 모양으로 변경합니다.';
			return '선택한 블록을 90/180/270도 회전, 좌우 반전, 상하 반전 중 원하는 모양으로 변경합니다.';
		case 'undo':
			if (level === 1) return '마지막에 배치한 블록 1개를 되돌립니다. 보드와 트레이가 직전 상태로 돌아갑니다.';
			if (level === 2) return '최근에 배치한 블록 2개까지 되돌릴 수 있습니다.';
			return '최근에 배치한 블록 3개까지 되돌릴 수 있습니다.';
		case 'peek-next':
			if (level === 1) return '다음에 등장할 블록 1세트(트레이 한 라운드)를 미리 볼 수 있습니다.';
			if (level === 2) return '다음에 등장할 블록 2세트를 미리 볼 수 있습니다.';
			return '다음에 등장할 블록 3세트를 미리 볼 수 있습니다.';
		case 'revive':
			if (level === 1) return '게임오버가 발생하면 자동 발동되어 보드의 50%를 정리하고 게임을 이어갑니다. 발동 후 30턴의 재충전이 필요합니다.';
			if (level === 2) return '게임오버가 발생하면 자동 발동되어 보드의 70%를 정리하고 게임을 이어갑니다. 발동 후 25턴의 재충전이 필요합니다.';
			return '게임오버가 발생하면 자동 발동되어 보드를 완전히 정리하고 게임을 이어갑니다. 발동 후 20턴의 재충전이 필요합니다.';
		case 'extra-slot':
			if (level === 1) return '블록 트레이의 슬롯이 1칸 늘어납니다(기본 3칸 → 4칸). 한 라운드에 더 많은 블록 선택이 가능합니다.';
			if (level === 2) return '블록 트레이의 슬롯이 2칸 늘어납니다(기본 3칸 → 5칸).';
			return '블록 트레이의 슬롯이 3칸 늘어납니다(기본 3칸 → 6칸).';
		default:
			return '';
	}
}

/** 카테고리별 베이스 쿨다운 (Lv1 기준). 패시브는 -1 */
export function baseCooldown(ability: Ability): number {
	if (ability.targetType === 'passive') return 0;
	// bomb-3x3은 광역이라 추가 +2
	if (ability.id === 'bomb-3x3') return 15;
	switch (ability.category) {
		case 'clear':
			return 13;
		case 'manipulate':
			return 10;
		case 'defense':
			return 11;
		default:
			return 10;
	}
}

/** 레벨에 따른 실효 쿨다운 — Lv2: -1, Lv3: -2. 최소 1 */
export function computeCooldown(ability: Ability, level: number): number {
	const drop = level >= 3 ? 2 : level === 2 ? 1 : 0;
	return Math.max(1, baseCooldown(ability) - drop);
}

/** revive 전용 쿨다운 — 발동 후 재충전까지 N턴 (Lv1: 90, Lv2: 80, Lv3: 70) */
export function reviveCooldown(level: number): number {
	if (level >= 3) return 70;
	if (level === 2) return 80;
	return 90;
}

export function isPassive(ability: Ability): boolean {
	return ability.targetType === 'passive';
}

export function isActive(ability: Ability): boolean {
	return !isPassive(ability);
}

/** 보유 능력 중 특정 id의 OwnedAbility 반환 */
export function findOwned(
	owned: OwnedAbility[],
	id: string
): OwnedAbility | undefined {
	return owned.find(o => o.ability.id === id);
}

export function getLevelOf(owned: OwnedAbility[], id: string): number {
	return findOwned(owned, id)?.level ?? 0;
}

export function hasOwned(owned: OwnedAbility[], id: string): boolean {
	return findOwned(owned, id) !== undefined;
}

interface RarityCounts {
	common: number;
	rare: number;
	epic: number;
}

function countOwnedByRarity(owned: OwnedAbility[]): RarityCounts {
	const c: RarityCounts = { common: 0, rare: 0, epic: 0 };
	for (const o of owned) c[o.ability.rarity]++;
	return c;
}

/**
 * 드래프트용 능력 후보 추첨.
 * 규칙:
 * 1. Lv3 만렙 능력 제외
 * 2. 보유 종류 수 ≥ MAX_OWNED_KINDS면 미보유 제외
 * 3. 보유 Epic ≥ MAX_EPIC_OWNED면 미보유 Epic 제외
 * 4. 보유 Rare ≥ MAX_RARE_OWNED면 미보유 Rare 제외
 * 5. 희귀도 가중치로 비복원 추첨
 *
 * 후보 0개면 빈 배열 반환 → 호출부에서 드래프트 스킵 처리.
 */
/** 스테이지에 따라 드래프트에 등장 가능한 최대 희귀도 */
function maxRarityForStage(stage: number): AbilityRarity {
	if (stage <= 3) return 'common'; // 1막: Common만
	if (stage <= 7) return 'rare'; // 2막: Common + Rare
	return 'epic'; // 3막: 전체
}

const RARITY_RANK: Record<AbilityRarity, number> = {
	common: 0,
	rare: 1,
	epic: 2
};

export function drawAbilities(
	pool: Ability[],
	owned: OwnedAbility[],
	n = 3,
	stage: number = 1
): Ability[] {
	const ownedKinds = owned.length;
	const rarityCounts = countOwnedByRarity(owned);
	const ownedSet = new Set(owned.map(o => o.ability.id));
	const maxRank = RARITY_RANK[maxRarityForStage(stage)];

	const candidates = pool.filter(ab => {
		const ownedRecord = findOwned(owned, ab.id);

		// 1. Lv3 만렙 제외
		if (ownedRecord && ownedRecord.level >= MAX_LEVEL) return false;

		// 1.5 스테이지에 따른 희귀도 제한 (이미 보유한 능력은 강화 가능)
		if (!ownedRecord && RARITY_RANK[ab.rarity] > maxRank) return false;

		const isOwned = ownedSet.has(ab.id);

		// 2. 종류 상한 — 미보유만 제외 (보유 강화는 허용)
		if (!isOwned && ownedKinds >= MAX_OWNED_KINDS) return false;

		// 3-4. 희귀도 상한 — 미보유만 제외
		if (!isOwned) {
			if (ab.rarity === 'epic' && rarityCounts.epic >= MAX_EPIC_OWNED)
				return false;
			if (ab.rarity === 'rare' && rarityCounts.rare >= MAX_RARE_OWNED)
				return false;
		}

		return true;
	});

	if (candidates.length === 0) return [];

	// 희귀도 가중치 적용 비복원 추첨
	const remaining = [...candidates];
	const picked: Ability[] = [];
	const target = Math.min(n, remaining.length);

	while (picked.length < target) {
		const totalWeight = remaining.reduce(
			(sum, ab) => sum + RARITY_WEIGHT[ab.rarity],
			0
		);
		let roll = Math.random() * totalWeight;
		let pickedIndex = 0;
		for (let i = 0; i < remaining.length; i++) {
			roll -= RARITY_WEIGHT[remaining[i].rarity];
			if (roll <= 0) {
				pickedIndex = i;
				break;
			}
		}
		picked.push(remaining[pickedIndex]);
		remaining.splice(pickedIndex, 1);
	}

	return picked;
}

export const MAX_STAGE = 10;
