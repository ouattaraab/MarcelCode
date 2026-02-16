export interface StreamCallbacks {
  onText: (text: string) => void;
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
          // Next data line has the error
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

            // Handle content_block_delta events
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              callbacks.onText(parsed.delta.text);
            }

            // Handle error events
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
