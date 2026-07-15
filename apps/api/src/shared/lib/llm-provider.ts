import { env } from './prisma';
import { logger } from './logger';
import { LLMError } from '../errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Per-call timeout. Defaults to 30s. Short values (e.g. 5s) fail fast without retry. */
  timeoutMs?: number;
  /** Optional external abort (e.g. request cancellation). */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 500;

async function callOnce(body: unknown, signal: AbortSignal): Promise<Response> {
  return fetch(`${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });
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
    const body = {
      model: this.config.model,
      messages,
      max_tokens: opts.maxTokens ?? this.config.maxTokens,
      temperature: opts.temperature ?? this.config.temperature,
      stream: false,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const started = process.hrtime.bigint();
    const observeLatency = () => {
      try {
        // Lazy require avoids coupling metrics import graph to LLM tests
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const metrics = require('./metrics') as {
          llmLatencySeconds: { observe: (labels: { operation: string }, v: number) => void };
        };
        const sec = Number(process.hrtime.bigint() - started) / 1e9;
        metrics.llmLatencySeconds.observe({ operation: 'chat' }, sec);
      } catch {
        // metrics optional in some unit-test graphs
      }
    };

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // Soft UX timeouts (< default) must fail fast — retry would double the wait.
    const allowRetryOnAbort = timeoutMs >= DEFAULT_TIMEOUT_MS;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (opts.signal?.aborted) {
        const abortErr = new Error('LLM call aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const onExternalAbort = () => ctrl.abort();
      opts.signal?.addEventListener('abort', onExternalAbort, { once: true });

      try {
        const res = await callOnce(body, ctrl.signal);
        if (!res.ok) {
          const text = await res.text();
          const err = new LLMError(`Upstream ${res.status}`, {
            upstreamStatus: res.status,
            body: text.slice(0, 200),
          });
          if (attempt < MAX_ATTEMPTS && res.status >= 500) {
            logger.warn({ attempt, status: res.status }, 'llm call retried');
            await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
            continue;
          }
          observeLatency();
          throw err;
        }
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        const content = data.choices[0]?.message.content;
        if (!content) throw new LLMError('Empty response from LLM');
        observeLatency();
        return content;
      } catch (err: unknown) {
        lastErr = err;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isRetryableLLM =
          err instanceof LLMError &&
          (err.details as { upstreamStatus?: number } | undefined)?.upstreamStatus !== undefined &&
          ((err.details as { upstreamStatus?: number }).upstreamStatus ?? 0) >= 500;
        if (attempt < MAX_ATTEMPTS && ((isAbort && allowRetryOnAbort) || isRetryableLLM)) {
          logger.warn(
            { attempt, err: err instanceof Error ? err.message : String(err) },
            'llm call retried',
          );
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
          continue;
        }
        observeLatency();
        throw err;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onExternalAbort);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM call failed');
  }

  async chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
    const raw = await this.chat(messages, { ...opts, jsonMode: true });
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new LLMError('Invalid JSON from LLM', { raw: raw.slice(0, 200) });
    }
  }
}

export const llm = new LLMProvider();
