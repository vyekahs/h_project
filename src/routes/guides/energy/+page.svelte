<svelte:head>
	<title>에너지 서킷 가이드 - 규칙과 전략 | 혼자놀다가게</title>
	<meta name="description" content="에너지 서킷 퍼즐의 규칙, 타일 회전 방법, 회로 연결 전략과 풀이 팁을 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>

		<div class="hero">
			<span class="hero-icon">⚡</span>
			<h1>에너지 서킷 가이드</h1>
			<p class="subtitle">회로를 연결하여 모든 전구를 켜세요</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">에너지 서킷이란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#tiles">타일의 종류</a></li>
				<li><a href="#strategy">풀이 전략</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>에너지 서킷이란?</h2>
				<p>
					에너지 서킷(Energy Circuit)은 격자판 위의 타일을 회전시켜 배터리(전원)에서 전구(목표)까지
					전기 회로를 연결하는 논리 퍼즐입니다. 파이프 퍼즐(Pipe Puzzle)이나
					플러머(Plumber) 게임과 유사한 장르로, 공간 추론 능력과 논리적 사고력을 동시에 요구합니다.
				</p>
				<p>
					각 타일에는 전선 패턴이 그려져 있으며, 타일을 탭하면 90도씩 회전합니다.
					모든 타일을 올바른 방향으로 회전시켜 배터리에서 모든 전구까지 끊어지지 않는 전기 회로를
					완성하면 퍼즐이 풀립니다. 시각적으로 직관적이면서도 난이도가 올라갈수록 깊은 사고가 필요합니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<ol>
					<li>격자판 위에 다양한 모양의 타일이 놓여 있습니다.</li>
					<li>타일을 탭하면 시계 방향으로 90도 회전합니다.</li>
					<li><strong>배터리</strong>(전원)에서 출발하여 모든 <strong>전구</strong>까지 전선이 연결되어야 합니다.</li>
					<li>전선은 타일의 변(상하좌우)을 통해 인접 타일과 연결됩니다.</li>
					<li>모든 전구에 전기가 도달하면 퍼즐 클리어입니다.</li>
					<li>사용하지 않는 타일 변에 전선이 남아 있으면 안 됩니다(열린 끝이 없어야 함).</li>
				</ol>
				<div class="info-box">
					<strong>핵심</strong>: 모든 전선의 끝이 다른 타일의 전선과 맞닿아야 합니다.
					벽면이나 빈 공간을 향한 열린 전선이 있으면 올바른 풀이가 아닙니다.
				</div>
			</section>

			<section id="tiles">
				<h2>타일의 종류</h2>
				<h3>직선 타일</h3>
				<p>
					양쪽이 직선으로 연결된 타일입니다. 가로 또는 세로 방향으로 전기를 전달합니다.
					가장 기본적인 타일로, 회전하면 가로-세로가 전환됩니다.
				</p>
				<h3>곡선(L자) 타일</h3>
				<p>
					90도로 꺾인 전선이 있는 타일입니다. 4방향(↱ ↰ ↲ ↳)으로 회전할 수 있으며,
					회로의 방향을 전환할 때 사용됩니다.
				</p>
				<h3>T자 타일</h3>
				<p>
					세 방향으로 전선이 뻗어 있는 타일입니다. 분기점 역할을 하여
					하나의 전선을 두 갈래로 나누거나 세 방향에서 오는 전선을 합칠 수 있습니다.
				</p>
				<h3>십자(+) 타일</h3>
				<p>
					네 방향 모두로 전선이 연결된 타일입니다. 어떤 방향으로든 회전해도 동일하므로
					회전할 필요가 없습니다. 교차점에 주로 등장합니다.
				</p>
				<h3>끝 타일</h3>
				<p>
					한 방향으로만 전선이 나와 있는 타일입니다. 전구나 배터리가 이 타일에 위치합니다.
					전선의 끝점을 올바른 방향으로 맞추는 것이 중요합니다.
				</p>
			</section>

			<section id="strategy">
				<h2>풀이 전략</h2>
				<h3>1. 가장자리부터 시작하기</h3>
				<p>
					격자판의 가장자리(벽면)에 있는 타일은 벽 쪽으로 열린 전선이 있으면 안 됩니다.
					이 제약 조건 덕분에 가능한 회전 방향이 제한되므로, 가장자리 타일부터 확정하면 효율적입니다.
				</p>

				<h3>2. 전원과 전구에서 역추적하기</h3>
				<p>
					배터리와 전구의 위치는 고정되어 있으므로, 이 지점에서 가장 가까운 타일부터
					연결 방향을 결정해나가면 전체 회로의 윤곽이 잡힙니다.
				</p>

				<h3>3. 확정 타일 먼저 처리하기</h3>
				<p>
					십자 타일(회전 불필요), 주변에 이미 확정된 타일이 있어 방향이 하나로 결정되는 타일을
					먼저 처리하세요. 확정된 타일이 늘어날수록 인접 타일의 가능한 방향도 줄어듭니다.
				</p>

				<h3>4. 열린 끝 확인하기</h3>
				<p>
					풀이 중간중간에 열린 끝(연결되지 않은 전선)이 없는지 확인하세요.
					벽면을 향한 전선이나 빈 공간을 향한 전선이 보이면 해당 타일의 방향을 수정해야 합니다.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 회전 횟수를 줄이세요</h3>
				<p>
					점수는 클리어 시간과 회전 횟수를 기반으로 계산됩니다.
					불필요한 회전을 줄이려면 타일을 돌리기 전에 올바른 방향을 먼저 판단하세요.
				</p>
				<h3>2. 전체 그림을 그리세요</h3>
				<p>
					개별 타일에 집중하기보다 배터리에서 전구까지의 전체 경로를 머릿속에 그려보세요.
					큰 그림이 잡히면 세부 타일 방향은 자연스럽게 결정됩니다.
				</p>
				<h3>3. 코너 타일을 주목하세요</h3>
				<p>
					격자판의 네 모서리에 있는 타일은 두 면이 벽이므로 가능한 방향이 매우 제한됩니다.
					모서리 → 가장자리 → 내부 순서로 풀면 논리적으로 접근할 수 있습니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 에너지 서킷은 5단계 난이도를 제공합니다.
					쉬운 단계에서는 작은 격자에 기본 타일만 등장하지만,
					높은 난이도에서는 큰 격자에 복잡한 회로를 설계해야 합니다.
				</p>
				<p>
					탭 한 번으로 타일을 회전시키는 직관적인 조작과 인게임 튜토리얼을 제공하며,
					클리어 시간과 회전 횟수로 점수가 계산됩니다.
				</p>
				<div class="cta-box">
					<a href="/minigames/energy" class="cta-btn">에너지 서킷 플레이하기</a>
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
	article ul, article ol { margin: 0 0 16px; padding-left: 20px; }
	article li { font-size: 0.95rem; line-height: 1.7; color: var(--text-secondary); margin-bottom: 4px; }
	.info-box { background: var(--color-info-bg); border-left: 4px solid var(--color-blue); border-radius: 8px; padding: 14px 16px; margin: 16px 0; font-size: 0.9rem; line-height: 1.6; color: var(--text-secondary); }
	.cta-box { text-align: center; margin-top: 24px; }
	.cta-btn { display: inline-block; background: var(--bg-dark); color: var(--bg-primary); padding: 14px 32px; border-radius: 12px; font-size: 1rem; font-weight: 600; text-decoration: none; transition: opacity 0.2s; }
	.cta-btn:hover { opacity: 0.85; }
</style>
