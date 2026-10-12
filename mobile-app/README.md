# OBA Emergency Manual Phone App

This folder contains the Expo/React Native phone app. The app loads the dedicated live app path at <https://officebasedanesthesia.github.io/office-based-emergency-manual/app/>, with app-only navigation and Favorites enabled.

## Run the app

Requirements:

- Node.js
- Expo Go on the test phone
- The phone and computer on the same Wi-Fi network

From this folder:

```bash
npm install
npm start
```

Scan the displayed QR code with the phone. If local Wi-Fi discovery fails, run:

```bash
npx expo start --tunnel
```

## Validate a change

```bash
npm run typecheck
```

## Where to make changes

- `App.tsx`: native app shell, loading behavior, and WebView behavior
- `mobileWebCss.ts`: app-only visual adjustments
- `app.json`: app name, icon, version, and iOS/Android identifiers
- `assets/app-icon.png`: phone app icon

Manual content and most interface styling are maintained by the website files in the repository root. Publishing website changes updates the information shown inside the app.

## Collaboration workflow

Before editing, pull the newest `main` branch. Work on a separate branch and open a pull request rather than pushing competing edits directly to `main`.
