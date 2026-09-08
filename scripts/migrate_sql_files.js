/**
 * database/migrations/*.sql 을 컨테이너 기동 시 자동 적용한다.
 *
 * 왜 필요한가
 * 이 저장소에는 마이그레이션 체계가 두 갈래로 있었다.
 *   1) start.sh의 node 스크립트들 — 컨테이너 기동마다 실행됨
 *   2) database/migrations/*.sql — scripts/run-migrations.sh 로만 실행됨
 * 2번은 scripts/deploy-blue-green.sh 안에서만 호출되므로, 평범한
 * `docker compose up`으로 띄우면 적용되지 않았다. 새 테이블을 추가하면
 * 블루/그린 배포를 거치지 않는 환경에서는 코드가 없는 테이블을 찾게 된다.
 * 이 스크립트가 2번을 1번 경로에 합쳐서 그 구멍을 막는다.
 *
 * run-migrations.sh와 같은 schema_migrations 테이블을 쓰고, 적용 기록을 파일과
 * 같은 트랜잭션 안에 남기므로 둘이 겹쳐 돌아도 두 번 적용되지 않는다
 * (뒤쪽이 PK 충돌로 통째로 롤백된다).
 * (run-migrations.sh는 호스트에 node 없이 docker만으로 돌 수 있어야 하는
 *  배포 스크립트용으로 남겨둔다.)
 *
 * 추적 테이블에 없는 파일은 그냥 적용한다. database/migrations/*.sql은 전부
 * 재실행에 안전하도록(IF NOT EXISTS / DROP ... IF EXISTS 후 재생성 /
 * ON CONFLICT DO NOTHING / 컬럼 없을 때만 backfill) 작성되어 있어서,
 * 이미 반영된 내용은 조용히 넘어간다. 그래서 "기존 DB를 감지해 건너뛰는" 장치가
 * 필요없다 — 그 장치는 오히려 새 마이그레이션을 적용 없이 '완료'로 기록해
 * 영구 누락시키는 위험을 만들었다.
 */
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_DIR = join(ROOT, 'database', 'migrations');

/**
 * 블루/그린 두 슬롯이 동시에 기동할 때 서로 배제하기 위한 키.
 * 정확히 한 번 적용되는 것 자체는 아래 트랜잭션 내 INSERT가 보장하고,
 * 이 락은 두 컨테이너가 같은 DDL을 동시에 시도해 헛일하는 것을 막는다.
 */
const LOCK_KEY = 4242424242;

const log = (msg) => console.log(`[migrate-sql] ${msg}`);

async function waitForDb(client) {
	for (let i = 0; i < 30; i++) {
		try {
			await client.connect();
			return true;
		} catch (e) {
			if (i === 29) throw e;
			await new Promise((r) => setTimeout(r, 2000));
		}
	}
	return false;
}

async function main() {
	if (!existsSync(MIGRATION_DIR)) {
		log('migrations 디렉터리가 없습니다 — 건너뜁니다.');
		return;
	}
	const files = readdirSync(MIGRATION_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	if (files.length === 0) {
		log('적용할 파일이 없습니다.');
		return;
	}

	const client = new pg.Client({
		connectionString:
			process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
	});
	await waitForDb(client);

	// 블루/그린 두 슬롯이 동시에 기동하면 이 스크립트도 동시에 돈다.
	// 락을 먼저 잡아 한 번에 하나만 적용하게 한다 (뒤에 잡은 쪽은 이미 기록된
	// 파일들을 보고 그냥 건너뛴다). 락을 못 잡는 상황에서도 정확성은
	// 트랜잭션 내 INSERT가 지킨다.
	await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
	try {
		await client.query(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				filename    TEXT PRIMARY KEY,
				applied_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
			)`);

		const { rows: done } = await client.query('SELECT filename FROM schema_migrations');
		const applied = new Set(done.map((r) => r.filename));

		let n = 0;
		for (const f of files) {
			if (applied.has(f)) continue;
			const sql = readFileSync(join(MIGRATION_DIR, f), 'utf8');
			log(`적용: ${f}`);
			// 파일 전체를 단일 트랜잭션으로. 중간에 실패하면 통째로 롤백된다.
			try {
				await client.query('BEGIN');
				// 기록을 파일보다 먼저 남긴다. 다른 러너(배포 스크립트의
				// run-migrations.sh)와 겹치면 여기서 PK 충돌이 나고 통째로
				// 롤백되므로, 락과 무관하게 정확히 한 번만 적용된다.
				await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
				await client.query(sql);
				await client.query('COMMIT');
			} catch (e) {
				await client.query('ROLLBACK').catch(() => {});
				if (e.code === '23505') {
					log(`  (다른 프로세스가 이미 적용) ${f}`);
					continue;
				}
				throw new Error(`${f} 적용 실패 (롤백됨): ${e.message}`);
			}
			n++;
		}
		log(n === 0 ? '적용할 새 마이그레이션이 없습니다.' : `✅ ${n}건 적용 완료.`);
	} finally {
		await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
		await client.end().catch(() => {});
	}
}

main().catch((e) => {
	console.error(`[migrate-sql] ❌ ${e.message}`);
	// 스키마가 코드와 안 맞는 상태로 트래픽을 받으면 조용한 데이터 오류가 된다.
	// 여기서 죽어서 헬스체크를 통과하지 못하게 하는 편이 낫다.
	process.exit(1);
});
