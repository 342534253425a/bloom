package online.bloomlove.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * "Update Bloom" on Android, like Telegram outside the Play Store: one tap downloads the new APK inside the app
 * (with progress), then Android asks "Update?" and offers "Open". The downloaded file is deleted on the next start.
 */
@CapacitorPlugin(name = "BloomUpdate")
public class UpdatePlugin extends Plugin {
    private File folder() {
        return new File(getContext().getCacheDir(), "updates");
    }

    @Override
    public void load() {
        // The previous update is installed by now: remove its installer file.
        File[] old = folder().listFiles();
        if (old != null) for (File file : old) file.delete();
    }

    @PluginMethod
    public void install(PluginCall call) {
        // Once per phone Android asks to allow installing apps from Bloom; after that the update simply continues.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, allow, "afterAllow");
            return;
        }
        download(call);
    }

    @ActivityCallback
    private void afterAllow(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("not allowed", "permission");
            return;
        }
        download(call);
    }

    private void download(PluginCall call) {
        String address = call.getString("url");
        if (address == null) {
            call.reject("no url");
            return;
        }
        new Thread(() -> {
            File dir = folder();
            dir.mkdirs();
            File apk = new File(dir, "Bloom.apk");
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                long total = connection.getContentLengthLong();
                try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[64 * 1024];
                    long done = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        done += read;
                        int percent = total > 0 ? (int) (done * 100 / total) : 0;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            notifyListeners("progress", progress);
                        }
                    }
                } finally {
                    connection.disconnect();
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent open = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(open);
                call.resolve();
            } catch (Exception error) {
                apk.delete();
                call.reject(String.valueOf(error.getMessage()), "download");
            }
        }).start();
    }
}
