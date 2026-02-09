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
                desc: "킬러 스도쿠는 일반 스도쿠 규칙에 <b>케이지(Cage)</b>라는 점선 영역이 추가된 퍼즐입니다. 각 케이지 왼쪽 위의 숫자는 <b>영역 내 숫자의 합</b>을 의미합니다.",
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
                desc: "기본 스도쿠 규칙은 같습니다. <b>가로줄, 세로줄, 3x3 박스</b>에 1부터 9까지의 숫자가 중복 없이 하나씩 들어가야 합니다.",
                highlights: ["row-4"],
                arrow: 'horizontal'
            },
            {
                title: "케이지 규칙 1 - 합계",
                desc: "케이지 안의 숫자를 모두 더하면 <b>표시된 합계</b>와 같아야 합니다.<br>예: 합이 7인 2칸 → 1+6, 2+5, 3+4 중 하나입니다.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4}], sum: 7 }
                ],
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4"]
            },
            {
                title: "케이지 규칙 2 - 중복 금지",
                desc: "케이지 안에서도 <b>숫자는 중복될 수 없습니다</b>.<br>합이 4인 2칸 케이지라면? 2+2는 불가능하고, <b>1+3</b>만 가능합니다.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4}], sum: 4 }
                ],
                boardSetup: { "4-3": 1, "4-4": 3 },
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4"]
            }
        ]
    },
    killer_easy_2: {
        id: 'killer_easy_2',
        difficulty: 'easy',
        title: '유일한 조합 (Unique Sums)',
        steps: [
            {
                title: "조합이 하나뿐인 경우",
                desc: "어떤 합계는 <b>조합이 딱 하나</b>밖에 없습니다. 이런 케이지를 찾으면 문제를 쉽게 풀 수 있습니다!<br>예: 2칸 합 3 → <b>1, 2</b>",
                cages: [
                    { cells: [{row:2,col:3},{row:2,col:4}], sum: 3 }
                ],
                boardSetup: { "2-3": [1,2], "2-4": [1,2] },
                highlights: [],
                targetCells: ["cell-2-3", "cell-2-4"]
            },
            {
                title: "2칸 유일 조합",
                desc: "꼭 외워두세요!<br>합 3 (1,2) / 합 4 (1,3)<br>합 16 (7,9) / 합 17 (8,9)",
                cages: [
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 4 },
                    { cells: [{row:4,col:6},{row:4,col:7}], sum: 17 }
                ],
                boardSetup: { "4-2": [1,3], "4-3": [1,3], "4-6": [8,9], "4-7": [8,9] },
                highlights: [],
                targetCells: ["cell-4-2", "cell-4-3", "cell-4-6", "cell-4-7"]
            },
            {
                title: "3칸 유일 조합",
                desc: "3칸짜리도 있습니다.<br>합 6 (1,2,3) / 합 24 (7,8,9)<br>숫자가 확정되진 않아도, 들어갈 수 있는 후보 숫자를 메모해두면 큰 도움이 됩니다.",
                cages: [
                    { cells: [{row:6,col:3},{row:6,col:4},{row:6,col:5}], sum: 6 }
                ],
                boardSetup: { "6-3": [1,2,3], "6-4": [1,2,3], "6-5": [1,2,3] },
                highlights: [],
                targetCells: ["cell-6-3", "cell-6-4", "cell-6-5"]
            }
        ]
    },
    killer_easy_3: {
        id: 'killer_easy_3',
        difficulty: 'easy',
        title: '45 규칙 (The 45 Rule)',
        steps: [
            {
                title: "1칸 케이지",
                desc: "가장 쉬운 힌트! <b>1칸짜리 케이지</b>는 그 자체가 숫자입니다.<br>합이 5인 1칸 케이지 → <b>5</b> 확정!",
                cages: [
                    { cells: [{row:4,col:4}], sum: 5 }
                ],
                highlights: [],
                fillAnimation: [{ r: 4, c: 4, val: 5 }]
            },
            {
                title: "45 규칙이란?",
                desc: "스도쿠의 모든 가로줄, 세로줄, 박스의 합은 항상 <b>45</b>입니다.<br>(1+2+3+...+9 = 45)<br>이 절대적인 규칙을 이용해 빈 칸의 숫자를 찾을 수 있습니다.",
                highlights: ["row-4"],
                arrow: 'horizontal'
            },
            {
                title: "45 규칙 활용",
                desc: "이 줄의 케이지 합들을 보세요: 11+9+13+11 = <b>44</b>입니다.<br>줄의 총합은 45여야 하므로, 남은 한 칸(케이지에 없는 칸)은 <b>45 - 44 = 1</b>이어야 합니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 11 },
                    { cells: [{row:4,col:2},{row:4,col:3}], sum: 9 },
                    { cells: [{row:4,col:5},{row:4,col:6}], sum: 13 },
                    { cells: [{row:4,col:7},{row:4,col:8}], sum: 11 }
                ],
                highlights: ["row-4"],
                targetCells: ["cell-4-4"],
                fillAnimation: [{ r: 4, c: 4, val: 1 }]
            }
        ]
    },
    killer_medium_1: {
        id: 'killer_medium_1',
        difficulty: 'medium',
        title: '케이지와 스도쿠의 결합',
        steps: [
            {
                title: "규칙의 시너지",
                desc: "킬러 스도쿠의 가장 강력한 무기는 <b>케이지 규칙</b>(합계)과 <b>스도쿠 규칙</b>(중복 금지)을 <b>동시에 적용</b>하는 것입니다. 두 규칙이 만날 때 후보 숫자가 급격히 줄어듭니다!",
                highlights: []
            },
            {
                title: "줄 규칙 활용 예시",
                desc: "합이 9인 2칸 케이지(가능한 조합: 1+8, 2+7, 3+6, 4+5)가 있습니다.<br>그런데 <b>같은 가로줄</b>에 이미 <b>4</b>가 있다면? 4가 포함된 <b>4+5 조합은 즉시 탈락</b>입니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 9 }
                ],
                boardSetup: { "4-8": 4 }, // 4 is explicitly placed in the row
                highlights: ["row-4"],
                targetCells: ["cell-4-0", "cell-4-1", "cell-4-8"]
            },
            {
                title: "박스 규칙 활용 예시",
                desc: "비슷하게 <b>같은 3x3 박스</b> 안에 <b>8</b>이 있다면?<br>1+8 조합도 불가능해집니다.<br>이제 남은 후보는 {2,7}과 {3,6} 뿐입니다.",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 9 }
                ],
                boardSetup: { "4-8": 4, "5-2": 8 }, // 8 is in the box (e.g., cell 5-2 is in same box as 4-0, 4-1 if they are in box 4)
                // Wait, 4-0, 4-1 are in Box 4 (middle left).
                // Box 4 covers rows 3,4,5 and cols 0,1,2.
                // So 5-2 is in Box 4. Correct.
                highlights: ["box-3"], // Box index 3 is row 1, col 0? No.
                // Box indices: 
                // 0 1 2
                // 3 4 5
                // 6 7 8
                // 4-0, 4-1 are in Row 4, Col 0,1. That is Box 3 (Left Middle).
                // Row 4 is middle row. Col 0,1 are left cols.
                // Box 3 covers R3-5, C0-2.
                targetCells: ["cell-4-0", "cell-4-1", "cell-5-2"]
            },
            {
                title: "결론 도출",
                desc: "이렇게 주변의 확정된 숫자들을 확인하여, 케이지 내에서 <b>불가능한 숫자가 포함된 조합</b>을 하나씩 지워나가세요. 결국 <b>가능한 후보(Note)</b>가 {2,3,6,7}로 좁혀집니다!",
                cages: [
                    { cells: [{row:4,col:0},{row:4,col:1}], sum: 9 }
                ],
                boardSetup: { "4-8": 4, "5-2": 8, "4-0": [2,3,6,7], "4-1": [2,3,6,7] },
                highlights: ["row-4", "box-3"],
                targetCells: ["cell-4-0", "cell-4-1"]
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
                desc: "45 규칙의 응용입니다. 어떤 구역(줄, 박스 등) 안에서 케이지들이 꽉 차고 <b>한두 칸만 남았을 때</b>, 그 남은 칸을 <b>이니(Innie)</b>라고 합니다.<br>이니 = 45 - (포함된 케이지들의 합)",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1},{row:0,col:2}], sum: 15 },
                    { cells: [{row:0,col:3},{row:0,col:4}], sum: 10 },
                    { cells: [{row:0,col:5},{row:0,col:6},{row:0,col:7}], sum: 15 },
                ],
                highlights: ["row-0"],
                targetCells: ["cell-0-8"]
            },
            {
                title: "이니 계산 예시",
                desc: "케이지 합: 15 + 10 + 15 = <b>40</b>.<br>줄의 전체 합은 45.<br>따라서 남은 빈 칸(이니) = <b>45 - 40 = 5</b>!",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1},{row:0,col:2}], sum: 15 },
                    { cells: [{row:0,col:3},{row:0,col:4}], sum: 10 },
                    { cells: [{row:0,col:5},{row:0,col:6},{row:0,col:7}], sum: 15 },
                ],
                highlights: ["row-0"],
                targetCells: ["cell-0-8"],
                fillAnimation: [{ r: 0, c: 8, val: 5 }]
            },
            {
                title: "아우티(Outie)란?",
                desc: "반대로 케이지가 <b>구역 밖으로 삐져나간 경우</b>, 그 삐져나간 부분을 <b>아우티(Outie)</b>라고 합니다.<br>이 칸의 값도 45 규칙으로 알아낼 수 있습니다.",
                cages: [
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 18 }
                ],
                highlights: ["row-0"],
                targetCells: ["cell-1-8"]
            },
            {
                title: "아우티 계산법",
                desc: "예: 첫 번째 줄의 합은 45인데, 줄에 완전히 포함된 케이지들의 합이 35라고 칩시다.<br>나머지 10은? 바로 경계에 걸친 케이지(합 18)의 <b>줄 안쪽 부분</b>입니다.<br>그렇다면 <b>줄 바깥 부분(아우티)</b> = 18 - 10 = <b>8</b>이 됩니다!",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1},{row:0,col:2}], sum: 15 }, // Example cages inside row
                    { cells: [{row:0,col:3},{row:0,col:4}], sum: 10 },
                    { cells: [{row:0,col:5},{row:0,col:6}], sum: 10 }, // 15+10+10 = 35
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 18 } // The partial cage
                ],
                highlights: ["row-0"],
                targetCells: ["cell-1-8"], // The outie
                fillAnimation: [{r: 1, c: 8, val: 8}]
            }
        ]
    },
    killer_hard_1: {
        id: 'killer_hard_1',
        difficulty: 'hard',
        title: '고급 조합 분석',
        steps: [
            {
                title: "3칸 케이지 조합",
                desc: "합 10인 3칸 케이지를 예로 들어봅시다.<br>가능한 조합: {1,2,7}, {1,3,6}, {1,4,5}, {2,3,5} 네 가지입니다.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4},{row:4,col:5}], sum: 10 }
                ],
                highlights: [],
                targetCells: ["cell-4-3", "cell-4-4", "cell-4-5"]
            },
            {
                title: "박스의 숫자 활용",
                desc: "그런데 같은 박스 안에 이미 <b>1과 2</b>가 있다면?<br>{1,2,7}, {1,3,6}, {1,4,5}, {2,3,5} 모두 불가능해집니다!<br>사실상 가능한 조합이 하나도 없게 되어 모순을 찾을 수도 있습니다.",
                cages: [
                    { cells: [{row:4,col:3},{row:4,col:4},{row:4,col:5}], sum: 10 }
                ],
                boardSetup: { "3-3": 1, "3-4": 2 }, // Example showing surrounding numbers blocking options
                highlights: ["box-4"],
                targetCells: ["cell-4-3", "cell-4-4", "cell-4-5"]
            }
        ]
    },
    killer_hard_2: {
        id: 'killer_hard_2',
        difficulty: 'hard',
        title: '케이지 세트 (Cage Sets)',
        steps: [
            {
                title: "케이지를 하나의 숫자로 보기",
                desc: "두 개의 2칸 케이지(합 3, 합 4)가 같은 줄에 있다면?<br>합 3은 {1,2}, 합 4는 {1,3}입니다. 이 둘은 <b>1, 2, 3</b>이라는 숫자 집합을 공유합니다.",
                cages: [
                    { cells: [{row:4,col:1},{row:4,col:2}], sum: 3 },
                    { cells: [{row:4,col:3},{row:4,col:4}], sum: 4 }
                ],
                boardSetup: { "4-1": [1,2], "4-2": [1,2], "4-3": [1,3], "4-4": [1,3] },
                highlights: ["row-4"],
                targetCells: []
            },
            {
                title: "제거 및 확정",
                desc: "이 원리를 이용해, 복잡한 상황에서도 특정 숫자가 <b>반드시 이 케이지들 중 하나에 있어야 함</b>을 추론할 수 있습니다.",
                highlights: ["row-4"]
            }
        ]
    },
    killer_expert_1: {
        id: 'killer_expert_1',
        difficulty: 'expert',
        title: '다중 영역 45 규칙 (Multi-Zone)',
        steps: [
            {
                title: "여러 줄 합치기",
                desc: "45 규칙은 한 줄뿐만 아니라 <b>여러 줄이나 박스</b>를 합쳐서도 적용됩니다.<br>2줄의 합 = 90, 3줄 = 135.",
                highlights: ["row-0", "row-1"]
            },
            {
                title: "예제 상황",
                desc: "1행과 2행(총합 90)을 봅니다.<br>대부분의 케이지가 1-2행 안에 있고, 하나만 3행으로 삐져나와(아우티) 있습니다.<br>내부 케이지들의 총합이 85라면?",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1}], sum: 10 },
                    { cells: [{row:0,col:2},{row:0,col:3}], sum: 10 },
                    { cells: [{row:0,col:4},{row:0,col:5},{row:0,col:6}], sum: 15 },
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 20 }, // The outie cage
                    { cells: [{row:1,col:0},{row:1,col:1}], sum: 10 },
                    { cells: [{row:1,col:2},{row:1,col:3}], sum: 10 },
                    { cells: [{row:1,col:4},{row:1,col:5}], sum: 10 },
                    { cells: [{row:1,col:6},{row:1,col:7}], sum: 20 }
                ],
                boardSetup: {
                    "0-0": [1,9], "0-1": [1,9], "0-2": [2,8], "0-3": [2,8], "0-4": [1,2,3,4,5,6,7,8,9], "0-5": [1,2,3,4,5,6,7,8,9], "0-6": [1,2,3,4,5,6,7,8,9],
                    "1-0": [1,9], "1-1": [1,9], "1-2": [2,8], "1-3": [2,8], "1-4": [3,7], "1-5": [3,7], "1-6": [4,6], "1-7": [4,6],
                    "0-7": [1,2,3,4,5,6,7,8,9], "0-8": [1,2,3,4,5,6,7,8,9], "1-8": [1,2,3,4,5,6,7,8,9]
                },
                highlights: ["row-0", "row-1"],
                targetCells: ["cell-2-8"] // Assuming the outie goes to row 2
            },
            {
                title: "계산 결과",
                desc: "1,2행의 총합(90) = (완전히 포함된 케이지 합 85) + (걸쳐있는 케이지의 1,2행 부분)<br>따라서 <b>걸쳐있는 케이지의 1,2행 부분</b>은 5입니다.<br>만약 그 케이지의 전체 합이 12라면? <b>3행에 있는 아우티 칸</b>은 12 - 5 = <b>7</b>이 됩니다!",
                cages: [
                    { cells: [{row:0,col:0},{row:0,col:1}], sum: 10 },
                    { cells: [{row:0,col:2},{row:0,col:3}], sum: 10 },
                    { cells: [{row:0,col:4},{row:0,col:5},{row:0,col:6}], sum: 15 },
                    { cells: [{row:0,col:7},{row:0,col:8},{row:1,col:8}], sum: 12 }, // The outie cage, now sum 12
                    { cells: [{row:1,col:0},{row:1,col:1}], sum: 10 },
                    { cells: [{row:1,col:2},{row:1,col:3}], sum: 10 },
                    { cells: [{row:1,col:4},{row:1,col:5}], sum: 10 },
                    { cells: [{row:1,col:6},{row:1,col:7}], sum: 20 }
                ],
                boardSetup: {
                    "0-0": [1,9], "0-1": [1,9], "0-2": [2,8], "0-3": [2,8], "0-4": [1,2,3,4,5,6,7,8,9], "0-5": [1,2,3,4,5,6,7,8,9], "0-6": [1,2,3,4,5,6,7,8,9],
                    "1-0": [1,9], "1-1": [1,9], "1-2": [2,8], "1-3": [2,8], "1-4": [3,7], "1-5": [3,7], "1-6": [4,6], "1-7": [4,6],
                    "0-7": [1,2,3,4,5,6,7,8,9], "0-8": [1,2,3,4,5,6,7,8,9], "1-8": [1,2,3,4,5,6,7,8,9]
                },
                highlights: ["row-0", "row-1"],
                targetCells: ["cell-2-8"],
                fillAnimation: [{ r: 2, c: 8, val: 7 }]
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
