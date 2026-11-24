package com.vaulty.app

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

private const val USER_AGENT = "Vaulty-Android"
private const val ACCEPT_JSON = "application/json, application/vnd.github+json"
private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
private const val UPDATES_DIR = "updates"
private const val CONNECT_TIMEOUT_MS = 15_000
private const val READ_TIMEOUT_MS = 30_000
private const val MAX_REDIRECTS = 5
private const val MAX_MANIFEST_BYTES = 1_048_576L
private const val PROGRESS_BUFFER_BYTES = 16 * 1024
private val SHA256_PATTERN = Regex("^[a-fA-F0-9]{64}$")

/** Compose-facing status of the update flow. */
enum class UpdateStatus {
    IDLE,
    CHECKING,
    AVAILABLE,
    DOWNLOADING,
    READY,
    UP_TO_DATE,
    ERROR,
}

/** Everything the UI needs to render an update prompt. */
data class UpdateInfo(
    val version: String,
    val versionCode: Long,
    val url: String,
    val sha256: String,
    val notes: String,
    val size: Long,
    val currentVersion: String,
    val currentVersionCode: Long,
    val updateAvailable: Boolean,
    val installAllowed: Boolean,
)

/** Result of a manifest check; failures are data so they can be rendered directly. */
sealed class UpdateCheckResult {
    data class Available(val info: UpdateInfo) : UpdateCheckResult()
    data class UpToDate(val currentVersion: String, val currentVersionCode: Long) : UpdateCheckResult()
    data class Error(val message: String) : UpdateCheckResult()
}

/** Immutable snapshot for `collectAsState()` in Compose. */
data class UpdateState(
    val status: UpdateStatus = UpdateStatus.IDLE,
    val info: UpdateInfo? = null,
    val progress: Float = 0f,
    val message: String = "",
)

open class UpdateException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** Thrown after opening the system "install unknown apps" settings screen. */
class InstallPermissionRequiredException(message: String) : UpdateException(message)

private data class Manifest(
    val version: String,
    val versionCode: Long,
    val url: String,
    val sha256: String,
    val notes: String,
    val size: Long,
)

/**
 * Native in-app updater: checks the release manifest, downloads a checksum-verified APK into the
 * app cache, and hands it to Android's package installer.
 *
 * Checking never downloads anything; [download] must be called explicitly by the user-facing flow.
 */
class VaultUpdater(context: Context) {

    private val appContext: Context = context.applicationContext

    private val _state = MutableStateFlow(UpdateState())
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    companion object {
        /** Static release manifest served from raw.githubusercontent (no GitHub API quota). */
        const val FEED_URL = "https://raw.githubusercontent.com/GiovanniEhab/vaulty/main/update.json"

        /** Hard cap for a downloaded APK (100 MiB). */
        const val MAX_DOWNLOAD_BYTES = 104_857_600L
    }

    /** Fetch and validate the manifest. No download is started here. */
    suspend fun checkForUpdate(): UpdateCheckResult = withContext(Dispatchers.IO) {
        _state.value = UpdateState(status = UpdateStatus.CHECKING, message = "Checking for updates…")
        try {
            val connection = openConnection(FEED_URL, ACCEPT_JSON)
            val manifest = try {
                parseManifest(readText(connection))
            } finally {
                connection.disconnect()
            }

            if (!isValidSha256(manifest.sha256)) {
                throw UpdateException("The update feed has no valid SHA-256 checksum, so Vaulty will not install it.")
            }
            // Validate now as well as at download time so a bad feed never reaches the UI.
            val secureUrl = requireHttpsUrl(manifest.url).toString()
            if (manifest.size < 0 || manifest.size > MAX_DOWNLOAD_BYTES) {
                throw UpdateException("The published update size is invalid.")
            }

            val currentVersion = versionName()
            val currentVersionCode = versionCode()
            val newer = if (manifest.versionCode > 0L) {
                manifest.versionCode > currentVersionCode
            } else {
                manifest.version.isNotEmpty() && manifest.version != currentVersion
            }
            val installAllowed = canInstallPackages()
            val info = UpdateInfo(
                version = manifest.version,
                versionCode = manifest.versionCode,
                url = secureUrl,
                sha256 = manifest.sha256,
                notes = manifest.notes,
                size = manifest.size,
                currentVersion = currentVersion,
                currentVersionCode = currentVersionCode,
                updateAvailable = newer,
                installAllowed = installAllowed,
            )

            val result: UpdateCheckResult
            val status: UpdateStatus
            val message: String
            if (newer) {
                result = UpdateCheckResult.Available(info)
                status = UpdateStatus.AVAILABLE
                message = if (installAllowed) {
                    "Version ${info.version} is available. You have $currentVersion."
                } else {
                    "Version ${info.version} is available. Android must allow Vaulty to install unknown apps first."
                }
            } else {
                result = UpdateCheckResult.UpToDate(currentVersion, currentVersionCode)
                status = UpdateStatus.UP_TO_DATE
                message = "You are on the latest version ($currentVersion)."
            }
            _state.value = UpdateState(
                status = status,
                info = info.takeIf { newer },
                message = message,
            )
            result
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            val message = friendlyMessage(error)
            _state.value = UpdateState(status = UpdateStatus.ERROR, message = message)
            UpdateCheckResult.Error(message)
        }
    }

    /**
     * Download (or reuse an already verified cached copy of) the APK.
     *
     * [onProgress] receives 0f..1f and is invoked from the IO dispatcher; hop to Main before
     * touching UI state directly.
     */
    suspend fun download(info: UpdateInfo, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        if (!isValidSha256(info.sha256)) {
            throw UpdateException("The update feed has no valid SHA-256 checksum, so Vaulty will not install it.")
        }
        val secureUrl = requireHttpsUrl(info.url).toString()
        if (info.size < 0 || info.size > MAX_DOWNLOAD_BYTES) {
            throw UpdateException("The published update size is invalid.")
        }
        _state.value = _state.value.copy(
            status = UpdateStatus.DOWNLOADING,
            progress = 0f,
            message = "Downloading the update…",
        )

        val dir = File(appContext.cacheDir, UPDATES_DIR)
        if (!dir.exists() && !dir.mkdirs()) throw UpdateException("Could not create the download folder.")
        val safeVersion = info.version.replace(Regex("[^0-9A-Za-z._-]"), "_").ifEmpty { "update" }
        val target = File(dir, "vaulty-$safeVersion.apk")

        // Cache reuse: trust a cached file only if it still verifies against the published digest.
        if (target.exists()) {
            val cached = try {
                hashAndSize(target)
            } catch (error: Exception) {
                null
            }
            if (cached != null &&
                cached.second.equals(info.sha256, ignoreCase = true) &&
                (info.size <= 0 || info.size == cached.first)
            ) {
                onProgress(1f)
                _state.value = _state.value.copy(
                    status = UpdateStatus.READY,
                    progress = 1f,
                    message = "Update already downloaded. Confirm the install in Android.",
                )
                return@withContext target
            }
            target.delete()
        }

        var connection: HttpURLConnection? = null
        try {
            connection = openConnection(secureUrl)
            val active = checkNotNull(connection)
            val contentLength = active.contentLength
            if (contentLength > MAX_DOWNLOAD_BYTES) {
                throw UpdateException("The update is larger than the ${MAX_DOWNLOAD_BYTES / 1_048_576} MB limit.")
            }
            val total = when {
                contentLength > 0 -> contentLength.toLong()
                info.size > 0 -> info.size
                else -> -1L
            }

            val digest = MessageDigest.getInstance("SHA-256")
            var written = 0L
            var lastPercent = -1
            BufferedInputStream(active.inputStream).use { input ->
                FileOutputStream(target).use { output ->
                    val buffer = ByteArray(PROGRESS_BUFFER_BYTES)
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        if (written + read > MAX_DOWNLOAD_BYTES) {
                            throw UpdateException("The update is larger than the ${MAX_DOWNLOAD_BYTES / 1_048_576} MB limit.")
                        }
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        written += read.toLong()
                        if (total > 0) {
                            val percent = ((written * 100) / total).toInt().coerceIn(0, 100)
                            if (percent != lastPercent) {
                                lastPercent = percent
                                onProgress(percent / 100f)
                            }
                        }
                    }
                    output.flush()
                }
            }

            if (info.size > 0 && written != info.size) {
                throw UpdateException("The downloaded file size did not match the update feed.")
            }
            val actualSha256 = hex(digest.digest())
            if (!actualSha256.equals(info.sha256, ignoreCase = true)) {
                throw UpdateException("The downloaded update did not match its published checksum.")
            }

            onProgress(1f)
            _state.value = _state.value.copy(
                status = UpdateStatus.READY,
                progress = 1f,
                message = "Downloaded. Confirm the install in Android.",
            )
            target
        } catch (error: CancellationException) {
            target.delete()
            throw error
        } catch (error: Exception) {
            target.delete()
            _state.value = _state.value.copy(
                status = UpdateStatus.ERROR,
                progress = 0f,
                message = friendlyMessage(error),
            )
            throw error
        } finally {
            connection?.disconnect()
        }
    }

    /** Whether Android currently allows this app to install APKs. */
    fun canInstallPackages(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || appContext.packageManager.canRequestPackageInstalls()

    /** Send the user to Android's "install unknown apps" screen for this package. */
    fun openInstallPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:$packageName"),
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        appContext.startActivity(intent)
    }

    /**
     * Open the package installer for an APK returned by [download].
     *
     * Throws [InstallPermissionRequiredException] after opening permission settings, so the UI can
     * prompt the user to tap Install again once permission is granted.
     */
    fun install(file: File) {
        if (!file.exists() || !file.isFile) {
            throw UpdateException("The downloaded update is missing. Download it again.")
        }
        val updatesDir = File(appContext.cacheDir, UPDATES_DIR)
        val dirPath = updatesDir.canonicalPath + File.separator
        if (!file.canonicalPath.startsWith(dirPath) || !file.name.endsWith(".apk", ignoreCase = true)) {
            throw UpdateException("That file was not downloaded by Vaulty's updater.")
        }

        if (!canInstallPackages()) {
            openInstallPermissionSettings()
            val message = "Allow Vaulty to install unknown apps, then tap Install again."
            _state.value = _state.value.copy(status = UpdateStatus.ERROR, message = message)
            throw InstallPermissionRequiredException(message)
        }

        try {
            // Matches the provider authority declared in AndroidManifest.xml.
            val authority = "$packageName.fileprovider"
            val uri = FileProvider.getUriForFile(appContext, authority, file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            appContext.startActivity(intent)
            _state.value = _state.value.copy(
                status = UpdateStatus.READY,
                message = "Android installer opened. Confirm the update — your data stays in place.",
            )
        } catch (error: ActivityNotFoundException) {
            throw UpdateException("No app is available to install the update.", error)
        } catch (error: Exception) {
            throw UpdateException("Could not start the installer: ${error.message}", error)
        }
    }

    private val packageName: String get() = appContext.packageName

    @Suppress("DEPRECATION")
    private fun versionCode(): Long = try {
        val info = appContext.packageManager.getPackageInfo(packageName, 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
    } catch (error: Exception) {
        0L
    }

    private fun versionName(): String = try {
        appContext.packageManager.getPackageInfo(packageName, 0).versionName ?: "0"
    } catch (error: Exception) {
        "0"
    }

    /** Opens an HTTPS-only connection, following redirects manually so each hop is validated. */
    private fun openConnection(rawUrl: String, accept: String? = null): HttpURLConnection {
        var current = requireHttpsUrl(rawUrl)
        for (attempt in 0..MAX_REDIRECTS) {
            val connection = current.openConnection() as? HttpURLConnection
                ?: throw UpdateException("Unsupported update URL protocol.")
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.setRequestProperty("User-Agent", USER_AGENT)
            if (accept != null) connection.setRequestProperty("Accept", accept)

            val code = try {
                connection.responseCode
            } catch (error: Exception) {
                connection.disconnect()
                throw error
            }
            when (code) {
                in 200..299 -> return connection
                in 300..399 -> {
                    val location = connection.getHeaderField("Location")
                    connection.disconnect()
                    if (location.isNullOrBlank()) {
                        throw UpdateException("The update URL redirected without a destination.")
                    }
                    if (attempt == MAX_REDIRECTS) {
                        throw UpdateException("Too many redirects while fetching the update.")
                    }
                    current = requireHttpsUrl(URL(current, location.trim()).toString())
                }
                else -> {
                    connection.disconnect()
                    throw UpdateException("HTTP $code while fetching the update.")
                }
            }
        }
        throw UpdateException("Too many redirects while fetching the update.")
    }

    private fun requireHttpsUrl(raw: String): URL {
        val url = try {
            URL(raw.trim())
        } catch (error: Exception) {
            throw UpdateException("Invalid update URL.", error)
        }
        if (!url.protocol.equals("https", ignoreCase = true) || url.host.isNullOrEmpty()) {
            throw UpdateException("Only HTTPS update URLs are allowed.")
        }
        return url
    }

    private fun readText(connection: HttpURLConnection): String {
        if (connection.contentLength > MAX_MANIFEST_BYTES) {
            throw UpdateException("The update feed is too large.")
        }
        val out = ByteArrayOutputStream()
        BufferedInputStream(connection.inputStream).use { input ->
            val buffer = ByteArray(8 * 1024)
            var total = 0L
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                total += read
                if (total > MAX_MANIFEST_BYTES) throw UpdateException("The update feed is too large.")
                out.write(buffer, 0, read)
            }
        }
        return String(out.toByteArray(), Charsets.UTF_8)
    }

    /** Reads the static update.json shape, or a GitHub "latest release" payload. */
    private fun parseManifest(text: String): Manifest {
        val json = try {
            JSONObject(text)
        } catch (error: JSONException) {
            throw UpdateException("The update feed is not valid JSON.", error)
        }

        if (json.has("assets")) {
            val version = json.optString("tag_name", "").replaceFirst(Regex("^[vV]"), "")
            val notes = json.optString("body", "")
            val assets: JSONArray? = json.optJSONArray("assets")
            if (assets != null) {
                for (index in 0 until assets.length()) {
                    val asset = assets.getJSONObject(index)
                    if (!asset.optString("name", "").endsWith(".apk", ignoreCase = true)) continue
                    val digest = asset.optString("digest", "").trim()
                    val sha256 = if (digest.startsWith("sha256:", ignoreCase = true)) {
                        digest.substring("sha256:".length).trim()
                    } else {
                        ""
                    }
                    return Manifest(
                        version = version,
                        versionCode = 0L,
                        url = asset.optString("browser_download_url", "").trim(),
                        sha256 = sha256,
                        notes = notes,
                        size = asset.optLong("size", 0L),
                    )
                }
            }
            throw UpdateException("The latest release has no APK attached.")
        }

        return Manifest(
            version = json.optString("version", "").trim(),
            versionCode = json.optLong("versionCode", 0L),
            url = json.optString("url", "").trim(),
            sha256 = json.optString("sha256", "").trim(),
            notes = json.optString("notes", ""),
            size = json.optLong("size", 0L),
        )
    }

    private fun hashAndSize(file: File): Pair<Long, String> {
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        BufferedInputStream(file.inputStream()).use { input ->
            val buffer = ByteArray(PROGRESS_BUFFER_BYTES)
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                size += read
                if (size > MAX_DOWNLOAD_BYTES) throw UpdateException("The cached update is too large.")
                digest.update(buffer, 0, read)
            }
        }
        return size to hex(digest.digest())
    }

    private fun isValidSha256(value: String): Boolean = SHA256_PATTERN.matches(value.trim())

    private fun hex(bytes: ByteArray): String {
        val digits = "0123456789abcdef"
        val result = StringBuilder(bytes.size * 2)
        for (byte in bytes) {
            val value = byte.toInt() and 0xff
            result.append(digits[value ushr 4]).append(digits[value and 0x0f])
        }
        return result.toString()
    }

    private fun friendlyMessage(error: Exception): String =
        error.message?.takeIf { it.isNotBlank() } ?: "Something went wrong."
}
