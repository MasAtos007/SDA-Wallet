package com.sidrachain.wallet.browser;

import android.webkit.WebView;
import java.net.URL;
import java.util.Arrays;
import java.util.List;

public class ProviderInjector {

    private final List<String> TRUSTED_ORIGINS = Arrays.asList(
        "https://www.sidrachain.com",
        "https://sidrachain.com",
        "https://dex.sidrachain.com",
        "https://app.sidrachain.com",
        "https://kycport.com"
    );

    private UrlChangeListener urlChangeListener;

    public interface UrlChangeListener {
        void onUrlChanged(String url);
    }

    public void setUrlChangeListener(UrlChangeListener listener) {
        this.urlChangeListener = listener;
    }

    public void onUrlChanged(String url) {
        if (urlChangeListener != null) urlChangeListener.onUrlChanged(url);
    }

    public void inject(WebView view, String pageUrl) {
        if (!isAllowedOrigin(pageUrl)) {
            view.evaluateJavascript(buildNoOpProvider(), null);
            return;
        }
        String origin = extractOrigin(pageUrl);
        view.evaluateJavascript(buildAndroidProvider(origin), null);
    }

    public boolean isAllowedOrigin(String url) {
        if (url == null) return false;
        if (!url.startsWith("https://")) return false;
        for (String trusted : TRUSTED_ORIGINS) {
            if (url.startsWith(trusted)) return true;
        }
        if (url.contains(".github.io")) return true;
        return true; // semua HTTPS diizinkan
    }

    private String buildAndroidProvider(String origin) {
        return "(function(){" +
            "if(window.__SIDRA_ANDROID_INJECTED__)return;" +
            "window.__SIDRA_ANDROID_INJECTED__=true;" +
            "var ORIGIN='" + origin + "';" +
            "var _pending=new Map();" +
            "var _reqId=0;" +
            "var _listeners={};" +

            // Request ke AndroidBridge
            "function _req(method,params){" +
            "  return new Promise(function(resolve,reject){" +
            "    var id='ar_'+(++_reqId)+'_'+Date.now();" +
            "    var timer=setTimeout(function(){" +
            "      _pending.delete(id);" +
            "      reject(new Error('Timeout: '+method));" +
            "    },30000);" +
            "    _pending.set(id,{resolve:resolve,reject:reject,timer:timer});" +
            "    try{window.AndroidWallet.handleRequest(id,method,JSON.stringify(params||[]),ORIGIN);}" +
            "    catch(e){clearTimeout(timer);_pending.delete(id);reject(e);}" +
            "  });" +
            "}" +

            // Response callback dari Android
            "window.__sidraAndroidResponse=function(id,result,error){" +
            "  var p=_pending.get(id);" +
            "  if(!p)return;" +
            "  clearTimeout(p.timer);" +
            "  _pending.delete(id);" +
            "  if(error){var e=new Error(error.message||'Error');e.code=error.code||-32603;p.reject(e);}" +
            "  else{p.resolve(result);}" +
            "};" +

            // Event emitter
            "function _emit(event,data){" +
            "  var cbs=_listeners[event]||[];" +
            "  cbs.forEach(function(cb){try{cb(data);}catch(e){}});" +
            "}" +
            "window.__sidraAndroidEvent=function(event,data){" +
            "  _emit(event,typeof data==='string'?JSON.parse(data):data);" +
            "};" +

            // EIP-1193 Provider
            "var provider={" +
            "  isMetaMask:false," +
            "  isSidraWallet:true," +
            "  selectedAddress:null," +
            "  _isConnected:false," +
            "  request:function(args){return _req(args.method,args.params||[]);}," +
            "  send:function(method,params,cb){" +
            "    if(typeof method==='object'){var p=method,c=params;" +
            "      this.request(p).then(function(r){c(null,{id:p.id,jsonrpc:'2.0',result:r});}).catch(function(e){c(e,null);});return;}" +
            "    if(typeof cb==='function'){this.request({method:method,params:params}).then(function(r){cb(null,r);}).catch(function(e){cb(e,null);});return;}" +
            "    return this.request({method:method,params:params});" +
            "  }," +
            "  sendAsync:function(payload,cb){" +
            "    this.request(payload).then(function(r){cb(null,{id:payload.id,jsonrpc:'2.0',result:r});}).catch(function(e){cb(e,null);});" +
            "  }," +
            "  enable:function(){" +
            "    var self=this;" +
            "    return this.request({method:'eth_requestAccounts'})" +
            "      .then(function(acc){" +
            "        if(acc&&acc.length){" +
            "          self.selectedAddress=acc[0];" +
            "          self._isConnected=true;" +
            "          _emit('accountsChanged',acc);" +  // FIX: pakai _emit langsung, bukan provider.emit
            "        }" +
            "        return acc;" +
            "      });" +
            "  }," +
            // FIX: tambah emit() method ke provider agar dApp yg panggil provider.emit() tidak error
            "  emit:function(event,data){_emit(event,data);return this;}," +
            "  on:function(event,cb){if(!_listeners[event])_listeners[event]=[];_listeners[event].push(cb);return this;}," +
            "  off:function(event,cb){if(_listeners[event])_listeners[event]=_listeners[event].filter(function(c){return c!==cb;});return this;}," +
            "  removeListener:function(event,cb){return this.off(event,cb);}," +
            "  once:function(event,cb){var self=this;var w=function(d){cb(d);self.off(event,w);};return this.on(event,w);}," +
            "  isConnected:function(){return this._isConnected;}" +
            "};" +

            // Expose window.ethereum
            "try{Object.defineProperty(window,'ethereum',{get:function(){return provider;},set:function(){},configurable:true});}" +
            "catch(e){window.ethereum=provider;}" +
            "window._sidraProvider=provider;" +

            // EIP-6963: respond to request
            "window.addEventListener('eip6963:requestProvider',function(){" +
            "  window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{" +
            "    detail:{" +
            "      info:{uuid:'sidra-android-v1',name:'Sidra Wallet'," +
            "        icon:'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzAwZmY4OCIvPjwvc3ZnPg=='," +
            "        rdns:'com.sidrachain.wallet'}," +
            "      provider:provider" +
            "    }" +
            "  }));" +
            "});" +

            // EIP-6963: auto announce
            "setTimeout(function(){" +
            "  window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{" +
            "    detail:{" +
            "      info:{uuid:'sidra-android-v1',name:'Sidra Wallet'," +
            "        icon:'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxNiIgZmlsbD0iIzAwZmY4OCIvPjwvc3ZnPg=='," +
            "        rdns:'com.sidrachain.wallet'}," +
            "      provider:provider" +
            "    }" +
            "  }));" +
            "},100);" +

            // Kompatibilitas MetaMask
            "document.dispatchEvent(new Event('ethereum#initialized'));" +
            "window.dispatchEvent(new Event('ethereum#initialized'));" +

            // Tandai connected
            "provider._isConnected=true;" +

            // Auto fetch akun â€” FIX: pakai _emit bukan provider.emit
            "provider.request({method:'eth_accounts'}).then(function(acc){" +
            "  if(acc&&acc.length){" +
            "    provider.selectedAddress=acc[0];" +
            "    _emit('accountsChanged',acc);" +  // FIX: _emit langsung, sudah pasti ada
            "  }" +
            "}).catch(function(){});" +

            "console.log('[SidraWallet] Android provider injected v2');" +
            "})();";
    }

    private String buildNoOpProvider() {
        return "(function(){" +
            "if(window.ethereum)return;" +
            "window.ethereum={isMetaMask:false,isSidraWallet:false," +
            "request:function(){return Promise.reject(new Error('Not connected'));}," +
            "on:function(){},off:function(){},emit:function(){},isConnected:function(){return false;}};" +
            "})();";
    }

    private String extractOrigin(String url) {
        try {
            URL u = new URL(url);
            return u.getProtocol() + "://" + u.getHost();
        } catch (Exception e) {
            return url;
        }
    }
}
