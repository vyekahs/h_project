<svelte:head>
	<title>2048 가이드 - 규칙과 전략 | 혼자놀다가게</title>
	<meta name="description" content="2048 퍼즐 게임의 규칙, 타일 합치기 방법, 코너 전략, 고득점 팁을 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>
		<div class="hero">
			<span class="hero-icon">🎯</span>
			<h1>2048 가이드</h1>
			<p class="subtitle">타일을 합쳐 2048을 만들어보세요</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">2048이란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#strategy">핵심 전략</a></li>
				<li><a href="#corner">코너 전략 상세</a></li>
				<li><a href="#advanced">고급 전략</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>2048이란?</h2>
				<p>
					2048은 이탈리아 개발자 가브리엘레 치룰리(Gabriele Cirulli)가 2014년에 만든 슬라이딩 타일 퍼즐 게임입니다.
					공개 직후 전 세계적으로 큰 화제를 모으며 수천만 명이 플레이한 인기 게임이 되었습니다.
					"Threes!"라는 게임에서 영감을 받아 만들어졌으며, 오픈소스로 공개되어 수많은 변형 버전이 탄생했습니다.
				</p>
				<p>
					4×4 격자 위에서 같은 숫자의 타일을 합쳐 점점 큰 숫자를 만들어가는 게임입니다.
					최종 목표는 2048 타일을 만드는 것이지만, 2048을 넘어서 4096, 8192 등
					더 높은 숫자에 도전하는 것도 가능합니다.
					단순한 규칙 속에 깊은 전략이 숨어 있어, 한 번 시작하면 멈추기 어려운 중독성이 있습니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<ol>
					<li>4×4 격자에서 시작합니다. 처음에 2개의 타일(2 또는 4)이 랜덤 위치에 생성됩니다.</li>
					<li>상하좌우 방향으로 스와이프하면 모든 타일이 해당 방향으로 밀립니다.</li>
					<li><strong>같은 숫자의 타일이 부딪히면 하나로 합쳐</strong>지며 숫자가 두 배가 됩니다(예: 2+2=4, 4+4=8).</li>
					<li>스와이프할 때마다 빈 칸 하나에 새 타일(2 또는 4)이 랜덤으로 생성됩니다.</li>
					<li>2048 타일을 만들면 승리입니다. 이후에도 계속 플레이할 수 있습니다.</li>
					<li>더 이상 이동할 수 없으면(빈 칸이 없고 합칠 수 있는 인접 타일도 없으면) 게임 오버입니다.</li>
				</ol>
				<div class="info-box">
					<strong>점수 계산</strong>: 타일을 합칠 때마다 합쳐진 타일의 값이 점수에 더해집니다.
					예를 들어 4+4=8이면 8점, 256+256=512이면 512점이 추가됩니다.
					높은 숫자 타일을 만들수록 점수가 기하급수적으로 올라갑니다.
				</div>
			</section>

			<section id="strategy">
				<h2>핵심 전략</h2>
				<h3>1. 큰 타일을 한 코너에 고정하세요</h3>
				<p>
					가장 중요한 전략입니다. 가장 큰 숫자의 타일을 4개의 모서리 중 하나에 두고,
					절대 그 위치에서 벗어나지 않도록 합니다.
					대부분의 고수들은 왼쪽 위나 왼쪽 아래 코너를 선호합니다.
				</p>

				<h3>2. 주 방향 2개를 정하세요</h3>
				<p>
					코너를 정했으면 그 코너 쪽으로 밀리는 방향 2개를 주 방향으로 사용합니다.
					예를 들어 왼쪽 아래 코너라면 "왼쪽"과 "아래"를 주로 사용하고,
					"오른쪽"과 "위"는 꼭 필요할 때만 사용합니다.
				</p>

				<h3>3. 가장자리에 큰 타일을 정렬하세요</h3>
				<p>
					큰 코너 타일이 위치한 가장자리(행 또는 열)를 따라 내림차순으로 타일을 정렬합니다.
					예를 들어 왼쪽 아래가 가장 크다면, 아래 행을 왼쪽부터 512-256-128-64처럼 유지합니다.
					이 정렬을 유지하면 연쇄적으로 타일을 합칠 기회가 생깁니다.
				</p>
			</section>

			<section id="corner">
				<h2>코너 전략 상세</h2>
				<h3>뱀 패턴 (Snake Pattern)</h3>
				<p>
					가장 효과적인 배치 전략입니다. 타일을 뱀이 기어가는 것처럼 S자 형태로 배치합니다.
				</p>
				<p>
					예를 들어 왼쪽 아래 코너 전략이라면:
				</p>
				<ul>
					<li>4행(아래): 큰 수 → 작은 수 (왼쪽에서 오른쪽으로 내림차순)</li>
					<li>3행: 작은 수 → 큰 수 (오른쪽에서 왼쪽으로 내림차순)</li>
					<li>2행: 큰 수 → 작은 수</li>
					<li>1행(위): 새 타일이 생기는 공간</li>
				</ul>
				<p>
					이 패턴을 유지하면 타일이 자연스럽게 흘러내려 큰 타일과 합쳐질 기회가 많아집니다.
				</p>

				<h3>코너 이탈 방지</h3>
				<p>
					큰 타일이 코너에서 벗어나면 게임이 매우 불리해집니다.
					이를 방지하려면 큰 타일이 있는 행이나 열이 항상 가득 차 있도록 유지하세요.
					빈 칸이 있으면 타일이 의도치 않게 밀려 코너에서 벗어날 수 있습니다.
				</p>
			</section>

			<section id="advanced">
				<h2>고급 전략</h2>
				<h3>4 타일 관리</h3>
				<p>
					새로 생성되는 타일의 약 10%는 4입니다. 4 타일이 불리한 위치에 생성되면
					전략이 무너질 수 있으므로, 항상 빈 칸의 위치를 관리하여
					어디에 새 타일이 생겨도 괜찮은 상태를 유지하세요.
				</p>

				<h3>연쇄 합치기</h3>
				<p>
					같은 숫자의 타일이 연속으로 놓여 있으면 한 번의 스와이프로 여러 개가 동시에 합쳐집니다.
					이 연쇄 합치기를 의도적으로 만들면 한 번에 큰 점수를 얻을 수 있습니다.
				</p>

				<h3>탈출 기동</h3>
				<p>
					이상적인 배치가 무너졌을 때 당황하지 마세요.
					일단 큰 타일을 다시 코너로 밀어 넣는 것을 최우선으로 하고,
					나머지 타일은 그 이후에 정리합니다.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 급하게 스와이프하지 마세요</h3>
				<p>
					매 이동마다 새 타일이 생기므로, 무작정 빠르게 스와이프하면 금세 칸이 차버립니다.
					매 수마다 결과를 예측한 후 이동하세요.
				</p>
				<h3>2. 가능하면 아래와 왼쪽만 사용하세요</h3>
				<p>
					왼쪽 아래 코너 전략을 사용한다면, 위쪽과 오른쪽 스와이프는 최소화하세요.
					특히 큰 타일이 있는 행이 비어 있을 때 위쪽으로 스와이프하면 큰 타일이 이탈합니다.
				</p>
				<h3>3. 2048 이후에도 계속하세요</h3>
				<p>
					2048 타일을 만들면 승리이지만, 게임을 계속 진행할 수 있습니다.
					4096, 8192까지 도전해보세요. 같은 전략이 계속 적용되며, 점수가 크게 올라갑니다.
				</p>
				<h3>4. 작은 숫자를 빨리 처리하세요</h3>
				<p>
					2나 4 같은 작은 타일이 판에 많이 쌓이면 활동 공간이 줄어듭니다.
					작은 타일끼리 빠르게 합쳐서 정리하는 것이 공간 관리의 핵심입니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 2048은 클래식 모드를 제공합니다.
					스와이프 조작으로 직관적으로 플레이할 수 있으며,
					타일 병합 점수의 합계가 최종 점수로 기록됩니다.
				</p>
				<p>
					월별 랭킹에서 다른 유저와 점수를 겨뤄보세요.
					2048을 넘어 더 높은 숫자에 도전하는 것이 고득점의 비결입니다.
				</p>
				<div class="cta-box">
					<a href="/minigames/2048" class="cta-btn">2048 플레이하기</a>
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
