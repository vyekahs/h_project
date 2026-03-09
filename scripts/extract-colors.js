#!/usr/bin/env node

/**
 * 색상 추출 스크립트
 * .svelte, .ts 파일에서 하드코딩된 색상을 추출하여 JSON 리포트 생성
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// 색상 패턴 정의
const HEX_3 = /#([0-9a-fA-F]{3})\b/g;
const HEX_6 = /#([0-9a-fA-F]{6})\b/g;
const HEX_8 = /#([0-9a-fA-F]{8})\b/g;
const RGBA_PATTERN = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/g;
const NAMED_COLORS = /\b(white|black|transparent|red|green|blue|orange|yellow|gray|grey)\b/gi;

// CSS property가 색상을 받는지 판별
const COLOR_PROPERTIES = [
  'color', 'background', 'background-color', 'border', 'border-color',
  'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
  'outline', 'outline-color', 'box-shadow', 'text-shadow',
  'fill', 'stroke', 'stop-color', 'flood-color',
  'text-decoration-color', 'caret-color', 'column-rule-color',
  'background-image' // for gradients
];

// 제외 패턴 (이미 CSS 변수인 것, 주석 등)
const EXCLUDE_PATTERNS = [
  /var\(--/,        // CSS variables
  /\/\//,           // JS comments (very rough)
  /^\s*\*/,         // Block comment lines
  /^\s*<!--/,       // HTML comments
];

function getAllFiles(dir, extensions) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '.svelte-kit') continue;
      results.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => item.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function detectContext(line) {
  // CSS property context 감지
  const trimmed = line.trim();
  for (const prop of COLOR_PROPERTIES) {
    if (trimmed.startsWith(prop + ':') || trimmed.startsWith(prop + ' :')) {
      return prop;
    }
  }
  // inline style
  if (trimmed.includes('style=') || trimmed.includes('style:')) {
    const propMatch = trimmed.match(/(\w[\w-]*):\s*(?:#|rgba?|white|black)/);
    if (propMatch) return propMatch[1];
    return 'inline-style';
  }
  // gradient
  if (trimmed.includes('gradient')) return 'gradient';
  // SVG
  if (trimmed.includes('fill=') || trimmed.includes('stroke=')) return 'svg-attr';
  return 'unknown';
}

function isInStyleBlock(lines, lineIndex) {
  // <style> 블록 안인지 확인
  let inStyle = false;
  for (let i = 0; i <= lineIndex; i++) {
    if (lines[i].includes('<style')) inStyle = true;
    if (lines[i].includes('</style>')) inStyle = false;
  }
  return inStyle;
}

function isInScriptBlock(lines, lineIndex) {
  let inScript = false;
  for (let i = 0; i <= lineIndex; i++) {
    if (lines[i].includes('<script')) inScript = true;
    if (lines[i].includes('</script>')) inScript = false;
  }
  return inScript;
}

function extractColors(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results = [];
  const relativePath = path.relative(PROJECT_ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 주석 라인 스킵
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) continue;

    // 이미 CSS 변수 사용중이면 스킵
    if (line.includes('var(--')) continue;

    const inStyle = isInStyleBlock(lines, i);
    const inScript = isInScriptBlock(lines, i);
    const context = detectContext(line);
    const location = inStyle ? 'style' : inScript ? 'script' : 'template';

    // Hex 6자리
    let match;
    const hex6Re = /#([0-9a-fA-F]{6})\b/g;
    while ((match = hex6Re.exec(line)) !== null) {
      results.push({
        color: match[0].toLowerCase(),
        type: 'hex6',
        file: relativePath,
        line: i + 1,
        context,
        location,
        fullLine: trimmed.substring(0, 120)
      });
    }

    // Hex 8자리 (alpha)
    const hex8Re = /#([0-9a-fA-F]{8})\b/g;
    while ((match = hex8Re.exec(line)) !== null) {
      // hex8이 hex6과 겹칠 수 있으니 8자리만
      if (match[0].length === 9) {
        results.push({
          color: match[0].toLowerCase(),
          type: 'hex8',
          file: relativePath,
          line: i + 1,
          context,
          location,
          fullLine: trimmed.substring(0, 120)
        });
      }
    }

    // Hex 3자리 (hex6에 포함되지 않는 것만)
    const hex3Re = /#([0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g;
    while ((match = hex3Re.exec(line)) !== null) {
      // hex6 매치와 겹치지 않도록 체크
      const pos = match.index;
      const after = line.substring(pos + 4, pos + 7);
      if (/^[0-9a-fA-F]{3}/.test(after)) continue; // 실제로는 hex6의 일부

      results.push({
        color: match[0].toLowerCase(),
        type: 'hex3',
        file: relativePath,
        line: i + 1,
        context,
        location,
        fullLine: trimmed.substring(0, 120)
      });
    }

    // rgba/rgb
    const rgbaRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)/g;
    while ((match = rgbaRe.exec(line)) !== null) {
      results.push({
        color: match[0].replace(/\s+/g, ''),
        type: match[4] ? 'rgba' : 'rgb',
        file: relativePath,
        line: i + 1,
        context,
        location,
        fullLine: trimmed.substring(0, 120)
      });
    }

    // Named colors (CSS context에서만)
    if (inStyle || line.includes('style=') || line.includes('fill=') || line.includes('stroke=')) {
      const namedRe = /(?::\s*|=["'])(white|black|transparent)(?:\s|;|"|'|$)/gi;
      while ((match = namedRe.exec(line)) !== null) {
        results.push({
          color: match[1].toLowerCase(),
          type: 'named',
          file: relativePath,
          line: i + 1,
          context,
          location,
          fullLine: trimmed.substring(0, 120)
        });
      }
    }
  }

  return results;
}

// 메인 실행
console.log('🔍 색상 추출 시작...');

const files = getAllFiles(SRC_DIR, ['.svelte', '.ts']);
console.log(`📁 ${files.length}개 파일 스캔 중...`);

let allColors = [];
for (const file of files) {
  const colors = extractColors(file);
  allColors.push(...colors);
}

console.log(`🎨 총 ${allColors.length}개 색상 참조 발견\n`);

// 색상별 통계
const colorStats = {};
for (const entry of allColors) {
  const key = entry.color;
  if (!colorStats[key]) {
    colorStats[key] = {
      color: key,
      type: entry.type,
      count: 0,
      files: new Set(),
      contexts: new Set(),
      locations: new Set(),
      usages: []
    };
  }
  colorStats[key].count++;
  colorStats[key].files.add(entry.file);
  colorStats[key].contexts.add(entry.context);
  colorStats[key].locations.add(entry.location);
  colorStats[key].usages.push({
    file: entry.file,
    line: entry.line,
    context: entry.context,
    location: entry.location
  });
}

// Set을 Array로 변환 (JSON 직렬화용)
const statsArray = Object.values(colorStats)
  .map(s => ({
    ...s,
    files: [...s.files],
    contexts: [...s.contexts],
    locations: [...s.locations]
  }))
  .sort((a, b) => b.count - a.count);

// 요약 출력
console.log('📊 상위 30개 색상:');
console.log('─'.repeat(70));
for (const stat of statsArray.slice(0, 30)) {
  const filesCount = stat.files.length;
  const contexts = stat.contexts.join(', ');
  console.log(`  ${String(stat.count).padStart(4)} × ${stat.color.padEnd(30)} (${filesCount} files, ${contexts})`);
}

console.log(`\n📋 총 고유 색상: ${statsArray.length}개`);
console.log(`📋 총 참조: ${allColors.length}개`);

// 타입별 통계
const byType = {};
for (const entry of allColors) {
  byType[entry.type] = (byType[entry.type] || 0) + 1;
}
console.log('\n타입별 분포:');
for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

// 컨텍스트별 통계
const byContext = {};
for (const entry of allColors) {
  byContext[entry.context] = (byContext[entry.context] || 0) + 1;
}
console.log('\n컨텍스트별 분포:');
for (const [ctx, count] of Object.entries(byContext).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ctx}: ${count}`);
}

// JSON 리포트 저장
const report = {
  generated: new Date().toISOString(),
  summary: {
    totalReferences: allColors.length,
    uniqueColors: statsArray.length,
    filesScanned: files.length,
    byType,
    byContext
  },
  colors: statsArray,
  rawEntries: allColors
};

const outputPath = path.join(__dirname, 'color-report.json');
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`\n✅ 리포트 저장: ${outputPath}`);
