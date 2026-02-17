export type SSEEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'error'
  | 'ping';

export interface ProxySSEEvent {
  event: SSEEventType;
  data: string;
}

export interface ContentDelta {
  type: 'text_delta';
  text: string;
}

export interface InputJsonDelta {
  type: 'input_json_delta';
  partial_json: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
}

export interface MessageStartData {
  type: 'message_start';
  message: {
    id: string;
    model: string;
    usage: {
      input_tokens: number;
    };
  };
}

export interface MessageDeltaData {
  type: 'message_delta';
  usage: {
    output_tokens: number;
  };
}
