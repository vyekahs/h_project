<svelte:head>
	<title>언블록미 가이드 - 규칙과 공략법 | 혼자놀다가게</title>
	<meta name="description" content="언블록미(Unblock Me) 슬라이딩 퍼즐의 규칙, 블록 이동 방법, 단계별 공략법과 전략 팁을 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>

		<div class="hero">
			<span class="hero-icon">📦</span>
			<h1>언블록미 가이드</h1>
			<p class="subtitle">블록을 밀어 탈출하라! 공간 사고력 퍼즐</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">언블록미란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#blocks">블록의 종류</a></li>
				<li><a href="#strategy">풀이 전략</a></li>
				<li><a href="#common">자주 나오는 패턴</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>언블록미란?</h2>
				<p>
					언블록미(Unblock Me)는 "러시아워(Rush Hour)" 퍼즐에서 영감을 받은 슬라이딩 블록 퍼즐 게임입니다.
					1970년대에 만들어진 러시아워 퍼즐은 주차장에서 자동차를 이동시켜 빨간 차를 탈출시키는 개념이었으며,
					언블록미는 이를 디지털화하여 전 세계적으로 큰 인기를 얻었습니다.
				</p>
				<p>
					규칙은 단순합니다. 격자판 위의 블록들을 밀어서 빨간 블록이 출구로 나갈 수 있도록 길을 만들어주면 됩니다.
					단순해 보이지만, 블록들이 서로 얽혀 있어 올바른 순서로 이동시키지 않으면 풀 수 없습니다.
					공간 인지력과 순서 사고력을 동시에 기르는 두뇌 훈련 게임입니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<ol>
					<li>격자판 위에 여러 개의 블록이 놓여 있습니다.</li>
					<li><strong>빨간 블록</strong>(주인공 블록)을 오른쪽 출구까지 이동시키면 클리어입니다.</li>
					<li>블록은 놓인 방향(가로 또는 세로)으로만 밀 수 있습니다.</li>
					<li>가로 블록은 좌우로만, 세로 블록은 위아래로만 이동합니다.</li>
					<li>블록은 다른 블록을 넘어갈 수 없으며, 격자판 밖으로 나갈 수 없습니다.</li>
					<li>최소 이동 횟수로 클리어하면 높은 점수를 받습니다.</li>
				</ol>
				<div class="info-box">
					<strong>핵심</strong>: 빨간 블록의 경로를 막고 있는 블록들을 순서대로 치워주는 것이 목표입니다.
					직접 막고 있는 블록뿐 아니라, 그 블록을 막고 있는 또 다른 블록까지 고려해야 합니다.
				</div>
			</section>

			<section id="blocks">
				<h2>블록의 종류</h2>
				<h3>빨간 블록 (주인공)</h3>
				<p>
					가로 방향 2칸 크기의 블록입니다. 이 블록을 오른쪽 출구로 이동시키는 것이 목표입니다.
					항상 가로로만 움직일 수 있습니다.
				</p>
				<h3>일반 블록 (2칸)</h3>
				<p>
					2칸 크기의 블록으로, 가로 또는 세로로 놓여 있습니다.
					놓인 방향에 따라 좌우 또는 위아래로만 이동 가능합니다.
				</p>
				<h3>큰 블록 (3칸)</h3>
				<p>
					3칸 크기의 블록입니다. 2칸 블록보다 이동 범위가 제한되어 있어
					퍼즐을 더 복잡하게 만듭니다. 역시 놓인 방향으로만 이동합니다.
				</p>
			</section>

			<section id="strategy">
				<h2>풀이 전략</h2>
				<h3>1. 출구에서 역추적하기</h3>
				<p>
					빨간 블록이 출구에 도달하려면 어떤 블록이 비켜야 하는지 먼저 파악하세요.
					그 블록을 비키려면 또 어떤 블록이 이동해야 하는지 역으로 추적합니다.
					출구 → 빨간 블록 경로 → 방해 블록 → 방해 블록의 방해 블록 순서로 분석하면
					효율적인 풀이 순서를 찾을 수 있습니다.
				</p>

				<h3>2. 병목 지점 파악하기</h3>
				<p>
					가장 많은 블록이 얽혀 있는 지점(병목)을 먼저 해결하면 여러 블록이 동시에 풀립니다.
					한 블록을 이동하면 연쇄적으로 다른 블록들도 이동할 수 있게 되는 경우가 많습니다.
				</p>

				<h3>3. 빈 공간 만들기</h3>
				<p>
					블록을 이동시키려면 이동할 방향에 빈 공간이 필요합니다.
					먼저 이동 가능한 블록을 움직여 빈 공간을 확보한 후, 그 공간을 활용하여
					핵심 블록을 이동시키세요.
				</p>

				<h3>4. 가장자리 활용하기</h3>
				<p>
					격자판의 가장자리에 있는 블록은 한쪽 방향으로 크게 밀어놓을 수 있어,
					중앙 공간을 확보하는 데 유리합니다.
					필요하지 않은 블록은 가장자리로 밀어두세요.
				</p>
			</section>

			<section id="common">
				<h2>자주 나오는 패턴</h2>
				<h3>일자 막힘</h3>
				<p>
					빨간 블록 앞에 세로 블록이 하나만 서 있는 경우입니다.
					해당 세로 블록을 위 또는 아래로 밀면 곧바로 풀리지만,
					그 세로 블록의 위아래에 또 다른 블록이 있다면 그것을 먼저 치워야 합니다.
				</p>

				<h3>교차 막힘</h3>
				<p>
					빨간 블록 앞에 여러 세로 블록이 서 있고, 그 세로 블록들이 서로의 이동을 방해하는 패턴입니다.
					이 경우 먼 쪽(출구에서 가장 먼 블록)부터 순서대로 치우는 것이 일반적입니다.
				</p>

				<h3>순환 이동</h3>
				<p>
					블록 A를 치우려면 B를 먼저 이동해야 하고, B를 이동하려면 C를 먼저 이동해야 하는 연쇄 패턴입니다.
					가장 마지막 블록(이동 가능한 블록)을 찾아 거기서부터 역순으로 풀어나가세요.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 급하게 움직이지 마세요</h3>
				<p>
					무작정 블록을 밀기보다 먼저 전체 판을 관찰하고 계획을 세우세요.
					미리 생각하지 않고 이동하면 오히려 상황을 복잡하게 만들 수 있습니다.
				</p>
				<h3>2. 이동 횟수를 줄이세요</h3>
				<p>
					점수는 이동 횟수와 클리어 시간을 기반으로 계산됩니다.
					불필요한 이동을 줄이고, 효율적인 순서를 찾는 것이 고득점의 비결입니다.
				</p>
				<h3>3. 막히면 되돌리세요</h3>
				<p>
					잘못된 방향으로 진행했다면 주저 없이 실행 취소를 사용하세요.
					잘못된 이동을 계속 쌓기보다 처음으로 돌아가는 것이 더 빠른 풀이로 이어집니다.
				</p>
				<h3>4. 큰 블록을 우선 처리하세요</h3>
				<p>
					3칸짜리 큰 블록은 이동 범위가 좁아 유연성이 낮습니다.
					큰 블록이 핵심 경로를 막고 있다면 먼저 처리하는 것이 효율적입니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 언블록미는 5단계 난이도를 제공합니다.
					쉬운 단계에서는 블록 수가 적고 이동이 단순하지만,
					마스터 단계에서는 수십 번의 정확한 이동이 필요한 도전적인 퍼즐이 등장합니다.
				</p>
				<p>
					드래그 방식의 직관적인 조작과 실행 취소 기능을 제공하며,
					클리어 시간과 이동 횟수로 점수가 계산됩니다.
					최소 이동으로 풀어내는 자신만의 최적 경로를 찾아보세요.
				</p>
				<div class="cta-box">
					<a href="/minigames/unblock-me" class="cta-btn">언블록미 플레이하기</a>
				</div>
			</section>
		</article>
	</div>
</div>

<style>
	.guide-page { min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 24px 16px 80px; }
	.container { max-width: 720px; margin: 0 auto; }
	.back-link { display: inline-block; color: var(--text-muted); text-decoration: none; font-size: 0.9rem; margin-bottom: 24px; transition: color 0.2s; }
	.back-link:hover { color: var(--text-primary); }
	.hero { text-align: center; margin-bottom: 32px; }
	.hero-icon { font-size: 3rem; display: block; margin-bottom: 12px; }
	.hero h1 { font-size: 2rem; font-weight: 800; margin: 0 0 8px; }
	.subtitle { font-size: 1.05rem; color: var(--text-secondary); margin: 0; }
	.toc { background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 16px; padding: 20px 24px; margin-bottom: 40px; }
	.toc h2 { font-size: 1rem; font-weight: 700; margin: 0 0 12px; color: var(--text-primary); }
	.toc ol { margin: 0; padding-left: 20px; }
	.toc li { margin-bottom: 6px; }
	.toc a { color: var(--color-blue); text-decoration: none; font-size: 0.9rem; }
	.toc a:hover { text-decoration: underline; }
	article section { margin-bottom: 40px; }
	article h2 { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
	article section:first-child h2 { border-top: none; padding-top: 0; }
	article h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin: 20px 0 10px; }
	article p { font-size: 0.95rem; line-height: 1.8; color: var(--text-secondary); margin: 0 0 12px; }
	article ol { margin: 0 0 16px; padding-left: 20px; }
	article li { font-size: 0.95rem; line-height: 1.7; color: var(--text-secondary); margin-bottom: 4px; }
	.info-box { background: var(--color-info-bg); border-left: 4px solid var(--color-blue); border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); }
	.cta-box { text-align: center; margin-top: 24px; }
	.cta-btn { display: inline-block; background: var(--bg-dark); color: var(--bg-primary); padding: 14px 32px; border-radius: 12px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: opacity 0.2s; }
	.cta-btn:hover { opacity: 0.85; }
</style>
