# Introduction

MoeenApp is the mobile application for the Moeen project.

- Built with React Native, Expo, TypeScript, and Expo Router.
- Developed and tested as a native Android development build.
- Contains the user interface, navigation, application logic, assets, and native Android configuration.
- The supported local development command is:

```bash
npx expo run:android
```

# Getting Started

Follow the steps below to set up and run the project on an Android Emulator.

## 1. Required Tools

Useful setup guides:

- Expo local Android development:  
  https://docs.expo.dev/guides/local-app-development/

- Expo Android Emulator setup:  
  https://docs.expo.dev/workflow/android-studio-emulator/

- React Native environment setup:  
  https://reactnative.dev/docs/set-up-your-environment

Expo local builds use `npx expo run:android` to create a debug build and start the development server.

## 2. Verify the Required Tools

Run:

```bash
node --version
npm --version
java -version
javac -version
adb --version
```

Requirements:

- Node.js should use an active LTS version.
- Java and `javac` should use version 17.
- `adb` should be available from the Android SDK.

## 3. Configure Environment Variables

### macOS and Linux

Add the following variables to the shell configuration file.

For Zsh:

```bash
nano ~/.zshrc
```

For Bash:

```bash
nano ~/.bashrc
```

Add:

```bash
export JAVA_HOME="<JDK-17-path>"
export ANDROID_HOME="<Android-SDK-path>"
export PATH="$JAVA_HOME/bin:$PATH"
export PATH="$PATH:$ANDROID_HOME/emulator"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
```

Common macOS paths:

```bash
export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

Apply the changes:

```bash
source ~/.zshrc
```

or:

```bash
source ~/.bashrc
```

### Windows

Create the following user environment variables:

```text
JAVA_HOME=<JDK-17-path>
ANDROID_HOME=C:\Users\<username>\AppData\Local\Android\Sdk
```

Add these entries to the user `Path` variable:

```text
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Close and reopen the terminal after updating the environment variables.

## 4. Configure Android Studio

In Android Studio:

- Open **Settings → Languages & Frameworks → Android SDK**.
- Install an Android SDK Platform supported by the project.
- Make sure the following SDK tools are installed:
  - Android SDK Build-Tools
  - Android SDK Platform-Tools
  - Android SDK Command-line Tools
  - Android Emulator

Expo’s Android Emulator setup guide requires Android Studio, an Android SDK platform, Build-Tools, and the Android Emulator. :contentReference[oaicite:2]{index=2}

## 5. Create and Start an Emulator

In Android Studio:

- Open **Tools → Device Manager**.
- Select **Create Virtual Device**.
- Choose a phone profile.
- Select and download a supported Android system image.
- Use an ARM64 image on Apple Silicon Macs.
- Start one emulator using the Play button.

Verify that the emulator is connected:

```bash
adb devices
```

Expected output:

```text
List of devices attached
emulator-5554    device
```

## 6. Clone the Repository

Copy the HTTPS clone URL from Azure DevOps.

Run:

```bash
git clone https://AI26s@dev.azure.com/AI26s/Project%20F/_git/MoeenApp
cd MoeenApp
```

If Azure DevOps asks for a password, use a Personal Access Token with Code read and write permission.

## 7. Install Project Dependencies

From the project root:

```bash
npm install
```

The project already contains React Native and Expo. Do not create another Expo project inside this repository.

Do not install the old Expo CLI or React Native CLI globally. Use project commands through `npx`.

## 8. Run the Application

Start the Android Emulator first.

Then run from the project root:

```bash
npx expo run:android
```

This command:

- Builds the native Android debug application.
- Installs the APK on the running emulator.
- Starts Metro Bundler.
- Opens MoeenApp on the emulator.

The first build may take several minutes while Gradle downloads its dependencies.

The standard team workflow is:

```bash
npx expo run:android
```

The web target and Expo Go are not the standard development workflow for this project.

# Build and Test

## Run the Android Development Build

```bash
npx expo run:android
```

## Verify the Emulator

```bash
adb devices
```

## Verify Java and Gradle

```bash
java -version
javac -version

cd android
./gradlew --version
cd ..
```

The Gradle output should show Java 17.

## Verify the Expo Configuration

```bash
npx expo-doctor
```

## Common Issues

### Java Runtime Not Found

Verify:

```bash
java -version
javac -version
```

Also confirm that `JAVA_HOME` points to JDK 17.

### Emulator Not Detected

Run:

```bash
adb kill-server
adb start-server
adb devices
```

### Missing Dependencies

Run:

```bash
npm install
```

### Gradle Build Failure

Stop Gradle and retry:

```bash
cd android
./gradlew --stop
cd ..

npx expo run:android
```

Use a clean build only when necessary:

```bash
cd android
./gradlew clean
cd ..

npx expo run:android
```

Do not run `npm audit fix --force` without discussing it with the team because it may install incompatible dependencies.

# Contribute

## 1. Update the Main Branch

Before starting a task:

```bash
git checkout main
git pull origin main
```

## 2. Create a New Branch

Create a separate branch for each task:

```bash
git checkout -b your-name/task-name
```

Use a clear branch name that identifies the owner and the task.

## 3. Check Your Changes

```bash
git status
git diff
```

Make sure only the intended files are changed.

## 4. Commit Your Changes

Add the required files:

```bash
git add .
```

Create a clear commit:

```bash
git commit -m "Add login screen"
```

Use a short commit message that describes the completed change.

## 5. Push the Branch

For the first push:

```bash
git push -u origin your-name/task-name
```

For later updates on the same branch:

```bash
git push
```

## 6. Open a Pull Request

In Azure DevOps:

- Open **Repos → Pull Requests**.
- Create the Pull Request from the task branch into `main`.
- Add a clear title and description.
- Add the required reviewers.
- Link the related work item.
- Include the testing performed.
- Wait for approval before merging.

Any new commits pushed to the same branch are automatically added to the existing Pull Request.

Do not create another Pull Request for every update.
