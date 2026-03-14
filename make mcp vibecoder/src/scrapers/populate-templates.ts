/**
 * Blueprint Template Populator
 *
 * Loads real Make.com blueprint JSON files into the templates database.
 * This enables the search_templates and get_template MCP tools to return
 * complete, ready-to-deploy blueprint JSON.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MakeDatabase } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CATEGORIZATION
// ============================================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'ai': ['chatgpt', 'openai', 'claude', 'anthropic', 'gpt', 'ai', 'llm', 'gemini', 'perplexity', 'deepseek', 'whisper', 'dalle', 'leonardo', 'sentiment', 'summarize', 'summarise', 'scraping', 'browseract', 'browser act'],
    'crm': ['salesforce', 'hubspot', 'pipedrive', 'zoho crm', 'attio', 'salesflare', 'copper', 'lead', 'contact', 'deal', 'opportunity', 'prospect', 'crm'],
    'ecommerce': ['shopify', 'woocommerce', 'stripe', 'payment', 'order', 'product', 'customer', 'invoice', 'quickbooks', 'bigcommerce', 'magento', 'etsy', 'simvoly'],
    'marketing': ['mailchimp', 'activecampaign', 'getresponse', 'sendinblue', 'klicktipp', 'email marketing', 'newsletter', 'campaign', 'emercury', 'buffer', 'hootsuite'],
    'social-media': ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube', 'social media', 'social', 'vk', 'post'],
    'communication': ['slack', 'telegram', 'discord', 'whatsapp', 'sms', 'twilio', 'vonage', 'email', 'gmail', 'notification', 'message', 'teams'],
    'project-management': ['asana', 'trello', 'clickup', 'notion', 'jira', 'monday', 'basecamp', 'wrike', 'task', 'project'],
    'data': ['google sheets', 'airtable', 'excel', 'postgresql', 'mysql', 'mongodb', 'database', 'spreadsheet', 'data store'],
    'file-management': ['google drive', 'dropbox', 'onedrive', 'box', 'egnyte', 'file', 'document', 'pdf', 'upload'],
    'automation': ['webhook', 'http', 'api', 'router', 'repeater', 'iterator', 'aggregator', 'flow'],
    'analytics': ['google analytics', 'mixpanel', 'facebook ads', 'google ads', 'linkedin ads', 'insights', 'reporting', 'stats', 'performance'],
    'hr': ['performance', 'employee', 'hr', 'human resources', 'onboarding', 'payroll'],
};

function categorize(name: string, modules: string[]): string {
    const nameLower = name.toLowerCase();
    const moduleStr = modules.join(' ').toLowerCase();
    const combined = nameLower + ' ' + moduleStr;

    // Score each category
    const scores: Record<string, number> = {};
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        scores[cat] = keywords.filter(kw => combined.includes(kw)).length;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return (best[0] && best[0][1] > 0) ? (best[0][0] ?? 'automation') : 'automation';
}

function getDifficulty(moduleCount: number): 'beginner' | 'intermediate' | 'advanced' {
    if (moduleCount <= 3) return 'beginner';
    if (moduleCount <= 6) return 'intermediate';
    return 'advanced';
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}

function getDescription(blueprint: any, name: string): string {
    // Try to get description from blueprint metadata
    if (blueprint.metadata?.scenario?.description) {
        return blueprint.metadata.scenario.description;
    }

    // Auto-generate from flow modules
    const modules = (blueprint.flow || [])
        .map((m: any) => m.module)
        .filter((m: string) => m && !m.startsWith('builtin:') && !m.startsWith('util:') && !m.startsWith('regexp:'));

    if (modules.length === 0) return `Automation: ${name}`;

    const apps = [...new Set(modules.map((m: string) => m.split(':')[0]))];
    const appList = apps.slice(0, 3).join(', ');
    return `Automate workflows between ${appList}${apps.length > 3 ? ` and ${apps.length - 3} more` : ''}`;
}

// ============================================================================
// BLUEPRINT FOLDERS TO SCAN
// ============================================================================

function getBlueprintFolders(): string[] {
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const folders = [
        path.join(projectRoot, 'Make example Blueprints'),
        path.join(projectRoot, 'Make example flows'),
        path.join(projectRoot, 'Make example flows 1'),
        path.join(projectRoot, 'Make example flows 2'),
    ];
    return folders.filter(f => fs.existsSync(f));
}

// ============================================================================
// MAIN POPULATOR
// ============================================================================

export function populateTemplates(db: MakeDatabase): { inserted: number; errors: number } {
    const folders = getBlueprintFolders();

    if (folders.length === 0) {
        console.log('  ⚠️  No blueprint folders found, skipping template population');
        return { inserted: 0, errors: 0 };
    }

    let inserted = 0;
    let errors = 0;
    const seen = new Set<string>();

    for (const folder of folders) {
        const folderName = path.basename(folder);
        const files = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
        console.log(`  📂 Loading ${files.length} blueprints from "${folderName}"...`);

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(folder, file), 'utf-8');
                const blueprint = JSON.parse(content);

                const name = blueprint.name || file.replace('.blueprint.json', '').replace('.json', '');

                // Extract modules
                const modulesUsed = (blueprint.flow || [])
                    .map((m: any) => m.module)
                    .filter((m: string) => m && m.includes(':'));

                const uniqueModules = [...new Set(modulesUsed)] as string[];
                const category = categorize(name, uniqueModules);
                const difficulty = getDifficulty(uniqueModules.length);
                const description = getDescription(blueprint, name);

                // Generate unique ID from name (handle duplicates)
                const baseId = slugify(name);
                let id = baseId;
                let counter = 1;
                while (seen.has(id)) {
                    id = `${baseId}-${counter++}`;
                }
                seen.add(id);

                db.insertTemplate({
                    id,
                    name,
                    description,
                    blueprint,
                    modules_used: uniqueModules,
                    category,
                    difficulty,
                });

                inserted++;
            } catch (e) {
                errors++;
                console.warn(`⚠️  Skipping ${file}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    return { inserted, errors };
}

// ============================================================================
// STANDALONE RUN
// ============================================================================

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isMain) {
    const db = new MakeDatabase();
    console.log('🔄 Populating blueprint templates...\n');
    const result = await populateTemplates(db);
    console.log(`\n✅ Templates inserted: ${result.inserted}`);
    if (result.errors > 0) console.log(`⚠️  Errors: ${result.errors}`);
    db.close();
}
