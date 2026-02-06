package com.esteana.noor

import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.os.Build.VERSION_CODES
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.esteana.noor.ui.theme.EsteanaTheme
import com.google.firebase.messaging.FirebaseMessaging
import com.esteana.noor.di.saveFcmTokenToBackend

/**
 * Hybrid Container: يعرض تطبيق الويب (إستعانة) داخل WebView مع جسر Android (WebAppInterface) للاهتزاز و FCM.
 * domStorageEnabled = true لضمان عمل IndexedDB في تطبيق React.
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "Esteana_WebView"
        private const val ASSET_HOST = "app.esteana.local"
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) logFcmToken()
        else {
            Log.w(TAG, "صلاحية الإشعارات مرفوضة")
            logFcmToken()
        }
    }

    private val requestLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val activity = this
        setContent {
            EsteanaTheme {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        WebView(context).apply {
                            if (BuildConfig.DEBUG) {
                                WebView.setWebContentsDebuggingEnabled(true)
                            }
                            settings.apply {
                                javaScriptEnabled = true
                                domStorageEnabled = true
                                allowFileAccess = true
                                allowFileAccessFromFileURLs = true
                                if (Build.VERSION.SDK_INT >= 21) {
                                    mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                                }
                            }
                            val webAppInterface = WebAppInterface(this)
                            addJavascriptInterface(webAppInterface, "Android")
                            addJavascriptInterface(webAppInterface, "AndroidBridge")
                            var triedRemoteFallback = false
                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(
                                    view: WebView,
                                    request: WebResourceRequest
                                ): Boolean {
                                    return false
                                }

                                override fun shouldInterceptRequest(
                                    view: WebView,
                                    request: WebResourceRequest
                                ): WebResourceResponse? {
                                    val url = request.url ?: return null
                                    if (url.host != ASSET_HOST) return null
                                    var path = url.path ?: return null
                                    if (path.isEmpty() || path == "/") path = "/index.html"
                                    val assetPath = "web" + path
                                    val mimeType = when {
                                        path.endsWith(".html") -> "text/html"
                                        path.endsWith(".js") -> "application/javascript"
                                        path.endsWith(".json") -> "application/json"
                                        else -> "application/octet-stream"
                                    }
                                    return try {
                                        val stream = context.assets.open(assetPath)
                                        val headers = java.util.HashMap<String, String>().apply {
                                            put("Access-Control-Allow-Origin", "*")
                                            put("Cache-Control", "no-cache")
                                        }
                                        if (BuildConfig.DEBUG) Log.d(TAG, "Intercept OK: $assetPath")
                                        if (assetPath.endsWith("quran.json")) Log.d("Esteana_Quran", "Intercept: serving quran.json")
                                        WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, stream)
                                    } catch (e: Exception) {
                                        if (BuildConfig.DEBUG) Log.e(TAG, "Intercept fail: $assetPath", e)
                                        if (assetPath.endsWith("quran.json")) Log.e("Esteana_Quran", "Intercept fail: quran.json", e)
                                        null
                                    }
                                }

                                override fun onReceivedError(
                                    view: WebView,
                                    request: WebResourceRequest,
                                    error: WebResourceError
                                ) {
                                    if (Build.VERSION.SDK_INT >= VERSION_CODES.M &&
                                        request.isForMainFrame
                                    ) {
                                        val url = request.url.toString()
                                        if (url.startsWith("file:") && !triedRemoteFallback) {
                                            triedRemoteFallback = true
                                            view.loadUrl(BuildConfig.WEB_APP_URL)
                                        } else {
                                            view.loadUrl("about:blank")
                                            view.loadDataWithBaseURL(
                                                null,
                                                (activity as? MainActivity)?.getOfflineErrorHtml().orEmpty(),
                                                "text/html",
                                                "UTF-8",
                                                null
                                            )
                                        }
                                    }
                                }
                            }
                            val hasBundledWeb = try {
                                context.assets.list("web")?.contains("index.html") == true
                            } catch (_: Exception) { false }
                            if (hasBundledWeb) {
                                try {
                                    val html = context.assets.open("web/index.html")
                                        .bufferedReader(Charsets.UTF_8).use { it.readText() }
                                    loadDataWithBaseURL(
                                        "https://$ASSET_HOST/",
                                        html,
                                        "text/html",
                                        "UTF-8",
                                        null
                                    )
                                } catch (e: Exception) {
                                    if (BuildConfig.DEBUG) Log.e(TAG, "Load bundled web failed", e)
                                    loadUrl("file:///android_asset/web/index.html")
                                }
                            } else {
                                loadUrl(BuildConfig.WEB_APP_URL)
                            }
                        }
                    }
                )
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)) {
                PackageManager.PERMISSION_GRANTED -> logFcmToken()
                else -> requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            logFcmToken()
        }
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            requestLocationLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    override fun onResume() {
        super.onResume()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                logFcmToken()
            }
        } else {
            logFcmToken()
        }
    }

    private fun getOfflineErrorHtml(): String {
        val url = BuildConfig.WEB_APP_URL
        return """
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        padding: 24px;
                        font-family: 'Segoe UI', sans-serif;
                        background: #FAFDFC;
                        color: #191C1C;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                    }
                    h1 { font-size: 22px; margin-bottom: 12px; }
                    p { font-size: 16px; color: #3F4948; margin-bottom: 24px; line-height: 1.5; }
                    .btn {
                        display: inline-block;
                        padding: 14px 28px;
                        background: #006A6A;
                        color: #fff;
                        text-decoration: none;
                        border-radius: 12px;
                        font-size: 16px;
                        border: none;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <h1>لا يوجد اتصال بالإنترنت</h1>
                <p>تعذّر تحميل التطبيق. تحقق من اتصالك بالشبكة ثم أعد المحاولة.</p>
                <button class="btn" onclick="location.reload()">أعد المحاولة</button>
            </body>
            </html>
        """.trimIndent()
    }

    private fun logFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "فشل جلب FCM Token", task.exception)
                return@addOnCompleteListener
            }
            val token = task.result
            if (BuildConfig.DEBUG) Log.d(TAG, "FCM Token: $token")
            saveFcmTokenToBackend(applicationContext, token)
        }
    }
}
