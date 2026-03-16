<svelte:head>
	<title>스도쿠 가이드 - 규칙과 풀이법 | 혼자놀다가게</title>
	<meta name="description" content="스도쿠 퍼즐의 기본 규칙, 풀이 기법(네이키드 싱글, 히든 싱글, 포인팅 페어 등), 난이도별 접근법을 상세하게 안내합니다." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/guides" class="back-link">← 가이드 목록</a>

		<div class="hero">
			<span class="hero-icon">🔢</span>
			<h1>스도쿠 완벽 가이드</h1>
			<p class="subtitle">논리 퍼즐의 정석, 기초부터 고급 기법까지</p>
		</div>

		<nav class="toc">
			<h2>목차</h2>
			<ol>
				<li><a href="#intro">스도쿠란?</a></li>
				<li><a href="#rules">기본 규칙</a></li>
				<li><a href="#basic">기본 풀이법</a></li>
				<li><a href="#intermediate">중급 풀이법</a></li>
				<li><a href="#advanced">고급 풀이법</a></li>
				<li><a href="#difficulty">난이도별 접근법</a></li>
				<li><a href="#tips">실전 팁</a></li>
				<li><a href="#play">혼자놀다가게에서 플레이하기</a></li>
			</ol>
		</nav>

		<article>
			<section id="intro">
				<h2>스도쿠란?</h2>
				<p>
					스도쿠(Sudoku)는 9×9 격자에 1부터 9까지의 숫자를 채워 넣는 논리 퍼즐입니다.
					이름은 일본어로 "숫자는 한 번만(数字は独身に限る)"이라는 의미에서 왔으며,
					1986년 일본의 퍼즐 잡지 니콜리(Nikoli)에서 현재의 형태로 정립되었습니다.
				</p>
				<p>
					수학적 계산이 필요 없는 순수 논리 퍼즐로, 주어진 숫자들을 단서로 삼아 빈칸을 채워나갑니다.
					간단한 규칙이지만 난이도에 따라 매우 깊은 사고력이 필요한 것이 매력입니다.
					전 세계적으로 가장 인기 있는 퍼즐 중 하나이며, 신문, 잡지, 앱 등 다양한 곳에서 즐길 수 있습니다.
				</p>
			</section>

			<section id="rules">
				<h2>기본 규칙</h2>
				<p>규칙은 매우 단순합니다. 세 가지 조건만 만족하면 됩니다.</p>
				<ol>
					<li><strong>각 행(가로줄)</strong>에 1~9 숫자가 한 번씩만 들어가야 합니다.</li>
					<li><strong>각 열(세로줄)</strong>에 1~9 숫자가 한 번씩만 들어가야 합니다.</li>
					<li><strong>각 3×3 박스</strong>에 1~9 숫자가 한 번씩만 들어가야 합니다.</li>
				</ol>
				<p>
					9×9 격자는 9개의 3×3 박스로 나뉘어 있습니다. 이미 채워진 숫자(힌트)를 기반으로
					나머지 빈칸을 논리적으로 추론하여 채워 넣으면 됩니다.
				</p>
				<div class="info-box">
					<strong>핵심 원리</strong>: 같은 행, 열, 박스에 같은 숫자가 두 번 나올 수 없다는 것이 스도쿠의 유일한 규칙입니다.
					이 제약 조건을 활용하여 소거법으로 정답을 찾아갑니다.
				</div>
			</section>

			<section id="basic">
				<h2>기본 풀이법</h2>

				<h3>풀 하우스 (Full House)</h3>
				<p>
					행, 열 또는 박스에 빈칸이 하나만 남았을 때, 1~9 중 없는 숫자를 바로 채울 수 있습니다.
					이것이 가장 기본적이고 확실한 풀이법입니다.
				</p>

				<h3>네이키드 싱글 (Naked Single)</h3>
				<p>
					특정 칸에 들어갈 수 있는 후보 숫자가 하나뿐일 때 그 숫자를 확정하는 기법입니다.
					해당 칸이 속한 행, 열, 박스에 이미 있는 숫자들을 제외하면,
					가능한 숫자가 하나만 남을 때 사용합니다.
				</p>
				<p>
					예를 들어, 어떤 칸의 행에 1,2,3,5가 있고, 열에 4,7,8이 있고,
					박스에 6,9가 있다면, 이 칸에 들어갈 수 있는 숫자는 없어지게 되므로 다시 확인이 필요합니다.
					이처럼 후보를 하나씩 소거해나가는 것이 기본입니다.
				</p>

				<h3>히든 싱글 (Hidden Single)</h3>
				<p>
					행, 열 또는 박스 내에서 특정 숫자가 들어갈 수 있는 칸이 하나뿐일 때 사용하는 기법입니다.
					여러 칸에 후보가 여러 개 있더라도, 특정 숫자의 입장에서 보면 들어갈 곳이 한 곳뿐인 경우가 있습니다.
				</p>
				<p>
					네이키드 싱글이 "이 칸에 무엇이 들어가는가"를 묻는다면,
					히든 싱글은 "이 숫자가 어디에 들어가는가"를 묻는 관점의 전환입니다.
				</p>
			</section>

			<section id="intermediate">
				<h2>중급 풀이법</h2>

				<h3>포인팅 페어/트리플 (Pointing Pair/Triple)</h3>
				<p>
					3×3 박스 안에서 특정 숫자의 후보가 한 행 또는 한 열에만 존재할 때,
					그 행/열의 다른 박스에 있는 같은 숫자 후보를 제거할 수 있습니다.
					왜냐하면 그 숫자는 반드시 해당 박스의 그 행/열에 위치해야 하기 때문입니다.
				</p>

				<h3>네이키드 페어 (Naked Pair)</h3>
				<p>
					한 행, 열 또는 박스 내에서 두 칸의 후보 숫자가 완전히 동일한 2개의 숫자로만 이루어져 있을 때,
					같은 영역의 다른 칸에서 그 두 숫자를 후보에서 제거할 수 있습니다.
				</p>
				<p>
					예를 들어, 한 행의 두 칸에 각각 {3,7}만 가능하다면,
					3과 7은 반드시 이 두 칸에 들어가므로 같은 행의 다른 칸에서 3과 7을 제외합니다.
				</p>

				<h3>히든 페어 (Hidden Pair)</h3>
				<p>
					한 영역에서 두 숫자가 같은 두 칸에만 후보로 존재할 때, 그 두 칸의 다른 후보 숫자를 모두 제거할 수 있습니다.
					네이키드 페어의 "숨겨진" 버전으로, 다른 후보 숫자에 가려져 발견하기 어려운 경우가 많습니다.
				</p>
			</section>

			<section id="advanced">
				<h2>고급 풀이법</h2>

				<h3>X-Wing</h3>
				<p>
					특정 숫자의 후보가 두 행에서 각각 같은 두 열에만 존재할 때 사용합니다.
					이 패턴을 발견하면 해당 두 열의 다른 행에서 그 숫자를 후보에서 제거할 수 있습니다.
					네 칸이 직사각형을 이루는 모양에서 이름이 유래했습니다.
				</p>

				<h3>XY-Wing</h3>
				<p>
					세 칸이 Y자 형태로 연결되어 각각 두 개의 후보만 가지고 있을 때 사용하는 기법입니다.
					중심 칸(피벗)과 두 개의 날개 칸이 특정 조건을 만족하면,
					두 날개 칸이 모두 볼 수 있는 칸에서 공통 후보를 제거할 수 있습니다.
				</p>

				<h3>Swordfish</h3>
				<p>
					X-Wing의 확장 버전으로, 세 행과 세 열에 걸쳐 나타나는 패턴입니다.
					마스터 난이도의 퍼즐에서 주로 사용되며, 숙련된 풀이자도 발견하기 어려운 고급 기법입니다.
				</p>
			</section>

			<section id="difficulty">
				<h2>난이도별 접근법</h2>

				<h3>쉬움 (Easy)</h3>
				<p>
					풀 하우스와 네이키드 싱글만으로 풀 수 있는 난이도입니다. 빈칸이 적고 힌트가 많아
					처음 스도쿠를 접하는 분에게 적합합니다. 한 칸씩 확인하며 소거법에 익숙해지세요.
				</p>

				<h3>보통 (Medium)</h3>
				<p>
					히든 싱글과 포인팅 페어를 활용해야 하는 난이도입니다.
					"이 칸에 뭐가 들어가지?"와 "이 숫자가 어디에 들어가지?"를 번갈아 물어보세요.
				</p>

				<h3>어려움 (Hard)</h3>
				<p>
					네이키드 페어, 히든 페어 등 중급 기법이 필요합니다.
					후보 숫자를 메모(펜슬마크)하며 풀어야 효율적입니다.
				</p>

				<h3>전문가 (Expert)</h3>
				<p>
					X-Wing, XY-Wing 같은 고급 기법이 필요한 난이도입니다.
					패턴 인식 능력과 깊은 논리적 추론이 요구됩니다.
				</p>

				<h3>마스터 (Master)</h3>
				<p>
					Swordfish, 체인 기법 등 최고급 풀이법을 요구하는 난이도입니다.
					스도쿠에 상당히 숙련된 분들에게 도전적인 레벨입니다.
				</p>
			</section>

			<section id="tips">
				<h2>실전 팁</h2>

				<h3>1. 메모 기능을 활용하세요</h3>
				<p>
					중급 이상 난이도에서는 각 칸에 가능한 후보 숫자를 메모하는 것이 필수적입니다.
					혼자놀다가게의 스도쿠에서는 메모 모드를 제공하니 적극 활용하세요.
				</p>

				<h3>2. 한 숫자씩 집중하세요</h3>
				<p>
					모든 칸을 동시에 분석하기보다, 특정 숫자 하나를 골라 그 숫자가 들어갈 위치를 먼저 찾는 것이 효율적입니다.
					1부터 9까지 순서대로, 또는 가장 많이 나온 숫자부터 정리해보세요.
				</p>

				<h3>3. 교차 지점을 확인하세요</h3>
				<p>
					여러 행, 열, 박스가 만나는 지점은 제약 조건이 많아 후보가 적은 경우가 많습니다.
					숫자가 많이 채워진 행/열/박스의 교차 지점부터 확인하면 빠르게 진전시킬 수 있습니다.
				</p>

				<h3>4. 막히면 관점을 바꾸세요</h3>
				<p>
					네이키드 싱글로 안 풀리면 히든 싱글을, 그래도 안 되면 포인팅 페어나 네이키드 페어를 시도하세요.
					같은 부분만 보지 말고 다른 영역으로 시선을 옮기는 것도 도움이 됩니다.
				</p>
			</section>

			<section id="play">
				<h2>혼자놀다가게에서 플레이하기</h2>
				<p>
					혼자놀다가게의 스도쿠는 5단계 난이도를 제공합니다. 쉬움부터 마스터까지,
					자신의 실력에 맞는 난이도를 선택하여 도전하세요.
				</p>
				<p>
					메모 기능, 실행 취소, 힌트 등 편리한 기능을 제공하며,
					클리어 시간과 실수 횟수를 기반으로 점수가 계산됩니다.
					월별 랭킹에서 다른 유저와 점수를 겨뤄보세요.
				</p>
				<div class="cta-box">
					<a href="/minigames/sudoku" class="cta-btn">스도쿠 플레이하기</a>
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
