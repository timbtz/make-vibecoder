#!/usr/bin/env tsx
/**
 * autoresearch-tracker.ts
 *
 * Tracks validation attempts, errors found, and corrections made
 * during autoresearch sessions for Make scenario generation.
 *
 * Usage (CLI):
 *   tsx src/scrapers/autoresearch-tracker.ts stats
 *   tsx src/scrapers/autoresearch-tracker.ts pending
 *   tsx src/scrapers/autoresearch-tracker.ts export
 *   tsx src/scrapers/autoresearch-tracker.ts start-session
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ValidationAttempt {
    timestamp: string;
    testCase: string;
    attemptNumber: number;
    blueprintValid: boolean;
    moduleValidations: ModuleValidation[];
    overallResult: 'success' | 'failed' | 'partial';
}

export interface ModuleValidation {
    module: string;
    appName: string;
    moduleName: string;
    valid: boolean;
    errors: ValidationError[];
}

export interface ValidationError {
    field: string;
    error: string;
    expected?: string;
    actual?: string;
}

export interface SchemaCorrection {
    timestamp: string;
    module: string;
    field: string;
    was: any;
    shouldBe: any;
    source: 'validation_error' | 'official_mcp' | 'manual';
    applied: boolean;
}

export interface SessionStats {
    sessionId: string;
    startTime: string;
    endTime?: string;
    testCasesRun: number;
    totalAttempts: number;
    successfulOnFirstTry: number;
    errorsFound: number;
    correctionsApplied: number;
}

const DATA_DIR = path.resolve(__dirname, '../../data/autoresearch');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'validation-attempts.json');
const CORRECTIONS_FILE = path.join(DATA_DIR, 'schema-corrections.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadJson<T>(filepath: string): T[] {
    ensureDataDir();
    if (fs.existsSync(filepath)) {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
    return [];
}

function saveJson<T>(filepath: string, data: T[]): void {
    ensureDataDir();
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Log a validation attempt
 */
export function logValidationAttempt(attempt: ValidationAttempt): void {
    const attempts = loadJson<ValidationAttempt>(ATTEMPTS_FILE);
    attempts.push(attempt);
    saveJson(ATTEMPTS_FILE, attempts);
    console.log(`[Autoresearch] Logged attempt #${attempt.attemptNumber} for ${attempt.testCase}: ${attempt.overallResult}`);
}

/**
 * Log a schema correction
 */
export function logSchemaCorrection(correction: SchemaCorrection): void {
    const corrections = loadJson<SchemaCorrection>(CORRECTIONS_FILE);
    corrections.push(correction);
    saveJson(CORRECTIONS_FILE, corrections);
    console.log(`[Autoresearch] Correction logged: ${correction.module}.${correction.field}`);
}

/**
 * Start a new autoresearch session
 */
export function startSession(): string {
    const sessions = loadJson<SessionStats>(SESSIONS_FILE);
    const sessionId = `session_${Date.now()}`;
    sessions.push({
        sessionId,
        startTime: new Date().toISOString(),
        testCasesRun: 0,
        totalAttempts: 0,
        successfulOnFirstTry: 0,
        errorsFound: 0,
        correctionsApplied: 0,
    });
    saveJson(SESSIONS_FILE, sessions);
    console.log(`[Autoresearch] Started session: ${sessionId}`);
    return sessionId;
}

/**
 * Update session stats
 */
export function updateSession(sessionId: string, updates: Partial<SessionStats>): void {
    const sessions = loadJson<SessionStats>(SESSIONS_FILE);
    const index = sessions.findIndex((s) => s.sessionId === sessionId);
    if (index !== -1) {
        sessions[index] = { ...sessions[index], ...updates } as SessionStats;
        saveJson(SESSIONS_FILE, sessions);
    }
}

/**
 * End a session
 */
export function endSession(sessionId: string): void {
    updateSession(sessionId, { endTime: new Date().toISOString() });
    console.log(`[Autoresearch] Ended session: ${sessionId}`);
}

/**
 * Get stats for reporting
 */
export function getStats(): {
    totalAttempts: number;
    successRate: number;
    commonErrors: { field: string; count: number }[];
    recentCorrections: SchemaCorrection[];
} {
    const attempts = loadJson<ValidationAttempt>(ATTEMPTS_FILE);
    const corrections = loadJson<SchemaCorrection>(CORRECTIONS_FILE);

    const successes = attempts.filter((a) => a.overallResult === 'success').length;

    const errorCounts: Record<string, number> = {};
    for (const attempt of attempts) {
        for (const mv of attempt.moduleValidations) {
            for (const err of mv.errors) {
                const key = `${mv.module}.${err.field}`;
                errorCounts[key] = (errorCounts[key] ?? 0) + 1;
            }
        }
    }

    const commonErrors = Object.entries(errorCounts)
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        totalAttempts: attempts.length,
        successRate: attempts.length > 0 ? (successes / attempts.length) * 100 : 0,
        commonErrors,
        recentCorrections: corrections.slice(-10),
    };
}

/**
 * Build a SchemaCorrection object from a validation error + official MCP data.
 * Call logSchemaCorrection() to persist it.
 */
export function createCorrection(
    module: string,
    field: string,
    actualValue: any,
    officialValue: any
): SchemaCorrection {
    return {
        timestamp: new Date().toISOString(),
        module,
        field,
        was: actualValue,
        shouldBe: officialValue,
        source: 'validation_error',
        applied: false,
    };
}

/**
 * Mark corrections as applied (call after running merge-schemas.ts + npm run scrape)
 */
export function markCorrectionsApplied(modulePrefix?: string): number {
    const corrections = loadJson<SchemaCorrection>(CORRECTIONS_FILE);
    let count = 0;
    for (const c of corrections) {
        if (!c.applied && (!modulePrefix || c.module.startsWith(modulePrefix))) {
            c.applied = true;
            count++;
        }
    }
    saveJson(CORRECTIONS_FILE, corrections);
    console.log(`[Autoresearch] Marked ${count} corrections as applied`);
    return count;
}

/**
 * Get corrections that have not yet been applied to the DB
 */
export function getPendingCorrections(): SchemaCorrection[] {
    return loadJson<SchemaCorrection>(CORRECTIONS_FILE).filter((c) => !c.applied);
}

/**
 * Export pending corrections in the format accepted by merge-schemas.ts
 * (i.e. the official-mcp-schemas.json patch format)
 */
export function exportCorrectionsForEnrichment(): Record<string, any> {
    const output: Record<string, any> = {};
    for (const c of getPendingCorrections()) {
        if (!output[c.module]) output[c.module] = {};
        // Support dotted field paths (e.g. "parameters.0.type")
        const parts = c.field.split('.');
        let current = output[c.module];
        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i]!;
            if (!current[key]) current[key] = {};
            current = current[key];
        }
        current[parts[parts.length - 1]!] = c.shouldBe;
    }
    return output;
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    const command = process.argv[2];

    switch (command) {
        case 'stats': {
            const stats = getStats();
            console.log('\n=== Autoresearch Stats ===');
            console.log(`Total validation attempts: ${stats.totalAttempts}`);
            console.log(`Success rate: ${stats.successRate.toFixed(1)}%`);
            console.log('\nMost common errors:');
            for (const e of stats.commonErrors.slice(0, 5)) {
                console.log(`  ${e.field}: ${e.count} occurrence(s)`);
            }
            console.log('\nRecent corrections:');
            for (const c of stats.recentCorrections.slice(-5)) {
                console.log(`  ${c.module}.${c.field} (${c.applied ? 'applied' : 'pending'})`);
            }
            break;
        }

        case 'pending': {
            const pending = getPendingCorrections();
            console.log(`\n${pending.length} pending correction(s):`);
            for (const c of pending) {
                console.log(`  ${c.module}.${c.field}`);
                console.log(`    was:       ${JSON.stringify(c.was)}`);
                console.log(`    should be: ${JSON.stringify(c.shouldBe)}`);
            }
            break;
        }

        case 'export': {
            const exported = exportCorrectionsForEnrichment();
            console.log(JSON.stringify(exported, null, 2));
            break;
        }

        case 'start-session': {
            startSession();
            break;
        }

        default: {
            console.log(`
Usage:
  tsx src/scrapers/autoresearch-tracker.ts stats         # Show statistics
  tsx src/scrapers/autoresearch-tracker.ts pending       # Show pending corrections
  tsx src/scrapers/autoresearch-tracker.ts export        # Export corrections as JSON for merge-schemas
  tsx src/scrapers/autoresearch-tracker.ts start-session # Start a new session
`);
        }
    }
}
