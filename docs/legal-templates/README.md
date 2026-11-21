# Legal text templates

Foodlog I/O shows a privacy policy and an imprint. The texts are **not part of the app**: the operator provides them as Markdown files, so personal details never end up in this public repository.

## How it works

The backend reads these files from the directory given by `LEGAL_DIR` (default `./legal`, in production a mounted directory, see `docs/deployment.md`):

| File                             | Shown at   |
| -------------------------------- | ---------- |
| `privacy.de.md`, `privacy.en.md` | `/privacy` |
| `imprint.de.md`, `imprint.en.md` | `/imprint` |

If a language is missing the other one is shown with a notice. If neither exists, the page says that the operator has not provided the text yet. Template placeholders are never shown automatically.

## Usage

1. Copy the four templates from this directory into the legal directory of your installation.
2. Replace every `[PLACEHOLDER]` and remove the passages that do not apply to your setup (for example Google sign-in or AI analysis if you switch them off).
3. Have the texts reviewed. The templates are a starting point written by a developer, **not legal advice**. They assume a small, privately operated service in Germany; your situation may need more (for example a data processing agreement with your hosting provider, a record of processing activities, a data protection officer).
4. Supported Markdown: headings (`#` to `####`), paragraphs, lists, `**bold**`, `*italic*`, `` `code` `` and links with `https:` or `mailto:`. No HTML.

## When to update

Update the privacy policy whenever the processing changes: new features that send data elsewhere, new service providers, changed retention periods (see `backend/src/services/retention.ts`) or a changed AI consent text (also bump `AI_CONSENT_VERSION`).
