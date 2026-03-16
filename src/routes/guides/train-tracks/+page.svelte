<svelte:head>
	<title>트레인 트랙 가이드 - 규칙과 풀이법 | 혼자놀다가게</title>
	<meta name="description" content="트레인 트랙 퍼즐의 규칙, 선로 타일 종류, 숫자 힌트 활용법, 풀이 전략을 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>
		<div class="hero">
			<span class="hero-icon">🚂</span>
			<h1>트레인 트랙 가이드</h1>
			<p class="subtitle">선로를 연결하여 기차길을 완성하세요</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">트레인 트랙이란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#tiles">선로 타일의 종류</a></li>
				<li><a href="#hints">숫자 힌트 활용법</a></li>
				<li><a href="#strategy">풀이 전략</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>트레인 트랙이란?</h2>
				<p>
					트레인 트랙(Train Tracks)은 격자판 위에 선로 타일을 배치하여
					출발역(A)에서 도착역(B)까지 이어지는 기차길을 완성하는 논리 퍼즐입니다.
					일본 퍼즐 잡지에서 유래한 장르로, "Rail Puzzle", "Railroad"로도 불립니다.
				</p>
				<p>
					격자판의 각 행과 열에 표시된 숫자 힌트를 단서로 삼아
					어떤 칸에 어떤 방향의 선로를 놓을지 결정합니다.
					스도쿠처럼 논리적 추론만으로 풀 수 있으며,
					경로 계획과 공간 사고력을 함께 기를 수 있는 퍼즐입니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<ol>
					<li>격자판의 한 지점에 출발역(A), 다른 지점에 도착역(B)이 표시되어 있습니다.</li>
					<li>빈 칸에 선로 타일을 놓아 A에서 B까지 끊어지지 않는 하나의 경로를 만듭니다.</li>
					<li>각 <strong>행의 오른쪽</strong>에 표시된 숫자는 해당 행에 놓이는 선로 타일의 개수입니다.</li>
					<li>각 <strong>열의 아래쪽</strong>에 표시된 숫자는 해당 열에 놓이는 선로 타일의 개수입니다.</li>
					<li>경로는 분기하지 않습니다(한 줄로 이어져야 합니다).</li>
					<li>모든 숫자 힌트를 만족하면서 A에서 B까지 연결되면 클리어입니다.</li>
				</ol>
				<div class="info-box">
					<strong>핵심</strong>: 숫자 힌트가 스도쿠에서의 주어진 숫자와 같은 역할을 합니다.
					"이 행에는 선로가 3개 있어야 한다"는 정보를 토대로 선로 위치를 추론합니다.
				</div>
			</section>

			<section id="tiles">
				<h2>선로 타일의 종류</h2>
				<h3>직선 선로</h3>
				<p>
					가로 또는 세로로 직진하는 선로입니다. 한 칸을 통과하여 같은 방향으로 진행합니다.
					가로 직선(━)과 세로 직선(┃) 두 종류가 있습니다.
				</p>
				<h3>곡선 선로</h3>
				<p>
					90도로 방향이 꺾이는 선로입니다. 네 방향(┏ ┓ ┗ ┛)이 있으며,
					경로의 방향 전환에 사용됩니다.
					대부분의 퍼즐에서 곡선 선로가 가장 많이 사용됩니다.
				</p>
			</section>

			<section id="hints">
				<h2>숫자 힌트 활용법</h2>
				<h3>확정 행/열 찾기</h3>
				<p>
					행이나 열의 숫자가 해당 행/열의 칸 수와 같다면, 모든 칸에 선로가 들어가야 합니다.
					예를 들어 5×5 격자에서 한 행의 숫자가 5이면 그 행의 모든 칸에 선로를 놓아야 합니다.
				</p>
				<h3>0인 행/열 처리</h3>
				<p>
					숫자가 0인 행이나 열에는 선로가 하나도 들어가지 않습니다.
					해당 행/열의 모든 칸을 빈칸으로 확정하면 다른 행/열의 선택지를 줄일 수 있습니다.
				</p>
				<h3>남은 칸과 비교하기</h3>
				<p>
					이미 놓인 선로와 빈칸으로 확정된 칸을 제외하고,
					남은 숫자와 남은 빈칸 수를 비교하면 추가 확정이 가능합니다.
					"이 행에 3개가 필요한데 빈칸이 3개뿐이다" → 3개 모두 선로 확정.
				</p>
			</section>

			<section id="strategy">
				<h2>풀이 전략</h2>
				<h3>1. 출발역과 도착역에서 시작하기</h3>
				<p>
					A와 B의 위치는 고정되어 있으므로, 이 지점에서 연결될 수 있는 방향이 제한됩니다.
					출발역과 도착역의 인접 칸을 먼저 분석하여 경로의 시작과 끝을 확정하세요.
				</p>

				<h3>2. 숫자 힌트로 소거하기</h3>
				<p>
					숫자가 0인 행/열, 또는 숫자와 빈칸 수가 같은 행/열부터 처리합니다.
					이 방법으로 많은 칸을 빠르게 확정할 수 있습니다.
				</p>

				<h3>3. 연결 논리 사용하기</h3>
				<p>
					선로가 확정된 칸의 방향을 보고, 인접 칸에도 선로가 있어야 하는지 판단합니다.
					예를 들어, 한 칸의 선로가 오른쪽으로 나가면 오른쪽 칸에도 반드시 선로가 있어야 합니다.
					이 연결 논리를 반복하면 경로가 자연스럽게 이어집니다.
				</p>

				<h3>4. 경로의 유일성 활용하기</h3>
				<p>
					A에서 B까지의 경로는 반드시 하나여야 합니다. 분기가 불가능하므로,
					특정 칸에서 선로가 두 방향으로 나가면 안 됩니다(T자, 십자 불가).
					이 제약을 활용하면 곡선의 방향을 결정할 수 있습니다.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 빈칸 확정을 적극 활용하세요</h3>
				<p>
					선로가 없는 칸을 확정하는 것도 선로를 놓는 것만큼 중요합니다.
					빈칸을 확정할수록 남은 칸에 대한 제약이 강해져 풀이가 쉬워집니다.
				</p>
				<h3>2. 모서리와 가장자리를 주목하세요</h3>
				<p>
					격자의 모서리나 가장자리에 있는 선로는 방향이 제한됩니다.
					모서리에서는 두 방향만 가능하므로 곡선의 방향을 빠르게 결정할 수 있습니다.
				</p>
				<h3>3. 경로를 미리 상상해보세요</h3>
				<p>
					A에서 B까지 어떤 경로로 연결될지 대략적으로 상상해보면
					개별 타일의 방향을 결정하는 데 도움이 됩니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 트레인 트랙은 5단계 난이도를 제공합니다.
					작은 격자부터 시작하여 점차 크고 복잡한 퍼즐에 도전할 수 있습니다.
				</p>
				<p>
					탭으로 타일을 배치하는 직관적인 조작과 실행 취소 기능을 제공하며,
					클리어 시간과 조작 횟수로 점수가 계산됩니다.
				</p>
				<div class="cta-box">
					<a href="/minigames/train-tracks" class="cta-btn">트레인 트랙 플레이하기</a>
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
