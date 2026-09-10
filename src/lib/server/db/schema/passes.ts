import { pgTable, serial, varchar, text, integer, timestamp, date, index } from 'drizzle-orm/pg-core';
import { attendees } from './core';

/*
    조정(±일) 사유 마스터.

    페널티는 사유를 코드 상수(PENALTY_REASONS)로 들고 있다. 정기권 조정은 그럴 수
    없다 — 「9/3 정전 휴무 보상」 같은 사유가 운영 중에 생기고, 한 번 등록하면
    여러 사람에게 같은 문구로 쓰이기 때문이다. 그래서 상수가 아니라 테이블이다.

    발급 사유는 여기 없다. 신규인지 재발급인지는 이전 만료일이 있는지로 정해지므로
    사람이 고를 것이 아니라 서버가 붙인다. 일수도 여기 없다 — 며칠을 조정할지는
    카드의 버튼이 정하고 이 표는 「왜」만 든다.

    지워도 된다. 이력은 reason_label 스냅샷으로 문구를 들고 있고 FK 는 SET NULL 이라,
    사유가 사라져도 지난 기록은 그대로 읽힌다.
*/
export const seasonPassReasons = pgTable('season_pass_reasons', {
	id: serial('id').primaryKey(),
	/** UNIQUE — 같은 문구의 사유가 둘이면 고르는 목록만 헷갈려진다. 시드의
	    ON CONFLICT 도 이 제약이 있어야 걸린다. */
	label: varchar('label', { length: 60 }).notNull().unique(),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/*
    정기권 이력.

    예전에는 attendees.season_pass_expires_at 타임스탬프 하나뿐이라, 누가 언제
    무슨 이유로 발급·조정·해지했는지가 남지 않았다. 「기록 삭제」를 누르면
    흔적도 함께 사라졌다.

    expires_before 와 expires_after 를 둘 다 남기는 것이 핵심이다. 발급은 기존
    정기권을 더하는 게 아니라 덮어쓰므로(남은 20일이 조용히 사라진다), 그 손실이
    이력에 드러나야 한다.

    이력은 정기권 단위로 묶인다(pass_id). 회원 단위로 묶으면 새로 발급한 정기권
    카드에 지난 정기권의 이력이 따라붙는다 — 그 카드가 보여주는 정기권의 일이 아니다.

    reason_label 은 등록 당시 라벨의 스냅샷이다. 사유 이름을 나중에 고치면 지난
    이력의 문구까지 바뀐다 — 이력은 그때 그렇게 적혔어야 한다.
*/
export const seasonPassLogs = pgTable('season_pass_logs', {
	id: serial('id').primaryKey(),
	attendeeId: integer('attendee_id')
		.notNull()
		.references(() => attendees.id, { onDelete: 'cascade' }),
	/**
	 * 어느 정기권의 이력인가. 발급 행은 자기 id 를 넣어 정기권의 시작이 되고,
	 * 그 뒤의 조정이 같은 값을 물려받는다. (자기 참조 FK 는 SQL 쪽에 있다.)
	 */
	passId: integer('pass_id'),
	/** 'grant' | 'adjust' */
	action: varchar('action', { length: 20 }).notNull(),
	/** 마스터가 지워져도 이력은 남아야 하므로 nullable + SET NULL */
	reasonId: integer('reason_id').references(() => seasonPassReasons.id, { onDelete: 'set null' }),
	reasonLabel: varchar('reason_label', { length: 60 }).notNull(),
	/** 자유 메모. 월·화 보정 설명도 여기 함께 들어간다 — 사람이 한 일과 규칙이 한 일을 같은 칸에서 읽는다. */
	note: text('note'),
	/** 순 변화 일수(+30, +1, -1). 해지는 남은 일수를 음수로 적는다. */
	days: integer('days'),
	/**
	 * 발급 행에만 있는 시작일. 월·화 보정으로 days 가 30→31, 32 로 늘기 때문에
	 * 「만료일 − days」로는 원래 시작일이 복원되지 않는다. 그래서 직접 적는다.
	 */
	startedOn: date('started_on'),
	expiresBefore: timestamp('expires_before', { withTimezone: true }),
	expiresAfter: timestamp('expires_after', { withTimezone: true }),
	/** 어드민 콘솔은 공용 계정 하나라 「관리자」로만 남는다. */
	actor: varchar('actor', { length: 50 }).notNull().default('관리자'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
	index('idx_season_pass_logs_attendee').on(table.attendeeId, table.passId, table.createdAt),
]);
