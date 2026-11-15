# Tutor tools come from the provider where it has them, from the app otherwise

The chat model had no tools: Claude ran with tools off and one turn, Codex with web search and shell off, and custom endpoints sent none. We decided that the chat model uses a provider's own tool where one exists (Claude's web search and page fetch, Codex's web search) and the app supplies every other tutor tool: page reading where the provider lacks it, image finding, Python and the memory note. The app serves its tools to Claude and Codex through one local MCP server with a per-turn token, and to custom endpoints through function calling, so a single tool runner backs all three. App search uses a learner-run SearXNG instance, which is free, needs no key and returns images as well as pages. Python runs in bubblewrap with no network and only preinstalled libraries; data reaches it through page reading's save-as-file, which refuses local and private addresses. We accepted results that differ slightly between providers, and a SearXNG setup step for custom endpoints and image finding, in exchange for each provider's best search and one set of tools for every model.

## Considered Options

- App tools for every provider. Results would be identical everywhere, but Claude and Codex would lose their stronger built-in search.
- Provider tools only. This needed the least code, but custom endpoints would get no tools, and no provider offers image finding or a Python sandbox we can show.
- A hosted search API such as Brave or Tavily. Setup is easier, but it needs a key, its free allowances are small, and Tavily's image search is weak.
- Python with network access, as some agent sandboxes allow. Model-written code steered by a hostile page could then reach the learner's machine and local network; major chatbots run code offline for the same reason.
