# GroupProject2 - Pickin' Trash (A volunteering app)

A mobile app that connects students with local environmental volunteering events. Built with **Expo (React Native)** and **Firebase**, it features event discovery and creation, QR check-in, geolocation and Google Places search, friend/follow social features, points & badges, and organizer dashboards.

---

## Tech Stack

- **Mobile**: Expo (React Native, TypeScript), expo-router
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Maps & Places**: Google Maps SDK + Places/Geocoding APIs
- **QR / Camera**: `expo-camera`
- **Styling**: React Native StyleSheet

---

## Project Structure

```
MyApp/
├─ app/                     # expo-router routes (tabs, screens)
├─ assets/                  # images, icons, splash, fonts
├─ components/              # shared UI components
├─ constants/               # theme, avatar map, etc.
├─ contexts/                # AuthContext and providers
├─ firebase/                # Firebase config & service layer
├─ hooks/                   # custom hooks
├─ node_modules/            # dependencies installed locally (not committed to GitHub)
├─ scripts/
├─ .env                     # environment variables (local)
├─ .env.example             # sample env vars
├─ app.config.ts            # Expo app configuration (icons, splash, plugins)
├─ eslint.config.js
├─ expo-env.d.ts
├─ package-lock.json
├─ package.json
└─ tsconfig.json

```

---

## Features

### Core Screens Implemented

### 1) Home

- Personalized welcome and role badge (Volunteer or Organizer).
- “Next Event” card with date, location, and quick deep-link into details.
- Progress snapshot: points, events completed, friends count (volunteer) or events created/total volunteers (organizer).
- Pull-to-refresh to update stats and upcoming event.

### 2) Events

- Browse active events by date and category (urban, beach, forest, etc.).
- Event sheet shows description, capacity, points reward, map/address, and organizer.
- Join/leave controls with state awareness.
- Organizer tools: create, edit, and view event stats.
- Google Places search and embedded map preview on create/edit.

### 3) Scan QR

- Edge-to-edge camera with masked frame for accurate scanning.
- One-tap check-in for joined volunteers; blocks duplicate or unauthorized check-ins.
- Dark/light aware overlay and guidance text.
- Fallback manual code flow (via event check-in code).

### 4) Inbox

- Central place for social and system updates: friend/follow requests, event reminders, acceptance/decline states.
- Quick actions on items (accept/decline friend, open event, open chat).

### 5) Profile

- View and edit your user profile (name, bio, avatar).
- Role-aware stats (points, events completed or events created).
- Social actions: add friend, follow organizer, start chat, remove friend.
- Organizer profiles show follow state and allow unfollow.

### Cross-Cutting Capabilities

- Firebase Auth and Firestore data layer with typed services.
- Role-aware UI: volunteer vs organizer behavior and stats.
- Google Places Autocomplete and Geocoding for event locations.
- Consistent dark/light theming for headers, overlays, and surfaces.
- Expo Router navigation with tab layout and deep links to details.

---

## Key Components Overview

| Component | Purpose |
|------------|----------|
| `app/` | Main navigation using `expo-router`, defining tab structure for Home, Events, Add (QR/Creation), Inbox, and Profile. |
| `components/` | Reusable UI components and icons. |
| `constants/` | Centralized definitions (colors, icons, category names, etc.). |
| `contexts/` | Provides React Contexts for authentication and user data. Manages login state and user roles (volunteer or organizer) across the app. |
| `firebase/` | Contains Firestore and Auth configuration, API calls for CRUD operations (events, users, chats, points). |

---

## Libraries & Services

| Library / Service | Purpose |
|--------------------|----------|
| **Firebase Auth** | User authentication (volunteer/organizer sign up and login). |
| **Firebase Firestore** | Stores users, events, and chat data. |
| **Expo Router** | Handles navigation and screen hierarchy. |
| **Expo Device** / **Expo Constants** | Used for app/device metadata and permission management. |
| **Expo Camera / QR Scanner** | Enables volunteer check-in via QR code. |
| **Google Maps SDK & Places API** (react-native-maps) | Event location search and map visualization. |
| **React Native Reanimated** | Smooth UI animations and transitions. |
| **React Native Async Storage** | Caches user session data locally for offline persistence. |

---

## Firebase Data Model

Check `firebase/schema.ts` for a detailed definition of Firestore Collection schemas and structure. 

**Note**: The Firebase project is configured for **email/password authentication** only. 

---

## Prerequisites

- Node.js 18+ and npm
- Xcode (iOS) and/or Android Studio (Android)
- Expo CLI (`npm i -g expo-cli`) or use `npx expo`
- A Firebase project (Firestore, Auth enabled)
- Google Cloud project with **Maps SDK**, **Places API**, and **Geocoding API** enabled

---

## Environment Variables

If you'd like to use your own API keys, replace the keys in the `.env` file with your own. Please do not re-commit `.env` changes if you were to do this. An example layout is also provided in `.env.example` with fake dummy keys:

```
# Google Maps / Places (can be the same key for both IOS and Android)
MAPS_ANDROID_API_KEY=...   # Android SDK key
MAPS_IOS_API_KEY=...       # iOS SDK key

# Firebase
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
```

The `firebase/config.ts` should read from these env vars, and `app.config.ts` is already set up to inject the iOS/Android Maps keys into native builds.

---

## Installation

```bash
# from project root
npm install
# ensure native Expo packages are correct
npx expo install
```

If any Expo native module is added later, prefer `npx expo install <pkg>` so Expo picks a compatible version.

---

## Running the App

### iOS (Simulator or Device)

```bash
npx expo start     # press "i" to open iOS simulator, or scan QR in Expo Go if your deps allow
```

### Android (Emulator or Device)

```bash
npx expo start         # press "a" for Android emulator
```

---

