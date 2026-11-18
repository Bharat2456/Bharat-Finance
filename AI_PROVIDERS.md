# AI providers (bring your own)

There is no Bharat Finance AI service. Choose in Settings → AI provider:
- **Built-in explainer** (default): rule-based text from the computed numbers; no model, no network.
- **OpenAI-compatible**, **Anthropic** (direct-browser header), **Gemini**, **Local** (Ollama / LM Studio at localhost).

Requests contain the analysis data block you ask about and your question, sent straight from your browser to the provider you chose. The system prompt forbids profit promises, invented numbers and unsupported probabilities, but **a language model can still be wrong**: treat output as an explanation of the displayed data, not advice. Providers that block browser calls (CORS) cannot be used from a static site and are not proxied.

Status: request shapes and error handling are unit-tested with mocked responses; **no live-provider test has been run**.

**Models are automatic.** You only add a key. The app asks the provider which models that key can use, ranks them (preferring current, stable, general chat models), uses the best one, and switches to the next if a model is retired. An optional advanced override exists in Settings. If listing models fails (for example a CORS block), the error says so.
