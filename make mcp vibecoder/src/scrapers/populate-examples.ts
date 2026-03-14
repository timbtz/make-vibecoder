/**
 * Blueprint Examples Populator
 *
 * Extracts real module configurations from blueprint JSON files and stores
 * them in the `examples` table. This enriches get_module responses with
 * concrete, real-world usage examples from actual Make.com scenarios.
 *
 * Rules:
 * - Merges module `parameters` + `mapper` into one config object
 * - Strips values that look like credentials/tokens (replaces with placeholder)
 * - Keeps IML expressions ({{N.field}}), plain strings, numbers, booleans
 * - Stores at most MAX_EXAMPLES_PER_MODULE per module (highest-quality first)
 * - Skips builtin-only modules (no useful config to show)
 * - Source tagged as "blueprint:<filename>"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MakeDatabase } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_EXAMPLES_PER_MODULE = 5;

// Modules whose configs are structural noise, not useful examples
const SKIP_MODULE_PREFIXES = [
    'builtin:BasicFeeder',
    'builtin:BasicAggregator',
    'builtin:BasicRouter',
    'builtin:BasicIterator',
    'util:',
    'regexp:',
];

// Keys that likely contain credentials/secrets — replace value with placeholder
const SENSITIVE_KEY_PATTERNS = [
    /api[_-]?key/i,
    /api[_-]?secret/i,
    /access[_-]?token/i,
    /auth[_-]?token/i,
    /bearer/i,
    /password/i,
    /secret/i,
    /credential/i,
    /private[_-]?key/i,
    /client[_-]?secret/i,
    /webhook[_-]?secret/i,
];

function isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some(re => re.test(key));
}

function sanitize(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(sanitize);
    if (typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = isSensitiveKey(k) ? '{{REDACTED}}' : sanitize(v);
        }
        return out;
    }
    return value;
}

function isUsefulConfig(config: Record<string, any>): boolean {
    // Must have at least one non-empty field
    return Object.keys(config).length > 0;
}

function scoreConfig(config: Record<string, any>): number {
    // Higher score = more useful example
    // Reward: more fields, IML expressions, non-trivial values
    let score = Object.keys(config).length;
    const json = JSON.stringify(config);
    // Bonus for IML expressions (show real data mapping)
    const imlMatches = (json.match(/\{\{/g) || []).length;
    score += imlMatches * 2;
    // Penalty for mostly-empty or single-field configs
    if (Object.keys(config).length <= 1) score -= 2;
    return score;
}

function getBlueprintFolders(): string[] {
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const candidates = [
        path.join(projectRoot, 'Make example Blueprints'),
        path.join(projectRoot, 'Make example flows'),
        path.join(projectRoot, 'Make example flows 1'),
        path.join(projectRoot, 'Make example flows 2'),
    ];
    return candidates.filter(f => fs.existsSync(f));
}

function shouldSkip(moduleId: string): boolean {
    return SKIP_MODULE_PREFIXES.some(prefix => moduleId.startsWith(prefix));
}

// ============================================================================
// MAIN
// ============================================================================

export function populateExamples(db: MakeDatabase): { inserted: number; modules: number; skipped: number } {
    const folders = getBlueprintFolders();
    if (folders.length === 0) {
        console.log('  ⚠️  No blueprint folders found, skipping examples population');
        return { inserted: 0, modules: 0, skipped: 0 };
    }

    // Collect all configs per module across all blueprints
    const allConfigs = new Map<string, Array<{ config: Record<string, any>; source: string; score: number }>>();

    for (const folder of folders) {
        const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
        for (const file of files) {
            let blueprint: any;
            try {
                blueprint = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf-8'));
            } catch {
                continue;
            }
            const source = `blueprint:${file}`;
            const flow: any[] = blueprint.flow || [];

            for (const module of flow) {
                const moduleId: string = module.module;
                if (!moduleId || !moduleId.includes(':')) continue;
                if (shouldSkip(moduleId)) continue;

                // Merge mapper + parameters — mapper has dynamic values, parameters has static ones
                const raw: Record<string, any> = {};
                if (module.parameters && typeof module.parameters === 'object') {
                    Object.assign(raw, module.parameters);
                }
                if (module.mapper && typeof module.mapper === 'object') {
                    Object.assign(raw, module.mapper);
                }

                if (!isUsefulConfig(raw)) continue;

                const config = sanitize(raw);
                const score = scoreConfig(config);

                if (!allConfigs.has(moduleId)) allConfigs.set(moduleId, []);
                allConfigs.get(moduleId)!.push({ config, source, score });
            }
        }
    }

    let inserted = 0;
    let modulesWithExamples = 0;
    let skipped = 0;

    db.runInTransaction(() => {
        for (const [moduleId, entries] of allConfigs) {
            // Sort by score descending, deduplicate by JSON fingerprint
            const seen = new Set<string>();
            const top = entries
                .sort((a, b) => b.score - a.score)
                .filter(e => {
                    const key = JSON.stringify(e.config);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, MAX_EXAMPLES_PER_MODULE);

            if (top.length === 0) { skipped++; continue; }

            for (const { config, source } of top) {
                db.insertExample(moduleId, config, source);
                inserted++;
            }
            modulesWithExamples++;
        }
    });

    return { inserted, modules: modulesWithExamples, skipped };
}

// ============================================================================
// STANDALONE RUN
// ============================================================================

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isMain) {
    const db = new MakeDatabase();
    console.log('🔄 Populating module examples from blueprints...\n');

    // Clear existing examples first (idempotent re-runs)
    db.clearExamples();
    console.log('  🗑️  Cleared existing examples');

    const result = populateExamples(db);
    console.log(`\n✅ Examples inserted: ${result.inserted}`);
    console.log(`   Modules with examples: ${result.modules}`);
    if (result.skipped > 0) console.log(`   Skipped (no config): ${result.skipped}`);
    db.close();
}
