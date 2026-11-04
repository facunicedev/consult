# Security Policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting: **Security tab > Report a vulnerability** on <https://github.com/facunicedev/consult>.

Include what you found, how to reproduce it and the impact. Expect an acknowledgement within a few days; this is a small volunteer project.

## Scope

- The program never writes `GROQ_API_KEY` to files or logs. A path where it could leak is in scope.
- Text you put in the context page is sent to OpenAI (Codex) and Groq by design; that is not a vulnerability, but do not include secrets.

## Supported versions

Only the latest release.
