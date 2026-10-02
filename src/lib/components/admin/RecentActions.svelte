<script lang="ts">
	/**
	 * 「최근 조치」 패널.
	 *
	 * 서버의 되돌리기 창은 10분인데 그것을 담은 표면이 30초짜리 토스트뿐이었다.
	 * 실수를 알아차리는 데는 보통 그 자리를 떠난 뒤가 걸리는데, 그때는 토스트가
	 * 이미 사라져 서버가 아직 받아주는 취소권이 화면에서만 없어져 있었다.
	 *
	 * 대시보드 페이지 안에 있던 것을 컴포넌트로 뺐다. 정기권처럼 다른 라우트도
	 * 되돌릴 수 있는 조치를 하는데, 페이지 안에 있으면 그 라우트는 30초 토스트가
	 * 유일한 표면이 되어 나머지 9분 30초가 화면에서만 사라진다.
	 *
	 * 조치가 있을 때만 나타나고, 접힌 상태가 기본이다 — 평소에는 세지 않는다.
	 */
	import { recentActions, forgetAction, pruneActions } from '$lib/stores/adminFeedback';
	import { UNDO_WINDOW_MS } from '$lib/adminUndoWindow';

	let open = $state(false);
	let now = $state(Date.now());

	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});
	// 서버 창이 지난 항목은 눌러도 거절당한다. 시계가 틱할 때마다 같이 걷어낸다.
	$effect(() => {
		void now;
		pruneActions(now);
	});

	/* 시계는 30초마다 틱하므로 now가 조치 시각보다 앞설 수 있다. 그대로 빼면
	   10분 창을 「11분 남음」이라 말한다 — 화면이 못 지킬 약속을 하게 된다. */
	function minsLeft(at: number) {
		return Math.max(1, Math.ceil((at + UNDO_WINDOW_MS - Math.max(now, at)) / 60000));
	}
</script>

{#if $recentActions.length > 0}
	<div class="recent-actions">
		<div class="recent-head">
			<button
				type="button"
				class="recent-toggle"
				aria-expanded={open}
				aria-controls="recent-actions-list"
				onclick={() => (open = !open)}
			>
				<svg class="recent-caret" class:is-open={open} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
				되돌릴 수 있는 조치 {$recentActions.length}
			</button>
			<!--
				10분 창이 끝날 때까지 지울 방법이 없었다. 무를 생각이 없는 조치까지
				그 시간 내내 화면 위에 앉아 있으면, 되돌리기를 담은 자리가 치우고
				싶은 것이 된다. 서버 창은 그대로 두고 화면에서만 거둔다.
			-->
			<button type="button" class="recent-clear" onclick={() => $recentActions.forEach((a) => forgetAction(a.id))}>
				모두 지우기
			</button>
		</div>
		{#if open}
			<ul class="recent-list" id="recent-actions-list">
				{#each $recentActions as a (a.id)}
					<li>
						<span class="recent-label">{a.label}</span>
						<span class="recent-left">{minsLeft(a.at)}분 남음</span>
						<button type="button" class="recent-undo" onclick={() => a.run()}>
							되돌리기<span class="sr-only"> — {a.label}</span>
						</button>
						<button type="button" class="recent-dismiss" onclick={() => forgetAction(a.id)}
							aria-label="목록에서 지우기 — {a.label}"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.recent-actions {
		margin-bottom: var(--space-5);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-control);
		background: var(--bg-secondary);
	}
	.recent-head {
		display: flex;
		align-items: center;
	}
	.recent-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		text-align: left;
		cursor: pointer;
	}
	/* 글리프는 폰트마다 크기도 기준선도 다르다 — 이 콘솔의 아이콘은 전부 그린다 */
	.recent-caret { flex: 0 0 auto; color: var(--text-secondary); transition: transform 0.15s; }
	.recent-caret.is-open { transform: rotate(180deg); }
	@media (prefers-reduced-motion: reduce) { .recent-caret { transition: none; } }
	.recent-clear {
		flex: 0 0 auto;
		margin-right: var(--space-2);
		min-height: 44px;
		padding: 0 var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}
	.recent-clear:hover { background: var(--bg-hover); color: var(--text-primary); }
	.recent-list {
		list-style: none;
		margin: 0;
		padding: 0 var(--space-4) var(--space-3);
	}
	.recent-list li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--border-light);
	}
	.recent-label {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.recent-left {
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--text-secondary);
		font-variant-numeric: var(--numeric);
	}
	/*
		예전에는 대시보드의 .btn-role.is-secondary 를 빌려 썼다. 컴포넌트로 나오면서
		그 클래스가 닿지 않으므로 같은 모양을 여기서 직접 든다.
	*/
	.recent-undo {
		flex-shrink: 0;
		min-height: 44px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}
	.recent-undo:hover { background: var(--bg-secondary); }
	.recent-dismiss {
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text-secondary);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.recent-dismiss:hover { background: var(--bg-hover); color: var(--text-primary); }
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
