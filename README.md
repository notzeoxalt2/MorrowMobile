<p align="center"><img src="assets/morrow-wordmark.png" alt="Morrow" width="360"></p>

# Morrow Mobile

Morrow is a media player with source repositories, subtitles, quality selection, watch progress, and Morrow branding.

## Downloads

Use [Morrow releases](https://github.com/notzeoxalt2/MorrowMobile/releases) for published builds.

## Providers

Open **Settings → Providers → Install Morrow Providers** to install **Morrow Anime X1** and **Morrow Movies & TV**. Anime X2 is consolidated into X1. Provider availability is tested separately from application builds.

## Build

Requires a compatible JDK and Android SDK. Configure `sdk.dir` in your local `local.properties`, then run:

```powershell
.\gradlew.bat :androidApp:assembleFullDebug
```

## License and acknowledgments

Morrow is derived from the Nuvio open-source codebase. Original copyright and license notices remain in the source and [LICENSE](LICENSE). Morrow branding does not change those notices.
