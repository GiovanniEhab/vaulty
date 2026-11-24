package com.vaulty.app

import android.content.Context
import android.webkit.WebView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

private const val PREFS_NAME = "vaulty_ledger"
const val STORAGE_KEY = "vaulty_state_v1"
const val BACKUP_KEY = "vaulty_state_backup_v1"
const val PRE_UPDATE_BACKUP_KEY = "vaulty_state_pre_update_v1"

/**
 * Offline-first native store. The state is mirrored to a primary and backup key,
 * and a pre-update snapshot is written before an APK install.
 */
class VaultRepository(private val context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    suspend fun load(): VaultState = withContext(Dispatchers.IO) {
        readLocal() ?: run {
            val initial = migrateWebViewLocalStorage() ?: sampleState()
            save(initial)
            initial
        }
    }

    private fun readLocal(): VaultState? =
        parseVaultState(prefs.getString(STORAGE_KEY, null), sampleState())
            ?: parseVaultState(prefs.getString(BACKUP_KEY, null), sampleState())
            ?: parseVaultState(prefs.getString(PRE_UPDATE_BACKUP_KEY, null), sampleState())

    fun save(state: VaultState) {
        val serialized = state.toJsonString()
        prefs.edit()
            .putString(STORAGE_KEY, serialized)
            .putString(BACKUP_KEY, serialized)
            .apply()
    }

    /** Called immediately before handing an APK to the installer. */
    fun savePreUpdateSnapshot(state: VaultState) {
        prefs.edit().putString(PRE_UPDATE_BACKUP_KEY, state.toJsonString()).apply()
    }

    fun parseBackup(json: String?): VaultState? = parseVaultState(json, sampleState())

    /**
     * One-time migration from the Capacitor/WebView app. The WebView is never used
     * for UI here; it is only read for the legacy `https://localhost/` origin.
     */
    private suspend fun migrateWebViewLocalStorage(): VaultState? = withContext(Dispatchers.Main) {
        val webView = WebView(context)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        try {
            webView.loadDataWithBaseURL(
                "https://localhost/",
                "<!doctype html><html><body></body></html>",
                "text/html",
                "UTF-8",
                null,
            )
            val script = """
                (function () {
                  return {
                    primary: localStorage.getItem('$STORAGE_KEY'),
                    backup: localStorage.getItem('$BACKUP_KEY'),
                    preUpdate: localStorage.getItem('$PRE_UPDATE_BACKUP_KEY')
                  };
                })()
            """.trimIndent()
            val result = webView.evaluateJavascriptSuspend(script)
            val envelope = org.json.JSONObject(result)
            val fallback = sampleState()
            fun legacy(key: String): String? =
                if (envelope.isNull(key)) null else envelope.getString(key)
            parseVaultState(legacy("primary"), fallback)
                ?: parseVaultState(legacy("backup"), fallback)
                ?: parseVaultState(legacy("preUpdate"), fallback)
        } catch (_: Exception) {
            null
        } finally {
            webView.destroy()
        }
    }
}

private suspend fun WebView.evaluateJavascriptSuspend(script: String): String =
    suspendCancellableCoroutine { continuation ->
        evaluateJavascript(script) { value -> continuation.resume(value ?: "{}") }
        continuation.invokeOnCancellation { }
    }
