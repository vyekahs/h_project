export interface TutorialStep {
    title: string;
    desc: string;
    // Visual Configuration
    boardSetup?: { [key: string]: number | number[] }; // "r-c": value (or notes)
    highlights?: string[]; // "row-0", "col-4", "box-4", "cell-0-0"
    targetCells?: string[]; // Pulse effect
    fillAnimation?: { r: number, c: number, val: number }[];
    arrow?: 'horizontal' | 'vertical' | 'none';
}

export const TUTORIALS: { [key: string]: any } = {
    easy_1: {
        id: 'easy_1',
        difficulty: 'easy',
        title: '기초 규칙 (Rules)',
        steps: [
            {
                title: "스도쿠란?",
                desc: "스도쿠는 가로, 세로, 3x3 박스에 1부터 9까지의 숫자를 채워넣는 논리 퍼즐입니다.",
                highlights: []
            },
            {
                title: "가로줄 규칙",
                desc: "모든 <b>가로줄</b>에는 1부터 9까지의 숫자가 중복 없이 하나씩만 들어가야 합니다.",
                highlights: ["row-4"],
                arrow: 'horizontal'
            },
            {
                title: "세로줄 규칙",
                desc: "모든 <b>세로줄</b>에는 1부터 9까지의 숫자가 중복 없이 하나씩만 들어가야 합니다.",
                highlights: ["col-4"],
                arrow: 'vertical'
            },
            {
                title: "3x3 박스 규칙",
                desc: "굵은 선으로 구분된 <b>3x3 박스</b> 안에도 1부터 9까지의 숫자가 모두 들어가야 합니다.",
                highlights: ["box-4"]
            }
        ]
    },
    easy_2: {
        id: 'easy_2',
        difficulty: 'easy',
        title: '풀 하우스 & 네이키드 싱글',
        steps: [
            {
                title: "풀 하우스 (Full House)",
                desc: "가장 쉬운 기술입니다. 가로줄, 세로줄, 혹은 박스에 <b>빈칸이 딱 하나</b> 남았다면?",
                boardSetup: { "4-0": 1, "4-1": 2, "4-2": 3, "4-3": 4, "4-4": 5, "4-5": 6, "4-6": 7, "4-7": 8 }, // Row 4 almost full
                highlights: ["row-4"],
                targetCells: ["cell-4-8"]
            },
            {
                title: "채워넣기",
                desc: "나머지 숫자는 무엇일까요? 바로 <b>9</b>입니다! 이렇게 하나 남은 자리를 채우는 것을 '풀 하우스'라고 합니다.",
                boardSetup: { "4-0": 1, "4-1": 2, "4-2": 3, "4-3": 4, "4-4": 5, "4-5": 6, "4-6": 7, "4-7": 8 },
                highlights: ["row-4"],
                fillAnimation: [{ r: 4, c: 8, val: 9 }]
            },
            {
                title: "네이키드 싱글 (Naked Single)",
                desc: "이 칸을 보세요. 가로에는 1~4, 세로에는 5~8이 있어서, 이 칸에 들어갈 수 있는 숫자는 <b>오직 9</b>뿐입니다!",
                boardSetup: { 
                    "4-0": 1, "4-1": 2, "4-2": 3, "4-3": 4, // Row constraints
                    "0-4": 5, "1-4": 6, "2-4": 7, "3-4": 8  // Col constraints
                },
                highlights: ["cell-4-4", "row-4", "col-4"],
                fillAnimation: [{ r: 4, c: 4, val: 9 }]
            },
            {
                title: "네이키드 싱글 - 심화",
                desc: "이번엔 <b>박스</b>까지 함께 봐야 합니다.<br>가로(1,2,3), 세로(4,5,6), 그리고 같은 박스(7,8)에 숫자가 있어서... 남은 건 9뿐이죠!",
                boardSetup: { 
                    "1-5": 1, "1-6": 2, "1-7": 3, // Row 1 (Outside Box 0)
                    "5-1": 4, "6-1": 5, "7-1": 6, // Col 1 (Outside Box 0)
                    "0-0": 7, "0-2": 8            // Box 0
                },
                highlights: ["cell-1-1", "row-1", "col-1", "box-0"],
                fillAnimation: [{ r: 1, c: 1, val: 9 }]
            }
        ]
    },
    easy_3: {
        id: 'easy_3',
        difficulty: 'easy',
        title: '히든 싱글 (Hidden Single)',
        steps: [
            {
                title: "히든 싱글이란?",
                desc: "어떤 줄이나 박스에서, <b>특정 숫자가 들어갈 수 있는 자리가 한 곳밖에 없는</b> 경우입니다.",
                // Visualizing this is tricky without notes, but we can highlight the row and show blocking numbers
                boardSetup: { 
                    "3-0": 1, "5-1": 1, // Blocking 1s
                    "0-3": 1, "1-5": 1  // Blocking 1s
                }, 
                highlights: ["box-4"], // Center box
                targetCells: ["cell-4-4"] // center of center box
            },
            {
                title: "찾는 방법",
                desc: "가운데 박스를 보세요. 주변의 1들이 자리를 차지하고 있어서, 가운데 박스에서 1이 들어갈 수 있는 곳은 오직 한 곳뿐입니다!",
                boardSetup: { 
                    "3-0": 1, "5-1": 1, // Blocking 1s
                    "0-3": 1, "1-5": 1  // Blocking 1s
                },
                highlights: ["row-3", "row-5", "col-3", "col-5"], // Show intersecting lines logic? simplified for now
                fillAnimation: [{r: 4, c: 4, val: 1}]
            }
        ]
    },
    medium_1: {
        id: 'medium_1',
        difficulty: 'medium',
        title: '포인팅 페어 (Pointing Pair)',
        steps: [
            {
                title: "포인팅 페어",
                desc: "한 박스 안에서 특정 숫자(예: 7)가 <b>같은 줄</b>에만 들어갈 수 있다면, 그 줄의 <b>다른 박스</b>에는 7이 들어갈 수 없습니다.",
                highlights: ["box-3", "row-3"], // Box 3 (left-middle), Row 3
                targetCells: ["cell-3-0", "cell-3-1"] // The pair
            }
        ]
    },
    medium_2: {
        id: 'medium_2',
        difficulty: 'medium',
        title: '네이키드 페어 (Naked Pair)',
        steps: [
            {
                title: "네이키드 페어",
                desc: "한 박스(또는 줄) 안에 <b>두 칸이 똑같은 후보 숫자 두 개(예: 2, 8)</b>만 가지고 있다면, 그 박스(또는 줄)의 다른 칸에는 2와 8이 올 수 없습니다.",
                boardSetup: { 
                    "4-3": [2,8], "4-5": [2,8], // The pair
                    "4-0": [2,8,5], "4-1": [1,2,3] // Others
                },
                highlights: ["row-4"],
                targetCells: ["cell-4-3", "cell-4-5"]
            }
        ]
    },
    hard_1: {
        id: 'hard_1',
        difficulty: 'hard',
        title: '히든 페어 (Hidden Pair)',
        steps: [
            {
                title: "히든 페어란?",
                desc: "한 줄(또는 박스)에서, **두 숫자가 오직 두 칸에서만 등장**한다면? (다른 잡다한 숫자들과 섞여 있더라도!)",
                boardSetup: {
                    "3-1": [1,9,4], "3-7": [1,9,5], // The hidden pair (only places for 1,9)
                    "3-0": [2,3], "3-2": [4,5], "3-3": [2,4], "3-4": [3,5], "3-5": [6], "3-6": [7], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: ["cell-3-1", "cell-3-7"]
            },
            {
                title: "후보 정리",
                desc: "이 줄에서 1과 9는 오직 저 두 칸에만 들어갈 수 있습니다. 따라서 저 두 칸은 **반드시 1 아니면 9**여야 합니다. (같이 있는 4, 5 같은 잡다한 후보는 지워집니다!)"
            }
        ]
    },
    hard_2: {
        id: 'hard_2',
        difficulty: 'hard',
        title: 'X-윙 (X-Wing)',
        steps: [
            {
                title: "X-윙 패턴",
                desc: "숫자 7을 주목하세요. 세로줄 2개를 봤을 때, 7이 들어갈 수 있는 자리가 **똑같은 두 가로줄 위치**에만 있다면?",
                boardSetup: {
                    // Col 2: Rows 1, 8 have 7. Col 6: Rows 1, 8 have 7.
                    "1-2": [7], "8-2": [7],
                    "1-6": [7], "8-6": [7],
                    // Distractors in the rows
                    "1-4": [7], "8-0": [7]
                },
                highlights: ["col-2", "col-6"], 
                targetCells: ["cell-1-2", "cell-8-2", "cell-1-6", "cell-8-6"]
            },
            {
                title: "제거 원리",
                desc: "이 두 세로줄 중 하나는 위쪽이 7, 다른 하나는 아래쪽이 7이 됩니다. (X자 관계). 즉, **가로줄(1번/8번 줄)의 다른 칸**에는 7이 올 수 없습니다!"
            }
        ]
    },
    expert_1: {
        id: 'expert_1',
        difficulty: 'expert',
        title: 'Y-윙 (Y-Wing / XY-Wing)',
        steps: [
            {
                title: "Y-윙 구조",
                desc: "3개의 칸이 연결된 형태입니다. **중심축(Pivot)** 칸과 두 개의 **날개(Wing)** 칸을 찾아보세요. 모두 후보 숫자가 2개씩입니다.",
                boardSetup: {
                    "4-4": [1,2], // Pivot (AB)
                    "4-1": [1,3], // Wing 1 (AC) - Linked by Row
                    "7-4": [2,3]  // Wing 2 (BC) - Linked by Col
                },
                targetCells: ["cell-4-4", "cell-4-1", "cell-7-4"], // Pivot, Wing1, Wing2
                highlights: ["row-4", "col-4"]
            },
            {
                title: "결과",
                desc: "중심이 1이면 날개1은 3, 중심이 2면 날개2는 3이 됩니다. 즉, **두 날개가 만나는 지점**에는 절대 3이 올 수 없습니다!"
            }
        ]
    },
    expert_2: {
        id: 'expert_2',
        difficulty: 'expert',
        title: '소드피쉬 (Swordfish)',
        steps: [
            {
                title: "소드피쉬",
                desc: "X-윙의 확장판입니다. **3개의 세로줄**에서 특정 숫자의 후보 위치가 **3개의 가로줄** 안에 갇혀 있을 때 발생합니다.",
                // Visualizing specific layout
                boardSetup: {
                   "1-1": [5], "1-5": [5],
                   "4-1": [5], "4-8": [5],
                   "7-5": [5], "7-8": [5]
                },
                highlights: ["col-1", "col-5", "col-8"],
                targetCells: ["cell-1-1", "cell-1-5", "cell-4-1", "cell-4-8", "cell-7-5", "cell-7-8"]
            }
        ]
    },
    expert_3: {
        id: 'expert_3',
        difficulty: 'expert',
        title: 'XY-체인 (XY-Chain)',
        steps: [
            {
                title: "XY-체인",
                desc: "후보가 2개인 칸들을 사슬처럼 연결합니다. 시작 칸이 A가 아니면... 끝 칸은 A가 되어야 한다! 는 논리로 모순을 찾아냅니다.",

                highlights: []
            }
        ]
    }
};

export const TUTORIAL_ORDER = [
    'easy_1', 'easy_2', 'easy_3', 
    'medium_1', 'medium_2', 
    'hard_1', 'hard_2',
    'expert_1', 'expert_2', 'expert_3'
];
