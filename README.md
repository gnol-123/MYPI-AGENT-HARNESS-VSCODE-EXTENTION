# MYPI-by-SL

Full AI coding agent inside VS Code - powered by SL's PI.

## Features

- **Complete AI Assistant**: Read files, run shell commands, edit code, write new files - all from within VS Code
- **Multiple LLM Providers**: Anthropic, OpenAI, DeepSeek, Z.AI, or Together AI
- **Advanced Skills System**: Built-in skills for brainstorming, debugging, testing, refactoring, and more
- **Context-Aware**: Understands your project structure and follows your conventions
- **Streaming Responses**: See the AI think and work in real-time
- **Token Efficient**: Caches skills and optimizes prompts for faster responses

## Installation

### From GitHub Releases (Recommended)

1. Download the latest `.vsix` file from the [Releases page](../../releases)
2. Open VS Code
3. Go to Extensions → Click the "..." menu → Install from VSIX
4. Select the downloaded file

### From VS Code Marketplace

Coming soon!

## Quick Start

1. **Set your API Key**
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "MYPI-by-SL: Set API Key"
   - Enter your API key for your chosen provider

2. **Open the Chat**
   - Click the cat icon in the activity bar (left sidebar)
   - Or run "MYPI-by-SL: Open Chat" from the command palette

3. **Start Coding**
   - Ask questions about your code
   - Request features or bug fixes
   - Use context menu actions: "Explain selection", "Fix selection", "Refactor selection"

## Configuration

Open VS Code Settings and search for "mypi-by-sl" to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `mypi-by-sl.provider` | `anthropic` | LLM provider (anthropic, openai, deepseek, z-ai, together) |
| `mypi-by-sl.model` | `""` | Model ID (empty = provider default) |
| `mypi-by-sl.apiEndpoint` | `""` | Override API base URL (empty = provider default) |
| `mypi-by-sl.maxTokens` | `8192` | Maximum tokens per response |
| `mypi-by-sl.toolTimeout` | `120` | Maximum seconds for bash commands |
| `mypi-by-sl.thinkingLevel` | `high` | Model reasoning effort (off, low, medium, high) |
| `mypi-by-sl.skillsPath` | `""` | Override skill directory (empty = use bundled) |

## Keyboard Shortcuts

| Command | Shortcut |
|---------|----------|
| MYPI-by-SL: Open Chat | None (use command palette or activity bar) |
| MYPI-by-SL: Set API Key | `Ctrl+Shift+P` → search for command |

## Available Skills

MYPI-by-SL includes a comprehensive skills system that activates automatically based on your needs:

- **brainstorming**: Explores user intent and design before implementation
- **systematic-debugging**: Methodical bug fixing approach
- **test-driven-development**: Write tests before implementation
- **verification-before-completion**: Verify work before claiming done
- **frontend-design**: Intentional, distinctive UI design
- **lavish**: Visual plan/diagram rendering in browser
- **context7**: Up-to-date library documentation
- **writing-plans**: Create detailed implementation plans
- **executing-plans**: Execute implementation plans
- **and many more...**

## Common Commands

In the chat, you can use these commands:

- `/new` - Start a new chat session
- `/resume` - Browse and reopen past sessions
- `/clear` - Clear the current session
- `/help` - Show help and available commands
- `/model <name>` - Switch the AI model
- `/cd <path>` - Set working directory for shell commands

## Troubleshooting

### "No API key configured" error
Run "MYPI-by-SL: Set API Key" from the command palette and enter your API key.

### Slow response times
- Lower the `thinkingLevel` setting to "low" or "medium"
- Reduce `maxTokens` if you don't need long responses
- Check your internet connection

### Context7 not working
Set your Context7 API key in settings under `mypi-by-sl.context7ApiKey`. Get a free key at [context7.com/dashboard](https://context7.com/dashboard).

## Requirements

- VS Code 1.85.0 or higher
- Node.js (for extension runtime - bundled with VSIX)
- Internet connection for LLM API calls

## License

MIT License - see LICENSE file for details.

## Contributing

This is a personal project by SL. Issues and pull requests are welcome!

## Changelog

### v0.4.0
- Removed dependency on local `~/.pi/agent` directory
- Bundled skills and harness files for self-contained installation
- Fixed thinking budget to respect configuration
- Cached skills at activation for faster startup
- Moved version files to `versions/` folder

### v0.3.x
- Initial development versions

## Support

For issues and feature requests, please use the [GitHub Issues](../../issues) page.