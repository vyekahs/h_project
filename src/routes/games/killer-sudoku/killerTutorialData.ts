export interface KillerTutorialStep {
    title: string;
    desc: string;
    boardSetup?: { [key: string]: number | number[] };
    highlights?: string[];
    targetCells?: string[];
    fillAnimation?: { r: number, c: number, val: number }[];
    arrow?: 'horizontal' | 'vertical' | 'none';
    // Killer-specific: cage definitions for the mini-board
    cages?: { cells: { row: number; col: number }[]; sum: number }[];
}

export const KILLER_TUTORIALS: { [key: string]: any } = {
    killer_easy_1: {
        id: 'killer_easy_1',
        difficulty: 'easy',
        title: '킬러 스도쿠 기초',
        steps: [
            {
                title: "킬러 스도쿠란?",
                desc: "킬러 스도쿠는 일반 스도쿠에 <b>케이지(Cage)</b>라는 점선 영역이 추가된 퍼즐입니다. 각 케이지에는 <b>합계</b>가 표시되어 있어요!",
                cages: [
                    { cells: [{row:3,col:3},{row:3,col:4}], sum: 7 },
                    { cells: [{row:3,col:5},{row:4,col:5}], sum: 11 },
                    { cells: [{row:4,col:3},{row:4,col:4},{row:5,col:4}], sum: 15 },
                    { cells: [{row:5,col:3},{row:5,col:5}], sum: 8 }
                ],
                highlights: []
            },
            {
                title: "기본 규칙",
                desc: "일반 스도쿠 규칙은 동일합니다. <b>가로줄, 세로줄, 3x3 박스</b>에 1~9가 중복 없이 들어갑니다.",
                highlights: ["row-4"],
                arrow: 'horizontal'
            },
            {
                title: "케이지 규칙 1 - 합계",
                desc: "케이지 안의 숫자들을 모두 더하면 <b>왼쪽 위에 표시된 합계</b>와 같아야 합니다. 예: 합이 7인 2칸 케이지 → 가능한 조합은 1+6, 2+5, 3+4!",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4}], sum: 7 }
                ],
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4"]
            },
            {
                title: "케이지 규칙 2 - 중복 금지",
                desc: "케이지 안에서도 <b>같은 숫자를 중복해서 쓸 수 없습니다</b>! 합이 4인 2칸 케이지에 2+2는 안 됩니다. 반드시 1+3이어야 해요.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4}], sum: 4 }
                ],
                boardSetup: { "4-3": 1, "4-4": 3 },
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4"]
            },
            {
                title: "빈 보드에서 시작!",
                desc: "일반 스도쿠와 달리 <b>미리 채워진 숫자가 없습니다</b>. 케이지의 합계와 규칙만을 단서로 풀어나가세요!",
                highlights: []
            }
        ]
    },
    killer_easy_2: {
        id: 'killer_easy_2',
        difficulty: 'easy',
        title: '케이지 조합 기초',
        steps: [
            {
                title: "2칸 케이지 조합",
                desc: "2칸 케이지는 가장 기본입니다. <b>합이 3</b>인 2칸 케이지? 1+2만 가능! <b>합이 17</b>이면? 8+9뿐이죠!",
                cages: [
                    { cells: [{row:2,col:3},{row:2,col:4}], sum: 3 },
                    { cells: [{row:6,col:3},{row:6,col:4}], sum: 17 }
                ],
                boardSetup: { "2-3": [1,2], "2-4": [1,2], "6-3": [8,9], "6-4": [8,9] },
                highlights: [],
                targetCells: ["cell-2-3", "cell-2-4", "cell-6-3", "cell-6-4"]
            },
            {
                title: "유일한 조합 찾기",
                desc: "어떤 합계는 <b>조합이 하나뿐</b>입니다!<br>2칸: 합 3(1+2), 합 4(1+3), 합 16(7+9), 합 17(8+9)<br>이런 케이지는 바로 후보를 좁힐 수 있어요.",
                cages: [
                    { cells: [{row:3,col:2},{row:4,col:2}], sum: 4 },
                    { cells: [{row:3,col:6},{row:4,col:6}], sum: 16 }
                ],
                boardSetup: { "3-2": [1,3], "4-2": [1,3], "3-6": [7,9], "4-6": [7,9] },
                highlights: [],
                targetCells: ["cell-3-2", "cell-4-2", "cell-3-6", "cell-4-6"]
            },
            {
                title: "3칸 케이지",
                desc: "3칸 케이지도 비슷합니다. <b>합이 6</b>인 3칸 케이지? 1+2+3만 가능합니다! <b>합이 24</b>이면? 7+8+9뿐이죠.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4},{row:4,col:5}], sum: 6 }
                ],
                boardSetup: { "4-3": [1,2,3], "4-4": [1,2,3], "4-5": [1,2,3] },
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4", "cell-4-5"]
            },
            {
                title: "조합표 활용",
                desc: "<b>암기하면 유용한 조합들:</b><br>2칸 합3: 1,2 | 합4: 1,3 | 합16: 7,9 | 합17: 8,9<br>3칸 합6: 1,2,3 | 합7: 1,2,4 | 합23: 6,8,9 | 합24: 7,8,9<br>이런 '강제 조합'을 알면 빠르게 풀 수 있어요!",
                highlights: []
            }
        ]
    },
    killer_easy_3: {
        id: 'killer_easy_3',
        difficulty: 'easy',
        title: '1칸 케이지 & 45 규칙',
        steps: [
            {
                title: "1칸 케이지",
                desc: "<b>1칸짜리 케이지</b>는 합 = 그 칸의 값이므로, 바로 숫자를 알 수 있습니다! 합이 5인 1칸 케이지 → 그 칸은 5입니다.",
                cages: [
                    { cells: [{row:4,col:4}], sum: 5 }
                ],
                highlights: [],
                fillAnimation: [{ r: 4, c: 4, val: 5 }]
            },
            {
                title: "45 규칙이란?",
                desc: "모든 가로줄, 세로줄, 3x3 박스의 합은 항상 <b>45</b>입니다. (1+2+3+...+9 = 45) 이 성질을 이용하면 빠져있는 숫자를 찾을 수 있어요!",
                highlights: ["row-4"],
                arrow: 'horizontal'
            },
            {
                title: "45 규칙 적용 예시",
                desc: "한 줄의 케이지 합을 모두 더했는데 <b>44</b>라면? 그 줄에서 케이지에 포함되지 않은 칸의 값은 <b>45 - 44 = 1</b>입니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 11 },
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 9 },
                    { cells: [{row:4,col:5},{row:4,col:6}], sum: 13 },
                    { cells: [{row:4,col:7},{row:4,col:8}], sum: 11 }
                ],
                highlights: ["row-4"],
                targetCells: ["cell-4-4"],
                fillAnimation: [{ r: 4, c: 4, val: 1 }]
            },
            {
                title: "45 규칙 정리",
                desc: "<b>요약:</b> 줄이나 박스에서 모든 케이지 합을 더한 뒤 45에서 빼면, 나머지 칸의 값을 알 수 있습니다. 이것을 <b>'이니(Innie)'</b>라고 부릅니다!",
                highlights: []
            }
        ]
    },
    killer_medium_1: {
        id: 'killer_medium_1',
        difficulty: 'medium',
        title: '케이지 중복 제거',
        steps: [
            {
                title: "케이지와 줄의 교차",
                desc: "케이지 규칙(중복 금지)과 줄 규칙을 <b>동시에</b> 활용하면 후보를 크게 줄일 수 있습니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 9 },
                    { cells: [{row:4,col:2},{row:4,col:3},{row:4,col:4}], sum: 15 }
                ],
                highlights: ["row-4"],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "합 9인 2칸 케이지에 [4,5]가 들어갔다고 합시다. 그러면 같은 줄의 <b>다른 케이지</b>에서도 4와 5를 후보에서 제거할 수 있습니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 9 },
                    { cells: [{row:4,col:2},{row:4,col:3},{row:4,col:4}], sum: 15 }
                ],
                boardSetup: { "4-0": 4, "4-1": 5, "4-2": [1,6,8,9], "4-3": [1,6,8,9], "4-4": [1,6,8,9] },
                highlights: ["row-4"],
                targetCells: ["cell-4-0", "cell-4-1"]
            },
            {
                title: "케이지 내 추론",
                desc: "합 15인 3칸 케이지에서 4,5를 쓸 수 없다면? 남은 후보 중 합이 15가 되는 조합을 찾으세요. 예: 1+6+8=15, 2+6+7=15 등",
                cages: [
                    { cells: [{row:4,col:2},{row:4,col:3},{row:4,col:4}], sum: 15 }
                ],
                boardSetup: { "4-2": [1,2,6,7,8], "4-3": [1,2,6,7,8], "4-4": [1,2,6,7,8] },
                highlights: [],
                targetCells: ["cell-4-2", "cell-4-3", "cell-4-4"]
            },
            {
                title: "케이지 중복 제거 정리",
                desc: "<b>요약:</b> 같은 줄(또는 박스)에서 확정된 숫자는 다른 케이지의 후보에서도 제거! 케이지의 합계와 결합하면 후보를 크게 좁힐 수 있습니다.",
                highlights: []
            }
        ]
    },
    killer_medium_2: {
        id: 'killer_medium_2',
        difficulty: 'medium',
        title: '이니와 아우티 (Innies & Outies)',
        steps: [
            {
                title: "이니(Innie)란?",
                desc: "줄이나 박스에서 <b>대부분의 케이지가 완전히 포함</b>되고, 소수의 칸만 남을 때 → 남은 칸의 합을 45에서 역산할 수 있습니다.",
                highlights: ["row-0"]
            },
            {
                title: "이니 예시",
                desc: "1번째 줄에 케이지 합이 12, 8, 14, 7이 완전히 포함되어 있다면? 총합 = 41. 나머지 한 칸 = <b>45 - 41 = 4</b>!",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1},{row:0,col:2}], sum: 12 },
                    { cells: [{row:0,col:3},{row:0,col:4}], sum: 8 },
                    { cells: [{row:0,col:5},{row:0,col:6},{row:0,col:7}], sum: 14 },
                ],
                highlights: ["row-0"],
                targetCells: ["cell-0-8"],
                fillAnimation: [{ r: 0, c: 8, val: 4 }]
            },
            {
                title: "아우티(Outie)란?",
                desc: "<b>아우티</b>는 반대입니다. 케이지가 줄 경계를 넘어갈 때, 넘어간 부분의 값을 역산합니다.",
                cages: [
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 18 }
                ],
                highlights: ["row-0"],
                targetCells: ["cell-1-8"]
            },
            {
                title: "아우티 계산",
                desc: "합 18인 케이지가 1행(2칸)과 2행(1칸)에 걸쳐 있다면, 1행 전체 합(45)에서 1행의 다른 케이지 합을 빼서 이 케이지의 1행 부분을 알 수 있습니다. 그러면 2행 부분(아우티) = 18 - (1행 부분)!",
                cages: [
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 18 }
                ],
                highlights: ["row-0"],
                targetCells: ["cell-0-7", "cell-0-8", "cell-1-8"]
            },
            {
                title: "이니 & 아우티 정리",
                desc: "<b>요약:</b><br>이니: 줄/박스 안에 남은 칸 = 45 - (포함된 케이지 합)<br>아우티: 줄/박스 밖으로 나간 칸 = 케이지합 - (줄 안 부분)<br><br>45 규칙을 활용한 강력한 기법입니다!",
                highlights: []
            }
        ]
    },
    killer_hard_1: {
        id: 'killer_hard_1',
        difficulty: 'hard',
        title: '조합 분석 심화',
        steps: [
            {
                title: "가능한 조합 좁히기",
                desc: "케이지의 합과 크기만으로도 가능한 조합을 나열할 수 있지만, <b>줄/박스의 다른 숫자</b>를 고려하면 조합을 더 좁힐 수 있습니다.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4},{row:4,col:5}], sum: 15 }
                ],
                boardSetup: { "4-0": 1, "4-1": 2, "4-2": 3 },
                highlights: ["row-4"],
                targetCells: ["cell-4-3", "cell-4-4", "cell-4-5"]
            },
            {
                title: "예시: 제거 과정",
                desc: "합 15인 3칸 케이지. 같은 줄에 이미 1,2,3이 있습니다.<br>가능한 조합: 1+5+9, 2+4+9, 2+6+7, 3+4+8, <b>4+5+6</b><br>1,2,3이 사용됐으므로 → <b>4+5+6만</b> 남습니다!",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4},{row:4,col:5}], sum: 15 }
                ],
                boardSetup: { "4-0": 1, "4-1": 2, "4-2": 3, "4-3": [4,5,6], "4-4": [4,5,6], "4-5": [4,5,6] },
                highlights: ["row-4"],
                targetCells: ["cell-4-3", "cell-4-4", "cell-4-5"]
            },
            {
                title: "교차 제약",
                desc: "케이지가 <b>박스 경계</b>를 넘을 때, 각 박스의 규칙을 추가로 적용할 수 있습니다. 한 박스에 이미 특정 숫자가 있다면, 그 부분에서 제외됩니다.",
                cages: [
                    { cells: [{row:2,col:4},{row:3,col:4}], sum: 11 }
                ],
                boardSetup: { "0-3": 5, "0-5": 8 },
                highlights: ["box-1", "box-4"],
                targetCells: ["cell-2-4", "cell-3-4"]
            },
            {
                title: "조합 분석 정리",
                desc: "<b>요약:</b> 케이지 조합을 나열한 뒤, 줄/박스/다른 케이지의 확정 숫자로 불가능한 조합을 제거하세요. 남는 조합이 적을수록 쉽게 풀립니다!",
                highlights: []
            }
        ]
    },
    killer_hard_2: {
        id: 'killer_hard_2',
        difficulty: 'hard',
        title: '네이키드/히든 세트 (케이지 활용)',
        steps: [
            {
                title: "케이지 + 네이키드 페어",
                desc: "일반 스도쿠의 <b>네이키드 페어</b> 기법을 케이지 정보와 결합하면 더 강력해집니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 11 },
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 7 }
                ],
                boardSetup: { "4-0": [2,9], "4-1": [2,9], "4-2": [3,4], "4-3": [3,4] },
                highlights: ["row-4"],
                targetCells: ["cell-4-0", "cell-4-1", "cell-4-2", "cell-4-3"]
            },
            {
                title: "케이지가 만드는 페어",
                desc: "합 11인 2칸 케이지: 가능한 조합은 [2,9], [3,8], [4,7], [5,6].<br>합 7인 2칸 케이지: [1,6], [2,5], [3,4].<br>줄의 다른 칸을 분석하여 각 케이지를 하나의 조합으로 좁히면 → <b>자연스럽게 페어가 형성</b>됩니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 11 },
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 7 }
                ],
                boardSetup: { "4-0": [2,9], "4-1": [2,9], "4-2": [3,4], "4-3": [3,4] },
                highlights: ["row-4"],
                targetCells: ["cell-4-0", "cell-4-1"]
            },
            {
                title: "다른 칸에서 제거",
                desc: "케이지에서 [2,9]와 [3,4]가 확정되었으므로, 같은 줄의 <b>나머지 칸</b>에서 2, 3, 4, 9를 모두 제거할 수 있습니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 11 },
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 7 }
                ],
                boardSetup: {
                    "4-0": [2,9], "4-1": [2,9], "4-2": [3,4], "4-3": [3,4],
                    "4-4": [1,5,6,7,8], "4-5": [1,5,6,7,8], "4-6": [1,5,6,7,8], "4-7": [1,5,6,7,8], "4-8": [1,5,6,7,8]
                },
                highlights: ["row-4"],
                targetCells: ["cell-4-4", "cell-4-5", "cell-4-6", "cell-4-7", "cell-4-8"]
            },
            {
                title: "케이지 세트 정리",
                desc: "<b>요약:</b> 케이지의 조합 분석으로 후보를 좁히면, 네이키드/히든 페어와 동일한 효과를 얻을 수 있습니다. 케이지 경계를 '자연스러운 그룹'으로 활용하세요!",
                highlights: []
            }
        ]
    },
    killer_expert_1: {
        id: 'killer_expert_1',
        difficulty: 'expert',
        title: '복합 45 규칙',
        steps: [
            {
                title: "여러 줄/박스 결합",
                desc: "45 규칙은 한 줄뿐 아니라 <b>여러 줄이나 박스를 결합</b>해서도 적용할 수 있습니다! 2줄의 합 = 90, 3줄 = 135...",
                highlights: ["row-0", "row-1"]
            },
            {
                title: "결합 예시",
                desc: "1-2행(합 90)에 완전히 포함된 케이지 합 = 85. 2행에서 3행으로 나가는 아우티 칸이 하나 있다면? 아우티 = 케이지합 - 85... 가 아니라, <b>포함되지 않은 이니</b>와 <b>삐져나온 아우티</b>를 각각 계산해야 합니다!",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1},{row:0,col:2}], sum: 10 },
                    { cells: [{row:0,col:3},{row:0,col:4},{row:0,col:5},{row:0,col:6}], sum: 22 },
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 15 },
                    { cells: [{row:1,col:0},{row:1,col:1}], sum: 8 },
                    { cells: [{row:1,col:2},{row:1,col:3},{row:1,col:4}], sum: 17 },
                    { cells: [{row:1,col:5},{row:1,col:6},{row:1,col:7}], sum: 18 }
                ],
                highlights: ["row-0", "row-1"],
                targetCells: ["cell-1-8"]
            },
            {
                title: "계산 과정",
                desc: "1-2행 합 = 90<br>포함된 케이지 합: 10+22+8+17+18 = 75<br>나가는 케이지(합15)의 1-2행 부분: 15에서 아우티 빼기<br>90 = 75 + (15의 1-2행 부분)<br>→ 15의 1-2행 부분 = 15<br>→ 아우티(1-8 칸) = 15 - 15 = <b>0?</b> ... 아닙니다. 전체 케이지합으로 계산하세요!",
                highlights: ["row-0", "row-1"],
                targetCells: ["cell-1-8"]
            },
            {
                title: "복합 45 정리",
                desc: "<b>핵심 공식:</b><br>n줄 합 = 45 × n<br>이니(안에 남은 칸) = 45n - 완전 포함 케이지합<br>아우티(밖으로 나간 칸) = 경계 케이지합 - 안쪽 부분<br><br>복잡하지만 숙달되면 매우 강력합니다!",
                highlights: []
            }
        ]
    }
};

export const KILLER_TUTORIAL_ORDER = [
    'killer_easy_1', 'killer_easy_2', 'killer_easy_3',
    'killer_medium_1', 'killer_medium_2',
    'killer_hard_1', 'killer_hard_2',
    'killer_expert_1'
];
