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
                title: "포인팅 페어란?",
                desc: "특정 숫자가 <b>한 박스 안에서 같은 행(또는 열)에만</b> 들어갈 수 있을 때 사용하는 기법입니다. 이 패턴을 발견하면 해당 행/열의 <b>다른 박스</b>에서 그 숫자를 제거할 수 있어요!",
                boardSetup: {
                    "3-0": [7], "3-1": [7], // The pair - only places for 7 in box 3
                    "3-2": [1,2,3], "4-0": [1,2], "4-1": [3,4], "4-2": [5,6],
                    "5-0": [2,3], "5-1": [4,5], "5-2": [6],
                    "3-3": [1,7], "3-4": [2,7], "3-5": [3,7], // Row 3 other boxes
                    "3-6": [4,7], "3-7": [5,7], "3-8": [6,7]
                },
                highlights: ["box-3"],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "왼쪽 중간 박스(빨간 테두리)를 보세요. 이 박스에서 <b>숫자 7</b>이 들어갈 수 있는 칸을 찾아봅시다. 분석 결과, 7은 <b>노란색으로 표시된 두 칸</b>에만 들어갈 수 있습니다.",
                boardSetup: {
                    "3-0": [7], "3-1": [7], // The pair - only places for 7 in box 3
                    "3-2": [1,2,3], "4-0": [1,2], "4-1": [3,4], "4-2": [5,6],
                    "5-0": [2,3], "5-1": [4,5], "5-2": [6],
                    "3-3": [1,7], "3-4": [2,7], "3-5": [3,7], // Row 3 other boxes
                    "3-6": [4,7], "3-7": [5,7], "3-8": [6,7]
                },
                highlights: ["box-3"],
                targetCells: ["cell-3-0", "cell-3-1"]
            },
            {
                title: "핵심 발견",
                desc: "두 칸(노란색)이 <b>같은 행(4번째 줄)</b>에 있습니다! 이 박스에서 7은 반드시 이 행에 놓여야 합니다. 따라서...",
                boardSetup: {
                    "3-0": [7], "3-1": [7], // The pair - only places for 7 in box 3
                    "3-2": [1,2,3], "4-0": [1,2], "4-1": [3,4], "4-2": [5,6],
                    "5-0": [2,3], "5-1": [4,5], "5-2": [6],
                    "3-3": [1,7], "3-4": [2,7], "3-5": [3,7], // Row 3 other boxes
                    "3-6": [4,7], "3-7": [5,7], "3-8": [6,7]
                },
                highlights: ["box-3", "row-3"],
                targetCells: ["cell-3-0", "cell-3-1"]
            },
            {
                title: "후보 제거",
                desc: "7은 박스 3의 4번째 줄에 반드시 들어가므로, <b>같은 줄의 다른 박스들</b>(파란색 영역)에서는 7이 들어갈 수 없습니다! 해당 칸들의 후보에서 7을 제거하세요.",
                boardSetup: {
                    "3-0": [7], "3-1": [7], // The pair
                    "3-2": [1,2,3], "4-0": [1,2], "4-1": [3,4], "4-2": [5,6], // Box 3 notes
                    "5-0": [2,3], "5-1": [4,5], "5-2": [6],
                    "3-3": [1,7], "3-4": [2,7], "3-5": [3,7], // Candidates to eliminate
                    "3-6": [4,7], "3-7": [5,7], "3-8": [6,7]  // More candidates
                },
                highlights: ["row-3"],
                targetCells: ["cell-3-3", "cell-3-4", "cell-3-5", "cell-3-6", "cell-3-7", "cell-3-8"]
            },
            {
                title: "포인팅 페어 정리",
                desc: "<b>요약:</b> 박스 안에서 특정 숫자가 한 줄에만 후보로 남아있다면 → 그 줄의 나머지 칸(다른 박스)에서 해당 숫자를 제거! <br><br>💡 행 뿐만 아니라 <b>열</b>에서도 같은 원리가 적용됩니다.",
                boardSetup: {
                    "3-0": [7], "3-1": [7], // The pair (kept)
                    "3-2": [1,2,3], "4-0": [1,2], "4-1": [3,4], "4-2": [5,6], // Box 3 notes
                    "5-0": [2,3], "5-1": [4,5], "5-2": [6],
                    "3-3": [1], "3-4": [2], "3-5": [3], // 7 removed!
                    "3-6": [4], "3-7": [5], "3-8": [6]  // 7 removed!
                },
                highlights: ["box-3", "row-3"],
                targetCells: ["cell-3-0", "cell-3-1"]
            }
        ]
    },
    medium_2: {
        id: 'medium_2',
        difficulty: 'medium',
        title: '네이키드 페어 (Naked Pair)',
        steps: [
            {
                title: "네이키드 페어란?",
                desc: "한 줄(또는 박스) 안에서 <b>두 칸이 정확히 같은 두 개의 후보만</b> 가지고 있을 때 사용하는 기법입니다. 이 두 숫자는 반드시 저 두 칸에 들어가야 하므로, 같은 줄의 다른 칸에서 제거할 수 있어요!",
                boardSetup: { 
                    "4-0": [1,2,8], "4-1": [2,3,8], "4-2": [3,5],
                    "4-3": [2,8], "4-5": [2,8], // The naked pair
                    "4-6": [2,4,8], "4-7": [5,8], "4-8": [1,2]
                },
                highlights: ["row-4"],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "5번째 줄을 보세요. <b>노란색으로 표시된 두 칸</b>이 모두 <b>[2,8]</b>만 후보로 가지고 있습니다. 다른 칸들도 2나 8을 후보로 가지고 있지만, 이 두 칸처럼 '정확히 똑같은 두 후보만' 가진 건 아닙니다.",
                boardSetup: { 
                    "4-0": [1,2,8], "4-1": [2,3,8], "4-2": [3,5],
                    "4-3": [2,8], "4-5": [2,8], // The naked pair
                    "4-6": [2,4,8], "4-7": [5,8], "4-8": [1,2]
                },
                highlights: ["row-4"],
                targetCells: ["cell-4-3", "cell-4-5"]
            },
            {
                title: "핵심 발견",
                desc: "두 칸 모두 <b>[2,8]</b>만 가능합니다. 이 말은 <b>2와 8은 반드시 이 두 칸</b>에 들어가야 한다는 뜻이에요! (어느 칸에 2가 가든, 다른 칸엔 8이 가야 함)",
                boardSetup: { 
                    "4-0": [1,2,8], "4-1": [2,3,8], "4-2": [3,5],
                    "4-3": [2,8], "4-5": [2,8], // The naked pair
                    "4-6": [2,4,8], "4-7": [5,8], "4-8": [1,2]
                },
                highlights: ["row-4"],
                targetCells: ["cell-4-3", "cell-4-5"]
            },
            {
                title: "후보 제거",
                desc: "2와 8은 이미 두 칸에서 '예약'되었으므로, <b>같은 줄의 다른 칸들</b>에서 2와 8을 제거할 수 있습니다! 파란색으로 표시된 칸들의 후보에서 2와 8을 지우세요.",
                boardSetup: { 
                    "4-0": [1,2,8], "4-1": [2,3,8], "4-2": [3,5],
                    "4-3": [2,8], "4-5": [2,8], // The naked pair
                    "4-6": [2,4,8], "4-7": [5,8], "4-8": [1,2]
                },
                highlights: ["row-4"],
                targetCells: ["cell-4-0", "cell-4-1", "cell-4-6", "cell-4-7", "cell-4-8"]
            },
            {
                title: "네이키드 페어 정리",
                desc: "<b>요약:</b> 두 칸이 정확히 같은 두 후보만 가지면 → 그 두 숫자를 같은 줄/박스의 다른 칸에서 제거!<br><br>💡 <b>네이키드 트리플</b>(세 칸, 세 후보)도 같은 원리로 작동합니다.",
                boardSetup: { 
                    "4-0": [1], "4-1": [3], "4-2": [3,5], // 2,8 removed!
                    "4-3": [2,8], "4-5": [2,8], // The naked pair (kept)
                    "4-6": [4], "4-7": [5], "4-8": [1]  // 2,8 removed!
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
                desc: "한 줄(또는 박스)에서 <b>두 숫자가 오직 두 칸에서만 등장</b>할 때 사용하는 기법입니다. 네이키드 페어와 달리, 이 두 칸에는 다른 후보들도 섞여 있어서 '숨겨져(Hidden)' 있어요!",
                boardSetup: {
                    "3-0": [2,3], "3-1": [1,4,9], "3-2": [4,5], "3-3": [2,4],
                    "3-4": [3,5], "3-5": [6], "3-6": [7], "3-7": [1,5,9], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "4번째 줄을 보세요. 여러 칸에 다양한 후보가 있습니다. 여기서 <b>1과 9</b>가 어디에 들어갈 수 있는지 찾아봅시다.",
                boardSetup: {
                    "3-0": [2,3], "3-1": [1,4,9], "3-2": [4,5], "3-3": [2,4],
                    "3-4": [3,5], "3-5": [6], "3-6": [7], "3-7": [1,5,9], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: []
            },
            {
                title: "핵심 발견",
                desc: "<b>1과 9</b>는 이 줄에서 <b>오직 두 칸(노란색)</b>에서만 후보로 등장합니다! 다른 칸들에는 1이나 9가 없어요. 따라서 이 두 칸은 반드시 1과 9를 가져가야 합니다.",
                boardSetup: {
                    "3-0": [2,3], "3-1": [1,4,9], "3-2": [4,5], "3-3": [2,4],
                    "3-4": [3,5], "3-5": [6], "3-6": [7], "3-7": [1,5,9], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: ["cell-3-1", "cell-3-7"]
            },
            {
                title: "후보 정리",
                desc: "두 칸에 1과 9가 반드시 들어가야 하므로, 이 두 칸에 있는 <b>다른 후보들(4, 5)은 제거</b>할 수 있습니다! 저 두 칸은 [1,9]만 남게 됩니다.",
                boardSetup: {
                    "3-0": [2,3], "3-1": [1,4,9], "3-2": [4,5], "3-3": [2,4],
                    "3-4": [3,5], "3-5": [6], "3-6": [7], "3-7": [1,5,9], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: ["cell-3-1", "cell-3-7"]
            },
            {
                title: "히든 페어 정리",
                desc: "<b>요약:</b> 두 숫자가 한 줄/박스에서 오직 두 칸에만 등장 → 그 두 칸의 다른 후보를 제거!<br><br>💡 <b>네이키드 vs 히든:</b> 네이키드는 '두 칸 → 다른 칸에서 제거', 히든은 '두 칸 안에서 다른 후보 제거'",
                boardSetup: {
                    "3-0": [2,3], "3-1": [1,9], "3-2": [4,5], "3-3": [2,4],
                    "3-4": [3,5], "3-5": [6], "3-6": [7], "3-7": [1,9], "3-8": [8]
                },
                highlights: ["row-3"],
                targetCells: ["cell-3-1", "cell-3-7"]
            }
        ]
    },
    hard_2: {
        id: 'hard_2',
        difficulty: 'hard',
        title: 'X-윙 (X-Wing)',
        steps: [
            {
                title: "X-윙이란?",
                desc: "행과 열을 교차 분석하는 고급 기법입니다. <b>두 개의 행(또는 열)</b>에서 특정 숫자가 <b>같은 열(또는 행) 위치</b>에만 등장할 때 사용합니다.",
                boardSetup: {
                    "1-2": [7,3], "1-4": [7,5], "1-6": [7,2],
                    "8-2": [7,4], "8-0": [7,1], "8-6": [7,6],
                    "4-2": [2,7], "4-6": [3,7], "5-2": [4,7], "5-6": [5,7]
                },
                highlights: [],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "<b>숫자 7</b>을 분석해봅시다. 2번째 줄과 9번째 줄을 보세요. 각 줄에서 7이 들어갈 수 있는 칸을 찾습니다.",
                boardSetup: {
                    "1-2": [7,3], "1-4": [7,5], "1-6": [7,2],
                    "8-2": [7,4], "8-0": [7,1], "8-6": [7,6],
                    "4-2": [2,7], "4-6": [3,7], "5-2": [4,7], "5-6": [5,7]
                },
                highlights: ["row-1", "row-8"],
                targetCells: []
            },
            {
                title: "핵심 발견",
                desc: "두 줄(2번, 9번) 모두에서 7은 <b>정확히 같은 두 열(3열, 7열)</b>에만 등장합니다! 이렇게 네 칸이 <b>X자 형태</b>로 연결됩니다.",
                boardSetup: {
                    "1-2": [7,3], "1-4": [7,5], "1-6": [7,2],
                    "8-2": [7,4], "8-0": [7,1], "8-6": [7,6],
                    "4-2": [2,7], "4-6": [3,7], "5-2": [4,7], "5-6": [5,7]
                },
                highlights: ["row-1", "row-8", "col-2", "col-6"],
                targetCells: ["cell-1-2", "cell-1-6", "cell-8-2", "cell-8-6"]
            },
            {
                title: "제거 원리",
                desc: "X-윙의 네 모서리 중 <b>대각선 두 칸에 7이 들어갑니다</b>. (왼쪽 위+오른쪽 아래, 또는 오른쪽 위+왼쪽 아래) 따라서 <b>해당 열의 다른 칸</b>에서 7을 제거할 수 있습니다!",
                boardSetup: {
                    "1-2": [7,3], "1-6": [7,2],
                    "8-2": [7,4], "8-6": [7,6],
                    "4-2": [2,7], "4-6": [3,7], "5-2": [4,7], "5-6": [5,7]
                },
                highlights: ["col-2", "col-6"],
                targetCells: ["cell-4-2", "cell-4-6", "cell-5-2", "cell-5-6"]
            },
            {
                title: "X-윙 정리",
                desc: "<b>요약:</b> 두 줄에서 숫자가 같은 두 열에만 등장 → 그 열의 다른 칸에서 숫자 제거!<br><br>💡 행↔열을 바꿔서도 적용 가능합니다. (열 기준 X-윙 → 행에서 제거)",
                boardSetup: {
                    "1-2": [7,3], "1-6": [7,2],
                    "8-2": [7,4], "8-6": [7,6],
                    "4-2": [2], "4-6": [3], "5-2": [4], "5-6": [5] // 7 removed!
                },
                highlights: ["col-2", "col-6"],
                targetCells: ["cell-1-2", "cell-1-6", "cell-8-2", "cell-8-6"]
            }
        ]
    },
    expert_1: {
        id: 'expert_1',
        difficulty: 'expert',
        title: 'Y-윙 (Y-Wing / XY-Wing)',
        steps: [
            {
                title: "Y-윙이란?",
                desc: "3개의 칸이 <b>Y자 형태</b>로 연결되는 고급 기법입니다. <b>중심축(Pivot)</b> 하나와 <b>두 날개(Wing)</b>로 구성되며, 각 칸은 후보가 정확히 2개씩입니다.",
                boardSetup: {
                    "4-4": [1,2], // Pivot (AB)
                    "4-1": [1,3], // Wing 1 (AC) - Linked by Row
                    "7-4": [2,3], // Wing 2 (BC) - Linked by Col
                    "7-1": [3,5,7] // Target cell to eliminate 3
                },
                highlights: [],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "<b>중심축(노란색)</b>: [1,2] 후보를 가진 칸<br><b>날개1</b>: 같은 행에서 [1,3] 후보 (1을 공유)<br><b>날개2</b>: 같은 열에서 [2,3] 후보 (2를 공유)<br><br>세 칸 모두 후보가 2개이고, 총 3개의 숫자(1,2,3)만 사용됩니다.",
                boardSetup: {
                    "4-4": [1,2], // Pivot (AB)
                    "4-1": [1,3], // Wing 1 (AC) - Linked by Row
                    "7-4": [2,3], // Wing 2 (BC) - Linked by Col
                    "7-1": [3,5,7] // Target cell
                },
                highlights: ["row-4", "col-4"],
                targetCells: ["cell-4-4"]
            },
            {
                title: "핵심 발견",
                desc: "중심축과 날개들이 공유하는 숫자를 확인하세요:<br>- 중심축 [1,2] + 날개1 [1,3] → <b>1을 공유</b><br>- 중심축 [1,2] + 날개2 [2,3] → <b>2를 공유</b><br>- 두 날개가 공통으로 가진 숫자 → <b>3</b>",
                boardSetup: {
                    "4-4": [1,2], // Pivot (AB)
                    "4-1": [1,3], // Wing 1 (AC)
                    "7-4": [2,3], // Wing 2 (BC)
                    "7-1": [3,5,7]
                },
                highlights: ["row-4", "col-4"],
                targetCells: ["cell-4-4", "cell-4-1", "cell-7-4"]
            },
            {
                title: "제거 원리",
                desc: "중심축이 <b>1</b>이면 → 날개1은 반드시 <b>3</b><br>중심축이 <b>2</b>이면 → 날개2는 반드시 <b>3</b><br><br>어떤 경우든 <b>두 날개가 모두 볼 수 있는 칸</b>에는 3이 들어갈 수 없습니다!",
                boardSetup: {
                    "4-4": [1,2], // Pivot
                    "4-1": [1,3], // Wing 1
                    "7-4": [2,3], // Wing 2
                    "7-1": [3,5,7] // Target - can be seen by both wings
                },
                highlights: ["row-4", "col-4"],
                targetCells: ["cell-7-1"]
            },
            {
                title: "Y-윙 정리",
                desc: "<b>요약:</b> 중심축 [A,B] + 날개1 [A,C] + 날개2 [B,C] → 두 날개가 모두 보는 칸에서 C 제거!<br><br>💡 '두 날개가 모두 보는 칸'은 날개1과 같은 행/열/박스 이면서 동시에 날개2와도 같은 행/열/박스인 칸입니다.",
                boardSetup: {
                    "4-4": [1,2], // Pivot
                    "4-1": [1,3], // Wing 1
                    "7-4": [2,3], // Wing 2
                    "7-1": [5,7] // 3 removed!
                },
                highlights: ["row-4", "col-4"],
                targetCells: ["cell-7-1"]
            }
        ]
    },
    expert_2: {
        id: 'expert_2',
        difficulty: 'expert',
        title: '소드피쉬 (Swordfish)',
        steps: [
            {
                title: "소드피쉬란?",
                desc: "X-윙은 2x2 패턴이었죠? 소드피쉬는 <b>3x3 패턴</b>입니다! <b>3개의 열(또는 행)</b>에서 특정 숫자가 <b>같은 3개의 행(또는 열)</b> 안에만 존재할 때 발생합니다.",
                boardSetup: {
                    // Base: Cols 1, 5, 8.  Cover: Rows 1, 4, 7.
                    "1-1": [5], "1-5": [5], "1-2": [5,6], // Row 1 (1-2 is target)
                    "4-1": [5], "4-8": [5], "4-6": [5,7], // Row 4 (4-6 is target)
                    "7-5": [5], "7-8": [5], "7-2": [5,8]  // Row 7 (7-2 is target)
                },
                highlights: [],
                targetCells: []
            },
            {
                title: "예시 상황",
                desc: "<b>숫자 5</b>를 찾고 있습니다. <b>1열, 5열, 8열(세로줄)</b>을 주목하세요. 이 세 줄에서 5가 들어갈 수 있는 칸들이 서로 연결되어 보이나요?",
                boardSetup: {
                    "1-1": [5], "1-5": [5], "1-2": [5,6], // Row 1
                    "4-1": [5], "4-8": [5], "4-6": [5,7], // Row 4
                    "7-5": [5], "7-8": [5], "7-2": [5,8]  // Row 7
                },
                highlights: ["col-1", "col-5", "col-8"],
                targetCells: []
            },
            {
                title: "핵심 발견",
                desc: "이 3개의 세로줄에서 5는 오직 <b>1행, 4행, 7행</b>(가로줄)에만 등장하고 있습니다! <br>세로줄 3개가 가로줄 3개를 완벽하게 커버하는 형태입니다. (생선을 꼬치로 꿴 모양...?)",
                boardSetup: {
                    "1-1": [5], "1-5": [5], "1-2": [5,6],
                    "4-1": [5], "4-8": [5], "4-6": [5,7],
                    "7-5": [5], "7-8": [5], "7-2": [5,8]
                },
                highlights: ["col-1", "col-5", "col-8", "row-1", "row-4", "row-7"],
                targetCells: ["cell-1-1", "cell-1-5", "cell-4-1", "cell-4-8", "cell-7-5", "cell-7-8"]
            },
            {
                title: "제거 원리",
                desc: "세로줄들의 5는 반드시 이 교차점들(노란색) 중 어딘가에 있어야 합니다. 따라서 <b>1행, 4행, 7행의 나머지 칸(파란색)</b>에는 절대 5가 올 수 없습니다!",
                boardSetup: {
                    "1-1": [5], "1-5": [5], "1-2": [5,6],
                    "4-1": [5], "4-8": [5], "4-6": [5,7],
                    "7-5": [5], "7-8": [5], "7-2": [5,8]
                },
                highlights: ["row-1", "row-4", "row-7"],
                targetCells: ["cell-1-2", "cell-4-6", "cell-7-2"]
            },
            {
                title: "소드피쉬 정리",
                desc: "<b>요약:</b> 3개의 열에서 숫자가 3개의 행에 갇힘 → 그 3개 행의 나머지 칸에서 숫자 제거! (행/열 바꿔서도 가능)<br><br>💡 4x4는 <b>젤리피쉬</b>라고 부릅니다. (하지만 너무 복잡하죠?)",
                boardSetup: {
                    "1-1": [5], "1-5": [5], "1-2": [6], // 5 removed
                    "4-1": [5], "4-8": [5], "4-6": [7], // 5 removed
                    "7-5": [5], "7-8": [5], "7-2": [8]  // 5 removed
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
                title: "XY-체인이란?",
                desc: "후보가 2개인 칸들을 사슬처럼 연결하여 모순을 찾아내는 기법입니다. '시작점'과 '끝점'이 같은 숫자를 공유할 때, 그 두 지점이 모두 바라보는 칸에서 해당 숫자를 제거할 수 있습니다.",
                boardSetup: {
                    "3-1": [1,2], // Start (A) - Has 1
                    "3-4": [2,5], // Link 1
                    "6-4": [5,8], // Link 2
                    "6-7": [8,1], // End (B) - Has 1
                    "3-7": [1,4,6] // Target cell (Sees both A and B)
                },
                highlights: [],
                targetCells: []
            },
            {
                title: "체인 연결",
                desc: "사슬을 따라가 봅시다. <br>칸 A[1,2] → 칸 B[2,5] → 칸 C[5,8] → 칸 D[8,1] <br>이렇게 후보 숫자가 꼬리에 꼬리를 물고 연결됩니다. (2-2, 5-5, 8-8)",
                boardSetup: {
                    "3-1": [1,2], // Start
                    "3-4": [2,5], // Link 1
                    "6-4": [5,8], // Link 2
                    "6-7": [8,1], // End
                    "3-7": [1,4,6]
                },
                highlights: ["row-3", "col-4", "row-6"], // Visualizing links roughly
                targetCells: ["cell-3-1", "cell-3-4", "cell-6-4", "cell-6-7"] // The chain
            },
            {
                title: "가정해보기",
                desc: "만약 <b>시작점(3-1)이 1이 아니라면?</b> 반드시 2가 됩니다. <br>→ 그러면 다음 칸은 5 <br>→ 그 다음 칸은 8 <br>→ <b>결국 끝점(6-7)은 1이 됩니다!</b>",
                boardSetup: {
                    "3-1": [1,2], // If not 1, then 2
                    "3-4": [2,5], // then 5
                    "6-4": [5,8], // then 8
                    "6-7": [8,1], // then 1
                    "3-7": [1,4,6]
                },
                highlights: ["row-3", "col-4", "row-6"],
                targetCells: ["cell-3-1", "cell-6-7"] // Start and End
            },
            {
                title: "결론 도출",
                desc: "즉, 시작점이 1이거나, 아니면 끝점이 1입니다. <b>둘 중 하나는 무조건 1</b>이어야 합니다. (둘 다 1이 아닐 수는 없습니다)",
                boardSetup: {
                    "3-1": [1,2], "3-4": [2,5], "6-4": [5,8], "6-7": [8,1],
                    "3-7": [1,4,6]
                },
                highlights: ["row-3", "col-4", "row-6"],
                targetCells: ["cell-3-1", "cell-6-7"]
            },
            {
                title: "XY-체인 정리",
                desc: "<b>시작점</b>과 <b>끝점</b>이 모두 바라보는 칸(3-7)에는 <b>절대 1이 올 수 없습니다!</b> <br>왜냐하면 둘 중 하나는 반드시 1이라서, 그 칸에 영향을 주기 때문이죠.",
                boardSetup: {
                    "3-1": [1,2], "3-4": [2,5], "6-4": [5,8], "6-7": [8,1],
                    "3-7": [4,6] // 1 removed!
                },
                highlights: ["row-3", "row-6"], // Showing they see the target
                targetCells: ["cell-3-7"]
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
