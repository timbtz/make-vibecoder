/**
 * scrape-from-make-api.ts
 *
 * Full-rebuild API scraper for the Make modules database.
 * Replaces the hand-crafted catalog in scrape-modules.ts with live, authoritative
 * module data pulled directly from the Make REST API.
 *
 * Three phases:
 *   Phase 0 — App Discovery: extract unique app slugs from the local catalog
 *             + attempt to discover additional apps via the Make /apps endpoint
 *   Phase A — Module List: GET /apps/{app}@{version}/modules for each app
 *   Phase B — Module Detail: GET /apps/{app}@{version}/modules/{name} for each module
 *   Phase C — Rebuild: truncate modules table, INSERT all discovered modules
 *
 * Usage:
 *   npm run scrape:api        (standalone)
 *   Called automatically by populateDatabase() in scrape-modules.ts when MAKE_API_KEY is set
 *
 * Rate limit: 1100ms between every API call (60 req/min, safely under limit)
 * On 429:     exponential backoff — 60s × (attempt+1), up to 3 retries
 * On 404/403: skip silently
 * Other errors: 2s × (attempt+1) retry, 3 attempts
 */

import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MakeDatabase } from '../database/db.js';
import { ModuleScraper } from './scrape-modules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env') });

// ── Config ──────────────────────────────────────────────────────────────────

const API_KEY = process.env['MAKE_API_KEY'] || '';
const BASE_URL = (process.env['MAKE_API_URL'] || 'https://eu1.make.com/api/v2').replace(/\/+$/, '');
const ORG_ID = process.env['MAKE_ORGANIZATION_ID'] || '';

/** 1100ms between calls keeps us safely under 60 req/min */
const DELAY_MS = 1100;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiHeaders(): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Token ${API_KEY}` };
    if (ORG_ID) h['x-imt-organization-id'] = ORG_ID;
    return h;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T | null> {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (err: any) {
            const status = err?.response?.status;
            if (status === 404 || status === 403) {
                if (process.env['MAKE_DEBUG']) {
                    console.debug(`  skip ${status}: ${err?.config?.url}`);
                }
                return null;
            }
            if (status === 429) {
                const backoff = 60_000 * (i + 1);
                console.warn(`  ⚠ Rate limited (429). Waiting ${backoff / 1000}s before retry ${i + 1}/${retries}...`);
                await sleep(backoff);
            } else if (i < retries) {
                await sleep(2_000 * (i + 1));
            } else {
                // Last attempt failed — log actual error details
                const msg = err?.response?.data?.message || err?.message || 'unknown';
                console.warn(`  ✗ Failed after ${retries + 1} attempts: HTTP ${status ?? 'N/A'} — ${msg}`);
            }
        }
    }
    return null;
}

// ── Type mapping ─────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
    action: 'action',
    trigger: 'trigger',
    instant_trigger: 'instant_trigger',
    search: 'search',
    universal: 'universal',
    responder: 'responder',
};

/** Fallback type mapping from numeric typeId (Make API legacy field) */
function typeFromIds(typeId?: number, annotation?: string): string {
    if (annotation && TYPE_MAP[annotation]) return TYPE_MAP[annotation];
    switch (typeId) {
        case 1: return 'trigger';
        case 4: return 'action';
        case 9: return 'search';
        case 10: return 'instant_trigger';
        case 11: return 'responder';
        case 12: return 'universal';
        default: return 'action';
    }
}

function extractConnectionType(parameters?: any[]): string | undefined {
    if (!parameters) return undefined;
    for (const p of parameters) {
        if (typeof p.type === 'string' && p.type.startsWith('account:')) return p.type;
    }
    return undefined;
}

/** Convert an app slug like "google-sheets" → "Google Sheets" */
function slugToLabel(slug: string): string {
    return slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// ── Phase 0: App Discovery ───────────────────────────────────────────────────

/**
 * Extract unique app slugs from the local module catalog (no API call needed).
 * Returns a Map of slug → default version (2).
 */
function appSlugsFromCatalog(): Map<string, number> {
    const scraper = new ModuleScraper();
    const catalog = scraper.getModuleCatalog() as Array<{ id: string }>;
    const map = new Map<string, number>();
    for (const mod of catalog) {
        const slug = mod.id.split(':')[0];
        if (slug && !map.has(slug)) map.set(slug, 2);
    }
    return map;
}

/**
 * Attempt to discover additional apps via the Make /apps endpoint.
 * Returns a list of app slugs; empty array if the endpoint is unavailable.
 */
async function discoverAppsFromApi(): Promise<string[]> {
    await sleep(DELAY_MS);
    const res = await withRetry(() =>
        axios.get(`${BASE_URL}/apps`, {
            headers: apiHeaders(),
            params: { 'pg[limit]': 200 },
        })
    );
    if (!res?.data?.apps) return [];
    return (res.data.apps as any[])
        .map((a: any) => a.name || a.id || '')
        .filter(Boolean);
}

// ── Phase A: Module List ─────────────────────────────────────────────────────

interface ApiModuleEntry {
    name: string;
    label?: string;
    description?: string;
    typeId?: number;
    listener?: boolean;
    deprecated?: boolean;
}

async function fetchModuleList(
    appName: string,
    preferredVersion: number
): Promise<{ modules: ApiModuleEntry[]; version: number } | null> {
    const versions = preferredVersion === 1 ? [1] : [preferredVersion, 1];
    for (const v of versions) {
        await sleep(DELAY_MS);
        const res = await withRetry(() =>
            axios.get(`${BASE_URL}/apps/${appName}@${v}/modules`, { headers: apiHeaders() })
        );
        const list: any[] | undefined = res?.data?.appModules ?? res?.data?.modules;
        if (list) return { modules: list, version: v };
    }
    return null;
}

// ── Phase B: Module Detail ───────────────────────────────────────────────────

interface ApiModuleDetail {
    name: string;
    label?: string;
    description?: string;
    scope?: string[];
    parameters?: any[];
    expect?: any[];
    interface?: Array<{ name: string; type: string; label?: string }>;
    deprecated?: boolean;
    listener?: boolean;
    _annotations?: {
        moduleType?: string;
        returnsMultipleBundles?: boolean;
    };
}

async function fetchModuleDetail(
    appName: string,
    version: number,
    moduleName: string
): Promise<ApiModuleDetail | null> {
    await sleep(DELAY_MS);
    const res = await withRetry(() =>
        axios.get(`${BASE_URL}/apps/${appName}@${version}/modules/${moduleName}`, {
            headers: apiHeaders(),
            params: { format: 'json' },
        })
    );
    if (res?.data?.appModule) return res.data.appModule as ApiModuleDetail;
    if (res?.data?.name) return res.data as ApiModuleDetail;
    return null;
}

// ── Main rebuild ─────────────────────────────────────────────────────────────

export interface ApiScrapeResult {
    discovered: number;
    inserted: number;
    failed: number;
    durationMs: number;
}

export async function scrapeFromMakeApiAndRebuild(db: MakeDatabase): Promise<ApiScrapeResult> {
    const start = Date.now();

    if (!API_KEY || API_KEY === 'your_api_key_here') {
        throw new Error('MAKE_API_KEY not set. Cannot perform API-driven rebuild.');
    }

    // Ensure DB schema has all required columns
    db.addMissingColumns();

    // ── Phase 00: Connectivity + endpoint availability check ──────────────
    console.log('\nPhase 00: Testing API connectivity...');

    // Step 1: Verify the API key is valid
    try {
        const testResp = await axios.get(`${BASE_URL}/users/me`, {
            headers: apiHeaders(),
            timeout: 10_000,
        });
        const user = testResp.data?.user || testResp.data;
        const email = user?.email || '(unknown)';
        console.log(`✅ API key valid. Authenticated as: ${email}`);
    } catch (err: any) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || 'unknown error';
        console.error(`❌ Auth check failed: HTTP ${status ?? 'N/A'} — ${msg}`);
        console.error(`   URL: ${BASE_URL}/users/me`);
        console.error(`   Key: ${API_KEY ? API_KEY.slice(0, 8) + '...' : '(not set)'}`);
        console.error(`   Org: ${ORG_ID || '(not set)'}`);
        if (status === 401) console.error('   → Invalid or expired API key.');
        if (status === 403) console.error('   → Key valid but lacks required permissions.');
        process.exit(1);
    }

    // Step 2: Check whether the module-list endpoint exists (Make does NOT expose this publicly)
    try {
        await axios.get(`${BASE_URL}/apps/google-sheets@2/modules`, {
            headers: apiHeaders(),
            timeout: 8_000,
        });
        console.log('✅ Module-list endpoint available. Proceeding with API rebuild.\n');
    } catch (err: any) {
        const status = err?.response?.status;
        if (status === 404) {
            console.error('');
            console.error('⚠️  Make.com does not expose the app module catalog via the public API.');
            console.error(`   Tested: ${BASE_URL}/apps/google-sheets@2/modules → HTTP 404`);
            console.error('');
            console.error('   The /apps/{name}@{version}/modules endpoints are internal to Make.com');
            console.error('   and are not available to regular user API keys.');
            console.error('');
            console.error('   The static catalog (npm run scrape) is the correct approach.');
            console.error('   Use npm run scrape to rebuild from the hand-maintained module list.');
            process.exit(1);
        }
        // Non-404 error (network, 401, etc.) — still fail with details
        const msg = err?.response?.data?.message || err?.message || 'unknown error';
        console.error(`❌ Module endpoint probe failed: HTTP ${status ?? 'N/A'} — ${msg}`);
        process.exit(1);
    }

    // ── Phase 0: App Discovery ────────────────────────────────────────────
    console.log('\nPhase 0: Discovering app slugs...');
    const appVersionMap = appSlugsFromCatalog();
    console.log(`  ${appVersionMap.size} apps from local catalog`);

    const apiApps = await discoverAppsFromApi();
    let additionalCount = 0;
    for (const slug of apiApps) {
        if (!appVersionMap.has(slug)) {
            appVersionMap.set(slug, 2);
            additionalCount++;
        }
    }
    if (additionalCount > 0) {
        console.log(`  +${additionalCount} additional apps from Make /apps endpoint`);
    }
    console.log(`  Total: ${appVersionMap.size} unique apps to process`);

    // ── Phase A + B: List and detail each app ─────────────────────────────
    console.log('\nPhase A+B: Fetching module lists and details...');

    const allModules: any[] = [];
    let failedApps = 0;

    const appEntries = Array.from(appVersionMap.entries());
    for (const [appSlug, preferredVersion] of appEntries) {
        const listResult = await fetchModuleList(appSlug, preferredVersion);
        if (!listResult) {
            failedApps++;
            if (failedApps === 1) {
                console.error(`  ✗ First failed app: ${appSlug}@${preferredVersion}`);
                console.error(`    URL tried: ${BASE_URL}/apps/${appSlug}@${preferredVersion}/modules`);
                console.error(`    API Key:   ${API_KEY ? API_KEY.slice(0, 8) + '...' : '(not set)'}`);
                console.error(`    Org ID:    ${ORG_ID || '(not set)'}`);
            }
            continue;
        }

        const { modules: moduleList, version: workingVersion } = listResult;
        const appLabel = slugToLabel(appSlug);
        let appModuleCount = 0;

        for (const entry of moduleList) {
            const detail = await fetchModuleDetail(appSlug, workingVersion, entry.name);

            // Use full `expect` as parameter schema (richer than `parameters`)
            const parameterSchema = detail?.expect ?? detail?.parameters ?? [];
            const outputFields = (detail?.interface ?? []).map((f) => ({
                name: f.name,
                type: f.type,
                label: f.label || f.name,
            }));
            const connectionType = extractConnectionType(detail?.parameters);
            const scope = detail?.scope && detail.scope.length > 0 ? detail.scope : undefined;
            const isDeprecated = Boolean(detail?.deprecated ?? entry.deprecated);
            const listener = Boolean(detail?.listener ?? entry.listener ?? false);
            const returnsMultiple = Boolean(detail?._annotations?.returnsMultipleBundles ?? false);
            const moduleType = typeFromIds(
                entry.typeId,
                detail?._annotations?.moduleType
            );

            allModules.push({
                id: `${appSlug}:${entry.name}`,
                name: detail?.label || entry.label || entry.name,
                app: appLabel,
                type: moduleType,
                description: detail?.description || entry.description || detail?.label || entry.label || entry.name,
                parameters: parameterSchema,
                examples: [],
                documentation: '',
                output_fields: outputFields.length > 0 ? outputFields : undefined,
                connection_type: connectionType,
                is_deprecated: isDeprecated,
                scope,
                listener,
                returns_multiple: returnsMultiple,
                app_version: workingVersion,
            });

            appModuleCount++;
        }

        console.log(`  ✓ ${appSlug}@${workingVersion}: ${appModuleCount} modules`);
    }

    // ── Phase C: Rebuild DB ───────────────────────────────────────────────
    console.log(`\nPhase C: Rebuilding modules table with ${allModules.length} modules...`);
    db.truncateModules();

    let inserted = 0;
    let failed = 0;

    db.runInTransaction(() => {
        for (const mod of allModules) {
            try {
                db.insertModule(mod);
                inserted++;
            } catch (err: any) {
                console.error(`  ✗ ${mod.id}: ${err.message}`);
                failed++;
            }
        }
    });

    const durationMs = Date.now() - start;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.floor((durationMs % 60_000) / 1000);

    console.log('\n── API rebuild complete ─────────────────────────────────');
    console.log(`  Apps discovered:  ${appVersionMap.size}`);
    console.log(`  Apps failed:      ${failedApps}`);
    console.log(`  Modules fetched:  ${allModules.length}`);
    console.log(`  Modules inserted: ${inserted}`);
    console.log(`  Modules failed:   ${failed}`);
    console.log(`  Duration:         ${minutes}m ${seconds}s`);
    console.log('─────────────────────────────────────────────────────────');

    return { discovered: allModules.length, inserted, failed, durationMs };
}

// ── Standalone entry point ───────────────────────────────────────────────────

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isMain) {
    const db = new MakeDatabase();
    scrapeFromMakeApiAndRebuild(db)
        .then(() => db.close())
        .catch((err) => {
            console.error('Fatal error:', err.message);
            process.exit(1);
        });
}
