<svelte:head>
	<title>킬러 스도쿠 가이드 - 규칙과 전략 | 혼자놀다가게</title>
	<meta name="description" content="킬러 스도쿠의 규칙, 케이지 합산법, 일반 스도쿠와의 차이점, 풀이 전략을 상세하게 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>

		<div class="hero">
			<span class="hero-icon">🧩</span>
			<h1>킬러 스도쿠 가이드</h1>
			<p class="subtitle">스도쿠에 연산 한 스푼, 두뇌 풀가동 퍼즐</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">킬러 스도쿠란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#diff">일반 스도쿠와의 차이점</a></li>
				<li><a href="#cage">케이지 합산 전략</a></li>
				<li><a href="#techniques">풀이 기법</a></li>
				<li><a href="#combos">자주 쓰는 합산 조합</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>킬러 스도쿠란?</h2>
				<p>
					킬러 스도쿠(Killer Sudoku)는 일반 스도쿠의 규칙에 덧셈 조건이 추가된 변형 퍼즐입니다.
					1999년경 일본에서 처음 등장했으며, "사칙연산 스도쿠"라고도 불립니다.
					일반 스도쿠보다 한 단계 높은 논리적 추론이 필요하여, 스도쿠에 익숙한 분들에게 새로운 도전을 제공합니다.
				</p>
				<p>
					퍼즐판에는 점선으로 구분된 "케이지(cage)"라는 그룹이 있고, 각 케이지에는 목표 합계가 표시됩니다.
					해당 케이지 안의 숫자들을 모두 더하면 그 합계가 되어야 합니다.
					이 추가 조건이 풀이의 핵심 단서가 됩니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<p>킬러 스도쿠는 일반 스도쿠의 세 가지 규칙에 두 가지가 추가됩니다.</p>
				<ol>
					<li>각 <strong>행</strong>에 1~9가 한 번씩</li>
					<li>각 <strong>열</strong>에 1~9가 한 번씩</li>
					<li>각 <strong>3×3 박스</strong>에 1~9가 한 번씩</li>
					<li><strong>케이지 내 숫자의 합</strong>이 표시된 목표 합계와 일치해야 합니다</li>
					<li><strong>케이지 내에 같은 숫자</strong>가 반복될 수 없습니다</li>
				</ol>
				<div class="info-box">
					<strong>핵심 차이</strong>: 일반 스도쿠에서는 이미 채워진 숫자(힌트)가 주어지지만,
					킬러 스도쿠에서는 힌트 숫자 대신 케이지와 합계가 주어집니다.
					처음 시작할 때 빈칸뿐이며, 합산 조건을 활용해 숫자를 추론합니다.
				</div>
			</section>

			<section id="diff">
				<h2>일반 스도쿠와의 차이점</h2>
				<h3>힌트 방식</h3>
				<p>
					일반 스도쿠는 이미 채워진 숫자가 힌트인 반면, 킬러 스도쿠는 케이지의 합계가 힌트입니다.
					따라서 풀이 접근법이 상당히 다릅니다.
				</p>
				<h3>추가 제약 조건</h3>
				<p>
					케이지 내에서 숫자가 중복될 수 없다는 규칙이 추가로 적용됩니다.
					이 제약은 한 케이지가 하나의 행/열/박스 안에 있을 때 특히 유용합니다.
				</p>
				<h3>연산 능력</h3>
				<p>
					간단한 덧셈이 필요합니다. 하지만 복잡한 수학이 아닌 1~9 범위의 기본 덧셈이므로
					누구나 시도할 수 있습니다. 주요 합산 조합을 외워두면 풀이 속도가 빨라집니다.
				</p>
			</section>

			<section id="cage">
				<h2>케이지 합산 전략</h2>
				<h3>유일한 조합 케이지</h3>
				<p>
					특정 합계와 칸 수의 조합에서는 가능한 숫자 조합이 하나뿐인 경우가 있습니다.
					이런 케이지를 먼저 찾으면 풀이를 빠르게 시작할 수 있습니다.
				</p>
				<ul>
					<li><strong>2칸 합계 3</strong>: {1,2}만 가능</li>
					<li><strong>2칸 합계 4</strong>: {1,3}만 가능</li>
					<li><strong>2칸 합계 16</strong>: {7,9}만 가능</li>
					<li><strong>2칸 합계 17</strong>: {8,9}만 가능</li>
					<li><strong>3칸 합계 6</strong>: {1,2,3}만 가능</li>
					<li><strong>3칸 합계 7</strong>: {1,2,4}만 가능</li>
					<li><strong>3칸 합계 23</strong>: {6,8,9}만 가능</li>
					<li><strong>3칸 합계 24</strong>: {7,8,9}만 가능</li>
				</ul>

				<h3>극단값 활용</h3>
				<p>
					합계가 매우 작거나 매우 큰 케이지는 가능한 숫자 조합이 적습니다.
					2칸 케이지에서 합이 3이면 반드시 1과 2이고, 합이 17이면 반드시 8과 9입니다.
					이런 극단적인 케이지부터 풀이를 시작하세요.
				</p>

				<h3>45의 법칙</h3>
				<p>
					모든 행, 열, 3×3 박스의 숫자 합은 항상 45입니다(1+2+...+9=45).
					이 법칙을 활용하면 특정 칸이나 케이지의 값을 역으로 추론할 수 있습니다.
				</p>
				<p>
					예를 들어, 한 행에서 하나의 케이지만 걸쳐 있다면,
					45에서 나머지 케이지들의 합을 빼면 그 케이지에 속한 칸의 값을 알 수 있습니다.
				</p>
			</section>

			<section id="techniques">
				<h2>풀이 기법</h2>
				<h3>케이지 분석 우선</h3>
				<p>
					킬러 스도쿠에서는 가능한 합산 조합을 먼저 분석합니다.
					각 케이지에 들어갈 수 있는 숫자 조합을 메모해두고,
					행/열/박스의 제약과 교차 분석하여 후보를 줄여나갑니다.
				</p>

				<h3>일반 스도쿠 기법 병행</h3>
				<p>
					어느 정도 숫자가 채워지면 일반 스도쿠의 기법(네이키드 싱글, 히든 싱글 등)도 함께 사용합니다.
					케이지 분석과 스도쿠 기법을 번갈아 적용하는 것이 효과적입니다.
				</p>

				<h3>이중 교차 분석</h3>
				<p>
					케이지가 두 개의 행이나 박스에 걸쳐 있을 때, 각 영역의 제약을 동시에 적용하면
					후보를 더 효과적으로 줄일 수 있습니다.
				</p>
			</section>

			<section id="combos">
				<h2>자주 쓰는 합산 조합</h2>
				<h3>2칸 케이지</h3>
				<ul>
					<li>합 3: {1,2}</li>
					<li>합 4: {1,3}</li>
					<li>합 5: {1,4} {2,3}</li>
					<li>합 6: {1,5} {2,4}</li>
					<li>합 7: {1,6} {2,5} {3,4}</li>
					<li>합 10: {1,9} {2,8} {3,7} {4,6}</li>
					<li>합 13: {4,9} {5,8} {6,7}</li>
					<li>합 15: {6,9} {7,8}</li>
					<li>합 16: {7,9}</li>
					<li>합 17: {8,9}</li>
				</ul>
				<h3>3칸 케이지</h3>
				<ul>
					<li>합 6: {1,2,3}</li>
					<li>합 7: {1,2,4}</li>
					<li>합 8: {1,2,5} {1,3,4}</li>
					<li>합 23: {6,8,9}</li>
					<li>합 24: {7,8,9}</li>
				</ul>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>
				<h3>1. 유일 조합 케이지부터 시작하세요</h3>
				<p>
					합이 3(2칸), 4(2칸), 16(2칸), 17(2칸), 6(3칸), 24(3칸) 같은 유일 조합 케이지를 먼저 찾으세요.
					이 케이지들은 들어갈 숫자가 확정되므로 풀이의 발판이 됩니다.
				</p>
				<h3>2. 45의 법칙을 자주 활용하세요</h3>
				<p>
					행, 열, 박스의 합이 45라는 법칙으로 빠진 숫자를 역추적할 수 있습니다.
					특히 한 칸만 남았을 때 즉시 값을 계산할 수 있습니다.
				</p>
				<h3>3. 큰 그림을 보세요</h3>
				<p>
					개별 케이지에만 집중하지 말고, 행/열/박스 전체를 관찰하세요.
					여러 케이지의 합산 정보를 종합하면 개별 분석으로는 보이지 않던 단서가 나타납니다.
				</p>
				<h3>4. 스도쿠 기초를 먼저 익히세요</h3>
				<p>
					킬러 스도쿠를 처음 시도한다면, 먼저 일반 스도쿠를 충분히 풀어보고 오는 것을 추천합니다.
					기본적인 소거법과 패턴 인식이 킬러 스도쿠에서도 동일하게 적용되기 때문입니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 킬러 스도쿠는 쉬움부터 마스터까지 5단계 난이도를 제공합니다.
					케이지 합계가 색상으로 구분되어 시각적으로 읽기 편하며,
					메모 기능과 실행 취소를 지원합니다.
				</p>
				<p>
					일반 스도쿠와 같은 랭킹 시스템이 적용되어, 클리어 시간과 실수 횟수로 점수가 계산됩니다.
					스도쿠에 익숙하다면 킬러 스도쿠에 도전하여 한 단계 더 성장해보세요.
				</p>
				<div class="cta-box">
					<a href="/minigames/killer-sudoku" class="cta-btn">킬러 스도쿠 플레이하기</a>
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
