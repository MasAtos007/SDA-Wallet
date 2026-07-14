package com.sidrachain.wallet.bridge;

import android.content.Context;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.sidrachain.wallet.MainActivity;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class AndroidBridge {

    protected final Context context;
    protected WebView walletWebView;
    protected WebView browserWebView;
    protected com.sidrachain.wallet.MainActivity mainActivity;
    protected final Handler mainHandler = new Handler(Looper.getMainLooper());

    public AndroidBridge(Context context, WebView walletWebView) {
        this.context       = context;
        this.walletWebView = walletWebView;
    }

    public void setWalletWebView(WebView v)     { this.walletWebView = v; }
    public void setBrowserWebView(WebView v)    { this.browserWebView = v; }
    public void setMainActivity(com.sidrachain.wallet.MainActivity a) { this.mainActivity = a; }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DIPANGGIL DARI dApp WebView
    // Override di BrowserActivity
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public void handleRequest(String requestId, String method,
                               String paramsJson, String origin) {
        final String safeId     = sanitizeId(requestId);
        final String safeMethod = sanitizeId(method);
        final String safeOrigin = sanitizeId(origin);

        // FIX: escape untuk JSON.parse â€” JANGAN sanitize JSON mentah!
        final String escapedParams = (paramsJson != null ? paramsJson : "[]")
            .replace("\\", "\\\\")
            .replace("'", "\\'");

        mainHandler.post(() -> {
            if (walletWebView == null) {
                sendErrorToApp(safeId, -32603, "Wallet tidak tersedia");
                return;
            }
            String js =
                "(function(){" +
                "  var p;" +
                "  try{ p=JSON.parse('" + escapedParams + "'); }" +
                "  catch(e){ p=[]; }" +
                "  if(typeof window._androidBridgeRequest==='function'){" +
                "    window._androidBridgeRequest('" + safeId + "','" +
                    safeMethod + "',p,'" + safeOrigin + "');" +
                "  } else {" +
                "    window.AndroidWallet&&window.AndroidWallet.sendResponse(" +
                "      '" + safeId + "','null'," +
                "      JSON.stringify({code:-32603,message:'Provider belum siap'}));" +
                "  }" +
                "})();";
            walletWebView.evaluateJavascript(js, null);
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DIPANGGIL DARI Wallet WebView (android-provider.js)
    // Kirim response balik ke dApp via broadcast
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public void sendResponse(String requestId,
                              String resultJson,
                              String errorJson) {
        final String safeId = sanitizeId(requestId);
        // FIX: result & error adalah JSON â€” jangan disanitize!
        final String result = resultJson != null ? resultJson : "null";
        final String error  = errorJson  != null ? errorJson  : "null";

        final boolean hasError  = !error.equals("null");
        final boolean hasResult = !result.equals("null");
        // Guard: jangan kirim kalau dua-duanya null
        if (!hasError && !hasResult) return;

        mainHandler.post(() -> {
            // Broadcast ke BrowserActivity
            if (context != null) {
                Intent intent = new Intent(MainActivity.ACTION_BRIDGE_RESPONSE);
                intent.putExtra("requestId", safeId);
                intent.putExtra("result",    result);
                intent.putExtra("error",     error);
                LocalBroadcastManager.getInstance(context)
                    .sendBroadcast(intent);
            }

            // Shortcut langsung kalau browserWebView tersedia
            if (browserWebView != null) {
                String js = hasError
                    ? "window.__sidraAndroidResponse&&" +
                      "window.__sidraAndroidResponse('" + safeId + "',null," + error + ");"
                    : "window.__sidraAndroidResponse&&" +
                      "window.__sidraAndroidResponse('" + safeId + "'," + result + ",null);";
                browserWebView.evaluateJavascript(js, null);
            }
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BROADCAST EVENT ke dApp
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public void broadcastEvent(String eventName, String dataJson) {
        final String safeEvent = sanitizeId(eventName);
        final String safeData  = dataJson != null ? dataJson : "null";

        mainHandler.post(() -> {
            if (context != null) {
                Intent intent = new Intent(MainActivity.ACTION_BRIDGE_RESPONSE);
                intent.putExtra("isEvent",   true);
                intent.putExtra("eventName", safeEvent);
                intent.putExtra("eventData", safeData);
                LocalBroadcastManager.getInstance(context).sendBroadcast(intent);
            }

            if (browserWebView != null) {
                String js =
                    "window.__sidraAndroidEvent&&" +
                    "window.__sidraAndroidEvent('" + safeEvent + "'," + safeData + ");";
                browserWebView.evaluateJavascript(js, null);
            }
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BUKA BROWSER dari wallet
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public void openBrowser(String url) {
        final String safeUrl = url != null ? url : "https://www.sidrachain.com";
        mainHandler.post(() -> {
            Intent intent = new Intent(context,
                com.sidrachain.wallet.browser.BrowserActivity.class);
            intent.putExtra("url", safeUrl);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        openBrowser(url);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // VERSI APP & PRIVACY POLICY
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public String getAppVersion() {
        try {
            PackageInfo pInfo = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0);
            return pInfo.versionName != null ? pInfo.versionName : "1.0.0";
        } catch (PackageManager.NameNotFoundException e) {
            return "1.0.0";
        }
    }

    @JavascriptInterface
    public void openPrivacyPolicy() {
        mainHandler.post(() -> {
            Intent intent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://masatos007.github.io/sidrawallet-privacy/"));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BACA FILE ASSET
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    @JavascriptInterface
    public String readAsset(String path) {
        try {
            InputStream is = context.getAssets().open(path);
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

@JavascriptInterface
public String getClipboardText() {

    try {

        ClipboardManager clipboard =
            (ClipboardManager) context.getSystemService(
                Context.CLIPBOARD_SERVICE
            );

        if (clipboard != null &&
            clipboard.hasPrimaryClip()) {

            ClipData clip =
                clipboard.getPrimaryClip();

            if (clip != null &&
                clip.getItemCount() > 0) {

                CharSequence text =
                    clip.getItemAt(0)
                        .coerceToText(context);

                return text != null
                    ? text.toString()
                    : "";
            }
        }

    } catch (Exception e) {
        e.printStackTrace();
    }

    return "";
}

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HELPER
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private void sendErrorToApp(String id, int code, String message) {
        try {
            JSONObject err = new JSONObject();
            err.put("code", code);
            err.put("message", message);
            if (context != null) {
                Intent intent = new Intent(MainActivity.ACTION_BRIDGE_RESPONSE);
                intent.putExtra("requestId", id);
                intent.putExtra("error", err.toString());
                LocalBroadcastManager.getInstance(context).sendBroadcast(intent);
            }
        } catch (JSONException e) { /* ignore */ }
    }

    // Hanya untuk ID / method / origin â€” BUKAN untuk JSON
    protected String sanitizeId(String input) {
        if (input == null) return "";
        String s = input.replaceAll("['\"\\\\\\n\\r\\t]", "");
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    // Legacy alias agar tidak break subclass lama
    protected String sanitize(String input) {
        return sanitizeId(input);
    }
}
