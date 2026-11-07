# Build & Release Engineering Guide
# StockBeacon — Android (APK / AAB) & iOS Release Configuration

---

## 1. Application Identifiers & Versioning

- **Application Name**: `StockBeacon`
- **Slug**: `stock-beacon`
- **Version**: `1.0.0`
- **Android Version Code**: `1`
- **iOS Build Number**: `1.0.0`
- **Android Package Identifier**: `com.stockbeacon.inventory`
- **iOS Bundle Identifier**: `com.stockbeacon.inventory`
- **Orientation**: Portrait (`portrait`)
- **Offline Requirement**: Zero external API dependencies; 100% functional in Airplane Mode.

---

## 2. EAS Build Profiles (`eas.json`)

StockBeacon includes three production-ready EAS Build profiles in `eas.json`:

1. **`development`**:
   - Development client build (`developmentClient: true`) for local device debugging.
   - Android artifact: `apk`.
2. **`preview` (Direct Installable APK / Ad-Hoc iOS)**:
   - Designed for direct business installation on Android devices without requiring Google Play (`"buildType": "apk"`).
   - iOS simulator / ad-hoc provisioning (`"simulator": true` option or internal distribution).
3. **`production` (Google Play AAB & Apple App Store)**:
   - Android App Bundle (`"buildType": "app-bundle"`) for Google Play Console distribution.
   - iOS App Store distribution with auto-incrementing build numbers.

---

## 3. Native Permissions Configured

### Android (`app.json` -> `android.permissions`)
- `android.permission.CAMERA` — Used exclusively for offline barcode scanning (`expo-camera`).
- `android.permission.RECEIVE_BOOT_COMPLETED` / `android.permission.VIBRATE` — Used for local daily stock count reminders (`expo-notifications`).

### iOS (`app.json` -> `ios.infoPlist`)
- `NSCameraUsageDescription`: *"StockBeacon uses the camera to scan product barcodes for fast stock lookup, inward entry, and physical stock counts."*
- `NSPhotoLibraryUsageDescription`: *"StockBeacon allows attaching product photos from your library."*

---

## 4. Build Verification & Local Bundle Export Commands

- **TypeScript Strict Verification**:
  ```bash
  npm run typecheck
  ```
- **Automated Unit & Integration Test Suite**:
  ```bash
  npm test
  ```
- **Production Bundle Verification (Android & iOS static export check)**:
  ```bash
  npx expo export --platform android --output-dir dist-android
  ```
- **EAS Cloud Build Commands**:
  ```bash
  # Direct installable Android APK
  npx eas-cli build --platform android --profile preview

  # Google Play Store Android App Bundle (AAB)
  npx eas-cli build --platform android --profile production

  # iOS App Store Build
  npx eas-cli build --platform ios --profile production
  ```
- **Local Native Android Prebuild & Gradle Build (when Android SDK / JDK is installed locally)**:
  ```bash
  npx expo prebuild --platform android
  cd android && ./gradlew assembleRelease
  ```
