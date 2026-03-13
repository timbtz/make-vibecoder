import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve paths relative to the package root (works with npx, global install, local)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From src/database/ or dist/database/ → package root
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Resolve the database path.
 *  - Explicit path → use as-is
 *  - Default       → <packageRoot>/data/make-modules.db
 */
function resolveDbPath(dbPath?: string): string {
    if (dbPath && dbPath !== './data/make-modules.db') {
        return path.resolve(dbPath);
    }
    return path.join(PACKAGE_ROOT, 'data', 'make-modules.db');
}

/**
 * Locate schema.sql — check src/ first (dev), then fall back to dist/ (npm package).
 */
function resolveSchemaPath(): string {
    const srcPath = path.join(PACKAGE_ROOT, 'src', 'database', 'schema.sql');
    if (fs.existsSync(srcPath)) return srcPath;

    // Bundled fallback: schema.sql shipped alongside compiled JS
    const distPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(distPath)) return distPath;

    throw new Error(
        `schema.sql not found. Searched:\n  - ${srcPath}\n  - ${distPath}`
    );
}

function escapeLike(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class MakeDatabase {
    private db: Database.Database;

    // Cached prepared statements for hot-path read queries
    private stmtGetModule!: Database.Statement;
    private stmtGetTemplate!: Database.Statement;
    private stmtGetModuleExamples!: Database.Statement;

    // In-memory TTL cache for hot reads
    private readonly readCache = new Map<string, { value: any; expiresAt: number }>();
    private readonly READ_CACHE_TTL_MS = 60_000; // 1 minute

    constructor(dbPath?: string) {
        const resolved = resolveDbPath(dbPath);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(resolved);
        this.db.pragma('journal_mode = WAL');
        this.initializeSchema();
    }

    private initializeSchema() {
        const schemaPath = resolveSchemaPath();
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);

        // Pre-compile prepared statements for hot-path reads
        this.stmtGetModule = this.db.prepare('SELECT * FROM modules WHERE id = ?');
        this.stmtGetTemplate = this.db.prepare('SELECT * FROM templates WHERE id = ?');
        this.stmtGetModuleExamples = this.db.prepare(
            'SELECT * FROM examples WHERE module_id = ? ORDER BY id DESC LIMIT ?'
        );
    }

    // ── TTL cache helpers ──────────────────────────────────────────────────────

    private cacheGet(key: string): any | undefined {
        const entry = this.readCache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.readCache.delete(key);
            return undefined;
        }
        return entry.value;
    }

    private cacheSet(key: string, value: any): void {
        this.readCache.set(key, { value, expiresAt: Date.now() + this.READ_CACHE_TTL_MS });
    }

    searchModules(query: string, app?: string): any[] {
        // Handle "list all" wildcard case
        if (query === '*') {
            let sql = 'SELECT * FROM modules';
            const params: any[] = [];
            if (app) {
                sql += ' WHERE app = ?';
                params.push(app);
            }
            sql += ' ORDER BY app, name LIMIT 1000';
            return this.db.prepare(sql).all(...params);
        }

        // Use FTS5 search with the standalone FTS table.
        // Phrase-quote each token to prevent FTS operator injection (e.g. "slack*" or "-name").
        const ftsModulesQuery = query.trim().split(/\s+/)
            .map(token => `"${token.replace(/"/g, '')}"`)
            .join(' OR ');
        let sql = `
            SELECT m.* FROM modules m
            WHERE m.id IN (
                SELECT module_id FROM modules_fts WHERE modules_fts MATCH ?
            )
        `;
        const params: any[] = [ftsModulesQuery];

        if (app) {
            sql += ' AND m.app = ?';
            params.push(app);
        }

        sql += ' LIMIT 20';
        return this.db.prepare(sql).all(...params);
    }

    getModule(moduleId: string): any {
        const cached = this.cacheGet(`module:${moduleId}`);
        if (cached !== undefined) return cached;
        const result = this.stmtGetModule.get(moduleId);
        if (result) this.cacheSet(`module:${moduleId}`, result);
        return result;
    }

    getModuleExamples(moduleId: string, limit: number = 5): any[] {
        return this.stmtGetModuleExamples.all(moduleId, limit);
    }

    insertModule(module: any) {
        // Use INSERT OR REPLACE so re-runs don't fail
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO modules (id, name, app, type, description, parameters, examples, documentation, output_fields, connection_type, is_deprecated, scope, listener, returns_multiple, app_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            module.id,
            module.name,
            module.app,
            module.type,
            module.description,
            JSON.stringify(module.parameters),
            JSON.stringify(module.examples || []),
            module.documentation || '',
            module.output_fields ? JSON.stringify(module.output_fields) : null,
            module.connection_type || null,
            module.is_deprecated ? 1 : 0,
            module.scope ? JSON.stringify(module.scope) : null,
            module.listener ? 1 : 0,
            module.returns_multiple ? 1 : 0,
            module.app_version ?? 1
        );

        // Delete old FTS entry if exists, then insert new one
        this.db.prepare('DELETE FROM modules_fts WHERE module_id = ?').run(module.id);
        this.db.prepare('INSERT INTO modules_fts(module_id, name, app, description) VALUES (?, ?, ?, ?)').run(
            module.id,
            module.name,
            module.app,
            module.description
        );
        // Invalidate read cache so subsequent getModule() sees the new data
        this.readCache.delete(`module:${module.id}`);
    }

    /**
     * Update only the API-sourced enrichment fields on an existing module.
     * Does NOT overwrite parameters/examples/documentation.
     */
    enrichModule(moduleId: string, enrichment: {
        output_fields?: any[];
        connection_type?: string;
        is_deprecated?: boolean;
        scope?: string[];
        listener?: boolean;
        returns_multiple?: boolean;
        app_version?: number;
    }) {
        this.db.prepare(`
            UPDATE modules SET
                output_fields = COALESCE(?, output_fields),
                connection_type = COALESCE(?, connection_type),
                is_deprecated = COALESCE(?, is_deprecated),
                scope = COALESCE(?, scope),
                listener = COALESCE(?, listener),
                returns_multiple = COALESCE(?, returns_multiple),
                app_version = COALESCE(?, app_version)
            WHERE id = ?
        `).run(
            enrichment.output_fields ? JSON.stringify(enrichment.output_fields) : null,
            enrichment.connection_type || null,
            enrichment.is_deprecated != null ? (enrichment.is_deprecated ? 1 : 0) : null,
            enrichment.scope ? JSON.stringify(enrichment.scope) : null,
            enrichment.listener != null ? (enrichment.listener ? 1 : 0) : null,
            enrichment.returns_multiple != null ? (enrichment.returns_multiple ? 1 : 0) : null,
            enrichment.app_version ?? null,
            moduleId
        );
        this.readCache.delete(`module:${moduleId}`);
    }

    insertModules(modules: any[]) {
        const insertMany = this.db.transaction((mods: any[]) => {
            for (const mod of mods) {
                this.insertModule(mod);
            }
        });
        insertMany(modules);
    }

    searchTemplates(query?: string, category?: string, difficulty?: string): any[] {
        let sql: string;
        const params: any[] = [];

        if (query) {
            // Use FTS5 MATCH for full-text search.
            // Phrase-quote each token to prevent FTS operator injection; join with OR.
            const ftsQuery = query.trim().split(/\s+/)
                .map(token => `"${token.replace(/"/g, '')}"`)
                .join(' OR ');
            sql = `SELECT t.* FROM templates t
                   WHERE t.id IN (SELECT template_id FROM templates_fts WHERE templates_fts MATCH ?)`;
            params.push(ftsQuery);

            if (category) {
                sql += ' AND t.category = ?';
                params.push(category);
            }

            if (difficulty) {
                sql += ' AND t.difficulty = ?';
                params.push(difficulty);
            }
        } else {
            // No query — filter only by category/difficulty using indexed columns
            sql = 'SELECT * FROM templates WHERE 1=1';

            if (category) {
                sql += ' AND category = ?';
                params.push(category);
            }

            if (difficulty) {
                sql += ' AND difficulty = ?';
                params.push(difficulty);
            }
        }

        sql += ' ORDER BY difficulty ASC LIMIT 50';
        return this.db.prepare(sql).all(...params);
    }

    getTemplate(templateId: string): any {
        const cached = this.cacheGet(`template:${templateId}`);
        if (cached !== undefined) return cached;
        const result = this.stmtGetTemplate.get(templateId);
        if (result) this.cacheSet(`template:${templateId}`, result);
        return result;
    }

    insertExample(moduleId: string, config: Record<string, any>, source: string) {
        this.db.prepare(
            'INSERT INTO examples (module_id, config, source) VALUES (?, ?, ?)'
        ).run(moduleId, JSON.stringify(config), source);
    }

    clearExamples() {
        this.db.prepare('DELETE FROM examples').run();
    }

    runInTransaction(fn: () => void) {
        this.db.transaction(fn)();
    }

    insertTemplate(template: any) {
        const modulesUsedJson = JSON.stringify(template.modules_used || []);

        this.db.prepare(`
            INSERT OR REPLACE INTO templates (id, name, description, blueprint, modules_used, category, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            template.id,
            template.name,
            template.description,
            JSON.stringify(template.blueprint),
            modulesUsedJson,
            template.category || 'general',
            template.difficulty || 'beginner'
        );

        // Keep templates_fts in sync with the templates table
        this.db.prepare('DELETE FROM templates_fts WHERE template_id = ?').run(template.id);
        this.db.prepare(
            'INSERT INTO templates_fts(template_id, name, description, modules_used) VALUES (?, ?, ?, ?)'
        ).run(template.id, template.name, template.description, modulesUsedJson);
        // Invalidate read cache so subsequent getTemplate() sees the new data
        this.readCache.delete(`template:${template.id}`);
    }

    /**
     * Add any new columns to the modules table that may be missing from an existing DB.
     * SQLite does not support multi-column ALTER TABLE, so each column is added individually.
     * This is idempotent — safe to call on every scraper run.
     */
    addMissingColumns() {
        const cols = this.db.prepare('PRAGMA table_info(modules)').all() as any[];
        const colNames = new Set(cols.map((c) => c.name));

        const newCols: [string, string][] = [
            ['output_fields', 'TEXT'],
            ['connection_type', 'TEXT'],
            ['is_deprecated', 'INTEGER DEFAULT 0'],
            ['scope', 'TEXT'],
            ['listener', 'INTEGER DEFAULT 0'],
            ['returns_multiple', 'INTEGER DEFAULT 0'],
            ['app_version', 'INTEGER DEFAULT 1'],
        ];

        for (const [col, def] of newCols) {
            if (!colNames.has(col)) {
                this.db.exec(`ALTER TABLE modules ADD COLUMN ${col} ${def}`);
                console.log(`  Added column: ${col}`);
            }
        }
    }

    /**
     * Wipe the modules table and its FTS shadow for a full rebuild.
     */
    truncateModules() {
        this.db.prepare('DELETE FROM modules').run();
        this.db.prepare('DELETE FROM modules_fts').run();
        this.readCache.clear();
    }

    close() {
        this.db.close();
    }
}
