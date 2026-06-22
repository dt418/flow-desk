import { env } from './env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export class LLMError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`LLM error ${status}: ${body.slice(0, 200)}`);
    this.name = 'LLMError';
  }
}

export class LLMProvider {
  constructor(
    private config = {
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      maxTokens: env.LLM_MAX_TOKENS,
      temperature: env.LLM_TEMPERATURE,
    },
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: opts.maxTokens ?? this.config.maxTokens,
        temperature: opts.temperature ?? this.config.temperature,
        // Force non-streaming so res.json() works. Some OpenAI-compatible
        // proxies (e.g. internal gateways, model aggregators) default to SSE
        // and our parser would fail with SyntaxError. Pass stream:true later
        // if/when we want true streaming + a real SSE parser.
        stream: false,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LLMError(res.status, body);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message.content;
    if (!content) throw new LLMError(500, 'Empty response from LLM');
    return content;
  }

  async chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
    const raw = await this.chat(messages, { ...opts, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      throw new LLMError(500, `Invalid JSON from LLM: ${raw.slice(0, 200)}`);
    }
  }
}

export const llm = new LLMProvider();
