# Android development workflow

<!-- Shared core: keep this section identical across Android repositories; project-specific instructions follow. -->
## Shared Windows workflow

Use the existing shared JDK 17, Android SDK (platform-tools/ADB, command-line tools, platforms and Build Tools required by the project), and each project's Gradle wrapper or export tool. Do not upgrade dependencies or change signing incidentally. Node.js/npx runs the user-level Mobile MCP pinned to `@mobilenext/mobile-mcp@1.0.15`; scrcpy is the optional live viewing and manual-control tool. No Windows emulator is required for routine development. Versions and paths may differ on another machine; inspect `java -version`, `adb version`, and project build files.

1. Connect the phone by USB, enable USB debugging and approve its authorization prompt. In PowerShell run `adb devices -l`; `device` means online, while `unauthorized` requires approval on the phone. Select a device explicitly with `adb -s <device-id>` when necessary. Never publish device IDs.
2. Follow the project-specific build instructions below. Install with `adb -s <device-id> install -r <path-to-debug.apk>`; confirm any phone-side install prompt. Resolve the application ID and launch activity from the project configuration, then use `adb -s <device-id> shell am start -n <package>/<activity>` or the Mobile MCP launch tool. Preserve the existing signing identity and app data.
3. In a new Codex session ask Mobile MCP to list devices, then launch, inspect, click, batch operations or capture a screenshot. Prefer element references when available and coordinates plus screenshots for canvas content. The user-level `mobile-mcp` configuration is shared; do not duplicate it in each repository. An existing Codex session does not automatically reload changed MCP configuration.
4. For the previously tested low-latency scrcpy profile, set `SCRCPY_EXE` to the existing executable in your shell and run:

   ```powershell
   & $env:SCRCPY_EXE --select-usb --no-audio --max-size=1024 --max-fps=30 --video-bit-rate=4M
   ```

   Audio remains on the phone. Use the installed scrcpy version's help if options change. Capture device evidence with `cmd /c "adb -s DEVICE_ID exec-out screencap -p > screen.png"` (replace `DEVICE_ID`; cmd redirection preserves the binary bytes). Inspect logs with `adb -s <device-id> logcat -d -s AndroidRuntime` and project-specific tags; do not publish sensitive logs.
5. Daily tests use the physical device and cover the behavior changed. Run existing cloud emulator workflows only when the task requires their specific gates; preserve past failure evidence and report device, build, test coverage and unverified cases separately. Physical-device checks do not replace release gates.

## Troubleshooting and boundaries

- If Mobile MCP tools are missing, check `codex mcp list` and `codex mcp get mobile-mcp`, open a new Codex session, and retry. Discovery has been intermittent; a configured server does not by itself prove the tool is exposed. Restart Codex Desktop if its configuration is stale.
- If ADB cannot bind port 5037, inspect its owner before changing anything. ADB normally uses port 5037. A temporary collision with another process was observed on this machine; wait for the port to become free and retry. Use one ADB server for all clients; stop only a confirmed conflicting ADB server before restarting it. Do not terminate unrelated applications. Recheck USB cable, phone authorization and `adb devices -l`; avoid multiple ADB servers competing for one device.
- Only one UiAutomation backend should own the device at a time. Stop the identified prior tool's helper before switching to Mobile MCP; do not stop unrelated processes. The Android accessibility tree may not expose game canvas controls.
- On build failure inspect the project's JDK/SDK requirements, wrapper and error output before changing versions. Do not clear shared caches blindly.
- Never clear app data, unlock the bootloader, root, flash, modify signing keys, or delete uncertain files without explicit authorization. Keep credentials and local machine paths out of Git.

<!-- End shared core -->
## This project

For an authorized Android build, use `./android/gradlew.bat -p android assembleDebug --no-daemon`. Synchronize generated Web assets only when their authoritative sources change; see root `AGENTS.md`.
