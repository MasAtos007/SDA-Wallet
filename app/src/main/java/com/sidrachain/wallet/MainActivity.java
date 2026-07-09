package com.sidrachain.wallet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.sidrachain.wallet.bridge.AndroidBridge;
import com.sidrachain.wallet.browser.BrowserActivity;
import com.sidrachain.wallet.browser.WebViewManager;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private WebViewManager webViewManager;

    public static WebView walletWebView;
    public static AndroidBridge walletBridge;

    public static final String ACTION_BRIDGE_REQUEST  = "com.sidrachain.wallet.BRIDGE_REQUEST";
    public static final String ACTION_BRIDGE_RESPONSE = "com.sidrachain.wallet.BRIDGE_RESPONSE";

    // Receiver: terima request dari BrowserActivity â†’ forward ke wallet WebView
    private final BroadcastReceiver bridgeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!ACTION_BRIDGE_REQUEST.equals(intent.getAction())) return;

            String requestId = intent.getStringExtra("requestId");
            String method    = intent.getStringExtra("method");
            String params    = intent.getStringExtra("params");
            String origin    = intent.getStringExtra("origin");

            if (webView == null) {
                Intent resp = new Intent(ACTION_BRIDGE_RESPONSE);
                resp.putExtra("requestId", requestId);
                resp.putExtra("error",
                    "{\"code\":-32603,\"message\":\"Wallet tidak tersedia\"}");
                LocalBroadcastManager.getInstance(MainActivity.this)
                    .sendBroadcast(resp);
                return;
            }

            final String safeId     = sanitizeId(requestId);
            final String safeMethod = sanitizeId(method);
            final String safeOrigin = sanitizeId(origin);

            final String safeParams = (params != null ? params : "[]")
                .replace("\\", "\\\\")
                .replace("'", "\\'");

            runOnUiThread(() -> {
                String js =
                    "(function(){" +
                    "  var p;" +
                    "  try{ p=JSON.parse('" + safeParams + "'); }" +
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
                webView.evaluateJavascript(js, null);
            });
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.walletWebView);
        walletWebView = webView;

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webViewManager = new WebViewManager(this, webView);
        webViewManager.setupWalletWebView();

        walletBridge = webViewManager.getBridge();
        walletBridge.setWalletWebView(walletWebView);
        walletBridge.setMainActivity(this);

        BrowserActivity.sharedBridge = walletBridge;

        LocalBroadcastManager.getInstance(this).registerReceiver(
            bridgeReceiver,
            new IntentFilter(ACTION_BRIDGE_REQUEST)
        );

        webView.loadUrl("file:///android_asset/index.html");
    }

    public void sendResponseToBrowser(String requestId,
                                       String resultJson,
                                       String errorJson) {
        Intent intent = new Intent(ACTION_BRIDGE_RESPONSE);
        intent.putExtra("requestId", requestId);
        intent.putExtra("result",    resultJson);
        intent.putExtra("error",     errorJson);
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
    }

    public void sendEventToBrowser(String eventName, String dataJson) {
        Intent intent = new Intent(ACTION_BRIDGE_RESPONSE);
        intent.putExtra("isEvent",   true);
        intent.putExtra("eventName", eventName);
        intent.putExtra("eventData", dataJson);
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
    }

    private String sanitizeId(String input) {
        if (input == null) return "";
        String s = input.replaceAll("['\"\\\\\\n\\r\\t]", "");
        return s.length() > 500 ? s.substring(0, 500) : s;
    }

    @Override
    public void onBackPressed() {
        // Tanya JS dulu: ada modal/screen yang bisa ditutup?
        // JS akan return true jika sudah handle, false jika tidak
        if (webView != null) {
            webView.evaluateJavascript(
                "(typeof window._handleAndroidBack === 'function') ? window._handleAndroidBack() : false",
                result -> {
                    if (!"true".equals(result)) {
                        // Tidak ada modal terbuka â€” minimize app (bukan exit)
                        runOnUiThread(() -> moveTaskToBack(true));
                    }
                }
            );
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        LocalBroadcastManager.getInstance(this)
            .unregisterReceiver(bridgeReceiver);
        walletWebView = null;
        walletBridge  = null;
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}