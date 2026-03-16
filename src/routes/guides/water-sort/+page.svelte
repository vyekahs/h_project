<svelte:head>
	<title>워터소트 가이드 - 규칙과 전략 | 혼자놀다가게</title>
	<meta name="description" content="워터소트(Water Sort) 퍼즐의 규칙, 색깔 물 정렬 방법, 풀이 전략과 팁을 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>
		<div class="hero">
			<span class="hero-icon">🧪</span>
			<h1>워터소트 가이드</h1>
			<p class="subtitle">색깔 물을 정리하여 시험관을 완성하세요</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">워터소트란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#strategy">풀이 전략</a></li>
				<li><a href="#patterns">자주 나오는 실수</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>워터소트란?</h2>
				<p>
					워터소트(Water Sort Puzzle)는 여러 시험관에 섞여 있는 색깔 물을 같은 색끼리 정렬하는 퍼즐 게임입니다.
					단순하고 직관적인 규칙으로 남녀노소 누구나 즐길 수 있으며,
					2020년대 들어 모바일 게임으로 폭발적인 인기를 얻었습니다.
				</p>
				<p>
					시험관 사이로 물을 옮기는 행위는 간단하지만, 어떤 순서로 옮기느냐에 따라
					풀이가 가능해지기도 하고 막히기도 합니다.
					계획적인 사고와 인내심이 필요한 두뇌 퍼즐입니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<ol>
					<li>여러 시험관에 다양한 색의 물이 섞여 있습니다.</li>
					<li>한 시험관의 맨 위 물을 다른 시험관으로 옮길 수 있습니다.</li>
					<li>물을 옮기려면 <strong>받는 시험관이 비어 있거나</strong>, <strong>맨 위 색이 같아야</strong> 합니다.</li>
					<li>시험관에는 최대 4칸의 물이 들어갑니다. 꽉 찬 시험관에는 물을 넣을 수 없습니다.</li>
					<li>같은 색의 연속된 물은 한 번에 이동합니다(예: 파랑-파랑이 위에 있으면 둘 다 이동).</li>
					<li>모든 시험관이 한 색으로 채워지거나 비면 클리어입니다.</li>
				</ol>
				<div class="info-box">
					<strong>빈 시험관의 중요성</strong>: 보통 1~2개의 빈 시험관이 제공됩니다.
					이 빈 시험관은 임시 보관소 역할을 하며, 효율적으로 활용하는 것이 풀이의 핵심입니다.
				</div>
			</section>

			<section id="strategy">
				<h2>풀이 전략</h2>
				<h3>1. 빈 시험관을 전략적으로 사용하세요</h3>
				<p>
					빈 시험관은 매우 소중한 자원입니다. 무작정 물을 옮겨 빈 시험관을 채우지 마세요.
					꼭 필요한 상황에서만 임시 보관 용도로 사용하고, 가능한 한 빨리 다시 비우는 것이 좋습니다.
				</p>

				<h3>2. 같은 색을 한 곳에 모으세요</h3>
				<p>
					물을 옮길 때는 가능한 한 같은 색끼리 합치세요. 한 시험관에 같은 색을 많이 모을수록
					정리가 빨라집니다. 반대로 다른 색 위에 물을 쌓으면 나중에 더 많은 이동이 필요합니다.
				</p>

				<h3>3. 바닥 색을 확인하세요</h3>
				<p>
					각 시험관의 바닥(가장 아래)에 있는 색을 확인하세요. 바닥 색이 모두 다르면
					각 시험관이 최종적으로 어떤 색이 될지 계획을 세울 수 있습니다.
					같은 바닥 색이 여러 시험관에 있다면, 하나에 합치는 것을 목표로 하세요.
				</p>

				<h3>4. 역순으로 생각하세요</h3>
				<p>
					완성된 상태에서 역으로 "어떤 이동이 마지막이었을까"를 생각하면
					올바른 이동 순서를 찾는 데 도움이 됩니다.
					특히 막혔을 때 이 방법이 효과적입니다.
				</p>

				<h3>5. 한 시험관을 완성하는 데 집중하세요</h3>
				<p>
					모든 시험관을 동시에 정리하기보다, 하나의 시험관을 완전히 한 색으로 채우는 데
					집중하세요. 시험관 하나가 완성되면 빈 시험관이 하나 더 생기는 것과 같은 효과가 있어
					나머지 풀이가 쉬워집니다.
				</p>
			</section>

			<section id="patterns">
				<h2>자주 나오는 실수</h2>
				<h3>빈 시험관을 너무 빨리 채우기</h3>
				<p>
					빈 시험관이 있으면 일단 물을 옮기고 싶은 유혹이 있지만,
					계획 없이 옮기면 나중에 이동할 공간이 부족해집니다.
					빈 시험관을 채우기 전에 "이 이동이 최종 정렬에 도움이 되는가?"를 확인하세요.
				</p>
				<h3>한 색에만 집착하기</h3>
				<p>
					특정 색을 완성하는 데만 집중하다 보면 다른 색들이 더 엉킬 수 있습니다.
					전체적인 균형을 보면서 가장 효율적인 이동을 선택하세요.
				</p>
				<h3>되돌리기를 두려워하기</h3>
				<p>
					잘못된 방향으로 진행했다면 주저 없이 되돌리세요.
					잘못된 이동을 계속 쌓으면 점점 더 복잡해집니다.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 이동 전에 2~3수 앞을 보세요</h3>
				<p>
					체스처럼 몇 수 앞을 내다보며 이동하면 실수를 줄일 수 있습니다.
					"이 물을 옮기면 다음에 무엇을 할 수 있을까?"를 항상 생각하세요.
				</p>
				<h3>2. 가장 많이 쌓인 색부터 정리하세요</h3>
				<p>
					특정 색이 한 시험관에 이미 많이 모여 있다면 그 색을 먼저 완성하는 것이 효율적입니다.
					적은 이동으로 시험관 하나를 완성할 수 있기 때문입니다.
				</p>
				<h3>3. 이동 횟수를 의식하세요</h3>
				<p>
					점수는 이동 횟수와 시간을 기반으로 계산됩니다.
					불필요한 왕복 이동을 피하고, 한 번에 여러 칸을 옮길 수 있는 기회를 놓치지 마세요.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 워터소트는 5단계 난이도를 제공합니다.
					쉬운 단계에서는 적은 수의 시험관과 색으로 시작하여 기본을 익힐 수 있고,
					높은 난이도에서는 많은 시험관과 색깔이 등장하여 치밀한 전략이 필요합니다.
				</p>
				<p>
					직관적인 탭 조작과 실행 취소 기능을 제공하며,
					이동 횟수와 클리어 시간으로 점수가 계산됩니다.
				</p>
				<div class="cta-box">
					<a href="/minigames/water-sort" class="cta-btn">워터소트 플레이하기</a>
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
