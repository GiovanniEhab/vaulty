package com.vaulty.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app updates for the APK: reads the latest release manifest, downloads the APK with a
 * checksum check, and hands it to Android's package installer.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String TAG = "AppUpdater";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("version", versionName());
        info.put("versionCode", versionCode());
        info.put("installAllowed", canInstallPackages());
        call.resolve(info);
    }

    @PluginMethod
    public void check(PluginCall call) {
        final String manifestUrl = call.getString("manifestUrl");
        if (manifestUrl == null || manifestUrl.isEmpty()) {
            call.reject("manifestUrl is required");
            return;
        }
        executor.execute(() -> {
            try {
                JSObject manifest = parseManifest(new JSONObject(fetchText(manifestUrl)));
                int currentCode = versionCode();
                int latestCode = manifest.optInt("versionCode", 0);
                boolean newer = latestCode > 0
                        ? latestCode > currentCode
                        : !manifest.optString("version", "").equals(versionName());
                manifest.put("currentVersion", versionName());
                manifest.put("currentVersionCode", currentCode);
                manifest.put("updateAvailable", newer);
                manifest.put("installAllowed", canInstallPackages());
                call.resolve(manifest);
            } catch (Exception error) {
                Log.w(TAG, "update check failed", error);
                call.reject("Could not check for updates: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        final String expectedSha = call.getString("sha256", "");
        final String version = call.getString("version", "update");
        executor.execute(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Could not create the download folder.");
                    return;
                }
                String safeVersion = version.replaceAll("[^0-9A-Za-z._-]", "_");
                File target = new File(dir, "vaulty-" + safeVersion + ".apk");
                String actualSha = downloadToFile(url, target);
                if (expectedSha != null && !expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(actualSha)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("The downloaded file did not match its checksum.");
                    return;
                }
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                result.put("sha256", actualSha);
                call.resolve(result);
            } catch (Exception error) {
                Log.w(TAG, "download failed", error);
                call.reject("Download failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }
        if (!canInstallPackages()) {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Allow Vaulty to install unknown apps, then tap Install again.");
            return;
        }
        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("The downloaded update is missing. Download it again.");
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            Log.w(TAG, "install failed", error);
            call.reject("Could not start the installer: " + error.getMessage());
        }
    }

    private JSObject parseManifest(JSONObject json) throws Exception {
        JSObject out = new JSObject();
        if (json.has("assets")) {
            out.put("version", json.optString("tag_name", "").replaceFirst("^[vV]", ""));
            out.put("notes", json.optString("body", ""));
            out.put("versionCode", 0);
            JSONArray assets = json.optJSONArray("assets");
            if (assets != null) {
                for (int index = 0; index < assets.length(); index++) {
                    JSONObject asset = assets.getJSONObject(index);
                    String name = asset.optString("name", "");
                    if (!name.endsWith(".apk")) continue;
                    out.put("url", asset.optString("browser_download_url", ""));
                    out.put("size", asset.optLong("size", 0));
                    String digest = asset.optString("digest", "");
                    if (digest.startsWith("sha256:")) {
                        out.put("sha256", digest.substring("sha256:".length()));
                    }
                    break;
                }
            }
            if (out.optString("url", "").isEmpty()) {
                throw new IllegalStateException("the latest release has no APK attached");
            }
            return out;
        }

        out.put("version", json.optString("version", ""));
        out.put("versionCode", json.optInt("versionCode", 0));
        out.put("url", json.optString("url", ""));
        out.put("sha256", json.optString("sha256", ""));
        out.put("notes", json.optString("notes", ""));
        out.put("size", json.optLong("size", 0));
        if (out.optString("url", "").isEmpty()) {
            throw new IllegalStateException("the manifest has no download URL");
        }
        return out;
    }

    private String fetchText(String urlString) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "Vaulty-Android");
        try {
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                return out.toString("UTF-8");
            }
        } finally {
            connection.disconnect();
        }
    }

    private String downloadToFile(String urlString, File target) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "Vaulty-Android");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try {
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
            long total = connection.getContentLength();
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[16384];
                long written = 0;
                int read;
                int lastPercent = -1;
                while ((read = input.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    written += read;
                    if (total > 0) {
                        int percent = (int) ((written * 100) / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private int versionCode() {
        try {
            Context context = getContext();
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) info.getLongVersionCode();
            }
            //noinspection deprecation
            return info.versionCode;
        } catch (Exception error) {
            Log.w(TAG, "versionCode lookup failed", error);
            return 0;
        }
    }

    private String versionName() {
        try {
            Context context = getContext();
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return info.versionName == null ? "0" : info.versionName;
        } catch (Exception error) {
            Log.w(TAG, "versionName lookup failed", error);
            return "0";
        }
    }
}
