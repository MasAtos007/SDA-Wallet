package com.sidrachain.wallet.browser;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.sidrachain.wallet.MainActivity;
import com.sidrachain.wallet.R;
import com.sidrachain.wallet.bridge.AndroidBridge;

import java.net.URL;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class BrowserActivity extends AppCompatActivity {

    private WebView browserWebView;
    private EditText urlBar;
    private ProgressBar progressBar;
    private ProviderInjector injector;

    public static AndroidBridge sharedBridge;

    // Jumlah BrowserActivity yang sedang hidup (dipakai MainActivity untuk tombol back)
    public static volatile int openCount = 0;

    // Origin halaman top-level yang sedang dibuka (diisi Java, bukan dipercaya dari JS)
    private volatile String currentOrigin = null;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());

    // requestId yang butuh UI wallet (connect / sign / tx)
    private final Set<String> uiRequests = ConcurrentHashMap.newKeySet();
    // requestId yang wallet-nya sudah dibawa ke depan
    private final Set<String> walletShown = ConcurrentHashMap.newKeySet();
    // runnable "bawa wallet ke depan" yang masih menunggu (dibatalkan kalau response cepat datang)
    private final Map<String, Runnable> pendingFront = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------
    // Method yang butuh layar approval di wallet WebView
    // ---------------------------------------------------------------
    private static boolean needsWalletUi(String method) {
        if (method == null) return false;
        return method.equals("eth_requestAccounts")
            || method.equals("wallet_requestPermissions")
            || method.equals("wallet_addEthereumChain")
            || method.equals("wallet_watchAsset")
            || method.equals("eth_sendTransaction")
            || method.equals("eth_signTransaction")
            || method.equals("eth_sign")
            || method.equals("personal_sign")
            || method.startsWith("eth_signTypedData");
    }

    // ---------------------------------------------------------------
    // Bridge KHUSUS dApp: hanya handleRequest.
    // Sebelumnya extends AndroidBridge sehingga SEMUA situs bisa memanggil
    // getClipboardText(), readAsset(), sendResponse(), broadcastEvent(), dst.
    // Class konkret (bukan anonymous) supaya @JavascriptInterface terexpose.
    // ---------------------------------------------------------------
    private class BrowserBridge {

        @JavascriptInterface
        public void handleRequest(String requestId,
                                  String method,
                                  String paramsJson,
                                  String origin) {
            if (requestId == null || method == null) return;

            final String id = requestId;
            // Origin dari Java kalau ada; nilai dari JS bisa dipalsukan situs
            final String realOrigin = currentOrigin != null ? currentOrigin : origin;

            if (needsWalletUi(method)) {
                uiRequests.add(id);
                // Kalau wallet menjawab cepat (sudah connect), tidak perlu pindah layar.
                // Kalau belum ada jawaban dalam 350 ms, tampilkan wallet ke user.
                Runnable r = () -> {
                    pendingFront.remove(id);
                    walletShown.add(id);
                    bringWalletToFront();
                };
                pendingFront.put(id, r);
                uiHandler.postDelayed(r, 350);
            }

            Intent intent = new Intent(MainActivity.ACTION_BRIDGE_REQUEST);
            intent.putExtra("requestId", requestId);
            intent.putExtra("method",    method);
            intent.putExtra("params",    paramsJson);
            intent.putExtra("origin",    realOrigin);
            LocalBroadcastManager.getInstance(BrowserActivity.this)
                .sendBroadcast(intent);
        }
    }

    // ---------------------------------------------------------------
    // Receiver: response / event dari wallet
    // ---------------------------------------------------------------
    private final BroadcastReceiver responseReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!MainActivity.ACTION_BRIDGE_RESPONSE.equals(intent.getAction())) return;

            boolean isEvent = intent.getBooleanExtra("isEvent", false);
            if (isEvent) {
                _sendEventToPage(intent.getStringExtra("eventName"),
                                 intent.getStringExtra("eventData"));
                return;
            }

            String requestId  = intent.getStringExtra("requestId");
            String resultJson = intent.getStringExtra("result");
            String errorJson  = intent.getStringExtra("error");

            _sendResponseToPage(requestId, resultJson, errorJson);
            handleWalletFocus(requestId, errorJson);
        }
    };

    // ---------------------------------------------------------------
    // Pindah layar wallet <-> browser
    // ---------------------------------------------------------------
    private void bringWalletToFront() {
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private void bringBrowserToFront() {
        try {
            Intent i = new Intent(this, BrowserActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    // Dipanggil setiap response untuk request UI sampai
    private void handleWalletFocus(String requestId, String errorJson) {
        if (requestId == null || !uiRequests.remove(requestId)) return;

        Runnable r = pendingFront.remove(requestId);
        if (r != null) uiHandler.removeCallbacks(r);

        boolean shown = walletShown.remove(requestId);

        String e = errorJson == null ? "" : errorJson.toLowerCase();
        boolean locked = e.contains("locked") || e.contains("terkunci");

        if (locked) {
            // Wallet terkunci: user harus lihat layar PIN di wallet, jangan tarik balik
            if (!shown) bringWalletToFront();
            return;
        }

        if (shown && walletShown.isEmpty()) bringBrowserToFront();
    }

    // ---------------------------------------------------------------
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_browser);
        openCount++;

        browserWebView = findViewById(R.id.browserWebView);
        urlBar         = findViewById(R.id.urlBar);
        progressBar    = findViewById(R.id.progressBar);

        injector = new ProviderInjector();
        injector.setUrlChangeListener(url ->
            runOnUiThread(() -> { if (urlBar != null) urlBar.setText(url); })
        );

        // Daftarkan AndroidWallet SEBELUM load halaman apa pun
        browserWebView.addJavascriptInterface(new BrowserBridge(), "AndroidWallet");

        // Setup WebView
        WebViewManager manager = new WebViewManager(this, browserWebView);
        manager.setupBrowserWebView(injector);

        // Inject provider SEBELUM script dApp jalan (document start).
        // Tanpa ini dApp yang cek window.ethereum saat load bilang "wallet tidak ada".
        // onPageFinished / onProgressChanged di bawah tetap sebagai fallback.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                browserWebView,
                injector.getDocumentStartScript(),
                Collections.singleton("*")
            );
        }

        LocalBroadcastManager.getInstance(this)
            .registerReceiver(
                responseReceiver,
                new IntentFilter(MainActivity.ACTION_BRIDGE_RESPONSE)
            );

        // WebViewClient
        browserWebView.setWebViewClient(new android.webkit.WebViewClient() {

            @Override
            public void onPageStarted(android.webkit.WebView view,
                                       String url,
                                       android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                currentOrigin = extractOrigin(url);
                if (urlBar != null) urlBar.setText(url);
            }

            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                super.onPageFinished(view, url);
                currentOrigin = extractOrigin(url);
                if (urlBar != null) urlBar.setText(url);

                injector.inject(view, url);

                view.postDelayed(() -> {
                    injector.inject(view, url);
                    fireEthereumEvents(view);
                }, 500);

                view.postDelayed(() -> injector.inject(view, url), 1500);
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

        // WebChromeClient
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

        // URL bar
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
            if (browserWebView == null) return;
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
            if (browserWebView == null) return;
            String js = "window.__sidraAndroidEvent&&" +
                        "window.__sidraAndroidEvent('" + safeEvent +
                        "'," + safeData + ");";
            browserWebView.evaluateJavascript(js, null);
        });
    }

    private String extractOrigin(String url) {
        try {
            URL u = new URL(url);
            String p = u.getProtocol();
            if (!"https".equals(p) && !"http".equals(p)) return null;
            return p + "://" + u.getHost();
        } catch (Exception e) {
            return null;
        }
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
        openCount = Math.max(0, openCount - 1);
        uiHandler.removeCallbacksAndMessages(null);
        pendingFront.clear();
        uiRequests.clear();
        walletShown.clear();
        LocalBroadcastManager.getInstance(this)
            .unregisterReceiver(responseReceiver);
        if (browserWebView != null) {
            browserWebView.destroy();
            browserWebView = null;
        }
        super.onDestroy();
    }
}
