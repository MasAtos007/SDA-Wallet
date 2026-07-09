package com.sidrachain.wallet.browser;

import android.content.Context;
import android.webkit.*;
import com.sidrachain.wallet.bridge.AndroidBridge;

public class WebViewManager {

    private final Context context;
    private final WebView webView;
    private AndroidBridge bridge;

    public WebViewManager(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Setup untuk WALLET (file:///android_asset)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    public void setupWalletWebView() {

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(false);

        // Bridge: JS panggil window.AndroidWallet.*
        bridge = new AndroidBridge(context, webView);
        webView.addJavascriptInterface(bridge, "AndroidWallet");

        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                // Tandai platform Android
                view.evaluateJavascript(
                    "window.__SIDRA_ANDROID__=true;" +
                    "window.__SIDRA_PLATFORM__='android';",
                    null
                );

                // FIX: Inject _androidBridgeRequest langsung dari Java
                // agar tidak bergantung pada timing load android-provider.js
                // Ini juga sebagai fallback kalau android-provider.js gagal load
                view.evaluateJavascript(
                    "(function(){" +
                    "  if(window._androidBridgeRequest) return;" + // sudah ada dari android-provider.js
                    "  window._androidBridgeRequest = async function(requestId, method, params, origin){" +
                    "    var provider = window._sidraProvider;" +
                    "    if(!provider){" +
                    "      window.AndroidWallet.sendResponse(requestId,'null'," +
                    "        JSON.stringify({code:-32603,message:'_sidraProvider tidak tersedia'}));" +
                    "      return;" +
                    "    }" +
                    "    try{" +
                    "      var result = await provider.request({method:method, params:params||[]});" +
                    "      window.AndroidWallet.sendResponse(requestId, JSON.stringify(result), 'null');" +
                    "    } catch(err){" +
                    "      window.AndroidWallet.sendResponse(requestId,'null'," +
                    "        JSON.stringify({code:err.code||-32603, message:err.message||'Error'}));" +
                    "    }" +
                    "  };" +
                    "  console.log('[SidraWallet] _androidBridgeRequest injected via Java');" +
                    "})();",
                    null
                );
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error) {
                super.onReceivedError(view, request, error);
                android.util.Log.e("SIDRA_WEBVIEW", "Load Error: " + error.getDescription());
            }
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Setup untuk BROWSER (dApp eksternal)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    public void setupBrowserWebView(ProviderInjector injector) {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injector.inject(view, url);
                injector.onUrlChanged(url);
                view.evaluateJavascript(
                    "window.__SIDRA_ANDROID__=true;" +
                    "window.__SIDRA_PLATFORM__='android';", null
                );
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (!url.startsWith("https://") && !url.startsWith("http://")) {
                    return true;
                }
                return false;
            }
        });
    }

    public WebView getWebView() { return webView; }
    public AndroidBridge getBridge() { return bridge; }
}
