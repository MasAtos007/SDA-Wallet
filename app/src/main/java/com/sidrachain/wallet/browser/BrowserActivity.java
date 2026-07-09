package com.sidrachain.wallet.browser;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.sidrachain.wallet.MainActivity;
import com.sidrachain.wallet.R;
import com.sidrachain.wallet.bridge.AndroidBridge;

public class BrowserActivity extends AppCompatActivity {

    private WebView browserWebView;
    private EditText urlBar;
    private ProgressBar progressBar;
    private ProviderInjector injector;

    public static AndroidBridge sharedBridge;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Inner class â€” WAJIB untuk @JavascriptInterface agar terexpose ke WebView
    // Anonymous subclass TIDAK bisa expose @JavascriptInterface yang di-override
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private class BrowserAndroidBridge extends AndroidBridge {

        BrowserAndroidBridge(Context ctx) {
            super(ctx, null);
        }

        // FIX: @JavascriptInterface HARUS ada di class konkret, bukan anonymous
        @Override
        @JavascriptInterface
        public void handleRequest(String requestId,
                                  String method,
                                  String paramsJson,
                                  String origin) {
            Intent intent = new Intent(MainActivity.ACTION_BRIDGE_REQUEST);
            intent.putExtra("requestId", requestId);
            intent.putExtra("method",    method);
            intent.putExtra("params",    paramsJson);
            intent.putExtra("origin",    origin);
            LocalBroadcastManager.getInstance(BrowserActivity.this)
                .sendBroadcast(intent);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Receiver: terima response dari MainActivity/Wallet
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    private final BroadcastReceiver responseReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!MainActivity.ACTION_BRIDGE_RESPONSE.equals(intent.getAction())) return;

            boolean isEvent = intent.getBooleanExtra("isEvent", false);
            if (isEvent) {
                String eventName = intent.getStringExtra("eventName");
                String eventData = intent.getStringExtra("eventData");
                _sendEventToPage(eventName, eventData);
                return;
            }

            String requestId  = intent.getStringExtra("requestId");
            String resultJson = intent.getStringExtra("result");
            String errorJson  = intent.getStringExtra("error");
            _sendResponseToPage(requestId, resultJson, errorJson);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_browser);

        browserWebView = findViewById(R.id.browserWebView);
        urlBar         = findViewById(R.id.urlBar);
        progressBar    = findViewById(R.id.progressBar);

        injector = new ProviderInjector();
        injector.setUrlChangeListener(url ->
            runOnUiThread(() -> { if (urlBar != null) urlBar.setText(url); })
        );

        // FIX: Daftarkan AndroidWallet SEBELUM setupBrowserWebView
        // agar saat onPageFinished inject provider, AndroidWallet sudah siap
        BrowserAndroidBridge browserBridge = new BrowserAndroidBridge(this);
        browserBridge.setBrowserWebView(browserWebView);
        browserWebView.addJavascriptInterface(browserBridge, "AndroidWallet");

        // Setup WebView
        WebViewManager manager = new WebViewManager(this, browserWebView);
        manager.setupBrowserWebView(injector);

        // Register receiver untuk response dari wallet
        LocalBroadcastManager.getInstance(this)
            .registerReceiver(
                responseReceiver,
                new IntentFilter(MainActivity.ACTION_BRIDGE_RESPONSE)
            );

        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // WebViewClient
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        browserWebView.setWebViewClient(new android.webkit.WebViewClient() {

            @Override
            public void onPageStarted(android.webkit.WebView view,
                                       String url,
                                       android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (urlBar != null) urlBar.setText(url);
            }

            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                super.onPageFinished(view, url);
                if (urlBar != null) urlBar.setText(url);

                injector.inject(view, url);

                view.postDelayed(() -> {
                    injector.inject(view, url);
                    fireEthereumEvents(view);
                }, 500);

                view.postDelayed(() -> {
                    injector.inject(view, url);
                }, 1500);
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    android.webkit.WebView view,
                    android.webkit.WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, req.getUrl());
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }
        });

        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // WebChromeClient
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        browserWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                runOnUiThread(() -> {
                    if (progressBar != null) {
                        progressBar.setProgress(newProgress);
                        progressBar.setVisibility(
                            newProgress < 100 ? View.VISIBLE : View.GONE);
                    }
                    if (newProgress >= 90) {
                        String url = view.getUrl();
                        if (url != null) {
                            injector.inject(browserWebView, url);
                            fireEthereumEvents(browserWebView);
                        }
                    }
                });
            }
        });

        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // URL bar
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        urlBar.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO    ||
                actionId == EditorInfo.IME_ACTION_SEARCH ||
                actionId == EditorInfo.IME_ACTION_DONE) {
                String input = urlBar.getText().toString().trim();
                browserWebView.loadUrl(normalizeUrl(input));
                return true;
            }
            return false;
        });

        ImageButton btnBack = findViewById(R.id.btnBack);
        if (btnBack != null) {
            btnBack.setOnClickListener(v -> {
                if (browserWebView.canGoBack()) browserWebView.goBack();
                else finish();
            });
        }

        ImageButton btnRefresh = findViewById(R.id.btnRefresh);
        if (btnRefresh != null) {
            btnRefresh.setOnClickListener(v -> browserWebView.reload());
        }

        String url = getIntent().getStringExtra("url");
        if (url == null || url.isEmpty()) url = "https://www.sidrachain.com";
        browserWebView.loadUrl(url);
        urlBar.setText(url);
    }

    private void fireEthereumEvents(WebView view) {
        view.evaluateJavascript(
            "window.dispatchEvent(new Event('ethereum#initialized'));", null);
        view.evaluateJavascript(
            "document.dispatchEvent(new Event('ethereum#initialized'));", null);
        view.evaluateJavascript(
            "window.dispatchEvent(new Event('sidrawallet#initialized'));", null);
    }

    private void _sendResponseToPage(String requestId,
                                      String resultJson,
                                      String errorJson) {
        if (browserWebView == null) return;
        final String safeId = requestId != null ? requestId : "";
        final String result = resultJson != null ? resultJson : "null";
        final String error  = errorJson  != null ? errorJson  : "null";

        runOnUiThread(() -> {
            String js;
            if (!error.equals("null")) {
                js = "window.__sidraAndroidResponse&&" +
                     "window.__sidraAndroidResponse('" + safeId +
                     "',null," + error + ");";
            } else {
                js = "window.__sidraAndroidResponse&&" +
                     "window.__sidraAndroidResponse('" + safeId +
                     "'," + result + ",null);";
            }
            browserWebView.evaluateJavascript(js, null);
        });
    }

    private void _sendEventToPage(String eventName, String dataJson) {
        if (browserWebView == null) return;
        final String safeEvent = eventName != null ? eventName : "";
        final String safeData  = dataJson  != null ? dataJson  : "null";

        runOnUiThread(() -> {
            String js = "window.__sidraAndroidEvent&&" +
                        "window.__sidraAndroidEvent('" + safeEvent +
                        "'," + safeData + ");";
            browserWebView.evaluateJavascript(js, null);
        });
    }

    private String normalizeUrl(String input) {
        if (input == null || input.isEmpty()) return "https://www.sidrachain.com";
        if (input.startsWith("https://") || input.startsWith("http://")) return input;
        if (input.contains(".") && !input.contains(" ")) return "https://" + input;
        return "https://www.google.com/search?q=" + android.net.Uri.encode(input);
    }

    @Override
    public void onBackPressed() {
        if (browserWebView != null && browserWebView.canGoBack())
            browserWebView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        LocalBroadcastManager.getInstance(this)
            .unregisterReceiver(responseReceiver);
        if (browserWebView != null) {
            browserWebView.destroy();
            browserWebView = null;
        }
        super.onDestroy();
    }
}
