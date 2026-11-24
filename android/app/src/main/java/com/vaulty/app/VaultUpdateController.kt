package com.vaulty.app

import android.content.Context
import kotlinx.coroutines.flow.StateFlow
import java.io.File

private const val UPDATE_PREFS = "vaulty_updates"
private const val LAST_CHECK_KEY = "vaulty_update_checked_at"
private const val CHECK_INTERVAL_MS = 6L * 60 * 60 * 1000

/** Compose-facing wrapper for the hardened APK updater. */
class VaultUpdateController(
    context: Context,
    private val repository: VaultRepository,
    private val store: VaultStore,
) {
    private val updater = VaultUpdater(context)
    private val prefs = context.applicationContext.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)

    val state: StateFlow<UpdateState> = updater.state

    private var downloadedFile: File? = null
    private var downloadedVersion: String? = null

    suspend fun autoCheck() {
        val last = prefs.getLong(LAST_CHECK_KEY, 0L)
        if (last > 0L && System.currentTimeMillis() - last < CHECK_INTERVAL_MS) return
        val result = updater.checkForUpdate()
        if (result !is UpdateCheckResult.Error) {
            prefs.edit().putLong(LAST_CHECK_KEY, System.currentTimeMillis()).apply()
        }
        val version = (result as? UpdateCheckResult.Available)?.info?.version
        if (downloadedVersion != version) {
            downloadedFile = null
            downloadedVersion = null
        }
        if (store.state.value.autoUpdate && result is UpdateCheckResult.Available) {
            downloadAndInstall()
        }
    }

    suspend fun checkNow() {
        val result = updater.checkForUpdate()
        if (result !is UpdateCheckResult.Error) {
            prefs.edit().putLong(LAST_CHECK_KEY, System.currentTimeMillis()).apply()
        }
        val version = (result as? UpdateCheckResult.Available)?.info?.version
        if (downloadedVersion != version) {
            downloadedFile = null
            downloadedVersion = null
        }
    }

    suspend fun downloadAndInstall() {
        val info = state.value.info ?: return
        if (downloadedFile != null && downloadedVersion == info.version) {
            installCached()
            return
        }
        repository.savePreUpdateSnapshot(store.state.value)
        try {
            val file = updater.download(info) { }
            downloadedFile = file
            downloadedVersion = info.version
            installCached()
        } catch (error: InstallPermissionRequiredException) {
            showNativeToast(error.message ?: "Allow Vaulty to install unknown apps, then tap Install again.")
        } catch (error: Exception) {
            showNativeToast(error.message ?: "Could not download the update.")
        }
    }

    private fun installCached() {
        val file = downloadedFile ?: return
        try {
            repository.savePreUpdateSnapshot(store.state.value)
            updater.install(file)
        } catch (error: InstallPermissionRequiredException) {
            showNativeToast(error.message ?: "Allow Vaulty to install unknown apps, then tap Install again.")
        } catch (error: Exception) {
            showNativeToast(error.message ?: "Could not start the installer.")
        }
    }
}
