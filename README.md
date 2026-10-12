# Office-Based Emergency Manual

This repository contains both versions of the project, with separate preview directories and URLs:

- **Website preview:** [`website/`](./website/) is published at <https://officebasedanesthesia.github.io/office-based-emergency-manual/website/>.
- **App preview:** [`app/`](./app/) is published at <https://officebasedanesthesia.github.io/office-based-emergency-manual/app/>.
- **Phone app source:** the Expo/React Native project is in [`mobile-app/`](./mobile-app/).

Shared website code and content remain in the repository root so both previews use the same current manual without maintaining duplicate data.

The phone app displays the published manual in an app-focused interface. Website information updates therefore flow into the app automatically after the website is published. App-only behavior, native loading, and App Store configuration live inside `mobile-app/`.

## Collaborating safely

1. Pull the latest `main` branch before starting.
2. Create a short-lived branch for your change.
3. Make and test the change.
4. Commit and push the branch.
5. Open a pull request for the other collaborator to review and merge.

This prevents either collaborator from accidentally overwriting the other's work.

## Website development

Serve the repository root locally:

```bash
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173/>.

## Phone app development

See [`mobile-app/README.md`](./mobile-app/README.md).
