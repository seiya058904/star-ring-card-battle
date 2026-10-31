# Android development workflow

<!-- Shared core: keep this section identical across Android repositories; project-specific instructions follow. -->
## Shared Windows workflow

Use the existing Android SDK and each project's required JDK, Gradle wrapper or export tool; inspect the actual toolchain and project configuration. Preserve locked versions and signing; do not install an emulator or upgrade dependencies as routine setup. The configured user-level Mobile MCP is shared, not copied into repositories. scrcpy is optional for live viewing and manual control.

1. For Android device work, use the connected physical test phone first. List devices with Mobile MCP and select the intended local device explicitly; if needed use `adb devices -l` and `adb -s <device-id>`. Approve USB debugging on the phone. Do not publish device identifiers. If no usable device or tool is available, report the specific blocker and mark device checks NOT RUN; do not claim a pass.
2. Follow the project's build and authorization rules. Before installing an APK over an existing app, verify package identity and signing compatibility, preserve app data, and use the authorized build. Never uninstall, clear data or change signing to bypass an install failure. The user handles phone-side permission prompts.
3. Prefer Mobile MCP for device interaction: inspect the accessibility hierarchy and use element references; use screenshots and coordinates for canvas or visual checks. ADB supports device selection, installation and targeted diagnostics; scrcpy is optional. Avoid reading private content, credentials or unnecessary logs. Test the changed flow and report the device class, build identity, steps, results and untested coverage.
4. Local physical-device testing complements, but does not replace, project-required CI, cloud emulator or release gates. Run those only when relevant and authorized. Remote cloud devices are a separate, potentially billed service: do not allocate without explicit user approval. Never substitute browser emulation or a desktop test for Android-device acceptance.

Optional scrcpy profile (set `SCRCPY_EXE` to the existing executable; check its help if flags differ):

```powershell
& $env:SCRCPY_EXE --select-usb --no-audio --max-size=1024 --max-fps=30 --video-bit-rate=4M
```

For targeted Android crash diagnostics, use `adb -s <device-id> logcat -d -s AndroidRuntime`; review and redact sensitive output before retaining or sharing it. Store evidence according to the project rules.

## Troubleshooting and boundaries

- When Mobile MCP tools are missing, inspect the existing configuration and session; refresh or restart only as needed. A configured server does not prove device availability. Use one UiAutomation backend at a time, and do not stop unrelated processes.
- If ADB is unavailable, inspect the error, USB authorization and port 5037 owner before acting; do not kill unrelated processes or start competing servers. Keep device identifiers and sensitive logs private.
- Never clear app data, uninstall apps, root, flash, change signing keys or delete uncertain files without explicit authorization. Do not replace evidence or relax project-specific gates to force a pass.

<!-- End shared core -->
## This project

For an authorized Android build, use `./android/gradlew.bat -p android assembleDebug --no-daemon`. Synchronize generated Web assets only when their authoritative sources change; see root `AGENTS.md`.
