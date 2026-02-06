package com.esteana.noor

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.Executors

/**
 * جسر JavaScript ← → Android للويب الهجين (WebAppInterface).
 * يُربط بالـ WebView عبر addJavascriptInterface فيستدعيه الـ JS:
 * Android.vibrate() أو AndroidBridge.vibrate()، Android.getFCMToken()، Android.loadQuranJson()
 */
class WebAppInterface(
    private val webView: WebView
) {

    private val ioExecutor = Executors.newSingleThreadExecutor()

    /**
     * استدعاء نظام الاهتزاز في الأندرويد (Haptic Feedback).
     * triggerVibration() و vibrate() يؤديان نفس التأثير.
     */
    @JavascriptInterface
    fun triggerVibration() {
        vibrateInternal()
    }

    @JavascriptInterface
    fun vibrate() {
        vibrateInternal()
    }

    private fun vibrateInternal() {
        webView.post {
            val context = webView.context
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                    ?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && vibrator != null) {
                vibrator.vibrate(
                    VibrationEffect.createOneShot(50L, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            }
        }
    }

    /**
     * طلب FCM Token وتمريره للويب عبر window.androidFCMTokenReceived(token).
     */
    @JavascriptInterface
    fun getFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = if (task.isSuccessful) task.result ?: "" else ""
            val escaped = token.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
            webView.post {
                webView.evaluateJavascript(
                    "if(typeof window.androidFCMTokenReceived==='function'){window.androidFCMTokenReceived('$escaped');}",
                    null
                )
            }
        }
    }

    /**
     * تحميل محتوى web/quran.json من الـ assets وتمريره للويب عبر window.__onQuranJsonLoaded__(base64).
     * يُستدعى من JS لأن Fetch لا يدعم file:// في WebView.
     */
    @JavascriptInterface
    fun loadQuranJson() {
        ioExecutor.execute {
            try {
                val json = webView.context.assets.open("web/quran.json")
                    .bufferedReader(Charsets.UTF_8).use { it.readText() }
                val base64 = Base64.encodeToString(json.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
                val escaped = base64.replace("\\", "\\\\").replace("'", "\\'")
                webView.post {
                    webView.evaluateJavascript(
                        "if(typeof window.__onQuranJsonLoaded__==='function'){window.__onQuranJsonLoaded__('$escaped');}",
                        null
                    )
                }
            } catch (e: Exception) {
                webView.post {
                    webView.evaluateJavascript(
                        "if(typeof window.__onQuranJsonLoadError__==='function'){window.__onQuranJsonLoadError__(true);}",
                        null
                    )
                }
            }
        }
    }
}
