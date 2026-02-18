import { Router, Request, Response } from 'express';
import { ChatRequest, DEFAULT_MAX_TOKENS } from '@marcelia/shared';
import { createStream } from '../services/foundry.service';
import { forwardFoundryStream } from '../services/streaming.service';
import { routeRequest } from '../services/router.service';
import { getCachedResponse, setCachedResponse } from '../services/cache.service';
import { trackUsage } from '../services/usage.service';
import { logger } from '../config';
import { pluginRegistry } from '../plugin';

const WORKSPACE_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the workspace. Use this to examine source code before answering questions or making changes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file in the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from workspace root' },
        content: { type: 'string', description: 'Complete file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing a specific text section. The old_text must match exactly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path from workspace root' },
        old_text: { type: 'string', description: 'Exact text to find in the file' },
        new_text: { type: 'string', description: 'Text to replace it with' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory and any parent directories needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative directory path from workspace root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory, optionally filtered by glob pattern.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative directory path (empty for root)' },
        pattern: { type: 'string', description: 'Glob pattern filter (e.g. "*.ts")' },
      },
    },
  },
];

export const chatRoutes = Router();

chatRoutes.post('/', async (req: Request, res: Response) => {
  const requestId = req.headers['x-request-id'] as string;
  const user = (req as any).user;
  const body = req.body as ChatRequest;

  try {
    const model = routeRequest('chat', body.model, user);

    // Build system prompt with lightweight context (file tree only, no file contents)
    let systemPrompt = body.systemPrompt || '';
    const hasWorkspace = !!body.codebaseContext;

    if (body.codebaseContext) {
      const { rootName, fileTree, files } = body.codebaseContext;
      let contextSection = `\nTu as accès au workspace de l'utilisateur "${rootName}".`;
      contextSection += `\n\nArborescence des fichiers :\n${fileTree}`;

      // Include active file content if provided (small, relevant)
      if (files && files.length > 0) {
        contextSection += '\n\nFichier(s) actuellement ouvert(s) :\n';
        for (const file of files) {
          contextSection += `--- ${file.path} (${file.language}) ---\n${file.content}\n--- fin ---\n\n`;
        }
      }

      contextSection += '\nTu disposes d\'outils pour lire, créer, modifier et lister les fichiers de ce workspace. Utilise read_file pour examiner le code avant de répondre. Utilise write_file/edit_file pour créer ou modifier du code quand l\'utilisateur le demande.';

      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${contextSection}`
        : `Tu es Marcel'IA, un assistant IA de développement pour les développeurs ERANOVE/GS2E. Réponds toujours en français.\n${contextSection}`;
    }

    // Apply plugin prompt extensions
    for (const ext of pluginRegistry.getPromptExtensions()) {
      systemPrompt += '\n' + ext;
    }

    // Skip cache when tools are involved (tool results vary)
    if (!hasWorkspace) {
      const cached = await getCachedResponse('chat', body.messages, model, systemPrompt);
      if (cached) {
        res.setHeader('X-Cached', 'true');
        res.json({ ...cached, cached: true });
        return;
      }
    }

    const startTime = Date.now();

    // Build messages — content can be string (text) or array (tool_use/tool_result blocks)
    const messages: Array<{ role: string; content: any }> = body.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const stream = await createStream({
      model,
      messages,
      maxTokens: body.maxTokens || DEFAULT_MAX_TOKENS,
      systemPrompt: systemPrompt || undefined,
      tools: (() => {
        const proxyPluginTools = pluginRegistry.getTools();
        const clientPluginTools = (body.pluginTools || []).filter(
          (t: any) => t && typeof t.name === 'string' && typeof t.description === 'string' && t.input_schema
        );
        const allPluginTools = [...proxyPluginTools, ...clientPluginTools];
        if (hasWorkspace) {
          return [...WORKSPACE_TOOLS, ...allPluginTools];
        }
        return allPluginTools.length > 0 ? allPluginTools : undefined;
      })(),
    });

    const result = await forwardFoundryStream(stream, res, requestId);

    // Track usage async
    trackUsage({
      userId: user.id,
      requestType: 'chat',
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: Date.now() - startTime,
      cached: false,
      requestId,
    }).catch((err) => logger.error({ err }, 'Usage tracking failed'));

    // Cache non-tool responses
    if (!hasWorkspace) {
      setCachedResponse('chat', body.messages, model, {
        id: result.messageId,
        content: result.content,
        model,
        usage: result.usage,
        cached: false,
      }, systemPrompt).catch((err) => logger.error({ err }, 'Cache write failed'));
    }
  } catch (err) {
    logger.error({ err, requestId }, 'Chat request failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat request failed', code: 'CHAT_ERROR', requestId });
    }
  }
});
