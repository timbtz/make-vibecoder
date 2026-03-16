#!/usr/bin/env tsx
/**
 * merge-schemas.ts — CLI helper to merge discovered module schemas into official-mcp-schemas.json
 *
 * Usage:
 *   tsx src/scrapers/merge-schemas.ts '{"slack:ActionPostMessage": { ... }}'
 *   tsx src/scrapers/merge-schemas.ts --file /tmp/discovered-schema.json
 *
 * Behavior:
 *   - Deep-merges new entries into official-mcp-schemas.json
 *   - Existing entries: parameters array is merged (new params added, existing kept by name)
 *   - New entries: added wholesale
 *   - Writes back to disk with 2-space indent
 *   - Prints summary: N entries updated, N added
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMAS_PATH = path.resolve(__dirname, '../../data/official-mcp-schemas.json');

interface ModuleSchema {
    name?: string;
    description?: string;
    type?: string;
    app?: string;
    connection_type?: string;
    parameters?: Array<{ name: string; [key: string]: any }>;
    output_fields?: Array<{ name: string; [key: string]: any }>;
    [key: string]: any;
}

interface SchemasFile {
    [moduleId: string]: ModuleSchema;
}

function mergeParameters(
    existing: Array<{ name: string; [key: string]: any }>,
    incoming: Array<{ name: string; [key: string]: any }>
): Array<{ name: string; [key: string]: any }> {
    const byName = new Map(existing.map((p) => [p.name, { ...p }]));
    for (const param of incoming) {
        if (byName.has(param.name)) {
            // Merge: incoming overrides existing fields
            byName.set(param.name, { ...byName.get(param.name)!, ...param });
        } else {
            byName.set(param.name, param);
        }
    }
    return Array.from(byName.values());
}

function mergeOutputFields(
    existing: Array<{ name: string; [key: string]: any }>,
    incoming: Array<{ name: string; [key: string]: any }>
): Array<{ name: string; [key: string]: any }> {
    const byName = new Map(existing.map((f) => [f.name, { ...f }]));
    for (const field of incoming) {
        byName.set(field.name, { ...byName.get(field.name), ...field });
    }
    return Array.from(byName.values());
}

function mergeSchemas(existing: SchemasFile, incoming: SchemasFile): { added: number; updated: number } {
    let added = 0;
    let updated = 0;

    for (const [moduleId, schema] of Object.entries(incoming)) {
        if (!existing[moduleId]) {
            existing[moduleId] = schema;
            added++;
        } else {
            const target = existing[moduleId];
            let changed = false;

            // Merge top-level scalar fields (incoming wins)
            for (const key of ['name', 'description', 'type', 'app', 'connection_type'] as const) {
                if (schema[key] !== undefined && schema[key] !== target[key]) {
                    (target as any)[key] = schema[key];
                    changed = true;
                }
            }

            // Merge parameters array
            if (schema.parameters && schema.parameters.length > 0) {
                const existingParams = target.parameters || [];
                target.parameters = mergeParameters(existingParams, schema.parameters);
                changed = true;
            }

            // Merge output_fields array
            if (schema.output_fields && schema.output_fields.length > 0) {
                const existingFields = target.output_fields || [];
                target.output_fields = mergeOutputFields(existingFields, schema.output_fields);
                changed = true;
            }

            if (changed) updated++;
        }
    }

    return { added, updated };
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage:');
        console.error('  tsx src/scrapers/merge-schemas.ts \'{"moduleId": {...}}\'');
        console.error('  tsx src/scrapers/merge-schemas.ts --file /tmp/discovered.json');
        process.exit(1);
    }

    let incomingJson: string;

    if (args[0] === '--file') {
        const filePath = args[1];
        if (!filePath) {
            console.error('Error: --file requires a path argument');
            process.exit(1);
        }
        if (!fs.existsSync(filePath)) {
            console.error(`Error: File not found: ${filePath}`);
            process.exit(1);
        }
        incomingJson = fs.readFileSync(filePath, 'utf-8');
    } else {
        incomingJson = args[0]!;
    }

    let incoming: SchemasFile;
    try {
        incoming = JSON.parse(incomingJson);
    } catch (e: any) {
        console.error(`Error: Invalid JSON — ${e.message}`);
        process.exit(1);
    }

    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
        console.error('Error: Input must be a JSON object mapping moduleId → schema');
        process.exit(1);
    }

    // Load existing schemas
    let existing: SchemasFile = {};
    if (fs.existsSync(SCHEMAS_PATH)) {
        try {
            existing = JSON.parse(fs.readFileSync(SCHEMAS_PATH, 'utf-8'));
        } catch (e: any) {
            console.error(`Error: Could not parse ${SCHEMAS_PATH} — ${e.message}`);
            process.exit(1);
        }
    } else {
        console.warn(`Warning: ${SCHEMAS_PATH} not found — will create it`);
    }

    const { added, updated } = mergeSchemas(existing, incoming);

    // Write back
    fs.writeFileSync(SCHEMAS_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf-8');

    const totalIncoming = Object.keys(incoming).length;
    const unchanged = totalIncoming - added - updated;
    console.log(`✓ Merged ${totalIncoming} module(s) into official-mcp-schemas.json`);
    console.log(`  Added:     ${added}`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    console.log('');
    console.log('Next step: run `npm run scrape` to apply changes to the SQLite database.');
}

main();
