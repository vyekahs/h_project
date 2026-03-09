#!/usr/bin/env node

/**
 * 색상 자동 치환 스크립트 v2
 * color-groups.json 매핑을 기반으로 하드코딩된 색상을 CSS 변수로 치환
 *
 * 규칙:
 * - <style> 블록 내의 CSS property 값만 치환
 * - inline style="" 내의 값도 치환
 * - 정확한 값 매칭만 수행 (유사색 추정 X)
 * - context-aware: 같은 색상이라도 property에 따라 다른 변수 매핑
 * - 이미 var()로 치환된 값은 건너뜀
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// Load color groups
const groups = JSON.parse(fs.readFileSync(path.join(__dirname, 'color-groups.json'), 'utf-8'));
const { variables, mappings } = groups;

// 제외 패턴 (디렉토리 + 특정 파일)
const EXCLUDE_PATTERNS = groups.exclude_patterns || [
    'src/routes/games/tichu/',
    'src/routes/admin/',
    'src/routes/+layout.svelte',
];

// 통계
const stats = {
    filesProcessed: 0,
    filesModified: 0,
    totalReplacements: 0,
    replacementsByVar: {},
    skipped: [],
};

// CSS 속성 목록 (hex/named 색상 매칭용)
const CSS_COLOR_PROPS = 'color|background|background-color|border|border-color|border-top|border-bottom|border-left|border-right|border-top-color|border-bottom-color|border-left-color|border-right-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|text-decoration-color|caret-color|accent-color';

function getAllSvelteFiles(dir) {
    const results = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relPath = path.relative(PROJECT_ROOT, fullPath);
        if (item.isDirectory()) {
            if (item.name === 'node_modules' || item.name === '.svelte-kit') continue;
            results.push(...getAllSvelteFiles(fullPath));
        } else if (item.name.endsWith('.svelte')) {
            const excluded = EXCLUDE_PATTERNS.some(d => relPath.startsWith(d) || relPath === d);
            if (!excluded) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

/**
 * CSS property 이름에서 컨텍스트 추출
 */
function getContextFromProperty(prop) {
    prop = prop.trim().toLowerCase();
    if (prop === 'color') return 'color';
    if (prop.startsWith('background')) return 'background';
    if (prop.startsWith('border')) return 'border';
    if (prop === 'box-shadow' || prop === 'text-shadow') return 'box-shadow';
    if (prop === 'fill') return 'fill';
    if (prop === 'stroke') return 'stroke';
    if (prop === 'outline' || prop === 'outline-color') return 'border';
    return 'unknown';
}

/**
 * 매핑에서 context에 맞는 CSS 변수를 찾음
 */
function resolveMapping(colorValue, context) {
    // 이미 var()로 되어있으면 스킵
    if (colorValue.startsWith('var(')) return null;

    // 1. simple 매핑 확인
    const simpleMap = mappings.simple[colorValue];
    if (simpleMap) {
        if (typeof simpleMap === 'string') {
            return `var(${simpleMap})`;
        }
        if (typeof simpleMap === 'object') {
            if (simpleMap[context]) return `var(${simpleMap[context]})`;
            if (simpleMap._default) return `var(${simpleMap._default})`;
        }
    }

    // 2. named color 매핑 확인
    const namedMap = mappings.named[colorValue];
    if (namedMap) {
        if (typeof namedMap === 'string') return `var(${namedMap})`;
        if (typeof namedMap === 'object') {
            if (namedMap[context]) return `var(${namedMap[context]})`;
            if (namedMap._default) return `var(${namedMap._default})`;
        }
    }

    // 3. rgba shadow 매핑 확인
    const shadowMap = mappings.rgba_shadows[colorValue];
    if (shadowMap) return `var(${shadowMap})`;

    // 4. rgba overlay 매핑 확인
    const overlayMap = mappings.rgba_overlays[colorValue];
    if (overlayMap) return `var(${overlayMap})`;

    return null;
}

function trackReplacement(replacement) {
    const varName = replacement.match(/var\((--[\w-]+)\)/)?.[1] || replacement;
    stats.replacementsByVar[varName] = (stats.replacementsByVar[varName] || 0) + 1;
}

/**
 * <style> 블록 내의 CSS 치환
 */
function replaceInStyleBlock(css, filePath) {
    let result = css;
    let count = 0;

    const propPattern = `\\b(?:${CSS_COLOR_PROPS})`;

    // hex 색상 치환 (6자리)
    result = result.replace(
        new RegExp(`(${propPattern}\\s*:[^;]*?)(#[0-9a-fA-F]{6})\\b`, 'g'),
        (match, before, hex) => {
            const propMatch = before.match(/([\w-]+)\s*:/);
            const prop = propMatch ? propMatch[1] : 'unknown';
            const context = getContextFromProperty(prop);
            const replacement = resolveMapping(hex.toLowerCase(), context);
            if (replacement) {
                count++;
                trackReplacement(replacement);
                return before + replacement;
            }
            return match;
        }
    );

    // hex 색상 치환 (3자리)
    result = result.replace(
        new RegExp(`(${propPattern}\\s*:[^;]*?)(#[0-9a-fA-F]{3})\\b(?![0-9a-fA-F])`, 'g'),
        (match, before, hex) => {
            const propMatch = before.match(/([\w-]+)\s*:/);
            const prop = propMatch ? propMatch[1] : 'unknown';
            const context = getContextFromProperty(prop);
            const replacement = resolveMapping(hex.toLowerCase(), context);
            if (replacement) {
                count++;
                trackReplacement(replacement);
                return before + replacement;
            }
            return match;
        }
    );

    // named color 'white' 치환 (모든 CSS 속성에서)
    result = result.replace(
        new RegExp(`(${propPattern}\\s*:[^;]*?)\\bwhite\\b`, 'g'),
        (match, before) => {
            // var() 안의 white는 건너뜀
            if (before.includes('var(')) return match;
            const propMatch = before.match(/([\w-]+)\s*:/);
            const prop = propMatch ? propMatch[1] : 'unknown';
            const context = getContextFromProperty(prop);
            const replacement = resolveMapping('white', context);
            if (replacement) {
                count++;
                trackReplacement(replacement);
                return before + replacement;
            }
            return match;
        }
    );

    // named color 'black' 치환 (모든 CSS 속성에서)
    result = result.replace(
        new RegExp(`(${propPattern}\\s*:[^;]*?)\\bblack\\b`, 'g'),
        (match, before) => {
            if (before.includes('var(')) return match;
            const propMatch = before.match(/([\w-]+)\s*:/);
            const prop = propMatch ? propMatch[1] : 'unknown';
            const context = getContextFromProperty(prop);
            const replacement = resolveMapping('black', context);
            if (replacement) {
                count++;
                trackReplacement(replacement);
                return before + replacement;
            }
            return match;
        }
    );

    // rgba 치환 — box-shadow, background, border 등 모든 컨텍스트
    result = result.replace(
        new RegExp(`(${propPattern}\\s*:[^;]*?)rgba\\((\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\)`, 'g'),
        (match, before, r, g, b, a) => {
            const normalized = `rgba(${r},${g},${b},${a})`;
            const propMatch = before.match(/([\w-]+)\s*:/);
            const prop = propMatch ? propMatch[1] : 'unknown';
            const context = getContextFromProperty(prop);
            const replacement = resolveMapping(normalized, context);
            if (replacement) {
                count++;
                trackReplacement(replacement);
                return before + replacement;
            }
            return match;
        }
    );

    stats.totalReplacements += count;
    return { result, count };
}

/**
 * inline style="" 내의 색상 치환
 */
function replaceInInlineStyles(html, filePath) {
    let result = html;
    let count = 0;

    result = result.replace(
        /style="([^"]*)"/g,
        (match, styleContent) => {
            let newStyle = styleContent;
            let modified = false;

            // white 치환 (모든 CSS 속성)
            newStyle = newStyle.replace(
                /(\b(?:color|background(?:-color)?|border(?:-color)?)\s*:\s*(?:[^;]*\s)?)white\b/g,
                (m, before) => {
                    if (before.includes('var(')) return m;
                    const propMatch = before.match(/([\w-]+)\s*:/);
                    const prop = propMatch ? propMatch[1] : 'unknown';
                    const context = getContextFromProperty(prop);
                    const repl = resolveMapping('white', context);
                    if (repl) { modified = true; count++; trackReplacement(repl); return before + repl; }
                    return m;
                }
            );

            // hex 치환
            newStyle = newStyle.replace(
                /(\b(?:color|background|background-color|border|border-color|border-left|border-right|border-top|border-bottom)\s*:\s*(?:[^;]*\s)?)#([0-9a-fA-F]{3,6})\b/g,
                (m, before, hexVal) => {
                    if (before.includes('var(')) return m;
                    const fullHex = '#' + hexVal.toLowerCase();
                    const propMatch = before.match(/([\w-]+)\s*:/);
                    const prop = propMatch ? propMatch[1] : 'unknown';
                    const context = getContextFromProperty(prop);
                    const repl = resolveMapping(fullHex, context);
                    if (repl) { modified = true; count++; trackReplacement(repl); return before + repl; }
                    return m;
                }
            );

            // rgba 치환 in inline styles
            newStyle = newStyle.replace(
                /(\b(?:box-shadow|background|background-color|border|border-color)\s*:[^;]*?)rgba\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/g,
                (m, before, r, g, b, a) => {
                    const normalized = `rgba(${r},${g},${b},${a})`;
                    const replacement = resolveMapping(normalized, 'box-shadow');
                    if (replacement) { modified = true; count++; trackReplacement(replacement); return before + replacement; }
                    return m;
                }
            );

            if (modified) {
                return `style="${newStyle}"`;
            }
            return match;
        }
    );

    stats.totalReplacements += count;
    return { result, count };
}

/**
 * 파일 전체 처리
 */
function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(PROJECT_ROOT, filePath);
    stats.filesProcessed++;

    let newContent = content;
    let totalCount = 0;

    // <style> 블록 처리
    newContent = newContent.replace(
        /(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
        (match, openTag, css, closeTag) => {
            const { result, count } = replaceInStyleBlock(css, relPath);
            totalCount += count;
            return openTag + result + closeTag;
        }
    );

    // inline style 처리 (template 부분만)
    const parts = newContent.split(/(<style[^>]*>[\s\S]*?<\/style>)/g);
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<style')) {
            const { result, count } = replaceInInlineStyles(parts[i], relPath);
            parts[i] = result;
            totalCount += count;
        }
    }
    newContent = parts.join('');

    if (totalCount > 0) {
        fs.writeFileSync(filePath, newContent);
        stats.filesModified++;
        console.log(`  ✅ ${relPath}: ${totalCount}개 치환`);
    }
}

// ===== 메인 실행 =====
console.log('🔄 색상 자동 치환 v2 시작...\n');

const files = getAllSvelteFiles(SRC_DIR);
console.log(`📁 ${files.length}개 .svelte 파일 처리 중...\n`);

for (const file of files) {
    processFile(file);
}

console.log('\n' + '═'.repeat(60));
console.log('📊 치환 결과 요약');
console.log('═'.repeat(60));
console.log(`  파일 스캔: ${stats.filesProcessed}`);
console.log(`  파일 수정: ${stats.filesModified}`);
console.log(`  총 치환: ${stats.totalReplacements}`);

console.log('\n변수별 치환 횟수:');
const sorted = Object.entries(stats.replacementsByVar).sort((a, b) => b[1] - a[1]);
for (const [varName, count] of sorted) {
    console.log(`  ${String(count).padStart(4)} × ${varName}`);
}

console.log('\n✅ 치환 완료!');
console.log('💡 npm run build로 빌드 에러 확인 필요');
