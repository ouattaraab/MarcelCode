export interface ToolCallData {
  id: string;
  name: string;
  input: any;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onToolUse: (toolCall: ToolCallData) => void;
  onStopReason: (reason: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Track tool_use blocks being built
  let currentToolId = '';
  let currentToolName = '';
  let jsonAccumulator = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: done')) {
          callbacks.onDone();
          return;
        }

        if (line.startsWith('event: error')) {
          continue;
        }

        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            callbacks.onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // Text content
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              callbacks.onText(parsed.delta.text);
            }

            // Tool use block start — capture id and name
            if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              currentToolId = parsed.content_block.id;
              currentToolName = parsed.content_block.name;
              jsonAccumulator = '';
            }

            // Tool use JSON input streaming
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
              jsonAccumulator += parsed.delta.partial_json;
            }

            // Tool use block done — emit the complete tool call
            if (parsed.type === 'content_block_stop' && currentToolId) {
              let toolInput = {};
              try {
                toolInput = JSON.parse(jsonAccumulator);
              } catch {
                toolInput = { raw: jsonAccumulator };
              }
              callbacks.onToolUse({
                id: currentToolId,
                name: currentToolName,
                input: toolInput,
              });
              currentToolId = '';
              currentToolName = '';
              jsonAccumulator = '';
            }

            // Stop reason (end_turn or tool_use)
            if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
              callbacks.onStopReason(parsed.delta.stop_reason);
            }

            // Error events
            if (parsed.error) {
              callbacks.onError(parsed.error);
              return;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    callbacks.onDone();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Stream error');
  } finally {
    reader.releaseLock();
  }
}
