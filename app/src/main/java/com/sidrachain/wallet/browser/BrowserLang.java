package com.sidrachain.wallet.browser;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;

/**
 * Terjemahan untuk UI browser native. Memakai assets/data/lang.json yang sama
 * dengan wallet, bahasa dari AndroidBridge.setLanguage() (dikirim lang.js).
 * Kalau key / file tidak ada, dipakai teks default bahasa Inggris dari kode.
 */
final class BrowserLang {

    private static JSONObject root;

    private BrowserLang() {}

    static String code(Context c) {
        String l = c.getSharedPreferences("sidra_prefs", Context.MODE_PRIVATE)
            .getString("lang", null);
        if (l == null) l = Locale.getDefault().getLanguage();
        if ("in".equals(l)) l = "id";           // kode lama Android untuk Indonesia
        if (!("id".equals(l) || "en".equals(l) || "ar".equals(l) || "vi".equals(l))) l = "en";
        return l;
    }

    static synchronized String t(Context c, String key, String fallback) {
        try {
            if (root == null) {
                InputStream is = c.getAssets().open("data/lang.json");
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                is.close();
                root = new JSONObject(new String(bos.toByteArray(), "UTF-8"));
            }
            JSONObject o = root.optJSONObject(code(c));
            String v = o != null ? o.optString(key, "") : "";
            return v.isEmpty() ? fallback : v;
        } catch (Exception e) {
            return fallback;
        }
    }
}
