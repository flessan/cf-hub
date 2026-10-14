# GitHub integration for CF-Hub

CF-Hub's GitHub area uses GitHub's REST API for native repository, issue, pull-request and commit screens. The browser screen is a convenience for full GitHub pages, not the API/authentication layer.

## Create and configure the GitHub App

1. Open [GitHub Developer Settings](https://github.com/settings/apps) and create a **GitHub App** named **CF-Hub** (or a name GitHub says is available).
2. Set the homepage to `https://github.com/flessan/cf-hub` while the project is in development.
3. Enable **Device Flow** in the app's optional features. CF-Hub uses the device authorization grant, so it does **not** need an OAuth callback URL or a client secret embedded in the mobile app.
4. In **Repository permissions**, start with least privilege:
   - **Metadata**: Read-only (required).
   - **Contents**: Read-only.
   - **Issues**: Read-only.
   - **Pull requests**: Read-only.
5. Do not grant write permissions, add webhooks, generate a private key, or install the app on every repository unless you later add features that genuinely need them. For initial testing, restrict installation access to selected repositories if installation access is needed.
6. Save the app and copy its **Client ID**. Do not put a client secret or private key into the mobile project.

> CF-Hub currently uses user authorization through Device Flow for native read-only API screens. Repository listing depends on the permissions and repositories visible to the authorized user. The initial implementation does not need a webhook URL, callback URL, app private key, or server-side secret.

## Configure the app

Create a local `.env` file (do not commit a real secret file) or set the variable in your local/build environment:

```dotenv
EXPO_PUBLIC_GITHUB_CLIENT_ID=Iv1.example-client-id
```

The Client ID is public app configuration, not a secret. Restart Expo after changing environment variables and rebuild the native app for production. The repository includes `.env.example` as a template.

If no Client ID is configured, you can still test the native API screens by pasting your own GitHub token in the GitHub tab. CF-Hub validates it against `GET /user` before saving it in secure device storage. Use a fine-grained token limited to the repositories and read-only permissions you need. Never paste a client secret or GitHub App private key into the app.

## User experience

- **GitHub tab**: account status, repository shortcuts and public repository search.
- **Repositories**: private/public repositories the signed-in account can access.
- **Issues and pull requests**: open items involving the connected account.
- **Repository detail**: repository overview, issues, pull requests and recent commits.
- **Browser**: embedded GitHub browsing on native platforms, with browser controls. Web builds open the requested page using the platform browser instead.
- **Storage**: native device tokens use Expo SecureStore. Web builds use browser local storage; avoid connecting a privileged account on a shared/public browser.

## Before publishing

- Set the real GitHub App Client ID in the release build environment.
- Confirm the app's selected repository permissions are still read-only.
- Test authorization approval, denial, device-code expiry, revoked/expired access, API rate limits, private repositories and sign-out.
- Review [GitHub's terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) and your app privacy policy before a public release.
- The current GitHub-to-Cloudflare Pages link is a device-local shortcut: it stores a Pages project name and opens the existing CF-Hub Pages screen. It does not verify that the repository is connected to that project or change either service's deployment settings.
