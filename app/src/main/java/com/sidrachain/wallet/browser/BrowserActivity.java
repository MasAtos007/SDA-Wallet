package com.sidrachain.wallet.browser;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.sidrachain.wallet.MainActivity;
import com.sidrachain.wallet.R;
import com.sidrachain.wallet.bridge.AndroidBridge;

import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class BrowserActivity extends AppCompatActivity {

    // Link resmi ekosistem Sidra Chain (halaman awal)
    public static final String URL_MAIN = "https://www.sidrachain.com/";
    public static final String URL_DEX  = "https://dex.sidrachain.com/#/swap";

    public static AndroidBridge sharedBridge;

    // Jumlah BrowserActivity yang sedang hidup (dipakai MainActivity untuk tombol back)
    public static volatile int openCount = 0;

    // true hanya saat wallet dibawa ke depan untuk approval dApp (back di wallet -> balik ke browser).
    // false saat user menekan tombol "Dashboard Wallet" (back di wallet -> minimize biasa).
    public static volatile boolean returnToBrowserOnBack = false;

    // Instance aktif, dipakai AndroidBridge.openBrowser() agar tidak membuat browser dobel
    public static BrowserActivity instance;

    // ---------------------------------------------------------------
    // Model tab
    // ---------------------------------------------------------------
    private static class Tab {
        WebView web;
        volatile String origin = null;   // diisi Java, bukan dipercaya dari JS
        String url = "";
        boolean home = true;             // true = tampilkan halaman awal
        LinearLayout chip;
        TextView chipTitle;
    }

    private final List<Tab> tabs = new ArrayList<>();
    private Tab active;

    private EditText urlBar;
    private ProgressBar progressBar;
    private FrameLayout webContainer;
    private View startPage;
    private LinearLayout tabContainer;
    private HorizontalScrollView tabScroll;
    private ProviderInjector injector;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());

    // requestId -> WebView (tab) pengirim, supaya jawaban wallet kembali ke tab yang benar
    private final Map<String, WebView> requestOwner = new ConcurrentHashMap<>();
    // requestId yang butuh UI wallet (connect / sign / tx)
    private final Set<String> uiRequests = ConcurrentHashMap.newKeySet();
    // requestId yang wallet-nya sudah dibawa ke depan
    private final Set<String> walletShown = ConcurrentHashMap.newKeySet();
    // runnable "bawa wallet ke depan" yang masih menunggu
    private final Map<String, Runnable> pendingFront = new ConcurrentHashMap<>();

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
    // Bridge KHUSUS dApp: hanya handleRequest. Satu instance per tab.
    // ---------------------------------------------------------------
    private class BrowserBridge {
        private final Tab tab;
        BrowserBridge(Tab tab) { this.tab = tab; }

        @JavascriptInterface
        public void handleRequest(String requestId,
                                  String method,
                                  String paramsJson,
                                  String origin) {
            if (requestId == null || method == null) return;

            final String id = requestId;
            final String realOrigin = tab.origin != null ? tab.origin : origin;

            requestOwner.put(id, tab.web);

            if (needsWalletUi(method)) {
                uiRequests.add(id);
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
    // Untuk approval dApp: back di wallet balik ke browser
    private void bringWalletToFront() {
        try {
            returnToBrowserOnBack = true;
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    // Tombol header: langsung ke dashboard wallet (tab browser tetap hidup)
    private void openWalletDashboard() {
        try {
            returnToBrowserOnBack = false;
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

    private void handleWalletFocus(String requestId, String errorJson) {
        if (requestId == null || !uiRequests.remove(requestId)) return;

        Runnable r = pendingFront.remove(requestId);
        if (r != null) uiHandler.removeCallbacks(r);

        boolean shown = walletShown.remove(requestId);

        String e = errorJson == null ? "" : errorJson.toLowerCase();
        boolean locked = e.contains("locked") || e.contains("terkunci");

        if (locked) {
            if (!shown) bringWalletToFront();
            return;
        }

        if (shown && walletShown.isEmpty()) bringBrowserToFront();
    }

    // Dipanggil AndroidBridge.openBrowser() kalau browser sudah hidup
    public void openFromWallet(String url) {
        if (url != null && !url.isEmpty()) {
            if (active != null && active.home) navigate(active, url);
            else createTab(url);
        }
        bringBrowserToFront();
    }

    // ---------------------------------------------------------------
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_browser);
        openCount++;
        instance = this;

        urlBar       = findViewById(R.id.urlBar);
        progressBar  = findViewById(R.id.progressBar);
        webContainer = findViewById(R.id.webContainer);
        startPage    = findViewById(R.id.startPage);
        tabContainer = findViewById(R.id.tabContainer);
        tabScroll    = findViewById(R.id.tabScroll);

        injector = new ProviderInjector();

        LocalBroadcastManager.getInstance(this)
            .registerReceiver(
                responseReceiver,
                new IntentFilter(MainActivity.ACTION_BRIDGE_RESPONSE)
            );

        // URL bar
        urlBar.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO    ||
                actionId == EditorInfo.IME_ACTION_SEARCH ||
                actionId == EditorInfo.IME_ACTION_DONE) {
                String input = urlBar.getText().toString().trim();
                if (!input.isEmpty() && active != null) {
                    navigate(active, normalizeUrl(input));
                    hideKeyboard();
                }
                return true;
            }
            return false;
        });

        // Header: tombol bypass ke dashboard wallet
        ImageButton btnWallet = findViewById(R.id.btnWallet);
        if (btnWallet != null) btnWallet.setOnClickListener(v -> openWalletDashboard());

        ImageButton btnBack = findViewById(R.id.btnBack);
        if (btnBack != null) btnBack.setOnClickListener(v -> handleBack());

        ImageButton btnRefresh = findViewById(R.id.btnRefresh);
        if (btnRefresh != null) {
            btnRefresh.setOnClickListener(v -> {
                if (active != null && !active.home) active.web.reload();
            });
        }

        ImageButton btnNewTab = findViewById(R.id.btnNewTab);
        if (btnNewTab != null) btnNewTab.setOnClickListener(v -> createTab(""));

        findViewById(R.id.cardMain).setOnClickListener(v -> {
            if (active != null) navigate(active, URL_MAIN);
        });
        findViewById(R.id.cardDex).setOnClickListener(v -> {
            if (active != null) navigate(active, URL_DEX);
        });

        // Tab pertama: kosong (halaman awal) kecuali ada url eksplisit
        String url = getIntent().getStringExtra("url");
        createTab(url == null ? "" : url);
    }

    // ---------------------------------------------------------------
    // TAB
    // ---------------------------------------------------------------
    private Tab createTab(String url) {
        final Tab tab = new Tab();
        final WebView web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.BLACK);
        web.setVisibility(View.GONE);
        tab.web = web;
        webContainer.addView(web);

        // Daftarkan AndroidWallet SEBELUM load halaman apa pun
        web.addJavascriptInterface(new BrowserBridge(tab), "AndroidWallet");

        new WebViewManager(this, web).setupBrowserWebView(injector);

        // Provider masuk SEBELUM script dApp jalan
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                web,
                injector.getDocumentStartScript(),
                Collections.singleton("*")
            );
        }

        web.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String u, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, u, favicon);
                tab.origin = extractOrigin(u);
                tab.url = u;
                if (tab == active && !tab.home && urlBar != null) urlBar.setText(u);
            }

            @Override
            public void onPageFinished(WebView view, String u) {
                super.onPageFinished(view, u);
                tab.origin = extractOrigin(u);
                tab.url = u;
                if (tab == active && !tab.home && urlBar != null) urlBar.setText(u);

                injector.inject(view, u);

                view.postDelayed(() -> {
                    injector.inject(view, u);
                    fireEthereumEvents(view);
                }, 500);

                view.postDelayed(() -> injector.inject(view, u), 1500);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view,
                                                    android.webkit.WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith("http://") || u.startsWith("https://")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
                } catch (Exception ignored) {}
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                runOnUiThread(() -> {
                    if (tab == active && progressBar != null) {
                        progressBar.setProgress(newProgress);
                        progressBar.setVisibility(
                            newProgress < 100 && !tab.home ? View.VISIBLE : View.GONE);
                    }
                    if (newProgress >= 90) {
                        String u = view.getUrl();
                        if (u != null) {
                            injector.inject(view, u);
                            fireEthereumEvents(view);
                        }
                    }
                });
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (tab.chipTitle != null && !TextUtils.isEmpty(title)) {
                    tab.chipTitle.setText(title);
                }
            }
        });

        buildChip(tab);
        tabs.add(tab);
        tabContainer.addView(tab.chip);

        tab.home = (url == null || url.isEmpty());
        switchTo(tab);
        if (!tab.home) navigate(tab, url);
        return tab;
    }

    private void buildChip(final Tab tab) {
        LinearLayout chip = new LinearLayout(this);
        chip.setOrientation(LinearLayout.HORIZONTAL);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(dp(12), 0, dp(4), 0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, dp(32));
        lp.setMargins(dp(3), 0, dp(3), 0);
        chip.setLayoutParams(lp);

        TextView title = new TextView(this);
        title.setText("Tab baru");
        title.setTextSize(12);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setMaxWidth(dp(110));

        ImageButton close = new ImageButton(this);
        close.setImageResource(R.drawable.ic_close);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setScaleType(ImageButton.ScaleType.FIT_CENTER);
        close.setPadding(dp(7), dp(7), dp(7), dp(7));
        close.setLayoutParams(new LinearLayout.LayoutParams(dp(28), dp(28)));
        close.setContentDescription("Tutup tab");
        close.setOnClickListener(v -> closeTab(tab));

        chip.addView(title);
        chip.addView(close);
        chip.setOnClickListener(v -> switchTo(tab));

        tab.chip = chip;
        tab.chipTitle = title;
    }

    private void switchTo(final Tab tab) {
        active = tab;
        for (Tab t : tabs) {
            boolean sel = (t == tab);
            t.web.setVisibility(sel && !t.home ? View.VISIBLE : View.GONE);
            t.chip.setBackgroundResource(sel ? R.drawable.bg_tab_active : R.drawable.bg_tab_inactive);
            t.chipTitle.setTextColor(sel ? Color.WHITE : Color.parseColor("#999999"));
        }
        startPage.setVisibility(tab.home ? View.VISIBLE : View.GONE);
        progressBar.setVisibility(View.GONE);
        urlBar.setText(tab.home ? "" : (tab.url != null ? tab.url : ""));
        tabScroll.post(() -> tabScroll.smoothScrollTo(tab.chip.getLeft(), 0));
    }

    private void navigate(Tab tab, String url) {
        tab.home = false;
        tab.url = url;
        if (tab == active) {
            tab.web.setVisibility(View.VISIBLE);
            startPage.setVisibility(View.GONE);
            urlBar.setText(url);
        }
        tab.web.loadUrl(url);
    }

    private void showStartPage(Tab tab) {
        tab.home = true;
        switchTo(tab);
    }

    private void closeTab(Tab tab) {
        int idx = tabs.indexOf(tab);
        if (idx < 0) return;
        tabs.remove(tab);
        tabContainer.removeView(tab.chip);

        Iterator<Map.Entry<String, WebView>> it = requestOwner.entrySet().iterator();
        while (it.hasNext()) {
            if (it.next().getValue() == tab.web) it.remove();
        }

        webContainer.removeView(tab.web);
        tab.web.destroy();

        if (tabs.isEmpty()) {
            createTab("");
        } else if (tab == active) {
            switchTo(tabs.get(Math.min(idx, tabs.size() - 1)));
        }
    }

    // Back ala Chrome: riwayat -> halaman awal -> tutup tab -> keluar ke wallet
    private void handleBack() {
        if (active == null) { finish(); return; }
        if (!active.home) {
            if (active.web.canGoBack()) active.web.goBack();
            else showStartPage(active);
            return;
        }
        if (tabs.size() > 1) closeTab(active);
        else finish();
    }

    // ---------------------------------------------------------------
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
        final String safeId = requestId != null ? requestId : "";
        final String result = resultJson != null ? resultJson : "null";
        final String error  = errorJson  != null ? errorJson  : "null";

        runOnUiThread(() -> {
            WebView target = requestOwner.remove(safeId);
            if (target == null && active != null) target = active.web;
            if (target == null) return;
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
            target.evaluateJavascript(js, null);
        });
    }

    // Event (accountsChanged, chainChanged, ...) dikirim ke semua tab
    private void _sendEventToPage(String eventName, String dataJson) {
        final String safeEvent = eventName != null ? eventName : "";
        final String safeData  = dataJson  != null ? dataJson  : "null";

        runOnUiThread(() -> {
            String js = "window.__sidraAndroidEvent&&" +
                        "window.__sidraAndroidEvent('" + safeEvent +
                        "'," + safeData + ");";
            for (Tab t : new ArrayList<>(tabs)) {
                t.web.evaluateJavascript(js, null);
            }
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
        if (input == null || input.isEmpty()) return URL_MAIN;
        if (input.startsWith("https://") || input.startsWith("http://")) return input;
        if (input.contains(".") && !input.contains(" ")) return "https://" + input;
        return "https://www.google.com/search?q=" + android.net.Uri.encode(input);
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void hideKeyboard() {
        try {
            InputMethodManager imm =
                (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(urlBar.getWindowToken(), 0);
            urlBar.clearFocus();
        } catch (Exception ignored) {}
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Browser kembali di depan: back di wallet tidak perlu "menarik" ke browser lagi
        returnToBrowserOnBack = false;
    }

    @Override
    protected void onDestroy() {
        openCount = Math.max(0, openCount - 1);
        if (instance == this) instance = null;
        uiHandler.removeCallbacksAndMessages(null);
        pendingFront.clear();
        uiRequests.clear();
        walletShown.clear();
        requestOwner.clear();
        LocalBroadcastManager.getInstance(this)
            .unregisterReceiver(responseReceiver);
        for (Tab t : new ArrayList<>(tabs)) {
            webContainer.removeView(t.web);
            t.web.destroy();
        }
        tabs.clear();
        super.onDestroy();
    }
}
