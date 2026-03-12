import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { MakeDatabase } from '../database/db.js';
import { populateTemplates } from './populate-templates.js';
import { populateExamples } from './populate-examples.js';

interface MakeModule {
    id: string;
    name: string;
    app: string;
    type: 'trigger' | 'action' | 'search';
    description: string;
    parameters: any[];
    documentation?: string;
}

// Helper to define a module concisely
function m(id: string, name: string, app: string, type: 'trigger' | 'action' | 'search', description: string, parameters: any[], documentation?: string): MakeModule {
    const mod: MakeModule = { id, name, app, type, description, parameters };
    if (documentation !== undefined) mod.documentation = documentation;
    return mod;
}

// Helper to define a parameter concisely
function p(name: string, type: string, required: boolean, description: string, extra?: Record<string, any>) {
    return { name, type, required, description, ...extra };
}

export class ModuleScraper {
    private db: MakeDatabase;

    constructor() {
        this.db = new MakeDatabase();
    }

    async scrapeFromMakeAPI(): Promise<MakeModule[]> {
        const apiKey = process.env.MAKE_API_KEY;
        if (!apiKey || apiKey === 'your_api_key_here') {
            console.log('No valid MAKE_API_KEY set, using built-in module catalog');
            return this.getModuleCatalog();
        }

        try {
            const baseUrl = process.env.MAKE_API_URL || 'https://eu1.make.com/api/v2';
            const response = await axios.get(`${baseUrl}/modules`, {
                headers: { 'Authorization': `Token ${apiKey}` }
            });
            return response.data.modules;
        } catch (error) {
            console.log('Make API modules endpoint not available, using built-in catalog');
            return this.getModuleCatalog();
        }
    }

    private getModuleCatalog(): MakeModule[] {
        return [
            // ═══════════════════════════════════════
            // WEBHOOKS (2 modules)
            // ═══════════════════════════════════════
            m('gateway:CustomWebHook', 'Custom Webhook', 'Webhooks', 'trigger',
                'Receive data via a custom webhook URL. Starts the scenario when data is sent to the webhook endpoint via HTTP POST.',
                [p('name', 'text', true, 'Webhook name'), p('dataStructure', 'select', false, 'Expected data structure for type-safe mapping')],
                '## Custom Webhook\nTrigger a scenario via HTTP POST to a unique webhook URL.\n\n### Usage\n1. Create the webhook in Make\n2. Copy the webhook URL\n3. Send POST/GET requests with data to that URL\n\n### Tips\n- Define a data structure for proper field mapping\n- Webhooks timeout after 30s if no response is sent'),
            m('gateway:WebhookRespond', 'Webhook Response', 'Webhooks', 'action',
                'Send a custom HTTP response back to the webhook caller with status code, headers, and body. Must be paired with a Custom Webhook trigger.',
                [p('status', 'number', true, 'HTTP status code (e.g., 200, 201, 400)', { default: 200 }), p('body', 'text', true, 'Response body (text, JSON, or HTML)'), p('headers', 'array', false, 'Custom response headers as key-value pairs')]),

            // ═══════════════════════════════════════
            // HTTP (4 modules)
            // ═══════════════════════════════════════
            m('http:ActionSendData', 'Make a Request', 'HTTP', 'action',
                'Make HTTP requests to any URL or API endpoint. Supports all HTTP methods, custom headers, query strings, and request body. The universal connector for any API.',
                [p('method', 'select', true, 'HTTP method', { options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] }), p('url', 'url', true, 'Request URL'), p('headers', 'array', false, 'Request headers as key-value pairs'), p('queryString', 'array', false, 'Query string parameters'), p('body', 'text', false, 'Request body'), p('bodyType', 'select', false, 'Content type', { options: ['Raw', 'application/x-www-form-urlencoded', 'multipart/form-data'] }), p('parseResponse', 'boolean', false, 'Automatically parse response JSON/XML', { default: true }), p('timeout', 'number', false, 'Request timeout in seconds')],
                '## HTTP Request\nThe universal connector for any REST API.\n\n### Common Use Cases\n- Calling REST APIs without a dedicated Make app\n- Sending data to third-party services\n- Fetching external data\n- Integrating with internal company APIs'),
            m('http:ActionGetFile', 'Get a File', 'HTTP', 'action',
                'Download a file from a URL. Returns the file as binary data for use in subsequent modules like Google Drive Upload or Email Attachment.',
                [p('url', 'url', true, 'File URL to download'), p('shareDrive', 'boolean', false, 'Evaluate Google Drive shared links')]),
            m('http:ActionSendDataBasicAuth', 'Make a Basic Auth Request', 'HTTP', 'action',
                'Make an HTTP request with Basic Authentication (username/password) to APIs that require basic auth credentials.',
                [p('method', 'select', true, 'HTTP method', { options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }), p('url', 'url', true, 'Request URL'), p('username', 'text', true, 'Basic auth username'), p('password', 'text', true, 'Basic auth password'), p('headers', 'array', false, 'Request headers'), p('body', 'text', false, 'Request body')]),
            m('http:ActionRetrieveHeaders', 'Retrieve Headers', 'HTTP', 'action',
                'Retrieve HTTP headers from a URL without downloading the body. Useful for checking content types, file sizes, or redirect locations.',
                [p('url', 'url', true, 'URL to check'), p('method', 'select', false, 'HTTP method', { options: ['HEAD', 'GET'], default: 'HEAD' })]),

            // ═══════════════════════════════════════
            // JSON (3 modules)
            // ═══════════════════════════════════════
            m('json:ParseJSON', 'Parse JSON', 'JSON', 'action',
                'Parse a JSON string into structured data that can be mapped in subsequent modules. Essential for processing API responses.',
                [p('json', 'text', true, 'JSON string to parse'), p('dataStructure', 'select', false, 'Expected data structure for type-safe mapping')]),
            m('json:TransformToJSON', 'Create JSON', 'JSON', 'action',
                'Create a JSON string from mapped data fields. Use for building API request bodies.',
                [p('dataStructure', 'select', true, 'Data structure to serialize into JSON')]),
            m('json:AggregateToJSON', 'Aggregate to JSON', 'JSON', 'action',
                'Aggregate multiple bundles into a single JSON array string. Combines multiple items into one JSON output.',
                [p('sourceModule', 'select', true, 'Module whose output to aggregate'), p('dataStructure', 'select', false, 'Structure for each item')]),

            // ═══════════════════════════════════════
            // GOOGLE SHEETS (14 modules — real: 27 total)
            // ═══════════════════════════════════════
            m('google-sheets:ActionAddRow', 'Add a Row', 'Google Sheets', 'action',
                'Appends a new row to the bottom of a Google Sheets spreadsheet table.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID or URL'), p('sheetName', 'text', true, 'Sheet/tab name'), p('values', 'array', true, 'Row values to add'), p('tableContainsHeaders', 'boolean', false, 'Whether first row contains headers', { default: true })]),
            m('google-sheets:ActionUpdateRow', 'Update a Row', 'Google Sheets', 'action',
                'Update an existing row in a Google Sheets spreadsheet by row number.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('rowNumber', 'number', true, 'Row number to update'), p('values', 'array', true, 'New values for the row')]),
            m('google-sheets:ActionDeleteRow', 'Delete a Row', 'Google Sheets', 'action',
                'Deletes a specific row from a Google Sheets spreadsheet by row number.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('rowNumber', 'number', true, 'Row number to delete')]),
            m('google-sheets:ActionClearRow', 'Clear a Row', 'Google Sheets', 'action',
                'Clears values from a specific row without deleting the row itself.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('rowNumber', 'number', true, 'Row number to clear')]),
            m('google-sheets:ActionClearCell', 'Clear a Cell', 'Google Sheets', 'action',
                'Clears a specific cell in a Google Sheets spreadsheet.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('cell', 'text', true, 'Cell reference (e.g., A1, B5)')]),
            m('google-sheets:ActionBulkAddRows', 'Bulk Add Rows', 'Google Sheets', 'action',
                'Appends multiple rows to the bottom of a spreadsheet table in a single operation.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('values', 'array', true, 'Array of row arrays to add')]),
            m('google-sheets:ActionBulkUpdateRows', 'Bulk Update Rows', 'Google Sheets', 'action',
                'Updates multiple rows at once. More efficient than updating rows one at a time.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('rows', 'array', true, 'Array of {rowNumber, values} objects')]),
            m('google-sheets:ActionClearRange', 'Clear Values from a Range', 'Google Sheets', 'action',
                'Clears a specified range of values from a spreadsheet.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('range', 'text', true, 'Range in A1 notation (e.g., Sheet1!A1:D10)')]),
            m('google-sheets:ActionAddSheet', 'Add a Sheet', 'Google Sheets', 'action',
                'Adds a new sheet/tab to an existing spreadsheet.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('title', 'text', true, 'New sheet name')]),
            m('google-sheets:ActionCopySheet', 'Copy a Sheet', 'Google Sheets', 'action',
                'Copies a sheet to another spreadsheet.',
                [p('sourceSpreadsheetId', 'text', true, 'Source spreadsheet ID'), p('sourceSheetId', 'number', true, 'Source sheet ID'), p('destinationSpreadsheetId', 'text', true, 'Destination spreadsheet ID')]),
            m('google-sheets:ActionAddConditionalFormat', 'Add a Conditional Format Rule', 'Google Sheets', 'action',
                'Creates a new conditional format rule at a given index. All subsequent rules indexes are incremented.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetId', 'number', true, 'Sheet ID'), p('range', 'text', true, 'Cell range'), p('type', 'select', true, 'Condition type')]),
            m('google-sheets:TriggerWatchRows', 'Watch Rows', 'Google Sheets', 'trigger',
                'Trigger when new rows are added to a Google Sheets spreadsheet. Detects new data automatically.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('tableContainsHeaders', 'boolean', false, 'Whether first row contains headers', { default: true }), p('limit', 'number', false, 'Max rows to return per run')]),
            m('google-sheets:TriggerWatchChanges', 'Watch Changes', 'Google Sheets', 'trigger',
                'Trigger when any cell value changes in a Google Sheets spreadsheet.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name')]),
            m('google-sheets:SearchRows', 'Search Rows', 'Google Sheets', 'search',
                'Search for rows matching specific criteria in a Google Sheets spreadsheet using column filters.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('filter', 'text', true, 'Filter column and value'), p('sortOrder', 'select', false, 'Sort results', { options: ['asc', 'desc'] })]),
            m('google-sheets:SearchRowByNumber', 'Get a Row', 'Google Sheets', 'search',
                'Retrieves a specific row by its row number.',
                [p('spreadsheetId', 'text', true, 'Spreadsheet ID'), p('sheetName', 'text', true, 'Sheet/tab name'), p('rowNumber', 'number', true, 'Row number to retrieve')]),

            // ═══════════════════════════════════════
            // OPENAI (11 modules — real: 31 total)
            // ═══════════════════════════════════════
            m('openai:ActionCreateCompletion', 'Create a Completion', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Generate text using OpenAI chat models. Send messages with system, user, and assistant roles to get AI-generated responses.',
                [p('model', 'select', true, 'Model to use', { options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'] }), p('messages', 'array', true, 'Array of messages with role and content'), p('temperature', 'number', false, 'Sampling temperature (0-2)', { default: 0.7 }), p('maxTokens', 'number', false, 'Maximum tokens in response'), p('responseFormat', 'select', false, 'Response format', { options: ['text', 'json_object'] }), p('tools', 'array', false, 'Function calling tools/definitions')]),
            m('openai:ActionAnalyzeImages', 'Analyze Images (Vision)', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Analyzes images according to specified instructions using GPT-4 Vision. Describe, extract text, or answer questions about images.',
                [p('model', 'select', true, 'Vision model', { options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] }), p('imageUrl', 'url', true, 'Image URL or base64 data'), p('prompt', 'text', true, 'Instructions for analyzing the image'), p('maxTokens', 'number', false, 'Maximum tokens in response')]),
            m('openai:ActionCreateImage', 'Generate an Image', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Generate images from text descriptions using DALL-E. Creates original images from natural language prompts.',
                [p('prompt', 'text', true, 'Image description prompt'), p('model', 'select', false, 'DALL-E model', { options: ['dall-e-3', 'dall-e-2'] }), p('size', 'select', false, 'Image size', { options: ['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'] }), p('quality', 'select', false, 'Image quality', { options: ['standard', 'hd'] }), p('n', 'number', false, 'Number of images to generate', { default: 1 })]),
            m('openai:ActionEditImage', 'Edit Images', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Creates an edited or extended image given one or more source images and a prompt.',
                [p('image', 'buffer', true, 'Source image file'), p('prompt', 'text', true, 'Description of the edit to make'), p('mask', 'buffer', false, 'Mask image indicating areas to edit'), p('size', 'select', false, 'Output image size', { options: ['1024x1024', '512x512', '256x256'] })]),
            m('openai:ActionTranscribe', 'Create a Transcription', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Transcribe audio to text using Whisper. Supports mp3, mp4, mpeg, mpga, m4a, wav, and webm formats.',
                [p('file', 'buffer', true, 'Audio file to transcribe'), p('model', 'select', true, 'Whisper model', { options: ['whisper-1'] }), p('language', 'text', false, 'Language code (ISO-639-1)'), p('prompt', 'text', false, 'Optional prompt to guide transcription'), p('responseFormat', 'select', false, 'Output format', { options: ['json', 'text', 'srt', 'vtt'] })]),
            m('openai:ActionTranslate', 'Create a Translation', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Translate audio into English text using Whisper. Takes audio in any language and outputs English text.',
                [p('file', 'buffer', true, 'Audio file to translate'), p('model', 'select', true, 'Model', { options: ['whisper-1'] }), p('prompt', 'text', false, 'Optional prompt to guide translation')]),
            m('openai:ActionCreateEmbedding', 'Create an Embedding', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Create vector embeddings from text for semantic search, clustering, and classification tasks.',
                [p('input', 'text', true, 'Text to embed'), p('model', 'select', true, 'Embedding model', { options: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'] })]),
            m('openai:ActionTextToSpeech', 'Transform Text to Speech', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Convert text to lifelike spoken audio using OpenAI TTS models.',
                [p('input', 'text', true, 'Text to convert to speech'), p('model', 'select', true, 'TTS model', { options: ['tts-1', 'tts-1-hd'] }), p('voice', 'select', true, 'Voice', { options: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] }), p('responseFormat', 'select', false, 'Audio format', { options: ['mp3', 'opus', 'aac', 'flac'] })]),
            m('openai:ActionCreateBatch', 'Create a Batch', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Creates and executes a batch of API calls for processing large volumes of requests at reduced cost.',
                [p('inputFileId', 'text', true, 'Input file ID containing batch requests'), p('endpoint', 'select', true, 'API endpoint', { options: ['/v1/chat/completions', '/v1/embeddings'] }), p('completionWindow', 'select', true, 'Completion window', { options: ['24h'] })]),
            m('openai:TriggerWatchResponses', 'Watch Responses', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'trigger',
                'Triggers when a new stored response is created in OpenAI.',
                [p('model', 'select', false, 'Filter by model')]),
            m('openai:SearchModels', 'List Models', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'search',
                'Lists all available OpenAI models that you have access to.',
                []),

            // ═══════════════════════════════════════
            // GMAIL (8 modules — real: 13 total)
            // ═══════════════════════════════════════
            m('gmail:ActionSendEmail', 'Send an Email', 'Gmail', 'action',
                'Send an email from your Gmail account. Supports HTML content, attachments, CC, BCC, and reply-to.',
                [p('to', 'email', true, 'Recipient email address(es)'), p('subject', 'text', true, 'Email subject line'), p('body', 'text', true, 'Email body (plain text or HTML)'), p('cc', 'email', false, 'CC recipients'), p('bcc', 'email', false, 'BCC recipients'), p('replyTo', 'email', false, 'Reply-to address'), p('attachments', 'array', false, 'File attachments'), p('isHtml', 'boolean', false, 'Whether body is HTML')]),
            m('gmail:ActionCreateDraft', 'Create a Draft', 'Gmail', 'action',
                'Create a draft email in Gmail without sending it.',
                [p('to', 'email', true, 'Recipient email'), p('subject', 'text', true, 'Subject line'), p('body', 'text', true, 'Email body'), p('cc', 'email', false, 'CC recipients')]),
            m('gmail:ActionMoveEmail', 'Move an Email', 'Gmail', 'action',
                'Move an email to a specified Gmail label/folder.',
                [p('emailId', 'text', true, 'Email message ID'), p('label', 'text', true, 'Destination label')]),
            m('gmail:ActionMarkAsRead', 'Mark an Email as Read', 'Gmail', 'action',
                'Mark an email as read or unread.',
                [p('emailId', 'text', true, 'Email message ID'), p('read', 'boolean', true, 'Mark as read (true) or unread (false)')]),
            m('gmail:ActionDeleteEmail', 'Delete an Email', 'Gmail', 'action',
                'Permanently delete an email or move it to trash.',
                [p('emailId', 'text', true, 'Email message ID'), p('permanent', 'boolean', false, 'Permanently delete (skip trash)')]),
            m('gmail:ActionAddLabel', 'Add a Label', 'Gmail', 'action',
                'Add a label to an email message.',
                [p('emailId', 'text', true, 'Email message ID'), p('label', 'text', true, 'Label to add')]),
            m('gmail:TriggerWatchEmails', 'Watch Emails', 'Gmail', 'trigger',
                'Trigger when a new email arrives in your Gmail inbox. Can filter by label, sender, subject, or full-text search.',
                [p('label', 'text', false, 'Filter by Gmail label'), p('from', 'email', false, 'Filter by sender address'), p('subject', 'text', false, 'Filter by subject keyword'), p('search', 'text', false, 'Gmail search query (e.g., "has:attachment is:unread")')]),
            m('gmail:SearchEmails', 'Search Emails', 'Gmail', 'search',
                'Search Gmail messages using Gmail search syntax.',
                [p('query', 'text', true, 'Gmail search query'), p('maxResults', 'number', false, 'Maximum results to return')]),

            // ═══════════════════════════════════════
            // GOOGLE DRIVE (10 modules — real: 32 total)
            // ═══════════════════════════════════════
            m('google-drive:ActionUploadFile', 'Upload a File', 'Google Drive', 'action',
                'Upload a file to Google Drive. Supports any file type.',
                [p('folderId', 'text', false, 'Target folder ID (root if empty)'), p('fileName', 'text', true, 'Name for the uploaded file'), p('data', 'buffer', true, 'File data to upload'), p('mimeType', 'text', false, 'File MIME type')]),
            m('google-drive:ActionCreateFolder', 'Create a Folder', 'Google Drive', 'action',
                'Creates a new folder in Google Drive.',
                [p('name', 'text', true, 'Folder name'), p('parentId', 'text', false, 'Parent folder ID')]),
            m('google-drive:ActionCopyFile', 'Copy a File', 'Google Drive', 'action',
                'Makes a copy of an existing file in Google Drive.',
                [p('fileId', 'text', true, 'Source file ID'), p('name', 'text', false, 'New file name'), p('folderId', 'text', false, 'Destination folder ID')]),
            m('google-drive:ActionMoveFile', 'Move a File/Folder', 'Google Drive', 'action',
                'Moves a file or folder to a different location in Google Drive.',
                [p('fileId', 'text', true, 'File or folder ID'), p('folderId', 'text', true, 'Destination folder ID')]),
            m('google-drive:ActionDeleteFile', 'Delete a File/Folder', 'Google Drive', 'action',
                'Permanently deletes a file or folder owned by the user without moving it to the trash.',
                [p('fileId', 'text', true, 'File or folder ID to delete')]),
            m('google-drive:ActionDownloadFile', 'Download a File', 'Google Drive', 'action',
                'Downloads a file from Google Drive as binary data.',
                [p('fileId', 'text', true, 'File ID to download')]),
            m('google-drive:ActionCreateFromText', 'Create a File from Text', 'Google Drive', 'action',
                'Creates a new file from plain text content.',
                [p('name', 'text', true, 'File name'), p('content', 'text', true, 'Text content'), p('folderId', 'text', false, 'Destination folder'), p('mimeType', 'text', false, 'MIME type', { default: 'text/plain' })]),
            m('google-drive:ActionShareFile', 'Share a File/Folder', 'Google Drive', 'action',
                'Updates sharing permissions for a file or folder.',
                [p('fileId', 'text', true, 'File or folder ID'), p('role', 'select', true, 'Permission role', { options: ['reader', 'writer', 'commenter', 'owner'] }), p('type', 'select', true, 'Permission type', { options: ['user', 'group', 'domain', 'anyone'] }), p('emailAddress', 'email', false, 'Email for user/group permissions')]),
            m('google-drive:TriggerWatchFiles', 'Watch Files', 'Google Drive', 'trigger',
                'Trigger when a new file is created or an existing file is modified in Google Drive.',
                [p('folderId', 'text', false, 'Folder to watch (all if empty)'), p('watch', 'select', false, 'Watch for', { options: ['created', 'modified', 'all'] })]),
            m('google-drive:SearchFiles', 'Search Files/Folders', 'Google Drive', 'search',
                'Search for files and folders in Google Drive using search queries.',
                [p('query', 'text', false, 'Search query'), p('folderId', 'text', false, 'Limit search to folder'), p('mimeType', 'text', false, 'Filter by MIME type')]),

            // ═══════════════════════════════════════
            // GOOGLE DOCS (5 modules)
            // ═══════════════════════════════════════
            m('google-docs:ActionCreateDocument', 'Create a Document', 'Google Docs', 'action',
                'Creates a new Google Docs document.',
                [p('title', 'text', true, 'Document title'), p('content', 'text', false, 'Initial document content'), p('folderId', 'text', false, 'Google Drive folder ID')]),
            m('google-docs:ActionInsertText', 'Insert a Text to a Document', 'Google Docs', 'action',
                'Inserts text at a specified location in a Google Docs document.',
                [p('documentId', 'text', true, 'Document ID'), p('text', 'text', true, 'Text to insert'), p('location', 'select', true, 'Where to insert', { options: ['end', 'beginning', 'index'] })]),
            m('google-docs:ActionReplaceText', 'Replace Text in a Document', 'Google Docs', 'action',
                'Replaces all occurrences of a text string in a Google Docs document.',
                [p('documentId', 'text', true, 'Document ID'), p('searchText', 'text', true, 'Text to find'), p('replaceText', 'text', true, 'Replacement text'), p('matchCase', 'boolean', false, 'Case-sensitive match')]),
            m('google-docs:ActionGetContent', 'Get a Content of a Document', 'Google Docs', 'action',
                'Retrieves the full content of a Google Docs document.',
                [p('documentId', 'text', true, 'Document ID')]),
            m('google-docs:ActionDownloadDocument', 'Download a Document', 'Google Docs', 'action',
                'Downloads a Google Docs document in a specified format.',
                [p('documentId', 'text', true, 'Document ID'), p('format', 'select', true, 'Export format', { options: ['pdf', 'docx', 'txt', 'html', 'epub', 'odt'] })]),

            // ═══════════════════════════════════════
            // GOOGLE CALENDAR (6 modules)
            // ═══════════════════════════════════════
            m('google-calendar:ActionCreateEvent', 'Create an Event', 'Google Calendar', 'action',
                'Creates a new event in a Google Calendar.',
                [p('calendarId', 'text', true, 'Calendar ID'), p('summary', 'text', true, 'Event title'), p('start', 'date', true, 'Start date/time'), p('end', 'date', true, 'End date/time'), p('description', 'text', false, 'Event description'), p('location', 'text', false, 'Event location'), p('attendees', 'array', false, 'Attendee email addresses'), p('reminders', 'array', false, 'Reminder settings')]),
            m('google-calendar:ActionUpdateEvent', 'Update an Event', 'Google Calendar', 'action',
                'Updates an existing event in Google Calendar.',
                [p('calendarId', 'text', true, 'Calendar ID'), p('eventId', 'text', true, 'Event ID'), p('summary', 'text', false, 'Updated title'), p('start', 'date', false, 'Updated start'), p('end', 'date', false, 'Updated end')]),
            m('google-calendar:ActionDeleteEvent', 'Delete an Event', 'Google Calendar', 'action',
                'Deletes an event from Google Calendar.',
                [p('calendarId', 'text', true, 'Calendar ID'), p('eventId', 'text', true, 'Event ID')]),
            m('google-calendar:ActionQuickAddEvent', 'Quick Add an Event', 'Google Calendar', 'action',
                'Creates an event using natural language text (e.g., "Meeting with John tomorrow at 3pm").',
                [p('calendarId', 'text', true, 'Calendar ID'), p('text', 'text', true, 'Natural language event description')]),
            m('google-calendar:TriggerWatchEvents', 'Watch Events', 'Google Calendar', 'trigger',
                'Trigger when a new event is created, updated, or starts in Google Calendar.',
                [p('calendarId', 'text', true, 'Calendar ID'), p('watch', 'select', false, 'Watch for', { options: ['created', 'updated', 'started'] })]),
            m('google-calendar:SearchEvents', 'Search Events', 'Google Calendar', 'search',
                'Search for events in a Google Calendar within a date range.',
                [p('calendarId', 'text', true, 'Calendar ID'), p('query', 'text', false, 'Search text'), p('timeMin', 'date', false, 'Start of search range'), p('timeMax', 'date', false, 'End of search range')]),

            // ═══════════════════════════════════════
            // SLACK (12 modules — real: 46 total)
            // ═══════════════════════════════════════
            m('slack:ActionPostMessage', 'Post a Message', 'Slack', 'action',
                'Post a message to a Slack channel, group, or direct message. Supports rich text formatting, Block Kit, and attachments.',
                [p('channel', 'text', true, 'Channel ID or name (#general)'), p('text', 'text', true, 'Message text (supports Slack mrkdwn)'), p('username', 'text', false, 'Override bot username'), p('iconEmoji', 'text', false, 'Override bot icon emoji (e.g., :robot:)'), p('iconUrl', 'url', false, 'Override bot icon URL'), p('blocks', 'array', false, 'Block Kit blocks for rich layouts'), p('threadTs', 'text', false, 'Thread timestamp to reply in thread')]),
            m('slack:ActionEditMessage', 'Edit a Message', 'Slack', 'action',
                'Edits an existing Slack message.',
                [p('channel', 'text', true, 'Channel ID'), p('ts', 'text', true, 'Message timestamp'), p('text', 'text', true, 'New message text')]),
            m('slack:ActionDeleteMessage', 'Delete a Message', 'Slack', 'action',
                'Removes a Slack message from a channel.',
                [p('channel', 'text', true, 'Channel ID'), p('ts', 'text', true, 'Message timestamp')]),
            m('slack:ActionAddReaction', 'Add a Reaction', 'Slack', 'action',
                'Adds an emoji reaction to a message.',
                [p('channel', 'text', true, 'Channel ID'), p('ts', 'text', true, 'Message timestamp'), p('emoji', 'text', true, 'Emoji name without colons (e.g., thumbsup)')]),
            m('slack:ActionCreateChannel', 'Create a Channel', 'Slack', 'action',
                'Creates a new Slack channel.',
                [p('name', 'text', true, 'Channel name (lowercase, no spaces)'), p('isPrivate', 'boolean', false, 'Create as private channel')]),
            m('slack:ActionArchiveChannel', 'Archive a Channel', 'Slack', 'action',
                'Archives a Slack channel.',
                [p('channel', 'text', true, 'Channel ID to archive')]),
            m('slack:ActionInviteToChannel', 'Invite to Channel', 'Slack', 'action',
                'Invites a user to a Slack channel.',
                [p('channel', 'text', true, 'Channel ID'), p('user', 'text', true, 'User ID to invite')]),
            m('slack:ActionSetTopic', 'Set a Topic', 'Slack', 'action',
                'Sets the topic of a Slack channel.',
                [p('channel', 'text', true, 'Channel ID'), p('topic', 'text', true, 'New channel topic')]),
            m('slack:ActionUploadFile', 'Upload a File', 'Slack', 'action',
                'Upload a file to a Slack channel.',
                [p('channels', 'text', true, 'Channel ID(s) to share the file in'), p('file', 'buffer', true, 'File data'), p('filename', 'text', true, 'File name'), p('title', 'text', false, 'File title'), p('initialComment', 'text', false, 'Initial comment')]),
            m('slack:ActionCreateReminder', 'Create a Reminder', 'Slack', 'action',
                'Creates a reminder for a user.',
                [p('text', 'text', true, 'Reminder text'), p('time', 'text', true, 'When to remind (e.g., "in 5 minutes", "tomorrow at 9am")'), p('user', 'text', false, 'User ID (defaults to self)')]),
            m('slack:TriggerWatchMessages', 'Watch Public Channel Messages', 'Slack', 'trigger',
                'Trigger when a new message is posted in a public Slack channel.',
                [p('channel', 'text', true, 'Channel to watch'), p('limit', 'number', false, 'Max messages per run')]),
            m('slack:TriggerWatchPrivateMessages', 'Watch Private Channel Messages', 'Slack', 'trigger',
                'Trigger when a new message is posted in a private Slack channel.',
                [p('channel', 'text', true, 'Private channel to watch')]),
            m('slack:TriggerWatchReactions', 'Watch Reactions', 'Slack', 'trigger',
                'Trigger when a reaction (emoji) is added to a message.',
                [p('channel', 'text', false, 'Channel to watch (all if empty)')]),
            m('slack:SearchMessages', 'Search Messages', 'Slack', 'search',
                'Search Slack messages matching a query.',
                [p('query', 'text', true, 'Search query'), p('sort', 'select', false, 'Sort by', { options: ['score', 'timestamp'] })]),
            m('slack:SearchUsers', 'Get a User', 'Slack', 'search',
                'Retrieves information about a Slack user.',
                [p('userId', 'text', true, 'User ID')]),
            m('slack:SearchChannels', 'Get a Channel', 'Slack', 'search',
                'Returns details about a Slack channel.',
                [p('channelId', 'text', true, 'Channel ID')]),

            // ═══════════════════════════════════════
            // NOTION (10 modules — real: 30 total)
            // ═══════════════════════════════════════
            m('notion:ActionCreateDatabaseItem', 'Create a Database Item', 'Notion', 'action',
                'Creates a new item (page) in a Notion database with specified property values.',
                [p('databaseId', 'text', true, 'Notion database ID'), p('properties', 'object', true, 'Property values for the new item'), p('content', 'array', false, 'Page content blocks')]),
            m('notion:ActionUpdateDatabaseItem', 'Update a Database Item', 'Notion', 'action',
                'Updates properties of an existing item in a Notion database.',
                [p('pageId', 'text', true, 'Page/item ID'), p('properties', 'object', true, 'Updated property values')]),
            m('notion:ActionCreatePage', 'Create a Page', 'Notion', 'action',
                'Creates a new page in a specified parent page in Notion.',
                [p('parentPageId', 'text', true, 'Parent page ID'), p('title', 'text', true, 'Page title'), p('content', 'array', false, 'Page content blocks (paragraphs, headings, etc.)')]),
            m('notion:ActionAppendPageContent', 'Append a Page Content', 'Notion', 'action',
                'Appends new content blocks to an existing Notion page.',
                [p('pageId', 'text', true, 'Page ID'), p('children', 'array', true, 'Content blocks to append')]),
            m('notion:ActionCreateDatabase', 'Create a Database', 'Notion', 'action',
                'Creates a new database in Notion with specified properties/columns.',
                [p('parentPageId', 'text', true, 'Parent page ID'), p('title', 'text', true, 'Database title'), p('properties', 'object', true, 'Database property definitions')]),
            m('notion:ActionDeletePageContent', 'Delete a Page Content', 'Notion', 'action',
                'Archives (soft-deletes) a page content block in Notion.',
                [p('blockId', 'text', true, 'Block ID to archive')]),
            m('notion:TriggerWatchDatabaseItems', 'Watch Database Items', 'Notion', 'trigger',
                'Trigger when new items are added to a Notion database.',
                [p('databaseId', 'text', true, 'Notion database ID'), p('limit', 'number', false, 'Max items per run')]),
            m('notion:TriggerWatchPages', 'Watch Pages', 'Notion', 'trigger',
                'Trigger when pages are created or updated in Notion.',
                [p('parentId', 'text', false, 'Parent page or database ID')]),
            m('notion:SearchDatabaseItems', 'Search Database Items', 'Notion', 'search',
                'Query a Notion database with filters and sorts.',
                [p('databaseId', 'text', true, 'Database ID'), p('filter', 'object', false, 'Filter conditions'), p('sort', 'array', false, 'Sort criteria')]),
            m('notion:SearchPages', 'Search Pages', 'Notion', 'search',
                'Search for pages across your entire Notion workspace.',
                [p('query', 'text', true, 'Search text')]),

            // ═══════════════════════════════════════
            // AIRTABLE (8 modules — real: 13 total)
            // ═══════════════════════════════════════
            m('airtable:ActionCreateRecord', 'Create a Record', 'Airtable', 'action',
                'Creates a new record in an Airtable base table with specified field values.',
                [p('baseId', 'text', true, 'Airtable base ID'), p('tableId', 'text', true, 'Table name or ID'), p('fields', 'object', true, 'Field values for the new record')]),
            m('airtable:ActionUpdateRecord', 'Update a Record', 'Airtable', 'action',
                'Updates an existing record in Airtable.',
                [p('baseId', 'text', true, 'Airtable base ID'), p('tableId', 'text', true, 'Table name or ID'), p('recordId', 'text', true, 'Record ID'), p('fields', 'object', true, 'Updated field values')]),
            m('airtable:ActionDeleteRecord', 'Delete a Record', 'Airtable', 'action',
                'Deletes a record from Airtable by its ID.',
                [p('baseId', 'text', true, 'Base ID'), p('tableId', 'text', true, 'Table name or ID'), p('recordId', 'text', true, 'Record ID to delete')]),
            m('airtable:ActionGetRecord', 'Get a Record', 'Airtable', 'action',
                'Retrieves a single record by its ID.',
                [p('baseId', 'text', true, 'Base ID'), p('tableId', 'text', true, 'Table name'), p('recordId', 'text', true, 'Record ID')]),
            m('airtable:ActionBulkCreate', 'Bulk Create Records', 'Airtable', 'search',
                'Creates multiple records in one operation.',
                [p('baseId', 'text', true, 'Base ID'), p('tableId', 'text', true, 'Table name'), p('records', 'array', true, 'Array of record objects')]),
            m('airtable:ActionBulkUpdate', 'Bulk Update Records', 'Airtable', 'search',
                'Updates multiple existing records in one operation.',
                [p('baseId', 'text', true, 'Base ID'), p('tableId', 'text', true, 'Table name'), p('records', 'array', true, 'Array of {id, fields} objects')]),
            m('airtable:SearchRecords', 'Search Records', 'Airtable', 'search',
                'Searches for specific records or returns all records in an Airtable table. Supports formula-based filtering.',
                [p('baseId', 'text', true, 'Airtable base ID'), p('tableId', 'text', true, 'Table name or ID'), p('filterByFormula', 'text', false, 'Airtable filter formula'), p('sort', 'array', false, 'Sort configuration'), p('maxRecords', 'number', false, 'Max records to return')]),
            m('airtable:TriggerWatchRecords', 'Watch Records', 'Airtable', 'trigger',
                'Trigger when new records are created in an Airtable table.',
                [p('baseId', 'text', true, 'Base ID'), p('tableId', 'text', true, 'Table name'), p('limit', 'number', false, 'Max records per run')]),

            // ═══════════════════════════════════════
            // TELEGRAM BOT (10 modules — real: 32 total)
            // ═══════════════════════════════════════
            m('telegram:TriggerWatchUpdates', 'Watch Updates', 'Telegram Bot', 'trigger',
                'Trigger when the bot receives new messages, commands, or callbacks in Telegram.',
                [p('limit', 'number', false, 'Max updates per run'), p('allowedUpdates', 'array', false, 'Filter update types (message, edited_message, callback_query, etc.)')]),
            m('telegram:ActionSendTextMessage', 'Send a Text Message', 'Telegram Bot', 'action',
                'Sends a text message to a Telegram chat. Supports HTML and Markdown formatting.',
                [p('chatId', 'text', true, 'Chat ID or @username'), p('text', 'text', true, 'Message text'), p('parseMode', 'select', false, 'Formatting mode', { options: ['HTML', 'Markdown', 'MarkdownV2'] }), p('disableNotification', 'boolean', false, 'Send silently'), p('replyToMessageId', 'number', false, 'Message ID to reply to'), p('replyMarkup', 'object', false, 'Inline keyboard or custom keyboard')]),
            m('telegram:ActionSendPhoto', 'Send a Photo', 'Telegram Bot', 'action',
                'Sends a photo to a Telegram chat.',
                [p('chatId', 'text', true, 'Chat ID'), p('photo', 'buffer', true, 'Photo file or URL'), p('caption', 'text', false, 'Photo caption')]),
            m('telegram:ActionSendDocument', 'Send a Document', 'Telegram Bot', 'action',
                'Sends a document/file to a Telegram chat.',
                [p('chatId', 'text', true, 'Chat ID'), p('document', 'buffer', true, 'Document file'), p('caption', 'text', false, 'Document caption'), p('filename', 'text', false, 'File name')]),
            m('telegram:ActionSendVideo', 'Send a Video', 'Telegram Bot', 'action',
                'Sends a video to a Telegram chat.',
                [p('chatId', 'text', true, 'Chat ID'), p('video', 'buffer', true, 'Video file or URL'), p('caption', 'text', false, 'Video caption')]),
            m('telegram:ActionEditMessage', 'Edit a Text Message', 'Telegram Bot', 'action',
                'Edits text of a previously sent message.',
                [p('chatId', 'text', true, 'Chat ID'), p('messageId', 'number', true, 'Message ID'), p('text', 'text', true, 'New message text')]),
            m('telegram:ActionDeleteMessage', 'Delete a Message', 'Telegram Bot', 'action',
                'Deletes a message (can only delete messages sent less than 48 hours ago).',
                [p('chatId', 'text', true, 'Chat ID'), p('messageId', 'number', true, 'Message ID')]),
            m('telegram:ActionForwardMessage', 'Forward a Message', 'Telegram Bot', 'action',
                'Forwards a message from one chat to another within Telegram.',
                [p('chatId', 'text', true, 'Destination chat ID'), p('fromChatId', 'text', true, 'Source chat ID'), p('messageId', 'number', true, 'Message ID to forward')]),
            m('telegram:ActionDownloadFile', 'Download a File', 'Telegram Bot', 'action',
                'Downloads a file from the Telegram server by file ID.',
                [p('fileId', 'text', true, 'Telegram file ID')]),
            m('telegram:ActionMakeAPICall', 'Make an API Call', 'Telegram Bot', 'action',
                'Makes a custom Telegram Bot API call for any method not covered by other modules.',
                [p('method', 'text', true, 'API method name'), p('body', 'object', false, 'Request parameters')]),

            // ═══════════════════════════════════════
            // HUBSPOT CRM (10 modules — real: 121 total)
            // ═══════════════════════════════════════
            m('hubspot:ActionCreateContact', 'Create a Contact', 'HubSpot CRM', 'action',
                'Creates a new contact in HubSpot CRM with specified properties.',
                [p('email', 'email', true, 'Contact email'), p('firstName', 'text', false, 'First name'), p('lastName', 'text', false, 'Last name'), p('phone', 'text', false, 'Phone number'), p('company', 'text', false, 'Company name'), p('properties', 'object', false, 'Additional contact properties')]),
            m('hubspot:ActionUpdateContact', 'Update a Contact', 'HubSpot CRM', 'action',
                'Updates an existing contact in HubSpot CRM.',
                [p('contactId', 'text', true, 'Contact ID'), p('properties', 'object', true, 'Updated property values')]),
            m('hubspot:ActionCreateDeal', 'Create a Deal', 'HubSpot CRM', 'action',
                'Creates a new deal in HubSpot CRM pipeline.',
                [p('dealName', 'text', true, 'Deal name'), p('pipeline', 'text', true, 'Pipeline ID'), p('dealStage', 'text', true, 'Deal stage ID'), p('amount', 'number', false, 'Deal amount'), p('closeDate', 'date', false, 'Expected close date'), p('properties', 'object', false, 'Additional deal properties')]),
            m('hubspot:ActionUpdateDeal', 'Update a Deal', 'HubSpot CRM', 'action',
                'Updates an existing deal in HubSpot CRM.',
                [p('dealId', 'text', true, 'Deal ID'), p('properties', 'object', true, 'Updated properties')]),
            m('hubspot:ActionCreateCompany', 'Create a Company', 'HubSpot CRM', 'action',
                'Creates a new company in HubSpot CRM.',
                [p('name', 'text', true, 'Company name'), p('domain', 'text', false, 'Company domain'), p('industry', 'text', false, 'Industry'), p('properties', 'object', false, 'Additional properties')]),
            m('hubspot:ActionCreateTicket', 'Create a Ticket', 'HubSpot CRM', 'action',
                'Creates a new support ticket in HubSpot.',
                [p('subject', 'text', true, 'Ticket subject'), p('content', 'text', false, 'Ticket description'), p('pipeline', 'text', true, 'Pipeline ID'), p('status', 'text', true, 'Ticket status')]),
            m('hubspot:ActionAddContactToList', 'Add Members to a List', 'HubSpot CRM', 'action',
                'Adds contact records to a HubSpot contact list.',
                [p('listId', 'text', true, 'List ID'), p('contactIds', 'array', true, 'Array of contact IDs to add')]),
            m('hubspot:TriggerWatchContacts', 'Watch Contacts', 'HubSpot CRM', 'trigger',
                'Trigger when a new contact is created in HubSpot CRM.',
                [p('limit', 'number', false, 'Max contacts per run')]),
            m('hubspot:TriggerWatchDeals', 'Watch Deals', 'HubSpot CRM', 'trigger',
                'Trigger when a new deal is created or updated in HubSpot CRM.',
                [p('pipeline', 'text', false, 'Filter by pipeline'), p('limit', 'number', false, 'Max deals per run')]),
            m('hubspot:SearchContacts', 'Search Contacts', 'HubSpot CRM', 'search',
                'Search for contacts in HubSpot CRM using filters.',
                [p('query', 'text', false, 'Search query'), p('filters', 'array', false, 'Filter groups'), p('limit', 'number', false, 'Max results')]),

            // ═══════════════════════════════════════
            // MICROSOFT TEAMS (5 modules)
            // ═══════════════════════════════════════
            m('microsoft-teams:ActionSendMessage', 'Send a Message', 'Microsoft Teams', 'action',
                'Send a message to a Microsoft Teams channel or chat. Supports HTML formatting.',
                [p('teamId', 'text', true, 'Team ID'), p('channelId', 'text', true, 'Channel ID'), p('message', 'text', true, 'Message content (supports HTML)'), p('contentType', 'select', false, 'Content type', { options: ['text', 'html'] })]),
            m('microsoft-teams:ActionCreateChannel', 'Create a Channel', 'Microsoft Teams', 'action',
                'Creates a new channel in a Microsoft Teams team.',
                [p('teamId', 'text', true, 'Team ID'), p('displayName', 'text', true, 'Channel name'), p('description', 'text', false, 'Channel description')]),
            m('microsoft-teams:ActionReplyToMessage', 'Reply to a Message', 'Microsoft Teams', 'action',
                'Reply to an existing message in a Teams channel.',
                [p('teamId', 'text', true, 'Team ID'), p('channelId', 'text', true, 'Channel ID'), p('messageId', 'text', true, 'Parent message ID'), p('message', 'text', true, 'Reply content')]),
            m('microsoft-teams:TriggerWatchMessages', 'Watch Channel Messages', 'Microsoft Teams', 'trigger',
                'Trigger when a new message is posted in a Teams channel.',
                [p('teamId', 'text', true, 'Team ID'), p('channelId', 'text', true, 'Channel ID')]),
            m('microsoft-teams:SearchMembers', 'List Team Members', 'Microsoft Teams', 'search',
                'Lists all members of a Microsoft Teams team.',
                [p('teamId', 'text', true, 'Team ID')]),

            // ═══════════════════════════════════════
            // MICROSOFT OUTLOOK (5 modules)
            // ═══════════════════════════════════════
            m('microsoft-outlook:ActionSendEmail', 'Send an Email', 'Microsoft Outlook 365', 'action',
                'Send an email from your Microsoft 365 Outlook account.',
                [p('to', 'email', true, 'Recipient email'), p('subject', 'text', true, 'Subject'), p('body', 'text', true, 'Email body'), p('cc', 'email', false, 'CC'), p('bcc', 'email', false, 'BCC'), p('attachments', 'array', false, 'File attachments'), p('isHtml', 'boolean', false, 'HTML body')]),
            m('microsoft-outlook:ActionCreateDraft', 'Create a Draft Message', 'Microsoft Outlook 365', 'action',
                'Create a draft email in Outlook without sending.',
                [p('to', 'email', true, 'Recipient'), p('subject', 'text', true, 'Subject'), p('body', 'text', true, 'Body')]),
            m('microsoft-outlook:ActionCreateEvent', 'Create an Event', 'Microsoft Outlook 365', 'action',
                'Create a calendar event in Microsoft Outlook.',
                [p('subject', 'text', true, 'Event subject'), p('start', 'date', true, 'Start date/time'), p('end', 'date', true, 'End date/time'), p('attendees', 'array', false, 'Attendee emails')]),
            m('microsoft-outlook:TriggerWatchEmails', 'Watch Emails', 'Microsoft Outlook 365', 'trigger',
                'Trigger when a new email arrives in your Outlook inbox.',
                [p('folder', 'text', false, 'Mail folder (default: Inbox)'), p('filter', 'text', false, 'OData filter query')]),
            m('microsoft-outlook:SearchEmails', 'Search Emails', 'Microsoft Outlook 365', 'search',
                'Search emails in Microsoft Outlook 365.',
                [p('query', 'text', true, 'Search query'), p('folder', 'text', false, 'Folder to search')]),

            // ═══════════════════════════════════════
            // DISCORD (5 modules)
            // ═══════════════════════════════════════
            m('discord:ActionSendMessage', 'Send a Message', 'Discord', 'action',
                'Send a message to a Discord channel using a bot.',
                [p('channelId', 'text', true, 'Channel ID'), p('content', 'text', true, 'Message content'), p('embeds', 'array', false, 'Rich embeds'), p('tts', 'boolean', false, 'Text-to-speech')]),
            m('discord:ActionEditMessage', 'Edit a Message', 'Discord', 'action',
                'Edit a previously sent Discord message.',
                [p('channelId', 'text', true, 'Channel ID'), p('messageId', 'text', true, 'Message ID'), p('content', 'text', true, 'New content')]),
            m('discord:ActionDeleteMessage', 'Delete a Message', 'Discord', 'action',
                'Delete a message from a Discord channel.',
                [p('channelId', 'text', true, 'Channel ID'), p('messageId', 'text', true, 'Message ID')]),
            m('discord:ActionCreateChannel', 'Create a Channel', 'Discord', 'action',
                'Create a new channel in a Discord server.',
                [p('guildId', 'text', true, 'Server/guild ID'), p('name', 'text', true, 'Channel name'), p('type', 'select', false, 'Channel type', { options: ['text', 'voice', 'category'] })]),
            m('discord:TriggerWatchMessages', 'Watch Messages', 'Discord', 'trigger',
                'Trigger when a new message is posted in a Discord channel.',
                [p('channelId', 'text', true, 'Channel ID')]),

            // ═══════════════════════════════════════
            // JIRA (6 modules)
            // ═══════════════════════════════════════
            m('jira:ActionCreateIssue', 'Create an Issue', 'Jira Software', 'action',
                'Creates a new issue (bug, task, story, epic) in a Jira project.',
                [p('projectKey', 'text', true, 'Project key (e.g., PROJ)'), p('issueType', 'select', true, 'Issue type', { options: ['Bug', 'Task', 'Story', 'Epic', 'Sub-task'] }), p('summary', 'text', true, 'Issue title'), p('description', 'text', false, 'Issue description'), p('priority', 'select', false, 'Priority', { options: ['Highest', 'High', 'Medium', 'Low', 'Lowest'] }), p('assignee', 'text', false, 'Assignee account ID'), p('labels', 'array', false, 'Labels')]),
            m('jira:ActionUpdateIssue', 'Update an Issue', 'Jira Software', 'action',
                'Updates fields of an existing Jira issue.',
                [p('issueKey', 'text', true, 'Issue key (e.g., PROJ-123)'), p('fields', 'object', true, 'Fields to update')]),
            m('jira:ActionTransitionIssue', 'Transition an Issue', 'Jira Software', 'action',
                'Move an issue to a different status (e.g., To Do → In Progress → Done).',
                [p('issueKey', 'text', true, 'Issue key'), p('transitionId', 'text', true, 'Transition ID or name')]),
            m('jira:ActionAddComment', 'Add a Comment', 'Jira Software', 'action',
                'Adds a comment to a Jira issue.',
                [p('issueKey', 'text', true, 'Issue key'), p('body', 'text', true, 'Comment body')]),
            m('jira:TriggerWatchIssues', 'Watch Issues', 'Jira Software', 'trigger',
                'Trigger when issues are created or updated in a Jira project.',
                [p('projectKey', 'text', true, 'Project key'), p('jql', 'text', false, 'JQL filter query')]),
            m('jira:SearchIssues', 'Search Issues', 'Jira Software', 'search',
                'Search for Jira issues using JQL (Jira Query Language).',
                [p('jql', 'text', true, 'JQL query (e.g., project=PROJ AND status="In Progress")'), p('maxResults', 'number', false, 'Max results')]),

            // ═══════════════════════════════════════
            // TRELLO (6 modules)
            // ═══════════════════════════════════════
            m('trello:ActionCreateCard', 'Create a Card', 'Trello', 'action',
                'Creates a new card in a Trello list.',
                [p('listId', 'text', true, 'List ID'), p('name', 'text', true, 'Card name'), p('description', 'text', false, 'Card description'), p('dueDate', 'date', false, 'Due date'), p('labels', 'array', false, 'Label IDs'), p('members', 'array', false, 'Member IDs')]),
            m('trello:ActionUpdateCard', 'Update a Card', 'Trello', 'action',
                'Updates an existing Trello card.',
                [p('cardId', 'text', true, 'Card ID'), p('name', 'text', false, 'New name'), p('description', 'text', false, 'New description'), p('listId', 'text', false, 'Move to list'), p('closed', 'boolean', false, 'Archive the card')]),
            m('trello:ActionAddComment', 'Add a Comment', 'Trello', 'action',
                'Adds a comment to a Trello card.',
                [p('cardId', 'text', true, 'Card ID'), p('text', 'text', true, 'Comment text')]),
            m('trello:ActionCreateList', 'Create a List', 'Trello', 'action',
                'Creates a new list on a Trello board.',
                [p('boardId', 'text', true, 'Board ID'), p('name', 'text', true, 'List name')]),
            m('trello:TriggerWatchCards', 'Watch Cards', 'Trello', 'trigger',
                'Trigger when a new card is created on a Trello board.',
                [p('boardId', 'text', true, 'Board ID')]),
            m('trello:SearchCards', 'Search Cards', 'Trello', 'search',
                'Search for cards on a Trello board.',
                [p('query', 'text', true, 'Search query'), p('boardId', 'text', false, 'Limit to board')]),

            // ═══════════════════════════════════════
            // ASANA (5 modules)
            // ═══════════════════════════════════════
            m('asana:ActionCreateTask', 'Create a Task', 'Asana', 'action',
                'Creates a new task in an Asana project.',
                [p('projectId', 'text', true, 'Project ID'), p('name', 'text', true, 'Task name'), p('notes', 'text', false, 'Task description'), p('assignee', 'text', false, 'Assignee email or ID'), p('dueOn', 'date', false, 'Due date'), p('tags', 'array', false, 'Tag IDs')]),
            m('asana:ActionUpdateTask', 'Update a Task', 'Asana', 'action',
                'Updates an existing Asana task.',
                [p('taskId', 'text', true, 'Task ID'), p('name', 'text', false, 'New name'), p('completed', 'boolean', false, 'Mark as complete')]),
            m('asana:ActionAddComment', 'Add a Comment', 'Asana', 'action',
                'Adds a comment/story to an Asana task.',
                [p('taskId', 'text', true, 'Task ID'), p('text', 'text', true, 'Comment text')]),
            m('asana:TriggerWatchTasks', 'Watch Tasks', 'Asana', 'trigger',
                'Trigger when new tasks are created in an Asana project.',
                [p('projectId', 'text', true, 'Project ID')]),
            m('asana:SearchTasks', 'Search Tasks', 'Asana', 'search',
                'Search for tasks in Asana.',
                [p('workspace', 'text', true, 'Workspace ID'), p('query', 'text', false, 'Search text')]),

            // ═══════════════════════════════════════
            // MONDAY.COM (5 modules)
            // ═══════════════════════════════════════
            m('monday:ActionCreateItem', 'Create an Item', 'monday.com', 'action',
                'Creates a new item in a monday.com board.',
                [p('boardId', 'text', true, 'Board ID'), p('itemName', 'text', true, 'Item name'), p('columnValues', 'object', false, 'Column values as JSON'), p('groupId', 'text', false, 'Group ID')]),
            m('monday:ActionUpdateItem', 'Update an Item', 'monday.com', 'action',
                'Updates column values of an item in monday.com.',
                [p('boardId', 'text', true, 'Board ID'), p('itemId', 'text', true, 'Item ID'), p('columnValues', 'object', true, 'Updated column values')]),
            m('monday:ActionCreateUpdate', 'Create an Update', 'monday.com', 'action',
                'Adds a text update/comment to a monday.com item.',
                [p('itemId', 'text', true, 'Item ID'), p('body', 'text', true, 'Update text')]),
            m('monday:TriggerWatchItems', 'Watch Items', 'monday.com', 'trigger',
                'Trigger when a new item is created on a monday.com board.',
                [p('boardId', 'text', true, 'Board ID')]),
            m('monday:TriggerWatchUpdates', 'Watch Column Values', 'monday.com', 'trigger',
                'Trigger when a column value changes on a monday.com board.',
                [p('boardId', 'text', true, 'Board ID'), p('columnId', 'text', false, 'Specific column to watch')]),

            // ═══════════════════════════════════════
            // SALESFORCE (5 modules)
            // ═══════════════════════════════════════
            m('salesforce:ActionCreateRecord', 'Create a Record', 'Salesforce', 'action',
                'Creates a new record (Lead, Contact, Account, Opportunity, etc.) in Salesforce.',
                [p('objectType', 'select', true, 'Object type', { options: ['Lead', 'Contact', 'Account', 'Opportunity', 'Case', 'Task', 'Custom'] }), p('fields', 'object', true, 'Field values')]),
            m('salesforce:ActionUpdateRecord', 'Update a Record', 'Salesforce', 'action',
                'Updates an existing Salesforce record.',
                [p('objectType', 'select', true, 'Object type', { options: ['Lead', 'Contact', 'Account', 'Opportunity', 'Case', 'Task', 'Custom'] }), p('recordId', 'text', true, 'Record ID'), p('fields', 'object', true, 'Updated fields')]),
            m('salesforce:TriggerWatchRecords', 'Watch Records', 'Salesforce', 'trigger',
                'Trigger when records are created or updated in Salesforce.',
                [p('objectType', 'text', true, 'Object type'), p('triggerType', 'select', false, 'Trigger on', { options: ['created', 'updated', 'both'] })]),
            m('salesforce:SearchRecords', 'Search Records (SOQL)', 'Salesforce', 'search',
                'Search Salesforce records using SOQL queries.',
                [p('query', 'text', true, 'SOQL query')]),
            m('salesforce:ActionMakeAPICall', 'Make an API Call', 'Salesforce', 'action',
                'Make a custom Salesforce REST API call.',
                [p('method', 'select', true, 'HTTP method', { options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }), p('url', 'text', true, 'API endpoint path'), p('body', 'text', false, 'Request body')]),

            // ═══════════════════════════════════════
            // STRIPE (5 modules)
            // ═══════════════════════════════════════
            m('stripe:TriggerWatchEvents', 'Watch Events', 'Stripe', 'trigger',
                'Trigger when new events occur in Stripe (payment_intent.succeeded, invoice.paid, customer.created, etc.).',
                [p('eventTypes', 'array', false, 'Filter by event types')]),
            m('stripe:ActionCreateCustomer', 'Create a Customer', 'Stripe', 'action',
                'Creates a new customer in Stripe.',
                [p('email', 'email', true, 'Customer email'), p('name', 'text', false, 'Customer name'), p('description', 'text', false, 'Description'), p('metadata', 'object', false, 'Custom metadata')]),
            m('stripe:ActionCreatePaymentIntent', 'Create a Payment Intent', 'Stripe', 'action',
                'Creates a payment intent for processing a payment.',
                [p('amount', 'number', true, 'Amount in cents'), p('currency', 'text', true, 'Currency code (usd, eur, etc.)'), p('customerId', 'text', false, 'Customer ID'), p('description', 'text', false, 'Payment description')]),
            m('stripe:ActionCreateInvoice', 'Create an Invoice', 'Stripe', 'action',
                'Creates a draft invoice for a Stripe customer.',
                [p('customerId', 'text', true, 'Customer ID'), p('description', 'text', false, 'Invoice description'), p('autoAdvance', 'boolean', false, 'Auto-finalize the invoice')]),
            m('stripe:SearchCharges', 'Search Charges', 'Stripe', 'search',
                'Search for charges/payments in Stripe.',
                [p('customerId', 'text', false, 'Filter by customer'), p('created', 'object', false, 'Date range filter'), p('limit', 'number', false, 'Max results')]),

            // ═══════════════════════════════════════
            // SHOPIFY (6 modules)
            // ═══════════════════════════════════════
            m('shopify:TriggerWatchOrders', 'Watch Orders', 'Shopify', 'trigger',
                'Trigger when a new order is placed in your Shopify store.',
                [p('status', 'select', false, 'Order status filter', { options: ['any', 'open', 'closed', 'cancelled'] })]),
            m('shopify:TriggerWatchProducts', 'Watch Products', 'Shopify', 'trigger',
                'Trigger when a new product is created in Shopify.',
                []),
            m('shopify:ActionCreateProduct', 'Create a Product', 'Shopify', 'action',
                'Creates a new product in your Shopify store.',
                [p('title', 'text', true, 'Product title'), p('description', 'text', false, 'Product description (HTML)'), p('vendor', 'text', false, 'Vendor name'), p('productType', 'text', false, 'Product type'), p('tags', 'text', false, 'Comma-separated tags'), p('variants', 'array', false, 'Product variants with price, SKU, etc.')]),
            m('shopify:ActionUpdateProduct', 'Update a Product', 'Shopify', 'action',
                'Updates an existing product in Shopify.',
                [p('productId', 'text', true, 'Product ID'), p('title', 'text', false, 'Updated title'), p('description', 'text', false, 'Updated description')]),
            m('shopify:ActionCreateOrder', 'Create an Order', 'Shopify', 'action',
                'Creates a new order in Shopify.',
                [p('lineItems', 'array', true, 'Order line items'), p('customer', 'object', false, 'Customer details'), p('shippingAddress', 'object', false, 'Shipping address')]),
            m('shopify:SearchProducts', 'Search Products', 'Shopify', 'search',
                'Search for products in your Shopify store.',
                [p('query', 'text', false, 'Search query'), p('productType', 'text', false, 'Filter by type'), p('vendor', 'text', false, 'Filter by vendor')]),

            // ═══════════════════════════════════════
            // MAILCHIMP (4 modules)
            // ═══════════════════════════════════════
            m('mailchimp:ActionAddMember', 'Add/Update a Subscriber', 'Mailchimp', 'action',
                'Add a subscriber to a Mailchimp audience or update an existing subscriber.',
                [p('listId', 'text', true, 'Audience/list ID'), p('email', 'email', true, 'Subscriber email'), p('status', 'select', true, 'Subscription status', { options: ['subscribed', 'unsubscribed', 'pending', 'cleaned'] }), p('mergeFields', 'object', false, 'Merge fields (FNAME, LNAME, etc.)'), p('tags', 'array', false, 'Tags to add')]),
            m('mailchimp:ActionSendCampaign', 'Send a Campaign', 'Mailchimp', 'action',
                'Send or schedule a Mailchimp email campaign.',
                [p('campaignId', 'text', true, 'Campaign ID')]),
            m('mailchimp:TriggerWatchSubscribers', 'Watch Subscribers', 'Mailchimp', 'trigger',
                'Trigger when a new subscriber is added to a Mailchimp audience.',
                [p('listId', 'text', true, 'Audience/list ID')]),
            m('mailchimp:SearchMembers', 'Search Members', 'Mailchimp', 'search',
                'Search for members in a Mailchimp audience.',
                [p('listId', 'text', true, 'Audience/list ID'), p('query', 'text', false, 'Search query')]),

            // ═══════════════════════════════════════
            // TWILIO (3 modules)
            // ═══════════════════════════════════════
            m('twilio:ActionSendSMS', 'Send an SMS', 'Twilio', 'action',
                'Send an SMS message via Twilio.',
                [p('to', 'text', true, 'Recipient phone number (E.164 format)'), p('from', 'text', true, 'Twilio phone number'), p('body', 'text', true, 'Message body (max 1600 chars)')]),
            m('twilio:ActionMakeCall', 'Make a Phone Call', 'Twilio', 'action',
                'Initiate a phone call via Twilio.',
                [p('to', 'text', true, 'Phone number to call'), p('from', 'text', true, 'Twilio phone number'), p('twiml', 'text', true, 'TwiML instructions or URL')]),
            m('twilio:TriggerWatchSMS', 'Watch SMS', 'Twilio', 'trigger',
                'Trigger when a new SMS message is received.',
                [p('phoneNumber', 'text', true, 'Twilio phone number to watch')]),

            // ═══════════════════════════════════════
            // GOOGLE GEMINI AI (3 modules)
            // ═══════════════════════════════════════
            m('gemini:ActionGenerateContent', 'Generate Content', 'Google Gemini AI', 'action',
                'Generate text content using Google Gemini AI models.',
                [p('model', 'select', true, 'Gemini model', { options: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] }), p('prompt', 'text', true, 'Input prompt'), p('temperature', 'number', false, 'Temperature (0-2)'), p('maxOutputTokens', 'number', false, 'Max output tokens')]),
            m('gemini:ActionAnalyzeImage', 'Analyze an Image', 'Google Gemini AI', 'action',
                'Analyze images using Gemini multimodal capabilities.',
                [p('model', 'select', true, 'Model', { options: ['gemini-2.0-flash', 'gemini-1.5-pro'] }), p('image', 'buffer', true, 'Image file'), p('prompt', 'text', true, 'Analysis prompt')]),
            m('gemini:ActionGenerateEmbedding', 'Create an Embedding', 'Google Gemini AI', 'action',
                'Create text embeddings using Gemini embedding models.',
                [p('text', 'text', true, 'Text to embed'), p('model', 'select', true, 'Model', { options: ['text-embedding-004'] })]),

            // ═══════════════════════════════════════
            // ANTHROPIC CLAUDE (2 modules)
            // ═══════════════════════════════════════
            m('anthropic:ActionCreateMessage', 'Create a Message', 'Anthropic Claude', 'action',
                'Generate text using Anthropic Claude models. Send messages with system prompts and conversation history.',
                [p('model', 'select', true, 'Claude model', { options: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] }), p('messages', 'array', true, 'Array of messages with role and content'), p('system', 'text', false, 'System prompt'), p('maxTokens', 'number', true, 'Max tokens in response'), p('temperature', 'number', false, 'Temperature (0-1)')]),
            m('anthropic:ActionAnalyzeImage', 'Analyze Images', 'Anthropic Claude', 'action',
                'Analyze images using Claude vision capabilities.',
                [p('model', 'select', true, 'Model', { options: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] }), p('image', 'buffer', true, 'Image file or URL'), p('prompt', 'text', true, 'Analysis prompt'), p('maxTokens', 'number', true, 'Max tokens')]),

            // ═══════════════════════════════════════
            // WORDPRESS (4 modules)
            // ═══════════════════════════════════════
            m('wordpress:ActionCreatePost', 'Create a Post', 'WordPress', 'action',
                'Creates a new post or page in WordPress.',
                [p('title', 'text', true, 'Post title'), p('content', 'text', true, 'Post content (HTML)'), p('status', 'select', false, 'Post status', { options: ['draft', 'publish', 'pending', 'private'] }), p('categories', 'array', false, 'Category IDs'), p('tags', 'array', false, 'Tag IDs'), p('featuredImage', 'buffer', false, 'Featured image')]),
            m('wordpress:ActionUpdatePost', 'Update a Post', 'WordPress', 'action',
                'Updates an existing WordPress post.',
                [p('postId', 'number', true, 'Post ID'), p('title', 'text', false, 'Updated title'), p('content', 'text', false, 'Updated content'), p('status', 'select', false, 'Status')]),
            m('wordpress:ActionUploadMedia', 'Upload a Media File', 'WordPress', 'action',
                'Uploads a media file to the WordPress media library.',
                [p('file', 'buffer', true, 'File to upload'), p('filename', 'text', true, 'File name'), p('altText', 'text', false, 'Alt text')]),
            m('wordpress:TriggerWatchPosts', 'Watch Posts', 'WordPress', 'trigger',
                'Trigger when a new post is published in WordPress.',
                [p('status', 'select', false, 'Post status to watch', { options: ['publish', 'draft', 'any'] })]),

            // ═══════════════════════════════════════
            // DROPBOX (4 modules)
            // ═══════════════════════════════════════
            m('dropbox:ActionUploadFile', 'Upload a File', 'Dropbox', 'action',
                'Upload a file to Dropbox.',
                [p('path', 'text', true, 'Destination path (e.g., /folder/file.txt)'), p('data', 'buffer', true, 'File data'), p('mode', 'select', false, 'Write mode', { options: ['add', 'overwrite'] })]),
            m('dropbox:ActionCreateFolder', 'Create a Folder', 'Dropbox', 'action',
                'Creates a new folder in Dropbox.',
                [p('path', 'text', true, 'Folder path')]),
            m('dropbox:ActionDownloadFile', 'Download a File', 'Dropbox', 'action',
                'Downloads a file from Dropbox.',
                [p('path', 'text', true, 'File path in Dropbox')]),
            m('dropbox:TriggerWatchFiles', 'Watch Files', 'Dropbox', 'trigger',
                'Trigger when files are created or modified in a Dropbox folder.',
                [p('path', 'text', true, 'Folder path to watch')]),

            // ═══════════════════════════════════════
            // GITHUB (5 modules)
            // ═══════════════════════════════════════
            m('github:ActionCreateIssue', 'Create an Issue', 'GitHub', 'action',
                'Creates a new issue in a GitHub repository.',
                [p('owner', 'text', true, 'Repository owner'), p('repo', 'text', true, 'Repository name'), p('title', 'text', true, 'Issue title'), p('body', 'text', false, 'Issue description (Markdown)'), p('labels', 'array', false, 'Label names'), p('assignees', 'array', false, 'Assignee usernames')]),
            m('github:ActionCreatePullRequest', 'Create a Pull Request', 'GitHub', 'action',
                'Creates a new pull request in a GitHub repository.',
                [p('owner', 'text', true, 'Repository owner'), p('repo', 'text', true, 'Repository name'), p('title', 'text', true, 'PR title'), p('head', 'text', true, 'Head branch'), p('base', 'text', true, 'Base branch'), p('body', 'text', false, 'PR description')]),
            m('github:ActionAddComment', 'Add a Comment', 'GitHub', 'action',
                'Adds a comment to a GitHub issue or pull request.',
                [p('owner', 'text', true, 'Repository owner'), p('repo', 'text', true, 'Repository name'), p('issueNumber', 'number', true, 'Issue or PR number'), p('body', 'text', true, 'Comment body')]),
            m('github:TriggerWatchEvents', 'Watch Events', 'GitHub', 'trigger',
                'Trigger on GitHub repository events (push, pull_request, issues, etc.).',
                [p('owner', 'text', true, 'Repository owner'), p('repo', 'text', true, 'Repository name'), p('events', 'array', false, 'Event types to watch')]),
            m('github:SearchIssues', 'Search Issues/PRs', 'GitHub', 'search',
                'Search GitHub issues and pull requests.',
                [p('query', 'text', true, 'GitHub search query'), p('sort', 'select', false, 'Sort by', { options: ['created', 'updated', 'comments'] })]),

            // ═══════════════════════════════════════
            // RSS (1 module)
            // ═══════════════════════════════════════
            m('rss:TriggerWatchFeed', 'Watch RSS Feed Items', 'RSS', 'trigger',
                'Trigger when a new item appears in an RSS feed. Great for monitoring blogs, news sites, and content updates.',
                [p('url', 'url', true, 'RSS feed URL'), p('limit', 'number', false, 'Max items per run')]),

            // ═══════════════════════════════════════
            // WHATSAPP BUSINESS (3 modules)
            // ═══════════════════════════════════════
            m('whatsapp:ActionSendMessage', 'Send a Message', 'WhatsApp Business', 'action',
                'Send a WhatsApp message via the WhatsApp Business API.',
                [p('to', 'text', true, 'Recipient phone number'), p('type', 'select', true, 'Message type', { options: ['text', 'template', 'image', 'document'] }), p('text', 'text', false, 'Message text (for text type)'), p('templateName', 'text', false, 'Template name (for template type)')]),
            m('whatsapp:ActionSendTemplate', 'Send a Template Message', 'WhatsApp Business', 'action',
                'Send a pre-approved WhatsApp template message.',
                [p('to', 'text', true, 'Recipient phone number'), p('templateName', 'text', true, 'Template name'), p('languageCode', 'text', true, 'Language code'), p('components', 'array', false, 'Template components/variables')]),
            m('whatsapp:TriggerWatchMessages', 'Watch Messages', 'WhatsApp Business', 'trigger',
                'Trigger when a new WhatsApp message is received.',
                []),

            // ═══════════════════════════════════════
            // FLOW CONTROL & TOOLS (7 modules)
            // ═══════════════════════════════════════
            m('builtin:BasicRouter', 'Router', 'Flow Control', 'action',
                'Split the scenario flow into multiple routes based on conditions (filters). Each route can have its own filter and processes independently.',
                [p('routes', 'array', true, 'Route configurations with filter conditions')],
                '## Router\nSplit your scenario into multiple branches.\n\n### Usage\n- Add filters to each route to control data flow\n- Use for conditional logic (if/else)\n- Unfiltered routes act as "else" (default)'),
            m('builtin:BasicAggregator', 'Array Aggregator', 'Flow Control', 'action',
                'Aggregate multiple bundles into a single array. Collects output from iterators or repeated modules into one bundle.',
                [p('sourceModule', 'select', true, 'Module whose output to aggregate'), p('groupBy', 'text', false, 'Group aggregation by field value')]),
            m('builtin:TextAggregator', 'Text Aggregator', 'Flow Control', 'action',
                'Aggregate multiple bundles into a single text string with a separator.',
                [p('sourceModule', 'select', true, 'Module whose output to aggregate'), p('separator', 'text', false, 'Text separator between items'), p('rowSeparator', 'text', false, 'Row separator')]),
            m('builtin:NumericAggregator', 'Numeric Aggregator', 'Flow Control', 'action',
                'Compute sum, average, count, min, or max across multiple bundles.',
                [p('sourceModule', 'select', true, 'Module to aggregate'), p('function', 'select', true, 'Aggregation function', { options: ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] }), p('value', 'text', true, 'Value field to aggregate')]),
            m('builtin:BasicIterator', 'Iterator', 'Flow Control', 'action',
                'Split an array into separate bundles, processing each item individually in subsequent modules.',
                [p('array', 'array', true, 'Array to iterate over')]),
            m('builtin:Repeater', 'Repeater', 'Flow Control', 'action',
                'Repeat subsequent modules a specified number of times. Useful for retry logic or generating sequences.',
                [p('repeats', 'number', true, 'Number of times to repeat'), p('initialValue', 'number', false, 'Starting counter value'), p('step', 'number', false, 'Counter increment')]),
            m('builtin:SetVariable', 'Set Variable', 'Tools', 'action',
                'Set one or more variables that can be referenced in subsequent modules. Variables persist within a single scenario run.',
                [p('variables', 'array', true, 'Variable name-value pairs to set')]),
            m('builtin:SetMultipleVariables', 'Set Multiple Variables', 'Tools', 'action',
                'Set multiple variables at once.',
                [p('variables', 'array', true, 'Array of {name, value} pairs')]),
            m('builtin:GetVariable', 'Get Variable', 'Tools', 'action',
                'Retrieve a variable value that was previously set.',
                [p('name', 'text', true, 'Variable name')]),
            m('builtin:IncrementVariable', 'Increment Value', 'Tools', 'action',
                'Increment a numeric variable by a specified amount.',
                [p('name', 'text', true, 'Variable name'), p('value', 'number', true, 'Amount to increment by')]),
            m('builtin:Sleep', 'Sleep', 'Tools', 'action',
                'Pause scenario execution for a specified duration. Useful for rate limiting or waiting for external processes.',
                [p('delay', 'number', true, 'Delay in seconds (max 300)')]),
            m('builtin:Compose', 'Compose a String', 'Tools', 'action',
                'Create a text string by combining static text with mapped values from previous modules.',
                [p('text', 'text', true, 'Text template with mapped values')]),
            m('builtin:SetError', 'Throw Error', 'Tools', 'action',
                'Deliberately throw an error to stop scenario execution or trigger error handling.',
                [p('message', 'text', true, 'Error message'), p('status', 'number', false, 'Error status code')]),

            // ═══════════════════════════════════════
            // TEXT PARSER (3 modules)
            // ═══════════════════════════════════════
            m('regexp:ActionMatch', 'Match Pattern', 'Text Parser', 'action',
                'Extract data from text using regular expressions. Returns matched groups for data extraction.',
                [p('pattern', 'text', true, 'Regular expression pattern'), p('text', 'text', true, 'Text to search in'), p('globalMatch', 'boolean', false, 'Find all matches (not just first)'), p('caseSensitive', 'boolean', false, 'Case-sensitive matching', { default: true })]),
            m('regexp:ActionReplace', 'Replace', 'Text Parser', 'action',
                'Replace text matching a pattern with new text. Supports regex patterns and capture groups.',
                [p('pattern', 'text', true, 'Search pattern (text or regex)'), p('text', 'text', true, 'Source text'), p('replacement', 'text', true, 'Replacement text'), p('globalReplace', 'boolean', false, 'Replace all occurrences')]),
            m('regexp:ActionHTMLToText', 'HTML to Text', 'Text Parser', 'action',
                'Convert HTML to plain text, stripping all HTML tags.',
                [p('html', 'text', true, 'HTML content to convert')]),

            // ═══════════════════════════════════════
            // DATA STORE (3 modules)
            // ═══════════════════════════════════════
            m('datastore:ActionAddRecord', 'Add/Replace a Record', 'Data Store', 'action',
                'Add a new record to a Make Data Store, or replace an existing one by key.',
                [p('dataStore', 'text', true, 'Data store name/ID'), p('key', 'text', true, 'Record key'), p('data', 'object', true, 'Record data fields')]),
            m('datastore:ActionGetRecord', 'Get a Record', 'Data Store', 'search',
                'Retrieve a record from a Data Store by its key.',
                [p('dataStore', 'text', true, 'Data store name/ID'), p('key', 'text', true, 'Record key')]),
            m('datastore:ActionDeleteRecord', 'Delete a Record', 'Data Store', 'action',
                'Delete a record from a Data Store.',
                [p('dataStore', 'text', true, 'Data store name/ID'), p('key', 'text', true, 'Record key to delete')]),
            m('datastore:SearchRecords', 'Search Records', 'Data Store', 'search',
                'Search for records in a Data Store using filters.',
                [p('dataStore', 'text', true, 'Data store name/ID'), p('filter', 'object', false, 'Filter conditions'), p('limit', 'number', false, 'Max records to return')]),

            // ═══════════════════════════════════════
            // MAKE UTILITIES (3 modules)
            // ═══════════════════════════════════════
            m('email:ActionSendEmail', 'Send an Email', 'Email', 'action',
                'Send an email using Make built-in SMTP (no external service needed). Limited to basic emails.',
                [p('to', 'email', true, 'Recipient email'), p('subject', 'text', true, 'Subject'), p('body', 'text', true, 'Body')]),
            m('csv:ActionParseCSV', 'Parse CSV', 'CSV', 'action',
                'Parse a CSV string or file into structured data bundles.',
                [p('csv', 'text', true, 'CSV content'), p('delimiter', 'text', false, 'Field delimiter', { default: ',' }), p('containsHeaders', 'boolean', false, 'First row is headers', { default: true })]),
            m('csv:ActionCreateCSV', 'Create CSV', 'CSV', 'action',
                'Create a CSV file from structured data.',
                [p('dataStructure', 'select', true, 'Data structure'), p('includeHeaders', 'boolean', false, 'Include header row', { default: true })]),

            // ═══════════════════════════════════════
            // SCHEDULE (1 module)
            // ═══════════════════════════════════════
            m('builtin:Schedule', 'Schedule', 'Schedule', 'trigger',
                'Trigger a scenario on a recurring schedule (every X minutes, hourly, daily, weekly, monthly, or custom cron).',
                [p('interval', 'select', true, 'Run interval', { options: ['every 15 minutes', 'every hour', 'every day', 'every week', 'every month', 'custom'] }), p('cron', 'text', false, 'Custom cron expression (for custom interval)')],
                '## Schedule Trigger\nRun scenarios on a timer.\n\n### Common Intervals\n- Every 15 minutes: Check for new data periodically\n- Daily: Morning reports, daily syncs\n- Weekly: Weekly digests, cleanup tasks'),

            // ═══════════════════════════════════════
            // TIER 1: EXTRACTED FROM BLUEPRINTS (High Usage ≥5)
            // Source: 42 Make.com production blueprints
            // Extraction date: 2026-03-09
            // Total: 3 NEW modules (builtin:BasicRouter already exists)
            // ═══════════════════════════════════════

            // slack:CreateMessage (12 uses) - Real Make.com module ID with accurate parameters
            m('slack:CreateMessage', 'Create a Message', 'Slack', 'action',
                'Post a message to a Slack channel with advanced formatting options including blocks, markdown, and thread support.',
                [
                    p('channelWType', 'select', true, 'Channel entry mode', { options: ['manualy', 'list'] }),
                    p('text', 'text', false, 'Message text content'),
                    p('blocks', 'text', false, 'Message blocks (JSON format for rich formatting)'),
                    p('thread_ts', 'text', false, 'Thread message ID timestamp (for posting replies in thread)'),
                    p('reply_broadcast', 'boolean', false, 'Reply broadcast to channel'),
                    p('link_names', 'boolean', false, 'Link names (find and link @users and #channels)'),
                    p('parse', 'boolean', false, 'Parse message text'),
                    p('mrkdwn', 'boolean', false, 'Use markdown formatting'),
                    p('unfurl_links', 'boolean', false, 'Unfurl primarily text-based content'),
                    p('unfurl_media', 'boolean', false, 'Unfurl media content'),
                    p('icon_emoji', 'text', false, 'Icon emoji (e.g., :robot_face:)'),
                    p('icon_url', 'url', false, 'Icon URL (custom icon image)'),
                    p('username', 'text', false, 'Bot username to display'),
                    p('channelType', 'select', true, 'Channel type', { options: ['public', 'private', 'im', 'mpim'] }),
                    p('channel', 'select', true, 'Channel or user to send message to')
                ]),

            // openai-gpt-3:CreateCompletion (9 uses) - Real OpenAI module ID with full parameter schema
            m('openai-gpt-3:CreateCompletion', 'Create a Completion (Chat)', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
                'Generate AI-powered text completions using OpenAI GPT models. Supports chat and prompt modes with advanced parameters for fine-tuning output.',
                [
                    p('select', 'select', true, 'Method', { options: ['chat', 'prompt'] }),
                    p('max_tokens', 'number', true, 'Maximum tokens to generate in completion'),
                    p('temperature', 'number', false, 'Sampling temperature (0-2). Higher = more random', { min: 0, max: 2 }),
                    p('top_p', 'number', false, 'Nucleus sampling (0-1). Alternative to temperature', { min: 0, max: 1 }),
                    p('n_completions', 'number', false, 'Number of completions to generate'),
                    p('frequency_penalty', 'number', false, 'Frequency penalty (-2 to 2). Penalize repeated tokens', { min: -2, max: 2 }),
                    p('presence_penalty', 'number', false, 'Presence penalty (-2 to 2). Penalize new topics', { min: -2, max: 2 }),
                    p('logit_bias', 'array', false, 'Token probability adjustments'),
                    p('response_format', 'select', false, 'Response format', { options: ['text', 'json_object'] }),
                    p('seed', 'number', false, 'Random seed for deterministic results'),
                    p('stop', 'array', false, 'Stop sequences (up to 4)'),
                    p('additionalParameters', 'array', false, 'Other input parameters'),
                    p('model', 'select', true, 'Model (e.g., gpt-4, gpt-3.5-turbo)'),
                    p('messages', 'array', true, 'Chat messages (for chat method)')
                ]),

            // util:TextAggregator (6 uses) - Utility module for aggregating text from multiple bundles
            m('util:TextAggregator', 'Text Aggregator', 'Tools', 'action',
                'Aggregate text values from multiple bundles into a single concatenated output with optional separator.',
                [
                    p('value', 'text', false, 'Text value to aggregate from each bundle')
                ]),

            // ═══════════════════════════════════════
            // TIER 2: EXTRACTED FROM BLUEPRINTS (Medium Usage 2-4)
            // Source: 42 Make.com production blueprints
            // Extraction date: 2026-03-09
            // Total: 21 modules (excluded 3 duplicates)
            // ═══════════════════════════════════════

// builtin:BasicFeeder (4 uses)
    m('builtin:BasicFeeder', 'Basic Feeder', 'Flow Control', 'action',
      'Performs basic feeder in Flow Control.',
      [
      p('array', 'array', false, 'Array', {"hasSpec":true})
    ]),

    // postgres:InsertIntoTable (4 uses)
    m('postgres:InsertIntoTable', 'Insert Into Table', 'PostgreSQL', 'action',
      'Performs insert into table in PostgreSQL.',
      [
      p('@text1', 'text', false, 'text1'),
      p('@text2', 'text', false, 'text2'),
      p('@text3', 'text', false, 'text3'),
      p('@text4', 'text', false, 'text4'),
      p('@text5', 'text', false, 'text5'),
      p('@text6', 'text', false, 'text6'),
      p('@text7', 'text', false, 'text7'),
      p('@text8', 'text', false, 'text8'),
      p('@text9', 'text', false, 'text9'),
      p('@text10', 'text', false, 'text10'),
      p('@date1', 'date', false, 'date1'),
      p('@date2', 'date', false, 'date2'),
      p('@date3', 'date', false, 'date3')
    ]),

    // salesforce:ActionCreateObject (3 uses)
    m('salesforce:ActionCreateObject', 'Create Object', 'Salesforce', 'action',
      'Performs create object in Salesforce.',
      [
      p('accountId', 'select', false, 'Account (AccountId)'),
      p('assistantName', 'text', false, 'Assistant\'s Name (AssistantName)'),
      p('assistantPhone', 'text', false, 'Asst. Phone (AssistantPhone)'),
      p('birthdate', 'date', false, 'Birthdate (Birthdate)'),
      p('fax', 'text', false, 'Business Fax (Fax)'),
      p('phone', 'text', false, 'Business Phone (Phone)'),
      p('cleanStatus', 'select', false, 'Clean Status (CleanStatus)'),
      p('description', 'text', false, 'Contact Description (Description)'),
      p('jigsaw', 'text', false, 'Data.com Key (Jigsaw)'),
      p('department', 'text', false, 'Department (Department)'),
      p('email', 'email', false, 'Email (Email)'),
      p('emailBouncedDate', 'date', false, 'Email Bounced Date (EmailBouncedDate)'),
      p('emailBouncedReason', 'text', false, 'Email Bounced Reason (EmailBouncedReason)'),
      p('firstName', 'text', false, 'First Name (FirstName)'),
      p('homePhone', 'text', false, 'Home Phone (HomePhone)'),
      p('devintegromat__Interests__c', 'select', false, 'Interests (devintegromat__Interests__c)'),
      p('devintegromat__Languages__c', 'text', false, 'Languages (devintegromat__Languages__c)'),
      p('lastName', 'text', true, 'Last Name (LastName)'),
      p('leadSource', 'select', false, 'Lead Source (LeadSource)'),
      p('devintegromat__Level__c', 'select', false, 'Level (devintegromat__Level__c)'),
      p('mailingCity', 'text', false, 'Mailing City (MailingCity)'),
      p('mailingCountry', 'text', false, 'Mailing Country (MailingCountry)'),
      p('mailingLatitude', 'number', false, 'Mailing Latitude (MailingLatitude)'),
      p('mailingLongitude', 'number', false, 'Mailing Longitude (MailingLongitude)'),
      p('mailingState', 'text', false, 'Mailing State/Province (MailingState)'),
      p('mailingStreet', 'text', false, 'Mailing Street (MailingStreet)'),
      p('mailingPostalCode', 'text', false, 'Mailing Zip/Postal Code (MailingPostalCode)'),
      p('mobilePhone', 'text', false, 'Mobile Phone (MobilePhone)'),
      p('otherCity', 'text', false, 'Other City (OtherCity)'),
      p('otherCountry', 'text', false, 'Other Country (OtherCountry)'),
      p('otherLatitude', 'number', false, 'Other Latitude (OtherLatitude)'),
      p('otherLongitude', 'number', false, 'Other Longitude (OtherLongitude)'),
      p('otherPhone', 'text', false, 'Other Phone (OtherPhone)'),
      p('otherState', 'text', false, 'Other State/Province (OtherState)'),
      p('otherStreet', 'text', false, 'Other Street (OtherStreet)'),
      p('otherPostalCode', 'text', false, 'Other Zip/Postal Code (OtherPostalCode)'),
      p('ownerId', 'select', false, 'Owner (OwnerId)'),
      p('reportsToId', 'select', false, 'Reports To (ReportsToId)'),
      p('salutation', 'select', false, 'Salutation (Salutation)'),
      p('title', 'text', false, 'Title (Title)')
    ]),

    // hubspotcrm:createRecord2020 (3 uses)
    m('hubspotcrm:createRecord2020', 'Create Record2020', 'HubSpot CRM', 'action',
      'Performs create record2020 in HubSpot CRM.',
      [
      p('objectType', 'select', true, 'Record Type', {"options":["contact","company","deal"]}),
      p('propertyGroups', 'select', false, 'Property Groups'),
      p('properties', 'object', true, 'Properties', {"hasSpec":true}),
      p('associations', 'object', false, 'Associations', {"hasSpec":true})
    ]),

    // typeform:WatchEventsWithResponses (3 uses)
    m('typeform:WatchEventsWithResponses', 'Events With Responses', 'Typeform', 'trigger',
      'Triggers when events with responses in Typeform.',
      []),

    // salesforce:createAResponsibleRecord (3 uses)
    m('salesforce:createAResponsibleRecord', 'Create A Responsible Record', 'Salesforce', 'action',
      'Performs create a responsible record in Salesforce.',
      [
      p('sObject', 'select', true, 'Type'),
      p('fields', 'object', false, 'Fields', {"hasSpec":true})
    ]),

    // salesforce:listRecordsInAnObject (3 uses)
    m('salesforce:listRecordsInAnObject', 'List Records In An Object', 'Salesforce', 'action',
      'Performs list records in an object in Salesforce.',
      [
      p('searchType', 'select', true, 'Search By', {"options":["simple","soql"]}),
      p('limit', 'number', false, 'Limit'),
      p('sObject', 'select', true, 'Type'),
      p('filter', 'text', false, 'Filter')
    ]),

    // salesforce:TriggerNewObject (2 uses)
    m('salesforce:TriggerNewObject', 'New Object', 'Salesforce', 'trigger',
      'Triggers when new object in Salesforce.',
      [
      p('watch', 'select', true, 'Watch', {"options":["onlyNew","allChanges"]}),
      p('sObject', 'select', true, 'Type'),
      p('maxResults', 'number', true, 'Maximal count of objects')
    ]),

    // stripe:watchEvents (2 uses)
    m('stripe:watchEvents', 'Events', 'Stripe', 'trigger',
      'Triggers when events in Stripe.',
      []),

    // util:SetVariable2 (2 uses)
    m('util:SetVariable2', 'Set Variable2', 'Tools', 'action',
      'Performs set variable2 in Tools.',
      [
      p('name', 'text', true, 'Variable name'),
      p('scope', 'select', true, 'Variable lifetime', {"options":["roundtrip","execution"]}),
      p('value', 'text', false, 'Variable value')
    ]),

    // wordpress:watchPosts (2 uses)
    m('wordpress:watchPosts', 'Posts', 'WordPress', 'trigger',
      'Triggers when posts in WordPress.',
      [
      p('type', 'select', true, 'Type'),
      p('status', 'select', false, 'Status'),
      p('limit', 'number', false, 'Limit')
    ]),

    // salesforce:ActionSearchObject (2 uses)
    m('salesforce:ActionSearchObject', 'Search Object', 'Salesforce', 'action',
      'Performs search object in Salesforce.',
      [
      p('searchType', 'select', true, 'Search type', {"options":["simple","sosl"]}),
      p('maxResults', 'number', true, 'Maximal count of records'),
      p('sObject', 'select', true, 'Type'),
      p('query', 'text', true, 'Query')
    ]),

    // regexp:Parser (2 uses)
    m('regexp:Parser', 'Parser', 'Text Parser', 'action',
      'Performs parser in Text Parser.',
      [
      p('text', 'text', false, 'Text')
    ]),

    // hubspotcrm:watchContacts (2 uses)
    m('hubspotcrm:watchContacts', 'Contacts', 'HubSpot CRM', 'trigger',
      'Triggers when contacts in HubSpot CRM.',
      [
      p('outputProperties', 'select', false, 'Output Properties'),
      p('limit', 'number', true, 'Limit')
    ]),

    // browse-ai:onTaskFinished (2 uses)
    m('browse-ai:onTaskFinished', 'On Task Finished', 'Browse AI', 'action',
      'Performs on task finished in Browse AI.',
      []),

    // google-sheets:filterRows (2 uses)
    m('google-sheets:filterRows', 'Filter Rows', 'Google Sheets', 'action',
      'Performs filter rows in Google Sheets.',
      [
      p('from', 'select', true, 'Enter a Spreadsheet ID and Sheet Name', {"options":["drive","share"]}),
      p('valueRenderOption', 'select', false, 'Value render option', {"options":["FORMATTED_VALUE","UNFORMATTED_VALUE","FORMULA"]}),
      p('dateTimeRenderOption', 'select', false, 'Date and time render option', {"options":["SERIAL_NUMBER","FORMATTED_STRING"]}),
      p('limit', 'number', false, 'Maximum number of returned rows'),
      p('spreadsheetId', 'select', true, 'Spreadsheet'),
      p('sheetId', 'select', true, 'Sheet Name'),
      p('includesHeaders', 'select', true, 'Table contains headers', {"options":[true,false]}),
      p('tableFirstRow', 'select', true, 'Column range', {"options":["A1:Z1","A1:BZ1","A1:CZ1","A1:DZ1","A1:MZ1","A1:ZZ1","A1:AZZ1","A1:BZZ1","A1:CZZ1","A1:DZZ1","A1:MZZ1","A1:ZZZ1"]}),
      p('filter', 'text', false, 'Filter'),
      p('sortOrder', 'select', false, 'Sort order', {"options":["asc","desc"]}),
      p('orderBy', 'select', false, 'Order by')
    ]),

    // salesforce:watchRecords (2 uses)
    m('salesforce:watchRecords', 'Records', 'Salesforce', 'trigger',
      'Triggers when records in Salesforce.',
      [
      p('select', 'select', true, 'Watch Records', {"options":["create","update"]}),
      p('sObject', 'select', true, 'Type'),
      p('limit', 'number', true, 'Limit')
    ]),

    // google-sheets:addRow (2 uses)
    m('google-sheets:addRow', 'Add Row', 'Google Sheets', 'action',
      'Performs add row in Google Sheets.',
      [
      p('mode', 'select', true, 'Choose a Method', {"options":["select","fromAll","map"]}),
      p('insertUnformatted', 'boolean', true, 'Unformatted'),
      p('valueInputOption', 'select', false, 'Value input option', {"options":["USER_ENTERED","RAW"]}),
      p('insertDataOption', 'select', false, 'Insert data option', {"options":["INSERT_ROWS","OVERWRITE"]}),
      p('from', 'select', true, 'Choose a Drive', {"options":["drive","share","team"]}),
      p('spreadsheetId', 'select', true, 'Spreadsheet ID'),
      p('sheetId', 'select', true, 'Sheet Name'),
      p('includesHeaders', 'select', true, 'Table contains headers', {"options":[true,false]}),
      p('values', 'object', false, 'Values', {"hasSpec":true})
    ]),

    // postgres:Query (2 uses)
    m('postgres:Query', 'Query', 'PostgreSQL', 'action',
      'Performs query in PostgreSQL.',
      [
      p('command', 'text', true, 'Command')
    ]),

    // salesforce:getARecord (2 uses)
    m('salesforce:getARecord', 'Get A Record', 'Salesforce', 'action',
      'Performs get a record in Salesforce.',
      [
      p('sObject', 'select', true, 'Type'),
      p('record', 'text', true, 'Record ID')
    ]),

    // notion:watchDatabaseItems (2 uses)
    m('notion:watchDatabaseItems', 'Database Items', 'Notion', 'trigger',
      'Triggers when database items in Notion.',
      [
      p('select', 'select', true, 'Watch Database Items', {"options":["create","update"]}),
      p('database', 'text', true, 'Database ID'),
      p('limit', 'number', true, 'Limit')
    ]),


            // ═══════════════════════════════════════
            // TIER 3: EXTRACTED FROM BLUEPRINTS (Specialty, 1 use)
            // Source: 42 Make.com production blueprints
            // Extraction date: 2026-03-09
            // Total: 67 modules
            // ═══════════════════════════════════════

// quickbooks:CreateCustomer (1 uses)
    m('quickbooks:CreateCustomer', 'Create Customer', 'QuickBooks', 'action',
      'Performs create customer in QuickBooks.',
      [
      p('DisplayName', 'text', false, 'Display name'),
      p('GivenName', 'text', false, 'Given name'),
      p('MiddleName', 'text', false, 'Middle name'),
      p('FamilyName', 'text', false, 'Family name'),
      p('Title', 'text', false, 'Title'),
      p('Suffix', 'text', false, 'Suffix'),
      p('CompanyName', 'text', false, 'Company name'),
      p('PrimaryEmailAddr', 'email', false, 'Email'),
      p('BillAddr', 'object', false, 'Billing address', {"hasSpec":true}),
      p('ShipAddr', 'object', false, 'Shipping address', {"hasSpec":true}),
      p('WebAddr', 'url', false, 'Web'),
      p('PrimaryPhone', 'text', false, 'Phone'),
      p('AlternatePhone', 'text', false, 'Alternate phone'),
      p('Mobile', 'text', false, 'Mobile'),
      p('Fax', 'text', false, 'Fax'),
      p('Notes', 'text', false, 'Note'),
      p('CurrencyRef', 'text', false, 'Currency'),
      p('ParentRef', 'select', false, 'Parent'),
      p('Job', 'boolean', false, 'Job'),
      p('BillWithParent', 'boolean', false, 'Bill with parent'),
      p('ResaleNum', 'text', false, 'Resale number'),
      p('PrintOnCheckName', 'text', false, 'Print on check name'),
      p('Balance', 'number', false, 'Balance'),
      p('BalanceWithJobs', 'number', false, 'Balance with jobs'),
      p('PaymentMethodRef', 'select', false, 'Payment method'),
      p('SalesTermRef', 'select', false, 'Sales terms'),
      p('PreferredDeliveryMethod', 'select', false, 'Preferred delivery method', {"options":["Print","Email"]}),
      p('DefaultTaxCodeRef', 'select', false, 'Default tax code')
    ]),

    // wordpress:watchUsers (1 uses)
    m('wordpress:watchUsers', 'Users', 'WordPress', 'trigger',
      'Triggers when users in WordPress.',
      [
      p('limit', 'number', true, 'Limit')
    ]),

    // calendly:watchInvitees (1 uses)
    m('calendly:watchInvitees', 'Invitees', 'Calendly', 'trigger',
      'Triggers when invitees in Calendly.',
      []),

    // shopify:WatchOrders (1 uses)
    m('shopify:WatchOrders', 'Orders', 'Shopify', 'trigger',
      'Triggers when orders in Shopify.',
      [
      p('status', 'select', false, 'Status', {"options":["open","closed","cancelled","any"]}),
      p('financial_status', 'select', false, 'Financial status', {"options":["authorized","pending","paid","partially_paid","refunded","partially_refunded","voided","unpaid","any"]}),
      p('fulfillment_status', 'select', false, 'Fulfillment status', {"options":["shipped","partial","unshipped","unfulfilled","any"]}),
      p('limit', 'number', true, 'Limit'),
      p('fields', 'select', false, 'Fields', {"options":["app_id","billing_address","browser_ip","buyer_accepts_marketing","cancel_reason","cancelled_at","cart_token","checkout_id","checkout_token","closed_at","confirmed","contact_email","created_at","currency","current_total_duties_set","customer","customer_locale","device_id","discount_applications","discount_codes","email","financial_status","fulfillment_status","fulfillments","gateway","id","landing_site","landing_site_ref","line_items","location_id","name","note","note_attributes","number","order_number","order_status_url","original_total_duties_set","payment_gateway_names","phone","presentment_currency","processed_at","processing_method","reference","referring_site","refunds","shipping_address","shipping_lines","source_identifier","source_name","source_url","subtotal_price","subtotal_price_set","tags","tax_lines","taxes_included","test","token","total_discounts","total_discounts_set","total_line_items_price","total_line_items_price_set","total_price","total_price_set","total_price_usd","total_shipping_price_set","total_tax","total_tax_set","total_tip_received","total_weight","updated_at","user_id"]})
    ]),

    // microsoft-excel:addAWorksheetRow (1 uses)
    m('microsoft-excel:addAWorksheetRow', 'Add A Worksheet Row', 'Microsoft Excel', 'action',
      'Performs add a worksheet row in Microsoft Excel.',
      [
      p('workbook', 'select', true, 'Workbook'),
      p('worksheet', 'select', true, 'Worksheet'),
      p('valueType', 'select', true, 'Type of Values Being Entered', {"options":["formulas","formulasLocal","values"]}),
      p('row', 'object', false, 'Row', {"hasSpec":true})
    ]),

    // microsoft-excel:retrieveAData (1 uses)
    m('microsoft-excel:retrieveAData', 'Retrieve A Data', 'Microsoft Excel', 'action',
      'Performs retrieve a data in Microsoft Excel.',
      [
      p('workbook', 'select', true, 'Workbook'),
      p('range', 'text', true, 'Range'),
      p('worksheet', 'select', true, 'Worksheet')
    ]),

    // stripe:retrieveCustomer (1 uses)
    m('stripe:retrieveCustomer', 'Retrieve Customer', 'Stripe', 'action',
      'Performs retrieve customer in Stripe.',
      [
      p('customer', 'select', true, 'Customer ID')
    ]),

    // hubspotcrm:createUpdateContact2020 (1 uses)
    m('hubspotcrm:createUpdateContact2020', 'Create Update Contact2020', 'HubSpot CRM', 'action',
      'Performs create update contact2020 in HubSpot CRM.',
      [
      p('propertyGroups', 'select', true, 'Property Groups'),
      p('properties', 'object', true, 'Properties', {"hasSpec":true})
    ]),

    // linkedin-lead-gen-forms:watchFormResponse (1 uses)
    m('linkedin-lead-gen-forms:watchFormResponse', 'Form Response', 'LinkedIn Lead Gen Forms', 'trigger',
      'Triggers when form response in LinkedIn Lead Gen Forms.',
      []),

    // linkedin-lead-gen-forms:GetFormResponse (1 uses)
    m('linkedin-lead-gen-forms:GetFormResponse', 'Get Form Response', 'LinkedIn Lead Gen Forms', 'search',
      'Searches for get form response in LinkedIn Lead Gen Forms.',
      [
      p('account', 'select', true, 'Ad Account URN'),
      p('id', 'text', true, 'Response ID or URN')
    ]),

    // linkedin-lead-gen-forms:GetForm (1 uses)
    m('linkedin-lead-gen-forms:GetForm', 'Get Form', 'LinkedIn Lead Gen Forms', 'search',
      'Searches for get form in LinkedIn Lead Gen Forms.',
      [
      p('id', 'text', true, 'Form ID or URN')
    ]),

    // stripe:createCustomer (1 uses)
    m('stripe:createCustomer', 'Create Customer', 'Stripe', 'action',
      'Performs create customer in Stripe.',
      [
      p('description', 'text', false, 'Description'),
      p('email', 'email', false, 'Email'),
      p('name', 'text', false, 'Name'),
      p('phone', 'text', false, 'Phone'),
      p('address', 'object', false, 'Address', {"hasSpec":true}),
      p('shipping', 'object', false, 'Shipping', {"hasSpec":true}),
      p('payment_method', 'text', false, 'Payment Method ID'),
      p('metadata', 'array', false, 'Metadata', {"hasSpec":true}),
      p('balance', 'number', false, 'Balance'),
      p('coupon', 'select', false, 'Coupon ID'),
      p('invoice_prefix', 'text', false, 'Invoice Prefix', {"min":3,"max":12}),
      p('invoice_settings', 'object', false, 'Invoice Settings', {"hasSpec":true}),
      p('next_invoice_sequence', 'number', false, 'Next Invoice Sequence'),
      p('preferred_locales', 'array', false, 'Preferred Locales', {"hasSpec":true}),
      p('promotion_code', 'select', false, 'Promotion Code ID'),
      p('source', 'text', false, 'Source ID'),
      p('tax_exempt', 'select', false, 'Tax Exempt', {"options":["none","exempt","reverse"]}),
      p('tax_id_data', 'array', false, 'TAX ID Data', {"hasSpec":true})
    ]),

    // stripe:createPaymentIntent (1 uses)
    m('stripe:createPaymentIntent', 'Create Payment Intent', 'Stripe', 'action',
      'Performs create payment intent in Stripe.',
      [
      p('amount', 'number', true, 'Amount', {"max":99999999}),
      p('currency', 'text', true, 'Currency'),
      p('description', 'text', false, 'Description'),
      p('receipt_email', 'email', false, 'Receipt Email'),
      p('confirm', 'boolean', false, 'Confirm this Payment Intent immediately'),
      p('payment_method_types', 'select', false, 'Payment Method Types'),
      p('customer', 'text', false, 'Customer ID'),
      p('ignore::payment_method', 'select', false, 'Payment Method', {"options":["select","create"]}),
      p('shipping', 'object', false, 'Shipping', {"hasSpec":true}),
      p('statement_descriptor', 'text', false, 'Statement Descriptor', {"max":22}),
      p('statement_descriptor_suffix', 'text', false, 'Statement Descriptor Suffix', {"max":22}),
      p('idempotency_key', 'text', false, 'Idempotency Key'),
      p('capture_method', 'select', false, 'Capture Method', {"options":["automatic","manual"]}),
      p('confirmation_method', 'select', false, 'Confirmation Method', {"options":["automatic","manual"]}),
      p('transfer_group', 'text', false, 'Transfer Group'),
      p('application_fee_amount', 'number', false, 'Application Fee Amount'),
      p('on_behalf_of', 'select', false, 'On Behalf Of'),
      p('transfer_data', 'object', false, 'Transfer Data', {"hasSpec":true}),
      p('metadata', 'array', false, 'Metadata', {"hasSpec":true})
    ]),

    // stripe:createInvoiceItem (1 uses)
    m('stripe:createInvoiceItem', 'Create Invoice Item', 'Stripe', 'action',
      'Performs create invoice item in Stripe.',
      [
      p('customer', 'text', true, 'Customer ID'),
      p('input_amount', 'select', true, 'Input an Amount', {"options":["total","unit_amount","price"]}),
      p('description', 'text', false, 'Description'),
      p('period', 'object', false, 'Period', {"hasSpec":true}),
      p('metadata', 'array', false, 'Metadata', {"hasSpec":true}),
      p('discountable', 'boolean', false, 'Discountable'),
      p('invoice', 'text', false, 'Invoice ID'),
      p('subscription', 'text', false, 'Subscription ID'),
      p('tax_rates', 'array', false, 'Tax Rates', {"hasSpec":true}),
      p('amount', 'number', true, 'Amount'),
      p('currency', 'text', false, 'Currency')
    ]),

    // stripe:createInvoice (1 uses)
    m('stripe:createInvoice', 'Create Invoice', 'Stripe', 'action',
      'Performs create invoice in Stripe.',
      [
      p('customer', 'text', true, 'Customer ID'),
      p('auto_advance', 'boolean', true, 'Auto Advance'),
      p('collection_method', 'select', true, 'Collection Method', {"options":["charge_automatically","send_invoice"]}),
      p('description', 'text', false, 'Description'),
      p('subscription', 'text', false, 'Subscription ID'),
      p('metadata', 'array', false, 'Metadata', {"hasSpec":true}),
      p('application_fee_amount', 'number', false, 'Application Fee Amount'),
      p('custom_fields', 'array', false, 'Custom Fields', {"hasSpec":true}),
      p('default_payment_method', 'text', false, 'Default Payment Method ID'),
      p('default_source', 'text', false, 'Default Payment Source ID'),
      p('default_tax_rates', 'text', false, 'Default Tax Rates ID'),
      p('discounts', 'array', false, 'Discounts', {"hasSpec":true}),
      p('footer', 'text', false, 'Footer'),
      p('statement_descriptor', 'text', false, 'Statement Descriptor'),
      p('transfer_data', 'object', false, 'Transfer Data', {"hasSpec":true}),
      p('days_until_due', 'number', false, 'Days Until Due'),
      p('due_date', 'date', false, 'Due Date')
    ]),

    // stripe:finalizeInvoice (1 uses)
    m('stripe:finalizeInvoice', 'Finalize Invoice', 'Stripe', 'action',
      'Performs finalize invoice in Stripe.',
      [
      p('invoice', 'text', true, 'Invoice ID')
    ]),

    // http:ActionGetFile (1 uses)
    m('http:ActionGetFile', 'Get File', 'HTTP', 'action',
      'Performs get file in HTTP.',
      [
      p('url', 'url', true, 'URL'),
      p('serializeUrl', 'boolean', true, 'Serialize URL'),
      p('method', 'text', false, 'Method'),
      p('shareCookies', 'boolean', true, 'Share cookies with other HTTP modules')
    ]),

    // google-email:ActionSendEmail (1 uses)
    m('google-email:ActionSendEmail', 'Send Email', 'Gmail', 'action',
      'Performs send email in Gmail.',
      [
      p('from', 'text', false, 'From'),
      p('to', 'array', true, 'To', {"hasSpec":true}),
      p('subject', 'text', false, 'Subject'),
      p('html', 'text', false, 'Content'),
      p('attachments', 'array', false, 'Attachments', {"hasSpec":true}),
      p('cc', 'array', false, 'Copy recipient', {"hasSpec":true}),
      p('bcc', 'array', false, 'Blind copy recipient', {"hasSpec":true})
    ]),

    // microsoft-excel:watchWorksheetRows (1 uses)
    m('microsoft-excel:watchWorksheetRows', 'Worksheet Rows', 'Microsoft Excel', 'trigger',
      'Triggers when worksheet rows in Microsoft Excel.',
      [
      p('workbook', 'select', true, 'Workbook'),
      p('limit', 'number', true, 'Limit'),
      p('worksheet', 'select', true, 'Worksheet')
    ]),

    // clickup:createTaskInList (1 uses)
    m('clickup:createTaskInList', 'Create Task In List', 'ClickUp', 'action',
      'Performs create task in list in ClickUp.',
      [
      p('team_id', 'select', true, 'Workspace'),
      p('space_id', 'select', true, 'Space'),
      p('folder_id', 'select', true, 'Folder'),
      p('list_id', 'select', true, 'List'),
      p('parent_task_id', 'select', false, 'Parent Task ID'),
      p('name', 'text', true, 'Task Name'),
      p('contentType', 'select', false, 'Content Type', {"options":["markdown"]}),
      p('content', 'text', false, 'Content'),
      p('assignees', 'select', false, 'Assignees'),
      p('tags', 'select', false, 'Tags'),
      p('status', 'select', false, 'Status'),
      p('priority', 'select', false, 'Priority', {"options":["urgent","high","normal","low"]}),
      p('due_date', 'date', false, 'Due Date'),
      p('due_date_time', 'boolean', true, 'Due Date Time'),
      p('time_estimate_in', 'select', false, 'Estimated Time in', {"options":["m","h","d"]}),
      p('start_date', 'date', false, 'Start Date'),
      p('start_date_time', 'boolean', true, 'Start Date Time'),
      p('notify_all', 'boolean', true, 'Notify All'),
      p('custom_fields', 'object', false, 'Custom Fields', {"hasSpec":true})
    ]),

    // slack:NewEvent (1 uses)
    m('slack:NewEvent', 'New Event', 'Slack', 'action',
      'Performs new event in Slack.',
      []),

    // google-sheets:watchRows (1 uses)
    m('google-sheets:watchRows', 'Rows', 'Google Sheets', 'trigger',
      'Triggers when rows in Google Sheets.',
      [
      p('mode', 'select', true, 'Search Method', {"options":["select","fromAll","map"]}),
      p('includesHeaders', 'select', true, 'Table contains headers', {"options":[true,false]}),
      p('limit', 'number', true, 'Limit'),
      p('valueRenderOption', 'select', false, 'Value render option', {"options":["FORMATTED_VALUE","UNFORMATTED_VALUE","FORMULA"]}),
      p('dateTimeRenderOption', 'select', false, 'Date and time render option', {"options":["SERIAL_NUMBER","FORMATTED_STRING"]}),
      p('spreadsheetId', 'text', true, 'Spreadsheet ID'),
      p('sheetId', 'select', true, 'Sheet Name'),
      p('tableFirstRow', 'text', true, 'Row with headers')
    ]),

    // canva:createADesign (1 uses)
    m('canva:createADesign', 'Create A Design', 'Canva', 'action',
      'Performs create a design in Canva.',
      [
      p('folderId', 'select', false, 'Folder ID'),
      p('title', 'text', false, 'Title', {"max":256}),
      p('designType', 'object', true, 'Design Type', {"hasSpec":true}),
      p('assetId', 'select', false, 'Asset ID')
    ]),

    // canva:exportDesign (1 uses)
    m('canva:exportDesign', 'Export Design', 'Canva', 'action',
      'Performs export design in Canva.',
      [
      p('folderId', 'select', true, 'Folder ID'),
      p('format', 'object', true, 'Export Format', {"hasSpec":true}),
      p('design_id', 'select', true, 'Design ID')
    ]),

    // google-drive:uploadAFile (1 uses)
    m('google-drive:uploadAFile', 'Upload A File', 'Google Drive', 'action',
      'Performs upload a file in Google Drive.',
      [
      p('undefined', 'text', false, ''),
      p('select', 'select', true, 'Enter a Folder ID', {"options":["map","value"]}),
      p('title', 'text', false, 'New File Name'),
      p('filename', 'text', true, 'File Name'),
      p('data', 'buffer', true, 'Data'),
      p('convert', 'boolean', true, 'Convert a File'),
      p('destination', 'select', true, 'New Drive Location', {"options":["drive","share","team"]}),
      p('folderId', 'select', true, 'New Folder Location')
    ]),

    // google-sheets:updateRow (1 uses)
    m('google-sheets:updateRow', 'Update Row', 'Google Sheets', 'action',
      'Performs update row in Google Sheets.',
      [
      p('mode', 'select', true, 'Choose a Method', {"options":["select","fromAll","map"]}),
      p('valueInputOption', 'select', false, 'Value input option', {"options":["USER_ENTERED","RAW"]}),
      p('spreadsheetId', 'text', true, 'Spreadsheet'),
      p('sheetId', 'text', true, 'Sheet Name'),
      p('rowNumber', 'number', true, 'Row number'),
      p('tableFirstRow', 'select', true, 'Column range', {"options":["A1:Z1","A1:BZ1","A1:CZ1","A1:DZ1","A1:MZ1","A1:ZZ1"]}),
      p('values', 'object', false, 'Values', {"hasSpec":true})
    ]),

    // clearbit:findPersonOrCompany (1 uses)
    m('clearbit:findPersonOrCompany', 'Find Person Or Company', 'Clearbit', 'action',
      'Performs find person or company in Clearbit.',
      [
      p('email', 'email', true, 'Email address'),
      p('given_name', 'text', false, 'Given Name'),
      p('family_name', 'text', false, 'Family Name'),
      p('ip_address', 'text', false, 'IP Address'),
      p('location', 'text', false, 'Location'),
      p('company', 'text', false, 'Company'),
      p('company_domain', 'text', false, 'Company Domain'),
      p('linkedin', 'text', false, 'Linkedin'),
      p('twitter', 'text', false, 'Twitter'),
      p('facebook', 'text', false, 'Facebook'),
      p('suppression', 'select', false, 'Exclude EU related data ?', {"options":["eu","eu_strict"]}),
      p('subscribe', 'boolean', false, 'Subscribe to changes for this person ?')
    ]),

    // salesloft:createARecord (1 uses)
    m('salesloft:createARecord', 'Create A Record', 'Salesloft', 'action',
      'Performs create a record in Salesloft.',
      [
      p('rType', 'select', true, 'Record Type', {"options":["accounts","activities","cadences","cadence_memberships","activities/calls","conversations/calls","custom_fields","imports","third_party_live_feed_items","live_website_tracking_parameters","notes","people","person_stages","saved_list_views","tasks"]}),
      p('first_name', 'text', false, 'First Name'),
      p('last_name', 'text', false, 'Last Name'),
      p('email_address', 'email', false, 'Email Address'),
      p('title', 'text', false, 'Job Title'),
      p('job_seniority', 'select', false, 'Job Seniority', {"options":["director","executive","individual_contributor","manager","vice_president","unknown"]}),
      p('phone', 'text', false, 'Office Phone'),
      p('phone_extension', 'text', false, 'Office Phone Extension'),
      p('mobile_phone', 'text', false, 'Mobile Phone'),
      p('home_phone', 'text', false, 'Home Phone'),
      p('person_stage_id', 'select', false, 'Person Stage ID'),
      p('account_id', 'number', false, 'Account ID'),
      p('owner_id', 'number', false, 'Owner ID'),
      p('tags', 'array', false, 'Tags', {"hasSpec":true}),
      p('do_not_contact', 'boolean', false, 'Do Not Contact'),
      p('contact_restrictions', 'select', false, 'Contact Restrictions', {"options":["call","email","message"]}),
      p('city', 'text', false, 'City'),
      p('state', 'text', false, 'State'),
      p('country', 'text', false, 'Country'),
      p('locale', 'select', false, 'Time Zone Locale'),
      p('personal_website', 'text', false, 'Personal Website'),
      p('linkedin_url', 'text', false, 'Linkedin URL'),
      p('twitter_handle', 'text', false, 'Twitter Handle'),
      p('custom_fields', 'object', false, 'Account Custom Fields', {"hasSpec":true}),
      p('secondary_email_address', 'email', false, 'Secondary Email Address'),
      p('personal_email_address', 'email', false, 'Personal Email Address'),
      p('person_company_name', 'text', false, 'Company Name'),
      p('person_company_website', 'text', false, 'Company Website'),
      p('person_company_industry', 'text', false, 'Company Industry'),
      p('work_city', 'text', false, 'Work City'),
      p('work_state', 'text', false, 'Work State'),
      p('work_country', 'text', false, 'Work Country'),
      p('import_id', 'select', false, 'Import ID'),
      p('autotag_date', 'boolean', false, 'Autotag Date'),
      p('crm_id_type', 'text', false, 'External CRM ID Type'),
      p('crm_id', 'text', false, 'External CRM Person ID')
    ]),

    // stripe:searchCustomers (1 uses)
    m('stripe:searchCustomers', 'Search Customers', 'Stripe', 'action',
      'Performs search customers in Stripe.',
      [
      p('email', 'email', false, 'Email'),
      p('filter', 'text', false, 'Filter'),
      p('limit', 'number', false, 'Limit')
    ]),

    // youtube:pollingVideos (1 uses)
    m('youtube:pollingVideos', 'Polling Videos', 'YouTube', 'action',
      'Performs polling videos in YouTube.',
      [
      p('undefined', 'text', false, ''),
      p('channelId', 'text', true, 'Channel ID'),
      p('publishedBefore', 'date', false, 'Published Before'),
      p('publishedAfter', 'date', false, 'Published After'),
      p('limit', 'number', true, 'Limit')
    ]),

    // apify:runActor (1 uses)
    m('apify:runActor', 'Run Actor', 'Apify', 'action',
      'Performs run actor in Apify.',
      [
      p('actorId', 'select', true, 'Actor'),
      p('runSync', 'boolean', true, 'Run synchronously'),
      p('inputBody', 'text', false, 'Input JSON'),
      p('build', 'text', false, 'Build'),
      p('timeout', 'number', false, 'Timeout'),
      p('memory', 'select', false, 'Memory', {"options":[128,256,512,1024,2048,4096,8192,16384,32768]})
    ]),

    // util:FunctionSleep (1 uses)
    m('util:FunctionSleep', 'Function Sleep', 'Tools', 'action',
      'Performs function sleep in Tools.',
      [
      p('duration', 'number', true, 'Delay', {"min":1,"max":300})
    ]),

    // apify:fetchDatasetItems (1 uses)
    m('apify:fetchDatasetItems', 'Fetch Dataset Items', 'Apify', 'action',
      'Performs fetch dataset items in Apify.',
      [
      p('datasetId', 'text', true, 'Dataset ID'),
      p('type', 'select', true, 'Data transformation', {"options":["clean","simplified","none"]}),
      p('format', 'select', true, 'Format', {"options":["json","csv","html","xml","rss","xlsx"]}),
      p('limit', 'number', false, 'Limit', {"min":1,"max":100000}),
      p('offset', 'number', false, 'Offset', {"min":0})
    ]),

    // email:ActionSendEmail (1 uses)
    m('email:ActionSendEmail', 'Send Email', 'Email', 'action',
      'Performs send email in Email.',
      [
      p('to', 'array', true, 'To', {"hasSpec":true}),
      p('subject', 'text', false, 'Subject'),
      p('contentType', 'select', true, 'Content Type', {"options":["html","text"]}),
      p('attachments', 'array', false, 'Attachments', {"hasSpec":true}),
      p('cc', 'array', false, 'Copy recipient', {"hasSpec":true}),
      p('bcc', 'array', false, 'Blind copy recipient', {"hasSpec":true}),
      p('from', 'text', false, 'From'),
      p('sender', 'text', false, 'Sender'),
      p('replyTo', 'text', false, 'Reply-To'),
      p('inReplyTo', 'text', false, 'In-Reply-To'),
      p('references', 'array', false, 'References', {"hasSpec":true}),
      p('priority', 'select', false, 'Priority', {"options":["high","normal","low"]}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('text', 'text', false, 'Content')
    ]),

    // gong:TriggerWatchNewCall (1 uses)
    m('gong:TriggerWatchNewCall', 'Watch New Call', 'Gong', 'trigger',
      'Triggers when watch new call in Gong.',
      [
      p('limit', 'number', false, 'Limit')
    ]),

    // gong:MakeAPICall (1 uses)
    m('gong:MakeAPICall', 'Make A P I Call', 'Gong', 'action',
      'Performs make a p i call in Gong.',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method', {"options":["GET","POST","PUT","PATCH","DELETE"]}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('qs', 'array', false, 'Query String', {"hasSpec":true}),
      p('body', 'text', false, 'Body')
    ]),

    // google-cloud-firestore:createDocument (1 uses)
    m('google-cloud-firestore:createDocument', 'Create Document', 'Google Cloud Firestore', 'action',
      'Performs create document in Google Cloud Firestore.',
      []),

    // facebook-insights:GetAdAccountInsights (1 uses)
    m('facebook-insights:GetAdAccountInsights', 'Get Ad Account Insights', 'Facebook Insights', 'search',
      'Searches for get ad account insights in Facebook Insights.',
      [
      p('type', 'select', true, 'Get Insights for', {"options":["campaign","adAccount","adSet","ad"]}),
      p('specify_date', 'select', false, 'Specify Date by', {"options":["date_preset","time_range","time_ranges"]}),
      p('fields', 'select', true, 'Fields'),
      p('breakdowns', 'select', false, 'Breakdowns'),
      p('limit', 'number', true, 'Limit'),
      p('level', 'select', false, 'Level', {"options":["ad","adset","account","campaign"]}),
      p('product_id_limit', 'text', false, 'Product ID Limit'),
      p('use_account_attribution_setting', 'boolean', false, 'Use Account Attribution Setting'),
      p('action_attribution_windows', 'select', false, 'Action Attribution Windows', {"options":["1d_view","7d_view","28d_view","1d_click","7d_click","28d_click","default"]}),
      p('action_breakdowns', 'select', false, 'Action Breakdowns', {"options":["action_device","action_canvas_component_name","action_carousel_card_id","action_carousel_card_name","action_destination","action_reaction","action_target_id","action_type","action_video_sound","action_video_type"]}),
      p('action_report_time', 'select', false, 'Action Report Time', {"options":["impression","conversion"]}),
      p('filtering', 'array', false, 'Filter', {"hasSpec":true}),
      p('sort', 'array', false, 'Sort', {"hasSpec":true}),
      p('business', 'select', true, 'Business Manager'),
      p('adAccount', 'select', true, 'Ad Account'),
      p('campaign', 'select', true, 'Campaign'),
      p('date_preset', 'select', false, 'Date Preset', {"options":["today","yesterday","this_week_sun_today","this_week_mon_today","last_week_sun_sat","last_week_mon_sun","this_month","last_month","this_quarter","last_3d","last_7d","last_14d","last_28d","last_30d","last_90d","this_year","last_year","lifetime"]}),
      p('time_increment', 'text', false, 'Time Increment')
    ]),

    // google-drive:searchForFilesFolders (1 uses)
    m('google-drive:searchForFilesFolders', 'Search For Files Folders', 'Google Drive', 'action',
      'Performs search for files folders in Google Drive.',
      [
      p('select', 'select', true, 'Select the Method', {"options":["map","list"]}),
      p('retrieve', 'select', true, 'Retrieve', {"options":["file","folder","file_folder"]}),
      p('searchType', 'select', false, 'Search', {"options":["title","fulltext","custom"]}),
      p('limit', 'number', false, 'Limit'),
      p('destination', 'select', true, 'Choose a Drive', {"options":["drive","share","team"]}),
      p('folderId', 'select', false, 'Choose a Folder')
    ]),

    // airtable:TriggerWatchRecords (1 uses)
    m('airtable:TriggerWatchRecords', 'Watch Records', 'Airtable', 'trigger',
      'Triggers when watch records in Airtable.',
      [
      p('base', 'select', true, 'Base'),
      p('table', 'select', true, 'Table'),
      p('config', 'object', false, 'Trigger configuration', {"hasSpec":true}),
      p('maxRecords', 'number', true, 'Limit'),
      p('view', 'select', false, 'View'),
      p('formula', 'text', false, 'Formula')
    ]),

    // buffer:ActionCreateStatus (1 uses)
    m('buffer:ActionCreateStatus', 'Create Status', 'Buffer', 'action',
      'Performs create status in Buffer.',
      [
      p('text', 'text', true, 'Text'),
      p('type', 'select', true, 'Publication', {"options":["now","top","queue","scheduled"]}),
      p('useMedia', 'boolean', true, 'Attach media to the update'),
      p('shorten', 'boolean', true, 'Shorten links within text'),
      p('attachment', 'boolean', true, 'Attach links in the text as media'),
      p('profileIds', 'select', true, 'Profiles'),
      p('dateScheduled', 'date', true, 'Date scheduled'),
      p('media', 'object', false, 'Media', {"hasSpec":true})
    ]),

    // gateway:WebhookRespond (1 uses)
    m('gateway:WebhookRespond', 'Webhook Respond', 'Webhooks', 'action',
      'Performs webhook respond in Webhooks.',
      [
      p('status', 'number', true, 'Status', {"min":100}),
      p('body', 'text', false, 'Body'),
      p('headers', 'array', false, 'Custom headers', {"hasSpec":true})
    ]),

    // xml:ParseXML (1 uses)
    m('xml:ParseXML', 'Parse X M L', 'XML', 'action',
      'Performs parse x m l in XML.',
      [
      p('xml', 'text', true, 'XML')
    ]),

    // linkedin-offline-conversions:sendConversionEvents (1 uses)
    m('linkedin-offline-conversions:sendConversionEvents', 'Send Conversion Events', 'LinkedIn Offline Conversions', 'action',
      'Performs send conversion events in LinkedIn Offline Conversions.',
      [
      p('account', 'select', true, 'Account URN'),
      p('events', 'array', true, 'Events', {"hasSpec":true})
    ]),

    // util:SetVariables (1 uses)
    m('util:SetVariables', 'Set Variables', 'Tools', 'action',
      'Performs set variables in Tools.',
      [
      p('variables', 'array', false, 'Variables', {"hasSpec":true}),
      p('scope', 'select', true, 'Variable lifetime', {"options":["roundtrip","execution"]})
    ]),

    // google-ads-campaign-management:getAnAccount (1 uses)
    m('google-ads-campaign-management:getAnAccount', 'Get An Account', 'Google Ads', 'action',
      'Performs get an account in Google Ads.',
      [
      p('account', 'select', true, 'Account/Customer ID')
    ]),

    // google-ads-campaign-management:makeApiCall (1 uses)
    m('google-ads-campaign-management:makeApiCall', 'Make Api Call', 'Google Ads', 'action',
      'Performs make api call in Google Ads.',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method', {"options":["GET","POST","PUT","PATCH","DELETE"]}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('qs', 'array', false, 'Query String', {"hasSpec":true}),
      p('body', 'text', false, 'Body')
    ]),

    // http:ActionSendData (1 uses)
    m('http:ActionSendData', 'Send Data', 'HTTP', 'action',
      'Performs send data in HTTP.',
      [
      p('url', 'url', true, 'URL'),
      p('serializeUrl', 'boolean', true, 'Serialize URL'),
      p('method', 'select', true, 'Method', {"options":["get","head","post","put","patch","delete","options"]}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('qs', 'array', false, 'Query String', {"hasSpec":true}),
      p('bodyType', 'select', false, 'Body type', {"options":["raw","x_www_form_urlencoded","multipart_form_data"]}),
      p('parseResponse', 'boolean', true, 'Parse response'),
      p('authUser', 'text', false, 'User name'),
      p('authPass', 'password', false, 'Password'),
      p('timeout', 'number', false, 'Timeout', {"min":1,"max":300}),
      p('shareCookies', 'boolean', true, 'Share cookies with other HTTP modules'),
      p('ca', 'text', false, 'Self-signed certificate'),
      p('rejectUnauthorized', 'boolean', true, 'Reject connections that are using unverified (self-signed) certificates'),
      p('followRedirect', 'boolean', true, 'Follow redirect'),
      p('useQuerystring', 'boolean', true, 'Disable serialization of multiple same query string keys as arrays'),
      p('gzip', 'boolean', true, 'Request compressed content'),
      p('useMtls', 'boolean', true, 'Use Mutual TLS'),
      p('contentType', 'select', false, 'Content type', {"options":["text/plain","application/json","application/xml","text/xml","text/html","custom"]}),
      p('data', 'buffer', false, 'Request content'),
      p('followAllRedirects', 'boolean', true, 'Follow all redirect')
    ]),

    // sendinblue:SendEmail (1 uses)
    m('sendinblue:SendEmail', 'Send Email', 'Sendinblue', 'action',
      'Performs send email in Sendinblue.',
      [
      p('templateId', 'select', false, 'Template'),
      p('to', 'array', true, 'To', {"hasSpec":true}),
      p('subject', 'text', false, 'Subject'),
      p('htmlContent', 'text', false, 'HTML body'),
      p('textContent', 'text', false, 'Text body'),
      p('replyTo', 'object', true, 'Reply To', {"hasSpec":true}),
      p('attachment', 'array', false, 'Attachments', {"hasSpec":true}),
      p('bcc', 'array', false, 'BCC', {"hasSpec":true}),
      p('cc', 'array', false, 'CC', {"hasSpec":true}),
      p('sender', 'object', false, 'Sender', {"hasSpec":true}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('tags', 'array', false, 'Tags', {"hasSpec":true}),
      p('params', 'array', false, 'Params', {"hasSpec":true})
    ]),

    // stripe:listInvoices (1 uses)
    m('stripe:listInvoices', 'List Invoices', 'Stripe', 'action',
      'Performs list invoices in Stripe.',
      [
      p('customer', 'text', false, 'Customer ID'),
      p('subscription', 'text', false, 'Subscription ID'),
      p('status', 'select', false, 'Status', {"options":["draft","open","paid","uncollectible","void"]}),
      p('collection_method', 'select', false, 'Collection Method', {"options":["charge_automatically","send_invoice"]}),
      p('filter', 'text', false, 'Filter'),
      p('limit', 'number', false, 'Limit')
    ]),

    // notion:searchObjects1 (1 uses)
    m('notion:searchObjects1', 'Search Objects1', 'Notion', 'action',
      'Performs search objects1 in Notion.',
      [
      p('select', 'select', true, 'Search Objects', {"options":["item","database","page"]}),
      p('limit', 'number', false, 'Limit'),
      p('database', 'select', true, 'Database ID'),
      p('filter', 'text', false, 'Filter'),
      p('sorts', 'array', false, 'Sorts', {"hasSpec":true})
    ]),

    // slack:SearchUser (1 uses)
    m('slack:SearchUser', 'Search User', 'Slack', 'search',
      'Searches for search user in Slack.',
      [
      p('email', 'email', true, 'Email')
    ]),

    // notion:updateADatabaseItem (1 uses)
    m('notion:updateADatabaseItem', 'Update A Database Item', 'Notion', 'action',
      'Performs update a database item in Notion.',
      [
      p('select', 'select', true, 'Enter a Database ID', {"options":["map","list"]}),
      p('database', 'text', true, 'Database ID'),
      p('page', 'text', true, 'Page ID'),
      p('fields', 'array', false, 'Fields', {"hasSpec":true})
    ]),

    // jira:SearchIssues (1 uses)
    m('jira:SearchIssues', 'Search Issues', 'Jira', 'search',
      'Searches for search issues in Jira.',
      [
      p('jql', 'text', false, 'JQL'),
      p('maxResults', 'number', false, 'Maximum number of returned issues')
    ]),

    // util:FunctionAggregator2 (1 uses)
    m('util:FunctionAggregator2', 'Function Aggregator2', 'Tools', 'action',
      'Performs function aggregator2 in Tools.',
      [
      p('value', 'number', false, 'Value')
    ]),

    // facebook-lead-ads:NewLeadMultiple (1 uses)
    m('facebook-lead-ads:NewLeadMultiple', 'New Lead Multiple', 'Facebook Lead Ads', 'action',
      'Performs new lead multiple in Facebook Lead Ads.',
      []),

    // zoom:watchRecordings (1 uses)
    m('zoom:watchRecordings', 'Recordings', 'Zoom', 'trigger',
      'Triggers when recordings in Zoom.',
      []),

    // zoom:downloadCloudRecording (1 uses)
    m('zoom:downloadCloudRecording', 'Download Cloud Recording', 'Zoom', 'action',
      'Performs download cloud recording in Zoom.',
      [
      p('url', 'url', true, 'Download URL'),
      p('token', 'text', false, 'Download Token'),
      p('fileName', 'text', false, 'File Name')
    ]),

    // openai-gpt-3:CreateTranscription (1 uses)
    m('openai-gpt-3:CreateTranscription', 'Create Transcription', 'OpenAI (ChatGPT, DALL-E, Whisper)', 'action',
      'Performs create transcription in OpenAI (ChatGPT, DALL-E, Whisper).',
      [
      p('fileName', 'filename', true, 'File Name'),
      p('fileData', 'buffer', true, 'File Data'),
      p('model', 'select', true, 'Model', {"options":["whisper-1"]}),
      p('prompt', 'text', false, 'Prompt'),
      p('temperature', 'number', false, 'Temperature', {"min":0,"max":1}),
      p('language', 'text', false, 'Language')
    ]),

    // elevenlabs:createTextToSpeech (1 uses)
    m('elevenlabs:createTextToSpeech', 'Create Text To Speech', 'ElevenLabs', 'action',
      'Performs create text to speech in ElevenLabs.',
      [
      p('voice_id', 'select', true, 'Voice'),
      p('model_id', 'select', true, 'Model'),
      p('text', 'text', true, 'Text'),
      p('voice_settings', 'object', false, 'Voice Settings', {"hasSpec":true}),
      p('optimize_streaming_latency', 'select', false, 'Optimize Streaming Latency', {"options":["0","1","2","3","4"]})
    ]),

    // slack:uploadAFile (1 uses)
    m('slack:uploadAFile', 'Upload A File', 'Slack', 'action',
      'Performs upload a file in Slack.',
      [
      p('channels', 'select', true, 'Channel type', {"options":["public","private","im","mpim"]}),
      p('fileName', 'filename', true, 'File name'),
      p('data', 'buffer', true, 'Data'),
      p('title', 'text', false, 'Title'),
      p('thread_ts', 'text', false, 'Thread ID (timestamp)'),
      p('initial_comment', 'text', false, 'Initial comment'),
      p('channel', 'select', true, 'User')
    ]),

    // postgres:SelectFromTable (1 uses)
    m('postgres:SelectFromTable', 'Select From Table', 'PostgreSQL', 'action',
      'Performs select from table in PostgreSQL.',
      [
      p('where', 'text', false, 'Filter'),
      p('sort', 'array', false, 'Sort', {"hasSpec":true}),
      p('limit', 'number', false, 'Limit')
    ]),

    // google-ads-conversions:uploadACallCoversion (1 uses)
    m('google-ads-conversions:uploadACallCoversion', 'Upload A Call Coversion', 'Google Ads Conversions', 'action',
      'Performs upload a call coversion in Google Ads Conversions.',
      [
      p('select', 'select', true, 'Upload a Call Conversion', {"options":["map","list"]}),
      p('clientId', 'select', true, 'Account/Customer ID'),
      p('conversionAction', 'select', true, 'Conversion Action ID'),
      p('callerId', 'text', true, 'Customer Phone Number'),
      p('callStartDateTime', 'date', true, 'Call Start Date Time'),
      p('conversionDateTime', 'date', true, 'Conversion Date Time'),
      p('conversionValue', 'number', true, 'Conversion Value'),
      p('currencyCode', 'text', true, 'Currency Code'),
      p('customVariables', 'object', false, 'Custom Variables', {"hasSpec":true}),
      p('consent', 'object', false, 'Consent', {"hasSpec":true})
    ]),

    // postgres:DeleteFromTable (1 uses)
    m('postgres:DeleteFromTable', 'Delete From Table', 'PostgreSQL', 'action',
      'Performs delete from table in PostgreSQL.',
      [
      p('where', 'text', false, 'Filter')
    ]),

    // http:MakeRequest (1 uses)
    m('http:MakeRequest', 'Make Request', 'HTTP', 'action',
      'Performs make request in HTTP.',
      [
      p('url', 'url', true, 'URL'),
      p('method', 'select', true, 'Method', {"options":["get","head","post","put","patch","delete","options"]}),
      p('headers', 'array', false, 'Headers', {"hasSpec":true}),
      p('queryParameters', 'array', false, 'Query parameters', {"hasSpec":true}),
      p('contentType', 'select', false, 'Body content type', {"options":["json","multipart","urlEncoded","custom"]}),
      p('parseResponse', 'boolean', true, 'Parse response'),
      p('stopOnHttpError', 'boolean', true, 'Stop scenario if HTTP request fails'),
      p('timeout', 'number', false, 'Timeout', {"min":1,"max":300}),
      p('allowRedirects', 'boolean', true, 'Allow redirects'),
      p('shareCookies', 'boolean', true, 'Share cookies with other HTTP modules'),
      p('requestCompressedContent', 'boolean', true, 'Request compressed content'),
      p('paginationType', 'select', false, 'Pagination type', {"options":["offsetBased","pageBased","urlBased","tokenBased"]})
    ]),

    // regexp:HTMLToText (1 uses)
    m('regexp:HTMLToText', 'H T M L To Text', 'Text Parser', 'action',
      'Performs h t m l to text in Text Parser.',
      [
      p('html', 'text', false, 'HTML'),
      p('newline', 'select', true, 'Line break', {"options":["lf","crlf","cr"]}),
      p('uppercaseHeadings', 'boolean', true, 'Uppercase headings')
    ]),

    // anthropic-claude:createAMessage (1 uses)
    m('anthropic-claude:createAMessage', 'Create A Message', 'Anthropic (Claude)', 'action',
      'Performs create a message in Anthropic (Claude).',
      [
      p('model', 'select', true, 'Model'),
      p('max_tokens', 'number', true, 'Max Tokens'),
      p('messages', 'array', true, 'Messages', {"hasSpec":true}),
      p('system', 'text', false, 'System Prompt'),
      p('metadata', 'object', false, 'Metadata', {"hasSpec":true}),
      p('stop_sequences', 'array', false, 'Stop Sequences', {"hasSpec":true}),
      p('temperature', 'number', false, 'Temperature', {"min":0,"max":1}),
      p('top_p', 'number', false, 'Top P', {"max":1}),
      p('top_k', 'number', false, 'Top K')
    ]),

    // ═══════════════════════════════════════════════════════════
    // NEW MODULES FROM "Make example flows 2" (244 modules)
    // ═══════════════════════════════════════════════════════════
    // --- AI Tools ---
    // ai-tools:Ask (5 uses in new blueprints)
    m('ai-tools:Ask', 'Ask', 'AI Tools', 'action',
      'Perform Ask in AI Tools',
      [
      p('input', 'text', true, 'Text')
    ]),

    // --- ActiveCampaign ---
    // activecampaign:upsertContact2024 (1 uses in new blueprints)
    m('activecampaign:upsertContact2024', 'upsert Contact2024', 'ActiveCampaign', 'action',
      'Perform upsert Contact2024 in ActiveCampaign',
      [
      p('email', 'email', true, 'Email'),
      p('firstName', 'text', false, 'First Name'),
      p('lastName', 'text', false, 'Last Name'),
      p('phone', 'text', false, 'Phone'),
      p('customFields', 'collection', false, 'Custom Fields')
    ]),
    // activecampaign:UpdateContactListStatus (1 uses in new blueprints)
    m('activecampaign:UpdateContactListStatus', 'Update Contact List Status', 'ActiveCampaign', 'search',
      'Search/list Update Contact List Status in ActiveCampaign',
      [
      p('listId', 'select', true, 'List ID'),
      p('contactId', 'select', true, 'Contact ID'),
      p('status', 'select', false, 'Status')
    ]),
    // activecampaign:AddTagToContact (1 uses in new blueprints)
    m('activecampaign:AddTagToContact', 'Add Tag To Contact', 'ActiveCampaign', 'action',
      'Perform Add Tag To Contact in ActiveCampaign',
      [
      p('contactId', 'select', true, 'Contact ID'),
      p('tagId', 'select', true, 'Tag ID')
    ]),

    // --- Airtable ---
    // airtable:ActionUpdateRecords (4 uses in new blueprints)
    m('airtable:ActionUpdateRecords', 'Action Update Records', 'Airtable', 'action',
      'Perform Action Update Records in Airtable',
      [
      p('base', 'select', true, 'Base'),
      p('typecast', 'boolean', true, 'Smart links'),
      p('useColumnId', 'boolean', true, 'Use Column ID'),
      p('table', 'select', true, 'Table'),
      p('id', 'text', true, 'Record ID'),
      p('record', 'collection', false, 'Record')
    ]),
    // airtable:ActionSearchRecords (3 uses in new blueprints)
    m('airtable:ActionSearchRecords', 'Action Search Records', 'Airtable', 'search',
      'Search/list Action Search Records in Airtable',
      [
      p('base', 'select', true, 'Base'),
      p('table', 'select', true, 'Table'),
      p('formula', 'text', false, 'Formula'),
      p('sort', 'array', false, 'Sort'),
      p('view', 'select', false, 'View'),
      p('maxRecords', 'number', false, 'Limit')
    ]),

    // --- Android ---
    // android:SendNotification (1 uses in new blueprints)
    m('android:SendNotification', 'Send Notification', 'Android', 'action',
      'Perform Send Notification in Android',
      [
      p('title', 'text', true, 'Title'),
      p('body', 'text', true, 'Body'),
      p('notification_action', 'select', false, 'Click action'),
      p('collapsible', 'boolean', true, 'Collapse push notifications')
    ]),
    // android:ScanTaken (1 uses in new blueprints)
    m('android:ScanTaken', 'Scan Taken', 'Android', 'action',
      'Perform Scan Taken in Android',
      [
      p('device', 'text', true, 'Device')
    ]),

    // --- Anthropic (Claude) ---
    // anthropic-claude:createACompletion (15 uses in new blueprints)
    m('anthropic-claude:createACompletion', 'create A Completion', 'Anthropic (Claude)', 'action',
      'Perform create A Completion in Anthropic (Claude)',
      [
      p('model', 'select', true, 'Model'),
      p('prompt', 'text', true, 'Prompt'),
      p('max_tokens_to_sample', 'number', true, 'Max Tokens to Sample'),
      p('stop_sequences', 'array', false, 'Stop Sequences'),
      p('temperature', 'number', false, 'Temperature'),
      p('top_p', 'number', false, 'Top-p'),
      p('top_k', 'number', false, 'Top-k'),
      p('metadata', 'collection', false, 'Metadata')
    ]),

    // --- Apify ai website crawler ---
    // apify-ai-website-crawler:extractUsingActor (1 uses in new blueprints)
    m('apify-ai-website-crawler:extractUsingActor', 'extract Using Actor', 'Apify ai website crawler', 'action',
      'Perform extract Using Actor in Apify ai website crawler',
      [
      p('startUrls', 'array', true, 'Start URLs'),
      p('crawlerType', 'select', true, 'Crawler type')
    ]),

    // --- Apify ---
    // apify:runActorNew (1 uses in new blueprints)
    m('apify:runActorNew', 'run Actor New', 'Apify', 'action',
      'Perform run Actor New in Apify',
      [
      p('actor_search_type', 'select', true, 'Search Actors from'),
      p('runSync', 'boolean', true, 'Run synchronously'),
      p('build', 'text', false, 'Build'),
      p('timeout', 'number', false, 'Timeout'),
      p('memory', 'select', false, 'Memory'),
      p('actorId', 'select', true, 'Actor'),
      p('inputBodyapple_yang~tiktok-transcripts-scraper', 'text', true, 'Input JSON'),
      p('maxTotalChargeUsd', 'number', false, 'Maximum cost per run'),
      p('maxItems', 'text', false, 'Maximum charged results')
    ]),

    // --- Apollo ---
    // apollo:makeApiCall (1 uses in new blueprints)
    m('apollo:makeApiCall', 'make Api Call', 'Apollo', 'action',
      'Perform make Api Call in Apollo',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- Archive ---
    // archive:UnpackAction (1 uses in new blueprints)
    m('archive:UnpackAction', 'Unpack Action', 'Archive', 'action',
      'Perform Unpack Action in Archive',
      [
      p('data', 'text', true, 'Data')
    ]),

    // --- Asana ---
    // asana:CreateTask (8 uses in new blueprints)
    m('asana:CreateTask', 'Create Task', 'Asana', 'action',
      'Perform Create Task in Asana',
      [
      p('destination', 'select', true, 'Task destination'),
      p('name', 'text', false, 'Task Name'),
      p('notes', 'text', false, 'Notes'),
      p('html_notes', 'text', false, 'HTML Notes'),
      p('workspaceAlt', 'select', false, 'Workspace ID'),
      p('due', 'select', false, 'Due'),
      p('resource_subtype', 'select', false, 'Resource Subtype'),
      p('liked', 'boolean', false, 'Liked'),
      p('completed', 'boolean', false, 'Task Completed?'),
      p('external', 'collection', false, 'External'),
      p('workspaceAlt2', 'select', false, 'Workspace ID'),
      p('tags', 'select', false, 'Tags'),
      p('workspace', 'select', true, 'Workspace ID'),
      p('assignee', 'text', false, 'Task Assignee ID'),
      p('assignee_status', 'select', false, 'Assignee Status'),
      p('followers', 'array', false, 'Followers'),
      p('projects', 'select', true, 'Projects'),
      p('ignoreMe', 'select', false, 'Generate Workspace Custom Fields'),
      p('ignoreMeTwo', 'select', false, 'Generate Workspace Projects Custom Fields'),
      p('workspace_custom_fields', 'collection', false, 'Workspace Custom Fields'),
      p('project_custom_fields', 'collection', false, 'Project Custom Fields')
    ]),
    // asana:WatchNewTasks (2 uses in new blueprints)
    m('asana:WatchNewTasks', 'Watch New Tasks', 'Asana', 'trigger',
      'Watch for Watch New Tasks in Asana',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('filter', 'select', true, 'Filter'),
      p('completed_since', 'date', false, 'Completed Since'),
      p('modified_since', 'date', false, 'Modified Since '),
      p('page', 'number', true, 'Limit'),
      p('project', 'select', true, 'Project ID')
    ]),
    // asana:ListTasks (2 uses in new blueprints)
    m('asana:ListTasks', 'List Tasks', 'Asana', 'search',
      'Search/list List Tasks in Asana',
      [
      p('filter', 'select', true, 'Filter'),
      p('completed_since', 'date', false, 'Completed Since'),
      p('modified_since', 'date', false, 'Modified Since '),
      p('page', 'number', false, 'Limit'),
      p('project', 'select', true, 'Project')
    ]),
    // asana:ListProjects (1 uses in new blueprints)
    m('asana:ListProjects', 'List Projects', 'Asana', 'search',
      'Search/list List Projects in Asana',
      [
      p('workspace', 'select', false, 'Workspace ID'),
      p('archived', 'boolean', false, 'Archived'),
      p('page', 'number', false, 'Limit'),
      p('team', 'select', false, 'Team ID')
    ]),
    // asana:CreateProject (1 uses in new blueprints)
    m('asana:CreateProject', 'Create Project', 'Asana', 'action',
      'Perform Create Project in Asana',
      [
      p('workspace', 'select', false, 'Workspace ID'),
      p('name', 'text', true, 'Name'),
      p('notes', 'text', false, 'Notes'),
      p('color', 'select', false, 'Color'),
      p('default_view', 'select', false, 'Default View'),
      p('due_on', 'date', false, 'Due On'),
      p('start_on', 'date', false, 'Start On'),
      p('is_template', 'boolean', false, 'Is Template'),
      p('public', 'boolean', false, 'Public')
    ]),
    // asana:WatchProjectTask (1 uses in new blueprints)
    m('asana:WatchProjectTask', 'Watch Project Task', 'Asana', 'trigger',
      'Watch for Watch Project Task in Asana',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // asana:GetTask (1 uses in new blueprints)
    m('asana:GetTask', 'Get Task', 'Asana', 'search',
      'Search/list Get Task in Asana',
      [
      p('selectOrMap', 'select', true, 'Enter a Task ID'),
      p('task_gid', 'text', true, 'Task ID')
    ]),
    // asana:WatchProjects (1 uses in new blueprints)
    m('asana:WatchProjects', 'Watch Projects', 'Asana', 'trigger',
      'Watch for Watch Projects in Asana',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('workspace', 'select', false, 'Workspace ID'),
      p('archived', 'boolean', false, 'Archived'),
      p('page', 'number', true, 'Limit')
    ]),
    // asana:ListTaskAttachments (1 uses in new blueprints)
    m('asana:ListTaskAttachments', 'List Task Attachments', 'Asana', 'search',
      'Search/list List Task Attachments in Asana',
      [
      p('selectOrMap', 'select', true, 'Enter a Task ID'),
      p('page', 'number', false, 'Limit'),
      p('task_gid', 'text', true, 'Task ID')
    ]),
    // asana:UpdateTask (1 uses in new blueprints)
    m('asana:UpdateTask', 'Update Task', 'Asana', 'action',
      'Perform Update Task in Asana',
      [
      p('selectOrMap', 'select', true, 'Enter a Task ID'),
      p('name', 'text', false, 'Task Name'),
      p('notes', 'text', false, 'Notes'),
      p('html_notes', 'text', false, 'HTML Notes'),
      p('assignee', 'select', false, 'Task Assignee'),
      p('due', 'select', false, 'Due'),
      p('resource_subtype', 'select', false, 'Resource Subtype'),
      p('liked', 'boolean', false, 'Liked'),
      p('completed', 'boolean', false, 'Task Completed?'),
      p('external', 'collection', false, 'External'),
      p('task_gid', 'text', true, 'Task ID'),
      p('workspace', 'select', false, 'Workspace ID')
    ]),

    // --- Attio ---
    // attio:makeAnApiCall (1 uses in new blueprints)
    m('attio:makeAnApiCall', 'make An Api Call', 'Attio', 'action',
      'Perform make An Api Call in Attio',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),
    // attio:getAPerson (1 uses in new blueprints)
    m('attio:getAPerson', 'get A Person', 'Attio', 'search',
      'Search/list get A Person in Attio',
      [
      p('record_id', 'select', true, 'Person ID')
    ]),

    // --- Barcode ---
    // barcode:GenerateBarcode (1 uses in new blueprints)
    m('barcode:GenerateBarcode', 'Generate Barcode', 'Barcode', 'action',
      'Perform Generate Barcode in Barcode',
      [
      p('bcid', 'select', true, 'Barcode type'),
      p('text', 'text', true, 'Text'),
      p('fileName', 'text', true, 'File name'),
      p('paddingwidth', 'number', false, 'Padding width'),
      p('paddingheight', 'number', false, 'Padding height'),
      p('scale', 'number', false, 'Scale'),
      p('rotate', 'select', false, 'Rotate'),
      p('eclevel', 'select', false, 'Error correction')
    ]),

    // --- Bitrix24 ---
    // bitrix24:watchLeads (1 uses in new blueprints)
    m('bitrix24:watchLeads', 'watch Leads', 'Bitrix24', 'trigger',
      'Watch for watch Leads in Bitrix24',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('select', 'select', true, 'Watch Leads'),
      p('filter', 'text', false, 'Filter'),
      p('limit', 'number', true, 'Limit')
    ]),
    // bitrix24:getAContact (1 uses in new blueprints)
    m('bitrix24:getAContact', 'get A Contact', 'Bitrix24', 'search',
      'Search/list get A Contact in Bitrix24',
      [
      p('contact', 'select', true, 'Contact ID')
    ]),

    // --- BrowserAct ---
    // browser-act:test (5 uses in new blueprints)
    m('browser-act:test', 'test', 'BrowserAct', 'action',
      'Perform test in BrowserAct',
      [
      p('type', 'select', true, 'Search Workflows From'),
      p('timeout', 'number', false, 'Timeout'),
      p('workflowId', 'select', true, 'Workflow'),
      p('open_incognito_mode', 'boolean', true, 'Incognito Mode'),
      p('inputParameters', 'collection', false, 'Input Parameters')
    ]),

    // --- CSV ---
    // csv:CreateAggregator (2 uses in new blueprints)
    m('csv:CreateAggregator', 'Create Aggregator', 'CSV', 'action',
      'Perform Create Aggregator in CSV',
      [
      p('includeHeaders', 'boolean', true, 'Include headers in the first row'),
      p('delimiterType', 'select', true, 'Delimiter'),
      p('newlineType', 'select', true, 'Newline'),
      p('delimiter', 'text', true, 'Delimiter character')
    ]),
    // csv:ParseCSV (1 uses in new blueprints)
    m('csv:ParseCSV', 'Parse C S V', 'CSV', 'action',
      'Perform Parse C S V in CSV',
      [
      p('csv', 'text', true, 'CSV')
    ]),

    // --- Clearbit ---
    // clearbit:findCompanyByDomainName (2 uses in new blueprints)
    m('clearbit:findCompanyByDomainName', 'find Company By Domain Name', 'Clearbit', 'search',
      'Search/list find Company By Domain Name in Clearbit',
      [
      p('domain', 'text', true, 'Domain'),
      p('company_name', 'text', false, 'Company Name'),
      p('linkedin', 'text', false, 'Linkedin'),
      p('twitter', 'text', false, 'Twitter'),
      p('facebook', 'text', false, 'Facebook')
    ]),

    // --- ClickUp ---
    // clickup:makeApiCall (1 uses in new blueprints)
    m('clickup:makeApiCall', 'make Api Call', 'ClickUp', 'action',
      'Perform make Api Call in ClickUp',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- Cloudconvert ---
    // cloudconvert:CreateArchive (2 uses in new blueprints)
    m('cloudconvert:CreateArchive', 'Create Archive', 'Cloudconvert', 'action',
      'Perform Create Archive in Cloudconvert',
      [
      p('import', 'collection', true, 'Import options'),
      p('options', 'collection', true, 'Archive options'),
      p('export', 'collection', true, 'Export options')
    ]),
    // cloudconvert:ConvertFile (1 uses in new blueprints)
    m('cloudconvert:ConvertFile', 'Convert File', 'Cloudconvert', 'action',
      'Perform Convert File in Cloudconvert',
      [
      p('import', 'collection', true, 'Import options'),
      p('options', 'collection', true, 'Convert options'),
      p('export', 'collection', true, 'Export options')
    ]),

    // --- Cloudmersive ---
    // cloudmersive:validateEmailAddress (1 uses in new blueprints)
    m('cloudmersive:validateEmailAddress', 'validate Email Address', 'Cloudmersive', 'action',
      'Perform validate Email Address in Cloudmersive',
      [
      p('email', 'email', true, 'Email Address')
    ]),

    // --- Code ---
    // code:ExecuteCode (1 uses in new blueprints)
    m('code:ExecuteCode', 'Execute Code', 'Code', 'action',
      'Perform Execute Code in Code',
      [
      p('language', 'select', true, 'Language'),
      p('input', 'array', false, 'Input'),
      p('dependencies', 'array', false, 'Additional dependencies (Enterprise plans only)'),
      p('inputFormat', 'select', true, 'Input format'),
      p('codeEditorJavascript', 'text', true, 'Code')
    ]),

    // --- Comidp ---
    // comidp:IntelligentImageEnhancementCreateTask (1 uses in new blueprints)
    m('comidp:IntelligentImageEnhancementCreateTask', 'Intelligent Image Enhancement Create Task', 'Comidp', 'action',
      'Perform Intelligent Image Enhancement Create Task in Comidp',
      [
      p('__IMTCONN__', 'text', true, 'Connection')
    ]),
    // comidp:IntelligentDocumentParsingFileUpload (1 uses in new blueprints)
    m('comidp:IntelligentDocumentParsingFileUpload', 'Intelligent Document Parsing File Upload', 'Comidp', 'action',
      'Perform Intelligent Document Parsing File Upload in Comidp',
      [
      p('file_name', 'text', true, 'file_name'),
      p('file', 'text', false, 'file'),
      p('taskId', 'text', false, 'task ID'),
      p('password', 'text', false, 'password'),
      p('parameter', 'text', false, 'parameter')
    ]),
    // comidp:IntelligentDocumentParsingStartTask (1 uses in new blueprints)
    m('comidp:IntelligentDocumentParsingStartTask', 'Intelligent Document Parsing Start Task', 'Comidp', 'action',
      'Perform Intelligent Document Parsing Start Task in Comidp',
      [
      p('taskId', 'text', true, 'task ID')
    ]),
    // comidp:IntelligentDocumentParsingGetFileInformation (1 uses in new blueprints)
    m('comidp:IntelligentDocumentParsingGetFileInformation', 'Intelligent Document Parsing Get File Information', 'Comidp', 'search',
      'Search/list Intelligent Document Parsing Get File Information in Comidp',
      [
      p('fileId', 'text', true, 'file ID')
    ]),

    // --- DataForSEO Backlinks API ---
    // dfs-backlinks-api:getBacklinks (9 uses in new blueprints)
    m('dfs-backlinks-api:getBacklinks', 'get Backlinks', 'DataForSEO Backlinks API', 'search',
      'Search/list get Backlinks in DataForSEO Backlinks API',
      [
      p('target', 'text', true, 'Target (Domain, Subdomain, URL)'),
      p('mode', 'select', false, 'Backlink Status'),
      p('filters', 'text', false, 'Filters'),
      p('order_by', 'array', false, 'Results Sorting Rules'),
      p('limit', 'number', false, 'Limit (up to 1000)'),
      p('offset', 'number', false, 'Offset'),
      p('backlinks_status_type', 'select', false, 'Backlink Status'),
      p('include_subdomains', 'boolean', false, 'Include Subdomains'),
      p('include_indirect_links', 'boolean', false, 'Include Indirect Links'),
      p('exclude_internal_backlinks', 'boolean', false, 'Exclude Internal Links'),
      p('rank_scale', 'select', false, 'Rank Scale')
    ]),

    // --- DataForSEO Labs API ---
    // dataforseo-labs-api:getRankedKeywords (6 uses in new blueprints)
    m('dataforseo-labs-api:getRankedKeywords', 'get Ranked Keywords', 'DataForSEO Labs API', 'search',
      'Search/list get Ranked Keywords in DataForSEO Labs API',
      [
      p('target', 'text', true, 'Target Domain'),
      p('location_name', 'text', false, 'Location'),
      p('language_name', 'text', false, 'Language'),
      p('ignore_synonyms', 'boolean', false, 'Ignore Synonyms'),
      p('item_types', 'select', false, 'Item Types'),
      p('include_clickstream_data', 'boolean', false, 'Include clickstream-based metrics in the result?'),
      p('load_rank_absolute', 'boolean', false, 'Return Rankings Distribution by Rank_absolute?'),
      p('historical_serp_mode', 'select', false, 'Data Collection Mode'),
      p('filters', 'text', false, 'Filters'),
      p('order_by', 'array', false, 'Results Sorting Rules'),
      p('limit', 'number', false, 'Limit (up to 1000)'),
      p('offset', 'number', false, 'Offset')
    ]),

    // --- Datastore ---
    // datastore:AddRecord (2 uses in new blueprints)
    m('datastore:AddRecord', 'Add Record', 'Datastore', 'action',
      'Perform Add Record in Datastore',
      [
      p('key', 'text', false, 'Key'),
      p('overwrite', 'boolean', true, 'Overwrite an existing record'),
      p('data', 'collection', false, 'Record')
    ]),
    // datastore:SearchRecord (2 uses in new blueprints)
    m('datastore:SearchRecord', 'Search Record', 'Datastore', 'search',
      'Search/list Search Record in Datastore',
      [
      p('filter', 'text', true, 'Filter'),
      p('sort', 'array', false, 'Sort'),
      p('mappAbleLimit', 'number', false, 'Mappable Limit')
    ]),
    // datastore:DeleteRecord (1 uses in new blueprints)
    m('datastore:DeleteRecord', 'Delete Record', 'Datastore', 'action',
      'Perform Delete Record in Datastore',
      [
      p('key', 'text', true, 'Key')
    ]),
    // datastore:GetRecord (1 uses in new blueprints)
    m('datastore:GetRecord', 'Get Record', 'Datastore', 'search',
      'Search/list Get Record in Datastore',
      [
      p('key', 'text', true, 'Key'),
      p('returnWrapped', 'boolean', true, 'Return Wrapped Output')
    ]),
    // datastore:ExistRecord (1 uses in new blueprints)
    m('datastore:ExistRecord', 'Exist Record', 'Datastore', 'action',
      'Perform Exist Record in Datastore',
      [
      p('key', 'text', true, 'Key')
    ]),

    // --- Deepl ---
    // deepl:translateText (2 uses in new blueprints)
    m('deepl:translateText', 'translate Text', 'Deepl', 'action',
      'Perform translate Text in Deepl',
      [
      p('text', 'text', true, 'Text'),
      p('target_lang', 'select', true, 'Target Language'),
      p('source_lang', 'select', false, 'Source Language'),
      p('split_sentences', 'select', false, 'Split Sentences'),
      p('preserve_formatting', 'boolean', false, 'Preserve Formatting'),
      p('glossary_id', 'select', false, 'Glossary ID'),
      p('tag_handling', 'select', false, 'Tag Handling'),
      p('non_splitting_tags', 'text', false, 'Non Splitting Tags'),
      p('outline_detection', 'boolean', false, 'Outline Detection'),
      p('splitting_tags', 'text', false, 'Splitting Tags'),
      p('ignore_tags', 'text', false, 'Ignored Tags')
    ]),

    // --- Discord ---
    // discord:createMessage (1 uses in new blueprints)
    m('discord:createMessage', 'create Message', 'Discord', 'action',
      'Perform create Message in Discord',
      [
      p('select', 'select', true, 'Choose a Method'),
      p('content', 'text', false, 'Message'),
      p('tts', 'boolean', false, 'Is TTS message'),
      p('embeds', 'array', false, 'Embeds'),
      p('sticker_ids', 'array', false, 'Stickers'),
      p('components', 'array', false, 'Components'),
      p('files', 'array', false, 'Files'),
      p('message_reference', 'collection', false, 'Message Reference'),
      p('channelId', 'select', true, 'Channel ID')
    ]),
    // discord:WatchChannelMessages (1 uses in new blueprints)
    m('discord:WatchChannelMessages', 'Watch Channel Messages', 'Discord', 'trigger',
      'Watch for Watch Channel Messages in Discord',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('channelId', 'select', true, 'Channel ID'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Dropbox ---
    // dropbox:uploadLargeFile (2 uses in new blueprints)
    m('dropbox:uploadLargeFile', 'upload Large File', 'Dropbox', 'action',
      'Perform upload Large File in Dropbox',
      [
      p('path', 'text', true, 'Folder'),
      p('filename', 'text', true, 'File Name'),
      p('data', 'text', true, 'Data'),
      p('overwrite', 'boolean', true, 'Overwrite an existing file')
    ]),

    // --- Easyship ---
    // easyship:createShipment (1 uses in new blueprints)
    m('easyship:createShipment', 'create Shipment', 'Easyship', 'action',
      'Perform create Shipment in Easyship',
      [
      p('destination_country_alpha2', 'select', true, 'Destination Country'),
      p('destination_city', 'text', true, 'Destination City'),
      p('destination_postal_code', 'text', true, 'Destination Postal Code'),
      p('destination_state', 'text', false, 'Destination State'),
      p('destination_name', 'text', true, 'Destination Name'),
      p('destination_company_name', 'text', false, 'Destination Company Name'),
      p('destination_address_line_1', 'text', true, 'Destination Address Line 1'),
      p('destination_address_line_2', 'text', false, 'Destination Address Line 2'),
      p('destination_phone_number', 'text', true, 'Destination Phone Number'),
      p('destination_email_address', 'email', true, 'Destination Email Address'),
      p('items', 'array', true, 'Items'),
      p('platform_name', 'text', false, 'Platform Name'),
      p('platform_order_number', 'text', false, 'Platform Order Number'),
      p('taxes_duties_paid_by', 'select', false, 'Taxes & Duties Paid By'),
      p('is_insured', 'boolean', false, 'Is Insured'),
      p('selected_courier_id', 'text', false, 'Selected Courier ID'),
      p('allow_courier_fallback', 'boolean', false, 'Allow Courier Fallback'),
      p('consignee_tax_id', 'text', false, 'Consignee Tax ID'),
      p('seller_notes', 'text', false, 'Seller Notes'),
      p('buyer_notes', 'text', false, 'Buyer Notes'),
      p('order_notes', 'text', false, 'Order Notes'),
      p('box', 'collection', false, 'Box'),
      p('total_actual_weight', 'number', false, 'Total Actual Weight')
    ]),

    // --- Egnyte ---
    // egnyte:SearchFilesFolders (1 uses in new blueprints)
    m('egnyte:SearchFilesFolders', 'Search Files Folders', 'Egnyte', 'search',
      'Search/list Search Files Folders in Egnyte',
      [
      p('query', 'text', false, 'Query'),
      p('path', 'text', false, 'Folder path'),
      p('modified_before', 'date', false, 'Modified before'),
      p('modified_after', 'date', false, 'Modified after'),
      p('type', 'select', false, 'Type'),
      p('namespaces', 'select', false, 'Namespaces'),
      p('custom_metadata', 'array', false, 'Custom metadata'),
      p('limit', 'number', false, 'Limit')
    ]),
    // egnyte:moveFile (1 uses in new blueprints)
    m('egnyte:moveFile', 'move File', 'Egnyte', 'action',
      'Perform move File in Egnyte',
      [
      p('id_or_path', 'select', true, 'Map ID or select a path'),
      p('destination', 'text', true, 'Destination'),
      p('newName', 'text', false, 'New name'),
      p('path', 'text', true, 'File path')
    ]),
    // egnyte:createAFileLink (1 uses in new blueprints)
    m('egnyte:createAFileLink', 'create A File Link', 'Egnyte', 'action',
      'Perform create A File Link in Egnyte',
      [
      p('path', 'text', true, 'File'),
      p('accessibility', 'select', true, 'Accessibility'),
      p('link_to_current', 'boolean', false, 'Link to current'),
      p('add_file_name', 'boolean', false, 'Add file name'),
      p('protection', 'boolean', true, 'View only'),
      p('expiry_date', 'date', false, 'Expire date'),
      p('expiry_clicks', 'number', false, 'Expire clicks'),
      p('send_email', 'boolean', true, 'Send email'),
      p('notify', 'boolean', true, 'Notify')
    ]),

    // --- Email ---
    // email:TriggerNewEmail (4 uses in new blueprints)
    m('email:TriggerNewEmail', 'Trigger New Email', 'Email', 'trigger',
      'Watch for Trigger New Email in Email',
      [
      p('account', 'text', true, 'Connection'),
      p('criteria', 'select', true, 'Criteria'),
      p('from', 'email', false, 'Sender email address'),
      p('to', 'email', false, 'Recipient email address'),
      p('subject', 'text', false, 'Subject'),
      p('text', 'text', false, 'Phrase'),
      p('markSeen', 'boolean', false, 'Mark message(s) as read when fetched'),
      p('maxResults', 'number', false, 'Maximum number of results'),
      p('folder', 'text', true, 'Folder')
    ]),
    // email:ActionSendMeEmail (2 uses in new blueprints)
    m('email:ActionSendMeEmail', 'Action Send Me Email', 'Email', 'action',
      'Perform Action Send Me Email in Email',
      [
      p('to', 'select', true, 'To'),
      p('subject', 'text', false, 'Subject'),
      p('html', 'text', false, 'Content')
    ]),
    // email:ActionCreateDraft (1 uses in new blueprints)
    m('email:ActionCreateDraft', 'Action Create Draft', 'Email', 'action',
      'Perform Action Create Draft in Email',
      [
      p('folder', 'text', true, 'Folder'),
      p('to', 'array', true, 'To'),
      p('subject', 'text', false, 'Subject'),
      p('contentType', 'select', true, 'Content Type'),
      p('attachments', 'array', false, 'Attachments'),
      p('cc', 'array', false, 'Copy recipient'),
      p('bcc', 'array', false, 'Blind copy recipient'),
      p('from', 'text', false, 'From'),
      p('sender', 'text', false, 'Sender'),
      p('replyTo', 'text', false, 'Reply-To'),
      p('inReplyTo', 'text', false, 'In-Reply-To'),
      p('references', 'array', false, 'References'),
      p('priority', 'select', false, 'Priority'),
      p('headers', 'array', false, 'Headers'),
      p('html', 'text', false, 'Content')
    ]),

    // --- Emercury ---
    // emercury:getAudience (3 uses in new blueprints)
    m('emercury:getAudience', 'get Audience', 'Emercury', 'search',
      'Search/list get Audience in Emercury',
      [
      p('__IMTCONN__', 'text', true, 'Connection')
    ]),
    // emercury:getSubscribers (3 uses in new blueprints)
    m('emercury:getSubscribers', 'get Subscribers', 'Emercury', 'search',
      'Search/list get Subscribers in Emercury',
      [
      p('audienceid', 'text', true, 'Audience ID')
    ]),

    // --- Etsy ---
    // etsy:listListings (1 uses in new blueprints)
    m('etsy:listListings', 'list Listings', 'Etsy', 'search',
      'Search/list list Listings in Etsy',
      [
      p('__IMTCONN__', 'text', false, 'Connection')
    ]),

    // --- Eventbrite ---
    // eventbrite:watchAttendees (1 uses in new blueprints)
    m('eventbrite:watchAttendees', 'watch Attendees', 'Eventbrite', 'trigger',
      'Watch for watch Attendees in Eventbrite',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('organizationId', 'select', true, 'Organization'),
      p('limit', 'number', true, 'Limit'),
      p('status', 'select', false, 'Status'),
      p('id', 'select', true, 'Event')
    ]),

    // --- Everhour ---
    // everhour:TriggerWatchNewTasks (1 uses in new blueprints)
    m('everhour:TriggerWatchNewTasks', 'Trigger Watch New Tasks', 'Everhour', 'trigger',
      'Watch for Trigger Watch New Tasks in Everhour',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // everhour:ActionGetAProject (1 uses in new blueprints)
    m('everhour:ActionGetAProject', 'Action Get A Project', 'Everhour', 'search',
      'Search/list Action Get A Project in Everhour',
      [
      p('projectID', 'select', true, 'Project ID')
    ]),
    // everhour:ActionGetAClient (1 uses in new blueprints)
    m('everhour:ActionGetAClient', 'Action Get A Client', 'Everhour', 'search',
      'Search/list Action Get A Client in Everhour',
      [
      p('client', 'select', true, 'Client ID')
    ]),

    // --- Facebook Conversions API ---
    // facebook-conversions-api:SendEvent (2 uses in new blueprints)
    m('facebook-conversions-api:SendEvent', 'Send Event', 'Facebook Conversions API', 'action',
      'Perform Send Event in Facebook Conversions API',
      [
      p('data', 'array', true, 'Data'),
      p('pixelId', 'text', false, 'Pixel ID'),
      p('test_event_code', 'text', false, 'Test Event Code'),
      p('ldu', 'boolean', false, 'Enable Limited Data Use')
    ]),

    // --- Facebook Insights ---
    // facebook-insights:CheckJobStatus (1 uses in new blueprints)
    m('facebook-insights:CheckJobStatus', 'Check Job Status', 'Facebook Insights', 'action',
      'Perform Check Job Status in Facebook Insights',
      [
      p('reportId', 'text', true, 'Report ID')
    ]),

    // --- Facebook Lead Ads ---
    // facebook-lead-ads:GetLeadDetails (2 uses in new blueprints)
    m('facebook-lead-ads:GetLeadDetails', 'Get Lead Details', 'Facebook Lead Ads', 'search',
      'Search/list Get Lead Details in Facebook Lead Ads',
      [
      p('pageId', 'select', true, 'Page'),
      p('id', 'text', true, 'Lead ID'),
      p('v', 'text', false, 'v'),
      p('formId', 'select', true, 'Form')
    ]),
    // facebook-lead-ads:WatchLeads (1 uses in new blueprints)
    m('facebook-lead-ads:WatchLeads', 'Watch Leads', 'Facebook Lead Ads', 'trigger',
      'Watch for Watch Leads in Facebook Lead Ads',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('pageId', 'select', true, 'Page'),
      p('limit', 'number', true, 'Limit'),
      p('formId', 'select', true, 'Form')
    ]),

    // --- Facebook Pages ---
    // facebook-pages:CreatePost (3 uses in new blueprints)
    m('facebook-pages:CreatePost', 'Create Post', 'Facebook Pages', 'action',
      'Perform Create Post in Facebook Pages',
      [
      p('page_id', 'select', true, 'Page'),
      p('message', 'text', false, 'Message'),
      p('link', 'url', false, 'Link'),
      p('name', 'text', false, 'Link name'),
      p('description', 'text', false, 'Link description'),
      p('date', 'date', false, 'Date'),
      p('page_id', 'select', true, 'Page'),
      p('message', 'text', false, 'Message'),
      p('link', 'url', false, 'Link'),
      p('name', 'text', false, 'Link name'),
      p('description', 'text', false, 'Link description'),
      p('date', 'date', false, 'Date')
    ]),
    // facebook-pages:WatchPosts (1 uses in new blueprints)
    m('facebook-pages:WatchPosts', 'Watch Posts', 'Facebook Pages', 'trigger',
      'Watch for Watch Posts in Facebook Pages',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('page_id', 'select', true, 'Page'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Fakturoid ---
    // fakturoid:ActionSearchSubject (1 uses in new blueprints)
    m('fakturoid:ActionSearchSubject', 'Action Search Subject', 'Fakturoid', 'search',
      'Search/list Action Search Subject in Fakturoid',
      [
      p('query', 'text', false, 'Query'),
      p('maxResults', 'number', true, 'Maximum number of returned contacts'),
      p('slug', 'select', true, 'Account')
    ]),
    // fakturoid:ActionCreateSubject (1 uses in new blueprints)
    m('fakturoid:ActionCreateSubject', 'Action Create Subject', 'Fakturoid', 'action',
      'Perform Action Create Subject in Fakturoid',
      [
      p('name', 'text', true, 'Company name'),
      p('street', 'text', false, 'Street'),
      p('street2', 'text', false, 'Street 2'),
      p('city', 'text', false, 'City'),
      p('zip', 'number', false, 'ZIP'),
      p('registrationNo', 'text', false, 'Registration No.'),
      p('vatNo', 'text', false, 'VAT No. (VAT payers)'),
      p('bankAccount', 'text', false, 'Bank account number'),
      p('fullName', 'text', false, 'Contact person\'s full name '),
      p('email', 'email', false, 'Email address where to send invoices '),
      p('phone', 'text', false, 'Phone'),
      p('web', 'url', false, 'Web'),
      p('country', 'text', false, 'Country (ISO code)'),
      p('variableSymbol', 'text', false, 'Variable symbol'),
      p('iban', 'text', false, 'IBAN'),
      p('emailCopy', 'email', false, 'Email address where to send invoice copies'),
      p('customId', 'text', false, 'ID of the contact in your application'),
      p('slug', 'select', true, 'Account')
    ]),
    // fakturoid:ActionCreateInvoice (1 uses in new blueprints)
    m('fakturoid:ActionCreateInvoice', 'Action Create Invoice', 'Fakturoid', 'action',
      'Perform Action Create Invoice in Fakturoid',
      [
      p('lines', 'array', false, 'Invoice lines'),
      p('paymentMethod', 'select', true, 'Payment method'),
      p('issuedOn', 'date', false, 'Issued on'),
      p('taxableFulfillmentDue', 'date', false, 'Taxable fulfillment date'),
      p('due', 'number', false, 'The number of days before the payment due date'),
      p('number', 'text', false, 'Invoice number'),
      p('orderNumber', 'text', false, 'Order number'),
      p('variableSymbol', 'text', false, 'Variable symbol'),
      p('note', 'text', false, 'Note above the invoice lines'),
      p('footerNote', 'text', false, 'Footer of the invoice'),
      p('privateNote', 'text', false, 'Private note'),
      p('iban', 'text', false, 'IBAN'),
      p('swiftBic', 'text', false, 'BIC'),
      p('currency', 'text', false, 'Currency code'),
      p('exchangeRate', 'number', false, 'Exchange rate'),
      p('language', 'select', true, 'Language in which the invoice is drawn up'),
      p('transferredTaxLiability', 'boolean', true, 'Transferred tax liability'),
      p('supplyCode', 'text', false, 'Supply code for recapitulative statements'),
      p('proforma', 'boolean', true, 'This is a proforma invoice.'),
      p('partialProforma', 'boolean', true, 'This is a partial proforma invoice.'),
      p('relatedId', 'number', false, 'Proforma invoice/invoice ID'),
      p('slug', 'select', true, 'Account'),
      p('subjectId', 'select', true, 'Contact'),
      p('bankAccountType', 'select', true, 'Ways of specifying a bank account '),
      p('bankAccountId', 'select', true, 'Bank account')
    ]),

    // --- Flow Control ---
    // builtin:BasicRepeater (9 uses in new blueprints)
    m('builtin:BasicRepeater', 'Basic Repeater', 'Flow Control', 'action',
      'Perform Basic Repeater in Flow Control',
      [
      p('start', 'number', true, 'Initial value'),
      p('repeats', 'number', true, 'Repeats'),
      p('step', 'number', true, 'Step')
    ]),

    // --- Focuster ---
    // focuster:newCompletedAction (1 uses in new blueprints)
    m('focuster:newCompletedAction', 'new Completed Action', 'Focuster', 'action',
      'Perform new Completed Action in Focuster',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Gakunin rdm ---
    // gakunin-rdm:watchEvents (1 uses in new blueprints)
    m('gakunin-rdm:watchEvents', 'watch Events', 'Gakunin rdm', 'trigger',
      'Watch for watch Events in Gakunin rdm',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // gakunin-rdm:displayInformation (1 uses in new blueprints)
    m('gakunin-rdm:displayInformation', 'display Information', 'Gakunin rdm', 'action',
      'Perform display Information in Gakunin rdm',
      [
      p('guid', 'text', true, 'GUID'),
      p('timestamp', 'text', true, 'Timestamp'),
      p('notifyType', 'text', true, 'Notify Type')
    ]),

    // --- Gemini AI ---
    // gemini-ai:createACompletionGeminiPro (2 uses in new blueprints)
    m('gemini-ai:createACompletionGeminiPro', 'create A Completion Gemini Pro', 'Gemini AI', 'action',
      'Perform create A Completion Gemini Pro in Gemini AI',
      [
      p('model', 'select', true, 'AI Model'),
      p('contents', 'array', true, 'Messages'),
      p('system_instruction', 'collection', false, 'System Instructions'),
      p('safetySettings', 'array', false, 'Safety Settings'),
      p('generationConfig', 'collection', false, 'Generation configurations'),
      p('tools', 'text', false, 'Tools'),
      p('tool_config', 'text', false, 'Tool Config'),
      p('function_declarations_context', 'boolean', false, 'Function Declarations Grounding'),
      p('url_context', 'boolean', false, 'URL Context'),
      p('google_search_context', 'boolean', false, 'Google Search Grounding'),
      p('code_execution', 'boolean', false, 'Code Execution'),
      p('google_maps_context', 'boolean', false, 'Google Maps Grounding'),
      p('file_search_store_context', 'boolean', false, 'File Search Store Context')
    ]),
    // gemini-ai:uploadAFile (1 uses in new blueprints)
    m('gemini-ai:uploadAFile', 'upload A File', 'Gemini AI', 'action',
      'Perform upload A File in Gemini AI',
      [
      p('file_name', 'text', true, 'Name'),
      p('file_data', 'text', true, 'Data'),
      p('useFileSearchStore', 'boolean', false, 'Use File Search Store')
    ]),

    // --- GetResponse ---
    // getresponse:TriggerNewContact (1 uses in new blueprints)
    m('getresponse:TriggerNewContact', 'Trigger New Contact', 'GetResponse', 'trigger',
      'Watch for Trigger New Contact in GetResponse',
      [
      p('account', 'text', true, 'Connection'),
      p('maxResults', 'number', true, 'Maximum number of contacts')
    ]),

    // --- Gmail ---
    // google-email:TriggerNewEmail (4 uses in new blueprints)
    m('google-email:TriggerNewEmail', 'Trigger New Email', 'Gmail', 'trigger',
      'Watch for Trigger New Email in Gmail',
      [
      p('account', 'text', false, 'Connection'),
      p('searchType', 'select', false, 'Filter type'),
      p('markSeen', 'boolean', false, 'Mark email message(s) as read when fetched'),
      p('maxResults', 'number', false, 'Maximum number of results'),
      p('folder', 'text', true, 'Folder'),
      p('criteria', 'select', true, 'Criteria'),
      p('from', 'email', false, 'Sender email address'),
      p('subject', 'text', false, 'Subject'),
      p('text', 'text', false, 'Search phrase')
    ]),
    // google-email:sendAnEmail (4 uses in new blueprints)
    m('google-email:sendAnEmail', 'send An Email', 'Gmail', 'action',
      'Perform send An Email in Gmail',
      [
      p('to', 'array', true, 'To'),
      p('subject', 'text', false, 'Subject'),
      p('bodyType', 'select', true, 'Body type'),
      p('attachments', 'array', false, 'Attachments'),
      p('from', 'select', false, 'From'),
      p('cc', 'array', false, 'CC recipients'),
      p('bcc', 'array', false, 'BCC recipients'),
      p('emailHeaders', 'array', false, 'Additional email headers'),
      p('content', 'text', false, 'Content')
    ]),
    // google-email:ActionCreateDraft (2 uses in new blueprints)
    m('google-email:ActionCreateDraft', 'Action Create Draft', 'Gmail', 'action',
      'Perform Action Create Draft in Gmail',
      [
      p('folder', 'text', true, 'Folder'),
      p('to', 'array', false, 'To'),
      p('subject', 'text', false, 'Subject'),
      p('html', 'text', false, 'Content'),
      p('attachments', 'array', false, 'Attachments'),
      p('cc', 'array', false, 'Copy recipient'),
      p('bcc', 'array', false, 'Blind copy recipient')
    ]),

    // --- Google Ads ---
    // google-ads-campaign-management:listCampaigns (1 uses in new blueprints)
    m('google-ads-campaign-management:listCampaigns', 'list Campaigns', 'Google Ads', 'search',
      'Search/list list Campaigns in Google Ads',
      [
      p('clientId', 'select', true, 'Account/Customer ID'),
      p('select', 'select', true, 'Select a Method'),
      p('limit', 'number', false, 'Limit'),
      p('filter', 'text', false, 'Filter')
    ]),
    // google-ads-campaign-management:updateACampaign (1 uses in new blueprints)
    m('google-ads-campaign-management:updateACampaign', 'update A Campaign', 'Google Ads', 'action',
      'Perform update A Campaign in Google Ads',
      [
      p('select', 'select', true, 'Select a Method'),
      p('clientId', 'select', true, 'Account/Customer ID'),
      p('status', 'select', true, 'Status'),
      p('campaign', 'text', true, 'Campaign ID')
    ]),

    // --- Google Calendar ---
    // google-calendar:createAnEvent (1 uses in new blueprints)
    m('google-calendar:createAnEvent', 'create An Event', 'Google Calendar', 'action',
      'Perform create An Event in Google Calendar',
      [
      p('select', 'select', true, 'Create an Event'),
      p('calendar', 'select', true, 'Calendar ID'),
      p('colorId', 'select', false, 'Color'),
      p('summary', 'text', true, 'Event Name'),
      p('allDayEvent', 'boolean', true, 'All Day Event'),
      p('start', 'date', true, 'Start Date'),
      p('end', 'date', true, 'End Date'),
      p('description', 'text', false, 'Description'),
      p('location', 'text', false, 'Location'),
      p('useDefault', 'boolean', false, 'Use the default reminder settings for this event'),
      p('overrides', 'array', false, 'Reminders'),
      p('attendees', 'array', false, 'Attendees'),
      p('transparency', 'select', true, 'Show me as'),
      p('visibility', 'select', true, 'Visibility'),
      p('sendUpdates', 'select', false, 'Send notifications about the event creation'),
      p('guestsCanModify', 'boolean', true, 'Guests can modify the event'),
      p('recurrence', 'array', false, 'Recurrence'),
      p('conferenceDate', 'boolean', true, 'Add Google Meet Video Conferencing')
    ]),

    // --- Google Cloud TTS ---
    // google-cloud-tts:synthesizeSpeech (1 uses in new blueprints)
    m('google-cloud-tts:synthesizeSpeech', 'synthesize Speech', 'Google Cloud TTS', 'action',
      'Perform synthesize Speech in Google Cloud TTS',
      [
      p('input', 'text', true, 'Text or SSML'),
      p('voice', 'collection', false, 'Voice'),
      p('audioConfig', 'collection', false, 'Audio Config'),
      p('fileName', 'text', false, 'File Name')
    ]),

    // --- Google Cloud Vision ---
    // googlecloudvision:DetectText (1 uses in new blueprints)
    m('googlecloudvision:DetectText', 'Detect Text', 'Google Cloud Vision', 'action',
      'Perform Detect Text in Google Cloud Vision',
      [
      p('imageSendMethod', 'select', true, 'Data/URL'),
      p('isToOptimizeDetection', 'boolean', true, 'Optimize the Detection for Dense Text and Documents'),
      p('isToIncludeFullTextAnnotation', 'boolean', true, 'Include Full Text Annotation'),
      p('data', 'text', true, 'Data')
    ]),

    // --- Google Contacts ---
    // google-contacts:createAContact (1 uses in new blueprints)
    m('google-contacts:createAContact', 'create A Contact', 'Google Contacts', 'action',
      'Perform create A Contact in Google Contacts',
      [
      p('honorificPrefix', 'text', false, 'Name Prefix'),
      p('givenName', 'text', true, 'First Name'),
      p('phoneticGivenName', 'text', false, 'First Name Yomi'),
      p('middleName', 'text', false, 'Middle Name'),
      p('phoneticMiddleName', 'text', false, 'Middle Name Yomi'),
      p('familyName', 'text', false, 'Family Name'),
      p('phoneticFamilyName', 'text', false, 'Family Name Yomi'),
      p('honorificSuffix', 'text', false, 'Name Suffix'),
      p('nickname', 'text', false, 'Nickname'),
      p('fileAses', 'text', false, 'File as'),
      p('label', 'select', false, 'Labels'),
      p('data', 'text', false, 'Photo Data'),
      p('organization', 'collection', false, 'Company'),
      p('emailAddresses', 'array', false, 'Emails'),
      p('phoneNumbers', 'array', false, 'Phone Numbers'),
      p('addresses', 'array', false, 'Addresses'),
      p('birthday', 'date', false, 'Birthday'),
      p('events', 'array', false, 'Events'),
      p('urls', 'array', false, 'URLs'),
      p('imClients', 'array', false, 'IM Clients'),
      p('note', 'text', false, 'Notes'),
      p('relations', 'array', false, 'Relations'),
      p('userDefined', 'array', false, 'User Defined Fields')
    ]),

    // --- Google Docs ---
    // google-docs:createADocumentFromTemplate (3 uses in new blueprints)
    m('google-docs:createADocumentFromTemplate', 'create A Document From Template', 'Google Docs', 'action',
      'Perform create A Document From Template in Google Docs',
      [
      p('select', 'select', true, 'Create a Document from a Template'),
      p('name', 'text', true, 'Title'),
      p('destination', 'select', true, 'New Drive Location'),
      p('from', 'select', true, 'Choose a Drive'),
      p('document', 'text', true, 'Document ID'),
      p('requests', 'collection', false, 'Values'),
      p('folderId', 'text', true, 'New Document\'s Location')
    ]),
    // google-docs:exportADocument (2 uses in new blueprints)
    m('google-docs:exportADocument', 'export A Document', 'Google Docs', 'action',
      'Perform export A Document in Google Docs',
      [
      p('destination', 'select', true, 'Choose a Drive'),
      p('mimeType', 'select', true, 'Type'),
      p('document', 'text', true, 'Document ID')
    ]),
    // google-docs:appendADocument (2 uses in new blueprints)
    m('google-docs:appendADocument', 'append A Document', 'Google Docs', 'action',
      'Perform append A Document in Google Docs',
      [
      p('choose', 'select', true, 'Select a Document'),
      p('destination', 'select', true, 'Choose a Drive'),
      p('document', 'text', true, 'Document ID'),
      p('select', 'select', true, 'Insert a Paragraph'),
      p('text', 'text', true, 'Appended Text')
    ]),
    // google-docs:createADocument (1 uses in new blueprints)
    m('google-docs:createADocument', 'create A Document', 'Google Docs', 'action',
      'Perform create A Document in Google Docs',
      [
      p('name', 'text', true, 'Name'),
      p('content', 'text', true, 'Content'),
      p('destination', 'select', true, 'Choose a Drive'),
      p('header', 'boolean', true, 'Insert a Header'),
      p('footer', 'boolean', true, 'Insert a Footer'),
      p('folderId', 'text', true, 'New Document\'s Location')
    ]),

    // --- Google Drive ---
    // google-drive:getAFile (3 uses in new blueprints)
    m('google-drive:getAFile', 'get A File', 'Google Drive', 'search',
      'Search/list get A File in Google Drive',
      [
      p('select', 'select', true, 'Enter a File ID'),
      p('formatDocuments', 'select', true, 'Convert Google Documents Files to Format'),
      p('formatSpreadsheets', 'select', true, 'Convert Google Spreadsheets Files to Format'),
      p('formatPresentations', 'select', true, 'Convert Google Slides Files to Format'),
      p('formatDrawings', 'select', true, 'Convert Google Drawings Files to Format'),
      p('destination', 'select', true, 'Choose a Drive'),
      p('file', 'text', true, 'File ID')
    ]),
    // google-drive:shareAFileFolder (1 uses in new blueprints)
    m('google-drive:shareAFileFolder', 'share A File Folder', 'Google Drive', 'action',
      'Perform share A File Folder in Google Drive',
      [
      p('destination', 'select', true, 'Choose a Drive'),
      p('select', 'select', true, 'Select'),
      p('role', 'select', true, 'Role'),
      p('type', 'select', true, 'Type'),
      p('file', 'text', true, 'File ID'),
      p('allowFileDiscovery', 'boolean', true, 'Allow File Discovery')
    ]),

    // --- Google Forms ---
    // google-forms:watchRows (2 uses in new blueprints)
    m('google-forms:watchRows', 'watch Rows', 'Google Forms', 'trigger',
      'Watch for watch Rows in Google Forms',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('spreadsheetId', 'select', true, 'Spreadsheet'),
      p('includesHeaders', 'text', true, 'includesHeaders'),
      p('tableFirstRow', 'text', true, 'Row with headers'),
      p('valueRenderOption', 'select', false, 'Value render option'),
      p('dateTimeRenderOption', 'select', false, 'Date and time render option'),
      p('limit', 'number', true, 'Limit'),
      p('sheetId', 'select', true, 'Sheet')
    ]),
    // google-forms:watchResponses (1 uses in new blueprints)
    m('google-forms:watchResponses', 'watch Responses', 'Google Forms', 'trigger',
      'Watch for watch Responses in Google Forms',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('formId', 'text', true, 'Form ID'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Google Sheets ---
    // google-sheets:clearValuesFromRange (4 uses in new blueprints)
    m('google-sheets:clearValuesFromRange', 'clear Values From Range', 'Google Sheets', 'action',
      'Perform clear Values From Range in Google Sheets',
      [
      p('select', 'select', true, 'Search Method'),
      p('range', 'text', true, 'Range'),
      p('from', 'select', true, 'Drive'),
      p('spreadsheetId', 'text', true, 'Spreadsheet ID'),
      p('sheet', 'select', true, 'Sheet Name')
    ]),
    // google-sheets:createSpreadsheet (4 uses in new blueprints)
    m('google-sheets:createSpreadsheet', 'create Spreadsheet', 'Google Sheets', 'action',
      'Perform create Spreadsheet in Google Sheets',
      [
      p('properties', 'collection', false, 'Properties'),
      p('sheets', 'array', false, 'Sheets')
    ]),
    // google-sheets:addSheet (2 uses in new blueprints)
    m('google-sheets:addSheet', 'add Sheet', 'Google Sheets', 'action',
      'Perform add Sheet in Google Sheets',
      [
      p('select', 'select', true, 'Search Method'),
      p('properties', 'collection', false, 'Properties'),
      p('from', 'select', true, 'Drive'),
      p('spreadsheetId', 'text', true, 'Spreadsheet ID')
    ]),

    // --- Gotomeeting ---
    // gotomeeting:watchMeetingsCreated (1 uses in new blueprints)
    m('gotomeeting:watchMeetingsCreated', 'watch Meetings Created', 'Gotomeeting', 'trigger',
      'Watch for watch Meetings Created in Gotomeeting',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),
    // gotomeeting:startAMeeting (1 uses in new blueprints)
    m('gotomeeting:startAMeeting', 'start A Meeting', 'Gotomeeting', 'action',
      'Perform start A Meeting in Gotomeeting',
      [
      p('meetingId', 'select', true, 'Meeting ID')
    ]),

    // --- HTML/CSS to Image ---
    // html-css-to-image:Screenshot (1 uses in new blueprints)
    m('html-css-to-image:Screenshot', 'Screenshot', 'HTML/CSS to Image', 'action',
      'Perform Screenshot in HTML/CSS to Image',
      [
      p('url', 'text', true, 'URL'),
      p('device_scale', 'number', false, 'Device Scale'),
      p('viewport_width', 'number', false, 'Viewport Width'),
      p('viewport_height', 'number', false, 'Viewport Height'),
      p('ms_delay', 'number', false, 'Millisecond Delay')
    ]),

    // --- HTTP ---
    // http:ActionSendDataAPIKeyAuth (2 uses in new blueprints)
    m('http:ActionSendDataAPIKeyAuth', 'Action Send Data A P I Key Auth', 'HTTP', 'action',
      'Perform Action Send Data A P I Key Auth in HTTP',
      [
      p('url', 'url', true, 'URL'),
      p('serializeUrl', 'boolean', true, 'Serialize URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('bodyType', 'select', false, 'Body type'),
      p('parseResponse', 'boolean', true, 'Parse response'),
      p('timeout', 'number', false, 'Timeout'),
      p('shareCookies', 'boolean', true, 'Share cookies with other HTTP modules'),
      p('ca', 'text', false, 'Self-signed certificate'),
      p('rejectUnauthorized', 'boolean', true, 'Reject connections that are using unverified (self-signed) certificates'),
      p('followRedirect', 'boolean', true, 'Follow redirect'),
      p('useQuerystring', 'boolean', true, 'Disable serialization of multiple same query string keys as arrays'),
      p('gzip', 'boolean', true, 'Request compressed content'),
      p('useMtls', 'boolean', true, 'Use Mutual TLS'),
      p('contentType', 'select', false, 'Content type'),
      p('data', 'text', false, 'Request content'),
      p('followAllRedirects', 'boolean', true, 'Follow all redirect')
    ]),

    // --- HubSpot CRM ---
    // hubspotcrm:getCompany (2 uses in new blueprints)
    m('hubspotcrm:getCompany', 'get Company', 'HubSpot CRM', 'search',
      'Search/list get Company in HubSpot CRM',
      [
      p('companyId', 'select', true, 'Company ID'),
      p('outputProperties', 'select', false, 'Output Properties'),
      p('parseCustomFields', 'boolean', true, 'Parse Custom Fields')
    ]),
    // hubspotcrm:upsertAContact (2 uses in new blueprints)
    m('hubspotcrm:upsertAContact', 'upsert A Contact', 'HubSpot CRM', 'action',
      'Perform upsert A Contact in HubSpot CRM',
      [
      p('_method', 'select', true, 'View Method'),
      p('swapPrimaryEmail', 'boolean', true, 'Swap Primary Email'),
      p('parseCustomFields', 'boolean', true, 'Parse Custom Fields'),
      p('email', 'text', false, 'Email'),
      p('annualrevenue', 'text', false, 'Annual Revenue'),
      p('billing_address_city', 'text', false, 'Billing Address: City'),
      p('billing_address_country', 'text', false, 'Billing Address: Country'),
      p('billing_address_google_maps_url', 'text', false, 'Billing Address: Google Maps URL'),
      p('billing_address_lat', 'text', false, 'Billing Address: Lat'),
      p('billing_address_long', 'text', false, 'Billing Address: Long'),
      p('billing_address_name', 'text', false, 'Billing Address: Name'),
      p('billing_address_phone_number', 'text', false, 'Billing Address: Phone Number'),
      p('billing_address_postal_code', 'text', false, 'Billing Address: Postal Code'),
      p('billing_address_state_region', 'text', false, 'Billing Address: State/Region'),
      p('billing_address_street_address', 'text', false, 'Billing Address: Street Address'),
      p('billing_address_subpremise', 'text', false, 'Billing Address: Subpremise'),
      p('billing_address_suburb', 'text', false, 'Billing Address: Suburb'),
      p('hs_all_assigned_business_unit_ids', 'select', false, 'Brands'),
      p('hs_buying_role', 'select', false, 'Buying Role'),
      p('city', 'text', false, 'City'),
      p('closedate', 'date', false, 'Close Date'),
      p('company', 'text', false, 'Company Name'),
      p('company_size', 'text', false, 'Company Size'),
      p('hubspot_owner_id', 'select', false, 'Contact Owner'),
      p('country', 'text', false, 'Country/Region'),
      p('hs_country_region_code', 'text', false, 'Country/Region Code'),
      p('hs_customer_agent_lead_status', 'select', false, 'Customer Agent Lead Status'),
      p('date_of_birth', 'text', false, 'Date Of Birth'),
      p('degree', 'text', false, 'Degree'),
      p('hs_email_customer_quarantined_reason', 'select', false, 'Email Address Quarantine Reason'),
      p('hs_employment_change_detected_date', 'date', false, 'Employment Change Detected Date'),
      p('hs_role', 'select', false, 'Employment Role'),
      p('hs_seniority', 'select', false, 'Employment Seniority'),
      p('hs_sub_role', 'select', false, 'Employment Sub Role'),
      p('hs_enriched_email_bounce_detected', 'boolean', false, 'Enriched Email Bounce Detected'),
      p('hs_facebook_click_id', 'text', false, 'Facebook Click Id'),
      p('fax', 'text', false, 'Fax Number'),
      p('field_of_study', 'text', false, 'Field Of Study'),
      p('firstname', 'text', false, 'First Name'),
      p('followercount', 'number', false, 'Follower Count'),
      p('gender', 'text', false, 'Gender'),
      p('hs_google_click_id', 'text', false, 'Google Ad Click Id'),
      p('graduation_date', 'text', false, 'Graduation Date'),
      p('industry', 'text', false, 'Industry'),
      p('hs_inferred_language_codes', 'select', false, 'Inferred Language Codes'),
      p('hs_job_change_detected_date', 'date', false, 'Job Change Detected Date'),
      p('job_function', 'text', false, 'Job Function'),
      p('jobtitle', 'text', false, 'Job Title'),
      p('hs_journey_stage', 'select', false, 'Journey Stage'),
      p('kloutscoregeneral', 'number', false, 'Klout Score'),
      p('lastname', 'text', false, 'Last Name'),
      p('hs_latest_source', 'select', false, 'Latest Traffic Source'),
      p('hs_latest_source_timestamp', 'date', false, 'Latest Traffic Source Date'),
      p('hs_lead_status', 'select', false, 'Lead Status'),
      p('hs_legal_basis', 'select', false, 'Legal Basis For Processing Contact\'s Data'),
      p('lifecyclestage', 'select', false, 'Lifecycle Stage'),
      p('linkedinbio', 'text', false, 'LinkedIn Bio'),
      p('linkedinconnections', 'number', false, 'LinkedIn Connections'),
      p('hs_linkedin_url', 'text', false, 'LinkedIn URL'),
      p('marital_status', 'text', false, 'Marital Status'),
      p('hs_content_membership_email', 'text', false, 'Member Email'),
      p('hs_content_membership_notes', 'text', false, 'Membership Notes'),
      p('message', 'text', false, 'Message'),
      p('military_status', 'text', false, 'Military Status'),
      p('mobilephone', 'text', false, 'Mobile Phone Number'),
      p('numemployees', 'select', false, 'Number Of Employees'),
      p('hs_analytics_source', 'select', false, 'Original Traffic Source'),
      p('hs_persona', 'select', false, 'Persona'),
      p('phone', 'text', false, 'Phone Number'),
      p('physical_address_city', 'text', false, 'Physical Address: City'),
      p('physical_address_country', 'text', false, 'Physical Address: Country'),
      p('physical_address_google_maps_url', 'text', false, 'Physical Address: Google Maps URL'),
      p('physical_address_lat', 'text', false, 'Physical Address: Lat'),
      p('physical_address_long', 'text', false, 'Physical Address: Long'),
      p('physical_address_name', 'text', false, 'Physical Address: Name'),
      p('physical_address_phone_number', 'text', false, 'Physical Address: Phone Number'),
      p('physical_address_postal_code', 'text', false, 'Physical Address: Postal Code'),
      p('physical_address_state_region', 'text', false, 'Physical Address: State/Region'),
      p('physical_address_street_address', 'text', false, 'Physical Address: Street Address'),
      p('physical_address_subpremise', 'text', false, 'Physical Address: Subpremise'),
      p('physical_address_suburb', 'text', false, 'Physical Address: Suburb'),
      p('postal_address_city', 'text', false, 'Postal Address: City'),
      p('postal_address_country', 'text', false, 'Postal Address: Country'),
      p('postal_address_google_maps_url', 'text', false, 'Postal Address: Google Maps URL'),
      p('postal_address_lat', 'text', false, 'Postal Address: Lat'),
      p('postal_address_long', 'text', false, 'Postal Address: Long'),
      p('postal_address_name', 'text', false, 'Postal Address: Name'),
      p('postal_address_phone_number', 'text', false, 'Postal Address: Phone Number'),
      p('postal_address_postal_code', 'text', false, 'Postal Address: Postal Code'),
      p('postal_address_state_region', 'text', false, 'Postal Address: State/Region'),
      p('postal_address_street_address', 'text', false, 'Postal Address: Street Address'),
      p('postal_address_subpremise', 'text', false, 'Postal Address: Subpremise'),
      p('postal_address_suburb', 'text', false, 'Postal Address: Suburb'),
      p('zip', 'text', false, 'Postal Code'),
      p('hs_language', 'select', false, 'Preferred Language'),
      p('hs_prospecting_agent_last_enrolled', 'text', false, 'Prospecting Agent Last Enrolled'),
      p('hs_prospecting_agent_total_enrolled_count', 'text', false, 'Prospecting Agent Total Enrolled Count'),
      p('relationship_status', 'text', false, 'Relationship Status'),
      p('hs_returning_to_office_detected_date', 'date', false, 'Returning To Office Detected Date'),
      p('salutation', 'text', false, 'Salutation'),
      p('school', 'text', false, 'School'),
      p('seniority', 'text', false, 'Seniority'),
      p('hs_shared_team_ids', 'select', false, 'Shared Teams'),
      p('hs_shared_user_ids', 'select', false, 'Shared Users'),
      p('start_date', 'text', false, 'Start Date'),
      p('state', 'text', false, 'State/Region'),
      p('hs_state_code', 'text', false, 'State/Region Code'),
      p('hs_content_membership_status', 'select', false, 'Status'),
      p('address', 'text', false, 'Street Address'),
      p('hs_time_between_contact_creation_and_deal_close', 'number', false, 'Time Between Contact Creation And Deal Close'),
      p('hs_time_between_contact_creation_and_deal_creation', 'number', false, 'Time Between Contact Creation And Deal Creation'),
      p('hs_time_to_move_from_lead_to_customer', 'number', false, 'Time To Move From Lead To Customer'),
      p('hs_time_to_move_from_marketingqualifiedlead_to_customer', 'number', false, 'Time To Move From Marketing Qualified Lead To Customer'),
      p('hs_time_to_move_from_opportunity_to_customer', 'number', false, 'Time To Move From Opportunity To Customer'),
      p('hs_time_to_move_from_salesqualifiedlead_to_customer', 'number', false, 'Time To Move From Sales Qualified Lead To Customer'),
      p('hs_time_to_move_from_subscriber_to_customer', 'number', false, 'Time To Move From Subscriber To Customer'),
      p('hs_timezone', 'select', false, 'Time Zone'),
      p('twitterbio', 'text', false, 'Twitter Bio'),
      p('twitterprofilephoto', 'text', false, 'Twitter Profile Photo'),
      p('twitterhandle', 'text', false, 'Twitter Username'),
      p('website', 'text', false, 'Website URL'),
      p('hs_whatsapp_phone_number', 'text', false, 'WhatsApp Phone Number'),
      p('work_email', 'text', false, 'Work Email')
    ]),
    // hubspotcrm:CreateOrUpdateContact (1 uses in new blueprints)
    m('hubspotcrm:CreateOrUpdateContact', 'Create Or Update Contact', 'HubSpot CRM', 'action',
      'Perform Create Or Update Contact in HubSpot CRM',
      [
      p('properties', 'collection', true, 'Properties')
    ]),
    // hubspotcrm:WatchUpdatedRecords (1 uses in new blueprints)
    m('hubspotcrm:WatchUpdatedRecords', 'Watch Updated Records', 'HubSpot CRM', 'trigger',
      'Watch for Watch Updated Records in HubSpot CRM',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('objectType', 'select', true, 'Record Type'),
      p('limit', 'number', true, 'Limit'),
      p('searchType', 'select', true, 'Search Category')
    ]),
    // hubspotcrm:FetchRecord (1 uses in new blueprints)
    m('hubspotcrm:FetchRecord', 'Fetch Record', 'HubSpot CRM', 'action',
      'Perform Fetch Record in HubSpot CRM',
      [
      p('objectType', 'select', true, 'Record type'),
      p('searchType', 'select', true, 'Search type'),
      p('email', 'email', true, 'Email')
    ]),
    // hubspotcrm:CreateEngagement (1 uses in new blueprints)
    m('hubspotcrm:CreateEngagement', 'Create Engagement', 'HubSpot CRM', 'action',
      'Perform Create Engagement in HubSpot CRM',
      [
      p('active', 'boolean', true, 'Is active?'),
      p('type', 'select', true, 'Type'),
      p('ownerId', 'select', false, 'Owner Id'),
      p('uid', 'text', false, 'UID'),
      p('portalId', 'text', false, 'Portal ID'),
      p('associatedContactIDs', 'array', false, 'Associated contacts'),
      p('associatedCompanyIDs', 'array', false, 'Associated companies'),
      p('associatedDealIDs', 'array', false, 'Associated deals'),
      p('attachments', 'array', false, 'Attachments'),
      p('metadata', 'collection', false, 'Metadata')
    ]),

    // --- Instagram Business ---
    // instagram-business:CreatePostPhoto (2 uses in new blueprints)
    m('instagram-business:CreatePostPhoto', 'Create Post Photo', 'Instagram Business', 'action',
      'Perform Create Post Photo in Instagram Business',
      [
      p('accountId', 'select', true, 'Page'),
      p('image_url', 'url', true, 'Photo URL'),
      p('caption', 'text', false, 'Caption'),
      p('user_tags', 'array', false, 'User Tags'),
      p('location_id', 'text', false, 'Location ID')
    ]),
    // instagram-business:NewComment (1 uses in new blueprints)
    m('instagram-business:NewComment', 'New Comment', 'Instagram Business', 'action',
      'Perform New Comment in Instagram Business',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // instagram-business:CreateComment (1 uses in new blueprints)
    m('instagram-business:CreateComment', 'Create Comment', 'Instagram Business', 'action',
      'Perform Create Comment in Instagram Business',
      [
      p('id', 'text', true, 'Comment ID'),
      p('message', 'text', true, 'Message')
    ]),

    // --- Instagram ---
    // instagram:WatchMedia (1 uses in new blueprints)
    m('instagram:WatchMedia', 'Watch Media', 'Instagram', 'trigger',
      'Watch for Watch Media in Instagram',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Jitbit ---
    // jitbit:triggerTicket (1 uses in new blueprints)
    m('jitbit:triggerTicket', 'trigger Ticket', 'Jitbit', 'trigger',
      'Watch for trigger Ticket in Jitbit',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Jotform ---
    // jotform:watchForSubmissions (2 uses in new blueprints)
    m('jotform:watchForSubmissions', 'watch For Submissions', 'Jotform', 'trigger',
      'Watch for watch For Submissions in Jotform',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),

    // --- KlickTipp ---
    // klicktipp:getAContact (2 uses in new blueprints)
    m('klicktipp:getAContact', 'get A Contact', 'KlickTipp', 'search',
      'Search/list get A Contact in KlickTipp',
      [
      p('identifierType', 'select', true, 'Identify Contact By'),
      p('subscriberid', 'number', true, 'Contact ID')
    ]),
    // klicktipp:listTags (2 uses in new blueprints)
    m('klicktipp:listTags', 'list Tags', 'KlickTipp', 'search',
      'Search/list list Tags in KlickTipp',
      [
      p('limit', 'number', false, 'Limit')
    ]),
    // klicktipp:watchEvent (1 uses in new blueprints)
    m('klicktipp:watchEvent', 'watch Event', 'KlickTipp', 'trigger',
      'Watch for watch Event in KlickTipp',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // klicktipp:updateContact (1 uses in new blueprints)
    m('klicktipp:updateContact', 'update Contact', 'KlickTipp', 'action',
      'Perform update Contact in KlickTipp',
      [
      p('identifierType', 'select', true, 'Identify Contact By'),
      p('newemail', 'email', false, 'New Email Address'),
      p('newsmsnumber', 'text', false, 'SMS Number'),
      p('dataFields', 'array', false, 'Data Fields'),
      p('subscriberid', 'number', true, 'Contact ID')
    ]),
    // klicktipp:addOrUpdateContact (1 uses in new blueprints)
    m('klicktipp:addOrUpdateContact', 'add Or Update Contact', 'KlickTipp', 'action',
      'Perform add Or Update Contact in KlickTipp',
      [
      p('email', 'email', false, 'Email Address'),
      p('smsnumber', 'text', false, 'SMS Number'),
      p('listid', 'select', false, 'Opt-in Process'),
      p('tagid', 'select', false, 'Tag'),
      p('dataFields', 'array', false, 'Data Fields')
    ]),

    // --- Koncile advanced ocr ---
    // koncile-advanced-ocr:PostDocument (1 uses in new blueprints)
    m('koncile-advanced-ocr:PostDocument', 'Post Document', 'Koncile advanced ocr', 'action',
      'Perform Post Document in Koncile advanced ocr',
      [
      p('filename', 'text', false, 'File Name'),
      p('file_data', 'text', false, 'File'),
      p('folder_id', 'select', false, 'Folder')
    ]),

    // --- Layerre ---
    // layerre:CreateVariant (1 uses in new blueprints)
    m('layerre:CreateVariant', 'Create Variant', 'Layerre', 'action',
      'Perform Create Variant in Layerre',
      [
      p('template_id', 'text', true, 'Template ID'),
      p('width', 'number', false, 'Width'),
      p('height', 'number', false, 'Height'),
      p('export_type', 'select', false, 'Export Type'),
      p('overrides', 'array', false, 'Layer Overrides')
    ]),

    // --- Leonardo AI ---
    // leonardo-ai:generateImage (1 uses in new blueprints)
    m('leonardo-ai:generateImage', 'generate Image', 'Leonardo AI', 'action',
      'Perform generate Image in Leonardo AI',
      [
      p('prompt', 'text', true, 'Prompt'),
      p('modelId', 'select', false, 'Model'),
      p('num_images', 'number', false, 'Number of images to generate'),
      p('source', 'select', false, 'Source'),
      p('public', 'boolean', false, 'Public'),
      p('height', 'number', false, 'Height'),
      p('width', 'number', false, 'Width'),
      p('unzoom', 'boolean', false, 'Unzoom'),
      p('alchemy', 'boolean', false, 'Alchemy'),
      p('promptMagic', 'boolean', false, 'Prompt Magic'),
      p('controlnets', 'array', false, 'ControlNets'),
      p('presetStyle', 'select', false, 'Preset style'),
      p('guidance_scale', 'number', false, 'Guidance scale'),
      p('weighting', 'number', false, 'Weighting'),
      p('init_strength', 'number', false, 'Init strength'),
      p('nsfw', 'boolean', false, 'NSFW'),
      p('tiling', 'boolean', false, 'Tiling'),
      p('num_inference_steps', 'number', false, 'Number of inference steps'),
      p('sd_version', 'select', false, 'SD version'),
      p('imagePrompts', 'array', false, 'Image prompts'),
      p('imagePromptWeight', 'number', false, 'Image prompt weight'),
      p('scheduler', 'select', false, 'Scheduler'),
      p('seed', 'number', false, 'Seed'),
      p('negative_prompt', 'text', false, 'Negative prompt'),
      p('upscaleRatio', 'number', false, 'Upscale ratio'),
      p('transparency', 'select', false, 'Transparency')
    ]),

    // --- LionDesk ---
    // liondesk:submitContact (1 uses in new blueprints)
    m('liondesk:submitContact', 'submit Contact', 'LionDesk', 'action',
      'Perform submit Contact in LionDesk',
      [
      p('assigned_user_id', 'number', false, 'Assigned User Id'),
      p('first_name', 'text', false, 'First Name'),
      p('last_name', 'text', false, 'Last Name'),
      p('email', 'email', false, 'Email'),
      p('secondary_email', 'email', false, 'Secondary Email'),
      p('mobile_phone', 'text', false, 'Mobile Phone'),
      p('home_phone', 'text', false, 'Home Phone'),
      p('office_phone', 'text', false, 'Office Phone'),
      p('fax', 'text', false, 'Fax'),
      p('company', 'text', false, 'Company'),
      p('birthday', 'text', false, 'Birthday'),
      p('anniversary', 'text', false, 'Anniversary'),
      p('spouse_name', 'text', false, 'Spouse Name'),
      p('spouse_email', 'email', false, 'Spouse Email'),
      p('spouse_phone', 'text', false, 'Spouse Phone'),
      p('spouse_birthday', 'text', false, 'Spouse Birthday'),
      p('tags', 'select', false, 'Tags'),
      p('status', 'select', false, 'Status'),
      p('created_at', 'date', false, 'Created At'),
      p('modified_at', 'date', false, 'Modified At'),
      p('hotness_id', 'select', false, 'Hotness ID'),
      p('source_id', 'select', false, 'Source ID')
    ]),

    // --- Loyverse ---
    // loyverse:watchReceipts (2 uses in new blueprints)
    m('loyverse:watchReceipts', 'watch Receipts', 'Loyverse', 'trigger',
      'Watch for watch Receipts in Loyverse',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('event', 'select', true, 'Event type'),
      p('store_id', 'select', false, 'Store ID'),
      p('limit', 'number', true, 'Limit')
    ]),
    // loyverse:getCustomer (2 uses in new blueprints)
    m('loyverse:getCustomer', 'get Customer', 'Loyverse', 'search',
      'Search/list get Customer in Loyverse',
      [
      p('id', 'select', true, 'Customer ID')
    ]),
    // loyverse:getStore (2 uses in new blueprints)
    m('loyverse:getStore', 'get Store', 'Loyverse', 'search',
      'Search/list get Store in Loyverse',
      [
      p('store_id', 'select', true, 'Store ID')
    ]),
    // loyverse:getEmployee (1 uses in new blueprints)
    m('loyverse:getEmployee', 'get Employee', 'Loyverse', 'search',
      'Search/list get Employee in Loyverse',
      [
      p('employee_id', 'select', true, 'Employee ID')
    ]),

    // --- MailboxValidator ---
    // mailboxvalidator:singleEmail (1 uses in new blueprints)
    m('mailboxvalidator:singleEmail', 'single Email', 'MailboxValidator', 'action',
      'Perform single Email in MailboxValidator',
      [
      p('email', 'email', true, 'Email')
    ]),

    // --- Mailchimp ---
    // mailchimp:watchSubscribers (1 uses in new blueprints)
    m('mailchimp:watchSubscribers', 'watch Subscribers', 'Mailchimp', 'trigger',
      'Watch for watch Subscribers in Mailchimp',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('select', 'select', true, 'Watch Subscibers'),
      p('list', 'select', true, 'List ID'),
      p('status', 'select', false, 'Status'),
      p('vip_only', 'boolean', true, 'VIP only'),
      p('email_type', 'select', false, 'Email Type'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- MaintainX ---
    // maintainx:TriggerWatchWorkOrders (1 uses in new blueprints)
    m('maintainx:TriggerWatchWorkOrders', 'Trigger Watch Work Orders', 'MaintainX', 'trigger',
      'Watch for Trigger Watch Work Orders in MaintainX',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- ManyChat ---
    // manychat:ManyChatWebhook (1 uses in new blueprints)
    m('manychat:ManyChatWebhook', 'Many Chat Webhook', 'ManyChat', 'trigger',
      'Watch for Many Chat Webhook in ManyChat',
      []),

    // --- Math ---
    // math:EvaluateExpression (1 uses in new blueprints)
    m('math:EvaluateExpression', 'Evaluate Expression', 'Math', 'action',
      'Perform Evaluate Expression in Math',
      [
      p('expression', 'text', true, 'Expression')
    ]),

    // --- MessageBird ---
    // message-bird:SendSMS (1 uses in new blueprints)
    m('message-bird:SendSMS', 'Send S M S', 'MessageBird', 'action',
      'Perform Send S M S in MessageBird',
      [
      p('recipients', 'array', true, 'Recipients'),
      p('originator', 'text', true, 'Originator'),
      p('body', 'text', true, 'Body'),
      p('reference', 'text', false, 'Reference'),
      p('reportUrl', 'url', false, 'Report URL')
    ]),

    // --- Mindee ---
    // mindee:enqueueAndGetInference (1 uses in new blueprints)
    m('mindee:enqueueAndGetInference', 'enqueue And Get Inference', 'Mindee', 'search',
      'Search/list enqueue And Get Inference in Mindee',
      [
      p('model_id', 'text', true, 'Model ID'),
      p('file_name', 'text', true, 'Name'),
      p('file_data', 'text', true, 'Data'),
      p('raw_text', 'boolean', false, 'Enable Raw Text'),
      p('rag', 'boolean', false, 'Enable RAG'),
      p('polygon', 'boolean', false, 'Enable Polygons'),
      p('confidence', 'boolean', false, 'Enable Confidence Score'),
      p('webhook_ids', 'array', false, 'Webhook IDs'),
      p('polling_timeout', 'number', true, 'Maximum Timeout Delay')
    ]),

    // --- Mitto SMS ---
    // mitto-sms:sendSMS (1 uses in new blueprints)
    m('mitto-sms:sendSMS', 'send S M S', 'Mitto SMS', 'action',
      'Perform send S M S in Mitto SMS',
      [
      p('from', 'text', true, 'From'),
      p('to', 'text', true, 'To'),
      p('text', 'text', true, 'Text')
    ]),

    // --- Mollie ---
    // mollie:universal (1 uses in new blueprints)
    m('mollie:universal', 'universal', 'Mollie', 'action',
      'Perform universal in Mollie',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- Monday.com ---
    // monday:GetItem (2 uses in new blueprints)
    m('monday:GetItem', 'Get Item', 'Monday.com', 'search',
      'Search/list Get Item in Monday.com',
      [
      p('id', 'number', true, 'ID'),
      p('showParentItem', 'boolean', true, 'Show Parent Item'),
      p('showSubitems', 'boolean', true, 'Show Subitems'),
      p('boardId', 'select', false, 'Board ID')
    ]),
    // monday:watchBoardColumnValues (1 uses in new blueprints)
    m('monday:watchBoardColumnValues', 'watch Board Column Values', 'Monday.com', 'trigger',
      'Watch for watch Board Column Values in Monday.com',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // monday:ChangeMultipleColumnValues (1 uses in new blueprints)
    m('monday:ChangeMultipleColumnValues', 'Change Multiple Column Values', 'Monday.com', 'action',
      'Perform Change Multiple Column Values in Monday.com',
      [
      p('boardId', 'select', true, 'Board ID'),
      p('create_labels_if_missing', 'boolean', true, 'Create Labels if Missing'),
      p('itemId', 'select', true, 'Item ID'),
      p('columnValuesToChange', 'array', true, 'Column Values to Change')
    ]),

    // --- Notion ---
    // notion:createAPage (3 uses in new blueprints)
    m('notion:createAPage', 'create A Page', 'Notion', 'action',
      'Perform create A Page in Notion',
      [
      p('select', 'select', true, 'Enter a Database ID'),
      p('database', 'text', true, 'Database ID'),
      p('fields', 'collection', false, 'Fields')
    ]),
    // notion:createAPage1 (1 uses in new blueprints)
    m('notion:createAPage1', 'create A Page1', 'Notion', 'action',
      'Perform create A Page1 in Notion',
      [
      p('select', 'select', true, 'Create a Page'),
      p('content', 'text', true, 'Title'),
      p('objects', 'array', false, 'Content Objects'),
      p('emoji', 'text', false, 'Emoji Icon'),
      p('cover', 'url', false, 'Cover URL link'),
      p('select1', 'select', true, 'Get a Database Item'),
      p('page', 'text', true, 'Database Item ID')
    ]),

    // --- Obras Online ---
    // obras-online:apiCall (1 uses in new blueprints)
    m('obras-online:apiCall', 'api Call', 'Obras Online', 'action',
      'Perform api Call in Obras Online',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- OneCRM ---
    // onecrm:NewEvent (2 uses in new blueprints)
    m('onecrm:NewEvent', 'New Event', 'OneCRM', 'action',
      'Perform New Event in OneCRM',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook'),
      p('mode', 'select', false, 'Returned data')
    ]),
    // onecrm:GetObject (2 uses in new blueprints)
    m('onecrm:GetObject', 'Get Object', 'OneCRM', 'search',
      'Search/list Get Object in OneCRM',
      [
      p('model', 'select', true, 'Module'),
      p('id', 'text', true, 'Record ID'),
      p('mode', 'select', false, 'Returned data')
    ]),
    // onecrm:SearchObjects (1 uses in new blueprints)
    m('onecrm:SearchObjects', 'Search Objects', 'OneCRM', 'search',
      'Search/list Search Objects in OneCRM',
      [
      p('model', 'select', true, 'Module'),
      p('limit', 'number', true, 'Limit'),
      p('mode', 'select', false, 'Returned data'),
      p('fields', 'select', false, 'Fields'),
      p('filter_text', 'text', false, 'Filter text'),
      p('order', 'select', false, 'Sort order'),
      p('favorites.deleted', 'boolean', false, 'Only Favorites'),
      p('primary_account', 'text', false, 'Primary Account'),
      p('first_name', 'text', false, 'First Name'),
      p('last_name', 'text', false, 'Last Name'),
      p('categories', 'text', false, 'Category'),
      p('lead_source', 'select', false, 'Lead Source'),
      p('do_not_call', 'boolean', false, 'Do Not Call'),
      p('assistant', 'text', false, 'Assistant'),
      p('email_opt_out', 'boolean', false, 'Email Opt Out'),
      p('title', 'text', false, 'Title'),
      p('business_role', 'select', false, 'Business Role')
    ]),
    // onecrm:CreateObject (1 uses in new blueprints)
    m('onecrm:CreateObject', 'Create Object', 'OneCRM', 'action',
      'Perform Create Object in OneCRM',
      [
      p('model', 'select', true, 'Module'),
      p('assigned_user_id', 'text', true, 'Assigned to (assigned_user_id)'),
      p('name', 'text', false, 'Name'),
      p('converted', 'boolean', true, 'Converted'),
      p('categories', 'text', false, 'Category (categories)'),
      p('category', 'select', false, 'Category (category)'),
      p('category2', 'select', false, 'Category (category2)'),
      p('category3', 'select', false, 'Category (category3)'),
      p('category4', 'select', false, 'Category (category4)'),
      p('category5', 'select', false, 'Category (category5)'),
      p('category6', 'select', false, 'Category (category6)'),
      p('category7', 'select', false, 'Category (category7)'),
      p('category8', 'select', false, 'Category (category8)'),
      p('category9', 'select', false, 'Category (category9)'),
      p('category10', 'select', false, 'Category (category10)'),
      p('temperature', 'select', false, 'Temperature'),
      p('salutation', 'select', false, 'Salutation'),
      p('first_name', 'text', false, 'First Name'),
      p('last_name', 'text', false, 'Last Name'),
      p('title', 'text', false, 'Title'),
      p('refered_by', 'text', false, 'Referred By'),
      p('lead_source', 'select', false, 'Lead Source'),
      p('lead_source_description', 'text', false, 'Lead Source Description'),
      p('status', 'select', true, 'Status'),
      p('status_description', 'text', false, 'Status Description'),
      p('department', 'text', false, 'Department'),
      p('reports_to_id', 'text', false, 'Reports To (reports_to_id)'),
      p('do_not_call', 'boolean', false, 'Do Not Call'),
      p('phone_home', 'text', false, 'Home Phone'),
      p('phone_mobile', 'text', false, 'Mobile'),
      p('phone_work', 'text', false, 'Office Phone'),
      p('phone_other', 'text', false, 'Other Phone'),
      p('phone_fax', 'text', false, 'Fax Number'),
      p('skype_id', 'text', false, 'Skype ID'),
      p('email1', 'text', false, 'Email'),
      p('email2', 'text', false, 'Other Email'),
      p('email_opt_out', 'boolean', false, 'Email Opt Out'),
      p('email_opt_in', 'boolean', false, 'Email Opt In'),
      p('website', 'url', false, 'Website'),
      p('primary_address_street', 'text', false, 'Primary Address Street'),
      p('primary_address_city', 'text', false, 'Primary Address City'),
      p('primary_address_state', 'text', false, 'Primary Address State'),
      p('primary_address_postalcode', 'text', false, 'Primary Address Postalcode'),
      p('primary_address_country', 'text', false, 'Primary Address Country'),
      p('primary_address_statecode', 'text', false, 'Primary Address State Code'),
      p('primary_address_countrycode', 'text', false, 'Primary Address Country Code'),
      p('alt_address_street', 'text', false, 'Alt Address Street'),
      p('alt_address_city', 'text', false, 'Alt Address City'),
      p('alt_address_state', 'text', false, 'Alt Address State'),
      p('alt_address_postalcode', 'text', false, 'Alt Address Postalcode'),
      p('alt_address_country', 'text', false, 'Alt Address Country'),
      p('alt_address_statecode', 'text', false, 'Alternate Address State Code'),
      p('alt_address_countrycode', 'text', false, 'Alternate Address Country Code'),
      p('description', 'text', false, 'Description'),
      p('account_name', 'text', false, 'Account Name'),
      p('account_description', 'text', false, 'Account Description'),
      p('contact_id', 'text', false, 'Converted Contact (contact_id)'),
      p('campaign_id', 'text', false, 'Campaign (campaign_id)'),
      p('portal_active', 'boolean', false, 'Portal Active'),
      p('portal_name', 'text', false, 'Portal Name'),
      p('portal_app', 'text', false, 'Portal Application'),
      p('invalid_email', 'boolean', false, 'Invalid Email'),
      p('partner_id', 'text', false, 'Via Partner (partner_id)'),
      p('date_converted', 'date', false, 'Date Converted'),
      p('photo', 'text', false, 'Photo'),
      p('photo_filename', 'text', false, 'Photo Filename'),
      p('photo_thumb', 'text', false, 'Thumbnail Filename'),
      p('consent_to_process', 'boolean', false, 'Consent To Process'),
      p('livechat_activity', 'boolean', false, 'Live Chat Activity'),
      p('mautic_id', 'number', false, 'Lead Guerrilla Contact ID'),
      p('chat_activity', 'boolean', false, 'Chat Activity'),
      p('personal_info_source', 'text', false, 'Personal Information Source')
    ]),

    // --- OneDrive ---
    // onedrive:uploadAFile (3 uses in new blueprints)
    m('onedrive:uploadAFile', 'upload A File', 'OneDrive', 'action',
      'Perform upload A File in OneDrive',
      [
      p('enter', 'select', true, 'Enter (Folder Location ID & Path)'),
      p('filename', 'text', true, 'File Name'),
      p('data', 'text', true, 'Data'),
      p('conflictBehavior', 'select', true, 'If the File with the Same Name Exists'),
      p('description', 'text', false, 'Description'),
      p('select', 'select', true, 'Choose your OneDrive location'),
      p('select1', 'select', true, 'Enable to Enter a Drive ID'),
      p('folder', 'text', false, 'Folder')
    ]),
    // onedrive:downloadAFile (1 uses in new blueprints)
    m('onedrive:downloadAFile', 'download A File', 'OneDrive', 'action',
      'Perform download A File in OneDrive',
      [
      p('enter', 'select', true, 'Enter (File ID & File Path)'),
      p('format', 'boolean', true, 'Convert to PDF'),
      p('choose', 'select', true, 'Enter a File ID'),
      p('select', 'select', true, 'Choose your OneDrive location'),
      p('select1', 'select', true, 'Enable to Enter a Drive ID'),
      p('file', 'text', true, 'File')
    ]),

    // --- OpenAI (ChatGPT) ---
    // openai-gpt-3:messageAssistantAdvanced (4 uses in new blueprints)
    m('openai-gpt-3:messageAssistantAdvanced', 'message Assistant Advanced', 'OpenAI (ChatGPT)', 'action',
      'Perform message Assistant Advanced in OpenAI (ChatGPT)',
      [
      p('assistantId', 'select', true, 'Assistant'),
      p('role', 'select', true, 'Role'),
      p('threadId', 'text', false, 'Thread ID'),
      p('model', 'select', false, 'Model'),
      p('tools', 'select', false, 'Tools'),
      p('file_search_resources', 'select', false, 'File Search Resources'),
      p('code_interpreter_resources', 'select', false, 'Code Interpreter Resources'),
      p('tool_choice', 'select', false, 'Tool Choice'),
      p('instructions', 'text', false, 'Instructions'),
      p('max_prompt_tokens', 'number', false, 'Max Prompt Tokens'),
      p('max_completion_tokens', 'number', false, 'Max Completion Tokens'),
      p('temperature', 'number', false, 'Temperature'),
      p('top_p', 'number', false, 'Top P'),
      p('response_format', 'select', false, 'Response Format'),
      p('truncation_strategy', 'select', false, 'Truncation Strategy'),
      p('message', 'text', true, 'Message'),
      p('image_files', 'select', false, 'Image Files'),
      p('image_urls', 'array', false, 'Image URLs')
    ]),
    // openai-gpt-3:generateAnAudio (2 uses in new blueprints)
    m('openai-gpt-3:generateAnAudio', 'generate An Audio', 'OpenAI (ChatGPT)', 'action',
      'Perform generate An Audio in OpenAI (ChatGPT)',
      [
      p('input', 'text', true, 'Input'),
      p('model', 'select', true, 'Model'),
      p('voice', 'select', false, 'Voice'),
      p('outputFilename', 'text', false, 'Output Filename'),
      p('response_format', 'select', false, 'Response Format'),
      p('speed', 'number', false, 'Speed'),
      p('instructions', 'text', false, 'Instructions')
    ]),
    // openai-gpt-3:askAnything (1 uses in new blueprints)
    m('openai-gpt-3:askAnything', 'ask Anything', 'OpenAI (ChatGPT)', 'action',
      'Perform ask Anything in OpenAI (ChatGPT)',
      [
      p('model', 'select', true, 'Model'),
      p('textPrompt', 'text', true, 'Text prompt')
    ]),
    // openai-gpt-3:GenerateImage (1 uses in new blueprints)
    m('openai-gpt-3:GenerateImage', 'Generate Image', 'OpenAI (ChatGPT)', 'action',
      'Perform Generate Image in OpenAI (ChatGPT)',
      [
      p('model', 'select', true, 'Model'),
      p('prompt', 'text', true, 'Prompt'),
      p('size', 'select', false, 'Size'),
      p('quality', 'select', false, 'Quality'),
      p('style', 'select', false, 'Style'),
      p('response_format', 'select', false, 'Response Format')
    ]),

    // --- ParseHub ---
    // parsehub:getALastReadyData (1 uses in new blueprints)
    m('parsehub:getALastReadyData', 'get A Last Ready Data', 'ParseHub', 'search',
      'Search/list get A Last Ready Data in ParseHub',
      [
      p('project', 'select', true, 'Project Token'),
      p('format', 'select', true, 'Format')
    ]),

    // --- Perplexity AI ---
    // perplexity-ai:createAChatCompletion (6 uses in new blueprints)
    m('perplexity-ai:createAChatCompletion', 'create A Chat Completion', 'Perplexity AI', 'action',
      'Perform create A Chat Completion in Perplexity AI',
      [
      p('model', 'select', true, 'Model'),
      p('messages', 'array', true, 'Messages'),
      p('max_tokens', 'number', false, 'Max Tokens'),
      p('temperature', 'number', false, 'Temperature'),
      p('web_search_options', 'collection', false, 'Web Search Options'),
      p('top_p', 'number', false, 'Top P'),
      p('top_k', 'number', false, 'Top K'),
      p('presence_penalty', 'number', false, 'Presence Penalty'),
      p('frequency_penalty', 'number', false, 'Frequency Penalty'),
      p('search_domain_filter', 'array', false, 'Search Domain Filter'),
      p('search_recency_filter', 'select', false, 'Search Recency Filter'),
      p('return_images', 'boolean', false, 'Return Images'),
      p('return_related_questions', 'boolean', false, 'Return Related Questions')
    ]),

    // --- PhantomBuster ---
    // phantombuster:watchAnOutput (1 uses in new blueprints)
    m('phantombuster:watchAnOutput', 'watch An Output', 'PhantomBuster', 'trigger',
      'Watch for watch An Output in PhantomBuster',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('phantom', 'select', true, 'Phantom ID')
    ]),

    // --- Phonenumber ---
    // phonenumber:TransformerParseNumber (2 uses in new blueprints)
    m('phonenumber:TransformerParseNumber', 'Transformer Parse Number', 'Phonenumber', 'action',
      'Perform Transformer Parse Number in Phonenumber',
      [
      p('number', 'text', true, 'Phone number'),
      p('defaultCountry', 'select', true, 'Default country for parsing')
    ]),

    // --- Pipedrive ---
    // pipedrive:WatchPersons (1 uses in new blueprints)
    m('pipedrive:WatchPersons', 'Watch Persons', 'Pipedrive', 'trigger',
      'Watch for Watch Persons in Pipedrive',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('filter_id', 'select', false, 'Filter'),
      p('user_id', 'select', false, 'User'),
      p('limit', 'number', true, 'Limit'),
      p('triggerOn', 'select', true, 'Trigger when')
    ]),
    // pipedrive:FindPersonByName (1 uses in new blueprints)
    m('pipedrive:FindPersonByName', 'Find Person By Name', 'Pipedrive', 'search',
      'Search/list Find Person By Name in Pipedrive',
      [
      p('term', 'text', true, 'Term'),
      p('org_id', 'number', false, 'Organization'),
      p('search_by_email', 'boolean', false, 'Search by email')
    ]),
    // pipedrive:CreatePerson (1 uses in new blueprints)
    m('pipedrive:CreatePerson', 'Create Person', 'Pipedrive', 'action',
      'Perform Create Person in Pipedrive',
      [
      p('name', 'text', true, 'Name'),
      p('owner_id', 'number', false, 'Owner'),
      p('org_id', 'number', false, 'Organization'),
      p('email', 'array', false, 'Emails'),
      p('phone', 'array', false, 'Phones'),
      p('add_time', 'date', false, 'Add time'),
      p('visible_to', 'select', false, 'Visible to'),
      p('3c3ad55478d144a1812ee5aeb682b563a9b4c769', 'select', false, 'submitted_typeform'),
      p('1ec88326415a3d004d13278872eb6fe66b9cdf23', 'text', false, 'airtable_link'),
      p('f7b917d9c2270260dbce2875fd55ff8ceff786d5', 'select', false, 'Test')
    ]),

    // --- Plumsail documents ---
    // plumsail-documents:applyDocxTemplate (2 uses in new blueprints)
    m('plumsail-documents:applyDocxTemplate', 'apply Docx Template', 'Plumsail documents', 'action',
      'Perform apply Docx Template in Plumsail documents',
      [
      p('filename', 'text', true, 'Name'),
      p('filedata', 'text', true, 'Data'),
      p('data', 'text', true, 'Template data'),
      p('outputType', 'select', true, 'Output Type'),
      p('locale', 'select', false, 'Locale'),
      p('timezone', 'select', false, 'Timezone'),
      p('engine', 'select', false, 'Template engine')
    ]),
    // plumsail-documents:convertDocxToPdf (2 uses in new blueprints)
    m('plumsail-documents:convertDocxToPdf', 'convert Docx To Pdf', 'Plumsail documents', 'action',
      'Perform convert Docx To Pdf in Plumsail documents',
      [
      p('filename', 'text', true, 'Name'),
      p('filedata', 'text', true, 'Data')
    ]),

    // --- Podio ---
    // podio:ActionFilterItems (1 uses in new blueprints)
    m('podio:ActionFilterItems', 'Action Filter Items', 'Podio', 'action',
      'Perform Action Filter Items in Podio',
      [
      p('sort_by', 'select', true, 'Sort by'),
      p('sort_descending', 'boolean', false, 'Sort descending'),
      p('filters', 'array', false, 'Filters')
    ]),

    // --- Predict Leads ---
    // predict-leads-app:retrieveCompaniesUsingSpecificTechnology (1 uses in new blueprints)
    m('predict-leads-app:retrieveCompaniesUsingSpecificTechnology', 'retrieve Companies Using Specific Technology', 'Predict Leads', 'action',
      'Perform retrieve Companies Using Specific Technology in Predict Leads',
      [
      p('id_or_fuzzy_name', 'text', true, 'Id Or Fuzzy Name'),
      p('first_seen_at_from', 'date', false, 'First Seen At From'),
      p('first_seen_at_until', 'date', false, 'First Seen At Until'),
      p('last_seen_at_from', 'date', false, 'Last Seen At From'),
      p('last_seen_at_until', 'date', false, 'Last Seen At Until'),
      p('limit', 'number', false, 'Limit')
    ]),
    // predict-leads-app:retrieveCompany (1 uses in new blueprints)
    m('predict-leads-app:retrieveCompany', 'retrieve Company', 'Predict Leads', 'action',
      'Perform retrieve Company in Predict Leads',
      [
      p('id_or_domain', 'text', true, 'Id Or Domain')
    ]),

    // --- Prestashop ---
    // prestashop:watchOrders (1 uses in new blueprints)
    m('prestashop:watchOrders', 'watch Orders', 'Prestashop', 'trigger',
      'Watch for watch Orders in Prestashop',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('type', 'select', true, 'Watch for'),
      p('current_state', 'select', false, 'Order State'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Productboard ---
    // productboard:newFeature (1 uses in new blueprints)
    m('productboard:newFeature', 'new Feature', 'Productboard', 'action',
      'Perform new Feature in Productboard',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // productboard:getFeature (1 uses in new blueprints)
    m('productboard:getFeature', 'get Feature', 'Productboard', 'search',
      'Search/list get Feature in Productboard',
      [
      p('id', 'select', true, 'Feature ID')
    ]),

    // --- Questionpro ---
    // questionpro:SendBatch (1 uses in new blueprints)
    m('questionpro:SendBatch', 'Send Batch', 'Questionpro', 'action',
      'Perform Send Batch in Questionpro',
      [
      p('userID', 'select', true, 'User ID'),
      p('surveyID', 'select', true, 'Survey ID'),
      p('mode', 'select', true, 'Mode'),
      p('emails', 'array', true, 'Emails'),
      p('emailTemplate', 'collection', false, 'Email Template')
    ]),

    // --- QuickBooks ---
    // quickbooks:SearchForCustomers (2 uses in new blueprints)
    m('quickbooks:SearchForCustomers', 'Search For Customers', 'QuickBooks', 'search',
      'Search/list Search For Customers in QuickBooks',
      [
      p('type', 'select', true, 'Search by'),
      p('filter', 'text', false, 'Filter'),
      p('limit', 'number', true, 'Limit')
    ]),
    // quickbooks:SearchForEstimates (1 uses in new blueprints)
    m('quickbooks:SearchForEstimates', 'Search For Estimates', 'QuickBooks', 'search',
      'Search/list Search For Estimates in QuickBooks',
      [
      p('type', 'select', true, 'Search by'),
      p('filter', 'text', false, 'Filter'),
      p('limit', 'number', true, 'Limit')
    ]),
    // quickbooks:GetEstimate (1 uses in new blueprints)
    m('quickbooks:GetEstimate', 'Get Estimate', 'QuickBooks', 'search',
      'Search/list Get Estimate in QuickBooks',
      [
      p('id', 'number', true, 'Estimate ID')
    ]),

    // --- RAYNET CRM ---
    // raynet-crm-v2:listLead (1 uses in new blueprints)
    m('raynet-crm-v2:listLead', 'list Lead', 'RAYNET CRM', 'search',
      'Search/list list Lead in RAYNET CRM',
      [
      p('limit', 'number', true, 'Limit'),
      p('offset', 'number', false, 'Offset'),
      p('sortColumn', 'select', false, 'Sort column'),
      p('sortDirection', 'select', false, 'Sort direction'),
      p('fulltext', 'text', false, 'Full-text search'),
      p('_filters', 'text', false, 'Filter with an operator'),
      p('owner', 'select', false, 'Filter by owner'),
      p('_status', 'array', false, 'Filter by status'),
      p('gdprTemplate[CUSTOM]', 'select', false, 'Filter by legal title'),
      p('withoutGdpr[CUSTOM]', 'select', false, 'Filter records that do not have a valid legal title'),
      p('view', 'select', false, 'View'),
      p('tags', 'text', false, 'Filter by tags')
    ]),

    // --- RSS ---
    // rss:TriggerNewArticle (4 uses in new blueprints)
    m('rss:TriggerNewArticle', 'Trigger New Article', 'RSS', 'trigger',
      'Watch for Trigger New Article in RSS',
      [
      p('url', 'url', false, 'URL'),
      p('maxResults', 'number', false, 'Maximum number of returned items'),
      p('username', 'text', false, 'User name'),
      p('password', 'text', false, 'Password'),
      p('include', 'select', false, 'Process RSS fields'),
      p('gzip', 'boolean', false, 'Request compressed content')
    ]),
    // rss:ActionReadArticles (1 uses in new blueprints)
    m('rss:ActionReadArticles', 'Action Read Articles', 'RSS', 'action',
      'Perform Action Read Articles in RSS',
      []),

    // --- Rebrandly ---
    // rebrandly:newclick (2 uses in new blueprints)
    m('rebrandly:newclick', 'newclick', 'Rebrandly', 'action',
      'Perform newclick in Rebrandly',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('workspace', 'select', false, 'Workspace'),
      p('domain.id', 'array', false, 'Filter by domain ID'),
      p('domain.fullName', 'text', false, 'Filter by domain name'),
      p('slashtag', 'text', false, 'Filter by slashtag'),
      p('creator.id', 'array', false, 'Filter by creator ID'),
      p('favourite', 'boolean', false, 'Favourite only'),
      p('limit', 'number', false, 'Limit')
    ]),

    // --- RegExp ---
    // regexp:Replace (2 uses in new blueprints)
    m('regexp:Replace', 'Replace', 'RegExp', 'action',
      'Perform Replace in RegExp',
      [
      p('pattern', 'text', true, 'Pattern'),
      p('value', 'text', false, 'New value'),
      p('global', 'boolean', true, 'Global match'),
      p('sensitive', 'boolean', true, 'Case sensitive'),
      p('multiline', 'boolean', true, 'Multiline'),
      p('singleline', 'boolean', true, 'Singleline'),
      p('text', 'text', false, 'Text')
    ]),

    // --- Revolut ---
    // revolut:createDraftPayment (3 uses in new blueprints)
    m('revolut:createDraftPayment', 'create Draft Payment', 'Revolut', 'action',
      'Perform create Draft Payment in Revolut',
      [
      p('recipientBankCountry', 'select', true, 'Recipient Bank Country'),
      p('title', 'text', false, 'Draft Payment Title'),
      p('scheduledDate', 'date', false, 'Execution Date'),
      p('currency', 'select', true, 'Currency'),
      p('transfers', 'array', true, 'Transfers')
    ]),

    // --- RingCentral ---
    // ringcentral:watchCalls (1 uses in new blueprints)
    m('ringcentral:watchCalls', 'watch Calls', 'RingCentral', 'trigger',
      'Watch for watch Calls in RingCentral',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit'),
      p('type', 'select', false, 'Type'),
      p('companyId', 'select', true, 'Account/Company ID')
    ]),

    // --- Rws language cloud ---
    // rws-language-cloud:filesUploadFile (1 uses in new blueprints)
    m('rws-language-cloud:filesUploadFile', 'files Upload File', 'Rws language cloud', 'action',
      'Perform files Upload File in Rws language cloud',
      [
      p('projectOptionsId', 'select', true, 'Project Options ID'),
      p('file_name', 'text', true, 'Name'),
      p('file_data', 'text', true, 'Data')
    ]),
    // rws-language-cloud:projectsCreate (1 uses in new blueprints)
    m('rws-language-cloud:projectsCreate', 'projects Create', 'Rws language cloud', 'action',
      'Perform projects Create in Rws language cloud',
      [
      p('Name', 'text', true, 'Name'),
      p('projectOptionsId', 'select', true, 'Project Options ID'),
      p('SrcLang', 'text', true, 'Source Language'),
      p('Files', 'array', true, 'Files'),
      p('Description', 'text', false, 'Description'),
      p('DueDate', 'date', false, 'Due Date'),
      p('ProjectGroupId', 'text', false, 'Project Group ID'),
      p('Metadata', 'array', false, 'Metadata'),
      p('ScopeOptionId', 'text', false, 'Format'),
      p('TmSequenceId', 'text', false, 'TM Sequence ID'),
      p('Vendors', 'text', false, 'Vendor ID')
    ]),

    // --- Sage Accounting ---
    // sage-accounting:SearchCustomers (1 uses in new blueprints)
    m('sage-accounting:SearchCustomers', 'Search Customers', 'Sage Accounting', 'search',
      'Search/list Search Customers in Sage Accounting',
      [
      p('business_id', 'select', true, 'Current Business ID'),
      p('limit', 'number', false, 'Limit'),
      p('updated_or_created_since', 'date', false, 'Updated or Created since'),
      p('deleted_since', 'date', false, 'Deleted since'),
      p('exclude_system', 'boolean', false, 'Exclude System'),
      p('nested_attributes', 'text', false, 'Nested Attributes'),
      p('show_balance', 'boolean', false, 'Show Balance'),
      p('context_date', 'date', false, 'Context Date'),
      p('search', 'text', false, 'Search'),
      p('email', 'email', false, 'Email'),
      p('show_unfinished_recurring_invoices_status', 'boolean', false, 'Show Unfinished Recurring Invoices Status'),
      p('attributes', 'text', false, 'Attributes')
    ]),

    // --- Salesflare ---
    // salesflare:findContact (1 uses in new blueprints)
    m('salesflare:findContact', 'find Contact', 'Salesflare', 'search',
      'Search/list find Contact in Salesflare',
      [
      p('id', 'select', false, 'Contact ID'),
      p('name', 'select', false, 'Name'),
      p('email', 'select', false, 'Email'),
      p('phone_number', 'select', false, 'Phone Number'),
      p('account', 'select', false, 'Account ID'),
      p('tag__name', 'select', false, 'Tag'),
      p('limit', 'number', false, 'Limit'),
      p('custom', 'collection', false, 'Custom Fields')
    ]),

    // --- Salesforce ---
    // salesforce:ActionQueryObject (2 uses in new blueprints)
    m('salesforce:ActionQueryObject', 'Action Query Object', 'Salesforce', 'action',
      'Perform Action Query Object in Salesforce',
      [
      p('queryType', 'select', true, 'Search type'),
      p('maxResults', 'number', true, 'Maximal count of records'),
      p('sObject', 'select', true, 'Type'),
      p('id', 'text', false, 'ID')
    ]),
    // salesforce:makeApiCall (1 uses in new blueprints)
    m('salesforce:makeApiCall', 'make Api Call', 'Salesforce', 'action',
      'Perform make Api Call in Salesforce',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- Salesloft ---
    // salesloft:watchRecords (1 uses in new blueprints)
    m('salesloft:watchRecords', 'watch Records', 'Salesloft', 'trigger',
      'Watch for watch Records in Salesloft',
      [
      p('__IMTHOOK__', 'text', false, 'Webhook')
    ]),

    // --- Scenario service ---
    // scenario-service:StartSubscenario (1 uses in new blueprints)
    m('scenario-service:StartSubscenario', 'Start Subscenario', 'Scenario service', 'action',
      'Perform Start Subscenario in Scenario service',
      []),

    // --- Sellsy ---
    // sellsy:createTask (3 uses in new blueprints)
    m('sellsy:createTask', 'create Task', 'Sellsy', 'action',
      'Perform create Task in Sellsy',
      [
      p('type', 'text', false, 'type'),
      p('task', 'collection', false, 'Task')
    ]),
    // sellsy:universal (1 uses in new blueprints)
    m('sellsy:universal', 'universal', 'Sellsy', 'action',
      'Perform universal in Sellsy',
      [
      p('url', 'text', true, 'URL'),
      p('method', 'select', true, 'Method'),
      p('headers', 'array', false, 'Headers'),
      p('qs', 'array', false, 'Query String'),
      p('body', 'text', false, 'Body')
    ]),

    // --- Shopify ---
    // shopify:WatchCustomers (1 uses in new blueprints)
    m('shopify:WatchCustomers', 'Watch Customers', 'Shopify', 'trigger',
      'Watch for Watch Customers in Shopify',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),
    // shopify:SearchForCustomers (1 uses in new blueprints)
    m('shopify:SearchForCustomers', 'Search For Customers', 'Shopify', 'search',
      'Search/list Search For Customers in Shopify',
      [
      p('query', 'text', false, 'Query'),
      p('limit', 'number', true, 'Limit')
    ]),
    // shopify:CreateArticle (1 uses in new blueprints)
    m('shopify:CreateArticle', 'Create Article', 'Shopify', 'action',
      'Perform Create Article in Shopify',
      [
      p('blog_id', 'select', true, 'Blog'),
      p('title', 'text', true, 'Title'),
      p('body_html', 'text', false, 'Body HTML'),
      p('template_suffix', 'text', false, 'Template suffix'),
      p('summary_html', 'text', false, 'Summary HTML'),
      p('author', 'text', false, 'Author'),
      p('handle', 'text', false, 'Handle'),
      p('published', 'boolean', true, 'Article is published'),
      p('published_at', 'date', false, 'Published at'),
      p('tags', 'array', false, 'Tags'),
      p('image', 'collection', false, 'Image')
    ]),
    // shopify:CreateProduct (1 uses in new blueprints)
    m('shopify:CreateProduct', 'Create Product', 'Shopify', 'action',
      'Perform Create Product in Shopify',
      [
      p('title', 'text', true, 'Title'),
      p('product_type', 'text', false, 'Product type'),
      p('body_html', 'text', false, 'Body HTML'),
      p('vendor', 'text', false, 'Vendor'),
      p('tags', 'array', false, 'Tags'),
      p('published', 'boolean', false, 'Published'),
      p('published_at', 'date', false, 'Published at'),
      p('published_scope', 'select', false, 'Published scope'),
      p('handle', 'text', false, 'Handle'),
      p('options', 'array', false, 'Options'),
      p('variants', 'array', false, 'Variants'),
      p('images', 'array', false, 'Images'),
      p('template_suffix', 'text', false, 'Template suffix'),
      p('metafields_global_title_tag', 'text', false, 'Metafields global title tag'),
      p('metafields_global_description_tag', 'text', false, 'Metafields global description tag')
    ]),
    // shopify:watchOrders (1 uses in new blueprints)
    m('shopify:watchOrders', 'watch Orders', 'Shopify', 'trigger',
      'Watch for watch Orders in Shopify',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('sortKey', 'select', true, 'Watch by'),
      p('limit', 'number', true, 'Order limit'),
      p('lineItems', 'boolean', true, 'Output line items'),
      p('customer', 'boolean', true, 'Output customer details'),
      p('shippingLines', 'boolean', true, 'Output shipping lines'),
      p('metafields', 'boolean', true, 'Output order metafields'),
      p('nLineItems', 'number', true, 'Line items limit'),
      p('variants', 'boolean', true, 'Output product variants')
    ]),

    // --- Short cm ---
    // short-cm:createLink (1 uses in new blueprints)
    m('short-cm:createLink', 'create Link', 'Short cm', 'action',
      'Perform create Link in Short cm',
      [
      p('domain', 'select', true, 'Domain'),
      p('originalURL', 'url', true, 'Original Long URL'),
      p('title', 'text', true, 'Link Title'),
      p('path', 'text', false, 'Path'),
      p('tags', 'array', false, 'Tags'),
      p('expire', 'collection', false, 'Expiration'),
      p('mobile', 'collection', false, 'Mobile URL'),
      p('password', 'collection', false, 'Password Protection'),
      p('utm', 'collection', false, 'Campaign Tracking'),
      p('cloak', 'collection', false, 'Link Cloaking'),
      p('http', 'collection', false, 'HTTP Status')
    ]),

    // --- Simvoly2 ---
    // simvoly2:watchOrderCreated (1 uses in new blueprints)
    m('simvoly2:watchOrderCreated', 'watch Order Created', 'Simvoly2', 'trigger',
      'Watch for watch Order Created in Simvoly2',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),

    // --- Slack ---
    // slack:WatchGroupMessages (2 uses in new blueprints)
    m('slack:WatchGroupMessages', 'Watch Group Messages', 'Slack', 'trigger',
      'Watch for Watch Group Messages in Slack',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('inputMethod', 'select', true, 'Input Method'),
      p('limit', 'number', true, 'Limit'),
      p('channel', 'select', true, 'Private Channel')
    ]),

    // --- Slybroadcast ---
    // slybroadcast:SendingSlybroadcastCampaignURL (1 uses in new blueprints)
    m('slybroadcast:SendingSlybroadcastCampaignURL', 'Sending Slybroadcast Campaign U R L', 'Slybroadcast', 'action',
      'Perform Sending Slybroadcast Campaign U R L in Slybroadcast',
      [
      p('c_date', 'date', true, 'Date'),
      p('c_url', 'url', true, 'URL'),
      p('c_phone', 'text', false, 'Phone Numbers'),
      p('c_callerID', 'text', false, 'Caller ID'),
      p('mobile_only', 'boolean', false, 'Mobile Only'),
      p('c_audio', 'text', false, 'Audio Format'),
      p('c_listid', 'select', false, 'List ID')
    ]),

    // --- Smartsheet ---
    // smartsheet:CreateRow (1 uses in new blueprints)
    m('smartsheet:CreateRow', 'Create Row', 'Smartsheet', 'action',
      'Perform Create Row in Smartsheet',
      [
      p('sheetId', 'select', true, 'Sheet'),
      p('columns', 'collection', false, 'Columns')
    ]),

    // --- Softr ---
    // softr:createNewUser (2 uses in new blueprints)
    m('softr:createNewUser', 'create New User', 'Softr', 'action',
      'Perform create New User in Softr',
      [
      p('email', 'email', true, 'Email'),
      p('name', 'text', true, 'Name'),
      p('password', 'text', true, 'Password'),
      p('link', 'boolean', true, 'Magiclink')
    ]),

    // --- Swapcard ---
    // swapcard:TriggerWatchEventPeople (1 uses in new blueprints)
    m('swapcard:TriggerWatchEventPeople', 'Trigger Watch Event People', 'Swapcard', 'trigger',
      'Watch for Trigger Watch Event People in Swapcard',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('eventId', 'select', true, 'Event ID'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Tabidoo ---
    // tabidoo:WatchNewRecord (1 uses in new blueprints)
    m('tabidoo:WatchNewRecord', 'Watch New Record', 'Tabidoo', 'trigger',
      'Watch for Watch New Record in Tabidoo',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),

    // --- Teamleader ---
    // teamleader:watchContacts (1 uses in new blueprints)
    m('teamleader:watchContacts', 'watch Contacts', 'Teamleader', 'trigger',
      'Watch for watch Contacts in Teamleader',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // teamleader:getContact (1 uses in new blueprints)
    m('teamleader:getContact', 'get Contact', 'Teamleader', 'search',
      'Search/list get Contact in Teamleader',
      [
      p('id', 'select', true, 'Contact ID')
    ]),

    // --- Telegram ---
    // telegram:WatchUpdates (10 uses in new blueprints)
    m('telegram:WatchUpdates', 'Watch Updates', 'Telegram', 'trigger',
      'Watch for Watch Updates in Telegram',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // telegram:SendReplyMessage (3 uses in new blueprints)
    m('telegram:SendReplyMessage', 'Send Reply Message', 'Telegram', 'action',
      'Perform Send Reply Message in Telegram',
      [
      p('chatId', 'text', true, 'Chat ID'),
      p('text', 'text', true, 'Text'),
      p('messageThreadId', 'number', false, 'Message Thread ID'),
      p('parseMode', 'select', false, 'Parse Mode'),
      p('disableNotification', 'boolean', false, 'Disable Notifications'),
      p('disableWebPagePreview', 'boolean', false, 'Disable Link Previews'),
      p('replyToMessageId', 'number', false, 'Original Message ID'),
      p('replyMarkupAssembleType', 'select', false, 'Enter/Assemble the Reply Markup Field'),
      p('replyMarkup', 'text', false, 'Reply Markup')
    ]),
    // telegram:DownloadFile (1 uses in new blueprints)
    m('telegram:DownloadFile', 'Download File', 'Telegram', 'action',
      'Perform Download File in Telegram',
      [
      p('fileId', 'text', true, 'File ID')
    ]),

    // --- Tools ---
    // util:GetVariables (2 uses in new blueprints)
    m('util:GetVariables', 'Get Variables', 'Tools', 'search',
      'Search/list Get Variables in Tools',
      [
      p('variables', 'array', false, 'Variables')
    ]),
    // util:SetVariable (1 uses in new blueprints)
    m('util:SetVariable', 'Set Variable', 'Tools', 'action',
      'Perform Set Variable in Tools',
      [
      p('name', 'text', true, 'Variable name'),
      p('scope', 'select', true, 'Variable lifetime'),
      p('value', 'text', false, 'Variable value')
    ]),
    // util:FunctionIncrement (1 uses in new blueprints)
    m('util:FunctionIncrement', 'Function Increment', 'Tools', 'action',
      'Perform Function Increment in Tools',
      [
      p('reset', 'select', true, 'Reset a value')
    ]),

    // --- Trello ---
    // trello:createCard (2 uses in new blueprints)
    m('trello:createCard', 'create Card', 'Trello', 'action',
      'Perform create Card in Trello',
      [
      p('list_id_select_or_manual', 'select', true, 'Enter a List ID'),
      p('name', 'text', false, 'Name'),
      p('description', 'text', false, 'Description'),
      p('position', 'select', false, 'Position'),
      p('start', 'date', false, 'Start date'),
      p('due_date', 'date', false, 'Due date'),
      p('dueComplete', 'boolean', true, 'Due complete'),
      p('urlSource', 'url', false, 'File URL'),
      p('filename', 'text', false, 'File name'),
      p('filedata', 'text', false, 'File data'),
      p('select_or_manual_cardID', 'select', false, 'Copy card'),
      p('board_id', 'select', true, 'Board'),
      p('list_id', 'select', true, 'List'),
      p('labels_id', 'select', false, 'Labels'),
      p('members_id', 'select', false, 'Members')
    ]),
    // trello:createAList (1 uses in new blueprints)
    m('trello:createAList', 'create A List', 'Trello', 'search',
      'Search/list create A List in Trello',
      [
      p('board_id', 'select', true, 'Board ID'),
      p('name', 'text', true, 'Name'),
      p('pos', 'select', false, 'Position'),
      p('select_or_manual_listID', 'select', false, 'Copy list')
    ]),
    // trello:watchCards (1 uses in new blueprints)
    m('trello:watchCards', 'watch Cards', 'Trello', 'trigger',
      'Watch for watch Cards in Trello',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('node', 'select', true, 'Watched object'),
      p('limit', 'number', true, 'Limit'),
      p('board_id', 'select', true, 'Board'),
      p('list_id', 'select', true, 'List')
    ]),
    // trello:getACard (1 uses in new blueprints)
    m('trello:getACard', 'get A Card', 'Trello', 'search',
      'Search/list get A Card in Trello',
      [
      p('board_id', 'text', false, 'Board ID'),
      p('select_or_manual', 'select', true, 'Enter card ID'),
      p('card_id', 'text', true, 'Card ID')
    ]),
    // trello:editACard (1 uses in new blueprints)
    m('trello:editACard', 'edit A Card', 'Trello', 'action',
      'Perform edit A Card in Trello',
      [
      p('manual_or_select', 'select', true, 'Enter Card ID'),
      p('name', 'text', false, 'New name'),
      p('description', 'text', false, 'New description'),
      p('moveCard', 'select', false, 'Move a card'),
      p('labels_id', 'array', false, 'Labels'),
      p('position', 'select', false, 'Position'),
      p('due_date', 'date', false, 'Due date'),
      p('dueComplete', 'boolean', false, 'Due complete'),
      p('members_id', 'array', false, 'Members'),
      p('idAttachmentCover', 'text', false, 'Attachment cover ID'),
      p('subscribed', 'boolean', false, 'Subscribe'),
      p('closed', 'boolean', false, 'Archive'),
      p('card_id', 'text', true, 'Card ID'),
      p('idBoard', 'select', false, 'Board ID'),
      p('idList', 'select', false, 'List ID')
    ]),

    // --- VK.com ---
    // vk-com:NewPost (1 uses in new blueprints)
    m('vk-com:NewPost', 'New Post', 'VK.com', 'action',
      'Perform New Post in VK.com',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('filter', 'select', false, 'Filter'),
      p('owner_id', 'number', false, 'Owner ID'),
      p('domain', 'text', false, 'Domain'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- Webhooks ---
    // gateway:CustomMailHook (2 uses in new blueprints)
    m('gateway:CustomMailHook', 'Custom Mail Hook', 'Webhooks', 'trigger',
      'Watch for Custom Mail Hook in Webhooks',
      [
      p('hook', 'text', false, 'Mailhook'),
      p('maxResults', 'number', false, 'Maximum number of results')
    ]),

    // --- WhatsApp Business ---
    // whatsapp-business-cloud:sendMessage (2 uses in new blueprints)
    m('whatsapp-business-cloud:sendMessage', 'send Message', 'WhatsApp Business', 'action',
      'Perform send Message in WhatsApp Business',
      [
      p('fromId', 'select', true, 'Sender ID'),
      p('to', 'text', true, 'Receiver'),
      p('type', 'select', true, 'Message Type'),
      p('text', 'collection', false, 'Text')
    ]),
    // whatsapp-business-cloud:watchEvents (1 uses in new blueprints)
    m('whatsapp-business-cloud:watchEvents', 'watch Events', 'WhatsApp Business', 'trigger',
      'Watch for watch Events in WhatsApp Business',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // whatsapp-business-cloud:watchEvents2 (1 uses in new blueprints)
    m('whatsapp-business-cloud:watchEvents2', 'watch Events2', 'WhatsApp Business', 'trigger',
      'Watch for watch Events2 in WhatsApp Business',
      []),

    // --- WhatsScale ---
    // whatsscale:findCrmContactByPhone (2 uses in new blueprints)
    m('whatsscale:findCrmContactByPhone', 'find Crm Contact By Phone', 'WhatsScale', 'search',
      'Search/list find Crm Contact By Phone in WhatsScale',
      [
      p('phone', 'text', true, 'Phone Number')
    ]),

    // --- Wild apricot ---
    // wild-apricot:getContactsList (1 uses in new blueprints)
    m('wild-apricot:getContactsList', 'get Contacts List', 'Wild apricot', 'search',
      'Search/list get Contacts List in Wild apricot',
      [
      p('MembershipEnabled', 'boolean', false, 'MembershipEnabled'),
      p('MembershipLevelId', 'select', false, 'MembershipLevelId'),
      p('MembershipStatus', 'select', false, 'MembershipStatus'),
      p('Filter', 'array', false, 'Filter'),
      p('Select', 'array', false, 'Select')
    ]),

    // --- WooCommerce ---
    // woocommerce:WatchOrders (1 uses in new blueprints)
    m('woocommerce:WatchOrders', 'Watch Orders', 'WooCommerce', 'trigger',
      'Watch for Watch Orders in WooCommerce',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('status', 'select', false, 'Status'),
      p('limit', 'number', true, 'Limit')
    ]),
    // woocommerce:WatchCustomers (1 uses in new blueprints)
    m('woocommerce:WatchCustomers', 'Watch Customers', 'WooCommerce', 'trigger',
      'Watch for Watch Customers in WooCommerce',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('role', 'select', false, 'Role'),
      p('watch', 'select', false, 'I want to watch'),
      p('limit', 'number', true, 'Limit')
    ]),
    // woocommerce:WatchProducts (1 uses in new blueprints)
    m('woocommerce:WatchProducts', 'Watch Products', 'WooCommerce', 'trigger',
      'Watch for Watch Products in WooCommerce',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),

    // --- WordPress ---
    // wordpress:createPost (2 uses in new blueprints)
    m('wordpress:createPost', 'create Post', 'WordPress', 'action',
      'Perform create Post in WordPress',
      [
      p('title', 'text', true, 'Title'),
      p('content', 'text', true, 'Content'),
      p('type', 'select', true, 'Type'),
      p('excerpt', 'text', false, 'Excerpt'),
      p('date', 'date', false, 'Date'),
      p('slug', 'text', false, 'Slug'),
      p('status', 'select', false, 'Status'),
      p('format', 'select', false, 'Format'),
      p('parent', 'number', false, 'Parent object ID'),
      p('categories', 'select', false, 'Categories'),
      p('tags', 'select', false, 'Tags'),
      p('author', 'select', false, 'Author'),
      p('featuredMedia', 'number', false, 'Featured media ID'),
      p('template', 'text', false, 'Template'),
      p('password', 'text', false, 'Password'),
      p('sticky', 'boolean', false, 'Sticky'),
      p('commentStatus', 'select', false, 'Comment status'),
      p('pingStatus', 'select', false, 'Ping status'),
      p('taxonomy', 'array', false, 'Additional fields'),
      p('meta', 'array', false, 'Metadata (custom fields)')
    ]),
    // wordpress:watchComments (1 uses in new blueprints)
    m('wordpress:watchComments', 'watch Comments', 'WordPress', 'trigger',
      'Watch for watch Comments in WordPress',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('limit', 'number', true, 'Limit')
    ]),
    // wordpress:searchUsers (1 uses in new blueprints)
    m('wordpress:searchUsers', 'search Users', 'WordPress', 'search',
      'Search/list search Users in WordPress',
      [
      p('search', 'text', false, 'Search'),
      p('roles', 'select', false, 'Roles'),
      p('order', 'collection', false, 'Order By'),
      p('limit', 'number', false, 'Limit'),
      p('include', 'array', false, 'Include'),
      p('exclude', 'array', false, 'Exclude'),
      p('slug', 'text', false, 'Slug')
    ]),

    // --- Yeeflow ---
    // yeeflow:itemCreated (1 uses in new blueprints)
    m('yeeflow:itemCreated', 'item Created', 'Yeeflow', 'action',
      'Perform item Created in Yeeflow',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),

    // --- Z-API ---
    // z-api:sendTextMessage (2 uses in new blueprints)
    m('z-api:sendTextMessage', 'send Text Message', 'Z-API', 'action',
      'Perform send Text Message in Z-API',
      [
      p('phone', 'text', true, 'Phone'),
      p('message', 'text', true, 'Message'),
      p('messageId', 'text', false, 'Message ID'),
      p('privateAnswer', 'boolean', false, 'Private Answer'),
      p('delayMessage', 'number', false, 'Delay Message'),
      p('delayTyping', 'number', false, 'Delay Typing'),
      p('editMessageId', 'text', false, 'Edit Message ID'),
      p('headers', 'array', false, 'Headers')
    ]),

    // --- Zendesk ---
    // zendesk:CreateTicket (2 uses in new blueprints)
    m('zendesk:CreateTicket', 'Create Ticket', 'Zendesk', 'action',
      'Perform Create Ticket in Zendesk',
      [
      p('subject', 'text', false, 'Subject'),
      p('comment', 'collection', true, 'Comment'),
      p('via_followup_source_id', 'select', false, 'Closed Ticket ID'),
      p('type', 'select', false, 'Type'),
      p('priority', 'select', false, 'Priority'),
      p('status', 'select', false, 'Status'),
      p('requester_id', 'select', false, 'Requester ID'),
      p('submitter_id', 'select', false, 'Submitter ID'),
      p('assignee_id', 'select', false, 'Assignee ID'),
      p('group_id', 'select', false, 'Group ID'),
      p('recipient', 'email', false, 'Recipient'),
      p('collaborators', 'select', false, 'Collaborators'),
      p('followers', 'array', false, 'Followers'),
      p('email_ccs', 'array', false, 'Email CCs'),
      p('ticket_form_id', 'select', false, 'Ticket Form ID'),
      p('macro_ids', 'select', false, 'Macro IDs'),
      p('tags', 'select', false, 'Tags'),
      p('brand_id', 'select', false, 'Brand ID'),
      p('metadata', 'text', false, 'Metadata'),
      p('problem_id', 'number', false, 'Problem ID'),
      p('external_id', 'text', false, 'External ID'),
      p('custom_fields', 'collection', false, 'Custom Fields')
    ]),

    // --- ZeroBounce ---
    // zerobounce:validateEmails (3 uses in new blueprints)
    m('zerobounce:validateEmails', 'validate Emails', 'ZeroBounce', 'action',
      'Perform validate Emails in ZeroBounce',
      [
      p('email', 'email', true, 'Email address'),
      p('ip_address', 'text', false, 'IP Address')
    ]),

    // --- Zoho CRM ---
    // zohocrm:SearchObjects (1 uses in new blueprints)
    m('zohocrm:SearchObjects', 'Search Objects', 'Zoho CRM', 'search',
      'Search/list Search Objects in Zoho CRM',
      [
      p('module', 'select', false, 'Module'),
      p('email', 'email', false, 'Email'),
      p('approved', 'select', false, 'Approved records'),
      p('limit', 'number', true, 'Limit'),
      p('filter', 'text', true, 'Filter')
    ]),

    // --- Zoho Invoice ---
    // zoho-invoice:watchInvoices (1 uses in new blueprints)
    m('zoho-invoice:watchInvoices', 'watch Invoices', 'Zoho Invoice', 'trigger',
      'Watch for watch Invoices in Zoho Invoice',
      [
      p('__IMTCONN__', 'text', true, 'Connection'),
      p('choose', 'select', true, 'Watch'),
      p('item_id', 'select', false, 'Select Item'),
      p('status', 'select', false, 'Status'),
      p('filter_by', 'select', false, 'Filter By'),
      p('sort_column', 'select', false, 'Sort Column'),
      p('limit', 'number', true, 'Limit')
    ]),
    // zoho-invoice:getContact (1 uses in new blueprints)
    m('zoho-invoice:getContact', 'get Contact', 'Zoho Invoice', 'search',
      'Search/list get Contact in Zoho Invoice',
      [
      p('contact_id', 'select', true, 'Contact ID')
    ]),
    // zoho-invoice:listInvoices (1 uses in new blueprints)
    m('zoho-invoice:listInvoices', 'list Invoices', 'Zoho Invoice', 'search',
      'Search/list list Invoices in Zoho Invoice',
      [
      p('filter', 'text', false, 'Filter'),
      p('item_id', 'select', false, 'Select Item'),
      p('status', 'select', false, 'Status'),
      p('filter_by', 'select', false, 'Filter By'),
      p('sort_column', 'select', false, 'Sort Column'),
      p('limit', 'number', false, 'Limit')
    ]),
    // zoho-invoice:getInvoice (1 uses in new blueprints)
    m('zoho-invoice:getInvoice', 'get Invoice', 'Zoho Invoice', 'search',
      'Search/list get Invoice in Zoho Invoice',
      [
      p('invoice_id', 'select', true, 'Invoice ID'),
      p('accept', 'select', true, 'Print')
    ]),

    // --- Zoho Sign ---
    // zoho-sign:DocumentCompleted (1 uses in new blueprints)
    m('zoho-sign:DocumentCompleted', 'Document Completed', 'Zoho Sign', 'action',
      'Perform Document Completed in Zoho Sign',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),
    // zoho-sign:DocumentDetails (1 uses in new blueprints)
    m('zoho-sign:DocumentDetails', 'Document Details', 'Zoho Sign', 'action',
      'Perform Document Details in Zoho Sign',
      [
      p('requestId', 'text', true, 'Document ID')
    ]),
    // zoho-sign:DownloadDocumentNew (1 uses in new blueprints)
    m('zoho-sign:DownloadDocumentNew', 'Download Document New', 'Zoho Sign', 'action',
      'Perform Download Document New in Zoho Sign',
      [
      p('requestId', 'text', true, 'Document ID')
    ]),

    // --- Zoom user ---
    // zoom-user:watchWebinars (1 uses in new blueprints)
    m('zoom-user:watchWebinars', 'watch Webinars', 'Zoom user', 'trigger',
      'Watch for watch Webinars in Zoom user',
      [
      p('__IMTHOOK__', 'text', true, 'Webhook')
    ]),


        ];
    }

    async populateDatabase() {
        console.log('Populating database with Make.com modules...');

        const modules = await this.scrapeFromMakeAPI();

        let success = 0;
        let failed = 0;

        for (const mod of modules) {
            try {
                this.db.insertModule(mod);
                console.log(`  ✅ ${mod.app} → ${mod.name}`);
                success++;
            } catch (error: any) {
                console.error(`  ❌ ${mod.name}: ${error.message}`);
                failed++;
            }
        }

        console.log(`\nDone! ${success} modules inserted, ${failed} failed.`);
        console.log(`Total modules in database: ${modules.length}`);

        // Populate blueprint templates from example flows folders
        console.log('\n🔄 Populating blueprint templates...');
        const templateResult = populateTemplates(this.db);
        console.log(`✅ Templates inserted: ${templateResult.inserted}`);
        if (templateResult.errors > 0) {
            console.log(`⚠️  Template errors: ${templateResult.errors}`);
        }

        // Populate module examples from blueprint configs
        console.log('\n🔄 Populating module examples...');
        this.db.clearExamples();
        const examplesResult = populateExamples(this.db);
        console.log(`✅ Examples inserted: ${examplesResult.inserted} across ${examplesResult.modules} modules`);

        this.db.close();
    }
}

const isMain = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '');
if (isMain) {
    const scraper = new ModuleScraper();
    scraper.populateDatabase().catch(console.error);
}
