# ADR-002: AI Provider Abstraction

## Context

FlowDesk requires AI features (assignment suggestions, auto-scheduling, meeting summarization). Users will deploy FlowDesk in varied environments:

- OpenAI API (cloud)
- Self-hosted Ollama / LM Studio / vLLM
- Custom proxies (LiteLLM, OpenRouter)
- Internal enterprise gateways

We need a provider abstraction that:

1. Supports any OpenAI-compatible endpoint
2. Accepts custom `baseUrl` and `model` via env vars
3. Allows swapping providers without code changes

## Decision

**Generic `LLMProvider` class** wrapping OpenAI-compatible chat completions.

```typescript
// apps/api/src/shared/lib/llm-provider.ts
export interface LLMConfig {
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string; // any string (can be "unused" for local)
  model: string; // e.g. gpt-4o-mini, llama3.1, qwen2.5
  maxTokens?: number;
  temperature?: number;
}

export class LLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: opts?.maxTokens ?? this.config.maxTokens,
        temperature: opts?.temperature ?? this.config.temperature ?? 0.7,
      }),
    });
    if (!res.ok) throw new LLMError(res.status, await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
```

## Environment Variables

```bash
# Required
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Optional
LLM_MAX_TOKENS=2048
LLM_TEMPERATURE=0.7
```

## Rationale

- **OpenAI-compatible** is the de facto standard. Ollama, LM Studio, vLLM, OpenRouter, LiteLLM all expose `/chat/completions` with the same request/response shape.
- **No SDK dependency** — `fetch` is built into Node 18+. One less package to maintain.
- **Swappable** — Change `LLM_BASE_URL` env var to switch providers. No code change.

## Alternatives Rejected

| Alternative                      | Why Rejected                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| **`openai` npm package**         | Couples to OpenAI SDK; harder to swap to non-OpenAI providers that deviate slightly |
| **`@anthropic-ai/sdk`**          | Locks to Claude only                                                                |
| **LangChain / LlamaIndex**       | Heavy framework; overhead for our simple use cases; not necessary                   |
| **Per-provider implementations** | Massive code duplication; maintenance nightmare                                     |

## Consequences

- **Positive**: Works with any OpenAI-compatible endpoint; zero vendor lock-in; tiny code surface
- **Negative**: Manual streaming handling if needed; no built-in retry/queue (must add in service layer); assumes OpenAI-compatible response shape

## Future Considerations

If we need streaming, add `streamChat(messages, onChunk)` method. If we need function calling / structured output, add `chatJSON<T>(messages, schema)` method that parses response through a Zod schema.
